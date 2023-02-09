/* eslint-disable no-await-in-loop */
import '@oak-network/api-augment';
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/api';
import BN from 'bn.js';
import TuringHelper from './common/turingHelper';
import MangataHelper from './common/mangataHelper';
import Account from './common/account';

import {
    TuringDev, MangataDev,
} from './config';

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

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

    console.log('Initializing APIs of both chains ...');
    const turingHelper = new TuringHelper(TuringDev);
    await turingHelper.initialize();

    const mangataHelper = new MangataHelper(MangataDev);
    await mangataHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const mangataChainName = mangataHelper.config.key;
    const turingNativeToken = _.first(turingHelper.config.assets);
    const mangataNativeToken = _.first(mangataHelper.config.assets);

    console.log(`\nTuring chain name: ${turingChainName}, native token: ${JSON.stringify(turingNativeToken)}`);
    console.log(`Mangata chain name: ${mangataChainName}, native token: ${JSON.stringify(mangataNativeToken)}\n`);


    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyPair.meta.name = 'Alice';
    const account = new Account(keyPair);

    console.log(`1. Reading token and balance of ${account.name} account ...`);
    await account.init([turingHelper, mangataHelper]);
    account.print();

    const mangataAddress = account.getChainByName(mangataChainName)?.address;
    const mangataTokens = account.getChainByName(mangataChainName)?.tokens;
    const mgxToken = account.getAssetByChainAndSymbol(mangataChainName, mangataNativeToken.symbol);
    const turToken = account.getAssetByChainAndSymbol(mangataChainName, turingNativeToken.symbol);
    const poolName = `${mgxToken.symbol}-${turToken.symbol}`;

    console.log('\n2. Initing inssuance on Mangata ...');
    // await mangataHelper.initIssuance(account.pair);

    console.log(`\n3. Minting tokens for ${account.name} on Maganta if balance is zero ...`);

    // We are iterating all assets here for minting, but ROC is not used or required for this demo
    for (let i = 0; i < mangataTokens.length; i += 1) {
        const { symbol, balance } = mangataTokens[i];

        if (balance === 0) {
            console.log(`[${account.name}] ${symbol} balance on Mangata is zero; minting ${symbol} with sudo ...`);
            // Because sending extrinsic in parallel will cause repeated nonce errors
            // we need to wait for the previous extrinsic to be finalized before sending the extrinsic.
            await mangataHelper.mintToken(mangataAddress, symbol, account.pair);
        }
    }

    // If there is no proxy, add a proxy of Turing on Mangata
    console.log('\n4. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...');

    const proxyAddress = mangataHelper.getProxyAccount(mangataAddress, turingHelper.config.paraId);
    const proxiesResponse = await mangataHelper.api.query.proxy.proxies(mangataAddress);
    const proxies = _.first(proxiesResponse.toJSON());

    const proxyType = 'AutoCompound';
    const matchCondition = { delegate: proxyAddress, proxyType };

    const proxyMatch = _.find(proxies, matchCondition);

    if (proxyMatch) {
        console.log(`Found proxy of ${account.address} on Mangata: `, proxyMatch);
    } else {
        if (_.isEmpty(proxies)) {
            console.log(`Proxy array of ${account.address} is empty ...`);
        } else {
            console.log('Proxy not found. Expected', matchCondition, 'Actual', proxies);
        }

        console.log(`Adding a proxy for paraId ${turingHelper.config.paraId}. Proxy address: ${proxyAddress} ...`);
        await mangataHelper.addProxy(proxyAddress, proxyType, account.pair);
    }

    const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to set up pools.', default: true });

    if (answerPool) {
        // Get current pools available
        const pools = await mangataHelper.getPools({ isPromoted: false });
        console.log('\n5. Existing pools: ', pools);

        const poolFound = _.find(pools, (pool) => pool.firstTokenId === mangataHelper.getTokenIdBySymbol(mangataNativeToken.symbol) && pool.secondTokenId === mangataHelper.getTokenIdBySymbol(turingNativeToken.symbol));

        // Create a MGR-TUR pool is not found
        if (_.isUndefined(poolFound)) {
            console.log(`No ${poolName} pool found; creating a ${poolName} pool with ${account.name} ...`);

            const parachainTokenDeposit = 10000; // Add 10,000 initial MGR to pool
            const turingTokenDeposit = 1000; // Add 1,000 initial TUR to pool

            const result = await mangataHelper.createPool({
                firstTokenId: mgxToken.id,
                firstAmount: parachainTokenDeposit,
                secondTokenId: turToken.id,
                secondAmount: turingTokenDeposit,
                keyPair: account.pair,
            });

            // Update assets
            console.log(`\nChecking out assets after pool creation; there should be a new ${poolName} token ...`);
            await mangataHelper.updateAssets();
        } else {
            console.log(`An existing ${poolName} pool found; skip pool creation ...`);
        }

        const poolsRetry = await mangataHelper.getPools({ isPromoted: false });

        const pool = _.find(poolsRetry, { firstTokenId: mgxToken.id, secondTokenId: turToken.id });
        console.log(`Found a pool of ${poolName}`, pool);

        // Promote pool
        console.log('\n6. Promote the pool to activate liquidity rewarding ...');
        await mangataHelper.updatePoolPromotion(pool.liquidityTokenId, 100, account.pair);

        const liquidityTokenAmount = 1000;
        await mangataHelper.activateLiquidityV2({ tokenId: pool.liquidityTokenId, amount: liquidityTokenAmount, keyPair: account.pair });

        // Mint liquidity to generate rewards...
        console.log('\n7. Mint liquidity to generate rewards...');

        const firstTokenAmount = 1000;
        const MAX_SLIPPIAGE = 0.04; // 4% slippage; can’t be too large
        const poolRatio = pool.firstTokenAmountFloat / pool.secondTokenAmountFloat;
        const expectedSecondTokenAmount = (firstTokenAmount / poolRatio) * (1 + MAX_SLIPPIAGE);

        // Estimate of fees; no need to be accurate
        const fees = await mangataHelper.getMintLiquidityFee({
            pair: account.pair, firstTokenId: mgxToken.id, firstTokenAmount, secondTokenId: turToken.id, expectedSecondTokenAmount,
        });

        console.log(`Mint Liquidity Fee: ${fees} ${mgxToken.symbol}`);

        await mangataHelper.mintLiquidity({
            pair: account.pair,
            firstTokenId: mgxToken.id,
            firstTokenAmount: firstTokenAmount - fees,
            secondTokenId: turToken.id,
            expectedSecondTokenAmount,
        });
    }
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
