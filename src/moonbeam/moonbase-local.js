import { hexToU8a } from '@polkadot/util';
import Keyring from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { chains } from '@oak-network/config';
import { askScheduleAction } from '../common/utils';
import { scheduleTask } from './common';

const ALITH_PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';

const main = async () => {
    await cryptoWaitReady();
    const keyring = new Keyring({ type: 'sr25519' });

    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const moonbeamKeyringPair = keyring.addFromSeed(hexToU8a(ALITH_PRIVATE_KEY), undefined, 'ethereum');
    moonbeamKeyringPair.meta.name = 'Alith';

    const scheduleActionType = await askScheduleAction();

    const { turingLocal, moonbaseLocal } = chains;
    await scheduleTask({
        oakConfig: turingLocal,
        moonbeamConfig: moonbaseLocal,
        scheduleActionType,
        keyringPair,
        moonbeamKeyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
