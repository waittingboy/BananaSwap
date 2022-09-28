// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/ILiquidManager.sol";
import "./interfaces/IBananaSwapPair.sol";
import "./interfaces/IUniswapV2Router.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ILPTimeLock.sol";
import "./libraries/TransferHelper.sol";
//import "hardhat/console.sol";

contract LiquidManager is OwnableUpgradeable, ILiquidManager {

    struct UserBaseLiquidConfig {
        uint tokenAAmt;
        uint tokenAAddedAmt;
        address account;
    }

    struct PoolBaseLiquidConfig {
        address[] users;
        uint addIndexed;
        mapping(address => bool) baseUsersDels;
        mapping(address => bool) baseUsersSkips;
        mapping(address => uint) accountIndexMap;
        mapping(address => bool) accountMap;
        mapping(address => UserBaseLiquidConfig) usersConfigMap;
        uint totalAddedTokenAAmt;
        address pair;
        address tokenA;
        bool isExist;
    }
    mapping(address => mapping(address => bool)) public override blackList;
    mapping(address => mapping(address => bool)) public override whiteList;
    mapping(address => bool) private openBaseAddLiquidMap;
    mapping(address => bool) private openAddLiquidMap;
    mapping(address => bool) private openRemoveLiquidMap;

    mapping(address => PoolBaseLiquidConfig) public liquidConfigs;
    address public router;
    address public usdtToken;
    address public lpTokenTimeLock;
    mapping(address => bool) public isManager;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(address _router, address _usdtToken, address _lpTokenTimeLock) public initializer {
        __Ownable_init();
        router = _router;
        usdtToken = _usdtToken;
        lpTokenTimeLock = _lpTokenTimeLock;
        isManager[_msgSender()] = true;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }
 
    function adminAddBaseLiquidList(
        address pair,
        address tokenAAddr,
        address[] memory accounts,
        uint[] memory  tokenAAmts
    ) external override onlyManager {
        require(pair != address(0), "LM:pair is 0");
        require(tokenAAddr != address(0), "tokenAAddr is 0");
        require(accounts.length == tokenAAmts.length, "LM:arrary length no eq");
        require(accounts.length > 0,"LM:arrary length no eq");

        PoolBaseLiquidConfig storage config = liquidConfigs[pair];
        if (!config.isExist) {
            config.isExist = true;
            config.pair = pair;
            config.tokenA = tokenAAddr;
        }

        for (uint index; index < accounts.length; ++index) {
            address account = accounts[index];
            if (!config.accountMap[account]) {
                config.users.push(account);
                config.usersConfigMap[account] = UserBaseLiquidConfig(tokenAAmts[index], 0, account);
                config.accountMap[account] = true;
                config.accountIndexMap[account] = config.users.length - 1;
            } else {
                config.usersConfigMap[account].tokenAAmt = tokenAAmts[index];
                config.usersConfigMap[account].account = account;
            }
        }
    }

    function getBaseLiquidAmount(address pair, address user) external view returns(uint tokenAAmut, uint tokenAAddedAmt) {
        require(pair != address(0), "LM:pair is 0");
        require(user != address(0), "LP:user is 0");

        if (!openBaseAddLiquidMap[pair]) return (0, 0);
        if (liquidConfigs[pair].baseUsersSkips[user]) return (0, 0);
        if (liquidConfigs[pair].baseUsersDels[user]) return (0, 0);

        tokenAAmut = liquidConfigs[pair].usersConfigMap[user].tokenAAmt;
        tokenAAddedAmt = liquidConfigs[pair].usersConfigMap[user].tokenAAddedAmt;
    }

    function addBaseLiquid(address pair, address user, uint tokenAAmt, uint tokenAAmtOfffee) external override returns(uint) {
        require(pair != address(0), "LM:pair is 0");
        require(liquidConfigs[pair].isExist, "LM:pair not exist");
        require(openBaseAddLiquidMap[pair], "LM:openBaseAddLiquidFlag is false");

        PoolBaseLiquidConfig storage poolInfo = liquidConfigs[pair];
        require(poolInfo.accountMap[user], "LM:user not in base");
        require(!poolInfo.baseUsersDels[user], "LM:user del");

        uint addIndex = poolInfo.addIndexed;
        uint index;
        for (index = addIndex; index < poolInfo.users.length; ++index) {
            if (poolInfo.baseUsersDels[poolInfo.users[index]] || poolInfo.baseUsersSkips[poolInfo.users[index]]) {
                poolInfo.addIndexed += 1;
            }
            if (!poolInfo.baseUsersDels[poolInfo.users[index]] && !poolInfo.baseUsersSkips[poolInfo.users[index]]) {
                break;
            }
        }

        require(poolInfo.users[poolInfo.addIndexed] == user);
        require(poolInfo.usersConfigMap[user].account == user);
        require((poolInfo.usersConfigMap[user].tokenAAddedAmt + tokenAAmt) <= poolInfo.usersConfigMap[user].tokenAAmt, "LM:gt config amount");
       
        poolInfo.usersConfigMap[user].tokenAAddedAmt = poolInfo.usersConfigMap[user].tokenAAddedAmt + tokenAAmt;
        if (poolInfo.usersConfigMap[user].tokenAAddedAmt >= poolInfo.usersConfigMap[user].tokenAAmt && poolInfo.addIndexed < poolInfo.users.length) {
            poolInfo.addIndexed += 1;
        }

        emit AddBaseLiquid(pair, user, tokenAAmt, tokenAAmtOfffee);
        return tokenAAmt;
    }

    function adminSetBaseLiquidSkip(address pair, address user, bool value) public onlyManager returns(bool) {
        require(pair != address(0), "LM:pair is 0");
        require(liquidConfigs[pair].isExist, "LM:pair not exist");
        PoolBaseLiquidConfig storage poolInfo = liquidConfigs[pair];
        poolInfo.baseUsersSkips[user] = value;
        return true;
    }

    function adminSetBaseLiquidDel(address pair, address user, bool value) public onlyManager returns(bool) {
        require(pair != address(0), "LM:pair is 0");
        require(liquidConfigs[pair].isExist, "LM:pair not exist");
        PoolBaseLiquidConfig storage poolInfo = liquidConfigs[pair];
        poolInfo.baseUsersDels[user] = value;
        return true;
    }

    function openBaseAddLiquid(address pair, bool value) external override onlyManager {
        require(openBaseAddLiquidMap[pair] != value, "LM:openBaseAddLiquidFlag already");
        openBaseAddLiquidMap[pair] = value;
        emit OpenBaseAddLiquid(msg.sender, pair, value);
    }

    function checkOpenBaseAddLiquid(address pair) external view override returns(bool) {
        require(pair != address(0), "LM:pair is 0");
        return openBaseAddLiquidMap[pair];
    }

    function openAddLiquid(address pair, bool value) external override onlyManager {
        require(openAddLiquidMap[pair] != value, "LM:openAddLiquidFlag already");
        openAddLiquidMap[pair]= value;
        emit OpenAddLiquid(msg.sender, pair, value);
    }

    function checkAddLiquid(address pair) external view override returns(bool){
        require(pair != address(0), "LM:pair is 0");
        return openAddLiquidMap[pair];
    }

    function openRemoveLiquid(address pair, bool value) external override onlyManager {
        require(openRemoveLiquidMap[pair] != value, "LM:openRemoveLiquidFlag already");
        openRemoveLiquidMap[pair] = value;
        emit OpenRemoveLiquid(msg.sender, value);
    }

    function checkRemoveLiquid(address pair) external view override returns(bool) {
        require(pair != address(0), "LM:pair is 0");
        return openRemoveLiquidMap[pair];
    }

    function addWhiteList(address pair, address[] memory users, bool[] memory values) external override onlyManager {
        require(pair != address(0), "LM:pair is 0");
        require(users.length > 0 && users.length == values.length, "LM:arrary error");
        
        for (uint index; index < users.length; ++index) {
            require(users[index] != address(0), "user is 0");
            if (whiteList[pair][users[index]] != values[index]) {
                whiteList[pair][users[index]] = values[index];
            }
        }
    }

    function addBlackList(address pair, address[] memory users, bool[] memory values) external override onlyManager {
        require(pair != address(0), "LM:pair is 0");
        require(users.length > 0 && users.length == values.length, "LM:arrary error");

        for (uint index; index < users.length; ++index) {
            require(users[index] != address(0), "user is 0");
            if (blackList[pair][users[index]] != values[index]) {
                blackList[pair][users[index]] = values[index];
            }
        }
    }

    function lockLiquid(address pair, address user, uint liquidity) external override {
        uint balance = IBananaSwapPair(pair).balanceOf(address(this));
        require(balance >= liquidity, "LM:balance error");

        TransferHelper.safeApprove(pair, address(lpTokenTimeLock), liquidity);
        ILPTimeLock(lpTokenTimeLock).deposit(pair, user, liquidity);
    }

}
