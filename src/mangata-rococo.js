import '@oak-network/api-augment';
import _ from 'lodash';
import moment from 'moment';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import confirm from '@inquirer/confirm';
import TuringHelper from './common/turingHelper';
import MangataHelper from './common/mangataHelper';
import Account from './common/account';
import { delay, listenEvents, readMnemonicFromFile } from './common/utils';
import {
    TuringStaging, MangataRococo,
} from './config';

/**
 * README!
 *
 * 1. Unlike dev environment there’s no Sudo in Rococo, so we need to important a wallet first.
 * a) Export a wallet from polkadot.js plugin, and save it as a file ./private/seed.json
 * b) Run "PASS_PHRASE=<password_for_unlock> npm run mangata-rococo"
 *
 * 2. You need to have balances in both MGR and TUR on Mangata Rococo
 * 3. You need to have balances in TUR on Turing Staging
 */

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

/** * Main entrance of the program */
async function main() {
    await cryptoWaitReady();

    console.log('Initializing APIs of both chains ...');
    const turingHelper = new TuringHelper(TuringStaging);
    await turingHelper.initialize();

    const mangataHelper = new MangataHelper(MangataRococo);
    await mangataHelper.initialize();

    const turingChainName = turingHelper.config.key;
    const mangataChainName = mangataHelper.config.key;
    const turingNativeToken = _.first(turingHelper.config.assets);
    const mangataNativeToken = _.first(mangataHelper.config.assets);

    console.log(`\nTuring chain name: ${turingChainName}, native token: ${JSON.stringify(turingNativeToken)}`);
    console.log(`Mangata chain name: ${mangataChainName}, native token: ${JSON.stringify(mangataNativeToken)}\n`);

    console.log('1. Reading token and balance of account ...');

    const json = await readMnemonicFromFile();
    const keyPair = keyring.addFromJson(json);
    keyPair.unlock(process.env.PASS_PHRASE);

    const account = new Account(keyPair);
    await account.init([turingHelper, mangataHelper]);
    account.print();

    const mangataAddress = account.getChainByName(mangataChainName)?.address;
    const turingAddress = account.getChainByName(turingChainName)?.address;
    const poolName = `${mangataNativeToken.symbol}-${turingNativeToken.symbol}`;

    console.log('\n2. Add a proxy on Mangata for paraId 2114, or skip this step if that exists ...');

    const proxyAddress = mangataHelper.getProxyAccount(mangataAddress, turingHelper.config.paraId);
    const proxiesResponse = await mangataHelper.api.query.proxy.proxies(mangataAddress);
    const proxies = _.first(proxiesResponse.toJSON());

    const proxyType = 'AutoCompound';
    const matchCondition = { delegate: proxyAddress, proxyType };

    const proxyMatch = _.find(proxies, matchCondition);

    if (proxyMatch) {
        console.log(`Found proxy of ${account.address} on Mangata: `, proxyMatch);
    } else {
        if (_.isEmpty(proxies)) {
            console.log(`Proxy array of ${account.address} is empty ...`);
        } else {
            console.log('Proxy not found. Expected', matchCondition, 'Actual', proxies);
        }

        console.log(`Adding a proxy for paraId ${turingHelper.config.paraId}. Proxy address: ${proxyAddress} ...`);
        await mangataHelper.addProxy(proxyAddress, proxyType, account.pair);
    }

    const answerPool = await confirm({ message: '\nAccount setup is completed. Press ENTRE to schedule auto-compound.', default: true });

    if (answerPool) {
        // Calculate rwards amount in pool
        console.log(`3. Checking how much reward available in ${poolName} pool ...`);
        const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, poolName);
        console.log(`Claimable reward in ${poolName}: `, rewardAmount);

        // Alice’s reserved LP token before auto-compound
        const liquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
        console.log(`Before auto-compound, ${account.name} reserved "${poolName}": ${liquidityBalance.reserved.toString()} Planck ...`);

        // Create Mangata proxy call
        console.log('\n4. Start to schedule an auto-compound call via XCM ...');
        const liquidityTokenId = mangataHelper.getTokenIdBySymbol(poolName);
        const proxyExtrinsic = mangataHelper.api.tx.xyk.compoundRewards(liquidityTokenId, 100);
        const mangataProxyCall = await mangataHelper.createProxyCall(mangataAddress, proxyType, proxyExtrinsic);
        const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
        const mangataProxyCallFees = await mangataProxyCall.paymentInfo(mangataAddress);

        console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
        console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

        // Create Turing scheduleXcmpTask extrinsic
        console.log('\na) Create the call for scheduleXcmpTask ');
        const providedId = `xcmp_automation_test_${(Math.random() + 1).toString(36).substring(7)}`;

        const secPerHour = 3600;
        const msPerHour = 3600 * 1000;
        const currentTimestamp = moment().valueOf();
        const timestampNextHour = (currentTimestamp - (currentTimestamp % msPerHour)) / 1000 + secPerHour;
        const timestampTwoHoursLater = (currentTimestamp - (currentTimestamp % msPerHour)) / 1000 + (secPerHour * 2);

        const xcmpCall = turingHelper.api.tx.automationTime.scheduleXcmpTask(
            providedId,
            { Fixed: { executionTimes: [timestampNextHour, timestampTwoHoursLater] } },
            mangataHelper.config.paraId,
            0,
            encodedMangataProxyCall,
            parseInt(mangataProxyCallFees.weight.refTime, 10),
        );

        console.log('xcmpCall: ', xcmpCall);

        // Query automationTime fee
        console.log('\nb) Query automationTime fee details ');
        const { executionFee, xcmpFee } = await turingHelper.api.rpc.automationTime.queryFeeDetails(xcmpCall);
        console.log('automationFeeDetails: ', { executionFee: executionFee.toHuman(), xcmpFee: xcmpFee.toHuman() });

        // Get a TaskId from Turing rpc
        const taskId = await turingHelper.api.rpc.automationTime.generateTaskId(turingAddress, providedId);
        console.log('TaskId:', taskId.toHuman());

        // Send extrinsic
        console.log('\nc) Sign and send scheduleXcmpTask call ...');
        await turingHelper.sendXcmExtrinsic(xcmpCall, account.pair, taskId);

        // Listen XCM events on Mangata side
        console.log('\nd) waiting for XCM events on Mangata side ...');
        await listenEvents(mangataHelper.api);

        console.log('\nWaiting 20 seconds before reading new chain states ...');
        await delay(20000);

        // Account’s reserved LP token after auto-compound
        const newLiquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);
        console.log(`\nAfter auto-compound, reserved ${poolName} is: ${newLiquidityBalance.reserved.toString()} planck ...`);

        console.log(`${account.name} has compounded ${(newLiquidityBalance.reserved.sub(liquidityBalance.reserved)).toString()} planck more ${poolName} ...`);
    }
}

main().catch(console.error).finally(() => {
    console.log('Reached end of main() ...');
    process.exit();
});
