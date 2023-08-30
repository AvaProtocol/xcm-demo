import _ from 'lodash';
import BN from 'bn.js';
import moment from 'moment';
import chalkPipe from 'chalk-pipe';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { chains } from '@oak-network/config';
import { Sdk } from '@oak-network/sdk';
import { AstarAdapter, OakAdapter } from '@oak-network/adapter';
import {
    sendExtrinsic, getDecimalBN, listenEvents, readMnemonicFromFile, calculateTimeout, bnToFloat, delay, getTaskIdInTaskScheduledEvent, getHourlyTimestamp, waitPromises,
} from '../common/utils';

const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const TASK_FREQUENCY = 3600;

const keyring = new Keyring({ type: 'sr25519' });

const main = async () => {
    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);

    const { turingStaging, rocstar } = chains;
    const turingAdapter = new OakAdapter(turingStaging);
    await turingAdapter.initialize();
    const turingApi = turingAdapter.getApi();

    const rocstarAdapter = new AstarAdapter(rocstar);
    await rocstarAdapter.initialize();
    const rocstarApi = rocstarAdapter.getApi();

    const turingChainData = turingAdapter.getChainData();
    const rocstarChainData = rocstarAdapter.getChainData();

    const turingChainName = turingChainData.key;
    const turingAddress = keyring.encodeAddress(keyPair.addressRaw, turingChainData.ss58Prefix);
    const parachainName = rocstarChainData.key;
    const rocstarDecimalBN = getDecimalBN(rocstarChainData.defaultAsset.decimals);
    const paraTokenIdOnTuring = (await turingApi.query.assetRegistry.locationToAssetId(rocstarChainData.defaultAsset.location))
        .unwrapOrDefault()
        .toNumber();
    console.log(`${rocstarChainData.defaultAsset.symbol} ID on Turing: `, paraTokenIdOnTuring);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    console.log(`\na) Add a proxy for ${keyPair.meta.name} If there is none setup on ${parachainName}\n`);

    const proxyAccoundIdOnParachain = rocstarAdapter.getDeriveAccount(u8aToHex(keyPair.addressRaw), turingChainData.paraId);
    const proxyAddressOnParachain = keyring.encodeAddress(proxyAccoundIdOnParachain, rocstarChainData.ss58Prefix);
    const proxyTypeParachain = 'Any'; // We cannot set proxyType to "DappsStaking" without the actual auto-restake call
    const proxies = _.first((await rocstarApi.query.proxy.proxies(u8aToHex(keyPair.addressRaw))).toJSON());
    console.log('proxies: ', proxies);
    const proxyMatch = _.find(proxies, { delegate: proxyAddressOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyAddressOnParachain} for paraId: ${rocstarChainData.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${turingChainData.key} (paraId:${turingChainData.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyAddressOnParachain}\n`);
        await sendExtrinsic(rocstarApi, rocstarApi.tx.proxy.addProxy(proxyAccoundIdOnParachain, proxyTypeParachain, 0), keyPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(rocstarDecimalBN);
    const { data } = await rocstarApi.query.system.account(proxyAccoundIdOnParachain);
    let proxyBalance = data;
    if (proxyBalance.free.lt(minBalance)) {
        console.log(`\nTopping up the proxy account on ${rocstarChainData.key} with ${rocstarChainData.defaultAsset.symbol} ...\n`);
        const topUpExtrinsic = rocstarApi.tx.balances.transfer(proxyAccoundIdOnParachain, minBalance.toString());
        await sendExtrinsic(rocstarApi, topUpExtrinsic, keyPair);

        // Retrieve the latest balance after top-up
        proxyBalance = await rocstarApi.query.system.account(proxyAccoundIdOnParachain).data;
    }

    console.log('rocstarDecimalBN: ', rocstarDecimalBN.toString());
    console.log(`\nb) Proxy’s balance on ${parachainName} is ${chalkPipe('green')(bnToFloat(proxyBalance.free, rocstarDecimalBN))} ${rocstarChainData.defaultAsset.symbol}.`);

    const beginProxyBalance = bnToFloat(proxyBalance.free, rocstarDecimalBN);
    const beginProxyBalanceColor = beginProxyBalance === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${parachainName} is ${chalkPipe(beginProxyBalanceColor)(beginProxyBalance)} ${rocstarChainData.defaultAsset.symbol}.`);

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for ${keyPair.meta.name} If there is none setup on Turing (paraId:${rocstarChainData.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxyAccoundIdOnTuring = turingAdapter.getDeriveAccount(u8aToHex(keyPair.addressRaw), rocstarChainData.paraId, { network: rocstarChainData.relayChain, locationType: 'XcmV3MultiLocation' });
    const proxyAddressOnTuring = keyring.encodeAddress(proxyAccoundIdOnTuring, turingChainData.ss58Prefix);
    const proxiesOnTuring = _.first((await turingApi.query.proxy.proxies(u8aToHex(keyPair.addressRaw))).toJSON());
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyAddressOnTuring, proxyType: proxyTypeTuring });

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyAddressOnTuring} for paraId: ${rocstarChainData.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${rocstarChainData.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyAddressOnTuring}\n`);
        await sendExtrinsic(rocstarApi, turingApi.tx.proxy.addProxy(proxyAccoundIdOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer SBY to the proxy account on Turing
    const minBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(rocstarDecimalBN);
    let balanceOnTuring = await turingApi.query.tokens.accounts(proxyAddressOnTuring, paraTokenIdOnTuring); // turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);

    if (balanceOnTuring.free.lt(minBalanceOnTuring)) {
        console.log(`\nTopping up the proxy account on ${turingChainData.key} via reserve transfer ...`);
        rocstarAdapter.crossChainTransfer(
            turingAdapter.getLocation(),
            proxyAccoundIdOnTuring,
            rocstarChainData.defaultAsset.location,
            minBalanceOnTuring,
            keyPair,
        );

        balanceOnTuring = await turingApi.query.tokens.accounts(proxyAddressOnTuring, paraTokenIdOnTuring);
    }

    const beginBalanceTuring = bnToFloat(balanceOnTuring.free, rocstarDecimalBN);
    const beginBalanceTuringColor = beginBalanceTuring === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${turingChainData.key} is ${chalkPipe(beginBalanceTuringColor)(beginBalanceTuring)} ${rocstarChainData.defaultAsset.symbol}.`);

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${turingChainName} ...`);

    console.log('\na). Create a payload to store in Turing’s task ...');
    // We are using a very simple system.remark extrinsic to demonstrate the payload here.
    // The real payload on Shiden would be Shibuya’s utility.batch() call to claim staking rewards and restake

    const nextExecutionTime = getHourlyTimestamp(1) / 1000;
    const timestampTwoHoursLater = getHourlyTimestamp(2) / 1000;
    const taskPayloadExtrinsic = rocstarApi.tx.system.remarkWithEvent('Hello world!');
    const sendExtrinsicPromise = Sdk().scheduleXcmpTaskWithPayThroughRemoteDerivativeAccountFlow({
        oakAdapter: turingAdapter,
        destinationChainAdapter: rocstarAdapter,
        taskPayloadExtrinsic,
        scheduleFeeLocation: rocstarChainData.defaultAsset.location,
        executionFeeLocation: rocstarChainData.defaultAsset.location,
        schedule: { Fixed: { executionTimes: [nextExecutionTime, timestampTwoHoursLater] } },
        scheduleAs: turingAddress,
        keyPair,
    });

    const listenEventsPromise = listenEvents(turingApi, 'automationTime', 'TaskScheduled', 60000);
    const results = await waitPromises([sendExtrinsicPromise, listenEventsPromise]);
    const taskScheduledEvent = results[1];
    const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
    console.log(`Found the event and retrieved TaskId, ${taskId}`);

    const timeout = calculateTimeout(nextExecutionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(rocstarApi, 'proxy', 'ProxyExecuted', timeout);

    if (!isTaskExecuted) {
        console.log(`\n${chalkPipe('red')('Error')} Timeout! Task was not executed.`);
        return;
    }

    console.log('\nTask has been executed! Waiting for 20 seconds before reading proxy balance.');

    await delay(20000);

    // Calculating balance delta to show fee cost
    const endProxyBalance = await rocstarApi.query.system.account(proxyAccoundIdOnParachain).data;
    const proxyBalanceDelta = (new BN(proxyBalance.free)).sub(new BN(endProxyBalance.free));

    console.log(`\nAfter execution, Proxy’s balance is ${chalkPipe('green')(bnToFloat(endProxyBalance.free, rocstarDecimalBN))} ${rocstarChainData.symbol}. The delta of proxy balance, or the XCM fee cost is ${chalkPipe('green')(bnToFloat(proxyBalanceDelta, rocstarDecimalBN))} ${rocstarChainData.symbol}.`);

    console.log('\n5. Cancel the task ...');
    const cancelTaskExtrinsic = turingApi.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(turingApi, cancelTaskExtrinsic, keyPair);

    const nextTwoHourExecutionTime = nextExecutionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(nextTwoHourExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextTwoHourExecutionTime}) to verify that the task was successfully canceled ...`);

    const isTaskExecutedAgain = await listenEvents(rocstarApi, 'proxy', 'ProxyExecuted', nextExecutionTimeout);

    if (isTaskExecutedAgain) {
        console.log('Task cancellation failed! It executes again.');
        return;
    }
    console.log("Task canceled successfully! It didn't execute again.");
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
