import select from '@inquirer/select';
import _ from 'lodash';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Keyring from '@polkadot/keyring';
import BN from 'bn.js';
import { MangataAdapter, OakAdapter } from '@oak-network/adapter';
import { chains } from '@oak-network/config';
import { u8aToHex } from '@polkadot/util';
import TuringHelper from './common/oakHelper';
import MangataHelper from './common/mangataHelper';
import { getDecimalBN, readMnemonicFromFile } from './common/utils';

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

    const turingHelper = new TuringHelper({ endpoint: chains.turingStaging.endpoint });
    await turingHelper.initialize();
    const turingApi = turingHelper.getApi();
    const turingAdapter = new OakAdapter(turingApi, chains.mangataRococo);

    const mangataHelper = new MangataHelper({ endpoint: chains.mangataRococo.endpoint });
    await mangataHelper.initialize();
    const mangataApi = mangataHelper.getApi();

    const mangataAdapter = new MangataAdapter(mangataApi, chains.mangataRococo);

    const actionSelected = await select({
        message: 'Select an action to perform',
        choices: actions,
    });

    switch (actionSelected) {
    case 'examine-mangata-pools': {
        const pools = await mangataHelper.getPools({ isPromoted: true, thousandSeparator: true });
        const formattedPools = _.map(pools, (pool) => ({
            ...pool,
            firstTokenAmount: pool.firstTokenAmount.toString(),
            secondTokenAmount: pool.secondTokenAmount.toString(),
            firstTokenRatio: pool.firstTokenRatio.toString(),
            secondTokenRatio: pool.secondTokenRatio.toString(),
        }));
        console.log(formattedPools);
        break;
    }
    case 'get-mangata-assets': {
        const assets = await mangataHelper.getMangataSdk().getAssetsInfo();
        console.log('assets: ', assets);
        break;
    }
    case 'transfer-tur-on-mangata':
    {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        // 1. Specify chain and token symbol here
        const assets = await mangataHelper.getMangataSdk().getAssetsInfo();
        const token = _.find(assets, ({ symbol }) => symbol === 'TUR');

        // 2. Set the destination address to your account
        const dest = '';

        // // 3. Set the amount of transfer
        const amount = 10;

        await mangataHelper.transferToken({
            keyPair, tokenId: token.id, decimals: token.decimals, dest, amount,
        });
        break;
    }
    case 'transfer-mgx-on-mangata':
    {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        // 1. Specify chain and token symbol here
        const assets = await mangataHelper.getMangataSdk().getAssetsInfo();
        const mgxToken = _.find(assets, ({ symbol }) => symbol === 'MGR');

        // 2. Set the destination address to your account
        const dest = '';

        // 3. Set the amount of transfer
        const amount = 1000;

        console.log('mgxToken', mgxToken);

        if (mgxToken.balance <= 0) {
            throw new Error(`Not enough MGX balance, current: ${mgxToken.balance} ...`);
        }

        await mangataHelper.transferToken({
            keyPair, tokenId: mgxToken.id, decimals: mgxToken.decimals, dest, amount,
        });

        break;
    }
    case 'withdraw-tur-from-mangata': {
        // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        try {
            mangataAdapter.crossChainTransfer(
                turingAdapter.getLocation(),
                u8aToHex(keyPair.addressRaw),
                turingAdapter.getChainData().defaultAsset.location,
                getDecimalBN(turingAdapter.getChainData().defaultAsset.decimals).muln(1),
                keyPair,
            );
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

        const targetSellAmount = 100;

        const assets = await mangataHelper.getMangataSdk().getAssetsInfo();
        const turAsset = _.find(assets, { symbol: 'TUR' });
        const gmrAsset = _.find(assets, { symbol: 'MGR' });

        await mangataHelper.swap(turAsset.id, gmrAsset.id, keyPair, targetSellAmount);

        break;
    }
    case 'generate-multilocation': {
        const address = 'cxPKqGqUn2fhVvEvrRKdmu55ZzP1Xz3yBu4cwTgPdN4utjN';
        const account = u8aToHex(keyring.decodeAddress(address));
        const derivativeAccount = mangataAdapter.getDerivativeAccount(account, turingAdapter.getChainData().ss58Prefix);
        const derivativeAddress = keyring.encodeAddress(derivativeAccount, mangataAdapter.getChainData().ss58Prefix);
        console.log('result: ', derivativeAddress);
        break;
    }
    case 'check-claimable rewards': {
    // Load account from ./private/seed.json and unlock
        const json = await readMnemonicFromFile();
        const keyPair = keyring.addFromJson(json);
        keyPair.unlock(process.env.PASS_PHRASE);

        console.log(`Restored account ${keyPair.meta.name} ${keyPair.address} ...`);

        const mangataAddress = keyring.encodeAddress(keyPair.addressRaw, mangataAdapter.getChainData().ss58Prefix);
        const assets = await mangataHelper.getMangataSdk().getAssetsInfo();
        const mgxToken = _.find(assets, { symbol: 'MGR' });
        const turToken = _.find(assets, { symbol: 'TUR' });

        console.log(`Checking how much reward available in ${mgxToken.symbol}-${turToken.symbol} pool ...`);
        const pools = mangataHelper.getPools({ isPromoted: true });
        console.log('pools: ', pools);
        const pool = _.find(pools, { firstTokenId: mgxToken.id, secondTokenId: turToken.id });
        if (_.isUndefined(pool)) {
            throw new Error(`Couldn’t find a liquidity pool for ${mgxToken.symbol}-${turToken.symbol} ...`);
        }
        console.log('pool: ', pool);
        const liquidityAsset = _.find(assets, { id: pool.liquidityTokenId });
        const { symbol: poolName } = liquidityAsset;

        // Calculate rwards amount in pool
        const { liquidityTokenId } = pool;
        const rewardAmount = await mangataHelper.calculateRewardsAmount(mangataAddress, liquidityTokenId);
        console.log(`Claimable reward in ${poolName}: `, rewardAmount);

        const balance = await mangataHelper.mangataSdk.getTokenBalance(liquidityTokenId, mangataAddress);
        const poolNameDecimalBN = getDecimalBN(liquidityAsset.decimals);
        const numReserved = (new BN(balance.reserved)).div(poolNameDecimalBN);

        console.log(`${keyPair.meta.name} reserved "${poolName}": ${numReserved.toString()} ...`);

        break;
    }
    default:
        console.log(`No action found for ${actionSelected}; skipping action ...`);
        break;
    }

    console.log('End of main() ...');
}

main().catch(console.error).finally(() => process.exit());
