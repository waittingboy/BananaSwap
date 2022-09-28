//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

interface ITokenAInterface {
    function born(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transferOwnership(address name) external;
}