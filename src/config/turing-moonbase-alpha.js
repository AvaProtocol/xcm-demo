const assets = [
    {
        symbol: 'TUR',
        decimals: 10,
    },
];

const Config = {
    name: 'Turing Moonbase Alpha',
    key: 'turing-moonbase-alpha',
    endpoint: 'ws://167.99.226.24:8846',
    relayChain: 'rococo',
    paraId: 2114,
    ss58: 51,
    assets,
};

export default Config;
