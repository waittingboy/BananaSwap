//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IERC20.sol";
// //import "hardhat/console.sol";

//collecte user fee and reward to users 
contract RewardHandler is OwnableUpgradeable {

    IERC20 public mainToken;
    address public feeAddress;
    uint public feeAmount;
    uint public totalFeeAmount;
    mapping(address => bool) private isManager;

    event UserClaimAmount(address indexed userAddress, address indexed tokenAddress, uint256 amount);
    
    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(IERC20 _mainToken, uint _feeAmount, address _feeAddress) public initializer {
        __Ownable_init();
        setManager(_msgSender(),true);
        mainToken = _mainToken;
        feeAmount = _feeAmount;
        feeAddress = _feeAddress;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function setMainToken(IERC20 _mainToken) public onlyManager {
        mainToken = _mainToken;
    }

    function setfeeAmount(uint _feeAmount) public onlyManager {
        feeAmount = _feeAmount;
    }

    function setfeeAddress(address _feeAddress) public onlyManager {
        feeAddress = _feeAddress;
    }

    function distributeRewardToUser(address userAddress, address tokenAddress, uint distributeAmount) public onlyManager {
        //get the nana fee.
        mainToken.transferFrom(userAddress, feeAddress, feeAmount);
        IERC20(tokenAddress).transfer(userAddress, distributeAmount);
        emit UserClaimAmount(userAddress, tokenAddress, distributeAmount);
    }
    
}
