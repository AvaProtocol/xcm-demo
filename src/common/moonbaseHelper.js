import { ApiPromise, WsProvider } from '@polkadot/api';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { BN } from 'bn.js';

import { getProxies, getProxyAccount } from './utils';

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
        targetParaId, encodedCall, feePerSecond, requireWeightAtMost, instructionWeight, proxyAccountId,
    }) => {
        // The instruction count of XCM message.
        // Because polkadotXcm.send will insert the DescendOrigin instruction at the head of the instructions list.
        // So instructionCount should be V2.length + 1
        console.log(`createTransactExtrinsic, targetParaId: ${targetParaId}, encodedCall: ${encodedCall}, feePerSecond: ${feePerSecond}, requireWeightAtMost: ${requireWeightAtMost}, instructionWeight: ${instructionWeight}, proxyAccountId: ${proxyAccountId}`);
        const instructionCount = 4;
        const totalInstructionWeight = instructionCount * instructionWeight;
        const weightLimit = requireWeightAtMost + totalInstructionWeight;
        const fungible = new BN(weightLimit).mul(feePerSecond).div(new BN(WEIGHT_PER_SECOND));
        console.log(`fungible: ${fungible.toString()}`);
        console.log(`weightLimit: ${weightLimit.toString()}`);

        const transactExtrinsic = this.api.tx.xcmTransactor.transactThroughSigned(
            {
                V1: {
                    parents: 1,
                    interior: {
                        X1: { Parachain: 2114 },
                    },
                },
            },
            {
                currency: {
                    AsCurrencyId: 'SelfReserve',
                    // AsMultiLocation: {
                    //     V1: {
                    //         parents: 1,
                    //         interior: {
                    //             X1: { Parachain: targetParaId },
                    //         },
                    //     },
                    // },
                },
                feeAmount: fungible,
            },
            encodedCall,
            { transactRequiredWeightAtMost: weightLimit },
        );
        return transactExtrinsic;
    };
}

export default MoonbaseHelper;
