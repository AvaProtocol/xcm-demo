import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import { hexToU8a, u8aToHex } from '@polkadot/util';

import Account from '../common/account';
import { TuringDev, MoonbaseLocal } from '../config';
import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import {
    sendExtrinsic, getDecimalBN, listenEvents, getHourlyTimestamp, getTaskIdInTaskScheduledEvent,
    // listenEvents, calculateTimeout,
} from '../common/utils';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.

const CONTRACT_ADDRESS = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const CONTRACT_INPUT = '0xd09de08a';

const keyring = new Keyring({ type: 'sr25519' });

// Alith is the default sodo wallet on Moonbase Local
const MoonbaseAlith = {
    name: 'Alith',
    privateKey: '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
};

// Alice is the default sodo wallet on Turing Dev
const TuringAlice = {
    name: 'Alice',
    privateKey: '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a',
};

const createEthereumXcmTransactThroughProxyExtrinsic = (parachainHelper, transactAs) => {
    const extrinsic = parachainHelper.api.tx.ethereumXcm.transactThroughProxy(
        transactAs,
        {
            V2: {
                gasLimit: 71000,
                action: { Call: CONTRACT_ADDRESS },
                value: 0,
                input: CONTRACT_INPUT,
            },
        },
    );
    return extrinsic;
};

const createAutomationTaskExtrinsic = ({
    turingHelper, schedule, parachainId, scheduleFee, payloadExtrinsic, payloadExtrinsicWeight, overallWeight, fee, scheduleAs,
}) => {
    const extrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTaskThroughProxy(
        schedule,
        { V3: { parents: 1, interior: { X1: { Parachain: parachainId } } } },
        scheduleFee,
        { asset_location: { V3: { parents: 1, interior: { X2: [{ Parachain: parachainId }, { PalletInstance: 3 }] } } }, amount: fee },
        payloadExtrinsic.method.toHex(),
        payloadExtrinsicWeight,
        overallWeight,
        scheduleAs,
    );

    console.log(`Task extrinsic encoded call data: ${extrinsic.method.toHex()}`);
    return extrinsic;
};

const scheduleTaskFromMoonbase = async ({
    turingHelper, parachainHelper, taskExtrinsic, taskExtrinsicPaymentInfo, keyPair,
}) => {
    const encodedTaskExtrinsic = taskExtrinsic.method.toHex();
    const transactCallWeight = taskExtrinsicPaymentInfo.weight;

    console.log(`Proxy task extrinsic encoded call data: ${encodedTaskExtrinsic}`);
    console.log('transactCallWeight: ', transactCallWeight.toHuman());

    const overallWeight = turingHelper.calculateXcmTransactOverallWeight(transactCallWeight);
    const fee = turingHelper.weightToFee(overallWeight, 'DEV');

    console.log(`\nExecute the above an XCM from ${parachainHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);

    const transactExtrinsic = await parachainHelper.createTransactExtrinsic({
        targetParaId: turingHelper.config.paraId,
        encodedCall: encodedTaskExtrinsic,
        callWeight: transactCallWeight,
        overallWeight,
        fee,
    });

    console.log(`transactExtrinsic Encoded call data: ${transactExtrinsic.method.toHex()}`);

    await sendExtrinsic(parachainHelper.api, transactExtrinsic, keyPair);
};

const main = async () => {
    const turingHelper = new TuringHelper(TuringDev);
    await turingHelper.initialize();

    const moonbaseHelper = new MoonbaseHelper(MoonbaseLocal);
    await moonbaseHelper.initialize();

    const turingChainName = turingHelper.config.name;
    const parachainName = moonbaseHelper.config.name;
    const parachainToken = _.first(moonbaseHelper.config.assets);
    const decimalBN = getDecimalBN(parachainToken.decimals);

    console.log(`\n1. Setup accounts on ${parachainName} and ${turingChainName}`);

    const alithKeyPair = keyring.addFromSeed(hexToU8a(MoonbaseAlith.privateKey), undefined, 'ethereum');
    const aliceKeyPair = keyring.addFromSeed(hexToU8a(TuringAlice.privateKey), undefined, 'ethereum');

    console.log(`Reading token and balance of Alice account on ${turingChainName} ...`);
    const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyPair.meta.name = 'Alice';

    // TODO: Account should contain Address32, Address20 and its proxy address
    const account = new Account(keyPair);
    await account.init([turingHelper]);
    account.print();

    const turingAddress = account.getChainByName(turingHelper.config.key)?.address;
    const turingAddressETH = aliceKeyPair.address;
    console.log('Turing wallet’s Ethereum address:', turingAddressETH);

    const topUpAmount = (new BN(1000000).mul(decimalBN)).toString();

    // TODO: add balance check and skip this transfer if balance is not lower than topUpAmount
    console.log(`\nTransfer ${parachainToken.symbol} from Alith to Alice on ${parachainName}, if Alice’s balance is low. `);
    await sendExtrinsic(
        moonbaseHelper.api,
        moonbaseHelper.api.tx.balances.transfer(aliceKeyPair.address, topUpAmount),
        alithKeyPair,
    );

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyOnTuring = turingHelper.getProxyAccount(aliceKeyPair.address, moonbaseHelper.config.paraId, { addressType: 'Ethereum' });
    const proxyAccountId = keyring.decodeAddress(proxyOnTuring);

    const proxyTypeTuring = 'Any';
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy for ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\nProxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer DEV to the proxy account on Turing
    console.log(`\nb) Reserve transfer ${parachainToken.symbol} to the proxy account on Turing ...`);
    const minBalanceOnTuring = new BN(100).mul(decimalBN);

    // TODO: 1. the location of Moonbase token should be defined in src/config/moonbase-local
    //      2. wrap this locationToAssetId call to turingHelper.locationToAssetId(location)
    const paraTokenIdOnTuring = (await turingHelper.api.query.assetRegistry.locationToAssetId({ parents: 1, interior: { X2: [{ Parachain: moonbaseHelper.config.paraId }, { PalletInstance: 3 }] } }))
        .unwrapOrDefault()
        .toNumber();

    const proxyOnTuringBalance = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);

    // Transfer DEV from Moonbase to Turing
    const topUpAmountToTuring = (new BN(1000).mul(decimalBN)).toString();
    if (proxyOnTuringBalance.free.lt(minBalanceOnTuring)) {
        console.log('\nTransfer DEV from Moonbase to Turing');
        const extrinsic = moonbaseHelper.api.tx.xTokens.transferMultiasset(
            {
                V3: {
                    id: {
                        Concrete: {
                            parents: 0,
                            interior: {
                                X1: { PalletInstance: 3 },
                            },
                        },
                    },
                    fun: {
                        Fungible: topUpAmountToTuring,
                    },
                },
            },
            {
                V3: {
                    parents: 1,
                    interior: {
                        X2: [
                            {
                                Parachain: turingHelper.config.paraId,
                            },
                            {
                                AccountId32: {
                                    network: null,
                                    id: u8aToHex(proxyAccountId),
                                },
                            },
                        ],
                    },
                },
            },
            'Unlimited',
        );
        await sendExtrinsic(moonbaseHelper.api, extrinsic, aliceKeyPair);
    } else {
        const freeBalanceOnTuring = (new BN(proxyOnTuringBalance.free)).div(decimalBN);
        console.log(`Proxy’s balance is ${freeBalanceOnTuring.toString()}, no need to top it up with reserve transfer ...`);
    }

    console.log('\n3. One-time proxy setup on Moonbase');
    console.log(`\na) Add a proxy for Alice If there is none setup on Moonbase (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyOnMoonbase = moonbaseHelper.getProxyAccount(turingAddress, turingHelper.config.paraId);
    console.log('proxyOnMoonbase: ', proxyOnMoonbase);
    const proxyTypeMoonbase = 'Any';
    const proxiesOnMoonbase = await moonbaseHelper.getProxies(aliceKeyPair.address);
    const proxyMatchMoonbase = _.find(proxiesOnMoonbase, { delegate: proxyOnMoonbase, proxyType: proxyTypeMoonbase });

    if (proxyMatchMoonbase) {
        console.log(`Proxy address ${proxyOnMoonbase} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeMoonbase} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeMoonbase} on Turing ...\nProxy address: ${proxyOnMoonbase}\n`);
        await sendExtrinsic(moonbaseHelper.api, moonbaseHelper.api.tx.proxy.addProxy(proxyOnMoonbase, proxyTypeMoonbase, 0), aliceKeyPair);
    }

    console.log(`\nb) Topping up the proxy account on ${parachainName} with ${parachainToken.symbol} ...\n`);
    const topUpAmountToProxy = (new BN(1000).mul(decimalBN)).toString();
    const topUpExtrinsic = moonbaseHelper.api.tx.balances.transfer(proxyOnMoonbase, topUpAmountToProxy);
    await sendExtrinsic(moonbaseHelper.api, topUpExtrinsic, aliceKeyPair);

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${turingAddressETH}`);

    console.log(`\n4. Execute an XCM from ${parachainName} to ${turingChainName} ...`);

    console.log('\na). Create a payload extrinsic to store in Turing’s task ...');
    const payloadExtrinsic = createEthereumXcmTransactThroughProxyExtrinsic(moonbaseHelper, aliceKeyPair.address);

    console.log('\nb). Create an automation time task with the payload extrinsic ...');
    const timestampNextHour = getHourlyTimestamp(1);

    const payloadExtrinsicWeight = (await payloadExtrinsic.paymentInfo(aliceKeyPair.address)).weight;
    const overallWeight = moonbaseHelper.calculateXcmTransactOverallWeight(payloadExtrinsicWeight);
    const fee = moonbaseHelper.weightToFee(overallWeight, 'UNIT');

    const taskExtrinsic = createAutomationTaskExtrinsic({
        turingHelper,
        schedule: { Fixed: { executionTimes: [0] } },
        parachainId: moonbaseHelper.config.paraId,
        scheduleFee: { V3: { parents: 1, interior: { X2: [{ Parachain: moonbaseHelper.config.paraId }, { PalletInstance: 3 }] } } },
        payloadExtrinsic,
        payloadExtrinsicWeight,
        overallWeight,
        fee,
        scheduleAs: turingAddress,
    });

    console.log('\nc). Schedule the task from moonbase ...');
    const feePerSecond = await turingHelper.getFeePerSecond(paraTokenIdOnTuring);
    const taskExtrinsicPaymentInfo = await taskExtrinsic.paymentInfo(turingAddress);
    await scheduleTaskFromMoonbase({
        turingHelper,
        parachainHelper: moonbaseHelper,
        taskExtrinsic,
        taskExtrinsicPaymentInfo,
        feePerSecond,
        keyPair: aliceKeyPair,
    });

    // Listen TaskScheduled event on Turing chain
    const taskScheduledEvent = await listenEvents(turingHelper.api, 'automationTime', 'TaskScheduled', 60000);
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log('TaskId:', taskId);

    // Listen XCM events on Moonbase side
    const additionalWaitingTime = 5 * 60 * 1000;
    console.log(`\n5. Keep Listening XCM events on ${parachainName} until ${moment(timestampNextHour).format('YYYY-MM-DD HH:mm:ss')}(${timestampNextHour}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
    const timeout = timestampNextHour - moment().valueOf() + additionalWaitingTime;
    const isTaskExecuted = await listenEvents(moonbaseHelper.api, 'ethereum', 'Executed', timeout);
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
