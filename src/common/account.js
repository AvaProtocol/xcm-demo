import { Keyring } from "@polkadot/api";
import BN from 'bn.js';
import _ from 'lodash';
import util from "util";
import turingHelper from "./turingHelper";
import mangataHelper from "./mangataHelper";
import { chainConfig, tokenConfig } from './constants';

class Account {
    constructor(name) {
        this.name = name;
        const keyring = new Keyring();
        this.keyring = keyring.addFromUri(`//${name}`, undefined, 'sr25519');
        this.publicKey= this.keyring.address;

        const mangataAddress = keyring.encodeAddress(this.publicKey, chainConfig.mangata.ss58);

        this.assets=[
            {
                chain: "rococo",
                address: keyring.encodeAddress(this.publicKey, chainConfig.rococo.ss58),
            },
            {
                chain: "mangata",
                address: mangataAddress,
                proxyAddress: mangataHelper.getProxyAccount(mangataAddress),
                tokens:[],
            },
            {
                chain: "turing",
                address: keyring.encodeAddress(this.publicKey, chainConfig.turing.ss58),
                tokens:[],
            }
        ]
    }
    
    async init(){
        const mangataAssets = _.find(this.assets, {chain: "mangata"});

        const balancePromises = _.map(mangataHelper.assets, async (asset) => {
            const { symbol } = asset;
            const mangataBalance = await mangataHelper.getBalance(symbol, mangataAssets.address);
            const decimal = tokenConfig[symbol].decimal;

            if(_.find(mangataAssets.tokens, {"symbol":symbol})){
                _.merge(mangataAssets.tokens,{ "symbol":symbol,
                balance: mangataBalance.free,
                balanceFloat: mangataBalance.free.div(new BN(decimal)).toNumber()
                });
            }
            else{
              mangataAssets.tokens.push(
                { "symbol":symbol,
                balance: mangataBalance.free,
                balanceFloat: mangataBalance.free.div(new BN(decimal)).toNumber()
                });   
            }
        });

        await Promise.all(balancePromises);

        const turing = _.find(this.assets, {chain: "turing"});
        const balance = await turingHelper.getBalance(turing.address);
        const decimal = tokenConfig['TUR'].decimal;
        turing.tokens.push({ symbol:'TUR', balance: balance.free, balanceFloat: balance.free.div(new BN(decimal)).toNumber()});
    }

    print(){
        console.log(util.inspect(this.assets, {depth: 4, colors: true}))
    }
}

export default Account;