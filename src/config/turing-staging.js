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
    paraId: 2114,
    ss58: 51,
    assets,
};

export default Config;
