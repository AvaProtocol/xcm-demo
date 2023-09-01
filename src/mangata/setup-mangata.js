/* eslint-disable no-await-in-loop */
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/api';
import { chains } from '@oak-network/config';
import { u8aToHex } from '@polkadot/util';
import { MangataAdapter, OakAdapter } from '@oak-network/adapter';
import OakHelper from '../common/v2/oakHelper';
import MangataHelper from '../common/v2/mangataHelper';
import { delay } from '../common/utils';

/**
 * README!
 *
 * For local testing, the tip of mangata-node is at
 * https://github.com/OAK-Foundation/mangata-node/commit/ac60aeb51ea2c3545fc60c8b90f6bc65077ba10c
 * which added an Alice as Sudo to set up pools and pool rewards
 *
 * Run "npm run setup-mangata"
 */

/** * Main entrance of the program */
async function main() {
    await cryptoWaitReady();
    const { turingLocal, mangataLocal } = chains;

    console.log('Initializing APIs of both chains ...');
    const oakHelper = new OakHelper({ endpoint: turingLocal.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, turingLocal);

    const mangataHelper = new MangataHelper({ endpoint: mangataLocal.endpoint });
    await mangataHelper.initialize();
    const mangataApi = mangataHelper.getApi();
    const mangataSdk = mangataHelper.getMangataSdk();
    const mangataAdapter = new MangataAdapter(mangataApi, turingLocal);

    const oakChainName = oakAdapter.getChainData().key;
    const mangataChainName = mangataAdapter.getChainData().key;

    const { defaultAsset: oakDefaultAsset } = oakAdapter.getChainData();
    const { defaultAsset: mangataDefaultAsset } = mangataAdapter.getChainData();

    console.log(`\n${oakChainName} chain, native token: ${JSON.stringify(oakDefaultAsset)}`);
    console.log(`${mangataChainName} chain, native token: ${JSON.stringify(mangataDefaultAsset)}\n`);

    const keyring = new Keyring({ type: 'sr25519' });
    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const mangataAddress = keyring.encodeAddress(keyringPair, mangataAdapter.getChainData().ss58Prefix);

    let assets = await mangataSdk.getAssetsInfo();
    assets = _.map(assets, (asset) => asset);
    const oakAsset = _.find(assets, { symbol: oakDefaultAsset.symbol });
    const mangataAsset = _.find(assets, { symbol: mangataDefaultAsset.symbol });

    const pools = await mangataSdk.getPools();
    let targetPool = _.find(pools, { firstTokenId: mangataAsset.id, secondTokenId: oakAsset.id });
    targetPool = mangataHelper.formatPool(targetPool);
    const liquidityAsset = _.find(assets, { id: targetPool.liquidityTokenId });
    const { name: poolName } = liquidityAsset;

    console.log('\n2. Initing inssuance on Mangata ...');
    await mangataHelper.initIssuance(keyringPair);

    console.log(`\n3. Minting ${oakAsset.name} for ${keyringPair.meta.name} on Maganta if balance is zero ...`);
    await mangataHelper.mintToken(u8aToHex(keyringPair.addressRaw), oakAsset.id, keyringPair);

    // If there is no proxy, add a proxy of Turing on Mangata
    console.log('\n4. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...');

    const proxyAccountId = mangataAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), oakAdapter.getChainData().paraId);
    const proxyAddress = keyring.encodeAddress(proxyAccountId, mangataAdapter.getChainData().ss58Prefix);
    const proxiesResponse = await mangataHelper.api.query.proxy.proxies(mangataAddress);
    const proxies = _.first(proxiesResponse.toJSON());

    const proxyType = 'AutoCompound';
    const matchCondition = { delegate: proxyAddress, proxyType };

    const proxyMatch = _.find(proxies, matchCondition);

    if (proxyMatch) {
        console.log(`Found proxy of ${mangataAddress} on Mangata: `, proxyMatch);
    } else {
        if (_.isEmpty(proxies)) {
            console.log(`Proxy array of ${mangataAddress} is empty ...`);
        } else {
            console.log('Proxy not found. Expected', matchCondition, 'Actual', proxies);
        }

        console.log(`Adding a proxy for paraId ${oakAdapter.getChainData().paraId}. Proxy address: ${proxyAddress} ...`);
        await mangataHelper.addProxy(proxyAddress, proxyType, keyringPair);
    }

    const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to set up pools.', default: true });

    if (answerPool) {
        // Get current pools available
        const availablePools = await mangataHelper.getPools({ isPromoted: false });
        console.log('\n5. AvailablePools pools: ', pools);

        const poolFound = _.find(availablePools, (pool) => pool.firstTokenId === mangataAsset.id && pool.secondTokenId === oakAsset.id);

        // Create a MGR-TUR pool is not found
        if (_.isUndefined(poolFound)) {
            console.log(`No ${poolName} pool found; creating a ${poolName} pool with ${keyringPair.meta.name} ...`);

            const parachainTokenDeposit = 10000; // Add 10,000 initial MGR to pool
            const turingTokenDeposit = 1000; // Add 1,000 initial TUR to pool

            await mangataHelper.createPool({
                firstTokenId: mangataAsset.id,
                firstAmount: parachainTokenDeposit,
                secondTokenId: oakAsset.id,
                secondAmount: turingTokenDeposit,
                keyringPair,
            });

            // Update assets
            console.log(`\nChecking out assets after pool creation; there should be a new ${poolName} token ...`);
            await mangataHelper.updateAssets();
        } else {
            console.log(`An existing ${poolName} pool found; skip pool creation ...`);
        }

        const poolsRetry = await mangataHelper.getPools({ isPromoted: false });

        const pool = _.find(poolsRetry, { firstTokenId: mangataAsset.id, secondTokenId: oakAsset.id });
        console.log(`Found a pool of ${poolName}`, pool);

        // Promote pool
        console.log('\n6. Promote the pool to activate liquidity rewarding ...');
        await mangataHelper.updatePoolPromotion(pool.liquidityTokenId, 100, keyringPair);

        // Mint liquidity to generate rewards...
        console.log('\n7. Mint liquidity to generate rewards...');

        const firstTokenAmount = 1000;
        const MAX_SLIPPIAGE = 0.04; // 4% slippage; can’t be too large
        const poolRatio = pool.firstTokenAmountFloat / pool.secondTokenAmountFloat;
        const expectedSecondTokenAmount = (firstTokenAmount / poolRatio) * (1 + MAX_SLIPPIAGE);

        // Estimate of fees; no need to be accurate
        const fees = await mangataHelper.getMintLiquidityFee({
            pair: keyringPair, firstTokenId: mangataAsset.id, firstTokenAmount, secondTokenId: oakAsset.id, expectedSecondTokenAmount,
        });

        console.log(`Mint Liquidity Fee: ${fees} ${mangataAsset.symbol}`);

        await mangataHelper.mintLiquidity({
            pair: keyringPair,
            firstTokenId: mangataAsset.id,
            firstTokenAmount: firstTokenAmount - fees,
            secondTokenId: oakAsset.id,
            expectedSecondTokenAmount,
        });

        console.log('\nWaiting 120 seconds to check claimable reward ...');
        await delay(120 * 1000);

        const liquidityTokenId = mangataHelper.getTokenIdBySymbol(poolName);
        const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
        console.log(`Claimable reward in ${poolName}: `, rewardAmount);
    }
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
