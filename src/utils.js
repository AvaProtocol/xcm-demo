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
        value: 'transfer-tur-on-mangata',
        description: 'Transfer MGX on Mangata',
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
        const account = new Account();
        await account.init();
        account.print();

        await mangataHelper.transferToken({
            keyPair: account.pair, tokenId: token.id, decimals: token.decimals, dest: '5HDjVvqaSMQ8YuFVo9yghvqUWLpW5vZ5s5EagUiiYF16ikc3', amount: 100,
        });
        break;
    }
    case 'transfer-mgx-on-mangata':
    {
        // Load account from ./private/seed.json and unlock
        const source = new Account();
        await source.init();
        source.print();

        const mgxToken = source.getAssetByChainAndSymbol('mangata', 'MGX');
        // console.log('mgxToken', mgxToken);

        if (mgxToken.balance <= 0) {
            throw new Error(`Not enough MGX balance, current: ${mgxToken.balance} ...`);
        }

        // const destAddress = dest.getAddressByChain('mangata');

        // console.log('destAddress', destAddress);

        await mangataHelper.transferToken({
            keyPair: source.pair, tokenId: token.id, decimals: token.decimals, dest: '5Hg97z8iVvkZiViemwp5gfBC4SPDBmGx3qJHr7URbPdtZQka', amount: 100,
        });

        break;
    }
    case 'withdraw-tur-from-mangata': {
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);
        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const account = new Account(keyPair);
        await account.init();
        account.print();

        const mangataAddress = account.getAddressByChain('mangata');

        const token = _.find(Turing.assets, { symbol: 'TUR' });

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
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);
        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const account = new Account(keyPair);
        await account.init();
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
        console.log('Loading wallet json and balance of assets ...');

        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        const account = new Account(keyPair);
        await account.init([turingHelper, mangataHelper]);
        account.print();

        const turingChainName = turingHelper.config.key;
        const mangataChainName = mangataHelper.config.key;
        const turingNativeToken = _.first(turingHelper.config.assets);
        const mangataNativeToken = _.first(mangataHelper.config.assets);

        const mangataAddress = account.getChainByName(mangataChainName)?.address;
        const poolName = `${mangataNativeToken.symbol}-${turingNativeToken.symbol}`;

        console.log(`Checking how much reward available in ${poolName} pool ...`);
        const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, poolName);
        console.log(`Claimable reward in ${poolName}: `, rewardAmount);

        const liquidityBalance = await mangataHelper.getBalance(mangataAddress, poolName);

        console.log('mangataHelper.getDecimalsBySymbol(poolName)', mangataHelper.getDecimalsBySymbol(poolName));
        const poolTokenDecimalBN = getDecimalBN(mangataHelper.getDecimalsBySymbol(poolName));
        const numReserved = (new BN(liquidityBalance.reserved)).div(poolTokenDecimalBN);

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