import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile } from '../common/utils';
import { scheduleTask } from './common';

const createTaskPayload = (astarApi) => astarApi.tx.dappsStaking.claimStaker({
    Evm: '0x1cee94a11eaf390b67aa346e9dda3019dfad4f6a',
});

const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const { turing, shiden } = chains;
    await scheduleTask({
        oakConfig: turing,
        astarConfig: shiden,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        createPayloadFunc: createTaskPayload,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
