//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IERC20.sol";
import "../interfaces/ITimeLock.sol";
import "../libraries/TransferHelper.sol";

contract FinalTimeLock is Initializable, OwnableUpgradeable, ITimeLock {
    address public token;
    bool private  _lock;
    mapping(address => UserInfo) private userInfos;
    mapping(address => bool) private isManager;

    event Deposit(address indexed account, uint amount, uint startTime, uint endTime);
    event Withdraw(address indexed account, uint unlockAmt, uint withdrawTime);

    modifier lock() {
        require(!_lock, "TimeLock locked");
        _lock = true;
        _;
        _lock = false;
    }

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    // constructor() {
        
    // }
    
    function initialize(address _token) public initializer {
        __Ownable_init();
        token = _token;
        isManager[msg.sender] = true;
    }

    function setManager(address _manager, bool _flag) external override onlyOwner {
        isManager[_manager] = _flag;
    }

    function setToken(address _token) external override onlyManager {
        token = _token;
    }

    function getLockAmount(address account) external view override returns(uint lockAmt) {
        require(token != address(0), "TOKEN_ZERO");
        UserInfo storage userInfo = userInfos[account];
        if (userInfo.account == address(0)) {
            return 0;
        }
        for (uint index; index < userInfo.nextPosId; ++index) {
            if (!userInfo.userPos[index].isWithdraw) {
                lockAmt += userInfo.userPos[index].amount;
            }
        }
    }

    function getUnLockAmount(address account, uint time) external view override returns(uint unlockAmt) {
        require(token != address(0), "TOKEN_ZERO");
        UserInfo storage userInfo = userInfos[account];
        if (userInfo.account == address(0)) {
            return 0;
        }
        for (uint index; index < userInfo.nextPosId; ++index) {
            if (!userInfo.userPos[index].isWithdraw && userInfo.userPos[index].endTime <= time) {
                unlockAmt += userInfo.userPos[index].amount;
            }
        }
    }

    function getPositionLength(address account) external view override returns(uint length) {
        return userInfos[account].nextPosId;
    }

    function getPositions(address account) external view override returns(Position[] memory positions) {
        if (userInfos[account].nextPosId > 0) {
            positions = new Position[](userInfos[account].nextPosId);
        }
        for(uint index; index < userInfos[account].nextPosId; ++index) {
            positions[index] = userInfos[account].userPos[index];
        }
    }

    function deposit(address account, uint amount, uint duration) external override lock {
        require(token != address(0), "TOKEN_ZERO");
        require(amount > 0, "AMOUNT_0");
        require(duration > 0, "LOCK_DURATION_0");

        TransferHelper.safeTransferFrom(token, msg.sender, address(this), amount);
        if (userInfos[account].account == address(0)) {
            userInfos[account].account = account;
            userInfos[account].totalLockAmount += amount;
        }
        userInfos[account].totalLockAmount = userInfos[account].totalLockAmount + amount;
        uint posId = userInfos[account].nextPosId;
        Position memory position = Position(account, amount, block.timestamp, block.timestamp + duration, 0, false);
        userInfos[account].userPos[posId] = position;
        userInfos[account].nextPosId = posId + 1;
        emit Deposit(account, amount, position.startTime, position.endTime);
    }

    function withdraw() external override lock returns(uint unlockAmt) {
        require(token != address(0), "TOKEN_ZERO");
        UserInfo storage userInfo = userInfos[msg.sender];
        require(userInfo.account == msg.sender, "NO_POSITION");

        for (uint index; index < userInfo.nextPosId; ++index) {
            if (!userInfo.userPos[index].isWithdraw && userInfo.userPos[index].endTime < block.timestamp) {
                unlockAmt += userInfo.userPos[index].amount;
                userInfo.userPos[index].isWithdraw = true;
                userInfo.userPos[index].withdrawTime = block.timestamp;
            }
        }

        if (unlockAmt > 0) {
            userInfos[msg.sender].totalLockAmount -= unlockAmt;
            TransferHelper.safeTransfer(token, msg.sender, unlockAmt);
            emit Withdraw(msg.sender, unlockAmt, block.timestamp);
        }
    }

}