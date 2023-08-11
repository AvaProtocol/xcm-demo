import BN from 'bn.js';

const PARA_ID = 2006;
const NATIVE_TOKEN = 'RSTR';
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
    name: 'Rocstar Testnet',
    key: 'rocstar',
    endpoint: 'wss://rocstar.astar.network',
    relayChain: 'rococo',
    paraId: PARA_ID,
    ss58: 5,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
    symbol: NATIVE_TOKEN,
};

export default Config;
