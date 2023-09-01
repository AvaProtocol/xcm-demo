import _ from 'lodash';
import { decodeAddress, blake2AsU8a } from '@polkadot/util-crypto';
import { TypeRegistry } from '@polkadot/types';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { BN } from 'bn.js';

import {
    WEIGHT_REF_TIME_PER_SECOND, calculateXcmOverallWeight, getProxies, paraIdToLocation,
} from './utils';

class MoonbaseHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const api = await ApiPromise.create({
            provider: new WsProvider(this.config.endpoint),
        });

        this.api = api;
        this.assets = this.config.assets;
        this.keyring = new Keyring({ type: 'sr25519', ss58Format: this.config.ss58 });
    };

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

        return u8aToHex(blake2AsU8a(toHash).slice(0, 20));
    };

    getProxies = async (address) => getProxies(this.api, address);

    getBalance = async (address) => {
        const balance = (await this.api.query.system.account(address))?.data;
        return balance;
    };

    createTransactExtrinsic = ({
        targetParaId, encodedCall, callWeight, overallWeight, fee,
    }) => {
        const transactExtrinsic = this.api.tx.xcmTransactor.transactThroughSigned(
            {
                V3: {
                    parents: 1,
                    interior: { X1: { Parachain: targetParaId } },
                },
            },
            {
                currency: { AsCurrencyId: 'SelfReserve' },
                feeAmount: fee,
            },
            encodedCall,
            {
                transactRequiredWeightAtMost: callWeight,
                overallWeight,
            },
        );

        return transactExtrinsic;
    };

    calculateXcmTransactOverallWeight = (transactCallWeight) => calculateXcmOverallWeight(transactCallWeight, this.config.instructionWeight, 6);

    weightToFee = (weight, symbol) => {
        const { feePerSecond } = _.find(this.assets, { symbol });
        return weight.refTime.mul(new BN(feePerSecond)).div(new BN(WEIGHT_REF_TIME_PER_SECOND));
    };

    getAssetLocation = (symbol) => {
        const { location } = _.find(this.assets, { symbol });
        return location;
    };

    getNativeAssetLocation = () => this.getAssetLocation(this.config.symbol);

    getNativeAssetRelativeLocation = () => {
        const { relativeLocation } = _.find(this.assets, { symbol: this.config.symbol });
        return relativeLocation;
    };

    getLocation = () => paraIdToLocation(this.config.paraId);
}

export default MoonbaseHelper;
