const PARA_ID = 2006;

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
    paraId: PARA_ID,
    ss58: 5,
    assets,
    location: { parents: 1, interior: { X1: { Parachain: PARA_ID } } },
};

export default Config;
