import BN from 'bn.js';

const PARA_ID = 2114;
const NATIVE_TOKEN = 'TUR';
const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(0);

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Moonbase',
    key: 'turing-moonbase',
    endpoint: 'ws://167.99.226.24:8846',
    relayChain: 'moonbase-relay-testnet',
    paraId: PARA_ID,
    ss58: 51,
    assets,
    symbol: NATIVE_TOKEN,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
