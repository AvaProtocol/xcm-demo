import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import { u8aToHex } from '@polkadot/util';
import { OakAdapter, MoonbeamAdapter } from '@oak-network/adapter';
import { chains } from '@oak-network/config';
import { Sdk } from '@oak-network/sdk';
import {
    sendExtrinsic, readEthMnemonicFromFile, readMnemonicFromFile, listenEvents, getTaskIdInTaskScheduledEvent, getHourlyTimestamp, waitPromises,
} from '../common/utils';

const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

const main = async () => {
    const jsonEth = await readEthMnemonicFromFile();
    const parachainKeyring = new Keyring({ type: 'ethereum' });
    const parachainKeyPair = parachainKeyring.addFromJson(jsonEth);
    parachainKeyPair.unlock(process.env.PASS_PHRASE_ETH);

    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);

    const { turingMoonbase } = chains;
    const turingAdapter = new OakAdapter(turingMoonbase);
    await turingAdapter.initialize();
    const turingApi = turingAdapter.getApi();

    const { moonbaseAlpha } = chains;
    moonbaseAlpha.endpoint = 'wss://moonbeam-alpha.api.onfinality.io/public-ws';
    const moonbaseAdapter = new MoonbeamAdapter(moonbaseAlpha);
    await moonbaseAdapter.initialize();
    const moonbaseApi = moonbaseAdapter.getApi();

    const turingChainData = turingAdapter.getChainData();
    const moonbaseChainData = moonbaseAdapter.getChainData();

    const turingAddress = keyring.decodeAddress(keyPair.addressRaw, turingChainData.ss58Prefix);
    const moonbaseAddress = keyring.decodeAddress(parachainKeyPair.addressRaw, moonbaseChainData.ss58Prefix);

    const proxyAccountId = turingAdapter.getDeriveAccount(u8aToHex(parachainKeyPair.addressRaw), moonbaseChainData.paraId);
    const proxyAddressOnTuring = keyring.encodeAddress(proxyAccountId, turingChainData.ss58Prefix);
    console.log(`\n2. One-time proxy setup on ${turingChainData.key}`);
    console.log(`\na) Add a proxy for ${keyPair.meta.name} If there is none setup on ${turingChainData.key}\n`);
    const proxiesResponse = await turingApi.query.proxy.proxies(u8aToHex(keyPair.addressRaw));
    const proxies = _.first(proxiesResponse.toJSON());
    const proxyTypeTuring = 'Any';
    const proxyMatchTuring = _.find(proxies, { delegate: proxyAddressOnTuring, proxyType: 'Any' });
    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyAddressOnTuring} for paraId: ${moonbaseChainData.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${moonbaseChainData.key} (paraId:${moonbaseChainData.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyAddressOnTuring}\n`);
        await sendExtrinsic(turingApi, turingApi.tx.proxy.addProxy(proxyAccountId, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer DEV to the proxy account on Turing
    console.log(`\nb) Reserve transfer DEV to the proxy account on ${turingChainData.key}: `);
    const paraTokenIdOnTuring = (await turingApi.query.assetRegistry.locationToAssetId(moonbaseChainData.defaultAsset.location))
        .unwrapOrDefault()
        .toNumber();
    console.log('paraTokenIdOnTuring: ', paraTokenIdOnTuring);
    const paraTokenbalanceOnTuring = await turingApi.query.tokens.accounts(proxyAddressOnTuring, paraTokenIdOnTuring);
    const minBalanceOnTuring = new BN('100000000000000000'); // 0.5 DEV
    console.log('minBalanceOnTuring: ', minBalanceOnTuring.toString());
    console.log('paraTokenbalanceOnTuring.free: ', paraTokenbalanceOnTuring.free.toString());

    // We have to transfer some more tokens because the execution fee will be deducted.
    if (paraTokenbalanceOnTuring.free.lt(minBalanceOnTuring)) {
        // Transfer DEV from Moonbase to Turing
        console.log('Transfer DEV from Moonbase to Turing');
        await moonbaseAdapter.crossChainTransfer(
            turingAdapter.getLocation(),
            proxyAccountId,
            moonbaseChainData.defaultAsset.location,
            minBalanceOnTuring,
            parachainKeyPair,
        );
    } else {
        console.log(`\nb) Proxy’s parachain token balance is ${`${paraTokenbalanceOnTuring.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\n3. One-time proxy setup on ${moonbaseChainData.key}`);
    console.log(`\na) Add a proxy for ${keyPair.meta.name} If there is none setup on ${moonbaseChainData.key}\n`);
    console.log('turingChainData.paraId: ', turingChainData.paraId);
    const proxyAccountIdOnMoonbase = moonbaseAdapter.getDeriveAccount(u8aToHex(keyPair.addressRaw), turingChainData.paraId);
    const proxyTypeMoonbase = 'Any';
    const proxiesOnMoonbase = _.first((await moonbaseApi.query.proxy.proxies(u8aToHex(parachainKeyPair.addressRaw))).toJSON());

    const proxyMatchMoonbase = _.find(proxiesOnMoonbase, ({ delegate, proxyType }) => _.toLower(delegate) === _.toLower(proxyAccountIdOnMoonbase) && proxyType === proxyTypeMoonbase);
    if (proxyMatchMoonbase) {
        console.log(`Proxy address ${proxyAccountIdOnMoonbase} for paraId: ${moonbaseChainData.paraId} and proxyType: ${proxyTypeMoonbase} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${moonbaseChainData.key} (paraId:${moonbaseChainData.paraId}) and proxyType: ${proxyTypeMoonbase} on Turing ...\n Proxy address: ${proxyAccountIdOnMoonbase}\n`);
        await sendExtrinsic(moonbaseApi, moonbaseApi.tx.proxy.addProxy(proxyAccountIdOnMoonbase, proxyTypeMoonbase, 0), parachainKeyPair);
    }

    console.log(`\nb) Topping up the proxy account on ${moonbaseChainData.key} with DEV ...\n`);
    const minBalanceOnMoonbaseProxy = new BN('500000000000000000');
    const { data: moonbaseProxyBalance } = await moonbaseApi.query.system.account(proxyAccountIdOnMoonbase);
    // console.log('moonbaseProxyBalance:', moonbaseProxyBalance.free.toHuman());
    if (moonbaseProxyBalance.free.lt(minBalanceOnMoonbaseProxy)) {
        const topUpExtrinsic = moonbaseApi.tx.balances.transfer(proxyAccountIdOnMoonbase, minBalanceOnMoonbaseProxy);
        await sendExtrinsic(moonbaseApi, topUpExtrinsic, parachainKeyPair);
    } else {
        console.log(`\nMoonbase proxy account balance is ${`${moonbaseProxyBalance.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\nUser ${keyPair.meta.name} ${turingChainData.key} address: ${turingAddress}, ${moonbaseChainData.key} address: ${moonbaseAddress}`);

    console.log(`\n4. Execute an XCM from ${moonbaseChainData.key} to ${turingChainData.key} ...`);

    console.log('\na). Create a payload to store in Turing’s task ...');
    const taskPayloadExtrinsic = moonbaseApi.tx.ethereumXcm.transactThroughProxy(
        parachainKeyPair.address,
        {
            V2: {
                gasLimit: 71000,
                action: { Call: CONTRACT_ADDRESS },
                value: 0,
                input: CONTRACT_INPUT,
            },
        },
    );

    console.log(`\nb). Send extrinsic from ${moonbaseChainData.key} to ${turingChainData.key} to schedule task. Listen to TaskScheduled event on ${turingChainData.key} chain ...`);
    const timestampNextHour = getHourlyTimestamp(1) / 1000;
    const timestampTwoHoursLater = getHourlyTimestamp(2) / 1000;
    const sendExtrinsicPromise = Sdk().scheduleXcmpTaskWithPayThroughRemoteDerivativeAccountFlow({
        oakAdapter: turingAdapter,
        destinationChainAdapter: moonbaseAdapter,
        taskPayloadExtrinsic,
        scheduleFeeLocation: moonbaseChainData.defaultAsset.location,
        executionFeeLocation: moonbaseChainData.defaultAsset.location,
        schedule: { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
        scheduleAs: turingAddress,
        keyPair: parachainKeyPair,
    });
    const listenEventsPromise = listenEvents(turingApi, 'automationTime', 'TaskScheduled', 60000);
    const results = await waitPromises([sendExtrinsicPromise, listenEventsPromise]);
    const taskScheduledEvent = results[1];
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
