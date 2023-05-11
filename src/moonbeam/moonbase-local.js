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
    sendExtrinsic, getDecimalBN, bnToFloat,
    // listenEvents, calculateTimeout,
} from '../common/utils';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
const TASK_FREQUENCY = 3600;

const CONTRACT_ADDRESS = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const CONTRACT_INPUT = '0xd09de08a';

const WEIGHT_PER_SECOND = 1000000000000;

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
            V2:
            {
                parents: 1,
                interior:
                { X2: [{ Parachain: parachainHelper.config.paraId }, { PalletInstance: 3 }] },
            },
        },
        parachainProxyCall.method.toHex(),
        {
            refTime: '4000000000',
            proofSize: 0,
        },
        turingAddress,
    );
    console.log(`Task extrinsic encoded call data: ${taskViaProxy.method.toHex()}`);

    // const taskExtrinsic = turingHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight.refTime, 10);

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
            V2: {
                parents: 1,
                interior: { X1: { Parachain: 2114 } },
            },
        },
        {
            currency: { AsCurrencyId: 'SelfReserve' },
            feeAmount: fungible,
        },
        encodedTaskViaProxy,
        {
            transactRequiredWeightAtMost: {
                refTime: transactRequiredWeightAtMost,
                proofSize: 0,
            },
            overallWeight: {
                refTime: overallWeight,
                proofSize: 0,
            },
        },
    );

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
                V2: {
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
                V2: {
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

    await sendXcmFromMoonbase({
        turingHelper,
        parachainHelper: moonbaseHelper,
        turingAddress,
        turingAddressETH,
        paraTokenIdOnTuring,
        keyPair: aliceKeyPair,
        proxyAccountId,
    });

    // TODO: need to add event verification of the ethereum execution
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
