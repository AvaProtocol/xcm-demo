import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import { hexToU8a, u8aToHex } from '@polkadot/util';

import Account from '../common/account';
import { TuringDev, MoonbaseDev } from '../config';
import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import {
    sendExtrinsic, getDecimalBN,
    // listenEvents, calculateTimeout,
} from '../common/utils';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const TASK_FREQUENCY = 3600;

const CONTRACT_ADDRESS = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const CONTRACT_INPUT = '0xd09de08a';

const WEIGHT_PER_SECOND = 1000000000000;

const keyring = new Keyring({ type: 'sr25519' });

const sendXcmFromMoonbase = async ({
    turingHelper, parachainHelper, turingAddress,
    paraTokenIdOnTuring, keyPair,
}) => {
    console.log('\na). Create an ethereumXcm.transactThroughProxy extrinsic ...');
    const parachainProxyCall = parachainHelper.api.tx.ethereumXcm.transactThroughProxy(
        keyPair.address,
        {
            V2: {
                gasLimit: 71000,
                action: { Call: CONTRACT_ADDRESS },
                value: 0,
                input: CONTRACT_INPUT,
            },
        },
    );
    // const parachainProxyCallFees = await parachainProxyCall.paymentInfo(keyPair.address);

    console.log('\nb). Create a payload to store in Turing’s task ...');
    const secondsInHour = 3600;
    const millisecondsInHour = 3600 * 1000;
    const currentTimestamp = moment().valueOf();
    const timestampNextHour = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
    // const timestampTwoHoursLater = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + (secondsInHour * 2);
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const taskViaProxy = turingHelper.api.tx.automationTime.scheduleXcmpTaskThroughProxy(
        providedId,
        // { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
        { Fixed: { executionTimes: [0] } },
        // { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime: timestampNextHour } },
        parachainHelper.config.paraId,
        5,
        {
            V1:
            {
                parents: 1,
                interior:
                { X2: [{ Parachain: parachainHelper.config.paraId }, { PalletInstance: 3 }] },
            },
        },
        parachainProxyCall.method.toHex(),
        '4000000000',
        turingAddress,
    );
    console.log(`Task extrinsic encoded call data: ${taskViaProxy.method.toHex()}`);

    // const taskExtrinsic = turingHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight, 10);

    console.log(`Proxy task extrinsic encoded call data: ${encodedTaskViaProxy}`);
    console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

    console.log(`\nc) Execute the above an XCM from ${parachainHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
    const feePerSecond = await turingHelper.getFeePerSecond(paraTokenIdOnTuring);

    const instructionCount = 4;
    const totalInstructionWeight = instructionCount * TURING_INSTRUCTION_WEIGHT;
    const weightLimit = requireWeightAtMost + totalInstructionWeight;
    const fungible = new BN(weightLimit).mul(feePerSecond).div(new BN(WEIGHT_PER_SECOND)).mul(new BN(10));
    const transactRequiredWeightAtMost = requireWeightAtMost + TURING_INSTRUCTION_WEIGHT;
    // const overallWeight = (instructionCount - 1) * TURING_INSTRUCTION_WEIGHT;
    const overallWeight = 8170208000;
    console.log('transactRequiredWeightAtMost: ', transactRequiredWeightAtMost);
    console.log('overallWeight: ', overallWeight);
    console.log('fungible: ', fungible.toString());

    const transactExtrinsic = parachainHelper.api.tx.xcmTransactor.transactThroughSigned(
        {
            V1: {
                parents: 1,
                interior: { X1: { Parachain: 2114 } },
            },
        },
        {
            currency: { AsCurrencyId: 'SelfReserve' },
            feeAmount: fungible,
        },
        encodedTaskViaProxy,
        { transactRequiredWeightAtMost, overallWeight },
    );

    console.log(`transactExtrinsic Encoded call data: ${transactExtrinsic.method.toHex()}`);

    await sendExtrinsic(parachainHelper.api, transactExtrinsic, keyPair);
};

const main = async () => {
    const turingHelper = new TuringHelper(TuringDev);
    await turingHelper.initialize();

    const moonbaseHelper = new MoonbaseHelper(MoonbaseDev);
    await moonbaseHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = moonbaseHelper.config.key;

    console.log('\n1. Setup accounts on Moonbase and Turing');
    const AlithAccount = {
        name: 'Alith',
        privateKey: '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
    };

    const alithKeyPair = keyring.addFromSeed(hexToU8a(AlithAccount.privateKey), undefined, 'ethereum');

    const accountName = 'Alice';
    const parachainAccount = {
        name: accountName,
        privateKey: '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a',
    };
    const moonbaseKeyPair = keyring.addFromSeed(hexToU8a(parachainAccount.privateKey), undefined, 'ethereum');

    const keyPair = keyring.addFromUri(`//${accountName}`, undefined, 'sr25519');
    const account = new Account(keyPair);
    account.name = accountName;

    await account.init([turingHelper]);
    account.print();

    const turingAddress = account.getChainByName(turingChainName)?.address;
    const proxyOnTuring = turingHelper.getProxyAccount(moonbaseKeyPair.address, moonbaseHelper.config.paraId, { addressType: 'Ethereum' });
    console.log('proxyOnTuring: ', proxyOnTuring);
    const proxyAccountId = keyring.decodeAddress(proxyOnTuring);

    console.log('\nTransfer balance from Alith to Alice.');
    await sendExtrinsic(
        moonbaseHelper.api,
        moonbaseHelper.api.tx.balances.transfer(moonbaseKeyPair.address, '2000000000000000000000'),
        alithKeyPair,
    );

    const parachainAddress = moonbaseKeyPair.address;
    console.log('moonbaseKeyPair.publicKey: ', u8aToHex(moonbaseKeyPair.publicKey));

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });

    const paraTokenIdOnTuring = (await turingHelper.api.query.assetRegistry.locationToAssetId({ parents: 1, interior: { X2: [{ Parachain: moonbaseHelper.config.paraId }, { PalletInstance: 3 }] } }))
        .unwrapOrDefault()
        .toNumber();

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    const parachainTokenDecimals = 18;
    const decimalBN = getDecimalBN(parachainTokenDecimals);

    // Reserve transfer DEV to the proxy account on Turing
    console.log('\nb) Reserve transfer DEV to the proxy account on Turing ...');
    const minBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    console.log('paraTokenIdOnTuring: ', paraTokenIdOnTuring);
    const paraTokenbalanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);
    console.log('paraTokenbalanceOnTuring.free: ', paraTokenbalanceOnTuring.free.toString());

    if (paraTokenbalanceOnTuring.free.lt(minBalanceOnTuring)) {
        // Transfer DEV from Moonbase to Turing
        console.log('\nTransfer DEV from Moonbase to Turing');
        const extrinsic = moonbaseHelper.api.tx.xTokens.transferMultiasset(
            {
                V1: {
                    id: {
                        Concrete: {
                            parents: 0,
                            interior: {
                                X1: { PalletInstance: 3 },
                            },
                        },
                    },
                    fun: {
                        Fungible: '1000000000000000000000',
                    },
                },
            },
            {
                V1: {
                    parents: 1,
                    interior: {
                        X2: [
                            {
                                Parachain: turingHelper.config.paraId,
                            },
                            {
                                AccountId32: {
                                    network: 'Any',
                                    id: u8aToHex(proxyAccountId),
                                },
                            },
                        ],
                    },
                },
            },
            'Unlimited',
        );
        await sendExtrinsic(moonbaseHelper.api, extrinsic, moonbaseKeyPair);
    } else {
        const freeBalanceOnTuring = (new BN(paraTokenbalanceOnTuring.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeBalanceOnTuring.toString()}, no need to top it up with reserve transfer ...`);
    }

    console.log('\n3. One-time proxy setup on Moonbase');
    console.log(`\na) Add a proxy for Alice If there is none setup on Moonbase (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyOnMoonbase = moonbaseHelper.getProxyAccount(turingAddress, turingHelper.config.paraId);
    console.log('proxyOnMoonbase: ', proxyOnMoonbase);
    const proxyTypeMoonbase = 'Any';
    const proxiesOnMoonbase = await moonbaseHelper.getProxies(moonbaseKeyPair.address);
    const proxyMatchMoonbase = _.find(proxiesOnMoonbase, { delegate: proxyOnMoonbase, proxyType: proxyTypeMoonbase });

    if (proxyMatchMoonbase) {
        console.log(`Proxy address ${proxyOnMoonbase} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeMoonbase} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeMoonbase} on Turing ...\n Proxy address: ${proxyOnMoonbase}\n`);
        await sendExtrinsic(moonbaseHelper.api, moonbaseHelper.api.tx.proxy.addProxy(proxyOnMoonbase, proxyTypeMoonbase, 0), moonbaseKeyPair);
    }

    console.log('\nb) Topping up the proxy account on Moonbase with DEV ...\n');
    const topUpExtrinsic = moonbaseHelper.api.tx.balances.transfer(proxyOnMoonbase, new BN('100000000000000000000'));
    await sendExtrinsic(moonbaseHelper.api, topUpExtrinsic, moonbaseKeyPair);

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    console.log(`\n4. Execute an XCM from ${parachainName} to ${turingChainName} ...`);

    await sendXcmFromMoonbase({
        turingHelper,
        parachainHelper: moonbaseHelper,
        turingAddress,
        parachainAddress,
        paraTokenIdOnTuring,
        keyPair: moonbaseKeyPair,
        proxyAccountId,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
