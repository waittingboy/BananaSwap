//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILPTimeLock {
    event SetPause(address indexed oper, bool oldValue, bool newValue);
    event SetLockDuration(address indexed oper, uint _lockDuration);
    event AddPoolInfo(address indexed oper, address indexed _lpToken, uint _lockPeriod);
    event SetPoolInfo(address indexed oper, address indexed _lpToken, uint256 _startTime, uint _endTime);

    event Deposit(address indexed user, address indexed _lpToken, uint256 indexed pid, uint256 amount);
    event Withdraw(address indexed user, address indexed _lpToken, uint256 indexed pid, uint256 amount);

    function setPause() external;
    function setLockDuration(uint _lockDuration) external;
    function addPoolInfo(address _lpToken) external;
    function setPoolInfo(address _lpToken, uint256 _startTime, uint _endTime) external;
    function deposit(address _lpToken, address user, uint256 _amount) external;
    // function withdraw(address _lpToken) external returns(uint);
    function withdraw(address _lpToken, address _account) external returns(uint);
}