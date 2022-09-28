// SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "../BananaSwapERC20.sol";

contract SmartERC20 is BananaSwapERC20 {
    constructor(uint256 _totalSupply) {
        _mint(msg.sender, _totalSupply);
    }
}