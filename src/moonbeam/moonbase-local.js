import { hexToU8a } from '@polkadot/util';
import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile } from '../common/utils';
import { scheduleTask } from './common';

const ALITH_PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';

const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const moonbeamKeyringPair = keyring.addFromSeed(hexToU8a(ALITH_PRIVATE_KEY), undefined, 'ethereum');
    moonbeamKeyringPair.unlock(process.env.PASS_PHRASE_ETH);

    const { turingMoonbase, moonbaseAlpha } = chains;
    await scheduleTask({
        oakConfig: turingMoonbase,
        moonbeamConfig: moonbaseAlpha,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        keyringPair,
        moonbeamKeyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
