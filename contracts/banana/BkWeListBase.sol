//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "../BkWeList.sol";

/// for use this base contract. 
/// You need add _setupRole(MANAGER_ROLE, _msgSender()); to you initial method for initialize the caller is
contract BkWeListBase is BkWeList,AccessControlEnumerableUpgradeable{
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
    // function initialize()public initializer{
    //     _setupRole(MANAGER_ROLE, _msgSender());        
    // }
    function addWeList(address[] memory _address)public virtual onlyRole(MANAGER_ROLE){
        _addWeList(_address);
    }
    function removeWeList(address _address)public virtual onlyRole(MANAGER_ROLE){
        _removeWeList(_address);
    }
    function addBkList(address[] memory _address)public virtual onlyRole(MANAGER_ROLE){
        _addBkList(_address);
    }
    function removeBkList(address _address)public virtual onlyRole(MANAGER_ROLE){
        _removeBkList(_address);
    }
}