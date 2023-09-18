import _, { over } from 'lodash';
import BN from 'bn.js';
import moment from 'moment';
import chalkPipe from 'chalk-pipe';
import Keyring from '@polkadot/keyring';
import { u8aToHex } from '@polkadot/util';
import { ApiPromise, WsProvider } from '@polkadot/api';
import { Sdk } from '@oak-network/sdk';
import { AstarAdapter, OakAdapter } from '@oak-network/adapter';
import {
    sendExtrinsic, getDecimalBN, listenEvents, calculateTimeout, bnToFloat, delay, getTaskIdInTaskScheduledEvent, getHourlyTimestamp, waitPromises, ScheduleActionType,
} from '../common/utils';
import OakHelper from '../common/oakHelper';

const MIN_BALANCE_IN_PROXY = 10; // The proxy accounts are to be topped up if its balance fails below this number
const TASK_FREQUENCY = 3600;

// eslint-disable-next-line import/prefer-default-export
export const scheduleTask = async ({
    oakConfig, astarConfig, scheduleActionType, createPayloadFunc, keyringPair,
}) => {
    const keyring = new Keyring({ type: 'sr25519' });

    const oakHelper = new OakHelper({ endpoint: oakConfig.endpoint });
    await oakHelper.initialize();
    const oakApi = oakHelper.getApi();
    const oakAdapter = new OakAdapter(oakApi, oakConfig);
    await oakAdapter.initialize();

    const astarApi = await ApiPromise.create({ provider: new WsProvider(astarConfig.endpoint) });
    const astarAdapter = new AstarAdapter(astarApi, astarConfig);
    await astarAdapter.initialize();

    const oakChainData = oakAdapter.getChainData();
    const astarChainData = astarAdapter.getChainData();

    const oakChainName = oakChainData.key;
    const parachainName = astarChainData.key;
    const astarDecimalBN = getDecimalBN(astarChainData.defaultAsset.decimals);
    const paraTokenIdOnOak = (await oakApi.query.assetRegistry.locationToAssetId(astarChainData.defaultAsset.location))
        .unwrapOrDefault()
        .toNumber();
    console.log(`${astarChainData.defaultAsset.symbol} ID on ${oakChainName}: `, paraTokenIdOnOak);

    // One-time setup - a proxy account needs to be created to execute an XCM message on behalf of its user
    // We also need to transfer tokens to the proxy account to pay for XCM and task execution fees
    console.log(`\n1. One-time proxy setup on ${parachainName} ...`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${parachainName}\n`);

    const proxyAccoundIdOnParachain = astarAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), oakChainData.paraId);
    const proxyAddressOnParachain = keyring.encodeAddress(proxyAccoundIdOnParachain, astarChainData.ss58Prefix);
    const proxyTypeParachain = 'Any'; // We cannot set proxyType to "DappsStaking" without the actual auto-restake call
    const proxies = _.first((await astarApi.query.proxy.proxies(u8aToHex(keyringPair.addressRaw))).toJSON());
    console.log('proxies: ', proxies);
    const proxyMatch = _.find(proxies, { delegate: proxyAddressOnParachain, proxyType: proxyTypeParachain });

    if (proxyMatch) {
        console.log(`Proxy address ${proxyAddressOnParachain} for paraId: ${astarChainData.paraId} and proxyType: ${proxyTypeParachain} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${oakChainName} (paraId:${oakChainData.paraId}) and proxyType: ${proxyTypeParachain} on ${parachainName} ...\n Proxy address: ${proxyAddressOnParachain}\n`);
        await sendExtrinsic(astarApi, astarApi.tx.proxy.addProxy(proxyAccoundIdOnParachain, proxyTypeParachain, 0), keyringPair);
    }

    const minBalance = new BN(MIN_BALANCE_IN_PROXY).mul(astarDecimalBN);
    const { data } = await astarApi.query.system.account(proxyAccoundIdOnParachain);
    let proxyBalance = data;
    if (proxyBalance.free.lt(minBalance)) {
        console.log(`\nTopping up the proxy account on ${astarChainData.key} with ${astarChainData.defaultAsset.symbol} ...\n`);
        const topUpExtrinsic = astarApi.tx.balances.transfer(proxyAccoundIdOnParachain, minBalance.toString());
        await sendExtrinsic(astarApi, topUpExtrinsic, keyringPair);

        // Retrieve the latest balance after top-up
        proxyBalance = (await astarApi.query.system.account(proxyAccoundIdOnParachain)).data;
    }

    const beginProxyBalance = bnToFloat(proxyBalance.free, astarDecimalBN);
    const beginProxyBalanceColor = beginProxyBalance === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${parachainName} is ${chalkPipe(beginProxyBalanceColor)(beginProxyBalance)} ${astarChainData.defaultAsset.symbol}.`);

    console.log(`\n2. One-time proxy setup on ${oakChainName} ...`);
    console.log(`\na) Add a proxy for ${keyringPair.meta.name} If there is none setup on ${oakChainName} (paraId:${astarChainData.paraId})\n`);
    const proxyTypeOak = 'Any';
    console.log('astarChainData.relayChain: ', astarChainData.relayChain);
    console.log('astarChainData.network: ', astarChainData.xcm.network);
    const proxyAccoundIdOnOak = oakAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), astarChainData.paraId, { network: astarChainData.xcm.network, locationType: 'XcmV3MultiLocation' });
    const proxyAddressOnOak = keyring.encodeAddress(proxyAccoundIdOnOak, oakChainData.ss58Prefix);
    const proxiesOnOak = _.first((await oakApi.query.proxy.proxies(u8aToHex(keyringPair.addressRaw))).toJSON());
    const proxyMatchOak = _.find(proxiesOnOak, { delegate: proxyAddressOnOak, proxyType: proxyTypeOak });

    if (proxyMatchOak) {
        console.log(`Proxy address ${proxyAddressOnOak} for paraId: ${astarChainData.paraId} and proxyType: ${proxyTypeOak} already exists; skipping creation ...`);
    } else {
        console.log(`Add a proxy of ${parachainName} (paraId:${astarChainData.paraId}) and proxyType: ${proxyTypeOak} on Turing ...\n Proxy address: ${proxyAddressOnOak}\n`);
        await sendExtrinsic(oakApi, oakApi.tx.proxy.addProxy(proxyAccoundIdOnOak, proxyTypeOak, 0), keyringPair);
    }

    // Reserve transfer SBY to the proxy account on Oak
    const minBalanceOnOak = new BN(MIN_BALANCE_IN_PROXY).mul(astarDecimalBN);
    let balanceOnOak = await oakApi.query.tokens.accounts(proxyAccoundIdOnOak, paraTokenIdOnOak);

    if (balanceOnOak.free.lt(minBalanceOnOak)) {
        console.log(`\nTopping up the proxy account on ${oakChainName} via reserve transfer ...`);
        astarAdapter.crossChainTransfer(
            oakAdapter.getLocation(),
            proxyAccoundIdOnOak,
            astarChainData.defaultAsset.location,
            minBalanceOnOak,
            keyringPair,
        );

        balanceOnOak = await oakApi.query.tokens.accounts(proxyAccoundIdOnOak, paraTokenIdOnOak);
    }

    const beginBalanceOak = bnToFloat(balanceOnOak.free, astarDecimalBN);
    const beginBalanceTuringColor = beginBalanceOak === 0 ? 'red' : 'green';
    console.log(`\nb) Proxy’s balance on ${oakChainName} is ${chalkPipe(beginBalanceTuringColor)(beginBalanceOak)} ${astarChainData.defaultAsset.symbol}.`);

    console.log(`\n3. Execute an XCM from ${parachainName} to schedule a task on ${oakChainName} ...`);

    const payload = createPayloadFunc(astarApi);
    const taskPayloadExtrinsic = astarApi.tx.proxy.proxy(keyringPair.addressRaw, 'Any', payload);

    const dest = { V3: astarAdapter.getLocation() };
    // const encodedCall = taskPayloadExtrinsic.method.toHex();
    const oakTransactXcmInstructionCount = 4; // oakAdapter.getTransactXcmInstructionCount();
    const { encodedCallWeight, overallWeight } = await astarAdapter.getXcmWeight(taskPayloadExtrinsic, keyringPair.address, oakTransactXcmInstructionCount);

    console.log('encodedCallWeight: ', 'refTime', encodedCallWeight.refTime.toNumber(), ', proofSize', encodedCallWeight.proofSize.toNumber());
    console.log('overallWeight: ', 'refTime:', overallWeight.refTime.toNumber(), ', proofSize', overallWeight.proofSize.toNumber());

    const astarLocation = astarChainData.defaultAsset.location;
    const feeAmount = await astarAdapter.weightToFee(overallWeight, astarLocation);

    const feeLocation = { parents: 0, interior: 'Here' };
    // const executionFee = { assetLocation: { V3: executionFeeLocation }, amount: executionFeeAmout };

    // Calculate derive account on Turing/OAK
    // const options = { locationType: 'XcmV3MultiLocation', network: astarChainData.xcm.network };
    // const deriveAccountId = oakAdapter.getDerivativeAccount(u8aToHex(keyringPair.addressRaw), astarChainData.paraId, options);

    const message = {
        V3: [
            {
                WithdrawAsset: [
                    {
                        fun: { Fungible: feeAmount },
                        id: { Concrete: feeLocation },
                    },
                ],
            },
            {
                BuyExecution: {
                    fees: {
                        fun: { Fungible: feeAmount },
                        id: { Concrete: feeLocation },
                    },
                    weightLimit: { Limited: overallWeight },
                },
            },
            {
                Transact: {
                    originKind: 'SovereignAccount',
                    requireWeightAtMost: encodedCallWeight,
                    call: { encoded: taskPayloadExtrinsic.method.toHex() },
                },
            },
        ],
    };

    const extrinsic = oakApi.tx.polkadotXcm.send(dest, message);
    console.log('extrinsic: ', extrinsic.method.toHex());
    await sendExtrinsic(oakApi, extrinsic, keyringPair);

    await oakHelper.disconnect();
    await astarApi.disconnect();
};
