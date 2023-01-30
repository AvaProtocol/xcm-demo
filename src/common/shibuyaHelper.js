import { ApiPromise, WsProvider } from "@polkadot/api";
import { getProxyAccount } from "./utils";

class ShibuyaHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });
		this.api = api;
  }

  getApi = () => this.api;

  getProxyAccount = (parachainId, address) => getProxyAccount(this.api, parachainId, address)
}

export default new ShibuyaHelper();