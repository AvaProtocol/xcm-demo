import '@oak-network/api-augment';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';

import { u8aToHex } from '@polkadot/util';
import TuringHelper from '../common/turingHelper';
import MoonbaseHelper from '../common/moonbaseHelper';
import { TuringMoonbaseAlpha, MoonbaseAlpha } from '../config';
import { readEthMnemonicFromFile, readMnemonicFromFile, sendExtrinsic } from '../common/utils';
import Account from '../common/account';

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
    const jsonEth = await readEthMnemonicFromFile();
    const keyringEth = new Keyring({ type: 'ethereum' });
    const keyPairEth = keyringEth.addFromJson(jsonEth);
    keyPairEth.unlock(process.env.PASS_PHRASE_ETH);
    console.log('Moonbase address: ', keyPairEth.address);

    const { data: balance } = await moonbaseHelper.api.query.system.account(keyPairEth.address);
    console.log(`balance: ${balance.free}`);

    const keyring = new Keyring({ type: 'sr25519' });
    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);
    const account = new Account(keyPair);
    await account.init([turingHelper]);
    account.print();

    const turingChainName = turingHelper.config.key;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    console.log('turingAddress: ', turingAddress);
    const turingAccountId = u8aToHex(keyPair.addressRaw);
    console.log('turingAccountId: ', turingAccountId);

    // Transfer DEV from Moonbase to Turing
    console.log('Transfer DEV from Moonbase to Turing');
    const extrinsic = moonbaseHelper.api.tx.xTokens.transferMultiasset(
        {
            V1: {
                id: {
                    Concrete: {
                        parents: 0,
                        interior: {
                            X1: { PalletInstance: 3 },
                        },
                    },
                },
                fun: {
                    Fungible: '100000000000000000',
                },
            },
        },
        {
            V1: {
                parents: 1,
                interior: {
                    X2: [
                        {
                            Parachain: turingHelper.config.paraId,
                        },
                        {
                            AccountId32: {
                                network: 'Any',
                                id: turingAccountId,
                            },
                        },
                    ],
                },
            },
        },
        'Unlimited',
    );
    await sendExtrinsic(moonbaseHelper.api, extrinsic, keyPairEth);
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
