/* eslint-disable no-throw-literal */
import BN from 'bn.js';
import _ from 'lodash';
import { Mangata } from '@mangata-finance/sdk';
import Keyring from '@polkadot/keyring';
import {
    sendExtrinsic, getProxyAccount, getFloatFromBN, getDecimalBN,
} from './utils';
import { env, tokenConfig } from './constants';

const { TURING_PARA_ID } = env;
class MangataHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const mangata = Mangata.getInstance([this.config.endpoint]);
        const mangataApi = await mangata.getApi();

        this.mangata = mangata;
        this.api = mangataApi;
        this.keyring = new Keyring({ type: 'sr25519', ss58Format: this.config.ss58 });

        await this.updateAssets();
    /**
    [
      {"id":"0","chainId":0,"decimals":18,"name":"Mangata","symbol":"MGR","address":""},
      {"id":"4","chainId":0,"decimals":12,"name":"Rococo  Native","symbol":"ROC","address":""},
      {"id":"7","chainId":0,"decimals":10,"name":"Turing native token","symbol":"TUR","address":""}
    ]
     */
    };

    updateAssets = async () => {
        const assetsResp = await this.mangata.getAssetsInfo();
        this.assets = _.values(_.filter(assetsResp, (asset) => !_.isEmpty(asset.symbol)));
        console.log('Assets on Mangata chain: ', this.assets);
    };

    getBalance = async (address, symbol) => {
        const tokenId = (_.find(this.assets, { symbol })).id;
        const balance = await this.mangata.getTokenBalance(tokenId, address);
        return balance;
    };

    getTokenIdBySymbol(symbol) {
        const token = _.find(this.assets, { symbol });
        return token.id;
    }

    getDecimalsBySymbol(symbol) {
        const token = _.find(this.assets, { symbol });
        return token.decimals;
    }

    getProxyAccount = (address, paraId) => {
        const accountId = getProxyAccount(this.api, paraId, address);
        return this.keyring.encodeAddress(accountId);
    };

    addProxy = async (proxyAccount, proxyType, keyPair) => sendExtrinsic(this.api, this.api.tx.proxy.addProxy(proxyAccount, proxyType, 0), keyPair);

    createProxyCall = async (address, proxyType, extrinsic) => this.api.tx.proxy.proxy(address, proxyType, extrinsic);

    initIssuance = async (keyPair) => {
        await sendExtrinsic(this.api, this.api.tx.issuance.finalizeTge(), keyPair, { isSudo: true });
        await sendExtrinsic(this.api, this.api.tx.issuance.initIssuanceConfig(), keyPair, { isSudo: true });
    };

    mintToken = async (address, symbol, keyPair, amount = 5000000000000000) => {
        const tokenId = (_.find(this.assets, { symbol })).id;
        const mintTokenExtrinsic = this.api.tx.tokens.mint(tokenId, address, amount);
        await sendExtrinsic(this.api, mintTokenExtrinsic, keyPair, { isSudo: true });
    };

    createPool = async (firstSymbol, secondSymbol, firstAmount, secondAmount, keyPair) => {
        const firstTokenId = (_.find(this.assets, { symbol: firstSymbol })).id;
        const secondTokenId = (_.find(this.assets, { symbol: secondSymbol })).id;

        await this.mangata.createPool(keyPair, firstTokenId.toString(), firstAmount, secondTokenId.toString(), secondAmount);
    };

    async updatePoolPromotion(symbol, liquidityMiningIssuanceWeight, keyPair) {
        const tokenId = this.getTokenIdBySymbol(symbol);
        const promotePoolExtrinsic = this.api.tx.xyk.updatePoolPromotion(tokenId, 100);
        await sendExtrinsic(this.api, promotePoolExtrinsic, keyPair, { isSudo: true });
    }

    async activateLiquidityV2(symbol, amount, keyPair) {
        const tokenId = this.getTokenIdBySymbol(symbol);
        const extrinsic = this.api.tx.xyk.activateLiquidityV2(tokenId, amount, undefined);
        await sendExtrinsic(this.api, extrinsic, keyPair, { isSudo: true });
    }

    getMintLiquidityFee = async ({
        pair, firstTokenSymbol, secondTokenSymbol, firstTokenAmount, expectedSecondTokenAmount,
    }) => {
        const firstTokenId = this.getTokenIdBySymbol(firstTokenSymbol);
        const secondTokenId = this.getTokenIdBySymbol(secondTokenSymbol);

        const firstDecimal = this.getDecimalsBySymbol(firstTokenSymbol);
        const firstDecimalBN = getDecimalBN(firstDecimal);
        const firstTokenAmountBN = new BN(firstTokenAmount, 10);

        const secondTokenDecimal = this.getDecimalsBySymbol(secondTokenSymbol);
        const secondTokenDecimalBN = getDecimalBN(secondTokenDecimal);
        const secondTokenAmountBN = new BN(expectedSecondTokenAmount, 10);

        const firstAmount = firstTokenAmountBN.mul(firstDecimalBN);
        const expectedSecondAmount = secondTokenAmountBN.mul(secondTokenDecimalBN);

        console.log('firstTokenId', firstTokenId, 'secondTokenId', secondTokenId, 'firstAmount', firstAmount.toString(), 'expectedSecondAmount', expectedSecondAmount.toString());

        const fees = await this.mangata.mintLiquidityFee(pair, firstTokenId, secondTokenId, firstAmount, expectedSecondAmount);

        console.log('fees', fees);

        return fees;
    };

    mintLiquidity = async ({
        pair, firstTokenSymbol, secondTokenSymbol, firstTokenAmount, expectedSecondTokenAmount,
    }) => {
        const firstTokenId = this.getTokenIdBySymbol(firstTokenSymbol);
        const secondTokenId = this.getTokenIdBySymbol(secondTokenSymbol);

        const firstDecimal = this.getDecimalsBySymbol(firstTokenSymbol);
        const firstDecimalBN = getDecimalBN(firstDecimal);
        const firstTokenAmountBN = new BN(firstTokenAmount, 10);

        const secondTokenDecimal = this.getDecimalsBySymbol(secondTokenSymbol);
        const secondTokenDecimalBN = getDecimalBN(secondTokenDecimal);
        const secondTokenAmountBN = new BN(expectedSecondTokenAmount, 10);

        const amount = firstTokenAmountBN.mul(firstDecimalBN);
        const expectedSecondAmount = secondTokenAmountBN.mul(secondTokenDecimalBN);

        console.log('firstTokenId', firstTokenId, 'secondTokenId', secondTokenId, 'firstAmount', amount.toString(), 'expectedSecondAmount', expectedSecondAmount.toString());

        return this.mangata.mintLiquidity(pair, firstTokenId, secondTokenId, amount, expectedSecondAmount)
            .then((events) => {
                const lastEvent = _.last(events);

                if (lastEvent.section === 'system' && lastEvent.method === 'ExtrinsicFailed') {
                    const txPaymentEvent = _.find(events, (event) => {
                        const { section, method } = event;
                        return section === 'transactionPayment' && method === 'TransactionFeePaid';
                    });

                    throw {
                        message: lastEvent?.error?.documentation, feePayer: txPaymentEvent?.eventData[0]?.data,
                    };
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
    };

    async provideLiquidity(keyPair, liquidityAsset, providedAsset, providedAssetAmount) {
        const liquidityAssetId = this.getTokenIdBySymbol(liquidityAsset);
        const providedAssetId = this.getTokenIdBySymbol(providedAsset);
        const tx = this.api.tx.xyk.provideLiquidityWithConversion(liquidityAssetId, providedAssetId, providedAssetAmount);
        await sendExtrinsic(this.api, tx, keyPair, { isSudo: false });
    }

    /**
   * Swap sellSymol for buySymbol
   */
    async swap(sellSymbol, buySymbol, keyPair, amount = '1000000000000') {
        const sellTokenId = this.getTokenIdBySymbol(sellSymbol);
        const buyTokenId = this.getTokenIdBySymbol(buySymbol);

        console.log('selltokenId', sellTokenId);
        console.log('buytokenId', buyTokenId);

        // The last param is the max amount; setting it a very large number for now
        await this.mangata.buyAsset(keyPair, sellTokenId, buyTokenId, new BN(amount), new BN('100000000000000000000000000'));
    }

    getPools = async ({ isPromoted, thousandSeparator }) => {
        const pools = await this.mangata.getPools();
        const that = this;

        const filterd = isPromoted ? _.filter(pools, (item) => item.isPromoted) : pools;

        const formatted = _.map(filterd, (item) => {
            const firstToken = _.find(that.assets, { id: item.firstTokenId });
            const firstTokenAmountFloat = getFloatFromBN(item.firstTokenAmount, firstToken.decimals, 2, thousandSeparator);

            const secondToken = _.find(that.assets, { id: item.secondTokenId });
            const secondTokenAmountFloat = getFloatFromBN(item.secondTokenAmount, secondToken.decimals, 2, thousandSeparator);

            return _.extend(item, {
                firstTokenAmountFloat,
                // firstTokenRatioFloat,
                secondTokenAmountFloat,
                // secondTokenRatioFloat,
            });
        });

        return formatted;
    };

    transferTur = async (amount, address, keyPair) => {
        const publicKey = this.keyring.decodeAddress(address);
        const publicKeyHex = `0x${Buffer.from(publicKey).toString('hex')}`;

        const currencyId = this.getTokenIdBySymbol('TUR');

        const dest = {
            V1: {
                parents: 1,
                interior: {
                    X2: [
                        { Parachain: TURING_PARA_ID },
                        {
                            AccountId32: {
                                network: 'Any',
                                id: publicKeyHex,
                            },
                        },
                    ],
                },
            },
        };

        const extrinsic = this.api.tx.xTokens.transfer(currencyId, amount, dest, 6000000000);
        await sendExtrinsic(this.api, extrinsic, keyPair);
    };

    calculateRewardsAmount = async (address, symbol) => {
        const liquidityTokenId = this.getTokenIdBySymbol(symbol);
        console.log('address', address, 'liquidityTokenId', liquidityTokenId);
        const bnNumber = await this.mangata.calculateRewardsAmount(address, liquidityTokenId);

        // We assume the reward is in MGR which should always be the case
        const { decimal } = tokenConfig.MGR;
        const result = bnNumber.div(new BN(decimal));

        return result.toNumber();
    };
}

export default MangataHelper;
