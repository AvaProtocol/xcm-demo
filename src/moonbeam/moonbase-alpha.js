import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import { u8aToHex } from '@polkadot/util';

import Account from '../common/account';
import { TuringMoonbaseAlpha, MoonbaseAlpha } from '../config';
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

// const keyring = new Keyring({ type: 'sr25519' });

const sendXcmFromMoonbase = async ({
    turingHelper, parachainHelper, turingAddress,
    paraTokenIdOnTuring, keyPair,
}) => {
    console.log('\na). Create a payload to store in Turing’s task ...');
    const secondsInHour = 3600;
    const millisecondsInHour = 3600 * 1000;
    const currentTimestamp = moment().valueOf();
    const nextExecutionTime = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
    const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
    const taskExtrinsic = turingHelper.api.tx.automationTime.scheduleDynamicDispatchTask(
        providedId,
        {
            Fixed: {
                executionTimes: [nextExecutionTime],
            },
        },
        turingHelper.api.tx.system.remarkWithEvent('Hello!!!'),
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
    const turingHelper = new TuringHelper(TuringMoonbaseAlpha);
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

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    console.log(`\n3. Execute an XCM from ${parachainName} to ${turingChainName} ...`);

    await sendXcmFromMoonbase({
        turingHelper, parachainHelper: moonbaseHelper, turingAddress, parachainAddress, paraTokenIdOnTuring, keyPair: parachainKeyPair, proxyAccountId,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
