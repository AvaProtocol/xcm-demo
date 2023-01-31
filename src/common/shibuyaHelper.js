import { ApiPromise, WsProvider } from "@polkadot/api";
import { instructionWeight, env } from "./constants";
import { getProxyAccount } from "./utils";

const { SHIBUYA_PARA_ID } = env;

class ShibuyaHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint) });
		this.api = api;
  }

  getApi = () => this.api;

  getProxyAccount = (parachainId, address) => getProxyAccount(this.api, parachainId, address)

  createTransactExtrinsic = ({targetParaId, encodedCall, fungible, requireWeightAtMost, proxyAccount}) => {
    const totalInstructionWeight = 6 * instructionWeight;
    const xcmpExtrinsic = this.api.tx.polkadotXcm.send(
      {
        V1: {
          parents: 1,
          interior: { X1: { Parachain: targetParaId } },
        },
      },
      {
        V2: [
          {
            WithdrawAsset: [
              {
                fun: { Fungible: fungible },
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
                fun: { Fungible: fungible },
                id: {
                  Concrete: {
                    interior: { X1: { Parachain: SHIBUYA_PARA_ID } },
                    parents: 1
                  }
                }
              },
              weightLimit: { Limited: requireWeightAtMost + totalInstructionWeight },
            },
          },
          {
            Transact: {
              originType: 'SovereignAccount',
              requireWeightAtMost,
              call: { encoded: encodedCall },
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
                interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyAccount } } },
              }
            }
          },
        ]
      }
    );
    return xcmpExtrinsic;
  }

  createReserveTransferAssetsExtrinsic = (targetParaId, proxyAccount, amount) => {
    const extrinsic = this.api.tx.polkadotXcm.reserveTransferAssets(
      {
        V1: {
          parents: 1,
          interior: { X1: { Parachain: targetParaId } },
        },
      },
      {
        V1: {
          interior: { X1: { AccountId32: { network: { Any: '' }, id: proxyAccount } } },
          parents: 0
        }
      },
      {
        V1: [
          {
            fun: { Fungible: amount},
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

    return extrinsic;
  }
}

export default new ShibuyaHelper();