import { ApiPromise, WsProvider } from '@polkadot/api';
import _ from 'lodash';
import { instructionWeight } from './constants';
import { getProxyAccount } from './utils';
import { Shibuya } from '../config';

class ShibuyaHelper {
    initialize = async (endpoint) => {
        const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });
        this.api = api;
        this.assets = Shibuya.assets;
    };

    getApi = () => this.api;

    getProxyAccount = (parachainId, address) => getProxyAccount(this.api, parachainId, address);

    createTransactExtrinsic = ({
        targetParaId, encodedCall, fungible, requireWeightAtMost, proxyAccount,
    }) => {
        const totalInstructionWeight = 6 * instructionWeight;
        const xcmpExtrinsic = this.api.tx.polkadotXcm.send(
            {
                V1: {
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
                                        interior: { X1: { Parachain: Shibuya.paraId } },
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
                                        interior: { X1: { Parachain: Shibuya.paraId } },
                                        parents: 1,
                                    },
                                },
                            },
                            weightLimit: { Limited: requireWeightAtMost + totalInstructionWeight },
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

    createReserveTransferAssetsExtrinsic = (targetParaId, proxyAccount, amount) => {
        const extrinsic = this.api.tx.polkadotXcm.reserveTransferAssets(
            {
                V1: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                V1: {
                    interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyAccount } } },
                    parents: 0,
                },
            },
            {
                V1: [
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
    getDecimalBySymbol(symbol) {
        const token = _.find(this.assets, { symbol });
        return token.decimals;
    }
}

export default new ShibuyaHelper();
