import BN from 'bn.js';
import Keyring from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { chains } from '@oak-network/config';
// import { scheduleTask } from './common';
import { scheduleTask } from './arthswap';
import { askScheduleAction } from '../common/utils';

// const createTaskPayload = (astarApi) => astarApi.tx.system.remarkWithEvent('Hello world!');

const createTaskPayload = (astarApi) => astarApi.tx.ethereumChecked.transact({
    gasLimit: 3000000,
    target: '0xA17E7Ba271dC2CC12BA5ECf6D178bF818A6D76EB',
    value: new BN('100000000000000000'),
    input: '0x7ff36ab5000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000005446cff2194e84f79513acf6c8980d6e60747253000000000000000000000000000000000000000000000000018abef7846071c700000000000000000000000000000000000000000000000000000000000000020000000000000000000000007d5d845fd0f763cefc24a1cb1675669c3da62615000000000000000000000000e17d2c5c7761092f31c9eca49db426d5f2699bf0',
});

const main = async () => {
    await cryptoWaitReady();
    const keyring = new Keyring({ type: 'sr25519' });
    const keyringPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
    keyringPair.meta.name = 'Alice';

    const scheduleActionType = await askScheduleAction();

    const { turingLocal, shibuya } = chains;
    await scheduleTask({
        oakConfig: turingLocal,
        astarConfig: shibuya,
        scheduleActionType,
        createPayloadFunc: createTaskPayload,
        keyringPair,
    });
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
