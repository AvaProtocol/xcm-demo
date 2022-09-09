import "@oak-foundation/api-augment";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { XcmV1MultiLocation } from "@polkadot/types/lookup"
import { cryptoWaitReady } from '@polkadot/util-crypto';

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const OAK_PARA_ID = 2114;
const TEM_PARA_ID = 1999;
const SUBSTRATE_NETWORK = 42;

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
  // 0x2c000000407a10f35a00000000000000000000010102003d1f01007369626c420800000000000000000000000000000000000000000000000000000010a5d4e8000000

  // add currency combo - bad origin for some reason. manual
  // await oakApi.tx.sudo
  //  .sudo("0x32003e00420800000000320000000000000000000000000000003200000000000000")
  //  .signAndSend(alice_key);
  // Actually should be I think: 0x32003e004208000000003200000000000000000000000000000000bca06501000000
  // 0x32003e00cf07000000003200000000000000000000000000000000bca06501000000
  //{
  //  native: false
  //  feePerSecond: 416,000,000,000
  //  instructionWeight: 6,000,000,000
  //}
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
  // const encodedSystemWithRemark = await temApi.tx.system.remarkWithEvent("Hello, world!").toHex();
  // const encodedProxyCall = await temApi.tx.proxy.proxy(ALICE, "Any", encodedSystemWithRemark).toHex();
  // temApi doesn't know it's proxy pallet?  Issue creating call. Hardcode for now
  const encodedProxyCall = "0x3c00d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0000083448656c6c6f2c20776f726c6421";

  // schedule transaction on chain 1
  const a =   oakApi.tx.automationTime
  .scheduleXcmpTask(
    (Math.random() + 1).toString(36).substring(7),
    [0],
    TEM_PARA_ID,
    "Native",
    encodedProxyCall,
    6_000_000_000
  ).toHex();
  console.log(a);

  oakApi.tx.automationTime
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
      } else {
        console.log('Status: ' + status.type);
      }
    
      events.forEach(({ phase, event: { data, method, section } }) => {
        console.log(phase.toString() + ' : ' + section + '.' + method + ' ' + data.toString());
      });
    });
}

main() // .catch(console.error).finally(() => process.exit());
