//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// interface process fee
interface IRewardHandler {
    function handleFee(address tokenAddress, uint256 amount) external returns (bool);
}
