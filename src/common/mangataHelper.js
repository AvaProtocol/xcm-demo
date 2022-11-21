import { Mangata } from '@mangata-finance/sdk';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from '@polkadot/util-crypto';
import BN from 'bn.js';
import _ from "lodash";
import { sendExtrinsic } from './utils';

const TURING_PARA_ID = 2114;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;

const DECIMAL = {
  MGR: '1000000000000000000',
  KSM: '1000000000000',
  TUR: '10000000000',
};
class MangataHelper {
  initialize = async (mangataEndpoint) => {
    const mangata = Mangata.getInstance([mangataEndpoint]);
    const mangataApi = await mangata.getApi();

    this.mangata = mangata;
    this.api = mangataApi;

    const assetsResp = await this.mangata.getAssetsInfo();
    this.assets=_.values(_.filter(assetsResp, asset=> !_.isEmpty(asset.symbol)));
    console.log("Assets on Mangata chain: ", this.assets);
    /**
    [
      {"id":"0","chainId":0,"decimals":18,"name":"Mangata","symbol":"MGR","address":""},
      {"id":"4","chainId":0,"decimals":12,"name":"Rococo  Native","symbol":"ROC","address":""},
      {"id":"7","chainId":0,"decimals":10,"name":"Turing native token","symbol":"TUR","address":""}
    ]
     */
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

  getProxyAccount = (address) => {
    const decodedAddress = decodeAddress(address); // An Int array presentation of the address’ ss58 public key
    
    const location = {
      parents: 1, // From Turing to Mangata
      interior: {
        X2: [
          { Parachain: TURING_PARA_ID },
          {
            AccountId32: {
              network: "Any",
              id: u8aToHex(decodedAddress),
            }
          }
        ]
      }
    };

    const multilocation = this.api.createType("XcmV1MultiLocation", location);

    console.log("multilocation", multilocation.toString());

    const toHash = new Uint8Array([
      ...new Uint8Array([32]),
      ...new TextEncoder().encode("multiloc"),
      ...multilocation.toU8a(),
    ]);

    const DescendOriginAddress32 = u8aToHex(this.api.registry.hash(toHash).slice(0, 32));

    return DescendOriginAddress32;
  }

  addProxy = async (proxyAccount, keyPair) => this.api.tx.proxy.addProxy(proxyAccount, "Any", 0).signAndSend(keyPair);

  createProxyCall = async (address, extrinsic) => this.api.tx.proxy.proxy(address, 'Any', extrinsic);

  mintToken = async(address, symbol, keyring, amount=5000000000000000)=>{
    const tokenId = (_.find(this.assets, {symbol})).id;
    const mintTokenExtrinsic = this.api.tx.tokens.mint(tokenId, address, amount);
    await sendExtrinsic(this.api, mintTokenExtrinsic, keyring, { isSudo: true });
  }

  createPool = async (firstSymbol, secondSymbol, keyring) => {
    const firstTokenId = (_.find(this.assets, {symbol: firstSymbol})).id;
    const secondTokenId = (_.find(this.assets, {symbol: secondSymbol})).id;

    return new Promise((resolve) => {
      this.mangata.createPool(
        keyring,
        firstTokenId.toString(),
        new BN('10000000000000000000000'), // 10000 MGR (MGR is 18 decimals)
        secondTokenId.toString(),
        new BN('100000000000000'), // 100 TUR (TUR is 12 decimals)
        {
          statusCallback: (result) => {
            // result is of the form ISubmittableResult
            console.log("call back result", result);
            console.log("call back result type", result.status.type);
          },
          extrinsicStatus: (result) => {
            // result is of the form MangataGenericEvent[]
            for (let index = 0; index < result.length; index++) {
                  console.log('Phase', result[index].phase.toString())
                  console.log('Section', result[index].section)
                  console.log('Method', result[index].method)
                  console.log('Documentation', result[index].metaDocumentation)
                }
          },
        }
      );
    });
  }

  async promotePool(symbol, keyring) {
    const tokenId = this.getTokenIdBySymbol('MGR-TUR');
    console.log("symbol", symbol, "tokenId", tokenId);
    const promotePoolExtrinsic = this.api.tx.xyk.promotePool(tokenId);
    // await sendExtrinsic(this.api, promotePoolExtrinsic, keyring, { isSudo: true });
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
}

export default new MangataHelper();