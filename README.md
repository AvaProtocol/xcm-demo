Examples
----------
* [XCMP Automation - Native](https://github.com/OAK-Foundation/javascript-examples/tree/master/xcmp_automation)
Schedule an automated XCMP task paying for fees in Oak's native token.

Create Local Testnet with Zombienet
----------
* Download and install [Zombienet](https://github.com/paritytech/zombienet).  A testing framework for Substrate based blockchains.  
* Build Oak blockchain from source following the directions [here](https://github.com/OAK-Foundation/OAK-blockchain#building-from-source).  When building the executable use the command:
```bash
cargo build --release --features neumann-node --features dev-queue
```
* Compile the template-parachain from source:
```bash
gh repo clone OAK-Foundation/substrate-parachain-template
cargo build --release
```
* Compile Polkadot from source:
```bash
git clone https://github.com/paritytech/polkadot
cargo build --release
```
* Run the local network using Zombienet
```bash
zombienet spawn zombienets/neumann/xcmp.toml
```
