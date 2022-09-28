// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IERC20.sol";
// //import "hardhat/console.sol";

contract CoinLocked is OwnableUpgradeable {
    mapping(address => bool) private isManager;
    IERC20 public tokenA;
    address public addressPublic;
    uint256 public releaseAmount;
    uint256 public lockDuration;
    uint256 public startTime;
    uint256 public haveDay;
    uint256 public totalSupply;

    event Withdraw(address _address, uint256 time, uint256 amount, uint256 totalAmount);

    function initialize(address _tokenAaddress, address _addressPublic) public initializer {
        __Ownable_init();
        setManager(_msgSender(), true);
        tokenA = IERC20(_tokenAaddress);
        addressPublic = _addressPublic;
    }

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function getResidualAmount() public view returns (uint256) {
        return tokenA.balanceOf(address(this));
    }

    function setParams(uint256 _releaseAmount, uint256 _lockDuration, uint256 _startTime) public onlyOwner {
        uint256 totalAmount = getResidualAmount();
        require(totalAmount > 0 && _releaseAmount > 0 && _releaseAmount < totalAmount, "_releaseAmount is wrong");
        releaseAmount = _releaseAmount;
        lockDuration = _lockDuration;
        startTime = _startTime;
        totalSupply = totalAmount;
    }

    function getAmount() public view returns (uint256 amount, uint256 day) {
        uint256 intervalTime = block.timestamp - startTime;
        day = intervalTime / lockDuration;
        day = day - haveDay;
        amount = day * releaseAmount;
    }

    function withdraw() public {
        (uint256 amount, uint256 day) = getAmount();
        require(amount > 0, "endTime gt now");
        uint256 totalAmount = getResidualAmount();
        amount = amount > totalAmount ? totalAmount : amount;
        tokenA.transfer(addressPublic, amount);
        haveDay = haveDay + day;
        emit Withdraw(msg.sender, block.timestamp, amount, totalAmount);
    }
}
