import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN('250000000');
const WEIGHT_PROOF_SIZE = new BN('10000');

const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Local Token',
        symbol: 'UNIT',
        address: '',
        feePerSecond: new BN('10000000000000000000'),
    },
];

const Config = {
    name: 'Moonbase Local',
    key: 'moonbase-local',
    endpoint: 'ws://127.0.0.1:9949',
    relayChain: 'rococo-local',
    paraId: 1000,
    ss58: 1287,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
