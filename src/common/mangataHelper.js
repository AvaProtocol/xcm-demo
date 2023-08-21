/* eslint-disable no-throw-literal */
import BN from 'bn.js';
import _ from 'lodash';
import { Mangata } from '@mangata-finance/sdk';
import Keyring from '@polkadot/keyring';

import {
    sendExtrinsic, getProxyAccount, getDecimalBN, calculateXcmOverallWeight, WEIGHT_REF_TIME_PER_SECOND, paraIdToLocation,
} from './utils';

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
        const assets = _.values(_.filter(assetsResp, (asset) => !_.isEmpty(asset.symbol)));
        this.assets = _.map(assets, (asset) => {
            const localAsset = _.find(this.config.assets, { symbol: asset.symbol, id: asset.id });
            return localAsset ? { ...asset, ...localAsset } : asset;
        });
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
        const { accountId32 } = getProxyAccount(this.api, paraId, address);
        return this.keyring.encodeAddress(accountId32);
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

    /**
     *
     * @param {*} firstTokenId
     * @param {*} secondTokenId
     * @param {number} firstAmount Amount in token unit, not planck
     * @param {number} secondAmount Amount in token unit, not planck
     * @param {*} keyPair
     */
    createPool = async ({
        firstTokenId, firstAmount, secondTokenId, secondAmount, keyPair,
    }) => {
        const firstToken = _.find(this.assets, { id: firstTokenId });
        const firstTokenDecimals = getDecimalBN(firstToken.decimals);
        const firstAmountBN = (new BN(firstAmount)).mul(firstTokenDecimals);

        const secondToken = _.find(this.assets, { id: secondTokenId });
        const secondTokenDecimals = getDecimalBN(secondToken.decimals);
        const secondAmountBN = (new BN(secondAmount)).mul(secondTokenDecimals);

        return this.mangata.createPool(keyPair, _.toString(firstTokenId), firstAmountBN, _.toString(secondTokenId), secondAmountBN);
    };

    async updatePoolPromotion(tokenId, liquidityMiningIssuanceWeight, keyPair) {
        const promotePoolExtrinsic = this.api.tx.proofOfStake.updatePoolPromotion(tokenId, liquidityMiningIssuanceWeight);
        await sendExtrinsic(this.api, promotePoolExtrinsic, keyPair, { isSudo: true });
    }

    /**
     *
     * @param {string} tokenId Token id
     * @param {number} amount Amount in token unit, not planck
     * @param {*} keyPair Account key pair to sign the extrinsic
     */
    async activateLiquidityV2({ tokenId, amount, keyPair }) {
        const token = _.find(this.assets, { id: tokenId });
        const decimalBN = getDecimalBN(token.decimals);
        const amountBN = (new BN(amount)).mul(decimalBN);

        const extrinsic = this.api.tx.xyk.activateLiquidityV2(tokenId, amountBN, undefined);
        await sendExtrinsic(this.api, extrinsic, keyPair, { isSudo: true });
    }

    getMintLiquidityFee = async ({
        pair, firstTokenId, firstTokenAmount, secondTokenId, expectedSecondTokenAmount,
    }) => {
        const firstToken = _.find(this.assets, { id: firstTokenId });
        const firstDecimalBN = getDecimalBN(firstToken.decimals);

        const secondToken = _.find(this.assets, { id: secondTokenId });
        const secondDecimalBN = getDecimalBN(secondToken.decimals);

        const firstAmount = (new BN(firstTokenAmount, 10)).mul(firstDecimalBN);
        const expectedSecondAmount = (new BN(expectedSecondTokenAmount, 10)).mul(secondDecimalBN);

        const fees = await this.mangata.mintLiquidityFee(pair, firstTokenId, secondTokenId, firstAmount, expectedSecondAmount);

        return fees;
    };

    mintLiquidity = async ({
        pair, firstTokenId, firstTokenAmount, secondTokenId, expectedSecondTokenAmount,
    }) => {
        const firstToken = _.find(this.assets, { id: firstTokenId });
        const firstDecimalBN = getDecimalBN(firstToken.decimals);

        const secondToken = _.find(this.assets, { id: secondTokenId });
        const secondDecimalBN = getDecimalBN(secondToken.decimals);

        const amountBN = (new BN(firstTokenAmount, 10)).mul(firstDecimalBN);
        const expectedSecondAmountBN = (new BN(expectedSecondTokenAmount)).mul(secondDecimalBN);

        return this.mangata.mintLiquidity(pair, firstTokenId, secondTokenId, amountBN, expectedSecondAmountBN)
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

    /**
     *
     * @param {object} param0 options
     * @param {boolean} param0.isPromoted Only list promoted pools if true; this value has to be specified
     * @returns
     */
    getPools = async ({ isPromoted } = {}) => {
        const pools = await this.mangata.getPools();
        const filterdPools = isPromoted ? _.filter(pools, (item) => item.isPromoted) : pools;
        return filterdPools;
    };

    formatPool = (pool) => {
        const firstToken = _.find(this.assets, { id: pool.firstTokenId });
        const firstTokenAmountFloat = (new BN(pool.firstTokenAmount)).div(getDecimalBN(firstToken.decimals));

        const secondToken = _.find(this.assets, { id: pool.secondTokenId });
        const secondTokenAmountFloat = (new BN(pool.secondTokenAmount)).div(getDecimalBN(secondToken.decimals));

        return _.extend(pool, {
            firstTokenAmountFloat,
            secondTokenAmountFloat,
        });
    };

    transferTur = async (amount, address, paraId, keyPair) => {
        const publicKey = this.keyring.decodeAddress(address);
        const publicKeyHex = `0x${Buffer.from(publicKey).toString('hex')}`;

        const currencyId = this.getTokenIdBySymbol('TUR');

        const dest = {
            V3: {
                parents: 1,
                interior: {
                    X2: [
                        { Parachain: paraId },
                        { AccountId32: { network: null, id: publicKeyHex } },
                    ],
                },
            },
        };

        const extrinsic = this.api.tx.xTokens.transfer(currencyId, amount, dest, 6000000000);
        await sendExtrinsic(this.api, extrinsic, keyPair);
    };

    calculateRewardsAmount = async (address, tokenId) => {
        // console.log('calculateRewardsAmount: address', address, 'liquidityTokenId', _.toString(tokenId));
        const amountBN = await this.mangata.calculateRewardsAmount(address, _.toString(tokenId));
        const token = _.find(this.assets, { id: tokenId });
        const decimalBN = getDecimalBN(token.decimals);

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

        return this.mangata.transferToken(
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

                throw {
                    message: lastEvent?.error?.documentation, feePayer: txPaymentEvent?.eventData[0]?.data, recipient: sentDest,
                };
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

    getLocation = () => paraIdToLocation(this.config.paraId);
}

export default MangataHelper;
