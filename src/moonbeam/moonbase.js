import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import { hexToU8a } from '@polkadot/util';

import Account from '../common/account';
import { TuringDev, MoonbaseDev } from '../config';
import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import {
    sendExtrinsic, getDecimalBN, listenEvents, calculateTimeout,
} from '../common/utils';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
// const TASK_FREQUENCY = 3600;

const keyring = new Keyring({ type: 'sr25519' });

const scheduleTask = async ({
    turingHelper, parachainHelper, turingAddress, parachainAddress, proxyAccountId, paraTokenIdOnTuring, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');

    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload on Shiden would be Shibuya’s utility.batch() call to claim staking rewards and restake
    const payload = parachainHelper.api.tx.system.remarkWithEvent('Hello world!');
    const payloadViaProxy = parachainHelper.api.tx.proxy.proxy(parachainAddress, 'Any', payload);
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
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        // { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime } },
        { Fixed: { executionTimes: [0] } },
        parachainHelper.config.paraId,
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

    console.log(`\nc) Execute the above an XCM from ${parachainHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
    const feePerSecond = await turingHelper.getFeePerSecond(paraTokenIdOnTuring);
    console.log('feePerSecond: ', feePerSecond);
    const xcmpExtrinsic = parachainHelper.createTransactExtrinsic({
        targetParaId: turingHelper.config.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyAccountId,
        feePerSecond,
        instructionWeight: TURING_INSTRUCTION_WEIGHT,
        requireWeightAtMost,
    });

    await sendExtrinsic(parachainHelper.api, xcmpExtrinsic, keyPair);

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

    const moonbaseHelper = new MoonbaseHelper(MoonbaseDev);
    await moonbaseHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = moonbaseHelper.config.key;

    const parachainAccount = {
        name: 'Alith',
        privateKey: '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
    };

    console.log(`1. Reading token and balance of ${parachainAccount.name} account ...`);

    const moonbaseKeyPair = keyring.addFromSeed(hexToU8a(parachainAccount.privateKey), undefined, 'ethereum');

    const parachainAddress = moonbaseKeyPair.address;

    const accountName = 'Alice';
    const keyPair = keyring.addFromUri(`//${accountName}`, undefined, 'sr25519');
    const account = new Account(keyPair);
    account.name = accountName;

    await account.init([turingHelper]);
    account.print();

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    // console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    // console.log(`\na) Add a proxy for ${parachainAccount.name} If there is none setup on ${parachainName} (paraId:${turingHelper.config.paraId}) \n`);

    const proxyTypeParachain = 'Any'; // We cannot set proxyType to "DappsStaking" without the actual auto-restake call
    const proxyOnParachain = moonbaseHelper.getProxyAccount(moonbaseKeyPair.publicKey, turingHelper.config.paraId);
    const proxies = await moonbaseHelper.getProxies(parachainAddress);
    const proxyMatch = _.find(proxies, { delegate: proxyOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyOnParachain} for paraId: ${turingHelper.config.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${turingChainName} (paraId:${turingHelper.config.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyOnParachain}\n`);
        await sendExtrinsic(moonbaseHelper.api, moonbaseHelper.api.tx.proxy.addProxy(proxyOnParachain, proxyTypeParachain, 0), moonbaseKeyPair);
    }

    const parachainTokenDecimals = 18;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const decimalBN = getDecimalBN(parachainTokenDecimals);

    // console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    const paraTokenIdOnTuring = await turingHelper.getAssetIdByParaId(moonbaseHelper.config.paraId);

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    const balance = await moonbaseHelper.getBalance(proxyOnParachain);

    if (balance.free.lt(minBalance)) {
        console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
        const amount = new BN(1000, 10);
        const amountBN = amount.mul(decimalBN);
        const topUpExtrinsic = moonbaseHelper.api.tx.balances.transfer(proxyOnParachain, amountBN.toString());
        await sendExtrinsic(moonbaseHelper.api, topUpExtrinsic, moonbaseKeyPair);
    } else {
        const freeAmount = (new BN(balance.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeAmount.toString()}, no need to top it up with SBY transfer ...`);
    }

    const proxyAccountId = moonbaseKeyPair.publicKey;
    console.log('proxyAccountId: ', proxyAccountId);

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${turingChainName} ...`);

    const result = await scheduleTask({
        turingHelper, parachainHelper: moonbaseHelper, turingAddress, parachainAddress, proxyAccountId, paraTokenIdOnTuring, keyPair: moonbaseKeyPair,
    });

    const { taskId, providedId, executionTime } = result;
    const timeout = calculateTimeout(executionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(moonbaseHelper.api, 'proxy', 'ProxyExecuted', timeout);

    if (!isTaskExecuted) {
        console.log('Timeout! Task was not executed.');
        return;
    }

    console.log('Task has been executed!');
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
