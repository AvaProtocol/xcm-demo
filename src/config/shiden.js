const assets = [
    {
        symbol: 'SDN',
        decimals: 18,
    },
];

const Config = {
    name: 'Shiden',
    key: 'shiden',
    endpoint: 'wss://shiden-rpc.dwellir.com',
    relayChain: 'kusama',
    paraId: 2007,
    ss58: 5,
    assets,
};

export default Config;
