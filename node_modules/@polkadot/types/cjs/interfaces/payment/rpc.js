"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.rpc = void 0;
// Copyright 2017-2022 @polkadot/types authors & contributors
// SPDX-License-Identifier: Apache-2.0

const rpc = {
  queryFeeDetails: {
    description: 'Query the detailed fee of a given encoded extrinsic',
    params: [{
      name: 'extrinsic',
      type: 'Bytes'
    }, {
      isHistoric: true,
      isOptional: true,
      name: 'at',
      type: 'BlockHash'
    }],
    type: 'FeeDetails'
  },
  queryInfo: {
    description: 'Retrieves the fee information for an encoded extrinsic',
    params: [{
      name: 'extrinsic',
      type: 'Bytes'
    }, {
      isHistoric: true,
      isOptional: true,
      name: 'at',
      type: 'BlockHash'
    }],
    type: 'RuntimeDispatchInfo'
  }
};
exports.rpc = rpc;