import { Mangata } from '@mangata-finance/sdk';
import { Keyring } from "@polkadot/api";
import { getOakApi, getProxyAccount } from './common/util';

const MANGATA_ENDPOINT = 'ws://127.0.0.1:6644';
const OAK_PARA_ID = 2114;
const ALICE = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";
const SUBSTRATE_SS58 = 42;

async function main () {
	const oakApi = await getOakApi();
  
  const mangata = Mangata.getInstance([MANGATA_ENDPOINT]);
	const mangataApi = await mangata.getApi();

	const keyring = new Keyring();
	const aliceKeyPair = keyring.addFromUri('//Alice', undefined, 'sr25519');

	const tokenBalance = await mangata.getTokenBalance('0', aliceKeyPair.address);
	console.log(`Alice tokenBalance: `, tokenBalance.free.toString());

	const proxyAccount = await getProxyAccount(oakApi, OAK_PARA_ID, ALICE);
  console.log("Proxy Account:", keyring.encodeAddress(proxyAccount, SUBSTRATE_SS58));
	
	await mangataApi.tx.proxy.addProxy(proxyAccount, "Any", 0).signAndSend(aliceKeyPair);
	console.log('Add proxy successfully!');
}

main().catch(console.error).finally(() => process.exit());