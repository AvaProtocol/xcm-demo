import _ from 'lodash';
import { rpc, types, runtime } from '@oak-network/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';

import { getProxies, getProxyAccount } from './utils';

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

    getProxyAccount = (address, paraId, options) => {
        const { accountId32 } = getProxyAccount(this.api, paraId, address, options);
        return this.keyring.encodeAddress(accountId32);
    };

    getProxies = async (address) => getProxies(this.api, address);

    getFeePerSecond = async (assetId) => {
        const asset = (await this.api.query.assetRegistry.metadata(assetId)).unwrapOrDefault();
        return asset.additional.feePerSecond.unwrapOrDefault();
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

    /**
     * Get task with account and taskId
     * @param {*} address
     * @param {*} taskId
     * @returns
     */
    getAccountTask = async (address, taskId) => {
        const accountId = this.keyring.decodeAddress(address);
        const task = await this.api.query.automationTime.accountTasks(accountId, taskId);
        if (task.isNone) {
            throw new Error('Task not found');
        }
        return task.unwrap();
    };
}

export default TuringHelper;
