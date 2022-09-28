//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IBananaSwapPair.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "./interfaces/ITokenBPool.sol";
import "./libraries/TransferHelper.sol";
//import "hardhat/console.sol";

interface ITokenBInterface {
    function mint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

contract USDTFeeHandle is OwnableUpgradeable, IUSDTFeeHandle {

    uint public constant FeeRatioBase = 10000;

    address public bToken;
    address public bPair;
    address public usdtToken;
    address public router;

    mapping(address => mapping(ActionType => FeeConfig)) public tokenAFeeConfig;
    mapping(address => UsdtBTokenConfig) public tokenBConfigs;
    mapping(address => bool) public isManager;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    constructor() { }

    function initialize(address _usdtToken, address _bToken, address _bPair) public initializer {
        __Ownable_init();
        isManager[_msgSender()] = true;
        usdtToken = _usdtToken;
        bToken = _bToken;
        bPair = _bPair;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function setBToken(address _bToken)external onlyManager {
        bToken = _bToken;
    }

    function setBPair(address _bPair) external onlyManager {
        bPair = _bPair;
    }

    function setUsdtToken(address _usdtToken) external onlyManager {
        usdtToken = _usdtToken;
    }

    function setRouter(address _router) external onlyManager {
        router = _router;
    }

    function setAFeeConfig(address tokenA, ActionType actionType, FeeConfig memory config, bool opt) external override onlyManager {
        require(tokenA != address(0), "token a is 0");
        if (opt) {
            tokenAFeeConfig[tokenA][actionType] = config;
        } else {
            delete tokenAFeeConfig[tokenA][actionType];
        }
    }

    function setBConfig(address tokenB, UsdtBTokenConfig memory config) external override onlyManager {
        require(tokenB != address(0), "token a is 0");
        tokenBConfigs[tokenB] = config;
        tokenBConfigs[tokenB].bExist = true;
    }

    function calcFee(address tokenA, ActionType actionType, uint amount) external view override returns(uint) {
        return amount * tokenAFeeConfig[tokenA][actionType].feeRatio / FeeRatioBase;
    }

    function calcAddFee(address tokenA, ActionType actionType, uint amount) external view override returns(uint) {
        uint addFee =  amount * FeeRatioBase / (FeeRatioBase - tokenAFeeConfig[tokenA][actionType].feeRatio);
        if ((amount * FeeRatioBase)%(FeeRatioBase - tokenAFeeConfig[tokenA][actionType].feeRatio) > 0) {
            addFee += 1;
        }
        return addFee;
    }

    function handleFee(address tokenA, ActionType actionType, uint fee, address user) external override {
        if (fee > 0) {
            require(IERC20(usdtToken).balanceOf(address(this)) >= fee, "UH:usdt amount error");
            uint userAmount = fee * tokenAFeeConfig[tokenA][actionType].fee4UserRatio / FeeRatioBase;
            require(userAmount <= fee, "invalide token config");
            uint bAmount = _swapUsdtForBToken(fee, user, userAmount);
            emit SwapUSDT4BToken(user, address(this), fee, bAmount);
        }
    }

    function _swapUsdtForBToken(uint usdtAmt, address user, uint userAmount) internal returns(uint bAmt) {
        uint beforeBAmount = ITokenBInterface(bToken).balanceOf(address(this));
        address token0 = ITokenBPool(bPair).token0();
        (uint112 reserve0, uint112 reserve1,) = ITokenBPool(bPair).getReserves();

        (uint reserveB, uint reserveU) = token0 == bToken ? (uint(reserve0), uint(reserve1)) : (uint(reserve1), uint(reserve0));
        uint bAmount = userAmount * reserveB / reserveU;

        ITokenBInterface(bToken).mint(user, bAmount);
        TransferHelper.safeTransfer(usdtToken, bPair, usdtAmt);
        ITokenBPool(bPair).sync();

        uint afterBAmount = ITokenBInterface(bToken).balanceOf(address(this));
        require(afterBAmount >= beforeBAmount);

        return afterBAmount - beforeBAmount;
    }

    function calcSellFee(address token, uint amountIn) external view override returns (uint) {
        require(tokenBConfigs[token].bExist  , "UH:config error");
        uint feeAmountRatio = tokenBConfigs[token].sellFeeRatio;
        return amountIn * feeAmountRatio / FeeRatioBase;
    }

    function calcSellAddFee(address token, uint amountIn) external view override returns (uint) {
        require(tokenBConfigs[token].bExist  , "UH:config error");
        uint feeAmountRatio = tokenBConfigs[token].sellFeeRatio;
        uint addFee = amountIn * FeeRatioBase / (FeeRatioBase - feeAmountRatio);
        if ((amountIn * FeeRatioBase) % (FeeRatioBase - feeAmountRatio) > 0) {
            addFee += 1;
        }
        return addFee;
    }
    
    function sellFeeToReward(address token, address user, uint usdtAmt) external override {
        require(tokenBConfigs[token].bExist, "UH:config error");
        if (tokenBConfigs[token].bExist) {
            sellBFeeToReward(token, user, usdtAmt);
        }
    }

    function sellBFeeToReward(address tokenB, address user, uint usdtAmt) internal {
        UsdtBTokenConfig storage config = tokenBConfigs[tokenB];
        require(config.bExist, "UH:config error");

        uint amountFeeTotal = usdtAmt * config.sellFeeRatio / FeeRatioBase;
        if (amountFeeTotal <= 0) {
            return;
        }

        uint amt4BLP = amountFeeTotal * config.sellToBPoolRatio / FeeRatioBase;
        if (amt4BLP > 0) {
            TransferHelper.safeTransfer(usdtToken, config.sellToBPoolAddr, amt4BLP);
            IBananaSwapPair(config.sellToBPoolAddr).sync();
            emit SellRewardUsdt(user, address(this), config.sellToBPoolAddr, amt4BLP);
        }

        for (uint index; index < config.sellShareRatios.length; ++index) {
            uint amtFee = amountFeeTotal * config.sellShareRatios[index] / FeeRatioBase;
            if (amtFee > 0) {
                TransferHelper.safeTransfer(usdtToken, config.sellShareAddrs[index], amtFee);
                emit SellRewardUsdt(user, address(this), config.sellShareAddrs[index], amtFee);
            }
        }
    }
    
}
