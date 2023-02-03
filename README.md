Mangata XCM Auto-compound E2E Demo
----------
# Overview
![Automation Integration Flow Chart](./assets/flow-technical.png)

# Installation
1. Install dependencies, `npm i`
2. Set up environment variables for local network in `.env`.
3. Run a local Rococo-Mangata-Turing network with instructions in [Run local network with Zombienet](https://github.com/OAK-Foundation/OAK-blockchain#quickstart-run-local-network-with-zombienet)

# Mangata Auto-compound Demo
## Pre-requisites
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [0.9.29](https://github.com/paritytech/polkadot/releases/tag/v0.9.29)       |		[94078b4](https://github.com/paritytech/polkadot/commit/94078b44fb6c9767bf60ffcaaa3be40681be5a76)  |
| OAK-blockchain   | [1.8.0](https://github.com/OAK-Foundation/OAK-blockchain/releases/tag/v1.8.0)     |	[d04462](https://github.com/OAK-Foundation/OAK-blockchain/pull/328/commits/d044a62825746e6dd8b7593a6c7dfb9eefcac308)  |
| Mangata | [0.27.1](https://github.com/mangata-finance/mangata-node/releases/tag/v0.27.1)   | [f545791](https://github.com/OAK-Foundation/mangata-node/tree/ac60aeb51ea2c3545fc60c8b90f6bc65077ba10c)(a fork of 0.27.1 which added Alice as Sudo to create pools and mint tokens for setup)        |
## Steps
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
## Output example
Below are the console logs from `npm run mangata-rococo`


# Shibuya Auto-restake Demo
## Pre-requisites
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [0.9.29](https://github.com/paritytech/polkadot/releases/tag/v0.9.29)       |		[94078b4](https://github.com/paritytech/polkadot/commit/94078b44fb6c9767bf60ffcaaa3be40681be5a76)  |
| OAK-blockchain   | [1.8.0](https://github.com/OAK-Foundation/OAK-blockchain/releases/tag/untagged-2aecbd94ab4bcde05657)     |	[d04462](https://github.com/OAK-Foundation/OAK-blockchain/pull/328/commits/d044a62825746e6dd8b7593a6c7dfb9eefcac308)  |
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

## Output example
Below are the console logs from `npm run shibuya`
```
yarn run v1.22.19
warning package.json: No license field
$ dotenv -e .env babel-node src/shibuya.js
2023-02-03 10:22:24        API/INIT: RPC methods not decorated: transaction_unstable_submitAndWatch, transaction_unstable_unwatch

User Alice’s Turing address: 6AwtFW6sYcQ8RcuAJeXdDKuFtUVXj4xW57ghjYQ5xyciT1yd, Shibuya address: ajYMsCKsEAhEvHpeA4XqsfiA9v1CdzZPrCfS6pEfeGHW9j8

1. One-time proxy setup on Shibuya

a) Add a proxy for Alice on Shibuya If there is no proxy of Turing (paraId:2114) 


2. One-time proxy setup on Turing

a) Add a proxy for Alice on Turing If there is no proxy of Shibuya (paraId:2000)


3. Execute an XCM from Shibuya to schedule a task on Turing ...

a). Create a payload to store in Turing’s task ...
Encoded call data: 0x120000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01000a082048656c6c6f212121
Encoded call weight: 191761979

b) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...
Encoded call data: 0x200000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01003c026878636d705f6175746f6d6174696f6e5f746573745f667a787a7a01b078dc6300000000100e000000000000d007000000000000c0120000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01000a082048656c6c6f2121213b0e6e0b00000000
requireWeightAtMost: 1014876000

c) Execute the above an XCM from Shibuya to schedule a task on Turing ...
status.type Ready
2023-02-03 10:22:28          API-WS: disconnected from ws://127.0.0.1:9946: 1006:: Connection dropped by remote peer.
2023-02-03 10:22:28          API-WS: disconnected from ws://127.0.0.1:9948: 1006:: Connection dropped by remote peer.
^C
star@chenxingyoudeMacBook-Pro xcm-demo % 
star@chenxingyoudeMacBook-Pro xcm-demo % 
star@chenxingyoudeMacBook-Pro xcm-demo % 
star@chenxingyoudeMacBook-Pro xcm-demo % yarn shibuya
yarn run v1.22.19
warning package.json: No license field
$ dotenv -e .env babel-node src/shibuya.js
2023-02-03 10:24:14        API/INIT: RPC methods not decorated: transaction_unstable_submitAndWatch, transaction_unstable_unwatch

User Alice’s Turing address: 6AwtFW6sYcQ8RcuAJeXdDKuFtUVXj4xW57ghjYQ5xyciT1yd, Shibuya address: ajYMsCKsEAhEvHpeA4XqsfiA9v1CdzZPrCfS6pEfeGHW9j8

1. One-time proxy setup on Shibuya

a) Add a proxy for Alice on Shibuya If there is no proxy of Turing (paraId:2114) 


 Add a proxy of Turing (paraId:2114) for Alice on Shibuya ...
 Proxy address: 0xc3f91ea5c873ee4f4be432f11c670e7102674b3965de7e4dfc40a2aa59366568

status.type Ready
status.type InBlock
status.type Finalized

b) Topping up the proxy account on Shibuya with SBY ...

status.type Ready
status.type InBlock
status.type Finalized

2. One-time proxy setup on Turing

a) Add a proxy for Alice on Turing If there is no proxy of Shibuya (paraId:2000)


 Add a proxy of Shibuya (paraId:2000) for Alice on Turing ...
Proxy address: 0xb28bad43ad8e66f54af980033b8c559bccf58633f55e48213fde8214a2faf159

status.type Ready
status.type InBlock
status.type Finalized

b) Topping up the proxy account on Turing via reserve transfer SBY
status.type Ready
status.type InBlock
status.type Finalized

3. Execute an XCM from Shibuya to schedule a task on Turing ...

a). Create a payload to store in Turing’s task ...
Encoded call data: 0x120000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01000a082048656c6c6f212121
Encoded call weight: 191761979

b) Prepare automationTime.scheduleXcmpTask extrinsic for XCM ...
Encoded call data: 0x200000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01003c026878636d705f6175746f6d6174696f6e5f746573745f713264797301b078dc6300000000100e000000000000d007000000000000c0120000d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d01000a082048656c6c6f2121213b0e6e0b00000000
requireWeightAtMost: 1014876000

c) Execute the above an XCM from Shibuya to schedule a task on Turing ...
status.type Ready
status.type InBlock
status.type Finalized

At this point if the XCM succeeds, you should see the below events on both chains:

  1. Shibuya

  xcmpQueue.XcmpMessageSent and polkadotXcm.Sent - an XCM is successfully sent from Shibuya to Turing to schedule a task.

  2. Turing Dev

  a) proxy.ProxyExecuted and automationTime.TaskScheduled - the above XCM is received and executed on Turing.

  b) xcmpHandler.XcmTransactedLocally, xcmpQueue.XcmpMessageSent, xcmpHandler.XcmSent and automationTime.XcmpTaskSucceeded - the task is triggered and its payload is sent to Shibuya via XCM.

  3. Shibuya

  proxy.ProxyExecuted and xcmpQueue.Success - the above payload is received and executed.


4. Keep Listening events from Shibuya until 2023-02-03 11:00:00(1675393200) to verify that the task(taskId: 0x38e7044d382608cfa6aa8816a909ed819d6c745c9187561551d06a2a92d8a080, providerId: xcmp_automation_test_q2dys) will be successfully executed ...
        proxy:ProxyExecuted:: (phase={"applyExtrinsic":1})
                        Result<Null, SpRuntimeDispatchError>: Ok
Task has been executed!

5. Cancel task ...
status.type Ready
status.type InBlock
status.type Finalized

6. Keep Listening events from Shibuya until 2023-02-03 12:00:00(1675396800) to verify that the task was successfully canceled ...
Task canceled successfully! It didn't execute again.
Reached the end of main() ...
✨  Done in 5927.19s.
```