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

		cargo build --release --features turing-node --features dev-queue


	- Compile modified Mangata

		https://github.com/OAK-Foundation/mangata-node/tree/mangata-demo

		```
		cargo build --release --features mangata-rococo
		```


	- Clear the mangata reply chain data

		```
		./target/release/mangata-node purge-chain
		```

	- Launch zombie in OAK-blockchain project root with modified Mangata and OAK.

		```
		zombie spawn zombienets/turing/mangata.toml
		```


		*Tip: If you switch the branch of mangata and recompile and run.Please use the command to clear the mangata-rococo chain data.*

2. Set up accounts and pools
	```
	npm run setup-mangata
	```
3. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm mangata
   ```

# Run Shiubya demo
1. Launch OAK-blockchain, Rococo and Shibuya.

	Launch zombie in OAK-blockchain project root with Astar and modified OAK.
	
	https://github.com/OAK-Foundation/OAK-blockchain/tree/debug-shibuya

	```
	zombie spawn zombienets/turing/shibuya.toml
	```
	

2. Register an asset on Shibuya.
  
	![image](https://user-images.githubusercontent.com/16951509/209597183-0923a9ca-e3c4-40a5-b7e6-1745f117c7b3.png)

3. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm run shibuya
   ```