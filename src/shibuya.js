import { Keyring } from '@polkadot/api';

import turingHelper from './common/turingHelper';
import shibuyaHelper from './common/shibuyaHelper';
import { sendExtrinsic, getDecimalBN } from './common/utils';
import { env, chainConfig } from './common/constants';

const {
    SHIBUYA_ENDPOINT, TURING_ENDPOINT, SHIBUYA_PARA_ID, TURING_PARA_ID,
} = env;

const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const SHIBUYA_INSTRUCTION_WEIGHT = 1000000000;

const main = async () => {
    await turingHelper.initialize(TURING_ENDPOINT);
    await shibuyaHelper.initialize(SHIBUYA_ENDPOINT);

    const keyring = new Keyring();
    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    const turingAddress = keyring.encodeAddress(keyPair.address, chainConfig.turing.ss58);
    const shibuyaAddress = keyring.encodeAddress(keyPair.address, chainConfig.shibuya.ss58);
    console.log(`\nUser Alice’s Turing address: ${turingAddress}, Shibuya address: ${shibuyaAddress}`);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log('\n1. One-time proxy setup on Shibuya');
    const proxyOnShibuya = shibuyaHelper.getProxyAccount(TURING_PARA_ID, shibuyaAddress);

    console.log(`\na) Add a proxy of Turing (paraId:${TURING_PARA_ID}) for Alice on Shibuya ...\n Proxy address: ${proxyOnShibuya}\n`);
    await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnShibuya, 'Any', 0), keyPair);

    console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
    const transferSBY = shibuyaHelper.api.tx.balances.transfer(proxyOnShibuya, '1000000000000000000000');
    await sendExtrinsic(shibuyaHelper.api, transferSBY, keyPair);

    console.log('\n2. One-time proxy setup on Turing');
    const proxyOnTuring = turingHelper.getProxyAccount(SHIBUYA_PARA_ID, turingAddress);

    console.log(`\na) Add a proxy of Shibuya (paraId:${SHIBUYA_PARA_ID}) for Alice on Turing ...\nProxy address: ${proxyOnTuring}\n`);
    await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, 'Any', 0), keyPair);

    console.log('\nb) Topping up the proxy account on Turing with TUR ...\n');
    const transferExtrinsic = turingHelper.api.tx.balances.transfer(proxyOnTuring, '10000000000000');
    await sendExtrinsic(turingHelper.api, transferExtrinsic, keyPair);

    // Reserve transfer SBY to the proxy account on Turing
    console.log('\nc) Topping up the proxy account on Turing via reserve transfer SBY');
    const reserveTransferAssetsExtrinsic = shibuyaHelper.api.tx.polkadotXcm.reserveTransferAssets(
        {
            V1: {
                parents: 1,
                interior: { X1: { Parachain: TURING_PARA_ID } },
            },
        },
        {
            V1: {
                interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyOnTuring } } },
                parents: 0,
            },
        },
        {
            V1: [
                {
                    fun: { Fungible: '9000000000000000000' },
                    id: {
                        Concrete: {
                            interior: { Here: '' },
                            parents: 0,
                        },
                    },
                },
            ],
        },
        0,
    );

    await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);

    console.log('\n3. Create a payload to store in Turing’s task ...');

    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload would be Shibuya’s utility.batch() call to claim staking rewards and stake
    const payload = shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const payloadViaProxy = shibuyaHelper.api.tx.proxy.proxy(shibuyaAddress, 'Any', payload);
    const encodedCallData = payloadViaProxy.method.toHex();
    const payloadViaProxyFees = await payloadViaProxy.paymentInfo(shibuyaAddress);
    const encodedCallWeight = parseInt(payloadViaProxyFees.weight.refTime);
    console.log(`Encoded call data: ${encodedCallData}`);
    console.log(`Encoded call weight: ${encodedCallWeight}`);

    console.log('\n4. Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');

    // Schedule an XCMP task from Turing’s timeAutomation pallet
    // The parameter "Fixed: { executionTimes: [0] }" will trigger the task immediately, while in real world usage Recurring can achieve every day or every week
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Fixed: { executionTimes: [0] } },
        SHIBUYA_PARA_ID,
        0,
        encodedCallData,
        encodedCallWeight,
    );

    const taskViaProxy = turingHelper.api.tx.proxy.proxy(turingAddress, 'Any', taskExtrinsic);
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight);

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

    console.log('\n5. Execute the above an XCM from Shibuya to schedule a task on Turing ...');
    const totalInstructionWeight = 6 * SHIBUYA_INSTRUCTION_WEIGHT;
    const fungible = 6255948005536808;

    const xcmpExtrinsic = shibuyaHelper.api.tx.polkadotXcm.send(
        {
            V1: {
                parents: 1,
                interior: { X1: { Parachain: TURING_PARA_ID } },
            },
        },
        {
            V2: [
                {
                    WithdrawAsset: [
                        {
                            fun: { Fungible: fungible },
                            id: {
                                Concrete: {
                                    interior: { X1: { Parachain: SHIBUYA_PARA_ID } },
                                    parents: 1,
                                },
                            },
                        },
                    ],
                },
                {
                    BuyExecution: {
                        fees: {
                            fun: { Fungible: fungible },
                            id: {
                                Concrete: {
                                    interior: { X1: { Parachain: SHIBUYA_PARA_ID } },
                                    parents: 1,
                                },
                            },
                        },
                        weightLimit: { Limited: requireWeightAtMost + totalInstructionWeight },
                    },
                },
                {
                    Transact: {
                        originType: 'SovereignAccount',
                        requireWeightAtMost,
                        call: { encoded: encodedTaskViaProxy },
                    },
                },
                {
                    RefundSurplus: '',
                },
                {
                    DepositAsset: {
                        assets: { Wild: 'All' },
                        maxAssets: 1,
                        beneficiary: {
                            parents: 1,
                            interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyOnTuring } } },
                        },
                    },
                },
            ],
        },
    );

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
