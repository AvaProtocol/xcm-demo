import Keyring from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { chains } from '@oak-network/config';
import { schedulePriceTask } from './price-common';

const createTaskPayload = (astarApi) => astarApi.tx.system.remarkWithEvent('Hello world!');

const main = async () => {
    await cryptoWaitReady();
    const keyring = new Keyring({ type: 'sr25519' });
    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const { turingLocal, shibuya } = chains;
    await schedulePriceTask({
        oakConfig: turingLocal,
        astarConfig: shibuya,
        createPayloadFunc: createTaskPayload,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
