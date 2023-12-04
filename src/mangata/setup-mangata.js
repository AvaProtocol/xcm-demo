/* eslint-disable no-await-in-loop */
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/api';
import { chains } from '@oak-network/config';
import { u8aToHex } from '@polkadot/util';
import { MangataAdapter, OakAdapter } from '@oak-network/adapter';
import { BN } from 'bn.js';
import OakHelper from '../common/oakHelper';
import MangataHelper from '../common/mangataHelper';
import { delay, getDecimalBN } from '../common/utils';

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
    const { DevChains: { turingLocal, mangataLocal } } = chains;

    console.log('Initializing APIs of both chains ...');
    const oakHelper = new OakHelper({ endpoint: turingLocal.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, turingLocal);

    const mangataHelper = new MangataHelper({ endpoint: mangataLocal.endpoint });
    await mangataHelper.initialize();
    const mangataApi = mangataHelper.getApi();
    const mangataSdk = mangataHelper.getMangataSdk();
    const mangataAdapter = new MangataAdapter(mangataApi, mangataLocal);

    const oakChainName = oakAdapter.getChainData().key;
    const mangataChainName = mangataAdapter.getChainData().key;

    const [oakDefaultAsset] = oakAdapter.getChainData().assets;
    const [mangataDefaultAsset] = mangataAdapter.getChainData().assets;

    console.log(`\n${oakChainName} chain, native token: ${JSON.stringify(oakDefaultAsset)}`);
    console.log(`${mangataChainName} chain, native token: ${JSON.stringify(mangataDefaultAsset)}\n`);

    const keyring = new Keyring({ type: 'sr25519' });
    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const mangataAddress = keyring.encodeAddress(keyringPair.addressRaw, mangataAdapter.getChainData().ss58Prefix);

    let assets = await mangataSdk.getAssetsInfo();
    assets = _.map(assets, (asset) => asset);
    const oakAsset = _.find(assets, { symbol: oakDefaultAsset.symbol });
    const mangataAsset = _.find(assets, { symbol: mangataDefaultAsset.symbol });

    console.log('\n2. Initing inssuance on Mangata ...');
    await mangataHelper.initIssuance(keyringPair);

    console.log(`\n3. Minting ${oakAsset.name} for ${keyringPair.meta.name} on Maganta if balance is zero ...`);
    await mangataHelper.mintToken(u8aToHex(keyringPair.addressRaw), oakAsset.id, keyringPair);

    const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to set up pools.', default: true });
    if (answerPool === false) return;

    // Get current pools available
    const availablePools = await mangataHelper.getPools({ isPromoted: false });
    console.log('\n5. AvailablePools pools: ', availablePools);

    const poolFound = _.find(availablePools, (pool) => pool.firstTokenId === mangataAsset.id && pool.secondTokenId === oakAsset.id);

    // Create a MGR-TUR pool is not found
    if (_.isUndefined(poolFound)) {
        console.log(`The pools for ${mangataAsset.symbol} and ${oakAsset.symbol} have not been found. Creating the pool with ${keyringPair.meta.name} ...`);

        const parachainTokenDeposit = 10000; // Add 10,000 initial MGR to pool
        const turingTokenDeposit = 1000; // Add 1,000 initial TUR to pool

        await mangataHelper.createPool({
            firstAssetId: mangataAsset.id,
            firstAmount: new BN(parachainTokenDeposit).mul(getDecimalBN(mangataAsset.decimals)),
            secondAssetId: oakAsset.id,
            secondAmount: new BN(turingTokenDeposit).mul(getDecimalBN(oakAsset.decimals)),
            keyringPair,
        });
    } else {
        const liquidityAsset = _.find(assets, { id: poolFound.liquidityTokenId });
        console.log(`An existing ${liquidityAsset.symbol} pool found; skip pool creation ...`);
    }

    // Update assets
    assets = await mangataSdk.getAssetsInfo();

    // // Find pool
    const poolsRetry = await mangataHelper.getPools({ isPromoted: false });
    const pool = _.find(poolsRetry, { firstTokenId: mangataAsset.id, secondTokenId: oakAsset.id });
    const liquidityAsset = _.find(assets, { id: pool.liquidityTokenId });
    console.log(`Found a pool of ${liquidityAsset.symbol}`, pool);

    // Promote pool
    console.log('\n6. Promote the pool to activate liquidity rewarding ...');
    await mangataHelper.updatePoolPromotion(pool.liquidityTokenId, 100, keyringPair);

    // Mint liquidity to generate rewards...
    console.log('\n7. Mint liquidity to generate rewards...');
    const formattedPool = mangataHelper.formatPool(pool, mangataAsset.decimals, oakAsset.decimals);
    const firstTokenAmount = 1000;
    const MAX_SLIPPIAGE = 0.04; // 4% slippage; can’t be too large
    const poolRatio = formattedPool.firstTokenAmountFloat / formattedPool.secondTokenAmountFloat;
    const expectedSecondTokenAmount = (firstTokenAmount / poolRatio) * (1 + MAX_SLIPPIAGE);

    // Estimate of fees; no need to be accurate
    const fees = await mangataHelper.getMintLiquidityFee({
        pair: keyringPair, firstAsset: mangataAsset, firstTokenAmount, secondAsset: oakAsset, expectedSecondTokenAmount,
    });

    console.log(`Mint Liquidity Fee: ${fees} ${mangataAsset.symbol}`);

    await mangataHelper.mintLiquidity({
        pair: keyringPair,
        firstTokenId: mangataAsset.id,
        firstTokenAmount: new BN(firstTokenAmount - fees).mul(getDecimalBN(mangataAsset.decimals)),
        secondTokenId: oakAsset.id,
        expectedSecondTokenAmount: new BN(expectedSecondTokenAmount).mul(getDecimalBN(oakAsset.decimals)),
    });

    console.log('\nWaiting 120 seconds to check claimable reward ...');
    await delay(120 * 1000);

    const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityAsset);
    console.log(`Claimable reward in ${liquidityAsset.symbol}: `, rewardAmount);
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
