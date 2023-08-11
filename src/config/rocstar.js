const PARA_ID = 2006;
const NATIVE_TOKEN = 'RSTR';

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 18,
        location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
    },
];

const Config = {
    name: 'Rocstar Testnet',
    key: 'rocstar',
    endpoint: 'wss://rocstar.astar.network',
    relayChain: 'rococo',
    paraId: PARA_ID,
    ss58: 5,
    assets,
    symbol: NATIVE_TOKEN,
};

export default Config;
