//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITokenManager {
    function isTokenA(address tokenAddress)external view returns (bool);
    function isUsdt(address tokenAddress)external view returns (bool);
    function isTokenB(address tokenAddress) external view returns (bool);
    function isAssociateWithB(address tokenA) external view returns (bool);
    function isRouter(address routerAddress)external view returns (bool);
}

