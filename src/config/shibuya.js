import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN(1_000_000_000);
const WEIGHT_PROOF_SIZE = new BN(1024);
const PARA_ID = 2000;
const NATIVE_TOKEN = 'SBY';

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 18,
        feePerSecond: new BN('10000000000000000000'),
        location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
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
    symbol: NATIVE_TOKEN,
};

export default Config;
