import _ from 'lodash';
import util from 'util';
import Keyring from '@polkadot/keyring';
import { getDecimalBN } from './utils';
import turingHelper from './turingHelper';
import mangataHelper from './mangataHelper';

// Create a keyring instance
const keyring = new Keyring({ type: 'sr25519' });

class Account {
    constructor(json) {
        this.address = json.address;
        this.pair = json;
        this.name = json.meta.name;

        this.assets = [];
    }

    /**
     * Read token balances of Alice’s wallet address from both Mangata and Turing
     * This call can be called repeatedly after any chain state update
     */
    async init(providers) {
        const that = this;

        // We empty out this.assets and re-add all assets upon init()
        that.assets = [];

        const allPromises = _.map(providers, async (provider) => {
            const { config } = provider;

            // 1. Add address and tokens object to this.assets based on the chain config
            const chainAssets = {
                chain: config.key,
                address: keyring.encodeAddress(that.address, config.ss58),
            };

            that.assets.push(chainAssets);

            // 2. Fill in balances of assets via API calls
            // The major difference among chains is the format of balance object
            if (_.includes(['mangata', 'mangata-rococo', 'mangata-dev'], config.key)) {
                const tokenPromises = _.map(provider.config.assets, async (asset) => {
                    const { symbol, decimals, id } = asset;
                    return provider.getBalance(chainAssets.address, symbol).then((balance) => {
                        const decimalBN = getDecimalBN(decimals);

                        console.log(`symbol:${symbol}, tokenId:${id}`, balance);

                        return {
                            symbol,
                            balance: balance.free.div(decimalBN).toNumber(),
                            reserved: balance.reserved.div(decimalBN).toNumber(),
                            frozen: balance.frozen.div(decimalBN).toNumber(),
                        };
                    });
                });

                const tokens = await Promise.all(tokenPromises);

                chainAssets.tokens = tokens;
            } else if (_.includes(['turing', 'turing-staging', 'turing-dev'], config.key)) {
                const tokenPromises = _.map(provider.config.assets, async (asset) => {
                    const { symbol, decimals } = asset;
                    return provider.getBalance(chainAssets.address, symbol).then((balance) => {
                        const decimalBN = getDecimalBN(decimals);

                        return {
                            symbol: 'TUR',
                            balance: balance.free.div(decimalBN).toNumber(),
                            balanceBN: balance.free,
                            reserved: balance.reserved.div(decimalBN).toNumber(),
                            miscFrozen: balance.miscFrozen.div(decimalBN).toNumber(),
                            feeFrozen: balance.feeFrozen.div(decimalBN).toNumber(),
                        };
                    });
                });

                const tokens = await Promise.all(tokenPromises);

                chainAssets.tokens = tokens;
            }
        });

        await Promise.all(allPromises);

        return this;
    }

    /**
     * Print chain name, wallet address, and balances of tokens
     * @param {boolean} ignoreZeroBalance true by default to hide zero balances
     */
    print(ignoreZeroBalance = true) {
        let result = _.cloneDeep(this.assets);

        if (ignoreZeroBalance) {
            result = _.map(result, (chain) => {
                const { tokens, ...rest } = chain;
                const filteredTokens = _.filter(tokens, (token) => token.balance > 0);
                return { tokens: filteredTokens, ...rest };
            });
        }

        console.log(util.inspect(result, { depth: 4, colors: true }));
    }

    getChainByName(chain) {
        const match = _.find(this.assets, (item) => item.chain === chain);

        if (_.isUndefined(match)) {
            throw new Error(`Not chain ${chain} found in this account. `);
        }

        return match;
    }

    /**
     * Return asset’s balance of this wallet
     * @param {*} chain The chain name of the asset
     * @param {*} symbol Symbol of the asset
     * @returns undefined if not found
     */
    getAssetByChainAndSymbol(chain, symbol) {
        let match;

        _.each(this.assets, (item) => {
            if (item.chain === chain) {
                _.each(item.tokens, (token) => {
                    if (token.symbol === symbol) {
                        match = token;
                    }
                });
            }
        });

        return match;
    }
}

export default Account;
