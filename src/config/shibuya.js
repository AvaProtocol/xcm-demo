import BN from 'bn.js';

const assets = [
    {
        symbol: 'SBY',
        decimals: 18,
    },
];

const Config = {
    name: 'Shibuya',
    key: 'shibuya',
    endpoint: 'ws://127.0.0.1:9948',
    relayChain: 'rococo-dev',
    paraId: 2000,
    ss58: 5,
    assets,
    instructionWeight: { refTime: new BN(1_000_000_000), proofSize: new BN(1024) },
    feePerSecond: new BN('10000000000000000000'),
};

export default Config;
