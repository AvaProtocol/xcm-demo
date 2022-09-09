import '@oak-foundation/api-augment';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { u8aToHex } from '@polkadot/util';
import { XcmV1MultiLocation } from "@polkadot/types/lookup"

async function main () {
  const api = await ApiPromise.create({
    provider: new WsProvider('wss://rpc.turing.oak.tech')
  });
  const keyring = new Keyring()

  const location = {
    parents: 1,
    interior: {
      X2: [
        { Parachain: 2114 },
        {
          AccountId32: {
            network: "Any",
            id: keyring.decodeAddress(
              "5FeAonhz3VJb7RvhWvrLDfHu8m19jDZmhrZhfFR7dkPjmTwD"
            ),
          }
        }
      ]
    }
  };
  const multilocation: XcmV1MultiLocation = api.createType(
    "XcmV1MultiLocation",
    location
  );

  const toHash = new Uint8Array([
    ...new Uint8Array([32]),
    ...new TextEncoder().encode("multiloc"),
    ...multilocation.toU8a(),
  ]);

  const descendOriginAddress = u8aToHex(api.registry.hash(toHash).slice(0, 32));

  // Substrate network id to match current RPC output
  console.log(keyring.encodeAddress(descendOriginAddress, 42));
}


main().catch(console.error).finally(() => process.exit());
