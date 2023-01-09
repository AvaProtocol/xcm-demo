import { Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import { decodeAddress } from '@polkadot/util-crypto';

import { env, chainConfig } from "./common/constants";
const { TURING_PARA_ID, SHIBUYA_ENDPOINT, TURING_ENDPOINT, SHIBUYA_PARA_ID } = env;

import shibuyaHelper from "./common/shibuyaHelper";
import turingHelper from "./common/turingHelper";
import { sendExtrinsic } from "./common/utils";

const getProxyAccount = (api, address) => {
  const decodedAddress = decodeAddress(address); // An Int array presentation of the address’ ss58 public key

  const location = {
    parents: 1, // From Turing to Mangata
    interior: {
      X2: [
        { Parachain: TURING_PARA_ID },
        {
          AccountId32: {
            network: "Any",
            id: u8aToHex(decodedAddress),
          }
        }
      ]
    }
  };

  const multilocation = api.createType("XcmV1MultiLocation", location);

  console.log("multilocation", multilocation.toString());

  const toHash = new Uint8Array([
    ...new Uint8Array([32]),
    ...new TextEncoder().encode("multiloc"),
    ...multilocation.toU8a(),
  ]);

  const DescendOriginAddress32 = u8aToHex(api.registry.hash(toHash).slice(0, 32));

  return DescendOriginAddress32;
}

const main = async () => {
  await turingHelper.initialize(TURING_ENDPOINT);
  await shibuyaHelper.initialize(SHIBUYA_ENDPOINT);

  const keyring = new Keyring();
  const aliceKeyring = keyring.addFromUri(`//Alice`, undefined, 'sr25519');
  const alicePublicKey = aliceKeyring.address;

  const shibuyaAddress = keyring.encodeAddress(alicePublicKey, chainConfig.shibuya.ss58);
  // const turingAddress = keyring.encodeAddress(alicePublicKey, chainConfig.turing.ss58);
  const proxyAccount = getProxyAccount(shibuyaHelper.api, shibuyaAddress);

  // // Add proxy
  console.log(`\n1. Add proxy`);
  await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyAccount, "Any", 0), aliceKeyring);

  // Transfer amount to proxy account
  console.log(`\n2. Transfer amount to proxy account`);
  const transferExtrinsic = shibuyaHelper.api.tx.balances.transfer(proxyAccount, '1000000000000000000000');
  await sendExtrinsic(shibuyaHelper.api, transferExtrinsic, aliceKeyring);

  // Create the call for scheduleXcmpTask
  console.log(`\n3. Create the call for scheduleXcmpTask `);
  const proxyExtrinsic = shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
  const shibuyaProxyCall = shibuyaHelper.api.tx.proxy.proxy(shibuyaAddress, 'Any', proxyExtrinsic);
  
  const encodedShibuyaProxyCall = shibuyaProxyCall.method.toHex(shibuyaProxyCall);
  const shibuyaProxyCallFees = await shibuyaProxyCall.paymentInfo(shibuyaAddress);

  console.log('encodedShibuyaProxyCall: ', encodedShibuyaProxyCall);
  console.log('shibuyaProxyCallFees: ', shibuyaProxyCallFees.toHuman());

  // Schedule xcmp task
  console.log('\n4. Create scheduleXcmpTask extrinsic');
  const providedId = "xcmp_automation_test_" + (Math.random() + 1).toString(36).substring(7);
  const xcmpCall = turingHelper.api.tx.automationTime.scheduleXcmpTask(
    providedId,
    { Fixed: { executionTimes: [0] } },
    SHIBUYA_PARA_ID,
    0,
    encodedShibuyaProxyCall,
    // 6191761979,
    parseInt(shibuyaProxyCallFees.weight.refTime),
  );

  console.log('xcmpCall: ', xcmpCall);

  console.log(`\n5. Sign and send scheduleXcmpTask call ...`);
  await sendExtrinsic(turingHelper.api, xcmpCall, aliceKeyring);
};

main().catch(console.error).finally(() => process.exit());
