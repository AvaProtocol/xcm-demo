import "@imstar15/api-augment";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
// import { XcmV1MultiLocation } from "@polkadot/types/lookup"
import { cryptoWaitReady } from '@polkadot/util-crypto';
// import { rpc } from '@imstar15/types';
// import moment from 'moment-timezone';
import oakHelper from "./common/oakHelper";
import mangataHelper from "./common/mangataHelper";
// import OakHelper from "./common/OakHelper";
import BN from 'bn.js';

const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const TARGET_PARA_ID = 2110;
const SUBSTRATE_SS58 = 42;
// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

const LOCAL_OAK_ENDPOINT = "ws://localhost:8846";
const LOCAL_TARGET_ENDPOINT = "ws://localhost:6644";

async function main () {
  // Initialize
  await cryptoWaitReady();
  await oakHelper.initialize(LOCAL_OAK_ENDPOINT);
  await mangataHelper.initialize();
  const oakApi = oakHelper.getApi();

  const keyring = new Keyring();
  const aliceKeyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');

  // await mangataHelper.mangata.createPool(
  //   aliceKeyPair,
  //   '0', // Token Id 0 is MGX
  //   new BN('1000000000000000000000'), // 1000 MGX (MGX is 18 decimals)
  //   '4', // Token Id 4 is KSM
  //   new BN('1000000000000'), // 1 KSM (KSM is 12 decimals)
  //   {
  //     statusCallback: (result) => {
  //       // result is of the form ISubmittableResult
  //       console.log(result)
  //     },
  //     extrinsicStatus: (result) => {
  //       // result is of the form MangataGenericEvent[]
  //       for (let index = 0; index < result.length; index++) {
  //             console.log('Phase', result[index].phase.toString())
  //             console.log('Section', result[index].section)
  //             console.log('Method', result[index].method)
  //             console.log('Documentation', result[index].metaDocumentation)
  //       }
  //     },
  //   }
  // );

  // const pools = await mangataHelper.mangata.getPools()
  // console.log('pools: ', pools);

  

  const freeBalance = await mangataHelper.checkFreeBalance(aliceKeyPair.address);
  console.log("Alice's freeBalance on Mangata", freeBalance.toString());

  const aliceProxyAccount = oakHelper.getProxyAccount(ALICE);
  console.log("Alice's proxy account:", keyring.encodeAddress(aliceProxyAccount, SUBSTRATE_SS58));

  mangataHelper.addProxy(aliceProxyAccount, aliceKeyPair);
  console.log('Alice add proxy on mangata successfully!');

  const mangataProxyCall = await mangataHelper.createProxyCall(ALICE, mangataHelper.getApi().tx.system.remarkWithEvent("Hello, world!"));
  const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
  const mangataProxyCallFees = await mangataProxyCall.paymentInfo(ALICE);

  console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
  console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

   // Schedule automated task on Oak
  // 1. Create the call for scheduleXcmpTask 
  const providedId = "xcmp_automation_test_" + (Math.random() + 1).toString(36).substring(7);
  const xcmpCall =  oakApi.tx.automationTime.scheduleXcmpTask(
    providedId,
    { Fixed: { executionTimes: [0] } },
    TARGET_PARA_ID,
    0,
    encodedMangataProxyCall,
    mangataProxyCallFees.weight,
  );
  console.log('xcmpCall: ', xcmpCall);

  const xcmFrees = await oakHelper.getXcmFees(ALICE, xcmpCall);
  console.log("xcmFrees:", xcmFrees.toHuman());

  // 3. Sign and send scheduleXcmpTask call.
  // Get TaskId for Task.
  const taskId = await oakApi.rpc.automationTime.generateTaskId(ALICE, providedId);
  console.log("TaskId:", taskId.toHuman());

  await xcmpCall.signAndSend(aliceKeyPair, { nonce: -1 }, async ({ status }) => {
      if (status.isInBlock) {
        console.log('Successful with hash ' + status.asInBlock.toHex());

        // Get Task
        const task = await oakApi.query.automationTime.accountTasks(ALICE, taskId);
        console.log("Task:", task.toHuman());

        process.exit();
      } else {
        console.log('Status: ' + status.type);
      }
    });
}

main().catch(console.error).finally(() => process.exit());
