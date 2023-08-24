import BN from 'bn.js';

const PARA_ID = 2023;
const NATIVE_TOKEN = 'MOVR';
const WEIGHT_REF_TIME = new BN('200000000');
const WEIGHT_PROOF_SIZE = new BN('0');

const assets = [
    {
        id: '0',
        chainId: 0,
        decimals: 18,
        name: 'Moonriver',
        symbol: NATIVE_TOKEN,
        address: '',
        location: { parents: 1, interior: { X2: [{ Parachain: PARA_ID }, { PalletInstance: 10 }] } },
        relativeLocation: { parents: 0, interior: { X1: { PalletInstance: 10 } } },
    },
];

const Config = {
    name: 'Moonriver',
    key: 'moonriver',
    endpoint: 'wss://wss.api.moonriver.moonbeam.network',
    relayChain: 'kusama',
    paraId: PARA_ID,
    ss58: 1285,
    assets,
    symbol: NATIVE_TOKEN,
    instructionWeight: { refTime: WEIGHT_REF_TIME, proofSize: WEIGHT_PROOF_SIZE },
};

export default Config;
