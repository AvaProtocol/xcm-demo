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
import { delay, readMnemonicFromFile } from './common/utils';

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

    console.log('1. Reading token and balance of Alice account ...');

    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyPair.meta.name = 'Alice';

    const json = await readMnemonicFromFile();
    const restoredPair = keyring.addFromJson(json);
    restoredPair.unlock(process.env.PASS_PHRASE);

    const account = new Account(keyPair);
    await account.init([turingHelper, mangataHelper]);
    account.print();

    const mangataAddress = account.getChainByName(mangataChainName)?.address;
    const mangataTokens = account.getChainByName(mangataChainName)?.tokens;

    console.log('2. Initing inssuance on Mangata ...');
    await mangataHelper.initIssuance(account.pair);

    console.log(`3. Minting tokens for ${account.name} on Maganta if balance is zero ...`);
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
    console.log('4. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...');

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
        const pools = await mangataHelper.getPools();

        console.log('5. Existing pools: ', pools);

        const poolName = `${mangataNativeToken.symbol}-${turingNativeToken.symbol}`;
        const poolFound = _.find(pools, (pool) => pool.firstTokenId === mangataHelper.getTokenIdBySymbol(mangataNativeToken.symbol) && pool.secondTokenId === mangataHelper.getTokenIdBySymbol(turingNativeToken.symbol));

        // Create a MGR-TUR pool is not found
        if (_.isUndefined(poolFound)) {
            console.log(`No ${poolName} pool found; creating a ${poolName} pool with ${account.name} ...`);

            await mangataHelper.createPool(
                mangataNativeToken.symbol,
                turingNativeToken.symbol,
                new BN('10000').mul(new BN(mangataNativeToken.decimals)), // 10000 MGR (MGR is 18 decimals)
                new BN('100').mul(new BN(turingNativeToken.decimals)), // 100 TUR (TUR is 12 decimals)
                account.pair,
            );
        } else {
            console.log(`An existing ${poolName} pool found; skip pool creation ...`);
        }

        // Update assets
        console.log(`Checking out assets after pool creation; there should be a new ${poolName} token ...`);
        await mangataHelper.updateAssets();

        // Promote pool
        console.log('\n6. Promote the pool to activate liquidity rewarding ...');
        await mangataHelper.updatePoolPromotion(poolName, 1, account.pair);
        await mangataHelper.activateLiquidityV2(poolName, new BN('10000').mul(new BN(mangataNativeToken.decimals)), account.pair);

        // Mint liquidity to generate rewards...
        console.log('\n7. Mint liquidity to generate rewards...');
        await mangataHelper.mintLiquidity(mangataNativeToken.symbol, new BN('10000').mul(new BN(mangataNativeToken.decimals)), turingNativeToken.symbol, new BN('10000').mul(new BN(turingNativeToken.decimals)), account.pair);
    }
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
