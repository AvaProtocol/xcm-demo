# Box

This is the Ethereum smart contracts for testing.

Read about:
https://docs.moonbeam.network/builders/build/eth-api/dev-env/hardhat/

## Configuration

Please configure your private key to the secrets.json file in the root directory.

```
{
	"privateKey": "YOUR-PRIVATE-KEY-HERE"
}
```

## Deploy

```
npm install
npx hardhat compile
npx hardhat run scripts/deploy.js
```
