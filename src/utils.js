import select from '@inquirer/select';
import _ from 'lodash';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import TuringHelper from './common/turingHelper';
import MangataHelper from './common/mangataHelper';

import { MangataRococo, TuringStaging } from './config';
import { getDecimalBN, getProxyAccount, readMnemonicFromFile } from './common/utils';
import Account from './common/account';

// Create a keyring instance
const keyring = new Keyring({ ss58Format: 42, type: 'sr25519' });

const actions = [
    {
        name: 'Examine Mangata pools',
        value: 'examine-mangata-pools',
        description: 'Examine Mangata pools',
    },
    {
        name: 'Get Mangata Assets',
        value: 'get-mangata-assets',
        description: 'Get all assets registered on Mangata.',
    },
    {
        name: 'Transfer MGX on Mangata',
        value: 'transfer-mgx-on-mangata',
        description: 'Transfer MGX on Mangata',
    },
    {
        name: 'Transfer TUR on Mangata',
        value: 'transfer-tur-on-mangata',
        description: 'Transfer TUR on Mangata',
    },
    {
        name: 'Withdraw TUR from Mangata',
        value: 'withdraw-tur-from-mangata',
        description: 'Withdraw TUR from Mangata',
    },
    {
        name: 'Swap TUR for MGX',
        value: 'swap-tur-for-mgx',
        description: 'Swap TUR for MGX',
    },
    {
        name: 'Generate Multilocation',
        value: 'generate-multilocation',
        description: 'Generate Multilocation',
    },
    {
        name: 'Check claimable rewards on Mangata',
        value: 'check-claimable rewards',
        description: 'Check claimable rewards on Mangata',
    },
];

async function main() {
    await cryptoWaitReady();

    const turingHelper = new TuringHelper(TuringStaging);
    await turingHelper.initialize();

    const mangataHelper = new MangataHelper(MangataRococo);
    await mangataHelper.initialize();

    const actionSelected = await select({
        message: 'Select an action to perform',
        choices: actions,
    });

    switch (actionSelected) {
    case 'examine-mangata-pools': {
        const pools = await mangataHelper.getPools({ isPromoted: true, thousandSeparator: true });
        console.log(pools);

        break;
    }
    case 'get-mangata-assets':
        await mangataHelper.getAssets();
        break;
    case 'transfer-tur-on-mangata':
    {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        const account = new Account(keyPair);
        await account.init([mangataHelper]);
        account.print();

        // 1. Specify chain and token symbol here
        const token = account.getAssetByChainAndSymbol('mangata-rococo', 'TUR');

        // 2. Set the destination address to your account
        const dest = '';

        // 3. Set the amount of transfer
        const amount = 10;

        await mangataHelper.transferToken({
            keyPair: account.pair, tokenId: token.id, decimals: token.decimals, dest, amount,
        });
        break;
    }
    case 'transfer-mgx-on-mangata':
    {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        const account = new Account(keyPair);
        await account.init([mangataHelper]);
        account.print();

        // 1. Specify chain and token symbol here
        const mgxToken = account.getAssetByChainAndSymbol('mangata-rococo', 'MGR');

        // 2. Set the destination address to your account
        const dest = '';

        // 3. Set the amount of transfer
        const amount = 1000;

        console.log('mgxToken', mgxToken);

        if (mgxToken.balance <= 0) {
            throw new Error(`Not enough MGX balance, current: ${mgxToken.balance} ...`);
        }

        await mangataHelper.transferToken({
            keyPair: account.pair, tokenId: mgxToken.id, decimals: mgxToken.decimals, dest, amount,
        });

        break;
    }
    case 'withdraw-tur-from-mangata': {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const account = new Account(keyPair);
        await account.init([mangataHelper]);
        account.print();

        const mangataAddress = account.getAddressByChain('mangata');

        const token = account.getAssetByChainAndSymbol('mangata-rococo', 'TUR');

        try {
            await mangataHelper.withdrawTUR({
                amount: 100, decimal: token.decimals, address: mangataAddress, keyPair: account.pair,
            });
        } catch (ex) {
            console.error(ex);
        }

        break;
    }
    case 'swap-tur-for-mgx': {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const account = new Account(keyPair);
        await account.init([mangataHelper]);
        account.print();

        const { pair } = account;
        const targetSellAmount = 100;
        const minExpectedBuyAmount = 150;

        await mangataHelper.sell({
            sellSymbol: 'TUR', buySymbol: 'MGX', pair, targetSellAmount, minExpectedBuyAmount,
        });

        break;
    }
    case 'generate-multilocation': {
        const address = 'cxPKqGqUn2fhVvEvrRKdmu55ZzP1Xz3yBu4cwTgPdN4utjN';
        const result = getProxyAccount(mangataHelper.api, Turing.paraId, address);

        console.log('result', result);
        break;
    }
    case 'check-claimable rewards': {
    // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const account = new Account(keyPair);
        await account.init([mangataHelper]);
        account.print();

        const mangataChainName = mangataHelper.config.key;
        const turingNativeToken = _.first(turingHelper.config.assets);
        const mangataNativeToken = _.first(mangataHelper.config.assets);

        const mangataAddress = account.getChainByName(mangataChainName)?.address;
        const mgxToken = account.getAssetByChainAndSymbol(mangataChainName, mangataNativeToken.symbol);
        const turToken = account.getAssetByChainAndSymbol(mangataChainName, turingNativeToken.symbol);
        const poolName = `${mgxToken.symbol}-${turToken.symbol}`;

        console.log(`Checking how much reward available in ${poolName} pool ...`);
        const pools = await mangataHelper.getPools({ isPromoted: true });
        console.log('pools', pools);

        const pool = _.find(pools, { firstTokenId: mangataHelper.getTokenIdBySymbol(mgxToken.symbol), secondTokenId: mangataHelper.getTokenIdBySymbol(turToken.symbol) });
        console.log('pool', pool);

        if (_.isUndefined(pool)) {
            throw new Error(`Couldn’t find a liquidity pool for ${poolName} ...`);
        }

        // Calculate rwards amount in pool
        const { liquidityTokenId } = pool;
        const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
        console.log(`Claimable reward in ${poolName}: `, rewardAmount);

        const balance = await mangataHelper.mangata.getTokenBalance(liquidityTokenId, mangataAddress);
        const poolNameDecimalBN = getDecimalBN(mangataHelper.getDecimalsBySymbol(poolName));
        const numReserved = (new BN(balance.reserved)).div(poolNameDecimalBN);

        console.log(`${account.name} reserved "${poolName}": ${numReserved.toString()} ...`);

        break;
    }
    default:
        console.log(`No action found for ${actionSelected}; skipping action ...`);
        break;
    }

    console.log('End of main() ...');
}

main().catch(console.error).finally(() => process.exit());
