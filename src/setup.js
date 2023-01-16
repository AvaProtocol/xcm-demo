import "@oak-network/api-augment";
import _ from 'lodash';
import confirm from '@inquirer/confirm';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import BN from 'bn.js';

import turingHelper from "./common/turingHelper";
import mangataHelper from "./common/mangataHelper";
import Account from './common/account';
import { env, tokenConfig } from "./common/constants";
import {delay} from './common/utils';

const { TURING_ENDPOINT, MANGATA_ENDPOINT } = env;

console.log(env);

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

/*** Main entrance of the program */
async function main() {
  await cryptoWaitReady();

  console.log("Initializing APIs of both chains ...");
  await turingHelper.initialize(TURING_ENDPOINT);
  await mangataHelper.initialize(MANGATA_ENDPOINT);

  console.log("Reading token and balance of Alice and Bob accounts ...");
  const alice = new Account("Alice");
  await alice.init();
  alice.print();
  const mangataAddress = alice.assets[1].address;
  await mangataHelper.initIssuance(alice.keyring);
  console.log("Minting tokens for Alice on Maganta if balance is zero ...");
  for (let i = 0; i < alice.assets[1].tokens.length; i += 1) {
    const { symbol, balance } = alice.assets[1].tokens[i];

    if (balance.isZero()) {
      console.log(`[Alice] ${symbol} balance on Mangata is zero; minting ${symbol} with sudo ...`);
      // Because sending extrinsic in parallel will cause repeated nonce errors
      // we need to wait for the previous extrinsic to be finalized before sending the extrinsic.
      await mangataHelper.mintToken(mangataAddress, symbol, alice.keyring);
    }
  }

  // If there is no proxy, add proxy.
  console.log(`\nWaiting 20 seconds to check if there’s a proxy set for Alice ...`);
  await delay(20000);
  const proxiesResponse = await mangataHelper.api.query.proxy.proxies(mangataAddress);
  const [proxies] = proxiesResponse.toJSON()[0];
  console.log('proxies: ', proxies);

  if (_.isEmpty(proxies)) {
    console.log(`Proxy array of Alice is empty; adding a proxy, ${alice.assets[1].proxyAddress} ..`);
    await mangataHelper.addProxy(alice.assets[1].proxyAddress, alice.keyring);
  }

  const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to set up pools.', default: true });

  if (answerPool) {
    // Get current pools available
    const pools = await mangataHelper.getPools();
    console.log('Existing pools: ', pools);

    const poolFound = _.find(pools, (pool) => {
      return pool.firstTokenId === mangataHelper.getTokenIdBySymbol("MGR") && pool.secondTokenId === mangataHelper.getTokenIdBySymbol("TUR");
    });

    if (!_.isUndefined(poolFound)) {
      console.log(`An existing MGR-TUR pool found; skip pool creation ...`);
    }

    // Create pool
    console.log(`No MGR-TUR pool found; creating a MGR-TUR pool with Alice ...`);
    await mangataHelper.createPool(
      "MGR",
      "TUR",
      new BN('10000').mul(new BN(tokenConfig.MGR.decimal)),  // 10000 MGR (MGR is 18 decimals)
      new BN('100').mul(new BN(tokenConfig.TUR.decimal)),    // 100 TUR (TUR is 12 decimals)
      alice.keyring,
    );

    // Update assets
    console.log(`Checking out assets after pool creation; there should be a new MGR-TUR token ...`);
    await mangataHelper.updateAssets();

    // Promote pool
    console.log(`Promote the pool to activate liquidity rewarding ...`);
    await mangataHelper.updatePoolPromotion('MGR-TUR', 1, alice.keyring);
    await mangataHelper.activateLiquidityV2('MGR-TUR', new BN('10000').mul(new BN(tokenConfig.MGR.decimal)), alice.keyring);

    // Mint liquidity to generate rewards...
    console.log("Mint liquidity to generate rewards...");
    await mangataHelper.mintLiquidity('MGR', new BN('10000').mul(new BN(tokenConfig.MGR.decimal)), 'TUR', new BN('10000').mul(new BN(tokenConfig.TUR.decimal)), alice.keyring);
  }
}

main().catch(console.error).finally(() => process.exit());
