import "@imstar15/api-augment";
import { Keyring } from "@polkadot/api";
import { cryptoWaitReady } from '@polkadot/util-crypto';
import oakHelper from "./common/oakHelper";
import mangataHelper from "./common/mangataHelper";

const SUBSTRATE_SS58 = 42;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;
const TURING_ENDPOINT = process.env.TURING_ENDPOINT;
const MANGATA_ENDPOINT = process.env.MANGATA_ENDPOINT;

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

async function main () {
  await cryptoWaitReady();

  const keyring = new Keyring();
  const keyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');
  console.log('Account address: ', keyPair.address);

  // Initialize
  await oakHelper.initialize(TURING_ENDPOINT);
  await mangataHelper.initialize(MANGATA_ENDPOINT);
  const oakApi = oakHelper.getApi();

  const freeBalance = await mangataHelper.checkFreeBalance(keyPair.address);
  console.log("freeBalance on Mangata", freeBalance.toString());

  const proxyAccount = oakHelper.getProxyAccount(keyPair.address);
  console.log("proxy account:", keyring.encodeAddress(proxyAccount, SUBSTRATE_SS58));

  mangataHelper.addProxy(proxyAccount, keyPair);
  console.log('Add proxy on mangata successfully!');

  const proxyExtrinsic = mangataHelper.getApi().tx.system.remarkWithEvent("Hello, world!");
  const mangataProxyCall = await mangataHelper.createProxyCall(keyPair.address, proxyExtrinsic);
  const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
  const mangataProxyCallFees = await mangataProxyCall.paymentInfo(keyPair.address);

  console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
  console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

   // Schedule automated task on Oak
  // 1. Create the call for scheduleXcmpTask 
  const providedId = "xcmp_automation_test_" + (Math.random() + 1).toString(36).substring(7);
  const xcmpCall =  oakApi.tx.automationTime.scheduleXcmpTask(
    providedId,
    { Fixed: { executionTimes: [0] } },
    MANGATA_PARA_ID,
    0,
    encodedMangataProxyCall,
    mangataProxyCallFees.weight,
  );
  console.log('xcmpCall: ', xcmpCall);

  const xcmFrees = await oakHelper.getXcmFees(keyPair.address, xcmpCall);
  console.log("xcmFrees:", xcmFrees.toHuman());

  // 3. Sign and send scheduleXcmpTask call.
  // Get TaskId for Task.
  const taskId = await oakApi.rpc.automationTime.generateTaskId(keyPair.address, providedId);
  console.log("TaskId:", taskId.toHuman());

  await oakHelper.sendXcmExtrinsic(xcmpCall, keyPair, taskId);
}

main().catch(console.error).finally(() => process.exit());
