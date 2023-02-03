const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Network',
    key: 'turing',
    endpoint: 'wss://rpc.turing.oak.tech',
    relayChain: 'kusama',
    paraId: 2114,
    ss58: 51,
    assets,
};

export default Config;
