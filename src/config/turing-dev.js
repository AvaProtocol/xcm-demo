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
};

export default Config;
