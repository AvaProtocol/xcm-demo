import { ApiPromise, WsProvider } from "@polkadot/api";

class ShibuyaHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });
		this.api = api;
  }

  getApi = () => this.api;
}

export default new ShibuyaHelper();