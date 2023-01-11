import BN from 'bn.js';
import _ from "lodash";
import { Mangata } from '@mangata-finance/sdk';
import { Keyring } from "@polkadot/api";
import { sendExtrinsic, getProxyAccount } from './utils';
import { env, tokenConfig } from './constants';

const { TURING_PARA_ID} = env;

class MangataHelper {
  initialize = async (mangataEndpoint) => {
    const mangata = Mangata.getInstance([mangataEndpoint]);
    const mangataApi = await mangata.getApi();

    this.mangata = mangata;
    this.api = mangataApi;

    await this.updateAssets();
    /**
    [
      {"id":"0","chainId":0,"decimals":18,"name":"Mangata","symbol":"MGR","address":""},
      {"id":"4","chainId":0,"decimals":12,"name":"Rococo  Native","symbol":"ROC","address":""},
      {"id":"7","chainId":0,"decimals":10,"name":"Turing native token","symbol":"TUR","address":""}
    ]
     */
  }

  updateAssets = async () => {
    const assetsResp = await this.mangata.getAssetsInfo();
    this.assets=_.values(_.filter(assetsResp, asset=> !_.isEmpty(asset.symbol)));
    console.log("Assets on Mangata chain: ", this.assets);
  }

  getBalance = async (symbol, address ) => {
    const tokenId = (_.find(this.assets, {symbol})).id;
    const balance = await this.mangata.getTokenBalance(tokenId, address);
    return balance;
  }

  getTokenIdBySymbol(symbol) {
    const tokenId = (_.find(this.assets, {symbol})).id;
    return tokenId;
  }

  getProxyAccount = (address) => getProxyAccount(this.api, TURING_PARA_ID, address)

  addProxy = async (proxyAccount, keyPair) => sendExtrinsic(this.api, this.api.tx.proxy.addProxy(proxyAccount, "Any", 0), keyPair);

  createProxyCall = async (address, extrinsic) => this.api.tx.proxy.proxy(address, 'Any', extrinsic);

  mintToken = async(address, symbol, keyring, amount=5000000000000000)=>{
    const tokenId = (_.find(this.assets, {symbol})).id;
    const mintTokenExtrinsic = this.api.tx.tokens.mint(tokenId, address, amount);
    await sendExtrinsic(this.api, mintTokenExtrinsic, keyring, { isSudo: true });
  }

  createPool = async (firstSymbol, secondSymbol, firstAmount, secondAmount, keyring) => {
    const firstTokenId = (_.find(this.assets, {symbol: firstSymbol})).id;
    const secondTokenId = (_.find(this.assets, {symbol: secondSymbol})).id;

    await this.mangata.createPool(keyring, firstTokenId.toString(), firstAmount, secondTokenId.toString(), secondAmount);
  }

  async promotePool(symbol, keyring) {
    const tokenId = this.getTokenIdBySymbol(symbol);
    console.log("symbol", symbol, "tokenId", tokenId);
    const promotePoolExtrinsic = this.api.tx.xyk.promotePool(tokenId);
    await sendExtrinsic(this.api, promotePoolExtrinsic, keyring, { isSudo: true });
  }

  async provideLiquidity(keyring, liquidityAsset, providedAsset, providedAssetAmount) {
    const liquidityAssetId = this.getTokenIdBySymbol(liquidityAsset);
    const providedAssetId = this.getTokenIdBySymbol(providedAsset);
    const tx = this.api.tx.xyk.provideLiquidityWithConversion(liquidityAssetId, providedAssetId, providedAssetAmount);

    await sendExtrinsic(this.api, tx, keyring, { isSudo: false });
  }

  /**
   * Swap sellSymol for buySymbol
   */
  async swap (sellSymbol, buySymbol, keyring, amount = '1000000000000' ) {
    const sellTokenId = this.getTokenIdBySymbol(sellSymbol);
    const buyTokenId = this.getTokenIdBySymbol(buySymbol);

    console.log("selltokenId", sellTokenId);
    console.log("buytokenId", buyTokenId);

    // The last param is the max amount; setting it a very large number for now
    await this.mangata.buyAsset(keyring, sellTokenId, buyTokenId, new BN(amount), new BN('100000000000000000000000000'));
  }

  getPools = async() =>{
    return this.mangata.getPools();
  }

  transferTur = async (amount, address, keyring) => {
    const publicKey = new Keyring().decodeAddress(address);
    const publicKeyHex = `0x${Buffer.from(publicKey).toString('hex')}`

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
              }
            }
          ]
        }
      }
    }

    const extrinsic = this.api.tx.xTokens.transfer(currencyId, amount, dest, 6000000000);
    await sendExtrinsic(this.api, extrinsic, keyring);
  }

  calculateRewardsAmount = async (address, symbol) => {
    const liquidityTokenId = this.getTokenIdBySymbol(symbol);
    console.log("address", address, "liquidityTokenId", liquidityTokenId);
    const bnNumber = await this.mangata.calculateRewardsAmount(address, liquidityTokenId);
    
    // We assume the reward is in MGR which should always be the case
    const decimal = tokenConfig.MGR.decimal;
    const result = bnNumber.div(new BN(decimal));
    
    return result.toNumber();
  }
}

export default new MangataHelper();
