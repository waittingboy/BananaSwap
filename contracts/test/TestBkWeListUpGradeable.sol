//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../BkWeList.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

contract TestBkWeListUpGradeable is BkWeList,AccessControlEnumerableUpgradeable{
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    function initialize()public initializer{
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MANAGER_ROLE, _msgSender());        
    }
    function addWeList(address[]memory _address)public onlyRole(MANAGER_ROLE){
        _addWeList(_address);
    }
    function removeWeList(address _address)public onlyRole(MANAGER_ROLE){
        _removeWeList(_address);
    }
    function addBkList(address[]memory _address)public onlyRole(MANAGER_ROLE){
        _addBkList(_address);
    }
    function removeBkList(address _address)public onlyRole(MANAGER_ROLE){
        _removeBkList(_address);
    }
}