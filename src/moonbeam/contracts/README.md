# Box

This is the Ethereum smart contracts for testing.

Read about:
https://docs.moonbeam.network/builders/build/eth-api/dev-env/hardhat/

## Deploy

The default sudo wallet of Moonbase Local Alith is used to deploy a smart contract. Run the below commands to deploy a smart contract to Moonbase Local.

```
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js
```

The commands, if successful, will print out the newly deployed smart contract. Take the Incrementer contract’s Ethereum address, and set the value to CONTRACT_ADDRESS in the beginning of src/moonbeam/moonbase-local.js. You do not need to change the value CONTRACT_INPUT;