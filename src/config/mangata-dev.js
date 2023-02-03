const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Mangata',
        symbol: 'MGR',
        address: '',
    },
    {
        id: '4',
        chainId: 0,
        decimals: 12,
        name: 'Rococo  Native',
        symbol: 'ROC',
        address: '',
    },
    {
        id: '7',
        chainId: 0,
        decimals: 10,
        name: 'Turing native token',
        symbol: 'TUR',
        address: '',
    },
];

const pools = [
];

const Config = {
    name: 'Mangata Dev',
    key: 'mangata-dev',
    endpoint: 'ws://127.0.0.1:9947',
    relayChain: 'rococo-dev',
    paraId: 2110,
    ss58: 42,
    assets,
    pools,
};

export default Config;
