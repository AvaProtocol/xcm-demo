const PARA_ID = 1000;
const NATIVE_TOKEN = 'DEV';

const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Alpha DEV',
        symbol: NATIVE_TOKEN,
        address: '',
        location: { parents: 1, interior: { X2: [{ Parachain: PARA_ID }, { PalletInstance: 3 }] } },
    },
];

const Config = {
    name: 'Moonbase Alpha',
    key: 'moonbase-alpha',
    endpoint: 'wss://wss.api.moonbase.moonbeam.network',
    relayChain: 'rococo',
    paraId: PARA_ID,
    ss58: 1287,
    assets,
    symbol: NATIVE_TOKEN,
};

export default Config;
