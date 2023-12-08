import { hexToU8a } from '@polkadot/util';
import Keyring from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { chains } from '@oak-network/config';
import { askScheduleAction } from '../common/utils';
import { scheduleTask } from './common';

const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

// This is a Moonbeam test account private key. Please do not use it for any other purpose.
// https://github.com/moonbeam-foundation/moonbeam/blob/2ea0db7c18d907ddeda1a5f4d3f68262e10560e7/README.md?plain=1#L65
const ALITH_PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';

const main = async () => {
    await cryptoWaitReady();
    const keyring = new Keyring({ type: 'sr25519' });

    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const moonbeamKeyringPair = keyring.addFromSeed(hexToU8a(ALITH_PRIVATE_KEY), undefined, 'ethereum');
    moonbeamKeyringPair.meta.name = 'Alith';

    const scheduleActionType = await askScheduleAction();

    const { DevChains: { turingLocal, moonbaseLocal } } = chains;
    await scheduleTask({
        oakConfig: turingLocal,
        moonbeamConfig: moonbaseLocal,
        scheduleActionType,
        contract: { address: CONTRACT_ADDRESS, input: CONTRACT_INPUT },
        keyringPair,
        moonbeamKeyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
