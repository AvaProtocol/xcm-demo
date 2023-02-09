import MangataCommon from './common';
import { Mangata, Turing } from '../config';

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
async function main() {
    const mangataCommon = new MangataCommon(Turing, Mangata);
    await mangataCommon.run();
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
