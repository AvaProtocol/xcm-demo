import '@oak-foundation/api-augment';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';
import { XcmV1MultiLocation } from "@polkadot/types/lookup"

const ALICE = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const OAK_PARA_ID = 2114;
const SUBSTRATE_NETWORK = 42;

const LOCAL_OAK_ENDPOINT = 'ws://localhost:9946';
const LOCAL_TEM_ENDPOINT = 'ws://localhost:9947';

async function main () {
  const keyring = new Keyring();

  // setup API
  const oakApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_OAK_ENDPOINT)
  });
  const temApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_TEM_ENDPOINT)
  });

  // create correct multi-location
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

  // Find derived account
  const toHash = new Uint8Array([
    ...new Uint8Array([32]),
    ...new TextEncoder().encode("multiloc"),
    ...multilocation.toU8a(),
  ]);
  const descendAddress = u8aToHex(oakApi.registry.hash(toHash).slice(0, 32));

  // Output wallet address (with substrate network to match RPC)
  console.log(keyring.encodeAddress(descendAddress, SUBSTRATE_NETWORK));
}


main().catch(console.error).finally(() => process.exit());
