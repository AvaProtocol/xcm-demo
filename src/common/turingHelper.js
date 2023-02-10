import _ from 'lodash';
import { rpc, types, runtime } from '@oak-network/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import moment from 'moment';

import { getProxies, getProxyAccount } from './utils';
import { TASK_FREQUENCY } from '../astar/constants';

class TuringHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const api = await ApiPromise.create({
            provider: new WsProvider(this.config.endpoint), rpc, types, runtime,
        });

        this.api = api;
        this.assets = this.config.assets;
        this.keyring = new Keyring({ type: 'sr25519', ss58Format: this.config.ss58 });
    };

    getApi = () => this.api;

    getBalance = async (address) => {
    // Retrieve the account balance & nonce via the system module
        const { data: balance } = await this.api.query.system.account(address);

        return balance;
    };

    getTokenBalance = async (address, tokenId) => this.api.query.tokens.accounts(address, tokenId);

    /**
   * Get XCM fees
   * Fake sign the call in order to get the combined fees from Turing.
   * Turing xcmpHandler_fees RPC requires the encoded call in this format.
   * Fees returned include inclusion, all executions, and XCMP fees to run on Target Chain.
   * @param {*} address
   * @param {*} xcmpCall
   * @returns
   */
    getXcmFees = async (address, xcmpCall) => {
        const fakeSignedXcmpCall = xcmpCall.signFake(address, {
            blockHash: this.api.genesisHash,
            genesisHash: this.api.genesisHash,
            nonce: 100, // does not except negative?
            runtimeVersion: this.api.runtimeVersion,
        });

        const fees = await this.api.rpc.xcmpHandler.fees(fakeSignedXcmpCall.toHex());
        return fees;
    };

    sendXcmExtrinsic = async (xcmpCall, keyPair, taskId) => new Promise((resolve) => {
        const send = async () => {
            const unsub = await xcmpCall.signAndSend(keyPair, { nonce: -1 }, async ({ status }) => {
                if (status.isInBlock) {
                    console.log(`Successful with hash ${status.asInBlock.toHex()}`);

                    // Get Task
                    const task = await this.api.query.automationTime.accountTasks(keyPair.address, taskId);
                    console.log('Task:', task.toHuman());

                    unsub();
                    resolve();
                } else {
                    console.log(`Status: ${status.type}`);
                }
            });
        };
        send();
    });

    getProxyAccount = (address, paraId) => {
        const accountId = getProxyAccount(this.api, paraId, address);
        return this.keyring.encodeAddress(accountId);
    };

    getProxies = async (address) => getProxies(this.api, address);

    getFeePerSecond = async (assetId) => {
        const { additional: { feePerSecond } } = (await this.api.query.assetRegistry.metadata(assetId)).toJSON();
        return feePerSecond;
    };

    /**
     * Returns the decimal number such as 18 for a specific asset
     * @param {string} symbol such as TUR
     * @returns 10 for TUR
     */
    getDecimalsBySymbol(symbol) {
        const token = _.find(this.assets, { symbol });
        return token.decimals;
    }

    getAssetIdByParaId = async (paraId) => {
        const assetId = (await this.api.query.assetRegistry.locationToAssetId({ parents: 1, interior: { X1: { Parachain: paraId } } }))
            .unwrapOrDefault()
            .toNumber();
        return assetId;
    };

    createScheduleXcmpTask = async ({
        turingAddress, parachainId, taskPayload,
    }) => {
        const { encodedCallData, encodedCallWeight } = taskPayload;
        console.log('\nb) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...');

        // Schedule an XCMP task from Turing’s timeAutomation pallet
        // The parameter "Fixed: { executionTimes: [0] }" will trigger the task immediately, while in real world usage Recurring can achieve every day or every week
        const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;
        const secondsInHour = 3600;
        const millisecondsInHour = 3600 * 1000;
        const currentTimestamp = moment().valueOf();
        const nextExecutionTime = (currentTimestamp - (currentTimestamp % millisecondsInHour)) / 1000 + secondsInHour;
        const taskExtrinsic = this.api.tx.automationTime.scheduleXcmpTask(
            providedId,
            { Recurring: { frequency: TASK_FREQUENCY, nextExecutionTime } },
            // { Fixed: { executionTimes: [0] } },
            parachainId,
            0,
            encodedCallData,
            encodedCallWeight,
        );

        const taskViaProxy = this.api.tx.proxy.proxy(turingAddress, 'Any', taskExtrinsic);
        const encodedTaskViaProxy = taskViaProxy.method.toHex();
        const taskViaProxyFees = await taskViaProxy.paymentInfo(turingAddress);
        const requireWeightAtMost = parseInt(taskViaProxyFees.weight, 10);

        console.log(`Encoded call data: ${encodedTaskViaProxy}`);
        console.log(`requireWeightAtMost: ${requireWeightAtMost}`);

        return {
            encodedTaskViaProxy, requireWeightAtMost, nextExecutionTime, providedId,
        };
    };
}

export default TuringHelper;
