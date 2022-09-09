import "@oak-foundation/api-augment";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { XcmV1MultiLocation } from "@polkadot/types/lookup"
import { cryptoWaitReady } from '@polkadot/util-crypto';

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const OAK_PARA_ID = 2114;
const TEM_PARA_ID = 1999;
const TEM_TUR_FEE_PER_SECOND = 416_000_000_000;
const TEM_INSTRUCTION_WEIGHT = 6_000_000_000;
const SUBSTRATE_NETWORK = 42;
const SOME_SOV_ACCOUNT = "0x7369626c42080000000000000000000000000000000000000000000000000000";

const LOCAL_OAK_ENDPOINT = "ws://localhost:9946";
const LOCAL_TEM_ENDPOINT = "ws://localhost:9947";

async function main () {
  await cryptoWaitReady();

  const keyring = new Keyring();
  const alice_key = await keyring.addFromUri('//Alice', undefined, 'sr25519');

  // setup API
  const oakApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_OAK_ENDPOINT)
  });
  const temApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_TEM_ENDPOINT)
  });

  // send money to temp
  await oakApi.tx.xTokens.transfer(
    "Native",
    100000000000000,
    {
      V1: {
        parents: 1,
        interior: {
          X2: [
            { parachain: 1999 },
            { 
              AccountId32: {
                network: "Any",
                id: SOME_SOV_ACCOUNT,
              }
            }
          ]
        }
      }
    },
    1000000000000,
  ).signAndSend(alice_key, { nonce: -1 });

  // add currency combo - bad origin for some reason. manual
  await oakApi.tx.sudo.sudo(
    oakApi.tx.xcmpHandler.addChainCurrencyData(
      1999,
      "Native",
      {
        native: "No",
        feePerSecond: TEM_TUR_FEE_PER_SECOND,
        instructionWeight: TEM_INSTRUCTION_WEIGHT
      }
    )
  ).signAndSend(alice_key, { nonce: -1 });

  // find derived account for chain 1
  const location = {
    parents: 1,
    interior: {
      X2: [
        { Parachain: OAK_PARA_ID },
        {
          AccountId32: {
            network: "Any",
            id: keyring.decodeAddress(ALICE),
          }
        }
      ]
    }
  };
  const multilocation: XcmV1MultiLocation = oakApi.createType(
    "XcmV1MultiLocation",
    location
  );

  const toHash = new Uint8Array([
    ...new Uint8Array([32]),
    ...new TextEncoder().encode("multiloc"),
    ...multilocation.toU8a(),
  ]);
  const descendAddress = u8aToHex(oakApi.registry.hash(toHash).slice(0, 32));

  console.log(
    "Derived:", keyring.encodeAddress(descendAddress, SUBSTRATE_NETWORK)
  );

  // delegate access to proxy account on chain 2
  await temApi.tx.proxy.addProxy(descendAddress, "Any", 0).signAndSend(alice_key);

  // create encoded transaction to trigger on chain 2
  const encodedProxyCall = temApi.tx.proxy.proxy(
    ALICE,
    "Any",
    temApi.tx.system.remarkWithEvent("Hello, world!"),
  ).toHex();
  // 0xd4043c00d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d010000083448656c6c6f2c20776f726c6421
  // 0x    3c00d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d010000083448656c6c6f2c20776f726c6421

  // schedule transaction on chain 1
  await oakApi.tx.automationTime
    .scheduleXcmpTask(
      (Math.random() + 1).toString(36).substring(7),
      [0],
      TEM_PARA_ID,
      "Native",
      encodedProxyCall,
      6_000_000_000
    )
    .signAndSend(alice_key, { nonce: -1 },({ events = [], status }) => {
      if (status.isInBlock) {
        console.log('Successful with hash ' + status.asInBlock.toHex());
        process.exit();
      } else {
        console.log('Status: ' + status.type);
      }
    });
}

main() // .catch(console.error).finally(() => process.exit());
