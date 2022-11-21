import "@imstar15/api-augment";
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import turingHelper from "./common/turingHelper";
import mangataHelper from "./common/mangataHelper";
import Account from './common/account';
import {env} from "./common/constants";
const {TURING_ENDPOINT , MANGATA_ENDPOINT} = env;

console.log(env);

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

/*** Main entrance of the program */
(async function main () {
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
  const promises = _.map(alice.assets[1].tokens, (token)=>{
    const {symbol, balance} = token;

    if(balance.isZero()){
      console.log(`[Alice] ${symbol} balance on Mangata is zero; minting ${symbol} with sudo ...`);
      return mangataHelper.mintToken(mangataAddress, symbol, alice.keyring);
    }else{
      return Promise.resolve();
    }
  });

  await Promise.all(promises);

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
        await mangataHelper.createPool("MGR" ,"TUR",alice.keyring);
      }else{
        console.log(`An existing MGR-TUR pool found; skip pool creation ...`);
      }

      // TODO: how to check whether this MGR-TUR is already promoted by Alice?
      console.log(`Promote the pool to be eligible for trading ...`);
      await mangataHelper.promotePool( 'MGR-TUR', alice.keyring);
  }

  const answerTestPool = await confirm({ message: '\nPool setup is completed. Press ENTRE to test the pool and teleport asset.' , default: true});

  if(answerTestPool){
    console.log('Swap MGX for TUR to test the pool ...');
    await mangataHelper.swap("MGR", "TUR", alice.keyring);

    // TODO: how do we prove that the liquidity owner earned fee?
    //       how to check the amount of fee to claim?
    //       test claim extrinsic

    console.log('Teleporting TUR token from Mangata to Turing to pay fees ...');
    
    // TODO: teleport TUR to Turing Network to fund user’s account
  }
})();