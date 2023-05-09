import Web3 from 'web3';

import abi from './abi.json';

// Alith private key
const PRIVATE_KEY = '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133';
const END_POINT = 'http://127.0.0.1:9949';
const contractAddress = process.env.CONTRACT_ADDRESS;

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const main = async () => {
    const web3 = new Web3(END_POINT);
    const incrementer = new web3.eth.Contract(abi, contractAddress);
    const incrementTx = incrementer.methods.increment();

    // Sign transaction with Private key
    const signedTransaction = await web3.eth.accounts.signTransaction(
        {
            to: contractAddress,
            data: incrementTx.encodeABI(),
            gas: await incrementTx.estimateGas(),
        },
        PRIVATE_KEY,
    );

    // Send transcation and wait for Receipt
    const receipt = await web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
    console.log(`Tx successful with hash: ${receipt.transactionHash}`);

    console.log('Waitting for confirmation');
    delay(3000);

    // Check chain state
    const data = await incrementer.methods.number().call();
    console.log(`The current number stored is: ${data}`);
};

main().catch(console.error).finally(() => {
    console.log('Reached the end of main() ...');
    process.exit();
});
