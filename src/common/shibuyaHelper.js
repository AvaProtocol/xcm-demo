import _ from 'lodash';
import { BN } from 'bn.js';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { decodeAddress, blake2AsU8a } from '@polkadot/util-crypto';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { TypeRegistry } from '@polkadot/types';
import Keyring from '@polkadot/keyring';

import {
    WEIGHT_REF_TIME_PER_SECOND, calculateXcmOverallWeight, getProxies, paraIdToLocation,
} from './utils';

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

    getProxyAccount = (address, paraId, { accountType = 'AccountId32' } = {}) => {
        const decodedAddress = accountType === 'AccountKey20' ? hexToU8a(address) : decodeAddress(address);

        // Calculate Hash Component
        const registry = new TypeRegistry();
        const toHash = new Uint8Array([
            ...new TextEncoder().encode('SiblingChain'),
            ...registry.createType('Compact<u32>', paraId).toU8a(),
            ...registry.createType('Compact<u32>', accountType.length + (accountType === 'AccountKey20' ? 20 : 32)).toU8a(),
            ...new TextEncoder().encode(accountType),
            ...decodedAddress,
        ]);

        const deriveAccountId = u8aToHex(blake2AsU8a(toHash).slice(0, 32));
        return this.keyring.encodeAddress(deriveAccountId);
    };

    getProxies = async (address) => getProxies(this.api, address);

    getBalance = async (address) => {
        const balance = (await this.api.query.system.account(address))?.data;
        return balance;
    };

    createTransactExtrinsic = ({
        targetParaId, encodedCall, proxyAccount, transactCallWeight, overallWeight, fee,
    }) => {
        const xcmpExtrinsic = this.api.tx.polkadotXcm.send(
            {
                V3: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                V3: [
                    {
                        WithdrawAsset: [
                            {
                                fun: { Fungible: fee },
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
                                fun: { Fungible: fee },
                                id: {
                                    Concrete: {
                                        interior: { X1: { Parachain: this.config.paraId } },
                                        parents: 1,
                                    },
                                },
                            },
                            weightLimit: { Limited: overallWeight },
                        },
                    },
                    {
                        Transact: {
                            originKind: 'SovereignAccount',
                            requireWeightAtMost: transactCallWeight,
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
                                interior: { X1: { AccountId32: { network: null, id: proxyAccount } } },
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
                V3: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                V3: {
                    interior: { X1: { AccountId32: { network: null, id: proxyAccount } } },
                    parents: 0,
                },
            },
            {
                V3: [
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

    calculateXcmTransactOverallWeight = (transactCallWeight) => calculateXcmOverallWeight(transactCallWeight, this.config.instructionWeight, 6);

    weightToFee = (weight, symbol) => {
        const { feePerSecond } = _.find(this.assets, { symbol });
        return weight.refTime.mul(new BN(feePerSecond)).div(new BN(WEIGHT_REF_TIME_PER_SECOND));
    };

    getAssetLocation = (symbol) => {
        const { location } = _.find(this.assets, { symbol });
        return location;
    };

    getLocation = () => paraIdToLocation(this.config.paraId);

    getNativeAssetLocation = () => this.getAssetLocation(this.config.symbol);
}

export default ShibuyaHelper;
