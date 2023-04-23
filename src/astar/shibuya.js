import _ from 'lodash';
import chalkPipe from 'chalk-pipe';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import TuringHelper from '../common/turingHelper';
import ShibuyaHelper from '../common/shibuyaHelper';
import {
    sendExtrinsic, getDecimalBN, listenEvents, calculateTimeout, bnToFloat, delay,
} from '../common/utils';
import { TuringDev, Shibuya } from '../config';
import Account from '../common/account';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const MIN_BALANCE_IN_PROXY = 150; // The proxy accounts are to be topped up if its balance fails below this number
const TASK_FREQUENCY = 3600;

const keyring = new Keyring({ type: 'sr25519' });

const scheduleTask = async ({
    turingHelper, shibuyaHelper, turingAddress, parachainAddress, proxyAccountId, paraTokenIdOnTuring, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');

    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload on Shiden would be Shibuya’s utility.batch() call to claim staking rewards and restake
    const payload = shibuyaHelper.api.tx.system.remarkWithEvent('Hello world!');
    const payloadViaProxy = shibuyaHelper.api.tx.proxy.proxy(parachainAddress, 'Any', payload);
    const encodedCallData = payloadViaProxy.method.toHex();
    const payloadViaProxyFees = await payloadViaProxy.paymentInfo(parachainAddress);
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

    // TODO: add select prompt to let user decide whether to trigger immediately or at next hour
    // Currently the task trigger immediately in dev environment
    const taskViaProxy = turingHelper.api.tx.automationTime.scheduleXcmpTaskThroughProxy(
        providedId,
        // { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime } },
        { Fixed: { executionTimes: [0] } },
        shibuyaHelper.config.paraId,
        paraTokenIdOnTuring,
        { V1: { parents: 1, interior: { X1: { Parachain: shibuyaHelper.config.paraId } } } },
        encodedCallData,
        encodedCallWeight,
        turingAddress,
    );

    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight, 10);

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

    console.log(`\nc) Execute the above an XCM from ${shibuyaHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
    const feePerSecond = await turingHelper.getFeePerSecond(paraTokenIdOnTuring);
    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: turingHelper.config.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyAccountId,
        feePerSecond,
        instructionWeight: TURING_INSTRUCTION_WEIGHT,
        requireWeightAtMost,
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

const main = async () => {
    const turingHelper = new TuringHelper(TuringDev);
    await turingHelper.initialize();

    const shibuyaHelper = new ShibuyaHelper(Shibuya);
    await shibuyaHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = shibuyaHelper.config.key;
    const parachainNativeToken = _.first(shibuyaHelper.config.assets);

    console.log(`\nTuring chain key: ${turingChainName}`);
    console.log(`Parachain name: ${parachainName}, native token: ${JSON.stringify(parachainNativeToken)}\n`);

    const accountName = 'Alice';

    console.log(`1. Reading token and balance of ${accountName} account ...`);

    const keyPair = keyring.addFromUri(`//${accountName}`, undefined, 'sr25519');
    const account = new Account(keyPair);
    account.name = accountName;

    await account.init([turingHelper, shibuyaHelper]);
    account.print();

    const parachainAddress = account.getChainByName(parachainName)?.address;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const decimalBN = getDecimalBN(parachainNativeToken.decimals);
    const { symbol } = parachainNativeToken;

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    const paraTokenIdOnTuring = await turingHelper.getAssetIdByParaId(shibuyaHelper.config.paraId);
    console.log('Shibuya ID on Turing: ', paraTokenIdOnTuring);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    console.log(`\na) Add a proxy for ${account.name} If there is none setup on ${parachainName} (paraId:${turingHelper.config.paraId}) \n`);

    const proxyTypeParachain = 'Any'; // We cannotset proxyType to "DappsStaking" without the actual auto-restake call
    const proxyOnParachain = shibuyaHelper.getProxyAccount(parachainAddress, turingHelper.config.paraId);
    const proxies = await shibuyaHelper.getProxies(parachainAddress);
    const proxyMatch = _.find(proxies, { delegate: proxyOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyOnParachain} for paraId: ${turingHelper.config.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${turingChainName} (paraId:${turingHelper.config.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyOnParachain}\n`);
        await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnParachain, proxyTypeParachain, 0), keyPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    let proxyBalance = await shibuyaHelper.getBalance(proxyOnParachain);

    if (proxyBalance.free.lt(minBalance)) {
        console.log(`\nTopping up the proxy account on Shibuya with ${symbol} ...\n`);
        const amount = new BN(1000, 10);
        const amountBN = amount.mul(decimalBN);
        const topUpExtrinsic = shibuyaHelper.api.tx.balances.transfer(proxyOnParachain, amountBN.toString());
        await sendExtrinsic(shibuyaHelper.api, topUpExtrinsic, keyPair);

        // Retrieve the latest balance after top-up
        proxyBalance = await shibuyaHelper.getBalance(proxyOnParachain);
    }

    console.log(`\nb) Proxy’s balance on ${parachainName} is ${chalkPipe('green')(bnToFloat(proxyBalance.free, decimalBN))} ${symbol}.`);

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${shibuyaHelper.config.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxyOnTuring = turingHelper.getProxyAccount(turingAddress, shibuyaHelper.config.paraId);

    const proxyAccountId = keyring.decodeAddress(proxyOnTuring);
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${shibuyaHelper.config.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${shibuyaHelper.config.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer SBY to the proxy account on Turing
    const minBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    let balanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);

    if (balanceOnTuring.free.lt(minBalanceOnTuring)) {
        console.log(`\nTopping up the proxy account on ${turingChainName} via reserve transfer ...`);
        const topUpAmount = new BN(1000, 10);
        const topUpAmountBN = topUpAmount.mul(decimalBN);
        const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(turingHelper.config.paraId, proxyAccountId, topUpAmountBN);
        await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);

        balanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);
    }

    console.log(`\nb) Proxy’s balance on ${turingChainName} is ${bnToFloat(balanceOnTuring.free, decimalBN)} ${symbol}.`);

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${turingChainName} ...`);

    const result = await scheduleTask({
        turingHelper, shibuyaHelper, turingAddress, parachainAddress, proxyAccountId, paraTokenIdOnTuring, keyPair,
    });

    const { taskId, providedId, executionTime } = result;
    const timeout = calculateTimeout(executionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(shibuyaHelper.api, 'proxy', 'ProxyExecuted', timeout);

    if (!isTaskExecuted) {
        console.log('Timeout! Task was not executed.');
        return;
    }

    console.log('\nTask has been executed! Waiting for 20 seconds before reading proxy balance.');

    await delay(20000);

    // Calculating balance delta to show fee cost
    const endProxyBalance = await shibuyaHelper.getBalance(proxyOnParachain);
    const proxyBalanceDelta = (new BN(proxyBalance.free)).sub(new BN(endProxyBalance.free));

    console.log(`\nAfter execution, Proxy’s balance is ${chalkPipe('green')(bnToFloat(endProxyBalance.free, decimalBN))} ${symbol}. The delta of proxy balance, or the XCM fee cost is ${chalkPipe('green')(bnToFloat(proxyBalanceDelta, decimalBN))} ${symbol}.`);

    console.log('\n5. Cancel the task ...');
    const cancelTaskExtrinsic = turingHelper.api.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(turingHelper.api, cancelTaskExtrinsic, keyPair);

    const nextExecutionTime = executionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task was successfully canceled ...`);

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
