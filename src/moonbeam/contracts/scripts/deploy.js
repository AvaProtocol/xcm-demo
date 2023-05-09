const { ethers } = require('hardhat');

const deployContract = async (contractName) => {
    // 1. Get the contract to deploy
    const Contract = await ethers.getContractFactory(contractName);
    console.log(`Deploying ${contractName}...`);

    // 2. Instantiating a new Box smart contract
    const contract = await Contract.deploy();

    // 3. Waiting for the deployment to resolve
    await contract.deployed();

    // 4. Use the contract instance to get the contract address
    console.log(`${contractName} deployed to: `, contract.address);
};

async function main() {
    await deployContract('Box');
    await deployContract('Incrementer');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
