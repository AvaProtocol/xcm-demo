import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile } from '../common/utils';
import { scheduleTask } from './common';

/**
 * README!
 *
 * 1. Unlike dev environment there’s no Sudo in Kusama, so we need to important a wallet first.
 * a) Export a wallet from polkadot.js plugin, and save it as a file ./private/seed.json
 * b) Run "PASS_PHRASE=<password_for_unlock> npm run mangata-kusama"
 *
 * 2. You need to have balances in both MGR and TUR on Mangata Kusama
 * 3. You need to have balances in TUR on Turing Staging
 */

/** * Main entrance of the program */
const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const { turing, mangataKusama } = chains;
    await scheduleTask({
        oakConfig: turing,
        mangataConfig: mangataKusama,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
