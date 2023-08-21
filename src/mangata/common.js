import '@oak-network/api-augment';
import _ from 'lodash';
import moment from 'moment';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import confirm from '@inquirer/confirm';

import TuringHelper from '../common/turingHelper';
import MangataHelper from '../common/mangataHelper';
import Account from '../common/account';
import {
    delay, listenEvents, readMnemonicFromFile, getDecimalBN, calculateTimeout, sendExtrinsic, findEvent, getTaskIdInTaskScheduledEvent,
} from '../common/utils';

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

class AutoCompound {
    constructor(turingConfig, managataConfig) {
        this.turingConfig = turingConfig;
        this.managataConfig = managataConfig;
    }

    run = async () => {
        await cryptoWaitReady();

        console.log('Initializing APIs of both chains ...');

        const turingHelper = new TuringHelper(this.turingConfig);
        await turingHelper.initialize();

        const mangataHelper = new MangataHelper(this.managataConfig);
        await mangataHelper.initialize();

        const turingChainName = turingHelper.config.key;
        const mangataChainName = mangataHelper.config.key;
        const turingNativeToken = _.first(turingHelper.config.assets);
        const mangataNativeToken = _.first(mangataHelper.config.assets);

        console.log(`\nTuring chain name: ${turingChainName}, native token: ${JSON.stringify(turingNativeToken)}`);
        console.log(`Mangata chain name: ${mangataChainName}, native token: ${JSON.stringify(mangataNativeToken)}\n`);

        console.log('1. Reading token and balance of account ...');

        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        const account = new Account(keyPair);
        await account.init([turingHelper, mangataHelper]);
        account.print();

        const mangataAddress = account.getChainByName(mangataChainName)?.address;

        const mgxToken = account.getAssetByChainAndSymbol(mangataChainName, mangataNativeToken.symbol);
        const turToken = account.getAssetByChainAndSymbol(mangataChainName, turingNativeToken.symbol);
        const poolName = `${mgxToken.symbol}-${turToken.symbol}`;

        console.log('\n2. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...');

        const proxyAddress = mangataHelper.getProxyAccount(mangataAddress, turingHelper.config.paraId);
        const proxiesResponse = await mangataHelper.api.query.proxy.proxies(mangataAddress);
        const proxies = _.first(proxiesResponse.toJSON());

        const proxyType = 'AutoCompound';
        const matchCondition = { delegate: proxyAddress, proxyType };

        const proxyMatch = _.find(proxies, matchCondition);

        if (proxyMatch) {
            console.log(`Found proxy of ${account.address} on Mangata, and will skip the addition ... `, proxyMatch);
        } else {
            if (_.isEmpty(proxies)) {
                console.log(`Proxy array of ${account.address} is empty ...`);
            } else {
                console.log('Proxy not found. Expected', matchCondition, 'Actual', proxies);
            }

            console.log(`Adding a proxy for paraId ${turingHelper.config.paraId}. Proxy address: ${proxyAddress} ...`);
            await mangataHelper.addProxy(proxyAddress, proxyType, account.pair);
        }

        const shouldMintLiquidity = await confirm({ message: `\nAccount balance check is completed and proxy is set up. Press ENTRE to mint ${poolName}.`, default: true });

        if (shouldMintLiquidity) {
            const pools = await mangataHelper.getPools();

            let pool = _.find(pools, { firstTokenId: mangataHelper.getTokenIdBySymbol(mgxToken.symbol), secondTokenId: mangataHelper.getTokenIdBySymbol(turToken.symbol) });
            pool = mangataHelper.formatPool(pool);
            console.log(`Found a pool of ${poolName}`, pool);

            if (_.isUndefined(pool)) {
                throw new Error(`Couldn’t find a liquidity pool for ${poolName} ...`);
            }

            // Calculate rwards amount in pool
            const { liquidityTokenId } = pool;

            console.log(`Checking how much reward available in ${poolName} pool, tokenId: ${liquidityTokenId} ...`);

            // Issue: current we couldn’t read this rewards value correct by always getting 0 on the claimable rewards.
            // The result is different from that in src/mangata.js
            const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
            console.log(`Claimable reward in ${poolName}: `, rewardAmount);

            const liquidityBalance = await mangataHelper.mangata.getTokenBalance(liquidityTokenId, mangataAddress);
            const poolNameDecimalBN = getDecimalBN(mangataHelper.getDecimalsBySymbol(poolName));
            const numReserved = (new BN(liquidityBalance.reserved)).div(poolNameDecimalBN);

            console.log(`Before auto-compound, ${account.name} reserved "${poolName}": ${numReserved.toString()} ...`);

            // Mint liquidity to create reserved MGR-TUR if it’s zero
            if (numReserved.toNumber() === 0) {
                console.log('Reserved pool token is zero; minting liquidity to generate rewards...');

                const firstTokenAmount = 50;
                const MAX_SLIPPIAGE = 0.04; // 4% slippage; can’t be too large
                const poolRatio = pool.firstTokenAmountFloat / pool.secondTokenAmountFloat;
                const expectedSecondTokenAmount = (firstTokenAmount / poolRatio) * (1 + MAX_SLIPPIAGE);

                // Estimate of fees; no need to be accurate
                const fees = await mangataHelper.getMintLiquidityFee({
                    pair: account.pair, firstTokenId: mgxToken.id, secondTokenId: turToken.id, firstTokenAmount, expectedSecondTokenAmount,
                });

                console.log('fees', fees);

                await mangataHelper.mintLiquidity({
                    pair: account.pair,
                    firstTokenId: mgxToken.id,
                    secondTokenId: turToken.id,
                    firstTokenAmount: firstTokenAmount - fees,
                    expectedSecondTokenAmount,
                });
            } if (rewardAmount === 0) {
                console.log('Reserved pool token is not zero but claimable rewards is. You might need to wait some time for it to accumulate ...');
            }

            const answerPool = await confirm({ message: '\nDo you want to continue to schedule auto-compound. Press ENTRE to continue.', default: true });

            if (answerPool) {
            // Create Mangata proxy call
                console.log('\n4. Start to schedule an auto-compound call via XCM ...');
                const proxyExtrinsic = mangataHelper.api.tx.xyk.compoundRewards(liquidityTokenId, 100);
                const mangataProxyCall = await mangataHelper.createProxyCall(mangataAddress, proxyType, proxyExtrinsic);
                const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
                const mangataProxyCallFees = await mangataProxyCall.paymentInfo(mangataAddress);

                console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
                console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

                // Create Turing scheduleXcmpTask extrinsic
                console.log('\na) Create the call for scheduleXcmpTask ');

                const secPerHour = 3600;
                const msPerHour = 3600 * 1000;
                const currentTimestamp = moment().valueOf();
                const timestampNextHour = (currentTimestamp - (currentTimestamp % msPerHour)) / 1000 + secPerHour;
                const timestampTwoHoursLater = (currentTimestamp - (currentTimestamp % msPerHour)) / 1000 + (secPerHour * 2);
                const overallWeight = mangataHelper.calculateXcmTransactOverallWeight(mangataProxyCallFees.weight);
                const fee = mangataHelper.weightToFee(overallWeight, 'TUR');
                const turLocation = { parents: 0, interior: 'Here' };
                const xcmpCall = turingHelper.api.tx.automationTime.scheduleXcmpTask(
                    { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
                    { V3: mangataHelper.getLocation() },
                    { V3: turLocation },
                    { asset_location: { V3: turLocation }, amount: fee },
                    encodedMangataProxyCall,
                    mangataProxyCallFees.weight,
                    overallWeight,
                );

                console.log('xcmpCall: ', xcmpCall.method.toHex());

                // Query automationTime fee
                console.log('\nb) Query automationTime fee details ');
                const { executionFee, scheduleFee } = await turingHelper.api.rpc.automationTime.queryFeeDetails(xcmpCall);
                console.log('automationFeeDetails: ', { executionFee: executionFee.toString(), scheduleFee: scheduleFee.toString() });

                // Send extrinsic and retrieve the taskId in response
                console.log('\nc) Sign and send scheduleXcmpTask extrinsic ...');
                const { events } = await sendExtrinsic(turingHelper.api, xcmpCall, account.pair);

                // Get taskId from TaskScheduled event
                const taskScheduledEvent = findEvent(events, 'automationTime', 'TaskScheduled');
                const taskId = getTaskIdInTaskScheduledEvent(taskScheduledEvent);
                console.log(`Retrieved taskId ${taskId} from TaskScheduled among the finalized events.`);

                // Listen XCM events on Mangata side
                console.log(`\n5. Keep Listening XCM events on ${mangataChainName} until ${moment(timestampNextHour * 1000).format('YYYY-MM-DD HH:mm:ss')}(${timestampNextHour}) to verify that the task(taskId: ${taskId}) will be successfully executed ...`);
                await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted');

                const nextHourExecutionTimeout = calculateTimeout(timestampNextHour);
                const isTaskExecuted = await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted', nextHourExecutionTimeout);
                if (!isTaskExecuted) {
                    console.log('Timeout! Task was not executed.');
                    return;
                }

                console.log('Task has been executed!');

                console.log('\nWaiting 20 seconds before reading new chain states ...');
                await delay(20000);

                // Account’s reserved LP token after auto-compound
                const newLiquidityBalance = await mangataHelper.mangata.getTokenBalance(liquidityTokenId, mangataAddress);
                console.log(`\nAfter auto-compound, reserved ${poolName} is: ${newLiquidityBalance.reserved.toString()} planck ...`);

                console.log(`${account.name} has compounded ${(newLiquidityBalance.reserved.sub(liquidityBalance.reserved)).toString()} planck more ${poolName} ...`);

                console.log('\n5. Cancel task ...');
                const cancelTaskExtrinsic = turingHelper.api.tx.automationTime.cancelTask(taskId);
                await sendExtrinsic(turingHelper.api, cancelTaskExtrinsic, keyPair);

                const twoHoursExecutionTimeout = calculateTimeout(timestampTwoHoursLater);

                console.log(`\n6. Keep Listening events on ${mangataChainName} until ${moment(timestampTwoHoursLater * 1000).format('YYYY-MM-DD HH:mm:ss')}(${timestampTwoHoursLater}) to verify that the task was successfully canceled ...`);

                const isTaskExecutedAgain = await listenEvents(mangataHelper.api, 'proxy', 'ProxyExecuted', twoHoursExecutionTimeout);
                if (isTaskExecutedAgain) {
                    console.log('Task cancellation failed! It executes again.');
                    return;
                }
                console.log("Task canceled successfully! It didn't execute again.");
            }
        }
    };
}

export default AutoCompound;
