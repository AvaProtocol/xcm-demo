import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(64 * 1024);

const assets = [
    {
        symbol: 'RSTR',
        decimals: 18,
    },
];

const Config = {
    name: 'Rocstar Testnet',
    key: 'rocstar',
    endpoint: 'wss://rocstar.astar.network',
    relayChain: 'rococo',
    paraId: 2006,
    ss58: 5,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
