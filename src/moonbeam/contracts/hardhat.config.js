// Import the Ethers plugin required to interact with the contract
require('@nomiclabs/hardhat-ethers');

// Alith’s private key. Alith is one of the default sudo wallet on Moonbase Local.
const PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';

module.exports = {
    solidity: '0.8.18',
    networks: {
        'moonbase-local': {
            url: 'http://127.0.0.1:9949',
            chainId: 1280,
            accounts: [PRIVATE_KEY],
        },
    },
    defaultNetwork: 'moonbase-local',
};
