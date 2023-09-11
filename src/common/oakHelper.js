import '@oak-network/api-augment';
import { rpc, types, runtime } from '@oak-network/types';
import { ApiPromise, WsProvider } from '@polkadot/api';
import ChainHelper from './chainHelper';

class OakHelper extends ChainHelper {
    initialize = async () => {
        this.api = await ApiPromise.create({
            provider: new WsProvider(this.config.endpoint), rpc, types, runtime,
        });
    };
}

export default OakHelper;
