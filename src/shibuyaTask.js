import { Keyring } from '@polkadot/api';

import turingHelper from './common/turingHelper';
import shibuyaHelper from './common/shibuyaHelper';
import { sendExtrinsic } from './common/utils';
import { env, chainConfig } from './common/constants';

const { SHIBUYA_ENDPOINT, TURING_ENDPOINT, SHIBUYA_PARA_ID, TURING_PARA_ID } = env;

const main = async () => {
  await turingHelper.initialize(TURING_ENDPOINT);
  await shibuyaHelper.initialize(SHIBUYA_ENDPOINT);

  const keyring = new Keyring();
  const aliceKeyring = keyring.addFromUri('//Alice', undefined, 'sr25519');
  const turingAddress = keyring.encodeAddress(aliceKeyring.address, chainConfig.turing.ss58);
  const shibuyaAddress = keyring.encodeAddress(aliceKeyring.address, chainConfig.shibuya.ss58);

  const proxyAccountOnTuring = turingHelper.getProxyAccount(SHIBUYA_PARA_ID, turingAddress);
  console.log('proxyAccountOnTuring: ', proxyAccountOnTuring);

  const proxyAccountOnShibuya = shibuyaHelper.getProxyAccount(TURING_PARA_ID, shibuyaAddress)
  console.log('proxyAccountOnShibuya: ', proxyAccountOnShibuya);

  // Add proxy on Turing and Shibuya
  console.log('\n1.1. Add proxy on Turing');
  await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(proxyAccountOnTuring, 'Any', 0), aliceKeyring);

  console.log('\n1.2. Add proxy on Shibuya');
  await sendExtrinsic(shibuyaHelper.api, shibuyaHelper.api.tx.proxy.addProxy(proxyAccountOnShibuya, 'Any', 0), aliceKeyring);

  // Transfer amount to proxy account on Turing
  console.log('\n2.1. Transfer amount to proxy account on Turing');
  const transferExtrinsic = turingHelper.api.tx.balances.transfer(proxyAccountOnTuring, '10000000000000');
  await sendExtrinsic(turingHelper.api, transferExtrinsic, aliceKeyring);

  // Transfer amount to proxy account on Shibuya
  console.log('\n2.2. Transfer amount to proxy account on Shibuya');
  const transferExtrinsicOnShibuya = shibuyaHelper.api.tx.balances.transfer(proxyAccountOnShibuya, '1000000000000000000000');
  await sendExtrinsic(shibuyaHelper.api, transferExtrinsicOnShibuya, aliceKeyring);

  // Reserve transfer SBY to proxy account
  console.log('\n3. Reserve transfer SBY from Shibuya to the proxy account on Turing');
  const reserveTransferAssetsExtrinsic = shibuyaHelper.createReserveTransferAssetsExtrinsic(TURING_PARA_ID, proxyAccountOnTuring, '9000000000000000000');
  await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, aliceKeyring);

  // Create proxy extrinsic on Shibuya
  console.log('\n4. Create the shibuya task for automationTime.scheduleXcmpTask');
  const proxyExtrinsic = shibuyaHelper.api.tx.system.remarkWithEvent('Hello!!!');
  const shibuyaProxyCall = shibuyaHelper.api.tx.proxy.proxy(shibuyaAddress, 'Any', proxyExtrinsic);
  const encodedShibuyaProxyCall = shibuyaProxyCall.method.toHex(shibuyaProxyCall);
  const shibuyaProxyCallFees = await shibuyaProxyCall.paymentInfo(shibuyaAddress);

  // Create automationTime.scheduleXcmpTask extrinsic with proxy extrinsic
  console.log('\n5. Create automationTime.scheduleXcmpTask extrinsic');
  const providedId = "xcmp_automation_test_" + (Math.random() + 1).toString(36).substring(7);
  const shibuyaTaskExtrinsic = turingHelper.api.tx.automationTime.scheduleXcmpTask(
    providedId,
    { Fixed: { executionTimes: [0] } },
    SHIBUYA_PARA_ID,
    0,
    encodedShibuyaProxyCall,
    parseInt(shibuyaProxyCallFees.weight.refTime),
  );

  // Create the proxy call on Turing
  console.log('\n6. Create the proxy call on Turing');
  const turingProxyCall = turingHelper.api.tx.proxy.proxy(turingAddress, 'Any', shibuyaTaskExtrinsic);
  
  const encodedTuringProxyCall = turingProxyCall.method.toHex();
  const turingProxyCallFees = await turingProxyCall.paymentInfo(turingAddress);

  console.log('encodedTuringProxyCall: ', encodedTuringProxyCall);
  console.log('turingProxyCallFees: ', turingProxyCallFees.toHuman());

  const requireWeightAtMost = parseInt(turingProxyCallFees.weight);
  const fungible = 6255948005536808;

  // Create polkadotXcm.send extrinsic from Shibuya
  console.log('\n7. Create polkadotXcm.send extrinsic from Shibuya');
  const xcmpExtrinsic = shibuyaHelper.createTransactExtrinsic({
    targetParaId: TURING_PARA_ID,
    encodedCall: encodedTuringProxyCall,
    fungible,
    requireWeightAtMost,
    proxyAccount: proxyAccountOnTuring,
  })

  console.log('xcmpExtrinsic: ', xcmpExtrinsic);

  console.log('\n8. Sign and send polkadotXcm.send extrinsic ...');
  await sendExtrinsic(shibuyaHelper.api, xcmpExtrinsic, aliceKeyring);
};

main().catch(console.error).finally(() => process.exit());
