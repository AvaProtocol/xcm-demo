import '@oak-network/api-augment';
import _ from 'lodash';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import TuringHelper from './common/turingHelper';
import MangataHelper from './common/mangataHelper';
import Account from './common/account';
import { delay, listenEvents } from './common/utils';

import {
    TuringDev, MangataDev,
} from './config';

/**
 * Make sure you run `npm run setup` before running this file.
 * Pre-requisite from setup
 * 1. MGR-TUR pool is created and promoted
 * 2. Alice account has balances
 *   a) MGR on Mangata
 *   b) MGR-TUR liquidity token on Mangata
 *   c) Reward claimable in MGR-TUR pool
 *   d) TUR on Turing for transaction fees
 *
 */

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

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

    console.log('Reading token and balance of Alice account ...');
    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyPair.meta.name = 'Alice';

    const account = new Account(keyPair);
    await account.init([turingHelper, mangataHelper]);
    account.print();

    const mangataAddress = account.getChainByName(mangataChainName)?.address;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const poolName = `${mangataNativeToken.symbol}-${turingNativeToken.symbol}`;

    // Calculate rwards amount in pool
    console.log(`Checking how much reward available in ${poolName} pool ...`);
    const liquidityTokenId = mangataHelper.getTokenIdBySymbol(poolName);
    const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
    console.log(`Claimable reward in ${poolName}: `, rewardAmount);
 
    // Alice’s reserved LP token before auto-compound
    const liquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
    console.log(`Before auto-compound, ${account.name} reserved "${poolName}": ${liquidityBalance.reserved.toString()} Planck ...`);

    // Create Mangata proxy call
    console.log('\nStart to schedule an auto-compound call via XCM ...');

    const proxyType = 'AutoCompound';
    const proxyExtrinsic = mangataHelper.api.tx.xyk.compoundRewards(liquidityTokenId, 100);
    const mangataProxyCall = await mangataHelper.createProxyCall(mangataAddress, proxyType, proxyExtrinsic);
    const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
    const mangataProxyCallFees = await mangataProxyCall.paymentInfo(mangataAddress);

    console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
    console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

    // Create Turing scheduleXcmpTask extrinsic
    console.log('\n1. Create the call for scheduleXcmpTask ');
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const xcmpCall = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Fixed: { executionTimes: [0] } },
        mangataHelper.config.paraId,
        0,
        encodedMangataProxyCall,
        parseInt(mangataProxyCallFees.weight.refTime, 10),
    );

    console.log('xcmpCall: ', xcmpCall);

    // Query automationTime fee
    console.log('\n2. Query automationTime fee details ');
    const { executionFee, xcmpFee } = await turingHelper.api.rpc.automationTime.queryFeeDetails(xcmpCall);
    console.log('automationFeeDetails: ', { executionFee: executionFee.toHuman(), xcmpFee: xcmpFee.toHuman() });

    // Get a TaskId from Turing rpc
    const taskId = await turingHelper.api.rpc.automationTime.generateTaskId(turingAddress, providedId);
    console.log('TaskId:', taskId.toHuman());

    // Send extrinsic
    console.log('\n3. Sign and send scheduleXcmpTask call ...');
    await turingHelper.sendXcmExtrinsic(xcmpCall, account.pair, taskId);

    // Listen XCM events on Mangata side
    console.log('\n4. waiting for XCM events on Mangata side ...');
    await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted');

    console.log('\nWaiting 20 seconds before reading new chain states ...');
    await delay(20000);

    // Account’s reserved LP token after auto-compound
    const newLiquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
    console.log(`\nAfter auto-compound, reserved ${poolName} is: ${newLiquidityBalance.reserved.toString()} planck ...`);

    console.log(`${account.name} has compounded ${(newLiquidityBalance.reserved.sub(liquidityBalance.reserved)).toString()} planck more ${poolName} ...`);
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
