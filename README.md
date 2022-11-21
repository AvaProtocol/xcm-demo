Mangata XCM Auto-compound E2E Demo
----------
# Overview
![Automation Integration Flow Chart](./assets/flow-technical.png)

# Installation
1. Install dependencies, `npm i`
2. Set up environment variables for local network in `.env`.
3. Run a local Rococo-Mangata-Turing network with instructions in [Run local network with Zombienet](https://github.com/OAK-Foundation/OAK-blockchain#quickstart-run-local-network-with-zombienet)

# Run
1. Set up accounts and pools
	```
	npm run setup
	```
2. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm start
   ```
