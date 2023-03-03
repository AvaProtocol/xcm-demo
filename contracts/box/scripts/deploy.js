const { ethers } = require('hardhat');

async function main() {
    // 1. Get the contract to deploy
    const Box = await ethers.getContractFactory('Box');
    console.log('Deploying Box...');

    // 2. Instantiating a new Box smart contract
    const box = await Box.deploy();

    // 3. Waiting for the deployment to resolve
    await box.deployed();

    // 4. Use the contract instance to get the contract address
    console.log('Box deployed to:', box.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
