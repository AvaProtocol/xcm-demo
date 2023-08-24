import BN from 'bn.js';

const PARA_ID = 2007;
const NATIVE_TOKEN = 'SDN';
const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(64 * 1024);

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 18,
        location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
    },
];

const Config = {
    name: 'Shiden',
    key: 'shiden',
    endpoint: 'wss://shiden-rpc.dwellir.com',
    relayChain: 'kusama',
    paraId: PARA_ID,
    ss58: 5,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
    symbol: NATIVE_TOKEN,
};

export default Config;
