const PARA_ID = 2114;

const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Staging',
    key: 'turing-staging',
    endpoint: 'wss://rpc.turing-staging.oak.tech',
    relayChain: 'rococo',
    paraId: PARA_ID,
    ss58: 51,
    assets,
    location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
};

export default Config;
