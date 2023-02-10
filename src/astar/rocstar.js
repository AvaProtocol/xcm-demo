import _ from 'lodash';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import moment from 'moment';
import TuringHelper from '../common/turingHelper';
import ShibuyaHelper from '../common/shibuyaHelper';
import {
    sendExtrinsic, getDecimalBN, listenEvents, readMnemonicFromFile, calculateTimeout,
} from '../common/utils';
import { TuringStaging, Rocstar } from '../config';
import Account from '../common/account';
import { MIN_BALANCE_IN_PROXY, TASK_FREQUENCY } from './constants';
import { scheduleTask } from './common';

const keyring = new Keyring({ type: 'sr25519' });

const main = async () => {
    const turingHelper = new TuringHelper(TuringStaging);
    await turingHelper.initialize();

    const shibuyaHelper = new ShibuyaHelper(Rocstar);
    await shibuyaHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const parachainName = shibuyaHelper.config.key;
    const parachainNativeToken = _.first(shibuyaHelper.config.assets);

    console.log(`\nTuring chain key: ${turingChainName}`);
    console.log(`Parachain name: ${parachainName}, native token: ${JSON.stringify(parachainNativeToken)}\n`);

    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);

    const account = new Account(keyPair);
    await account.init([turingHelper, shibuyaHelper]);
    account.print();

    const parachainAddress = account.getChainByName(parachainName)?.address;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const decimalBN = getDecimalBN(parachainNativeToken.decimals);

    console.log(`\nUser ${account.name} ${turingChainName} address: ${turingAddress}, ${parachainName} address: ${parachainAddress}`);

    const paraTokenIdOnTuring = await turingHelper.getAssetIdByParaId(shibuyaHelper.config.paraId);
    console.log('Rocstar ID on Turing: ', paraTokenIdOnTuring);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    console.log(`\na) Add a proxy for ${account.name} If there is none setup on ${parachainName} (paraId:${turingHelper.config.paraId}) \n`);

    const proxyTypeParachain = 'Any'; // We cannotset proxyType to "DappsStaking" without the actual auto-restake call
    const proxyOnParachain = shibuyaHelper.getProxyAccount(parachainAddress, turingHelper.config.paraId);
    const proxies = await shibuyaHelper.getProxies(parachainAddress);
    const proxyMatch = _.find(proxies, { delegate: proxyOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyOnParachain} for paraId: ${turingHelper.config.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${turingChainName} (paraId:${turingHelper.config.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyOnParachain}\n`);
        await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyOnParachain, proxyTypeParachain, 0), keyPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    const balance = await shibuyaHelper.getBalance(proxyOnParachain);

    if (balance.free.lt(minBalance)) {
        console.log('\nb) Topping up the proxy account on Shibuya with SBY ...\n');
        const amount = new BN(10, 10);
        const amountBN = amount.mul(decimalBN);
        const topUpExtrinsic = shibuyaHelper.api.tx.balances.transfer(proxyOnParachain, amountBN.toString());
        await sendExtrinsic(shibuyaHelper.api, topUpExtrinsic, keyPair);
    } else {
        const freeAmount = (new BN(balance.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeAmount.toString()}, no need to top it up with SBY transfer ...`);
    }

    console.log('\n2. One-time proxy setup on Turing');
    console.log(`\na) Add a proxy for Alice If there is none setup on Turing (paraId:${shibuyaHelper.config.paraId})\n`);
    const proxyTypeTuring = 'Any';
    const proxyOnTuring = turingHelper.getProxyAccount(turingAddress, shibuyaHelper.config.paraId);
    const proxyAccountId = keyring.decodeAddress(proxyOnTuring);
    const proxiesOnTuring = await turingHelper.getProxies(turingAddress);
    const proxyMatchTuring = _.find(proxiesOnTuring, { delegate: proxyOnTuring, proxyType: proxyTypeTuring });

    if (proxyMatchTuring) {
        console.log(`Proxy address ${proxyOnTuring} for paraId: ${shibuyaHelper.config.paraId} and proxyType: ${proxyTypeTuring} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${shibuyaHelper.config.paraId}) and proxyType: ${proxyTypeTuring} on Turing ...\n Proxy address: ${proxyOnTuring}\n`);
        await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyOnTuring, proxyTypeTuring, 0), keyPair);
    }

    // Reserve transfer SBY to the proxy account on Turing
    const minBalanceOnTuring = new BN(MIN_BALANCE_IN_PROXY).mul(decimalBN);
    const balanceOnTuring = await turingHelper.getTokenBalance(proxyOnTuring, paraTokenIdOnTuring);

    if (balanceOnTuring.free.lt(minBalanceOnTuring)) {
        console.log(`\nb) Topping up the proxy account on ${turingChainName} via reserve transfer ...`);
        const topUpAmount = new BN(1000, 10);
        const topUpAmountBN = topUpAmount.mul(decimalBN);
        const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(turingHelper.config.paraId, proxyAccountId, topUpAmountBN);
        await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, keyPair);
    } else {
        const freeBalanceOnTuring = (new BN(balanceOnTuring.free)).div(decimalBN);
        console.log(`\nb) Proxy’s balance is ${freeBalanceOnTuring.toString()}, no need to top it up with reserve transfer ...`);
    }

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${turingChainName} ...`);

    const result = await scheduleTask({
        turingHelper,
        shibuyaHelper,
        turingAddress,
        parachainAddress,
        paraTokenIdOnTuring,
        proxyAccountId,
        proxyTypeParachain,
        keyPair,
    });

    const { taskId, providedId, executionTime } = result;
    const timeout = calculateTimeout(executionTime);

    console.log(`\n4. Keep Listening events on ${parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
    const isTaskExecuted = await listenEvents(shibuyaHelper.api, 'proxy', 'ProxyExecuted', timeout);

    if (!isTaskExecuted) {
        console.log('Timeout! Task was not executed.');
        return;
    }

    console.log('Task has been executed!');

    console.log('\n5. Cancel task ...');
    const cancelTaskExtrinsic = turingHelper.api.tx.automationTime.cancelTask(taskId);
    await sendExtrinsic(turingHelper.api, cancelTaskExtrinsic, keyPair);

    const nextExecutionTime = executionTime + TASK_FREQUENCY;
    const nextExecutionTimeout = calculateTimeout(nextExecutionTime);

    console.log(`\n6. Keep Listening events on ${parachainName} until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task was successfully canceled ...`);

    const isTaskExecutedAgain = await listenEvents(shibuyaHelper.api, 'proxy', 'ProxyExecuted', nextExecutionTimeout);

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
