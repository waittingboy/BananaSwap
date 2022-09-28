//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/ITokenManager.sol";
// //import "hardhat/console.sol";

contract TokenManager is OwnableUpgradeable, ITokenManager {
    // class A mapping
    mapping(address => bool) public tokenAMapping;
    // type A associate B
    mapping(address => address) public associateA2BMapping;
    //class B mapping
    mapping(address => bool) public tokenBMapping;
    //class USDT Mapping
    mapping(address => bool) public usdtMapping;
    // router address
    mapping(address => bool) public routerAddresses;
    mapping(address => bool) private isManager;

    enum TokenType { TOKENA, TOKENB, USDT }
    event AddToken(address indexed sender, TokenType tokenType, bool add);

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(address _tokenB, address _usdt) public initializer {
        __Ownable_init();
        tokenBMapping[_tokenB] = true;
        usdtMapping[_usdt] = true;
        isManager[_msgSender()] = true;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function addRouter(address _routerAddress, bool opt) public onlyManager {
        if (opt) {
            routerAddresses[_routerAddress] = true;
        } else {
            delete routerAddresses[_routerAddress];
        }
    }

    function isRouter(address routerAddress) public override view returns (bool) {
        return routerAddresses[routerAddress];
    }

    //if opt true，associate tokenA with tokenB, otherwise not
    function associateA2B(address tokenA, address tokenB, bool opt) public onlyManager {
        if (opt) {
            associateA2BMapping[tokenA] = tokenB;
        } else {
            delete associateA2BMapping[tokenA];
        }
    }

    function isAssociate(address tokenA, address tokenB) public view returns (bool) {
        return associateA2BMapping[tokenA] == tokenB;
    }
    
    function isAssociateWithB(address tokenA) external view override returns (bool) {
        address tokenB = associateA2BMapping[tokenA];
        return tokenB != address(0) && tokenBMapping[tokenB];
    }

    function addTokenAList(address tokenAAddress, bool add) public onlyManager {
        if (add) {
            tokenAMapping[tokenAAddress] = true;
        } else {
            delete tokenAMapping[tokenAAddress];
        }
        emit AddToken(tokenAAddress, TokenType.TOKENA, add);
    }

    function addTokenBList(address tokenBAddress, bool add) public onlyManager {
        if (add) {
            tokenBMapping[tokenBAddress] = true;
        } else {
            delete tokenAMapping[tokenBAddress];
        }
        emit AddToken(tokenBAddress, TokenType.TOKENB, add);
    }

    function addUsdtList(address usdtAddress, bool add) public onlyManager {
        if (add) {
            usdtMapping[usdtAddress] = true;
        } else {
            delete usdtMapping[usdtAddress];
        }
        emit AddToken(usdtAddress, TokenType.USDT, add);
    }

    function isTokenA(address tokenAddress) public view override returns (bool) {
        return tokenAMapping[tokenAddress];
    }

    function isTokenB(address tokenAddress) public override view returns (bool) {
        return tokenBMapping[tokenAddress];
    }

    function isUsdt(address tokenAddress) external override view returns (bool) {
        return usdtMapping[tokenAddress];
    }

}