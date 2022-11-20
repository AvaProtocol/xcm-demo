import "@imstar15/api-augment";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from '@polkadot/util-crypto';
import oakHelper from "./common/oakHelper";
import mangataHelper from "./common/mangataHelper";
import BN from 'bn.js';
import { Mangata } from "@mangata-finance/sdk";
import { sendExtrinsic } from "./common/utils";

const SUBSTRATE_SS58 = 42;
const TURING_SS58 = 51;
const MANGATA_SS58 = 42;
const OAK_PARA_ID = process.env.OAK_PARA_ID;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;
const OAK_ENDPOINT = process.env.OAK_ENDPOINT;
const TARGET_ENDPOINT = process.env.TARGET_ENDPOINT;

const mgxCurrencyId = 0;
const turCurrencyId = 7;

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";
const keyring = new Keyring();

async function main () {
  await cryptoWaitReady();

    // Initialize
    await oakHelper.initialize(OAK_ENDPOINT);
    await mangataHelper.initialize(TARGET_ENDPOINT);
    const oakApi = oakHelper.getApi();

  const account = keyring.addFromUri('//Alice', undefined, 'sr25519');
  const {address} = account;
  const rococoAddress = keyring.encodeAddress(address, SUBSTRATE_SS58);
  const turingAddress = keyring.encodeAddress(address, TURING_SS58);
  const mangataAddress = keyring.encodeAddress(address, MANGATA_SS58);
  const mangataAccountInfo = await mangataHelper.getAccountInfo(mangataAddress);
  const turingAccountInfo = await oakHelper.getAccountInfo(turingAddress);
  console.log("Rococo address: ", rococoAddress);
  console.log("Turing address: ", turingAddress, turingAccountInfo);
  console.log("Mangata address: ", mangataAddress, mangataAccountInfo);

  const DescendOriginAddress32 = mangataHelper.getProxyAccount(mangataAddress);
  console.log('32 byte address is %s', DescendOriginAddress32);

    // console.log("mangata account from turing:", keyring.encodeAddress(turingAddress MANGATA_SS58));
  //   console.log("proxy account:", keyring.encodeAddress(proxyAccount, SUBSTRATE_SS58));

  // Create pool

    const mgxAddress = keyring.encodeAddress("0xec00ad0ec6eeb271a9689888f644d9262016a26a25314ff4ff5d756404c44112", MANGATA_SS58);
    console.log("mgxAddress", mgxAddress);
        
    // console.log('Minting TUR tokens with sudo permission ...');
    // const mintTokenExtrinsic = mangataHelper.getApi().tx.tokens.mint(turCurrencyId, address, 5000000000000000);
    // await sendExtrinsic(mangataHelper.getApi(), mintTokenExtrinsic, account, { isSudo: true });

    // console.log('Minting KSM tokens with sudo permission ...');
    // const mintTokenExtrinsic = mangataHelper.getApi().tx.tokens.mint(4, address, 5000000000000000);
    // await sendExtrinsic(mangataHelper.getApi(), mintTokenExtrinsic, account, { isSudo: true });

	// console.log('Creating a TUR-MGX pool with ${} ${} and ${} ${}...');
    // await mangataHelper.createPool(account);

    // console.log('Creating a KSM-MGX pool with ${} ${} and ${} ${}...');
    // await mangataHelper.createPool(account);
   
	const pools = await mangataHelper.getPools();
	console.log('Pools: ', pools);

    // const chainInfo = await mangataHelper.getChainInfo();
    // console.log("chainInfo",chainInfo);

    // '8': {
    //     id: '8',
    //     chainId: 0,
    //     decimals: 18,
    //     name: 'Liquidity Pool Token',
    //     symbol: 'MGR-TUR',
    //     address: ''
    //   }

    await mangataHelper.mangata.transferToken(
        account, 
        '4', // TokenID 4 is KSM
        account.address, 
        new BN(100000000000000), // 100 KSM (KSM is 12 decimals)
        {
            statusCallback: (result) => {
              // result is of the form ISubmittableResult
              console.log(result)
            },
            extrinsicStatus: (result) => {
              // result is of the form MangataGenericEvent[]
              for (let index = 0; index < result.length; index++) {
                  console.log('Phase', result[index].phase.toString())
                  console.log('Section', result[index].section)
                  console.log('Method', result[index].method)
                  console.log('Documentation', result[index].metaDocumentation)
                }
            },
          }
    )


    console.log("Bob is trying to add liquidity to the MGX-TUR pool");
    const bob = keyring.addFromUri('//Bob', undefined, 'sr25519');
    const {addressBob} = bob;
    await printAccountInfo(bob);

//   const proxyAccount = mangataHelper.getProxyAddressMangata(keyPair.address);
//   console.log("proxy account:", keyring.encodeAddress(proxyAccount, SUBSTRATE_SS58));

//   mangataHelper.addProxy(proxyAccount, keyPair);
//   console.log('Add proxy on mangata successfully!');

  const message = "empty";
//   await oakHelper.xcmSend(dest, message);
}

async function printAccountInfo  (account) {
    const {address} = account;
    const rococoAddress = keyring.encodeAddress(address, SUBSTRATE_SS58);
    const turingAddress = keyring.encodeAddress(address, TURING_SS58);
    const mangataAddress = keyring.encodeAddress(address, MANGATA_SS58);
    const mangataAccountInfo = await mangataHelper.getAccountInfo(mangataAddress);
    const turingAccountInfo = await oakHelper.getAccountInfo(turingAddress);

    console.log("Rococo address: ", rococoAddress);
    console.log("Turing address: ", turingAddress, turingAccountInfo);
    console.log("Mangata address: ", mangataAddress, mangataAccountInfo);
}

main().catch(console.error).finally(() => process.exit());
