import '@oak-network/api-augment';
import _ from 'lodash';
import BN from 'bn.js';
import moment from 'moment';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import confirm from '@inquirer/confirm';
import { OakAdapter, MangataAdapter } from '@oak-network/adapter';
import { Sdk } from '@oak-network/sdk';

import {
    delay, listenEvents, readMnemonicFromFile, getDecimalBN, calculateTimeout, sendExtrinsic, findEvent, getTaskIdInTaskScheduledEvent, getHourlyTimestamp,
} from '../common/utils';

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

const calculateRewardsAmount = async (mangataSdk, address, liquidityAsset) => {
    const amountBN = await mangataSdk.calculateRewardsAmount(address, _.toString(liquidityAsset.id));
    const decimalBN = getDecimalBN(liquidityAsset.decimals);
    const result = amountBN.div(decimalBN);
    return result.toString();
};

const getMintLiquidityFee = async ({
    mangataSdk, pair, firstAsset, firstTokenAmount, secondAsset, expectedSecondTokenAmount,
}) => {
    const firstDecimalBN = getDecimalBN(firstAsset.decimals);
    const secondDecimalBN = getDecimalBN(secondAsset.decimals);
    const firstAmount = (new BN(firstTokenAmount, 10)).mul(firstDecimalBN);
    const expectedSecondAmount = (new BN(expectedSecondTokenAmount, 10)).mul(secondDecimalBN);
    const fees = await mangataSdk.mintLiquidityFee(pair, firstAsset.id, secondAsset.id, firstAmount, expectedSecondAmount);
    return fees;
};

const formatPool = (pool, firstAssetDecimals, secondAssetDecimals) => {
    const firstTokenAmountFloat = (new BN(pool.firstTokenAmount)).div(getDecimalBN(firstAssetDecimals));
    const secondTokenAmountFloat = (new BN(pool.secondTokenAmount)).div(getDecimalBN(secondAssetDecimals));
    return _.extend(pool, { firstTokenAmountFloat, secondTokenAmountFloat });
};

class AutoCompound {
    constructor(turingConfig, managataConfig) {
        this.turingConfig = turingConfig;
        this.managataConfig = managataConfig;
    }

    run = async () => {
        await cryptoWaitReady();
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log('Initializing adapters of both chains ...');

        const { turingConfig, managataConfig } = this;
        const oakAdapter = new OakAdapter(turingConfig);
        await oakAdapter.initialize();
        const mangataAdapter = new MangataAdapter(managataConfig);
        await mangataAdapter.initialize();

        const { defaultAsset: oakDefaultAsset } = oakAdapter.getChainData();
        const { defaultAsset: mangataDefaultAsset } = mangataAdapter.getChainData();

        const oakApi = await oakAdapter.getApi();

        const mangataSdk = mangataAdapter.getMangataSdk();
        const mangataApi = mangataAdapter.getApi();

        console.log('1. Reading assets ...');
        let assets = await mangataSdk.getAssetsInfo();
        assets = _.map(assets, (asset) => asset);
        const turAsset = _.find(assets, { symbol: oakDefaultAsset.symbol });
        const mangataAsset = _.find(assets, { symbol: mangataDefaultAsset.symbol });

        const { key: mangataChainName, ss58Prefix } = mangataAdapter.getChainData();
        const mangataAddress = keyring.encodeAddress(keyPair.addressRaw, ss58Prefix);

        const { paraId: oakParaId } = oakAdapter.getChainData();
        console.log(`\n2. Add a proxy on Mangata for paraId ${oakParaId}, or skip this step if that exists ...`);

        const proxyAddress = keyring.encodeAddress(mangataAdapter.getDeriveAccount(u8aToHex(keyPair.addressRaw), oakParaId), ss58Prefix);
        const proxiesResponse = await mangataApi.query.proxy.proxies(u8aToHex(keyPair.addressRaw));
        const proxies = _.first(proxiesResponse.toJSON());

        const proxyType = 'AutoCompound';
        const matchCondition = { delegate: proxyAddress, proxyType };

        const proxyMatch = _.find(proxies, matchCondition);

        if (proxyMatch) {
            console.log(`Found proxy of ${mangataAddress} on Mangata, and will skip the addition ... `, proxyMatch);
        } else {
            if (_.isEmpty(proxies)) {
                console.log(`Proxy array of ${mangataAddress} is empty ...`);
            } else {
                console.log('Proxy not found. Expected', matchCondition, 'Actual', proxies);
            }

            console.log(`Adding a proxy for paraId ${oakParaId}. Proxy address: ${proxyAddress} ...`);
            // await sendExtrinsic(mangataApi, mangataApi.tx.proxy.addProxy(proxyAddress, proxyType, 0), keyPair);
        }

        const pools = await mangataSdk.getPools();
        let pool = _.find(pools, { firstTokenId: mangataAsset.id, secondTokenId: turAsset.id });
        pool = formatPool(pool);
        const liquidityAsset = _.find(assets, { id: pool.liquidityTokenId });
        const { name: poolName } = liquidityAsset;

        const shouldMintLiquidity = await confirm({ message: `\nAccount balance check is completed and proxy is set up. Press ENTRE to mint ${poolName}.`, default: true });

        if (shouldMintLiquidity) {
            // Calculate rwards amount in pool
            const { liquidityTokenId } = pool;

            console.log(`Checking how much reward available in ${poolName} pool, tokenId: ${liquidityTokenId} ...`);

            // Issue: current we couldn’t read this rewards value correct by always getting 0 on the claimable rewards.
            // The result is different from that in src/mangata.js
            const rewardAmount = await calculateRewardsAmount(mangataSdk, mangataAddress, liquidityAsset);
            console.log(`Claimable reward in ${poolName}: `, rewardAmount);

            const liquidityBalance = await mangataSdk.getTokenBalance(liquidityTokenId, mangataAddress);

            const poolNameDecimalBN = getDecimalBN(liquidityAsset.decimals);
            const numReserved = (new BN(liquidityBalance.reserved)).div(poolNameDecimalBN);

            console.log(`Before auto-compound, ${keyPair.meta.name} reserved "${poolName}": ${numReserved.toString()} ...`);

            // Mint liquidity to create reserved MGR-TUR if it’s zero
            if (numReserved.toNumber() === 0) {
                console.log('Reserved pool token is zero; minting liquidity to generate rewards...');

                const firstTokenAmount = 50;
                const MAX_SLIPPIAGE = 0.04; // 4% slippage; can’t be too large
                const poolRatio = pool.firstTokenAmountFloat / pool.secondTokenAmountFloat;
                const expectedSecondTokenAmount = (firstTokenAmount / poolRatio) * (1 + MAX_SLIPPIAGE);

                // Estimate of fees; no need to be accurate
                const fees = await getMintLiquidityFee({
                    mangataSdk, pair: keyPair, firstAsset: mangataAsset, secondAsset: turAsset, firstTokenAmount, expectedSecondTokenAmount,
                });

                console.log('fees', fees);

                await mangataSdk.mintLiquidity({
                    pair: keyPair,
                    firstTokenId: mangataAsset.id,
                    secondTokenId: turAsset.id,
                    firstTokenAmount: firstTokenAmount - fees,
                    expectedSecondTokenAmount,
                });
            }

            if (rewardAmount === 0) {
                console.log('Reserved pool token is not zero but claimable rewards is. You might need to wait some time for it to accumulate ...');
            }

            const answerPool = await confirm({ message: '\nDo you want to continue to schedule auto-compound. Press ENTRE to continue.', default: true });

            if (answerPool) {
                // Create Mangata proxy call
                console.log('\n4. Start to schedule an auto-compound call via XCM ...');
                const compoundRewardsExtrinsic = mangataApi.tx.xyk.compoundRewards(liquidityTokenId, 100);
                const taskPayloadExtrinsic = mangataApi.tx.proxy.proxy(u8aToHex(keyPair.addressRaw), 'AutoCompound', compoundRewardsExtrinsic);

                // Schedule task with sdk
                const timestampNextHour = getHourlyTimestamp(1) / 1000;
                const timestampTwoHoursLater = getHourlyTimestamp(2) / 1000;
                const executionTimes = [timestampNextHour, timestampTwoHoursLater];
                const { events } = await Sdk().scheduleXcmpTaskWithPayThroughSoverignAccountFlow({
                    oakAdapter,
                    destinationChainAdapter: mangataAdapter,
                    taskPayloadExtrinsic,
                    schedule: { Fixed: { executionTimes } },
                    keyPair,
                });

                // Get taskId from TaskScheduled event
                const taskScheduledEvent = findEvent(events, 'automationTime', 'TaskScheduled');
                const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
                console.log(`Retrieved taskId ${taskId} from TaskScheduled among the finalized events.`);

                // Listen XCM events on Mangata side
                console.log(`\n5. Keep Listening XCM events on ${mangataChainName} until ${moment(timestampNextHour * 1000).format('YYYY-MM-DD HH:mm:ss')}(${timestampNextHour}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
                const nextHourExecutionTimeout = calculateTimeout(timestampNextHour);
                const isTaskExecuted = await listenEvents(mangataApi, 'proxy', 'ProxyExecuted', nextHourExecutionTimeout);
                if (!isTaskExecuted) {
                    console.log('Timeout! Task was not executed.');
                    return;
                }

                console.log('Task has been executed!');

                console.log('\nWaiting 20 seconds before reading new chain states ...');
                await delay(20000);

                // Account’s reserved LP token after auto-compound
                const newLiquidityBalance = await mangataSdk.getTokenBalance(liquidityTokenId, mangataAddress);
                console.log(`\nAfter auto-compound, reserved ${poolName} is: ${newLiquidityBalance.reserved.toString()} planck ...`);

                console.log(`${keyPair.meta.name} has compounded ${(newLiquidityBalance.reserved.sub(liquidityBalance.reserved)).toString()} planck more ${poolName} ...`);

                console.log('\n5. Cancel task ...');
                const cancelTaskExtrinsic = oakApi.tx.automationTime.cancelTask(taskId);
                await sendExtrinsic(oakApi, cancelTaskExtrinsic, keyPair);

                const twoHoursExecutionTimeout = calculateTimeout(timestampTwoHoursLater);

                console.log(`\n6. Keep Listening events on ${mangataChainName} until ${moment(timestampTwoHoursLater * 1000).format('YYYY-MM-DD HH:mm:ss')}(${timestampTwoHoursLater}) to verify that the task was successfully canceled ...`);

                const isTaskExecutedAgain = await listenEvents(mangataApi, 'proxy', 'ProxyExecuted', twoHoursExecutionTimeout);
                if (isTaskExecutedAgain) {
                    console.log('Task cancellation failed! It executes again.');
                    return;
                }
                console.log("Task canceled successfully! It didn't execute again.");
            }
        }

        oakAdapter.destroy();
        mangataAdapter.destroy();
    };
}

export default AutoCompound;
