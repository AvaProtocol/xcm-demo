import '@oak-network/api-augment';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';

import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import { TuringMoonbaseAlpha, MoonbaseAlpha } from '../config';
import { readEthMnemonicFromFile } from '../common/utils';

/**
 * References:
 * https://docs.moonbeam.network/tokens/connect/polkadotjs/
 * https://docs.moonbeam.network/cn/builders/build/substrate-api/polkadot-js-api/
 */

/** * Main entrance of the program */
async function main() {
    await cryptoWaitReady();

    console.log('Initializing APIs of both chains ...');

    const turingHelper = new TuringHelper(TuringMoonbaseAlpha);
    await turingHelper.initialize();

    const moonbaseHelper = new MoonbaseHelper(MoonbaseAlpha);
    await moonbaseHelper.initialize();

    // Refer to the following article to export seed-eth.json
    // https://docs.moonbeam.network/tokens/connect/polkadotjs/
    const json = await readEthMnemonicFromFile();
    const keyring = new Keyring({ type: 'ethereum' });
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);
    console.log('Moonbase address: ', keyPair.address);

    const { data: balance } = await moonbaseHelper.api.query.system.account(keyPair.address);
    console.log(`balance: ${balance.free}`);
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
