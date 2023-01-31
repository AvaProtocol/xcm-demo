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
};

export default Config;
