// 1. Import the Ethers plugin required to interact with the contract
require('@nomiclabs/hardhat-ethers');

// 2. Import your private key from your pre-funded Moonbase Alpha testing account
const { privateKey } = require('./secrets.json');

module.exports = {
    solidity: '0.8.18',
    networks: {
        'moonbase-local': {
            url: 'http://127.0.0.1:9949',
            chainId: 1280,
            accounts: [privateKey],
        },
    },
    defaultNetwork: 'moonbase-local',
};
