import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';

import TuringHelper from './common/turingHelper';
import ShibuyaHelper from './common/shibuyaHelper';
import { sendExtrinsic, getDecimalBN, listenEvents } from './common/utils';
import { TuringDev, Shibuya } from './config';

// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const SHIBUYA_TOKEN_ID_ON_TURING = 4;
const TASK_FREQUENCY = 3600;
const LISTEN_EVENT_DELAY = 3 * 60;

const keyring = new Keyring({ type: 'sr25519' });

<<<<<<< HEAD
const scheduleTask = async ({
    turingHelper, shibuyaHelper, turingAddress, shibuyaAddress, proxyOnTuringPublicKey, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');
=======
    const keyring = new Keyring();
    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    const turingAddress = keyring.encodeAddress(keyPair.address, TuringDev.ss58);
    const shibuyaAddress = keyring.encodeAddress(keyPair.address, Shibuya.ss58);
    console.log(`\nUser Alice’s Turing address: ${turingAddress}, Shibuya address: ${shibuyaAddress}`);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log('\n1. One-time proxy setup on Shibuya');
    const proxyOnShibuya = shibuyaHelper.getProxyAccount(TuringDev.paraId, shibuyaAddress);

    console.log(`\na) Add a proxy of Turing (paraId:${TuringDev.paraId}) for Alice on Shibuya ...\n Proxy address: ${proxyOnShibuya}\n`);
    await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnShibuya, 'Any', 0), keyPair);

    console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
    const sbyAmount = new BN(1000, 10);
    const sbyAmountBN = sbyAmount.mul(getDecimalBN(shibuyaHelper.getDecimalBySymbol('SBY')));

    const transferSBY = shibuyaHelper.api.tx.balances.transfer(proxyOnShibuya, sbyAmountBN.toString());
    await sendExtrinsic(shibuyaHelper.api, transferSBY, keyPair);

    console.log('\n2. One-time proxy setup on Turing');
    const proxyOnTuring = turingHelper.getProxyAccount(Shibuya.paraId, turingAddress);

    console.log(`\na) Add a proxy of Shibuya (paraId:${Shibuya.paraId}) for Alice on Turing ...\nProxy address: ${proxyOnTuring}\n`);
    await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, 'Any', 0), keyPair);

    // Reserve transfer SBY to the proxy account on Turing
    console.log('\nb) Topping up the proxy account on Turing via reserve transfer SBY');
    const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(TuringDev.paraId, proxyOnTuring, '9000000000000000000');
    await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);

    console.log('\n3. Create a payload to store in Turing’s task ...');
>>>>>>> 76a310a7 (Call createTransactExtrinsic, createReserveTransferAssetsExtrinsic in shibuya.js)

    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload would be Shibuya’s utility.batch() call to claim staking rewards and stake
    const payload = shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const payloadViaProxy = shibuyaHelper.api.tx.proxy.proxy(shibuyaAddress, 'Any', payload);
    const encodedCallData = payloadViaProxy.method.toHex();
    const payloadViaProxyFees = await payloadViaProxy.paymentInfo(shibuyaAddress);
    const encodedCallWeight = parseInt(payloadViaProxyFees.weight.refTime, 10);
    console.log(`Encoded call data: ${encodedCallData}`);
    console.log(`Encoded call weight: ${encodedCallWeight}`);

    console.log('\nb) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');

    // Schedule an XCMP task from Turing’s timeAutomation pallet
    // The parameter "Fixed: { executionTimes: [0] }" will trigger the task immediately, while in real world usage Recurring can achieve every day or every week
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;

    const secondsInHour = 3600;
    const millisecondsInHour = 3600 * 1000;
    const currentTimestamp = moment().valueOf();
    const nextExecutionTime = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime } },
        // { Fixed: { executionTimes: [0] } },
        Shibuya.paraId,
        0,
        encodedCallData,
        encodedCallWeight,
    );

    const taskViaProxy = turingHelper.api.tx.proxy.proxy(turingAddress, 'Any', taskExtrinsic);
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight, 10);

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

<<<<<<< HEAD
    console.log('\nc) Execute the above an XCM from Shibuya to schedule a task on Turing ...');
    const feePerSecond = await turingHelper.getFeePerSecond(SHIBUYA_TOKEN_ID_ON_TURING);
    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: TuringDev.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyOnTuringPublicKey,
        feePerSecond,
        instructionWeight: TURING_INSTRUCTION_WEIGHT,
        requireWeightAtMost,
=======
    console.log('\n5. Execute the above an XCM from Shibuya to schedule a task on Turing ...');
    const fungible = 6255948005536808;
    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: TuringDev.paraId,
        encodedCall: encodedTaskViaProxy,
        fungible,
        requireWeightAtMost,
        proxyOnTuring,
        instructionWeight: TURING_INSTRUCTION_WEIGHT,
>>>>>>> 76a310a7 (Call createTransactExtrinsic, createReserveTransferAssetsExtrinsic in shibuya.js)
    });
    await sendExtrinsic(shibuyaHelper.api, xcmpExtrinsic, keyPair);

    console.log(`\nAt this point if the XCM succeeds, you should see the below events on both chains:\n
  1. Shibuya\n
  xcmpQueue.XcmpMessageSent and polkadotXcm.Sent - an XCM is successfully sent from Shibuya to Turing to schedule a task.\n
  2. Turing Dev\n
  a) proxy.ProxyExecuted and automationTime.TaskScheduled - the above XCM is received and executed on Turing.\n
  b) xcmpHandler.XcmTransactedLocally, xcmpQueue.XcmpMessageSent, xcmpHandler.XcmSent and automationTime.XcmpTaskSucceeded - the task is triggered and its payload is sent to Shibuya via XCM.\n
  3. Shibuya\n
  proxy.ProxyExecuted and xcmpQueue.Success - the above payload is received and executed.\n`);

    const taskIdCodec = await turingHelper.api.rpc.automationTime.generateTaskId(turingAddress, providedId);
    const taskId = taskIdCodec.toString();

    return { providedId, taskId, executionTime: nextExecutionTime };
};

const calculateTimeout = (executionTime) => (executionTime - moment().valueOf() / 1000 + LISTEN_EVENT_DELAY) * 1000;

const main = async () => {
    const turingHelper = new TuringHelper(TuringDev);
    await turingHelper.initialize();

    const shibuyaHelper = new ShibuyaHelper(Shibuya);
    await shibuyaHelper.initialize();

    const sbyDecimalBN = getDecimalBN(shibuyaHelper.getDecimalBySymbol('SBY'));

    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    const turingAddress = keyring.encodeAddress(keyPair.address, TuringDev.ss58);
    const shibuyaAddress = keyring.encodeAddress(keyPair.address, Shibuya.ss58);
    console.log(`\nUser Alice’s Turing address: ${turingAddress}, Shibuya address: ${shibuyaAddress}`);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log('\n1. One-time proxy setup on Shibuya');
    console.log(`\na) Add a proxy for Alice If there is none setup on Shibuya (paraId:${TuringDev.paraId}) \n`);

    const proxyTypeShibuya = 'Any'; // We cannotset proxyType to "DappsStaking" without the actual auto-restake call
    const proxyOnShibuya = shibuyaHelper.getProxyAccount(shibuyaAddress, TuringDev.paraId);
    const proxiesOnShibuya = await shibuyaHelper.getProxies(shibuyaAddress);
    const proxyMatch = _.find(proxiesOnShibuya, { delegate: proxyOnShibuya, proxyType: proxyTypeShibuya });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyOnShibuya} for paraId: ${TuringDev.paraId} and proxyType: ${proxyTypeShibuya} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of Turing (paraId:${TuringDev.paraId}) and proxyType: ${proxyTypeShibuya} on Shibuya ...\n Proxy address: ${proxyOnShibuya}\n`);
        await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnShibuya, proxyTypeShibuya, 0), keyPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(sbyDecimalBN);
    const balance = await shibuyaHelper.getBalance(proxyOnShibuya);

    if (balance.free.lt(minBalance)) {
        console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
        const sbyAmount = new BN(1000, 10);
        const sbyAmountBN = sbyAmount.mul(sbyDecimalBN);
        const transferSBY = shibuyaHelper.api.tx.balances.transfer(proxyOnShibuya, sbyAmountBN.toString());
        await sendExtrinsic(shibuyaHelper.api, transferSBY, keyPair);
    } else {
        const freeSBY = (new BN(balance.free)).div(sbyDecimalBN);
        console.log(`\nb) Proxy’s balance is ${freeSBY.toString()}, no need to top it up with SBY transfer ...`);
    }

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${Shibuya.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxyOnTuring = turingHelper.getProxyAccount(turingAddress, Shibuya.paraId);
    const proxyOnTuringPublicKey = keyring.decodeAddress(proxyOnTuring);
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${Shibuya.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of Shibuya (paraId:${Shibuya.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer SBY to the proxy account on Turing
    const minSbyBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(sbyDecimalBN);
    const sbyBalanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, SHIBUYA_TOKEN_ID_ON_TURING);

    if (sbyBalanceOnTuring.free.lt(minSbyBalanceOnTuring)) {
        console.log('\nb) Topping up the proxy account on Turing via reserve transfer SBY');
        const sbyAmount = new BN(1000, 10);
        const sbyAmountBN = sbyAmount.mul(sbyDecimalBN);
        const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(TuringDev.paraId, proxyOnTuringPublicKey, sbyAmountBN);
        await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);
    } else {
        const freeSBYOnTuring = (new BN(sbyBalanceOnTuring.free)).div(sbyDecimalBN);
        console.log(`\nb) Proxy’s balance is ${freeSBYOnTuring.toString()}, no need to top it up with SBY reserve transfer ...`);
    }

    console.log('\n3. Execute an XCM from Shibuya to schedule a task on Turing ...');
    const result = await scheduleTask({
        turingHelper, shibuyaHelper, turingAddress, shibuyaAddress, proxyOnTuringPublicKey, keyPair,
    });

    const { taskId, providedId, executionTime } = result;
    const timeout = calculateTimeout(executionTime);

    console.log(`\n4. Keep Listening events from Shibuya until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(shibuyaHelper.api, 'proxy', 'ProxyExecuted', timeout);

    if (!isTaskExecuted) {
        console.log('Timeout! Task was not executed.');
        return;
    }

    console.log('Task has been executed!');

    console.log('\n5. Cancel task ...');
    const cancelTaskExtrinsic = turingHelper.api.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(turingHelper.api, cancelTaskExtrinsic, keyPair);

    const nextExecutionTime = executionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);
    console.log(`\n6. Keep Listening events from Shibuya until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task was successfully canceled ...`);
    const isTaskExecutedAgain = await listenEvents(shibuyaHelper.api, 'proxy', 'ProxyExecuted', nextExecutionTimeout);

    if (isTaskExecutedAgain) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }

    console.log("Task canceled successfully! It didn't execute again.");
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
