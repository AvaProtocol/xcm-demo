import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import { u8aToHex } from '@polkadot/util';

import Account from '../common/account';
import { TuringMoonbase, MoonbaseAlpha } from '../config';
import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import {
    sendExtrinsic, readEthMnemonicFromFile, readMnemonicFromFile,
    // listenEvents, calculateTimeout,
} from '../common/utils';

// TODO: read this instruction value from Turing Staging
// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
const TURING_INSTRUCTION_WEIGHT = 1000000000;
// const MIN_BALANCE_IN_PROXY = 0.1 * 1e18; // The proxy accounts are to be topped up if its balance fails below this number
// const TASK_FREQUENCY = 3600;

const WEIGHT_PER_SECOND = 1000000000000;

const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

// const keyring = new Keyring({ type: 'sr25519' });

const callContractFromTuring = async ({
    turingHelper, parachainHelper, parachainAddress, keyPair,
}) => {
    console.log('\na). Create an ethereumXcm.transactThroughProxy extrinsic on Moonbase ...');
    const parachainProxyCall = parachainHelper.api.tx.ethereumXcm.transactThroughProxy(
        parachainAddress,
        {
            V2: {
                gasLimit: 71000,
                action: { Call: CONTRACT_ADDRESS },
                value: 0,
                input: CONTRACT_INPUT,
            },
        },
    );

    console.log(`\nb) Execute the above an XCM from ${turingHelper.config.name} to ${parachainHelper.config.name} ...`);
    const xcmCall = turingHelper.api.tx.polkadotXcm.send(
        {
            V1: {
                parents: 1,
                interior: {
                    X1: { Parachain: parachainHelper.config.paraId },
                },
            },
        },
        {
            V2: [
                {
                    WithdrawAsset: [
                        {
                            id: {
                                Concrete: {
                                    parents: 0,
                                    interior: { X1: { PalletInstance: 3 } },
                                },
                            },
                            fun: { Fungible: new BN('100000000000000000') },
                        },
                    ],
                },
                {
                    BuyExecution: {
                        fees: {
                            id: {
                                Concrete: {
                                    parents: 0,
                                    interior: { X1: { PalletInstance: 3 } },
                                },
                            },
                            fun: { Fungible: new BN('100000000000000000') },
                        },
                        weightLimit: 'Unlimited',
                    },
                },
                {
                    Transact: {
                        originType: 'SovereignAccount',
                        requireWeightAtMost: new BN('4000000000'),
                        call: { encoded: parachainProxyCall.method.toHex() },
                    },
                },
            ],
        },
    );

    console.log('xcmCall: ', xcmCall.method.toHex());

    await sendExtrinsic(turingHelper.api, xcmCall, keyPair);
};

const sendXcmFromMoonbase = async ({
    turingHelper, parachainHelper, turingAddress,
    paraTokenIdOnTuring, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');
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

    const secondsInHour = 3600;
    const millisecondsInHour = 3600 * 1000;
    const currentTimestamp = moment().valueOf();
    const timestampNextHour = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
    const timestampTwoHoursLater = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + (secondsInHour * 2);
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
        providedId,
        { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
        parachainHelper.config.paraId,
        0,
        parachainProxyCall.method.toHex(),
        '4000000000',
    );
    console.log(`Task extrinsic encoded call data: ${taskExtrinsic.method.toHex()}`);
    // const taskExtrinsic = turingHelper.api.tx.system.remarkWithEvent('Hello!!!');

    const taskViaProxy = turingHelper.api.tx.proxy.proxy(turingAddress, 'Any', taskExtrinsic);
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
    const requireWeightAtMost = parseInt(taskViaProxyFees.weight, 10);

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

    console.log(`\nb) Execute the above an XCM from ${parachainHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
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
                interior: {
                    X1: { Parachain: 2114 },
                },
            },
        },
        {
            currency: {
                AsCurrencyId: 'SelfReserve',
            },
            feeAmount: fungible,
        },
        encodedTaskViaProxy,
        { transactRequiredWeightAtMost, overallWeight },
    );

    console.log(`transactExtrinsic Encoded call data: ${transactExtrinsic.method.toHex()}`);

    await sendExtrinsic(parachainHelper.api, transactExtrinsic, keyPair);
};

const main = async () => {
    const turingHelper = new TuringHelper(TuringMoonbase);
    await turingHelper.initialize();

    const moonbaseHelper = new MoonbaseHelper(MoonbaseAlpha);
    await moonbaseHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = moonbaseHelper.config.key;

    console.log(`\n1. Setup accounts on ${turingChainName} and ${parachainName}`);
    // Refer to the following article to export seed-eth.json
    // https://docs.moonbeam.network/tokens/connect/polkadotjs/
    const jsonEth = await readEthMnemonicFromFile();
    const parachainKeyring = new Keyring({ type: 'ethereum' });
    const parachainKeyPair = parachainKeyring.addFromJson(jsonEth);
    parachainKeyPair.unlock(process.env.PASS_PHRASE_ETH);
    console.log('Parachain address: ', parachainKeyPair.address);

    const { data: balance } = await moonbaseHelper.api.query.system.account(parachainKeyPair.address);
    console.log(`Parachain balance: ${balance.free}`);

    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);
    const account = new Account(keyPair);
    await account.init([turingHelper]);
    account.print();

    const parachainPalletInstance = 3;
    const paraTokenIdOnTuring = (await turingHelper.api.query.assetRegistry.locationToAssetId({ parents: 1, interior: { X2: [{ Parachain: moonbaseHelper.config.paraId }, { PalletInstance: parachainPalletInstance }] } }))
        .unwrapOrDefault()
        .toNumber();
    console.log('paraTokenIdOnTuring: ', paraTokenIdOnTuring);

    const turingAddress = account.getChainByName(turingChainName)?.address;
    const proxyOnTuring = turingHelper.getProxyAccount(parachainKeyPair.address, moonbaseHelper.config.paraId, { addressType: 'Ethereum' });
    console.log('proxyOnTuring: ', proxyOnTuring);
    const proxyAccountId = keyring.decodeAddress(proxyOnTuring);
    const parachainAddress = parachainKeyPair.address;
    // console.log('moonbaseKeyPair.publicKey: ', u8aToHex(moonbaseKeyPair.publicKey));

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });
    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer DEV to the proxy account on Turing
    console.log('\nb) Reserve transfer DEV to the proxy account on Turing: ');
    const paraTokenbalanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);
    const minBalanceOnTuring = new BN('1000000000000000000'); // 1 DEV
    console.log('minBalanceOnTuring: ', minBalanceOnTuring);
    console.log('paraTokenbalanceOnTuring.free: ', paraTokenbalanceOnTuring.free.toString());

    // We have to transfer some more tokens because the execution fee will be deducted.
    const transferAmount = minBalanceOnTuring.mul(new BN(2));

    if (paraTokenbalanceOnTuring.free.lt(minBalanceOnTuring)) {
        // Transfer DEV from Moonbase to Turing
        console.log('Transfer DEV from Moonbase to Turing');
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
                        Fungible: new BN(transferAmount),
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

        console.log('Resevered transfer call data: ', extrinsic.method.toHex());
        await sendExtrinsic(moonbaseHelper.api, extrinsic, parachainKeyPair);
    } else {
        console.log(`\nb) Proxy’s parachain token balance is ${`${paraTokenbalanceOnTuring.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log('\n3. One-time proxy setup on Moonbase');
    console.log(`\na) Add a proxy for Alice If there is none setup on Moonbase (paraId:${moonbaseHelper.config.paraId})\n`);
    const proxyOnMoonbase = moonbaseHelper.getProxyAccount(turingAddress, turingHelper.config.paraId);
    console.log(`parachainAddress: ${parachainAddress}, proxyOnMoonbase: ${proxyOnMoonbase}`);
    const proxyTypeMoonbase = 'Any';
    const proxiesOnMoonbase = await moonbaseHelper.getProxies(parachainKeyPair.address);
    console.log('proxiesOnMoonbase: ', proxiesOnMoonbase);

    const proxyMatchMoonbase = _.find(proxiesOnMoonbase, ({ delegate, proxyType }) => _.lowerCase(delegate) === _.lowerCase(proxyOnMoonbase) && proxyType === proxyTypeMoonbase);

    if (proxyMatchMoonbase) {
        console.log(`Proxy address ${proxyOnMoonbase} for paraId: ${moonbaseHelper.config.paraId} and proxyType: ${proxyTypeMoonbase} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${moonbaseHelper.config.paraId}) and proxyType: ${proxyTypeMoonbase} on Turing ...\n Proxy address: ${proxyOnMoonbase}\n`);
        await sendExtrinsic(moonbaseHelper.api, moonbaseHelper.api.tx.proxy.addProxy(proxyOnMoonbase, proxyTypeMoonbase, 0), parachainKeyPair);
    }

    console.log('\nb) Topping up the proxy account on Moonbase with DEV ...\n');
    const minBalanceOnMoonbaseProxy = new BN('500000000000000000');
    const { data: moonbaseProxyBalance } = await moonbaseHelper.api.query.system.account(proxyOnMoonbase);
    if (moonbaseProxyBalance.free.lt(minBalanceOnMoonbaseProxy)) {
        const topUpExtrinsic = moonbaseHelper.api.tx.balances.transfer(proxyOnMoonbase, minBalanceOnMoonbaseProxy.mul(new BN(2)));
        await sendExtrinsic(moonbaseHelper.api, topUpExtrinsic, parachainKeyPair);
    } else {
        console.log(`\nMoonbase proxy account balance is ${`${moonbaseProxyBalance.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    // console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    // console.log(`\n4. Execute an XCM from ${parachainName} to ${turingChainName} ...`);

    // await sendXcmFromMoonbase({
    //     turingHelper, parachainHelper: moonbaseHelper, turingAddress, parachainAddress, paraTokenIdOnTuring, keyPair: parachainKeyPair, proxyAccountId,
    // });

    console.log(`\n4. Execute an XCM from  ${turingChainName} to ${parachainName} ...`);

    await callContractFromTuring({
        turingHelper,
        parachainHelper: moonbaseHelper,
        parachainAddress: parachainKeyPair.address,
        keyPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
