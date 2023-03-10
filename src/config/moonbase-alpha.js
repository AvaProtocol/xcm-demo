const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Alpha DEV',
        symbol: 'DEV',
        address: '',
    },
];

const Config = {
    name: 'Moonbase Alpha',
    key: 'moonbase-alpha',
    endpoint: 'wss://wss.api.moonbase.moonbeam.network',
    relayChain: 'rococo',
    paraId: 1000,
    ss58: 1287,
    assets,
};

export default Config;
