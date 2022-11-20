import { Mangata } from '@mangata-finance/sdk';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from '@polkadot/util-crypto';
import BN from 'bn.js';

const OAK_PARA_ID = 2114;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;

const DECIMAL = {
  MGX: '1000000000000000000',
  KSM: '1000000000000',
  TUR: '10000000000',
};
class MangataHelper {
  initialize = async (mangataEndpoint) => {
    const mangata = Mangata.getInstance([mangataEndpoint]);
    const mangataApi = await mangata.getApi();

    this.mangata = mangata;
    this.api = mangataApi;
  }

  getApi = () => this.api;

  checkFreeBalance = async (address) => {
    const tokenBalance = await this.mangata.getTokenBalance('0', address);
    return tokenBalance.free;
  }

  getChainInfo = async (account) => {
        // 2. Read chain asssets
    const assets = await this.mangata.getAssetsInfo();
    return assets;
  }

  getAccountInfo = async (address) => {
    const balances = {};
    balances.MGX = await this.getAssetFreeAmount(0, address, DECIMAL.MGX);
    balances.KSM = await this.getAssetFreeAmount(4, address, DECIMAL.KSM);
    balances.TUR = await this.getAssetFreeAmount(7, address, DECIMAL.TUR);
    // balances['KSM-MGX'] = await this.mangata.getTokenBalance('5', account.address);
    return balances;
  }

  getAssetFreeAmount = async (assetId, address, digits )=>{
    const asset = await this.mangata.getTokenBalance(assetId.toString(), address);
    return asset.free.div(new BN(digits)).toNumber();
  } 

  getProxyAccount = (address) => {
    const decodedAddress = decodeAddress(address);
    const decondedAddressHex = u8aToHex(decodedAddress); // a SS58 public key
    console.log("decondedAddressHex", decondedAddressHex);
    
    const location = {
      parents: 1, // From Turing to Mangata
      interior: {
        X2: [
          { Parachain: OAK_PARA_ID },
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

  createPool = async (account) => {
    return new Promise(async (resolve) => {
      await this.mangata.createPool(
        account,
        '0',
        new BN('1000000000000000000000'), // 1000 MGX (MGX is 18 decimals)
        '4',
        new BN('1000000000000'), // 1 TUR (TUR is 12 decimals)
        {
          statusCallback: (result) => {
            // result is of the form ISubmittableResult
            console.log(result);
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

  getPools = async() =>{
    return this.mangata.getPools();
  }
}

export default new MangataHelper();