const assets = {
    ROC: {
        decimals: 12,
    },
};

const Config = {
    name: 'Rococo',
    key: 'rococo',
    endpoint: 'wss://rococo-rpc.polkadot.io',
    relayChain: 'rococo',
    paraId: undefined,
    ss58: 42,
    assets,
};

export default Config;
