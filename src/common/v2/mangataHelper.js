import _ from 'lodash';
import BN from 'bn.js';
import { Mangata } from '@mangata-finance/sdk';
import { getDecimalBN, sendExtrinsic } from '../utils';

class MangataHelper {
    initialize = async () => {
        this.mangataSdk = Mangata.getInstance([this.config.endpoint]);
        this.api = await this.mangataSdk.getApi();
    };

    getMangataSdk() {
        return this.mangataSdk;
    }

    calculateRewardsAmount = async (address, liquidityAsset) => {
        const amountBN = await this.mangataSdk.calculateRewardsAmount(address, _.toString(liquidityAsset.id));
        const decimalBN = getDecimalBN(liquidityAsset.decimals);
        const result = amountBN.div(decimalBN);
        return result.toString();
    };

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

    // eslint-disable-next-line class-methods-use-this
    formatPool = (pool, firstAssetDecimals, secondAssetDecimals) => {
        const firstTokenAmountFloat = (new BN(pool.firstTokenAmount)).div(getDecimalBN(firstAssetDecimals));
        const secondTokenAmountFloat = (new BN(pool.secondTokenAmount)).div(getDecimalBN(secondAssetDecimals));
        return _.extend(pool, { firstTokenAmountFloat, secondTokenAmountFloat });
    };

    initIssuance = async (keyPair) => {
        await sendExtrinsic(this.api, this.api.tx.issuance.finalizeTge(), keyPair, { isSudo: true });
        await sendExtrinsic(this.api, this.api.tx.issuance.initIssuanceConfig(), keyPair, { isSudo: true });
    };

    mintToken = async (accountId, assetId, keyPair, amount = 5000000000000000) => {
        const mintTokenExtrinsic = this.api.tx.tokens.mint(assetId, accountId, amount);
        await sendExtrinsic(this.api, mintTokenExtrinsic, keyPair, { isSudo: true });
    };

    getPools = async ({ isPromoted } = {}) => {
        const pools = await this.mangataSdk.getPools();
        const filterdPools = isPromoted ? _.filter(pools, (item) => item.isPromoted) : pools;
        return filterdPools;
    };

    getTokenIdBySymbol(symbol) {
        throw new Error('Method not implement');
        // const token = _.find(this.assets, { symbol });
        // return token.id;
    }

    createPool = async ({
        firstTokenId, firstAmount, secondTokenId, secondAmount, keyringPair,
    }) => {
        throw new Error('Method not implement');
        // const firstToken = _.find(this.assets, { id: firstTokenId });
        // const firstTokenDecimals = getDecimalBN(firstToken.decimals);
        // const firstAmountBN = (new BN(firstAmount)).mul(firstTokenDecimals);

        // const secondToken = _.find(this.assets, { id: secondTokenId });
        // const secondTokenDecimals = getDecimalBN(secondToken.decimals);
        // const secondAmountBN = (new BN(secondAmount)).mul(secondTokenDecimals);

        // return this.mangata.createPool(keyPair, _.toString(firstTokenId), firstAmountBN, _.toString(secondTokenId), secondAmountBN);
    };

    updatePoolPromotion = async(tokenId, liquidityMiningIssuanceWeight, keyPair) => {
        throw new Error('Method not implement');
        // const promotePoolExtrinsic = this.api.tx.proofOfStake.updatePoolPromotion(tokenId, liquidityMiningIssuanceWeight);
        // await sendExtrinsic(this.api, promotePoolExtrinsic, keyPair, { isSudo: true });
    };

    mintLiquidity = async ({
        pair, firstTokenId, firstTokenAmount, secondTokenId, expectedSecondTokenAmount,
    }) => {
        throw new Error('Method not implement');
        // const firstToken = _.find(this.assets, { id: firstTokenId });
        // const firstDecimalBN = getDecimalBN(firstToken.decimals);

        // const secondToken = _.find(this.assets, { id: secondTokenId });
        // const secondDecimalBN = getDecimalBN(secondToken.decimals);

        // const amountBN = (new BN(firstTokenAmount, 10)).mul(firstDecimalBN);
        // const expectedSecondAmountBN = (new BN(expectedSecondTokenAmount)).mul(secondDecimalBN);

        // return this.mangata.mintLiquidity(pair, firstTokenId, secondTokenId, amountBN, expectedSecondAmountBN)
        //     .then((events) => {
        //         const lastEvent = _.last(events);

        //         if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicFailed') {
        //             const txPaymentEvent = _.find(events, (event) => {
        //                 const { section, method } = event;
        //                 return section === 'transactionPayment' && method === 'TransactionFeePaid';
        //             });

        //             throw {
        //                 message: lastEvent?.error?.documentation, feePayer: txPaymentEvent?.eventData[0]?.data,
        //             };
        //         } if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicSuccess') {
        //             const matchedEvent = _.find(events, (event) => {
        //                 if (event.section === 'xyk' && event.method === 'LiquidityMinted') {
        //                     return event;
        //                 }

        //                 return undefined;
        //             });

        //             if (!_.isUndefined(matchedEvent)) {
        //                 const address = matchedEvent.eventData[0]?.data;
        //                 const firstId = new BN(matchedEvent.eventData[1]?.data);
        //                 const secondId = new BN(matchedEvent.eventData[3]?.data);
        //                 const firstAmount = new BN(matchedEvent.eventData[2]?.data);
        //                 const secondAmount = new BN(matchedEvent.eventData[4]?.data);

        //                 return {
        //                     module: 'xyk.LiquidityMinted', address, firstId: firstId.toNumber(), firstAmount: firstAmount.toString(), secondId: secondId.toNumber(), secondAmount: secondAmount.toString(),
        //                 };
        //             }

        //             return events;
        //         }

        //         return events;
        //     });
    };
}

export default MangataHelper;
