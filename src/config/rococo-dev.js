const assets = {
    UNIT: {
        decimals: 12,
    },
};

const Config = {
    name: 'Rococo Local Testnet',
    key: 'rococo-dev',
    endpoint: 'ws://127.0.0.1:59225',
    relayChain: 'rococo-dev',
    paraId: undefined,
    ss58: 42,
    assets,
};

export default Config;
