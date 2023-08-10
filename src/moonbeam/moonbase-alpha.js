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
    sendExtrinsic, readEthMnemonicFromFile, readMnemonicFromFile, listenEvents, getTaskIdInTaskScheduledEvent,
    // listenEvents, calculateTimeout,
} from '../common/utils';

const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

const sendXcmFromMoonbase = async ({
    turingHelper, parachainHelper, turingAddress, keyPair,
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

    const payloadExtrinsicWeight = (await parachainProxyCall.paymentInfo(keyPair.address)).weight;
    const payloadOverallWeight = parachainHelper.calculateXcmTransactOverallWeight(payloadExtrinsicWeight);
    const payloadXcmpFee = parachainHelper.weightToFee(payloadOverallWeight, 'DEV');

    const taskViaProxy = turingHelper.api.tx.automationTime.scheduleXcmpTaskThroughProxy(
        { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
        { V3: { parents: 1, interior: { X1: { Parachain: parachainHelper.config.paraId } } } },
        { V3: { parents: 1, interior: { X2: [{ Parachain: parachainHelper.config.paraId }, { PalletInstance: 3 }] } } },
        { asset_location: { V3: { parents: 1, interior: { X2: [{ Parachain: parachainHelper.config.paraId }, { PalletInstance: 3 }] } } }, amount: payloadXcmpFee },
        parachainProxyCall.method.toHex(),
        payloadExtrinsicWeight,
        payloadOverallWeight,
        turingAddress,
    );
    console.log(`Task extrinsic encoded call data: ${taskViaProxy.method.toHex()}`);

    // const taskExtrinsic = turingHelper.api.tx.system.remarkWithEvent('Hello!!!');
    const encodedTaskViaProxy = taskViaProxy.method.toHex();
    const { weight: taskViaProxyCallWeight } = await taskViaProxy.paymentInfo(turingAddress);

    console.log(`Encoded call data: ${encodedTaskViaProxy}`);
    console.log(`taskViaProxyCallWeight.weight: { refTime: ${taskViaProxyCallWeight.refTime.toString()}, proofSize: ${taskViaProxyCallWeight.proofSize.toString()} }`);

    console.log(`\nb) Execute the above an XCM from ${parachainHelper.config.name} to schedule a task on ${turingHelper.config.name} ...`);
    const overallWeight = turingHelper.calculateXcmTransactOverallWeight(taskViaProxyCallWeight);
    const fungible = turingHelper.weightToFee(overallWeight, 'DEV');
    console.log('overallWeight: ', overallWeight);
    console.log('fungible: ', fungible.toString());

    const transactExtrinsic = parachainHelper.api.tx.xcmTransactor.transactThroughSigned(
        {
            V3: {
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
        {
            transactRequiredWeightAtMost: taskViaProxyCallWeight,
            overallWeight,
        },
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
                        Fungible: new BN(transferAmount),
                    },
                },
            },
            {
                V3: {
                    parents: 1,
                    interior: {
                        X2: [
                            { Parachain: turingHelper.config.paraId },
                            { AccountId32: { network: null, id: u8aToHex(proxyAccountId) } },
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

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    console.log(`\n4. Execute an XCM from ${parachainName} to ${turingChainName} ...`);

    await sendXcmFromMoonbase({
        turingHelper, parachainHelper: moonbaseHelper, turingAddress, parachainAddress, keyPair: parachainKeyPair, proxyAccountId,
    });

    // Listen TaskScheduled event on Turing chain
    console.log('Listening to TaskScheduled event on Turing chain ...');
    const taskScheduledEvent = await listenEvents(turingHelper.api, 'automationTime', 'TaskScheduled', 60000);
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
