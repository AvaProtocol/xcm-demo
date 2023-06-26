import BN from 'bn.js';

const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Dev',
    key: 'turing-dev',
    endpoint: 'ws://127.0.0.1:9946',
    relayChain: 'rococo-dev',
    paraId: 2114,
    ss58: 51,
    assets,
    instructionWeight: { refTime: new BN(1_000_000_000), proofSize: new BN(0) },
    feePerSecond: new BN('10000000000000000000'),
};

export default Config;
