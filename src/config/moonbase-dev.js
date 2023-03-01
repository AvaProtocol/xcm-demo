const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Development Token',
        symbol: 'UNIT',
        address: '',
    },
];

const Config = {
    name: 'Moonbase Development',
    key: 'moonbase-dev',
    endpoint: 'ws://127.0.0.1:9949',
    relayChain: 'rococo',
    paraId: 1000,
    ss58: 1287,
    assets,
};

export default Config;
