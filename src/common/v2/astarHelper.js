import { ApiPromise, WsProvider } from '@polkadot/api';

class AstarHelper {
    constructor(config) {
        this.config = config;
    }

    initialize = async () => {
        const api = await ApiPromise.create({ provider: new WsProvider(this.config.endpoint) });
        this.api = api;
    };

    getApi = () => this.api;

    finalize = async () => {
        this.api.disconnect();
    };
}

export default AstarHelper;
