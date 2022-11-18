import "@imstar15/api-augment";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from '@polkadot/util-crypto';
import oakHelper from "./common/oakHelper";
import mangataHelper from "./common/mangataHelper";
import { Mangata } from "@mangata-finance/sdk";

const SUBSTRATE_SS58 = 42;
const TURING_SS58 = 51;
const MANGATA_SS58 = 42;
const OAK_PARA_ID = process.env.OAK_PARA_ID;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;
const OAK_ENDPOINT = process.env.OAK_ENDPOINT;
const TARGET_ENDPOINT = process.env.TARGET_ENDPOINT;

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

async function main () {
  await cryptoWaitReady();

    // Initialize
    await oakHelper.initialize(OAK_ENDPOINT);
    await mangataHelper.initialize(TARGET_ENDPOINT);
    const oakApi = oakHelper.getApi();

  const keyring = new Keyring();
  const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
  const {address} = keyPair;
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



//   const chainInfo = await mangataHelper.getChainInfo();
//   console.log("chainInfo",chainInfo);

//   const proxyAccount = mangataHelper.getProxyAddressMangata(keyPair.address);
//   console.log("proxy account:", keyring.encodeAddress(proxyAccount, SUBSTRATE_SS58));

//   mangataHelper.addProxy(proxyAccount, keyPair);
//   console.log('Add proxy on mangata successfully!');

  const dest = {
    parents: 1,
    interior: {
      X2: [
        { Parachain: MANGATA_PARA_ID },
        {
          AccountId32: {
            network: "Any",
            id: keyring.decodeAddress(address),
          }
        }
      ]
    }
  };

  const message = "empty";
//   await oakHelper.xcmSend(dest, message);
}

main().catch(console.error).finally(() => process.exit());
