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
  const alicePublicKey = aliceKeyring.address;
  const turingAddress = keyring.encodeAddress(alicePublicKey, chainConfig.turing.ss58);
  const turingProxyAccount = turingHelper.getProxyAccount(turingAddress);

  console.log('turingProxyAccount: ', turingProxyAccount)
  
  // Add proxy
  console.log('\n1. Add proxy');
  await sendExtrinsic(turingHelper.api, turingHelper.api.tx.proxy.addProxy(turingProxyAccount, 'Any', 0), aliceKeyring);

  // Transfer amount to proxy account
  console.log('\n2. Transfer amount to proxy account');
  const transferExtrinsic = turingHelper.api.tx.balances.transfer(turingProxyAccount, '10000000000000');
  await sendExtrinsic(turingHelper.api, transferExtrinsic, aliceKeyring);

  // Reserve transfer amount to proxy account
  console.log('\n3. Reserve transfer amount to proxy account');
  const reserveTransferAssetsExtrinsic = shibuyaHelper.api.tx.polkadotXcm.reserveTransferAssets(
    {
      V1: {
        parents: 1,
        interior: { X1: { Parachain: TURING_PARA_ID } },
      },
    },
    {
      V1: {
        interior: { X1: { AccountId32: { network: { Any: '' }, id: turingProxyAccount } } },
        parents: 0
      }
    },
    {
      V1: [
        {
          fun: { Fungible: '9000000000000000000' },
          id: {
            Concrete: {
              interior: { Here: '' },
              parents: 0
            }
          }
        }
      ]
    },
    0
  );
  await sendExtrinsic(shibuyaHelper.api, reserveTransferAssetsExtrinsic, aliceKeyring);

  // Create the call for scheduleXcmpTask
  console.log('\n4. Create the call for polkadotXcm.send');
  const turingProxyExtrinsic = turingHelper.api.tx.system.remarkWithEvent('Hello!!!');
  const turingProxyCall = turingHelper.api.tx.proxy.proxy(turingProxyAccount, 'Any', turingProxyExtrinsic);
  
  const encodedTuringProxyCall = turingProxyCall.method.toHex();
  const turingProxyCallFees = await turingProxyCall.paymentInfo(turingAddress);

  console.log('encodedTuringProxyCall: ', encodedTuringProxyCall);
  console.log('turingProxyCallFees: ', turingProxyCallFees.toHuman());

  // Create polkadotXcm.send extrinsic
  console.log('\n5. Create polkadotXcm.send extrinsic');
	const xcmpExtrinsic = shibuyaHelper.api.tx.polkadotXcm.send(
		{
      V1: {
        parents: 1,
        interior: { X1: { Parachain: TURING_PARA_ID } },
      },
    },
    {
      V2: [
        {
          WithdrawAsset: [
            {
              fun: { Fungible: 6255948005536808 },
              id: {
                Concrete: {
                  interior: { X1: { Parachain: SHIBUYA_PARA_ID } },
                  parents: 1
                }
              }
            }
          ]
        },
        {
          BuyExecution: {
            fees: {
              fun: { Fungible: 6255948005536808 },
              id: {
                Concrete: {
                  interior: { X1: { Parachain: SHIBUYA_PARA_ID } },
                  parents: 1
                }
              }
            },
            weightLimit: { Limited: 6191761979 },
          },
        },
        {
          Transact: {
            originType: 'SovereignAccount',
            requireWeightAtMost: 191761979,
            call: encodedTuringProxyCall,
          },
        },
        {
          RefundSurplus: ''
        },
        {
          DepositAsset: {
            assets: { Wild: 'All' },
            maxAssets: 1,
            beneficiary: {
              parents: 1,
              interior: { X1: { AccountId32: { network: { Any: '' }, id: turingProxyAccount } } },
            }
          }
        },
      ]
    }
  );


  console.log('xcmpExtrinsic: ', xcmpExtrinsic);

  console.log('\n6. Sign and send polkadotXcm.send extrinsic ...');
  await sendExtrinsic(shibuyaHelper.api, xcmpExtrinsic, aliceKeyring);
};

main().catch(console.error).finally(() => process.exit());
