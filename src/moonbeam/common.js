import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import { u8aToHex } from '@polkadot/util';
import { OakAdapter, MoonbeamAdapter } from '@oak-network/adapter';
import { Sdk } from '@oak-network/sdk';
import moment from 'moment';
import chalkPipe from 'chalk-pipe';
import {
    sendExtrinsic, listenEvents, getTaskIdInTaskScheduledEvent, getHourlyTimestamp, waitPromises, ScheduleActionType, calculateTimeout,
} from '../common/utils';
import OakHelper from '../common/v2/oakHelper';
import MoonbeamHelper from '../common/v2/moonbeamHelper';

const TASK_FREQUENCY = 3600;
const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

// eslint-disable-next-line import/prefer-default-export
export const scheduleTask = async ({
    oakConfig, moonbeamConfig, scheduleActionType, keyringPair, moonbeamKeyringPair,
}) => {
    const keyring = new Keyring({ type: 'sr25519' });

    const oakHelper = new OakHelper({ endpoint: oakConfig.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, oakConfig);
    await oakAdapter.initialize();

    const moonbeamHelper = new MoonbeamHelper({ endpoint: moonbeamConfig.endpoint });
    await moonbeamHelper.initialize();
    const moonbeamApi = moonbeamHelper.getApi();
    const moonbeamAdapter = new MoonbeamAdapter(moonbeamApi, moonbeamConfig);
    await moonbeamAdapter.initialize();

    const oakChainData = oakAdapter.getChainData();
    const moonbeamChainData = moonbeamAdapter.getChainData();

    const parachainName = moonbeamChainData.key;

    const oakAddress = keyring.encodeAddress(keyringPair.addressRaw, oakChainData.ss58Prefix);
    const moonbeamAddress = moonbeamKeyringPair.address;

    const proxyAccountId = oakAdapter.getDerivativeAccount(u8aToHex(moonbeamKeyringPair.addressRaw), moonbeamChainData.paraId);
    const proxyAddressOnOak = keyring.encodeAddress(proxyAccountId, oakChainData.ss58Prefix);
    console.log(`\n1. One-time proxy setup on ${oakChainData.key}`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${oakChainData.key}\n`);
    const proxiesResponse = await oakApi.query.proxy.proxies(u8aToHex(keyringPair.addressRaw));
    const proxies = _.first(proxiesResponse.toJSON());
    const proxyTypeOak = 'Any';
    const proxyMatchOak = _.find(proxies, { delegate: proxyAddressOnOak, proxyType: 'Any' });
    if (proxyMatchOak) {
        console.log(`Proxy address ${proxyAddressOnOak} for paraId: ${moonbeamChainData.paraId} and proxyType: ${proxyTypeOak} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${moonbeamChainData.key} (paraId:${moonbeamChainData.paraId}) and proxyType: ${proxyTypeOak} on Turing ...\n Proxy address: ${proxyAddressOnOak}\n`);
        await sendExtrinsic(oakApi, oakApi.tx.proxy.addProxy(proxyAccountId, proxyTypeOak, 0), keyringPair);
    }

    // Reserve transfer DEV to the proxy account on Turing
    console.log(`\nb) Reserve transfer DEV to the proxy account on ${oakChainData.key}: `);
    const paraTokenIdOnOak = (await oakApi.query.assetRegistry.locationToAssetId(moonbeamChainData.defaultAsset.location))
        .unwrapOrDefault()
        .toNumber();
    console.log('paraTokenIdOnOak: ', paraTokenIdOnOak);
    const paraTokenbalanceOnOak = await oakApi.query.tokens.accounts(proxyAddressOnOak, paraTokenIdOnOak);
    const minBalanceOnOak = new BN('100000000000000000'); // 0.5 DEV
    console.log('minBalanceOnOak: ', minBalanceOnOak.toString());
    console.log('paraTokenbalanceOnOak.free: ', paraTokenbalanceOnOak.free.toString());

    // We have to transfer some more tokens because the execution fee will be deducted.
    if (paraTokenbalanceOnOak.free.lt(minBalanceOnOak)) {
        // Transfer DEV from Moonbase to Turing
        console.log('Transfer DEV from Moonbase to Turing');
        await moonbeamAdapter.crossChainTransfer(
            oakAdapter.getLocation(),
            proxyAccountId,
            moonbeamChainData.defaultAsset.location,
            minBalanceOnOak,
            moonbeamKeyringPair,
        );
    } else {
        console.log(`\nb) Proxy’s parachain token balance is ${`${paraTokenbalanceOnOak.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\n2. One-time proxy setup on ${moonbeamChainData.key}`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${moonbeamChainData.key}\n`);
    console.log('oakChainData.paraId: ', oakChainData.paraId);
    const proxyAccountIdOnMoonbeam = moonbeamAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), oakChainData.paraId);
    const proxyTypeMoonbeam = 'Any';
    const proxiesOnMoonbeam = _.first((await moonbeamApi.query.proxy.proxies(u8aToHex(moonbeamKeyringPair.addressRaw))).toJSON());

    const proxyMatchMoonbeam = _.find(proxiesOnMoonbeam, ({ delegate, proxyType }) => _.toLower(delegate) === _.toLower(proxyAccountIdOnMoonbeam) && proxyType === proxyTypeMoonbeam);
    if (proxyMatchMoonbeam) {
        console.log(`Proxy address ${proxyAccountIdOnMoonbeam} for paraId: ${moonbeamChainData.paraId} and proxyType: ${proxyTypeMoonbeam} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${moonbeamChainData.key} (paraId:${moonbeamChainData.paraId}) and proxyType: ${proxyTypeMoonbeam} on Turing ...\n Proxy address: ${proxyAccountIdOnMoonbeam}\n`);
        await sendExtrinsic(moonbeamApi, moonbeamApi.tx.proxy.addProxy(proxyAccountIdOnMoonbeam, proxyTypeMoonbeam, 0), moonbeamKeyringPair);
    }

    console.log(`\nb) Topping up the proxy account on ${moonbeamChainData.key} with DEV ...\n`);
    const minBalanceOnMoonbaseProxy = new BN('500000000000000000');
    const { data: moonbaseProxyBalance } = await moonbeamApi.query.system.account(proxyAccountIdOnMoonbeam);
    // console.log('moonbaseProxyBalance:', moonbaseProxyBalance.free.toHuman());
    if (moonbaseProxyBalance.free.lt(minBalanceOnMoonbaseProxy)) {
        const topUpExtrinsic = moonbeamApi.tx.balances.transfer(proxyAccountIdOnMoonbeam, minBalanceOnMoonbaseProxy);
        await sendExtrinsic(moonbeamApi, topUpExtrinsic, moonbeamKeyringPair);
    } else {
        console.log(`\nMoonbase proxy account balance is ${`${moonbaseProxyBalance.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\nUser ${keyringPair.meta.name} ${oakChainData.key} address: ${oakAddress}, ${moonbeamChainData.key} address: ${moonbeamAddress}`);

    console.log(`\n3. Execute an XCM from ${moonbeamChainData.key} to ${oakChainData.key} ...`);

    console.log('\na). Create a payload to store in Turing’s task ...');
    const taskPayloadExtrinsic = moonbeamApi.tx.ethereumXcm.transactThroughProxy(
        moonbeamKeyringPair.address,
        {
            V2: {
                gasLimit: 71000,
                action: { Call: CONTRACT_ADDRESS },
                value: 0,
                input: CONTRACT_INPUT,
            },
        },
    );

    console.log(`\nb). Send extrinsic from ${moonbeamChainData.key} to ${oakChainData.key} to schedule task. Listen to TaskScheduled event on ${oakChainData.key} chain ...`);
    const nextExecutionTime = getHourlyTimestamp(1) / 1000;
    const timestampTwoHoursLater = getHourlyTimestamp(2) / 1000;

    const schedule = scheduleActionType === ScheduleActionType.executeOnTheHour
        ? { Fixed: { executionTimes: [nextExecutionTime, timestampTwoHoursLater] } }
        : { Fixed: { executionTimes: [0] } };

    const sendExtrinsicPromise = Sdk().scheduleXcmpTaskWithPayThroughRemoteDerivativeAccountFlow({
        oakAdapter,
        destinationChainAdapter: moonbeamAdapter,
        taskPayloadExtrinsic,
        scheduleFeeLocation: moonbeamChainData.defaultAsset.location,
        executionFeeLocation: moonbeamChainData.defaultAsset.location,
        schedule,
        scheduleAs: u8aToHex(keyringPair.addressRaw),
        keyringPair: moonbeamKeyringPair,
    });
    const listenEventsPromise = listenEvents(oakApi, 'automationTime', 'TaskScheduled', 60000);
    const results = await waitPromises([sendExtrinsicPromise, listenEventsPromise]);
    const taskScheduledEvent = results[1];
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);

    const executionTime = scheduleActionType === ScheduleActionType.executeOnTheHour
        ? nextExecutionTime : moment().valueOf() / 1000;
    const timeout = calculateTimeout(nextExecutionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(moonbeamApi, 'ethereum', 'Executed', timeout);

    if (!isTaskExecuted) {
        console.log(`\n${chalkPipe('red')('Error')} Timeout! Task was not executed.`);
        return;
    }

    if (scheduleActionType === ScheduleActionType.executeImmediately) return;

    console.log('\n5. Cancel the task ...');
    const cancelTaskExtrinsic = oakApi.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(oakApi, cancelTaskExtrinsic, keyringPair);

    const nextTwoHourExecutionTime = nextExecutionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(nextTwoHourExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextTwoHourExecutionTime}) to verify that the task was successfully canceled ...`);

    const isTaskExecutedAgain = await listenEvents(moonbeamApi, 'ethereum', 'Executed', nextExecutionTimeout);

    if (isTaskExecutedAgain) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }
    console.log("Task canceled successfully! It didn't execute again.");

    await oakHelper.finalize();
    await moonbeamHelper.finalize();
};
