const PARA_ID = 2114;
const NATIVE_TOKEN = 'TUR';

const assets = [
    {
        symbol: NATIVE_TOKEN,
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Staging',
    key: 'turing-staging',
    endpoint: 'wss://rpc.turing-staging.oak.tech',
    relayChain: 'rococo',
    paraId: PARA_ID,
    ss58: 51,
    assets,
    symbol: NATIVE_TOKEN,
};

export default Config;
