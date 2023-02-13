import '@oak-network/api-augment';
import _ from 'lodash';
import BN from 'bn.js';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import moment from 'moment';
import Keyring from '@polkadot/keyring';

import TuringHelper from '../common/turingHelper';
import MangataHelper from '../common/mangataHelper';
import Account from '../common/account';
import {
    askScheduleAction, ScheduleActionType,
    calculateTimeout, delay, getDecimalBN, listenEvents, sendExtrinsic,
} from '../common/utils';
import { TuringDev, MangataDev } from '../config';

const TASK_FREQUENCY = 3600;

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

class MangataDevAutoCompound {
    initialize = async () => {
        await cryptoWaitReady();

        console.log('Initializing APIs of both chains ...');
        this.turingHelper = new TuringHelper(TuringDev);
        await this.turingHelper.initialize();

        this.mangataHelper = new MangataHelper(MangataDev);
        await this.mangataHelper.initialize();

        this.parachainName = this.mangataHelper.config.key;

        const turingChainName = this.turingHelper.config.key;
        const mangataChainName = this.mangataHelper.config.key;
        this.turingNativeToken = _.first(this.turingHelper.config.assets);
        this.mangataNativeToken = _.first(this.mangataHelper.config.assets);

        console.log(`\nTuring chain name: ${turingChainName}, native token: ${JSON.stringify(this.turingNativeToken)}`);
        console.log(`Mangata chain name: ${mangataChainName}, native token: ${JSON.stringify(this.mangataNativeToken)}\n`);

        console.log('Reading token and balance of Alice account ...');
        const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
        keyPair.meta.name = 'Alice';

        this.account = new Account(keyPair);
        await this.account.init([this.turingHelper, this.mangataHelper]);
        this.account.print();

        this.mangataAddress = this.account.getChainByName(mangataChainName)?.address;
        this.turingAddress = this.account.getChainByName(turingChainName)?.address;
        this.poolName = `${this.mangataNativeToken.symbol}-${this.turingNativeToken.symbol}`;

        this.liquidityDecimalBN = getDecimalBN(this.mangataHelper.getDecimalsBySymbol(this.poolName));

        // Calculate rwards amount in pool
        console.log(`Checking how much reward available in ${this.poolName} pool ...`);

        // TODO: determining liquidityTokenId by symbol name cannot handle duplicate symbols. It’s better we retrieve pools and find the correct pool
        const pools = await this.mangataHelper.getPools({ isPromoted: true });
        const { liquidityTokenId } = _.find(pools, (pool) => pool.firstTokenId === this.mangataHelper.getTokenIdBySymbol(this.mangataNativeToken.symbol) && pool.secondTokenId === this.mangataHelper.getTokenIdBySymbol(this.turingNativeToken.symbol));
        this.liquidityTokenId = liquidityTokenId;

        const rewardAmount = await this.mangataHelper.calculateRewardsAmount(this.mangataAddress, this.liquidityTokenId);
        console.log(`Claimable reward in ${this.poolName}: `, rewardAmount);
    };

    scheduleXcmpTask = async (schedule, encodedMangataProxyCall, mangataProxyCallFees) => {
        console.log('\na) Create xcmp call');
        const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
        const xcmpCall = this.turingHelper.api.tx.automationTime.scheduleXcmpTask(
            providedId,
            schedule,
            this.mangataHelper.config.paraId,
            0,
            encodedMangataProxyCall,
            parseInt(mangataProxyCallFees.weight.refTime, 10),
        );

        console.log('xcmpCall: ', xcmpCall);

        // Query automationTime fee
        console.log('\nb) Query automationTime fee details ');
        const { executionFee, xcmpFee } = await this.turingHelper.api.rpc.automationTime.queryFeeDetails(xcmpCall);
        console.log('automationFeeDetails: ', { executionFee: executionFee.toHuman(), xcmpFee: xcmpFee.toHuman() });

        // Get a TaskId from Turing rpc
        const taskId = await this.turingHelper.api.rpc.automationTime.generateTaskId(this.turingAddress, providedId);
        console.log('TaskId:', taskId.toHuman());

        // Send extrinsic
        console.log('\nc) Sign and send scheduleXcmpTask call ...');
        await this.turingHelper.sendXcmExtrinsic(xcmpCall, this.account.pair, taskId);

        return { taskId, providedId };
    };

    verifyAutocompound = async (executionTime, preliquidityBalance) => {
        // Listen XCM events on Mangata side
        await listenEvents(this.mangataHelper.api, 'proxy', 'ProxyExecuted');

        const isTaskExecuted = await listenEvents(this.mangataHelper.api, 'proxy', 'ProxyExecuted', executionTime);
        if (!isTaskExecuted) {
            throw new Error('Timeout! Task was not executed.');
        }

        console.log('Task has been executed!');

        console.log('\nWaiting 20 seconds before reading new chain states ...');
        await delay(20000);

        // Account’s reserved LP token after auto-compound
        const newLiquidityBalance = await this.mangataHelper.mangata.getTokenBalance(this.liquidityTokenId, this.mangataAddress);
        const newReservedBalanceBN = (new BN(newLiquidityBalance.reserved)).div(this.liquidityDecimalBN);
        console.log(`\nAfter auto-compound, reserved ${this.poolName} is: ${newReservedBalanceBN} ${this.poolName} ...`);

        const reservedPlanckDeltaBN = newLiquidityBalance.reserved.sub(preliquidityBalance.reserved);
        const reservedDeltaBN = reservedPlanckDeltaBN.div(this.liquidityDecimalBN);
        console.log(`${this.account.name} has compounded ${reservedDeltaBN.toString()} more ${this.poolName} ...`);
    };

    cancelXcmpTask = async (taskId) => {
        console.log('\na) Cancel task ...');
        const cancelTaskExtrinsic = this.turingHelper.api.tx.automationTime.cancelTask(taskId);
        await sendExtrinsic(this.turingHelper.api, cancelTaskExtrinsic, this.account.pair);
    };

    verifyTaskCanceled = async (executionTime) => {
        const nextExecutionTimeout = calculateTimeout(executionTime);
        const isTaskExecutedAgain = await listenEvents(this.mangataHelper.api, 'proxy', 'ProxyExecuted', nextExecutionTimeout);
        if (isTaskExecutedAgain) {
            throw new Error('Task cancellation failed! It executes again.');
        }
        console.log("Task canceled successfully! It didn't execute again.");
    };

    run = async () => {
        // Alice’s reserved LP token before auto-compound
        const preliquidityBalance = await this.mangataHelper.mangata.getTokenBalance(this.liquidityTokenId, this.mangataAddress);

        console.log(`Before auto-compound, ${this.account.name} reserved ${this.poolName}: ${(new BN(preliquidityBalance.reserved)).div(this.liquidityDecimalBN).toString()} ...`);

        // Create Mangata proxy call
        console.log('\nStart to schedule an auto-compound call via XCM ...');

        const proxyType = 'AutoCompound';
        const proxyExtrinsic = this.mangataHelper.api.tx.xyk.compoundRewards(this.liquidityTokenId, 100);
        const mangataProxyCall = await this.mangataHelper.createProxyCall(this.mangataAddress, proxyType, proxyExtrinsic);
        const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
        const mangataProxyCallFees = await mangataProxyCall.paymentInfo(this.mangataAddress);

        console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
        console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

        // Create Turing scheduleXcmpTask extrinsic
        console.log('\n1. Create the call for scheduleXcmpTask ');
        const secondsInHour = 3600;
        const millisecondsInHour = 3600 * 1000;
        const currentTimestamp = moment().valueOf();
        const executionTime = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;

        const actionSelected = await askScheduleAction();

        switch (actionSelected) {
        case ScheduleActionType.executeOnTheHour: {
            console.log('\n3. Sign and send scheduleXcmpTask call');
            const schedule = { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime: executionTime } };
            const { taskId, providedId } = await this.scheduleXcmpTask(schedule, encodedMangataProxyCall, mangataProxyCallFees);

            console.log(`\n4. Keep Listening XCM events on ${this.parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
            await this.verifyAutocompound(executionTime, preliquidityBalance);

            console.log('\n5. Cancel task');
            await this.cancelXcmpTask(taskId);
            const nextExecutionTime = executionTime + TASK_FREQUENCY;

            console.log(`\n6. Keep Listening events on ${this.parachainName} until ${moment(nextExecutionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${nextExecutionTime}) to verify that the task was successfully canceled ...`);
            await this.verifyTaskCanceled(nextExecutionTime);
            break;
        }
        case ScheduleActionType.executeImmediately:
        default: {
            console.log('\n3. Sign and send scheduleXcmpTask call ...');
            const schedule = { Fixed: { executionTimes: [0] } };
            const { taskId, providedId } = await this.scheduleXcmpTask(schedule, encodedMangataProxyCall, mangataProxyCallFees);

            console.log(`\n4. Keep Listening XCM events on ${this.parachainName} until ${moment(executionTime * 1000).format('YYYY-MM-DD HH:mm:ss')}(${executionTime}) to verify that the task(taskId: ${taskId}, providerId: ${providedId}) will be successfully executed ...`);
            await this.verifyAutocompound(executionTime, preliquidityBalance);
            break;
        }
        }
    };
}

export default MangataDevAutoCompound;
