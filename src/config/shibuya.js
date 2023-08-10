import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(1024);
const PARA_ID = 2000;

const assets = [
    {
        symbol: 'SBY',
        decimals: 18,
        feePerSecond: new BN('10000000000000000000'),
    },
];

const Config = {
    name: 'Shibuya',
    key: 'shibuya',
    endpoint: 'ws://127.0.0.1:9948',
    relayChain: 'rococo-dev',
    paraId: PARA_ID,
    ss58: 5,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
    location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
};

export default Config;
