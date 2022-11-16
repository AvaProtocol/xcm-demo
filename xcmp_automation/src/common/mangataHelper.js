import { Mangata } from '@mangata-finance/sdk';
import { Keyring } from "@polkadot/api";
import { getOakApi, getProxyAccount } from './util';

const MANGATA_ENDPOINT = 'ws://127.0.0.1:6644';
const OAK_PARA_ID = 2114;
// const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const SUBSTRATE_SS58 = 42;

class MangataHelper {
  initialize = async () => {
    const mangata = Mangata.getInstance([MANGATA_ENDPOINT]);
    const mangataApi = await mangata.getApi();

    this.mangata = mangata;
    this.api = mangataApi;
  }

  getApi = () => this.api;

  checkFreeBalance = async (address) => {
    const tokenBalance = await this.mangata.getTokenBalance('0', address);
    return tokenBalance.free;
  }

  addProxy = async (proxyAccount, aliceKeyPair) => {
    this.api.tx.proxy.addProxy(proxyAccount, "Any", 0).signAndSend(aliceKeyPair);
  }

  createProxyCall = async (address, extrinsic) => {
    // Create encoded transaction to trigger on Target Chain
    return this.api.tx.proxy.proxy(address, 'Any', extrinsic);
    // const targetChainFees = await proxyCall.paymentInfo(ALICE);
    // console.log("Target Chain fees:", targetChainFees.toHuman());
    // const encodedProxyCall = proxyCall.method.toHex();
    // return { encodedProxyCall, fees };
  }
};

export default new MangataHelper();