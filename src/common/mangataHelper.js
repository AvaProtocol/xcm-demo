import BN from 'bn.js';
import _ from 'lodash';
import { Mangata } from '@mangata-finance/sdk';
import Keyring from '@polkadot/keyring';
import { sendExtrinsic, getProxyAccount } from './utils';
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
        const tokenId = (_.find(this.assets, { symbol })).id;
        return tokenId;
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
        console.log('symbol', symbol, 'tokenId', tokenId);
        const promotePoolExtrinsic = this.api.tx.xyk.updatePoolPromotion(tokenId, 100);
        await sendExtrinsic(this.api, promotePoolExtrinsic, keyPair, { isSudo: true });
    }

    async activateLiquidityV2(symbol, amount, keyPair) {
        const tokenId = this.getTokenIdBySymbol(symbol);
        const extrinsic = this.api.tx.xyk.activateLiquidityV2(tokenId, amount, undefined);
        await sendExtrinsic(this.api, extrinsic, keyPair, { isSudo: true });
    }

    async mintLiquidity(firstSymbol, firstAssetAmount, secondSymbol, expectedSecondAssetAmount, keyPair) {
        const firstTokenId = (_.find(this.assets, { symbol: firstSymbol })).id;
        const secondTokenId = (_.find(this.assets, { symbol: secondSymbol })).id;
        console.log('secondTokenId: ', secondTokenId);
        const extrinsic = this.api.tx.xyk.mintLiquidity(firstTokenId, secondTokenId, firstAssetAmount, expectedSecondAssetAmount);
        await sendExtrinsic(this.api, extrinsic, keyPair);
    }

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

    getPools = async () => this.mangata.getPools();

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
