import { Mangata } from '@mangata-finance/sdk';
import BN from 'bn.js';

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

  addProxy = async (proxyAccount, keyPair) => this.api.tx.proxy.addProxy(proxyAccount, "Any", 0).signAndSend(keyPair);

  createProxyCall = async (address, extrinsic) => this.api.tx.proxy.proxy(address, 'Any', extrinsic);

  createPool = async (keyPair) => {
    await this.mangata.createPool(
      keyPair,
      '0', // Token Id 0 is MGX
      new BN('1000000000000000000000'), // 1000 MGX (MGX is 18 decimals)
      '4', // Token Id 4 is KSM
      new BN('1000000000000'), // 1 KSM (KSM is 12 decimals)
      {
        statusCallback: (result) => {
          // result is of the form ISubmittableResult
          console.log(result)
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

    const pools = await this.mangata.getPools();
    return pools;
  }
};

export default new MangataHelper();