import _ from 'lodash';
import BN from 'bn.js';
import { Mangata } from '@mangata-finance/sdk';
import { getDecimalBN, sendExtrinsic } from './utils';
import ChainHelper from './chainHelper';

class MangataHelper extends ChainHelper {
    initialize = async () => {
        this.mangataSdk = Mangata.getInstance([this.config.endpoint]);
        this.api = await this.mangataSdk.getApi();
    };

    getMangataSdk() {
        return this.mangataSdk;
    }

    initIssuance = async (keyPair) => {
        await sendExtrinsic(this.api, this.api.tx.issuance.finalizeTge(), keyPair, { isSudo: true });
        await sendExtrinsic(this.api, this.api.tx.issuance.initIssuanceConfig(), keyPair, { isSudo: true });
    };

    mintToken = async (accountId, assetId, keyPair, amount = 5000000000000000) => {
        const mintTokenExtrinsic = this.api.tx.tokens.mint(assetId, accountId, amount);
        await sendExtrinsic(this.api, mintTokenExtrinsic, keyPair, { isSudo: true });
    };

    createPool = async ({
        firstAssetId, firstAmount, secondAssetId, secondAmount, keyringPair,
    }) => this.mangataSdk.createPool(keyringPair, _.toString(firstAssetId), firstAmount, _.toString(secondAssetId), secondAmount);

    async updatePoolPromotion(tokenId, liquidityMiningIssuanceWeight, keyringPair) {
        const promotePoolExtrinsic = this.api.tx.proofOfStake.updatePoolPromotion(tokenId, liquidityMiningIssuanceWeight);
        await sendExtrinsic(this.api, promotePoolExtrinsic, keyringPair, { isSudo: true });
    }

    getMintLiquidityFee = async ({
        pair, firstAsset, firstTokenAmount, secondAsset, expectedSecondTokenAmount,
    }) => {
        const firstDecimalBN = getDecimalBN(firstAsset.decimals);
        const secondDecimalBN = getDecimalBN(secondAsset.decimals);
        const firstAmount = (new BN(firstTokenAmount, 10)).mul(firstDecimalBN);
        const expectedSecondAmount = (new BN(expectedSecondTokenAmount, 10)).mul(secondDecimalBN);
        const fees = await this.mangataSdk.mintLiquidityFee(pair, firstAsset.id, secondAsset.id, firstAmount, expectedSecondAmount);
        return fees;
    };

    mintLiquidity = async ({
        pair, firstTokenId, firstTokenAmount, secondTokenId, expectedSecondTokenAmount,
    }) => this.mangataSdk.mintLiquidity(pair, firstTokenId, secondTokenId, firstTokenAmount, expectedSecondTokenAmount)
        .then((events) => {
            const lastEvent = _.last(events);

            if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicFailed') {
                const txPaymentEvent = _.find(events, (event) => {
                    const { section, method } = event;
                    return section === 'transactionPayment' && method === 'TransactionFeePaid';
                });

                const error = new Error(lastEvent?.error?.documentation);
                error.feePayer = txPaymentEvent?.eventData[0]?.data;
                throw error;
            } if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicSuccess') {
                const matchedEvent = _.find(events, (event) => {
                    if (event.section === 'xyk' && event.method === 'LiquidityMinted') {
                        return event;
                    }

                    return undefined;
                });

                if (!_.isUndefined(matchedEvent)) {
                    const address = matchedEvent.eventData[0]?.data;
                    const firstId = new BN(matchedEvent.eventData[1]?.data);
                    const secondId = new BN(matchedEvent.eventData[3]?.data);
                    const firstAmount = new BN(matchedEvent.eventData[2]?.data);
                    const secondAmount = new BN(matchedEvent.eventData[4]?.data);

                    return {
                        module: 'xyk.LiquidityMinted', address, firstId: firstId.toNumber(), firstAmount: firstAmount.toString(), secondId: secondId.toNumber(), secondAmount: secondAmount.toString(),
                    };
                }

                return events;
            }

            return events;
        });

    /**
     * Swap sellTokenId for buyTokenId
     */
    async swap(sellTokenId, buyTokenId, keyPair, amount = '1000000000000') {
        console.log('selltokenId', sellTokenId);
        console.log('buytokenId', buyTokenId);

        // The last param is the max amount; setting it a very large number for now
        await this.mangata.buyAsset(keyPair, sellTokenId, buyTokenId, new BN(amount), new BN('100000000000000000000000000'));
    }

    getPools = async ({ isPromoted } = {}) => {
        const pools = await this.mangataSdk.getPools();
        const filterdPools = isPromoted ? _.filter(pools, (item) => item.isPromoted) : pools;
        return filterdPools;
    };

    // eslint-disable-next-line class-methods-use-this
    formatPool = (pool, firstAssetDecimals, secondAssetDecimals) => {
        const firstTokenAmountFloat = (new BN(pool.firstTokenAmount)).div(getDecimalBN(firstAssetDecimals));
        const secondTokenAmountFloat = (new BN(pool.secondTokenAmount)).div(getDecimalBN(secondAssetDecimals));
        return _.extend(pool, { firstTokenAmountFloat, secondTokenAmountFloat });
    };

    calculateRewardsAmount = async (address, liquidityAsset) => {
        const amountBN = await this.mangataSdk.calculateRewardsAmount(address, _.toString(liquidityAsset.id));
        const decimalBN = getDecimalBN(liquidityAsset.decimals);
        const result = amountBN.div(decimalBN);
        return result.toString();
    };

    /**
     * Extrinsic that transfers Token Id in value amount from origin to destination
     * @param {string | Keyringpair} account
     * @param {string} tokenId
     * @param {string} address
     * @param {BN} amount
     * @param {TxOptions} [txOptions]
     *
     * @returns {(MangataGenericEvent|Array)}
     */
    transferToken = async ({
        keyPair, sender, tokenId, decimals, dest, amount,
    }) => {
        const decimalBN = getDecimalBN(decimals);
        const amountBN = new BN(amount, 10);
        // console.log('decimalBN.mul.amountBN', decimalBN.mul(amountBN).toString());
        console.log(`Sending ${amount} #${tokenId} token from ${sender} to ${dest} ...`);

        return this.mangataSdk.transferToken(
            keyPair,
            tokenId,
            dest,
            decimalBN.mul(amountBN),
            {
                // statusCallback: (result) => {
                //     // result is of the form ISubmittableResult
                //     console.log('statusCallback.result', result);
                //     console.log('statusCallback.result.status', result.status);
                // },
                // extrinsicStatus: (result) => {
                //     // result is of the form MangataGenericEvent[]
                //     for (let index = 0; index < result.length; index += 1) {
                //         console.log('Phase', result[index].phase.toString());
                //         console.log('Section', result[index].section);
                //         console.log('Method', result[index].method);
                //         console.log('Documentation', result[index].metaDocumentation);
                //     }
                // },
            },
        ).then((events) => {
            let sentSource;
            let sentDest;
            let sentAmountBN;

            const lastEvent = _.last(events);

            if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicFailed') {
                const txPaymentEvent = _.find(events, (event) => {
                    const { section, method } = event;
                    return section === 'transactionPayment' && method === 'TransactionFeePaid';
                });

                const error = new Error(lastEvent?.error?.documentation);
                error.feePayer = txPaymentEvent?.eventData[0]?.data;
                error.recipient = sentDest;
                throw error;
            } if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicSuccess') {
                const transferEvent = _.find(events, (event) => {
                    if (event.section === 'tokens' && event.method === 'Transfer') {
                        return event;
                    }

                    return undefined;
                });

                if (!_.isUndefined(transferEvent)) {
                    sentSource = transferEvent.eventData[1]?.data;
                    sentDest = transferEvent.eventData[2]?.data;

                    const inputBN = new BN(transferEvent.eventData[3]?.data);
                    sentAmountBN = inputBN.div(decimalBN);
                }

                return {
                    module: 'tokens.Transfer', sender: sentSource, recipient: sentDest, amount: sentAmountBN.toNumber(),
                };
            }

            return events;
        });
    };

    disconnect = async () => {
        this.mangataSdk.disconnect();
    };
}

export default MangataHelper;
