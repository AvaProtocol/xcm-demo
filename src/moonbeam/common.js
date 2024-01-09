import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import { u8aToHex } from '@polkadot/util';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { OakAdapter, MoonbeamAdapter } from '@oak-network/adapter';
import { Sdk } from '@oak-network/sdk';
import moment from 'moment';
import {
    sendExtrinsic, waitPromises, ScheduleActionType, calculateTimeout, getTimeSlotSpanTimestamp, listenEvents, listenXcmpTaskEvents,
} from '../common/utils';
import OakHelper from '../common/oakHelper';

const MIN_BALANCE_IN_DERIVIATIVE_ACCOUNT = new BN('50000000000'); // 5 TUR

/**
 * Schedule task
 * @param {*} params { oakConfig, moonbeamConfig, scheduleActionType, contract, keyringPair, moonbeamKeyringPair }
 * contract: { address, input }
 */
// eslint-disable-next-line import/prefer-default-export
export const scheduleTask = async ({
    oakConfig, moonbeamConfig, scheduleActionType, contract, keyringPair, moonbeamKeyringPair,
}) => {
    const keyring = new Keyring({ type: 'sr25519' });

    const oakHelper = new OakHelper({ endpoint: oakConfig.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, oakConfig);
    await oakAdapter.initialize();

    const moonbeamApi = await ApiPromise.create({ provider: new WsProvider(moonbeamConfig.endpoint) });
    const moonbeamAdapter = new MoonbeamAdapter(moonbeamApi, moonbeamConfig);
    await moonbeamAdapter.initialize();

    const oakChainData = oakAdapter.getChainConfig();
    const moonbeamChainData = moonbeamAdapter.getChainConfig();

    const [oakAsset] = oakChainData.assets;
    const [moonbeamAsset] = moonbeamChainData.assets;

    const parachainName = moonbeamChainData.key;

    const oakAddress = keyring.encodeAddress(keyringPair.addressRaw, oakChainData.ss58Prefix);
    const moonbeamAddress = moonbeamKeyringPair.address;

    const proxyAccountId = oakAdapter.getDerivativeAccount(moonbeamKeyringPair.address, moonbeamChainData.paraId);
    const proxyAddressOnOak = keyring.encodeAddress(proxyAccountId, oakChainData.ss58Prefix);

    // Transfer TUR to the derivative account on Turing
    console.log(`\n1. Transfer TUR to the derivative account on ${oakChainData.key}: `);

    const { data: derivativeAccountBalanceOnOak } = await oakApi.query.system.account(proxyAddressOnOak);
    if (derivativeAccountBalanceOnOak.free.lt(MIN_BALANCE_IN_DERIVIATIVE_ACCOUNT)) {
        const topUpExtrinsic = oakApi.tx.balances.transfer(proxyAddressOnOak, MIN_BALANCE_IN_DERIVIATIVE_ACCOUNT);
        await sendExtrinsic(oakApi, topUpExtrinsic, keyringPair);
    } else {
        console.log(`\nb) The balance of derivative account is ${`${derivativeAccountBalanceOnOak.free.toString()} blanck`}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\n2. One-time proxy setup on ${moonbeamChainData.key}`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${moonbeamChainData.key}\n`);
    console.log('oakChainData.paraId: ', oakChainData.paraId);
    const proxyAccountIdOnMoonbeam = moonbeamAdapter.getDerivativeAccount(proxyAccountId, oakChainData.paraId);
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
                action: { Call: contract.address },
                value: 0,
                input: contract.input,
            },
        },
    );

    console.log(`\nb). Send extrinsic from ${moonbeamChainData.key} to ${oakChainData.key} to schedule task. Listen to TaskScheduled event on ${oakChainData.key} chain ...`);
    const nextExecutionTime = getTimeSlotSpanTimestamp(1) / 1000;
    const twoTimeSlotsTimestamp = getTimeSlotSpanTimestamp(2) / 1000;

    const schedule = scheduleActionType === ScheduleActionType.executeOnTheHour
        ? { Fixed: { executionTimes: [nextExecutionTime, twoTimeSlotsTimestamp] } }
        : { Fixed: { executionTimes: [0] } };

    const sendExtrinsicPromise = Sdk().scheduleXcmpTimeTaskWithPayThroughRemoteDerivativeAccountFlow({
        oakAdapter,
        destinationChainAdapter: moonbeamAdapter,
        taskPayloadExtrinsic,
        scheduleFeeLocation: oakAsset.location,
        executionFeeLocation: moonbeamAsset.location,
        keyringPair: moonbeamKeyringPair,
        caller: moonbeamAdapter,
        callerXcmFeeLocation: oakAsset.location,
    }, schedule);

    const executionTime = scheduleActionType === ScheduleActionType.executeImmediately ? (Math.floor(moment() / 1000) + 60) : nextExecutionTime;
    const [, { taskId, messageHash }] = await waitPromises([sendExtrinsicPromise, listenXcmpTaskEvents(oakApi, executionTime)]);

    console.log(`\n4. Listen xcmpQueue.Success event with messageHash(${messageHash}) and find ethereum.Executed event on Parachain...`);
    const result = await listenEvents(
        moonbeamApi,
        'xcmpQueue',
        'Success',
        ({ messageHash: messageHashInEvent }) => messageHashInEvent.toString() === messageHash.toString(),
        60000,
    );
    if (_.isNull(result)) {
        console.log('No xcmpQueue.Success event found.');
        return;
    }
    const { events: xcmpQueueEvents, foundEventIndex: xcmpQueuefoundEventIndex } = result;
    const proxyExecutedEvent = _.findLast(
        xcmpQueueEvents,
        ({ event: { section, method } }) => section === 'ethereum' && method === 'Executed',
        xcmpQueuefoundEventIndex + 1,
    );
    console.log('ethereum.Executed event: ', JSON.stringify(proxyExecutedEvent.event.data.toHuman()));

    if (scheduleActionType === ScheduleActionType.executeImmediately) return;

    console.log('\n5. Cancel the task ...');
    const cancelTaskExtrinsic = oakApi.tx.automationTime.cancelTaskWithScheduleAs(proxyAccountId, taskId);
    await sendExtrinsic(oakApi, cancelTaskExtrinsic, keyringPair);

    const nextExecutionTimeout = calculateTimeout(twoTimeSlotsTimestamp);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(twoTimeSlotsTimestamp * 1000).format('YYYY-MM-DD HH:mm:ss')}(${twoTimeSlotsTimestamp}) to verify that the task was successfully canceled ...`);

    const listenEventsAgainResult = await listenEvents(
        oakApi,
        'automationTime',
        'TaskTriggered',
        ({ taskId: taskIdInEvent }) => taskIdInEvent.toString() === taskId,
        nextExecutionTimeout,
    );

    if (!_.isNull(listenEventsAgainResult)) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }
    console.log("Task canceled successfully! It didn't execute again.");

    await oakHelper.disconnect();
    await moonbeamApi.disconnect();
};
