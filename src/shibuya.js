import _ from 'lodash';
import { Keyring } from '@polkadot/api';
import BN from 'bn.js';

import turingHelper from './common/turingHelper';
import shibuyaHelper from './common/shibuyaHelper';
import { sendExtrinsic, getDecimalBN } from './common/utils';
import { TuringDev, Shibuya } from './config';

// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const SHIBUYA_TOKEN_ID_ON_TURING = 4;

const main = async () => {
    await turingHelper.initialize(TuringDev.endpoint);
    await shibuyaHelper.initialize(Shibuya.endpoint);

    const sbyDecimalBN = getDecimalBN(shibuyaHelper.getDecimalBySymbol('SBY'));

    const keyring = new Keyring();
    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    const turingAddress = keyring.encodeAddress(keyPair.address, TuringDev.ss58);
    const shibuyaAddress = keyring.encodeAddress(keyPair.address, Shibuya.ss58);
    console.log(`\nUser Alice’s Turing address: ${turingAddress}, Shibuya address: ${shibuyaAddress}`);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log('\n1. One-time proxy setup on Shibuya');
    console.log(`\na) Add a proxy for Alice on Shibuya If there is no proxy of Turing (paraId:${TuringDev.paraId}) \n`);
    const proxyOnShibuya = shibuyaHelper.getProxyAccount(TuringDev.paraId, shibuyaAddress);
    const proxiesOnShibuya = await shibuyaHelper.getProxies(shibuyaAddress);
    if (!_.find(proxiesOnShibuya, { delegate: keyring.encodeAddress(proxyOnShibuya, Shibuya.ss58), proxyType: 'DappsStaking' })) {
        console.log(`\n Add a proxy of Turing (paraId:${TuringDev.paraId}) for Alice on Shibuya ...\n Proxy address: ${proxyOnShibuya}\n`);
        await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnShibuya, 'DappsStaking', 0), keyPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(sbyDecimalBN);
    const balance = await shibuyaHelper.getBalance(proxyOnShibuya);
    if (balance.free.lt(minBalance)) {
        console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
        const sbyAmount = new BN(1000, 10);
        const sbyAmountBN = sbyAmount.mul(sbyDecimalBN);
        const transferSBY = shibuyaHelper.api.tx.balances.transfer(proxyOnShibuya, sbyAmountBN.toString());
        await sendExtrinsic(shibuyaHelper.api, transferSBY, keyPair);
    }

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice on Turing If there is no proxy of Shibuya (paraId:${Shibuya.paraId})\n`);
    const proxyOnTuring = turingHelper.getProxyAccount(Shibuya.paraId, turingAddress);
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    if (!_.find(proxiesOnTuring, { delegate: keyring.encodeAddress(proxyOnTuring, TuringDev.ss58), proxyType: 'Any' })) {
        console.log(`\n Add a proxy of Shibuya (paraId:${Shibuya.paraId}) for Alice on Turing ...\nProxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, 'Any', 0), keyPair);
    }

    // Reserve transfer SBY to the proxy account on Turing
    const minSbyBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(sbyDecimalBN);
    const sbyBalanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, SHIBUYA_TOKEN_ID_ON_TURING);
    if (sbyBalanceOnTuring.free.lt(minSbyBalanceOnTuring)) {
        console.log('\nb) Topping up the proxy account on Turing via reserve transfer SBY');
        const sbyAmount = new BN(1000, 10);
        const sbyAmountBN = sbyAmount.mul(sbyDecimalBN);
        const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(TuringDev.paraId, proxyOnTuring, sbyAmountBN);
        await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);
    }

    console.log('\n3. Create a payload to store in Turing’s task ...');

    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload would be Shibuya’s utility.batch() call to claim staking rewards and stake
    const payload = shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const payloadViaProxy = shibuyaHelper.api.tx.proxy.proxy(shibuyaAddress, 'Any', payload);
    const encodedCallData = payloadViaProxy.method.toHex();
    const payloadViaProxyFees = await payloadViaProxy.paymentInfo(shibuyaAddress);
    const encodedCallWeight = parseInt(payloadViaProxyFees.weight.refTime, 10);
    console.log(`Encoded call data: ${encodedCallData}`);
    console.log(`Encoded call weight: ${encodedCallWeight}`);

    console.log('\n4. Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');

    // Schedule an XCMP task from Turing’s timeAutomation pallet
    // The parameter "Fixed: { executionTimes: [0] }" will trigger the task immediately, while in real world usage Recurring can achieve every day or every week
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Fixed: { executionTimes: [0] } },
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

    console.log('\n5. Execute the above an XCM from Shibuya to schedule a task on Turing ...');
    const feePerSecond = await turingHelper.getFeePerSecond(SHIBUYA_TOKEN_ID_ON_TURING);
    const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
        targetParaId: TuringDev.paraId,
        encodedCall: encodedTaskViaProxy,
        proxyAccount: proxyOnTuring,
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
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
