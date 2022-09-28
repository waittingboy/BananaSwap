//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITimeLock {
    struct Position {
        address account;
        uint amount;
        uint startTime;
        uint endTime;
        uint withdrawTime;
        bool isWithdraw;
    }

    struct UserInfo {
        address account;
        uint256 totalLockAmount;
        mapping(uint256 => Position) userPos;
        uint nextPosId;
    }
    function setManager(address _manager, bool _flag) external;
    function setToken(address _token) external;
    function getLockAmount(address account) external view returns(uint lockAmt);
    function getUnLockAmount(address account, uint time) external view returns(uint lockAmt);
    function getPositionLength(address account) external view returns(uint length);
    function getPositions(address account) external view returns(Position[] memory positions);

    function deposit(address account, uint amount, uint duration) external;
    function withdraw() external returns(uint unlockAmt);
}