Examples
----------
* [XCMP Automation - Native](https://github.com/OAK-Foundation/javascript-examples/tree/master/xcmp_automation)
Schedule an automated XCMP task paying for fees in Oak's native token.

# Installation
1. Install dependencies, `npm i`
2. Set up environment variables. Create a `.env` file at root with the template of `.env_template`
3. Run a local Rococo-Mangata-Turing network with instructions in https://github.com/OAK-Foundation/OAK-blockchain#quickstart-run-local-network-with-zombienet

# Run
1. Set up accounts and pools
	```
	npm run setup
	```
2. Run the program to schedule automation and wait for cross-chain execution
   ```
   npm start
   ```
