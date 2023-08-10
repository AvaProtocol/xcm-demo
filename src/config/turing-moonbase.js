const PARA_ID = 2114;

const assets = [
    {
        symbol: 'TUR',
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
    location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
};

export default Config;
