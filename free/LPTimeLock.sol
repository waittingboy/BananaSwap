//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IERC20.sol";
import "../libraries/TransferHelper.sol";
import "../interfaces/ILPTimeLock.sol";

contract LPTimeLock is OwnableUpgradeable, ILPTimeLock {
    uint public lockDuration;

    struct UserInfo {
        uint amount;
        uint startTime;
    }

    struct PoolInfo {
        IERC20 lpToken;
        uint startTime;
        uint endTime;
        uint totalAmount;
    }

    PoolInfo[] public poolInfo;
    mapping(address => uint) public lpTokenOfPid;
    mapping(address => bool) public lpTokenExist;
    mapping(uint => mapping(address => UserInfo)) public userInfos;
    bool public paused;
    mapping(address => bool) public isManager;

    modifier notPause() {
        require(paused == false, "LPTimeLock has been suspended");
        _;
    }

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize() public initializer {
        __Ownable_init();
        lockDuration = 1 days * 356 * 99;
        paused = false;
        isManager[_msgSender()] = true;
    }

    function setPause() external override onlyManager {
        bool oldValue = paused;
        paused = !paused;
        emit SetPause(msg.sender, oldValue, paused);
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function setLockDuration(uint _lockDuration) external override onlyManager {
        lockDuration = _lockDuration;
        emit SetLockDuration(msg.sender, _lockDuration);
    }

    function poolLength() public view returns (uint) {
        return poolInfo.length;
    }

    function addPoolInfo(address _lpToken) external override onlyManager {
        require(address(_lpToken) != address(0), "_lpToken is the zero address");
        require(!lpTokenExist[_lpToken], "_lpToken exist");

        uint256 endTm = block.timestamp + lockDuration;
        poolInfo.push(PoolInfo({
            lpToken : IERC20(_lpToken),
            startTime : block.timestamp,
            endTime : endTm,
            totalAmount : 0
        }));
        lpTokenOfPid[_lpToken] = poolLength() - 1;
        lpTokenExist[_lpToken] = true;
        emit AddPoolInfo(msg.sender, _lpToken, lockDuration);
    }

    function setPoolInfo(address _lpToken, uint256 _startTime, uint _endTime) external override onlyManager {
        require(_lpToken != address(0), "lpToken zero address");
        require(_startTime < _endTime, "time error");
        require(lpTokenExist[_lpToken], "_lpToken not exist");

        uint pid = lpTokenOfPid[_lpToken];
        poolInfo[pid].startTime = _startTime;
        poolInfo[pid].endTime = _endTime;
        emit SetPoolInfo(msg.sender, _lpToken, _startTime, _endTime);
    }

    function getLockedAmount(address _lpToken, address account) public view returns(uint) {
        uint pid = lpTokenOfPid[_lpToken];
        return userInfos[pid][account].amount;
    }

    function deposit(address _lpToken, address user, uint256 _amount) external override notPause {
        require(_lpToken != address(0), "lp zero address");
        require(_amount > 0, "lp amout 0");
        require(user != address(0), "user zero address");
        require(lpTokenExist[_lpToken], "_lpToken not exist");

        uint pid = lpTokenOfPid[_lpToken];
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage userInfo = userInfos[pid][user];

        TransferHelper.safeTransferFrom(address(pool.lpToken), msg.sender, address(this), _amount);

        userInfo.amount = userInfo.amount + _amount;
        if (userInfo.startTime == 0) {
            userInfo.startTime = block.timestamp;
        }
        pool.totalAmount = pool.totalAmount + _amount;

        emit Deposit(user, _lpToken, pid, _amount);
    }

    // function withdraw(address _lpToken) external override notPause returns(uint) {
    //     return this.withdraw(_lpToken, msg.sender);
    // }

    function withdraw(address _lpToken, address _account) external override notPause returns(uint) {
        require(_lpToken != address(0), "lp zero address");
        require(lpTokenExist[_lpToken], "_lpToken not exist");

        uint pid = lpTokenOfPid[_lpToken];
        PoolInfo storage pool = poolInfo[pid];
        UserInfo storage userInfo = userInfos[pid][_account];
        require(userInfo.amount > 0, "lp amout 0");
        require(pool.endTime < block.timestamp, "endTime gt now");

        uint unlockAmt = userInfo.amount;
        userInfo.amount = 0;
        pool.totalAmount = pool.totalAmount - unlockAmt;

        TransferHelper.safeTransfer(address(pool.lpToken), _account, unlockAmt);
        emit Withdraw(address(pool.lpToken), _account, pid, unlockAmt);
        return unlockAmt;
    }

}

