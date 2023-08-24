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
    name: 'Turing Network',
    key: 'turing',
    endpoint: 'wss://rpc.turing.oak.tech',
    relayChain: 'kusama',
    paraId: PARA_ID,
    ss58: 51,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
    symbol: NATIVE_TOKEN,
};

export default Config;