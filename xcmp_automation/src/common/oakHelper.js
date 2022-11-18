import { rpc } from '@imstar15/types';
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { u8aToHex } from "@polkadot/util";
import BN from 'bn.js';

const OAK_PARA_ID = 2114;
const MANGATA_SS58 = 42;
const MANGATA_PARA_ID = process.env.MANGATA_PARA_ID;

const DECIMAL = {
  MGX: '1000000000000000000',
  KSM: '1000000000000',
  TUR: '10000000000',
};

class OakHelper {
  initialize = async (endpoint) => {
    const api = await ApiPromise.create({ provider: new WsProvider(endpoint), rpc });
		this.api = api;
  }

  getApi = () => this.api;

  getAccountInfo = async(address)=>{
    // Retrieve the account balance & nonce via the system module
    const { data: balance } = await this.api.query.system.account(address);

    const turBalance = balance.free.div(new BN(DECIMAL.TUR)).toNumber()

    // TODO: figure out how to retrieve balance of other tokens
    return {TUR: turBalance};
  }

  getProxyAddressMangata = (address) => {
    const keyring = new Keyring();
    const mangataAddress = keyring.encodeAddress(address, MANGATA_SS58);

    const location = {
      parents: 1,
      interior: {
        X2: [
          { Parachain: MANGATA_PARA_ID },
          {
            AccountId32: {
              network: "Any",
              id: keyring.decodeAddress(mangataAddress),
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

  xcmSend = async (dest, message) => {
    console.log("xcmSend,",dest,message);

    return new Promise(async (resolve) => {
      const unsub = await this.api.tx.polkadotXcm.send(dest, message).signAndSend(keyPair, { nonce: -1 }, async ({ status }) => {
        if (status.isInBlock) {
          console.log('Successful with hash ' + status.asInBlock.toHex());
  
          unsub();
          resolve();
        } else {
          console.log('Status: ' + status.type);
        }
      });
    });
}

  sendXcmExtrinsic = async (xcmpCall, keyPair, taskId) => {
    return new Promise(async (resolve) => {
      const unsub = await xcmpCall.signAndSend(keyPair, { nonce: -1 }, async ({ status }) => {
        if (status.isInBlock) {
          console.log('Successful with hash ' + status.asInBlock.toHex());
  
          // Get Task
          const task = await this.api.query.automationTime.accountTasks(keyPair.address, taskId);
          console.log("Task:", task.toHuman());
  
          unsub();
          resolve();
        } else {
          console.log('Status: ' + status.type);
        }
      });
    });
  }
};

export default new OakHelper();