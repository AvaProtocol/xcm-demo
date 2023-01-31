Mangata XCM Auto-compound E2E Demo
----------
# Overview
![Automation Integration Flow Chart](./assets/flow-technical.png)

# Installation
1. Install dependencies, `npm i`
2. Set up environment variables for local network in `.env`.
3. Run a local Rococo-Mangata-Turing network with instructions in [Run local network with Zombienet](https://github.com/OAK-Foundation/OAK-blockchain#quickstart-run-local-network-with-zombienet)

# Run Mangata demo
1. Launch OAK-blockchain, Rococo and Mangata.

	- Compile OAK

		https://github.com/OAK-Foundation/OAK-blockchain/

		```
		cargo build --release --features turing-node --features dev-queue
		```


	- Compile modified Mangata

		https://github.com/OAK-Foundation/mangata-node/tree/mangata-demo

		```
		cargo build --release --features mangata-rococo,fast-runtime
		```


	- Clear the relay chain directory of mangata-node before running zombienet command, because currently mangata-node couldn’t auto-purge.

		```
		./target/release/mangata-node purge-chain
		```

	- Launch zombie in OAK-blockchain project root with modified Mangata and OAK.

		```
		zombie spawn zombienets/turing/mangata.toml
		```

2. Set up accounts and pools
	```
	npm run setup-mangata
	```
3. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm run mangata
   ```

# Run Shiubya demo
## Pre-requisite
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [0.9.29](https://github.com/paritytech/polkadot/releases/tag/v0.9.29)       |		[94078b4](https://github.com/paritytech/polkadot/commit/94078b44fb6c9767bf60ffcaaa3be40681be5a76)  |
| OAK-blockchain   | 1.8.0     |	[d04462](https://github.com/OAK-Foundation/OAK-blockchain/pull/328/commits/d044a62825746e6dd8b7593a6c7dfb9eefcac308)  |
| Astar | x   | [523c067](https://github.com/AstarNetwork/Astar/commit/523c06798a08189a3ea20f790b83cd4ae602c579)        |
## Steps
1. Launch OAK-blockchain, Rococo and Shibuya.

	Launch zombie in OAK-blockchain project root with Astar and modified OAK.
	
	https://github.com/OAK-Foundation/OAK-blockchain/tree/debug-shibuya

	```
	zombie spawn zombienets/turing/shibuya.toml
	```

2. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm run shibuya
   ```