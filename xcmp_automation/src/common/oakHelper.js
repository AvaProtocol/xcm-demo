import { rpc } from '@imstar15/types';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";

// const MANGATA_ENDPOINT = 'ws://127.0.0.1:6644';
const OAK_PARA_ID = 2114;
const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const SUBSTRATE_SS58 = 42;

class OakHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint), rpc });
		this.api = api;
  }

  getApi = () => {
		return this.api;
	}

  getProxyAccount = (address) => {
    const keyring = new Keyring();
    const location = {
      parents: 1,
      interior: {
        X2: [
          { Parachain: OAK_PARA_ID },
          {
            AccountId32: {
              network: "Any",
              id: keyring.decodeAddress(address),
            }
          }
        ]
      }
    };
    const multilocation = this.api.createType("XcmV1MultiLocation", location);
    const toHash = new Uint8Array([
      ...new Uint8Array([32]),
      ...new TextEncoder().encode("multiloc"),
      ...multilocation.toU8a(),
    ]);
    const proxyAccount = u8aToHex(this.api.registry.hash(toHash).slice(0, 32));
    return proxyAccount;
  }

  /**
   * Get XCM fees
   * Fake sign the call in order to get the combined fees from Turing.
   * Turing xcmpHandler_fees RPC requires the encoded call in this format.
   * Fees returned include inclusion, all executions, and XCMP fees to run on Target Chain.
   * @param {*} address 
   * @param {*} xcmpCall 
   * @returns 
   */
  getXcmFees = async (address, xcmpCall) => {
    const fakeSignedXcmpCall = xcmpCall.signFake(address, {
      blockHash: this.api.genesisHash,
      genesisHash: this.api.genesisHash,
      nonce: 100, // does not except negative?
      runtimeVersion: this.api.runtimeVersion,
    });
  
    const fees = await this.api.rpc.xcmpHandler.fees(fakeSignedXcmpCall.toHex());
    return fees;
  }
};

export default new OakHelper();