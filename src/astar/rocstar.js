import BN from 'bn.js';
import Keyring from '@polkadot/keyring';
import { chains } from '@oak-network/config';
import { ScheduleActionType, readMnemonicFromFile } from '../common/utils';
// import { scheduleTask } from './common';
import { scheduleTask } from './arthswap';

// const createTaskPayload = (astarApi) => astarApi.tx.ethereumChecked.transact({
//     gasLimit: 3000000,
//     target: '0xA17E7Ba271dC2CC12BA5ECf6D178bF818A6D76EB',
//     value: new BN('100000000000000000'),
//     input: '0x111',
// });

// const createTaskPayload = (astarApi) => astarApi.tx.system.remarkWithEvent('Hello world!');

const createTaskPayload = (astarApi) => astarApi.tx.ethereumChecked.transact({
    gasLimit: 201596,
    target: '0xA17E7Ba271dC2CC12BA5ECf6D178bF818A6D76EB',
    value: new BN('10000000000000000'),
    input: '0x7ff36ab5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000005446cff2194e84f79513acf6c8980d6e60747253000000000000000000000000000000000000000000000000018abef7846071c700000000000000000000000000000000000000000000000000000000000000020000000000000000000000007d5d845fd0f763cefc24a1cb1675669c3da62615000000000000000000000000e17d2c5c7761092f31c9eca49db426d5f2699bf0',
});

const main = async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyringPair = keyring.addFromJson(json);
    keyringPair.unlock(process.env.PASS_PHRASE);

    const { turingStaging, rocstar } = chains;
    await scheduleTask({
        oakConfig: turingStaging,
        astarConfig: rocstar,
        scheduleActionType: ScheduleActionType.executeOnTheHour,
        createPayloadFunc: createTaskPayload,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
