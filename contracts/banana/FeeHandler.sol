//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/nana/IFeeHandler.sol";
import "../interfaces/IERC20.sol";
//import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/presets/ERC20PresetMinterPauserUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";


contract FeeHandler is IFeeHandler,OwnableUpgradeable {
    using EnumerableMap for EnumerableMap.AddressToUintMap;
    using EnumerableSet for EnumerableSet.Bytes32Set;

    //用户待领取列表 userAddress => tokenAddress => usize
    // mapping(address=>EnumerableMap.AddressToUintMap) internal tokenUserPending;

    mapping(address => bool) private isManager;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function initialize() public initializer {
        __Ownable_init();
        setManager(_msgSender(),true);
    }

    // // query the token address=>amount by user address
    // function getUserPendingTokens(address userAddress)public view returns(address[] memory tokens,uint256[] memory amounts){
    //     EnumerableMap.AddressToUintMap storage pendingToken = tokenUserPending[userAddress];
    //     uint256 len = pendingToken.length();
    //     address[] memory tokensArr = new address[](len);
    //     uint256[] memory amountsArr = new uint256[](len);
    //     for (uint256 i = 0; i < len; i++) {
    //         (address token,uint256 amount) = pendingToken.at(i);
    //         tokensArr[i] = token;
    //         amountsArr[i] = amount;
    //     }
    //     return (tokensArr,amountsArr);
    // }

    // //manager input the user=>token=>amount
    // function inputUserPendingAmount(
    //     address[] calldata userAddresses, 
    //     address[] calldata tokenAddresses,
    //     uint256[] calldata addAmounts)
    //     public onlyManager {
    //     require(userAddresses.length == tokenAddresses.length && tokenAddresses.length == addAmounts.length,"input length eq");
    //     for (uint256 i = 0; i < userAddresses.length; i++) {
    //         EnumerableMap.AddressToUintMap storage pendingToken = tokenUserPending[userAddresses[i]];
    //         if (pendingToken.contains(tokenAddresses[i])) {
    //             pendingToken.set(tokenAddresses[i], pendingToken.get(tokenAddresses[i]) + addAmounts[i]);
    //         } else {
    //             pendingToken.set(tokenAddresses[i], addAmounts[i]);
    //         }
    //         emit InputUserPendingAmount(userAddresses[i],tokenAddresses[i],addAmounts[i]);
    //     }
    // }

    // //user claims there tokens
    // function claims(address[] calldata tokenAddresses,uint256[] calldata addAmounts) public{
    //     require(tokenAddresses.length == addAmounts.length,"input length eq");
    //     address caller = _msgSender();
    //     EnumerableMap.AddressToUintMap storage pendingToken = tokenUserPending[caller];
    //     for (uint256 i = 0; i < tokenAddresses.length; i++) {
    //          bool isContainsToken = pendingToken.contains(tokenAddresses[i]);
    //          if (isContainsToken) {
    //             uint256 tokenAmount = pendingToken.get(tokenAddresses[i]);
    //             require(tokenAmount >= addAmounts[i],"exceeds user amount");
    //             uint256 diffAmount = tokenAmount - addAmounts[i];
    //             pendingToken.set(tokenAddresses[i], diffAmount);
    //             IERC20(tokenAddresses[i]).transfer(caller, addAmounts[i]);
    //             emit UserClaimAmount(caller,tokenAddresses[i],addAmounts[i]);
    //         } else {
    //             require(isContainsToken,"tokenAddresses not exist");
    //         }   
    //     }
    // }

    function handleFee(
        address tokenAddress,
        uint256 amount
    ) external virtual override returns (bool){
        // ERC20PresetMinterPauserUpgradeable(tokenAddress).burn(300);
        // return true;
    }

    // event InputUserPendingAmount(
    //     address indexed userAddress,
    //     address indexed tokenAddress,
    //     uint256 amount
    // );

    // event UserClaimAmount(
    //     address indexed userAddress,
    //     address indexed tokenAddress,
    //     uint256 amount
    // );
}
