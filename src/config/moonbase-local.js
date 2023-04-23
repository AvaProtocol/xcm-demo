const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Local Token',
        symbol: 'UNIT',
        address: '',
    },
];

const Config = {
    name: 'Moonbase Local',
    key: 'moonbase-local',
    endpoint: 'ws://127.0.0.1:9949',
    relayChain: 'rococo-local',
    paraId: 1000,
    ss58: 1287,
    assets,
};

export default Config;
