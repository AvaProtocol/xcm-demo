# OAK Network XCM Automation Demos

## Overview
![Automation Integration Flow Chart](./assets/flow-technical.png)

## Installation
1. Install dependencies, `npm i`
1. Run a local Rococo-Mangata-Turing network with instructions in [Run local network with Zombienet](https://github.com/OAK-Foundation/OAK-blockchain#quickstart-run-local-network-with-zombienet)
1. Run a demo by `npm run <file_name>`, defined in package.json.

## Mangata Auto-compound Demo
### Pre-requisites
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [0.9.38](https://github.com/paritytech/polkadot/releases/tag/v0.9.38)       |
| OAK-blockchain   | [1.9.0](https://github.com/OAK-Foundation/OAK-blockchain/releases/tag/v1.9.0)     |
| Mangata | [0.30.0](https://github.com/mangata-finance/mangata-node/pull/501)   |
### Steps
#### Local dev environment

1. Launch OAK-blockchain, Rococo and Mangata.

	- Compile oak-collator v1.9.0

		https://github.com/OAK-Foundation/OAK-blockchain/

		```
		cargo build --release --features turing-node --features dev-queue
		```


	- Compile modified Mangata

		https://github.com/mangata-finance/mangata-node/tree/release/v0.30.0

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

#### Rococo environment
First, you need to prepare a wallet for the program to run on production environment. Simply export a json file from Mangata Rococo‘s dashboard, name it `seed.json` and place it in the `./private` folder.

Then, run the below command with the pass phrase to unlock the seed.json in order to schedule automation and wait for execution.
```
PASS_PHRASE=<pass_phrase> npm run mangata-rococo
```

Below are the console logs from `npm run mangata-rococo`
```
Initializing APIs of both chains ...
Turing chain name: turing-staging, native token: {"symbol":"TUR","decimals":10}
Mangata chain name: mangata-rococo, native token: {"id":"0","chainId":0,"decimals":18,"name":"Mangata","symbol":"MGR","address":""}

1. Reading token and balance of account ...
[
  {
    tokens: [
      {
        symbol: 'TUR',
        balance: 10187,
        balanceBN: <BN: 5ca85fcf64ae>,
        reserved: 20,
        miscFrozen: 1000,
        feeFrozen: 0
      }
    ],
    chain: 'turing-staging',
    address: '66RxduFvFDjfQjYJRnX4ywgYm6w2SAiHqtqGKgY1qdfYCj3g'
  },
  {
    tokens: [
      {
        symbol: 'MGR',
        id: '0',
        decimals: 18,
        balance: 9953621,
        reserved: 5029,
        frozen: 0
      },
      {
        symbol: 'TUR',
        id: '7',
        decimals: 10,
        balance: 3614268,
        reserved: 0,
        frozen: 0
      }
    ],
    chain: 'mangata-rococo',
    address: '5CM2JyPHnbs81Cu8GzbraqHiwjeNwX3c9Rr5nXkJfwK9fwrk'
  }
]

2. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...
Found proxy of 5CM2JyPHnbs81Cu8GzbraqHiwjeNwX3c9Rr5nXkJfwK9fwrk on Mangata, and will skip the addition ...  {
  delegate: '5DNrXjfyMuukK3zrMs2T9i2E2VjYfCnA8rCxjk5DDeTeyhtM',
  proxyType: 'AutoCompound',
  delay: 0
}

Account balance check is completed and proxy is set up. Press ENTRE to mint MGR-TUR. yes
Found a pool of MGR-TUR {
  firstTokenId: '0',
  secondTokenId: '7',
  firstTokenAmount: <BN: 87059378c54472fe212d2b>,
  secondTokenAmount: <BN: 4ef251c4f52ea1>,
  liquidityTokenId: '10',
  firstTokenRatio: <BN: 81d4100>,
  secondTokenRatio: <BN: 17bc2ecb00abbf4e0731373b>,
  isPromoted: false,
  firstTokenAmountFloat: <BN: 9bab655>,
  secondTokenAmountFloat: <BN: 21e844>
}
Checking how much reward available in MGR-TUR pool, tokenId: 10 ...
Claimable reward in MGR-TUR:  74
Before auto-compound, 1st Account reserved "MGR-TUR": 1825 ...

Do you want to continue to schedule auto-compound. Press ENTRE to continue. yes

4. Start to schedule an auto-compound call via XCM ...
encodedMangataProxyCall:  0x0500000c720beb3f580f0143f9cb18ae694cddb767161060850025a57a4f72a71bf47501000d080a00000064000000
mangataProxyCallFees:  {
  weight: { refTime: '2,905,398,711', proofSize: '3,716' },
  class: 'Normal',
  partialFee: '27.0780 MGAT'
}

a) Create the call for scheduleXcmpTask 
xcmpCall:  Submittable { initialU8aLength: undefined, registry: TypeRegistry {} }

b) Query automationTime fee details 
automationFeeDetails:  { executionFee: '1.8671 TUR', xcmpFee: '9.5750 TUR' }
TaskId: 0x821644ec6636d29e22a29cef36473c566d0f53681198b58995dfcf48b09bfc9b

c) Sign and send scheduleXcmpTask call ...
Status: Ready
Status: Broadcast
Successful with hash 0x3dc83fcf8981e05fd5a9cb3e3e1974f3fc85ea6351edd8c6c2cdf556c141155b
Task: {
  ownerId: '66RxduFvFDjfQjYJRnX4ywgYm6w2SAiHqtqGKgY1qdfYCj3g',
  providedId: 'xcmp_automation_test_rf4ja',
  schedule: { Fixed: { executionTimes: [Array], executionsLeft: '2' } },
  action: {
    XCMP: {
      paraId: '2,110',
      currencyId: '0',
      xcmAssetLocation: [Object],
      encodedCall: '0x0500000c720beb3f580f0143f9cb18ae694cddb767161060850025a57a4f72a71bf47501000d080a00000064000000',
      encodedCallWeight: [Object],
      scheduleAs: null
    }
  }
}

5. Keep Listening XCM events on mangata-rococo until 2023-06-05 14:00:00(1685998800) to verify that the task(taskId: 0x821644ec6636d29e22a29cef36473c566d0f53681198b58995dfcf48b09bfc9b, providerId: xcmp_automation_test_rf4ja) will be successfully executed ...
```

## Shibuya Auto-restake Demo
### Pre-requisites
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [v0.9.39](https://github.com/paritytech/polkadot/releases/tag/v0.9.39)      |
| OAK-blockchain   | [v1.8.1](https://github.com/OAK-Foundation/OAK-blockchain/releases/tag/untagged-a25a340f7319d3b81a23)   |
| Astar | [v5.0.1](https://github.com/AstarNetwork/Astar/releases/tag/v5.0.1) |
### Steps
#### Local dev environment
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

Below are the console logs from `npm run shibuya`
```
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

#### Rococo environment
Run the program to schedule automation and wait for cross-chain execution
```
npm run rocstar
```

## Moonbeam EVM smart contract automation
### Pre-requisites
| Chain      | Version | Commit hash |
| :---        |    :----:   |          ---: |
| Polkadot      | [v0.9.38](https://github.com/paritytech/polkadot/releases/tag/v0.9.38)       |
| OAK-blockchain   | [v1.8.1](https://github.com/OAK-Foundation/OAK-blockchain/releases/tag/untagged-a25a340f7319d3b81a23)     |
| Moonbeam | [runtime-2302](https://github.com/PureStake/moonbeam/releases/tag/runtime-2302)   |
### Steps
#### Local dev environment
The local environment of Moonbeam is named Moonbase Local in its chain config.

1. Launch Rococo Local, Turing Dev and Moonbase Local with zombienet. The zombienet config file is located at [OAK-blockchain repo](https://github.com/OAK-Foundation/OAK-blockchain/blob/master/zombienets/turing/moonbase.toml). Assuming you are at OAK-blockchain’s root folder, run the below command to spin up the networks.

	```
	zombienet spawn zombienets/turing/moonbase.toml
	```

2. Run this program to schedule automation and wait for cross-chain execution
	```
	npm run moonbase
	```

3. The above step outlines the process of XCM automation with Moonbase Local. Upon completing the program, an 'ethereum.executed' event from Moonbase Local will be emitted. However, the event will exit with an EvmCoreErrorExitReason, which occurs because a smart contract has not been deployed yet. To successfully demonstrate smart contract automation, please follow the subsequent steps to set up a test smart contract.

    The default sudo wallet of Moonbase Local Alith is used to deploy a smart contract. Run the below commands to deploy a smart contract to Moonbase Local.

    ```
    cd src/moonbeam/contracts
    npm install
    npx hardhat compile   # Compile smart contract
    npx hardhat run scripts/deploy.js   # Deploy smart contract to Moonbase
    ```

    The commands, if successful, will print out the newly deployed smart contract. Take the Incrementer contract’s Ethereum address, and set the value to CONTRACT_ADDRESS in the beginning of src/moonbeam/moonbase-local.js. You do not need to change the value CONTRACT_INPUT;
    ```
    Incrementer deployed to:  0x711F8F079b0BB4D16bd8C5D049358d31a1694755
    ```

#### Moonbase Alpha environment
The default staging environment of Moonbeam is Moonbase Alpha, since Moonbeam doesn’t have a parachain set up on Rococo.

1. First, we will need to set up wallets for the transactions in this demo.
   1. Assuming you have a wallet created and imported to both Turing Moonbase and Moonbase Alpha’s polkadot.js dashboard.
   2. Export a json file from Turing Moonbase‘s dashboard, name it `seed.json` and place it in the ./private folder.
   3. Export a json file from Moonbase Alpha’s dashboard, name it `seed-eth.json` and place it in the ./private folder. Please note that the account exported should be an Ethereum account.  

  > How to add a polkadot account to Moonbase Alpha: https://docs.moonbeam.network/tokens/connect/polkadotjs/

1. Make sure your wallet is topped up with 25 TUR on Turing Moonbase for fees required to set up a proxy wallet and task execution.

2. Make sure your wallet is topped up with 5 DEV on Moonbase Alpha for fees required to set up a proxy wallet and execute task scheduling.

3. Run the below command to kick off the demo. The <PASS_PHRASE> is your password to unlock the wallet on Turing Moonbase, and the <PASS_PHRASE_ETH> is your password to unlock the ethereum wallet on Moonbase Alpha.
	```
	PASS_PHRASE=<PASS_PHRASE> PASS_PHRASE_ETH=<PASS_PHRASE_ETH> npm run moonbase-alpha
	```
	
