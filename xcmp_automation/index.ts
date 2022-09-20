import "@oak-foundation/api-augment";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { XcmV1MultiLocation } from "@polkadot/types/lookup"
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { rpc } from '@oak-foundation/types';

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const OAK_PARA_ID = 2114;
const TARGET_PARA_ID = 1999;
const SUBSTRATE_NETWORK = 42;
const SOME_SOV_ACCOUNT = "0x7369626c42080000000000000000000000000000000000000000000000000000";

const LOCAL_OAK_ENDPOINT = "ws://localhost:9946";
const LOCAL_TARGET_ENDPOINT = "ws://localhost:9947";

const PROVIDED_ID = "xcmp_automation_test_1";

async function main () {
  await cryptoWaitReady();

  const keyring = new Keyring();
  const alice_key = await keyring.addFromUri('//Alice', undefined, 'sr25519');

  // Setup: API
  const oakApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_OAK_ENDPOINT),
    rpc: rpc,
  });
  const temApi = await ApiPromise.create({
    provider: new WsProvider(LOCAL_TARGET_ENDPOINT)
  });

  // Setup: Send TUR from Oak to Target Chain in order for Target Chain to pay fees.
  await oakApi.tx.xTokens.transfer(
    1,
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

  // Find derived proxy account for Oak + Alice.
  // This will be the account Alice delegates as a proxy on the Target Chain.
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
  const proxyAddress = u8aToHex(oakApi.registry.hash(toHash).slice(0, 32));

  // Delegate access to proxy account on Target Chain
  await temApi.tx.proxy.addProxy(proxyAddress, "Any", 0).signAndSend(alice_key);

  // Create encoded transaction to trigger on Target Chain
  const proxyCall = temApi.tx.proxy.proxy(
    ALICE,
    "Any",
    temApi.tx.system.remarkWithEvent("Hello, world!"),
  );
  const targetChainFees = await proxyCall.paymentInfo(ALICE);
  console.log("Target Chain fees:", targetChainFees.toHuman());
  const encodedProxyCall = proxyCall.method.toHex();

  // Schedule automated task on Oak
  // 1. Create the call for scheduleXcmpTask 
  // 2. Fake sign the call in order to get the combined fees from Turing.
  //    Turing xcmpHandler_fees RPC requires the encoded call in this format.
  //    Fees returned include inclusion, all executions, and XCMP fees to run on Target Chain.
  // 3. Sign and send scheduleXcmpTask call.
  const xcmpCall =  oakApi.tx.automationTime
    .scheduleXcmpTask(
      PROVIDED_ID,
      [0],
      TARGET_PARA_ID,
      1,
      encodedProxyCall,
      targetChainFees.weight,
    );
  const fakeSignedXcmpCall = xcmpCall.signFake(ALICE, {
    blockHash: oakApi.genesisHash,
    genesisHash: oakApi.genesisHash,
    nonce: 100, // does not except negative?
    runtimeVersion: oakApi.runtimeVersion,
  });
  const fees = await oakApi.rpc.xcmpHandler.fees(fakeSignedXcmpCall.toHex());
  console.log("rpc.xcmpHandler.fees:", fees.toHuman());

  await xcmpCall.signAndSend(alice_key, { nonce: -1 },({ events = [], status }) => {
      if (status.isInBlock) {
        console.log('Successful with hash ' + status.asInBlock.toHex());
        process.exit();
      } else {
        console.log('Status: ' + status.type);
      }
    });

  // Get TaskId for Task.
  const taskId = await oakApi.rpc.automationTime.generateTaskId(ALICE, PROVIDED_ID);
  console.log("TaskId:", taskId.toHuman());

  // Get Task
  const task = await oakApi.query.automationTime.accountTasks(ALICE, taskId);
  console.log("Task:", task.toHuman());
}

main() // .catch(console.error).finally(() => process.exit());
