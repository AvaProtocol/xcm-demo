import BN from 'bn.js';

const WEIGHT_REF_TIME = new BN('250000000');
const WEIGHT_PROOF_SIZE = new BN('10000');

const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonbase Alpha DEV',
        symbol: 'DEV',
        address: '',
    },
];

const Config = {
    name: 'Moonbase Alpha',
    key: 'moonbase-alpha',
    endpoint: 'wss://wss.api.moonbase.moonbeam.network',
    relayChain: 'rococo',
    paraId: 1000,
    ss58: 1287,
    assets,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
