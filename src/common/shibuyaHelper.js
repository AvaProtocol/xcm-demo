import _ from 'lodash';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { BN } from 'bn.js';
import Keyring from '@polkadot/keyring';

import { getProxies, getProxyAccount } from './utils';

// frame_support::weights::constants::WEIGHT_PER_SECOND
// https://github.com/paritytech/substrate/blob/2dff067e9f7f6f3cc4dbfdaaa97753eccc407689/frame/support/src/weights.rs#L39
// https://github.com/paritytech/substrate/blob/2dff067e9f7f6f3cc4dbfdaaa97753eccc407689/primitives/weights/src/lib.rs#L48
const WEIGHT_PER_SECOND = 1000000000000;

class ShibuyaHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const api = await ApiPromise.create({ provider: new WsProvider(this.config.endpoint) });
        this.api = api;
        this.assets = this.config.assets;
        this.keyring = new Keyring({ type: 'sr25519', ss58Format: this.config.ss58 });
    };

    getApi = () => this.api;

    getProxyAccount = (address, paraId) => {
        const { accountId32 } = getProxyAccount(this.api, paraId, address);
        return this.keyring.encodeAddress(accountId32);
    };

    getProxies = async (address) => getProxies(this.api, address);

    getBalance = async (address) => {
        const balance = (await this.api.query.system.account(address))?.data;
        return balance;
    };

    createTransactExtrinsic = ({
        targetParaId, encodedCall, feePerSecond, requireWeightAtMost, proxyAccount, instructionWeight,
    }) => {
        // The instruction count of XCM message.
        // Because polkadotXcm.send will insert the DescendOrigin instruction at the head of the instructions list.
        // So instructionCount should be V2.length + 1
        const instructionCount = 6;
        const totalInstructionWeight = instructionCount * instructionWeight;
        console.log('requireWeightAtMost: ', requireWeightAtMost);
        console.log('totalInstructionWeight: ', totalInstructionWeight);
        console.log('targetParaId: ', targetParaId);
        const weightLimit = requireWeightAtMost + totalInstructionWeight;
        const fungible = new BN(weightLimit).mul(feePerSecond).div(new BN(WEIGHT_PER_SECOND));
        const xcmpExtrinsic = this.api.tx.polkadotXcm.send(
            {
                V2: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                V2: [
                    {
                        WithdrawAsset: [
                            {
                                fun: { Fungible: fungible },
                                id: {
                                    Concrete: {
                                        interior: { X1: { Parachain: this.config.paraId } },
                                        parents: 1,
                                    },
                                },
                            },
                        ],
                    },
                    {
                        BuyExecution: {
                            fees: {
                                fun: { Fungible: fungible },
                                id: {
                                    Concrete: {
                                        interior: { X1: { Parachain: this.config.paraId } },
                                        parents: 1,
                                    },
                                },
                            },
                            weightLimit: { Limited: weightLimit },
                        },
                    },
                    {
                        Transact: {
                            originType: 'SovereignAccount',
                            requireWeightAtMost,
                            call: { encoded: encodedCall },
                        },
                    },
                    {
                        RefundSurplus: '',
                    },
                    {
                        DepositAsset: {
                            assets: { Wild: 'All' },
                            maxAssets: 1,
                            beneficiary: {
                                parents: 1,
                                interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyAccount } } },
                            },
                        },
                    },
                ],
            },
        );
        return xcmpExtrinsic;
    };

    createReserveTransferAssetsExtrinsic = (targetParaId, proxyOnTuring, amount) => {
        const extrinsic = this.api.tx.polkadotXcm.reserveTransferAssets(
            {
                V2: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                V2: {
                    interior: { X1: { AccountId32: { network: { Any: '' }, id: this.keyring.decodeAddress(proxyOnTuring) } } },
                    parents: 0,
                },
            },
            {
                V2: [
                    {
                        fun: { Fungible: amount },
                        id: {
                            Concrete: {
                                interior: { Here: '' },
                                parents: 0,
                            },
                        },
                    },
                ],
            },
            0,
        );

        return extrinsic;
    };

    /**
     * Returns the decimal number such as 18 for a specific asset
     * @param {string} symbol such as SBY
     * @returns 18 for SBY
     */
    getDecimalsBySymbol(symbol) {
        const token = _.find(this.assets, { symbol });
        return token.decimals;
    }
}

export default ShibuyaHelper;
