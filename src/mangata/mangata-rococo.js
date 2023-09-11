import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile } from '../common/utils';
import { scheduleTask } from './common';

const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const { turingStaging, mangataRococo } = chains;
    await scheduleTask({
        oakConfig: turingStaging,
        mangataConfig: mangataRococo,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
