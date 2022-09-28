
//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IUSDTFeeHandle {
    event SwapUSDT4BToken(address indexed user, address indexed uHandler, uint uAmt, uint bAmt);
    event SwapUSDT4RewardToken(address indexed user, address indexed uHandler, uint uAmt, uint bAmt);
    event BuyRewardBToken(address indexed user, address indexed uHandler, address indexed to, uint bAmt);
    event BuyRewardBToken4User(address indexed user, address indexed uHandler, address indexed to, uint bAmt);
    event SellRewardUsdt(address indexed user, address indexed uHandler, address indexed bpool, uint uAmt);
    event AddLiquidRewardBToken(address indexed user, address indexed uHandler, address indexed to, uint bAmt);
    event AddLiquidRewardBToken4User(address indexed user, address indexed uHandler, address indexed to, uint bAmt);
    event RemoveLiquidRewardUsdt(address indexed user, address indexed uHandler, address indexed bpool, uint uAmt);

    enum ActionType {
        Buy,         // 0
        Sell,        // 1
        AddLiquid,   // 2
        RemoveLiquid // 3
    }

    struct FeeConfig {
        uint feeRatio;
        uint fee4UserRatio;
        ActionType actionType;
    }

    struct UsdtBTokenConfig {
        uint sellFeeRatio;
        uint sellToBPoolRatio;
        address sellToBPoolAddr;
        uint[] sellShareRatios;
        address[] sellShareAddrs;
        bool bExist;
    }
    
    function setBConfig(address tokenB, UsdtBTokenConfig memory config) external;
    function calcSellFee(address token, uint amountIn) external view returns (uint);
    function calcSellAddFee(address token, uint amountOut) external view returns(uint);
    function sellFeeToReward(address token, address user, uint usdtAmt) external;

    function setAFeeConfig(address tokenA, ActionType actionType, FeeConfig memory config, bool opt) external;
    function calcFee(address tokenA, ActionType actionType, uint amount) external view returns(uint);
    function calcAddFee(address tokenA, ActionType actionType, uint amount) external view returns(uint);
    function handleFee(address tokenA, ActionType actionType, uint fee, address user) external;
}