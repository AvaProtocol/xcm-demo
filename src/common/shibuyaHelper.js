import { ApiPromise, WsProvider } from "@polkadot/api";
import { getProxyAccount } from "./utils";
import { env } from './constants';

const { TURING_PARA_ID} = env;

class ShibuyaHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });
		this.api = api;
  }

  getApi = () => this.api;

  getProxyAccount = (address) => getProxyAccount(this.api, TURING_PARA_ID, address)
}

export default new ShibuyaHelper();