import "@imstar15/api-augment";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from '@polkadot/util-crypto';
import turingHelper from "./common/turingHelper";
import mangataHelper from "./common/mangataHelper";
import Account from './common/account';
import _ from 'lodash';
import BN from 'bn.js';
import confirm from '@inquirer/confirm';

import {env} from "./common/constants";
const {TURING_ENDPOINT , MANGATA_ENDPOINT} = env;

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

  console.log(`Adding proxy ${alice.assets[1].proxyAddress} for Alice on mangata successfully!`);
  await mangataHelper.addProxy(alice.assets[1].proxyAddress, alice.keyring);

  const answer = await confirm({ message: 'Should we proceed? Press ENTRE for confirmation.' , default: true});


  // Create pool
  const pools = await mangataHelper.getPools();
	console.log('Pools: ', pools);

  const existingPool = _.find(pools, (pool)=>{
    return pool.firstTokenId === mangataHelper.getTokenIdBySymbol("MGR") && pool.secondTokenId === mangataHelper.getTokenIdBySymbol("TUR");
  });

  if(_.isUndefined(existingPool))
  {
    console.log(`No MGR-TUR pool found; creating a MGR-TUR pool with Alice ...`);
    await mangataHelper.createPool("MGR" ,"TUR",alice.keyring);
  }else{
    console.log(`An existing MGR-TUR pool found; skip pool creation ...`);
  }

  // Add liquidity to 
	

	// Buy asset
	console.log('Buy asset...');
	await mangataHelper.mangata.buyAsset(alice.keyring, '0', '7', new BN('1000000000000'), new BN('100000000000000000000000000'));


    // await mangataHelper.mangata.transferToken(
    //     account, 
    //     '4', // TokenID 4 is KSM
    //     account.address, 
    //     new BN(100000000000000), // 100 KSM (KSM is 12 decimals)
    //     {
    //         statusCallback: (result) => {
    //           // result is of the form ISubmittableResult
    //           console.log(result)
    //         },
    //         extrinsicStatus: (result) => {
    //           // result is of the form MangataGenericEvent[]
    //           for (let index = 0; index < result.length; index++) {
    //               console.log('Phase', result[index].phase.toString())
    //               console.log('Section', result[index].section)
    //               console.log('Method', result[index].method)
    //               console.log('Documentation', result[index].metaDocumentation)
    //             }
    //         },
    //       }
    // )


  const message = "empty";
//   await turingHelper.xcmSend(dest, message);
})();