import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(0);

const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
    {
        symbol: 'RSTR',
        decimals: 18,
        feePerSecond: new BN('2000000'),
    },
];

const Config = {
    name: 'Turing Staging',
    key: 'turing-staging',
    endpoint: 'wss://rpc.turing-staging.oak.tech',
    relayChain: 'rococo',
    paraId: 2114,
    ss58: 51,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
