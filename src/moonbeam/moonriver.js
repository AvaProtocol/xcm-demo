import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile, readEthMnemonicFromFile } from '../common/utils';
import { scheduleTask } from './common';

const CONTRACT_ADDRESS = '0xa72f549a1a12b9b49f30a7f3aeb1f4e96389c5d8';
const CONTRACT_INPUT = '0xd09de08a';

const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const moonbeamMnemonic = await readEthMnemonicFromFile();
    const moonbeamKeyring = new Keyring({ type: 'ethereum' });
    const moonbeamKeyringPair = moonbeamKeyring.addFromJson(moonbeamMnemonic);
    moonbeamKeyringPair.unlock(process.env.PASS_PHRASE_ETH);

    const { KusamaChains: { turing, moonriver } } = chains;
    await scheduleTask({
        oakConfig: turing,
        moonbeamConfig: moonriver,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        contract: { address: CONTRACT_ADDRESS, input: CONTRACT_INPUT },
        keyringPair,
        moonbeamKeyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
