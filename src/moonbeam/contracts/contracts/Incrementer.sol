/**
 *Submitted for verification at moonbase.moonscan.io on 2022-10-19
*/

// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract Incrementer {
    uint public number;
    uint public timestamp;

    function increment() public {
        number++;
        timestamp = block.timestamp;
    }
}