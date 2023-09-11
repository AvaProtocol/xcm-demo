import { ApiPromise, WsProvider } from '@polkadot/api';

class ChainHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const api = await ApiPromise.create({ provider: new WsProvider(this.config.endpoint) });
        this.api = api;
    };

    getApi = () => this.api;

    disconnect = async () => {
        this.api.disconnect();
    };
}

export default ChainHelper;
