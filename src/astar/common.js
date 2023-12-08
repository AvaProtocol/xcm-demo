import _ from 'lodash';
import BN from 'bn.js';
import moment from 'moment';
import chalkPipe from 'chalk-pipe';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Sdk } from '@oak-network/sdk';
import { AstarAdapter, OakAdapter } from '@oak-network/adapter';
import {
    sendExtrinsic, getDecimalBN, listenEvents, calculateTimeout, bnToFloat, delay, getTaskIdInTaskScheduledEvent, waitPromises, ScheduleActionType, getTimeSlotSpanTimestamp,
} from '../common/utils';
import OakHelper from '../common/oakHelper';

const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number

// eslint-disable-next-line import/prefer-default-export
export const scheduleTask = async ({
    oakConfig, astarConfig, scheduleActionType, createPayloadFunc, keyringPair,
}) => {
    const keyring = new Keyring({ type: 'sr25519' });

    const oakHelper = new OakHelper({ endpoint: oakConfig.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, oakConfig);
    await oakAdapter.initialize();

    const astarApi = await ApiPromise.create({ provider: new WsProvider(astarConfig.endpoint) });
    const astarAdapter = new AstarAdapter(astarApi, astarConfig);
    await astarAdapter.initialize();

    const oakChainData = oakAdapter.getChainConfig();
    const astarChainData = astarAdapter.getChainConfig();

    const [astarDefaultAsset] = astarChainData.assets;

    const oakChainName = oakChainData.key;
    const parachainName = astarChainData.key;
    const oakChainAddress = keyring.encodeAddress(keyringPair.addressRaw, oakChainData.ss58Prefix);
    const parachainAddress = keyring.encodeAddress(keyringPair.addressRaw, astarChainData.ss58Prefix);
    const astarDecimalBN = getDecimalBN(astarDefaultAsset.decimals);
    const paraTokenIdOnOak = (await oakApi.query.assetRegistry.locationToAssetId(astarDefaultAsset.location))
        .unwrapOrDefault()
        .toNumber();

    console.log(`Wallet address on ${oakChainName}:${oakChainAddress}, ${parachainName}: ${parachainAddress}`);
    console.log(`${astarDefaultAsset.symbol} ID on ${oakChainName}: `, paraTokenIdOnOak);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${parachainName}\n`);

    const proxyAccoundIdOnParachain = astarAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), oakChainData.paraId);
    const proxyAddressOnParachain = keyring.encodeAddress(proxyAccoundIdOnParachain, astarChainData.ss58Prefix);
    const proxyTypeParachain = 'Any'; // We cannot set proxyType to "DappsStaking" without the actual auto-restake call
    const proxies = _.first((await astarApi.query.proxy.proxies(u8aToHex(keyringPair.addressRaw))).toJSON());
    console.log('proxies: ', proxies);
    const proxyMatch = _.find(proxies, { delegate: proxyAddressOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyAddressOnParachain} for paraId: ${astarChainData.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${oakChainName} (paraId:${oakChainData.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyAddressOnParachain}\n`);
        await sendExtrinsic(astarApi, astarApi.tx.proxy.addProxy(proxyAccoundIdOnParachain, proxyTypeParachain, 0), keyringPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(astarDecimalBN);
    const { data } = await astarApi.query.system.account(proxyAccoundIdOnParachain);
    let proxyBalance = data;
    if (proxyBalance.free.lt(minBalance)) {
        console.log(`\nTopping up the proxy account on ${astarChainData.key} with ${astarDefaultAsset.symbol} ...\n`);
        const topUpExtrinsic = astarApi.tx.balances.transfer(proxyAccoundIdOnParachain, minBalance.toString());
        await sendExtrinsic(astarApi, topUpExtrinsic, keyringPair);

        // Retrieve the latest balance after top-up
        proxyBalance = (await astarApi.query.system.account(proxyAccoundIdOnParachain)).data;
    }

    const beginProxyBalance = bnToFloat(proxyBalance.free, astarDecimalBN);
    const beginProxyBalanceColor = beginProxyBalance === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${parachainName} is ${chalkPipe(beginProxyBalanceColor)(beginProxyBalance)} ${astarDefaultAsset.symbol}.`);

    console.log(`\n2. One-time proxy setup on ${oakChainName} ...`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${oakChainName} (paraId:${astarChainData.paraId})\n`);
    const proxyTypeOak = 'Any';
    const proxyAccoundIdOnOak = oakAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), astarChainData.paraId, astarChainData.xcm.instructionNetworkType);
    const proxyAddressOnOak = keyring.encodeAddress(proxyAccoundIdOnOak, oakChainData.ss58Prefix);
    const proxiesOnOak = _.first((await oakApi.query.proxy.proxies(u8aToHex(keyringPair.addressRaw))).toJSON());
    const proxyMatchOak = _.find(proxiesOnOak, { delegate: proxyAddressOnOak, proxyType: proxyTypeOak });

    if (proxyMatchOak) {
        console.log(`Proxy address ${proxyAddressOnOak} for paraId: ${astarChainData.paraId} and proxyType: ${proxyTypeOak} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${astarChainData.paraId}) and proxyType: ${proxyTypeOak} on Turing ...\n Proxy address: ${proxyAddressOnOak}\n`);
        await sendExtrinsic(oakApi, oakApi.tx.proxy.addProxy(proxyAccoundIdOnOak, proxyTypeOak, 0), keyringPair);
    }

    // Reserve transfer SBY to the proxy account on Oak
    const minBalanceOnOak = new BN(MIN_BALANCE_IN_PROXY).mul(astarDecimalBN);
    let balanceOnOak = await oakApi.query.tokens.accounts(proxyAccoundIdOnOak, paraTokenIdOnOak);

    if (balanceOnOak.free.lt(minBalanceOnOak)) {
        console.log(`\nTopping up the proxy account on ${oakChainData.key} via reserve transfer ...`);
        astarAdapter.crossChainTransfer(
            oakAdapter.getLocation(),
            proxyAccoundIdOnOak,
            astarDefaultAsset.location,
            minBalanceOnOak,
            keyringPair,
        );

        balanceOnOak = await oakApi.query.tokens.accounts(proxyAccoundIdOnOak, paraTokenIdOnOak);
    }

    // TODO: wait for balance to be updated here; if we execute too quick the following xcm execution will fail due to insufficient balance
    const beginBalanceOak = bnToFloat(balanceOnOak.free, astarDecimalBN);
    const beginBalanceTuringColor = beginBalanceOak === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${oakChainData.key} is ${chalkPipe(beginBalanceTuringColor)(beginBalanceOak)} ${astarDefaultAsset.symbol}.`);

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${oakChainData} ...`);

    console.log('\na). Create a payload to store in Turing’s task ...');
    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload on Shiden would be Shibuya’s utility.batch() call to claim staking rewards and restake

    const payload = createPayloadFunc(astarApi);
    const payloadViaProxy = astarApi.tx.proxy.proxy(keyringPair.addressRaw, 'Any', payload);

    const nextExecutionTime = getTimeSlotSpanTimestamp(1) / 1000;
    const twoTimeSlotsTimestamp = getTimeSlotSpanTimestamp(2) / 1000;
    const schedule = scheduleActionType === ScheduleActionType.executeOnTheHour
        ? { Fixed: { executionTimes: [nextExecutionTime, twoTimeSlotsTimestamp] } }
        : { Fixed: { executionTimes: [0] } };

    console.log(`\nb) Execute the above an XCM from ${astarChainData.key} to schedule a task on ${oakChainName} ...`);
    const sendExtrinsicPromise = Sdk().scheduleXcmpTimeTaskWithPayThroughRemoteDerivativeAccountFlow(
        {
            oakAdapter,
            destinationChainAdapter: astarAdapter,
            taskPayloadExtrinsic: payloadViaProxy,
            scheduleFeeLocation: astarDefaultAsset.location,
            executionFeeLocation: astarDefaultAsset.location,
            scheduleAs: u8aToHex(keyringPair.addressRaw),
            keyringPair,
        },
        schedule,
    );

    const listenEventsPromise = listenEvents(oakApi, 'automationTime', 'TaskScheduled', undefined, 60000);
    const results = await waitPromises([sendExtrinsicPromise, listenEventsPromise]);
    const { foundEvent: taskScheduledEvent } = results[1];
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);

    const executionTime = scheduleActionType === ScheduleActionType.executeOnTheHour
        ? nextExecutionTime : Math.round(moment().valueOf() / 1000);

    const timeout = calculateTimeout(nextExecutionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
    const listenEventsResult = await listenEvents(astarApi, 'proxy', 'ProxyExecuted', timeout);

    if (_.isNull(listenEventsResult)) {
        console.log(`\n${chalkPipe('red')('Error')} Timeout! Task was not executed.`);
        return;
    }

    console.log('\nTask has been executed! Waiting for 20 seconds before reading proxy balance.');

    await delay(20000);

    // Calculating balance delta to show fee cost
    const { data: endProxyBalance } = await astarApi.query.system.account(proxyAccoundIdOnParachain);
    const proxyBalanceDelta = (new BN(proxyBalance.free)).sub(new BN(endProxyBalance.free));

    console.log(`\nAfter execution, Proxy’s balance is ${chalkPipe('green')(bnToFloat(endProxyBalance.free, astarDecimalBN))} ${astarDefaultAsset.symbol}. The delta of proxy balance, or the XCM fee cost is ${chalkPipe('green')(bnToFloat(proxyBalanceDelta, astarDecimalBN))} ${astarDefaultAsset.symbol}.`);

    if (scheduleActionType === ScheduleActionType.executeImmediately) return;

    console.log('\n5. Cancel the task ...');
    const cancelTaskExtrinsic = oakApi.tx.automationTime.cancelTaskWithScheduleAs(proxyAccoundIdOnOak, taskId);
    await sendExtrinsic(oakApi, cancelTaskExtrinsic, keyringPair);

    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(twoTimeSlotsTimestamp * 1000).format('YYYY-MM-DD HH:mm:ss')}(${twoTimeSlotsTimestamp}) to verify that the task was successfully canceled ...`);

    const TaskExecutedAgainResult = await listenEvents(astarApi, 'proxy', 'ProxyExecuted', undefined, nextExecutionTimeout);

    if (!_.isNull(TaskExecutedAgainResult)) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }
    console.log("Task canceled successfully! It didn't execute again.");

    await oakHelper.disconnect();
    await astarApi.disconnect();
};
