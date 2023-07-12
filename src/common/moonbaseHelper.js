import _ from 'lodash';
import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { BN } from 'bn.js';

import {
    WEIGHT_REF_TIME_PER_SECOND, calculateXcmOverallWeight, getProxies, getProxyAccount,
} from './utils';

// frame_support::weights::constants::WEIGHT_PER_SECOND
// https://github.com/paritytech/substrate/blob/2dff067e9f7f6f3cc4dbfdaaa97753eccc407689/frame/support/src/weights.rs#L39
// https://github.com/paritytech/substrate/blob/2dff067e9f7f6f3cc4dbfdaaa97753eccc407689/primitives/weights/src/lib.rs#L48
const WEIGHT_PER_SECOND = 1000000000000;

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

    getProxyAccount = (address, paraId, options) => {
        const { accountKey20 } = getProxyAccount(this.api, paraId, address, options);
        return accountKey20;
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

    calculateXcmTransactOverallWeight = (transactCallWeight) => calculateXcmOverallWeight(transactCallWeight, this.config.instructionWeight, 4);

    weightToFee = (weight, symbol) => {
        const { feePerSecond } = _.find(this.assets, { symbol });
        return weight.refTime.mul(new BN(feePerSecond)).div(new BN(WEIGHT_REF_TIME_PER_SECOND));
    };
}

export default MoonbaseHelper;
