import '@oak-network/api-augment';
import _ from 'lodash';
import BN from 'bn.js';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import moment from 'moment';
import Keyring from '@polkadot/keyring';

import TuringHelper from './common/turingHelper';
import MangataHelper from './common/mangataHelper';
import Account from './common/account';
import {
    calculateTimeout, delay, getDecimalBN, listenEvents, sendExtrinsic,
} from './common/utils';

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

const TASK_FREQUENCY = 3600;

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

    const parachainName = mangataHelper.config.key;

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

    // TODO: determining liquidityTokenId by symbol name cannot handle duplicate symbols. It’s better we retrieve pools and find the correct pool
    const liquidityTokenId = mangataHelper.getTokenIdBySymbol(poolName);
    const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
    console.log(`Claimable reward in ${poolName}: `, rewardAmount);

    // Alice’s reserved LP token before auto-compound
    const liquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
    const liquidityDecimalBN = getDecimalBN(mangataHelper.getDecimalsBySymbol(poolName));
    console.log(`Before auto-compound, ${account.name} reserved ${poolName}: ${(new BN(liquidityBalance.reserved)).div(liquidityDecimalBN).toString()} ...`);

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
    const secondsInHour = 3600;
    const millisecondsInHour = 3600 * 1000;
    const currentTimestamp = moment().valueOf();
    const executionTime = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const xcmpCall = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime: executionTime } },
        // { Fixed: { executionTimes: [0] } },
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
    console.log(`\n4. Keep Listening XCM events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
    await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted');

    const isTaskExecuted = await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted', executionTime);
    if (!isTaskExecuted) {
        console.log('Timeout! Task was not executed.');
        return;
    }

    console.log('Task has been executed!');

    console.log('\nWaiting 20 seconds before reading new chain states ...');
    await delay(20000);

    // Account’s reserved LP token after auto-compound
    const newLiquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
    const newReservedBalanceBN = (new BN(newLiquidityBalance.reserved)).div(liquidityDecimalBN);
    console.log(`\nAfter auto-compound, reserved ${poolName} is: ${newReservedBalanceBN} ${poolName} ...`);

    const reservedPlanckDeltaBN = newLiquidityBalance.reserved.sub(liquidityBalance.reserved);
    const reservedDeltaBN = reservedPlanckDeltaBN.div(liquidityDecimalBN);
    console.log(`${account.name} has compounded ${reservedDeltaBN.toString()} more ${poolName} ...`);

    console.log('\n5. Cancel task ...');
    const cancelTaskExtrinsic = turingHelper.api.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(turingHelper.api, cancelTaskExtrinsic, keyPair);

    const nextExecutionTime = executionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task was successfully canceled ...`);

    const isTaskExecutedAgain = await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted', nextExecutionTimeout);
    if (isTaskExecutedAgain) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }
    console.log("Task canceled successfully! It didn't execute again.");
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
