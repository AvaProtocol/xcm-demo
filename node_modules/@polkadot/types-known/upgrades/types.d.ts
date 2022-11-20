import type { HexString } from '@polkadot/util/types';
export declare type ChainUpgradesRaw = [blockNumber: number, specVersion: number][];
export declare type ChainUpgradesExpanded = [blockNumber: number, specVersion: number, runtimeApis: [apiHash: HexString, apiVersion: number][]][];
