import "@imstar15/api-augment";
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import BN from 'bn.js';

import turingHelper from "./common/turingHelper";
import mangataHelper from "./common/mangataHelper";
import Account from './common/account';
import {env} from "./common/constants";

const {TURING_ENDPOINT , MANGATA_ENDPOINT} = env;

console.log(env);

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

/*** Main entrance of the program */
async function main () {
  await cryptoWaitReady();

  console.log("Initializing APIs of both chains ...");
  await turingHelper.initialize(TURING_ENDPOINT);
  await mangataHelper.initialize(MANGATA_ENDPOINT);

  console.log("Reading token and balance of Alice and Bob accounts ...");
  const alice = new Account("Alice");
  await alice.init();
  alice.print();

  console.log("Minting tokens for Alice on Maganta if balance is zero ...");
  const mangataAddress = alice.assets[1].address;
  for (let i = 0; i < alice.assets[1].tokens.length; i += 1) {
    const { symbol, balance } = alice.assets[1].tokens[i];

    if (balance.isZero()) {
      console.log(`[Alice] ${symbol} balance on Mangata is zero; minting ${symbol} with sudo ...`);
      // Because sending extrinsic in parallel will cause repeated nonce errors
      // we need to wait for the previous extrinsic to be finalized before sending the extrinsic.
      await mangataHelper.mintToken(mangataAddress, symbol, alice.keyring);
    }
  }

  // TODO: how do we check whether the proxy is already added for Alice?
  console.log(`Adding proxy ${alice.assets[1].proxyAddress} for Alice on mangata successfully!`);
  await mangataHelper.addProxy(alice.assets[1].proxyAddress, alice.keyring);

  const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to set up pools.' , default: true});

  if(answerPool){

      // Get current pools available
      const pools = await mangataHelper.getPools();
      console.log('Existing pools: ', pools);

      const poolFound = _.find(pools, (pool)=>{
        return pool.firstTokenId === mangataHelper.getTokenIdBySymbol("MGR") && pool.secondTokenId === mangataHelper.getTokenIdBySymbol("TUR");
      });

      if(_.isUndefined(poolFound))
      {
        console.log(`No MGR-TUR pool found; creating a MGR-TUR pool with Alice ...`);
        await mangataHelper.createPool(
          "MGR",
          "TUR",
          new BN('10000000000000000000000'), // 10000 MGR (MGR is 18 decimals)
          new BN('100000000000000'), // 100 TUR (TUR is 12 decimals)
          alice.keyring
        );

        // Update assets
        await mangataHelper.updateAssets();
      }else{
        console.log(`An existing MGR-TUR pool found; skip pool creation ...`);
      }

      // TODO: how to check whether this MGR-TUR is already promoted by Alice?
      console.log(`Promote the pool to activate liquidity rewarding ...`);
      await mangataHelper.promotePool( 'MGR-TUR', alice.keyring);
  }

  console.log('Teleporting TUR token from Mangata to Turing to pay fees ...');
  // TODO: teleport TUR to Turing Network to fund user’s account
  await mangataHelper.transferTur(new BN('100000000000000'), alice.keyring.address, alice.keyring);

  const answerTestPool = await confirm({ message: '\nPool setup is completed. Press ENTRE to test the pool and teleport asset.' , default: true});
  if(answerTestPool){
    console.log('Swap MGX for TUR to test the pool ...');
    await mangataHelper.swap("MGR", "TUR", alice.keyring);

    // TODO: how do we prove that the liquidity owner earned fee? According to Marian, "the user that provided the liquidity should be eligible for some rewards after some time"
    //       how to check the amount of fee to claim?
    //       test claim extrinsic

  }
}

main().catch(console.error).finally(() => process.exit());
