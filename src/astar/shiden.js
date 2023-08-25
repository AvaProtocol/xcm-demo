import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import TuringHelper from '../common/turingHelper';
import ShibuyaHelper from '../common/shibuyaHelper';
import {
    sendExtrinsic, getDecimalBN, listenEvents, readMnemonicFromFile, calculateTimeout, getTaskIdInTaskScheduledEvent, getHourlyTimestamp, waitPromises,
} from '../common/utils';
import { Turing, Shiden } from '../config';
import Account from '../common/account';

// TODO: read this instruction value from Turing Network
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const TASK_FREQUENCY = 3600;

const keyring = new Keyring({ type: 'sr25519' });

const scheduleTask = async ({
    turingHelper, shibuyaHelper, turingAddress, parachainAddress, proxyAccountId, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');

    // TODO: add utility.batch([claimStaker(), claimStaker(), claimStaker]) to test auto-claim 3 eras
    const payload = shibuyaHelper.api.tx.dappsStaking.claimStaker({
        Evm: '0x1cee94a11eaf390b67aa346e9dda3019dfad4f6a',
    });

    console.log('\nb) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');
    const payloadViaProxy = shibuyaHelper.api.tx.proxy.proxy(parachainAddress, 'Any', payload);
    const encodedCallData = payloadViaProxy.method.toHex();
    const { weight: encodedCallWeight } = await payloadViaProxy.paymentInfo(parachainAddress);
    const overallWeight = shibuyaHelper.calculateXcmTransactOverallWeight(encodedCallWeight);
    const fee = await shibuyaHelper.api.call.transactionPaymentApi.queryWeightToFee(overallWeight);

    console.log(`Encoded call data: ${encodedCallData}`);
    console.log('Encoded call encodedCallWeight: ', encodedCallWeight.toHuman());
    console.log(`overallWeight: (${overallWeight.refTime.toString()}, ${overallWeight.proofSize.toString()})`);

    // Schedule an XCMP task from Turing’s timeAutomation pallet
    const executionTimes = [getHourlyTimestamp(1) / 1000, getHourlyTimestamp(2) / 1000];
    const nextExecutionTime = executionTimes[0];
    const assetLocation = shibuyaHelper.getNativeAssetLocation();
    const taskViaProxy = turingHelper.api.tx.automationTime.scheduleXcmpTaskThroughProxy(
        { Fixed: { executionTimes } },
        { V3: shibuyaHelper.getLocation() },
        { V3: assetLocation },
        { assetLocation: { V3: assetLocation }, amount: fee },
        encodedCallData,
        encodedCallWeight,
        overallWeight,
        turingAddress,
    );

    console.log(`\nc) Execute the above an XCM from ${shibuyaHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);

    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const { weight: transactCallWeight } = await taskViaProxy.paymentInfo(turingAddress);
    const xcmOverallWeight = turingHelper.calculateXcmTransactOverallWeight(transactCallWeight);
    const taskViaProxyFee = await turingHelper.weightToFee(xcmOverallWeight, shibuyaHelper.getNativeAssetLocation());

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log('requireWeightAtMost: ', transactCallWeight.toHuman());
    console.log(`xcmOverallWeight: (${xcmOverallWeight.refTime.toString()}, ${xcmOverallWeight.proofSize.toString()})`);

    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: turingHelper.config.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyAccountId,
        transactCallWeight,
        overallWeight: xcmOverallWeight,
        fee: taskViaProxyFee,
    });

    console.log('xcmpExtrinsic: ', xcmpExtrinsic.method.toHex());

    // Wait extrinsic executing and listen TaskScheduled event.
    const sendExtrinsicPromise = sendExtrinsic(shibuyaHelper.api, xcmpExtrinsic, keyPair);
    const listenEventsPromise = listenEvents(turingHelper.api, 'automationTime', 'TaskScheduled', 60000);
    const results = await waitPromises([sendExtrinsicPromise, listenEventsPromise]);

    console.log('Listening to TaskScheduled event on Turing chain ...');
    const taskScheduledEvent = results[1];
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);

    console.log(`\nAt this point if the XCM succeeds, you should see the below events on both chains:\n
  1. Shibuya\n
  xcmpQueue.XcmpMessageSent and polkadotXcm.Sent - an XCM is successfully sent from Shibuya to Turing to schedule a task.\n
  2. Turing Dev\n
  a) proxy.ProxyExecuted and automationTime.TaskScheduled - the above XCM is received and executed on Turing.\n
  b) xcmpHandler.XcmTransactedLocally, xcmpQueue.XcmpMessageSent, xcmpHandler.XcmSent and automationTime.XcmpTaskSucceeded - the task is triggered and its payload is sent to Shibuya via XCM.\n
  3. Shibuya\n
  proxy.ProxyExecuted and xcmpQueue.Success - the above payload is received and executed.\n`);

    return { taskId, executionTime: nextExecutionTime };
};

const main = async () => {
    const turingHelper = new TuringHelper(Turing);
    await turingHelper.initialize();

    const shibuyaHelper = new ShibuyaHelper(Shiden);
    await shibuyaHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = shibuyaHelper.config.key;
    const parachainNativeToken = _.first(shibuyaHelper.config.assets);

    console.log(`\nTuring chain key: ${turingChainName}`);
    console.log(`Parachain name: ${parachainName}, native token: ${JSON.stringify(parachainNativeToken)}\n`);

    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);

    const account = new Account(keyPair);
    await account.init([turingHelper, shibuyaHelper]);
    account.print();

    const parachainAddress = account.getChainByName(parachainName)?.address;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const decimalBN = getDecimalBN(parachainNativeToken.decimals);

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    const paraTokenIdOnTuring = await turingHelper.getAssetIdByLocation(shibuyaHelper.getNativeAssetLocation());
    console.log('Rocstar ID on Turing: ', paraTokenIdOnTuring);

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
    const balance = await shibuyaHelper.getBalance(proxyOnParachain);

    if (balance.free.lt(minBalance)) {
        console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
        const topUpExtrinsic = shibuyaHelper.api.tx.balances.transfer(proxyOnParachain, minBalance);
        await sendExtrinsic(shibuyaHelper.api, topUpExtrinsic, keyPair);
    } else {
        const freeAmount = (new BN(balance.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeAmount.toString()}, no need to top it up with SBY transfer ...`);
    }

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${shibuyaHelper.config.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxyOnTuring = turingHelper.getProxyAccount(turingAddress, shibuyaHelper.config.paraId, { network: 'Kusama', locationType: 'XcmV3MultiLocation' });
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
    const balanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);

    if (balanceOnTuring.free.lt(minBalanceOnTuring)) {
        console.log(`\nb) Topping up the proxy account on ${turingChainName} via reserve transfer ...`);
        const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(turingHelper.config.paraId, proxyAccountId, minBalanceOnTuring);
        await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);
    } else {
        const freeBalanceOnTuring = (new BN(balanceOnTuring.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeBalanceOnTuring.toString()}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${turingChainName} ...`);

    const result = await scheduleTask({
        turingHelper, shibuyaHelper, turingAddress, parachainAddress, proxyAccountId, keyPair,
    });

    const { taskId, executionTime } = result;
    const timeout = calculateTimeout(executionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
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
