const assets = [
    {
        symbol: 'RSTR',
        decimals: 18,
    },
];

const Config = {
    name: 'Rocstar Testnet',
    key: 'rocstar',
    endpoint: 'wss://rocstar.astar.network',
    relayChain: 'rococo',
    paraId: 2006,
    ss58: 5,
    assets,
};

export default Config;
