const PARA_ID = 2007;
const NATIVE_TOKEN = 'SDN';

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 18,
        location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
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
    symbol: NATIVE_TOKEN,
};

export default Config;
