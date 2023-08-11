import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(0);

const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
    {
        symbol: 'DEV',
        decimals: 18,
        feePerSecond: new BN('10000000000000000000'),
    },
];

const Config = {
    name: 'Turing Moonbase',
    key: 'turing-moonbase',
    endpoint: 'ws://167.99.226.24:8846',
    relayChain: 'moonbase-relay-testnet',
    paraId: 2114,
    ss58: 51,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
