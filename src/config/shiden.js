const PARA_ID = 2006;

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
    paraId: PARA_ID,
    ss58: 5,
    assets,
    location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
};

export default Config;
