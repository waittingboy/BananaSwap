//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/IBananaSwapPair.sol";
import "../interfaces/IOracle.sol";
import "../libraries/UniswapOracleLibrary.sol";
import "../libraries/BananaSwapLibrary.sol";
// //import "hardhat/console.sol";

// fixed window oracle that recomputes the average price for the entire period once every period
// note that the price average is only guaranteed to be over at least 1 period, but may be over a longer period
contract ExampleOracleSimple is IOracle, OwnableUpgradeable {
    using FixedPoint for *;

    uint public constant PERIOD = 1 hours;

    IBananaSwapPair public pair;
    address public token0;
    address public token1;

    uint    public price0CumulativeLast;
    uint    public price1CumulativeLast;
    uint32  public blockTimestampLast;
    FixedPoint.uq112x112 public price0Average;
    FixedPoint.uq112x112 public price1Average;
    uint224 public tokenAUsdtPrice;
    bool public tokenAIsToken0;
    

    mapping(address => bool) public isManager;
    //onlyManager
    modifier onlyManager() {
        require(isManager[msg.sender], "Not manager");
        _;
    }


    function initialize(address /* factory */, address tokenA, address usdt,IBananaSwapPair _pair,uint224 _tokenAUsdtPrice)public initializer{
        __Ownable_init();
        (token0,) = BananaSwapLibrary.sortTokens(tokenA, usdt);

        // IBananaSwapPair _pair = IUniswapV2Pair(BananaSwapLibrary.pairFor(factory, tokenA, usdt));
        pair = _pair;
        // (reserve0, reserve1, blockTimestampLast) = _pair.getReserves();
        // require(reserve0 != 0 && reserve1 != 0, "NO_RESERVES"); // ensure that there"s liquidity in the pair

        isManager[msg.sender] = true;
        tokenAUsdtPrice = _tokenAUsdtPrice;
        if(tokenA == token0){
            tokenAIsToken0 = true;
        }else{
            tokenAIsToken0 = false;
        }
    }

    function update() external {
        (uint price0Cumulative, uint price1Cumulative, uint32 blockTimestamp) =
            UniswapOracleLibrary.currentCumulativePrices(address(pair));
        uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired

        // ensure that at least one full period has passed since the last update
        require(timeElapsed >= PERIOD, "ExampleOracleSimple: PERIOD_NOT_ELAPSED");

        // overflow is desired, casting never truncates
        // cumulative price is in (uq112x112 price * seconds) units so we simply wrap it after division by time elapsed
        price0Average = FixedPoint.uq112x112(uint224((price0Cumulative - price0CumulativeLast) / timeElapsed));
        price1Average = FixedPoint.uq112x112(uint224((price1Cumulative - price1CumulativeLast) / timeElapsed));

        price0CumulativeLast = price0Cumulative;
        price1CumulativeLast = price1Cumulative;
        blockTimestampLast = blockTimestamp;
    }

    //every half day to update
    function updateTokenAprice()external onlyManager{
        (uint224 price0, uint224 price1) = UniswapOracleLibrary.currentTokenAUsdtPrice(pair);
        if(tokenAIsToken0){
            tokenAUsdtPrice = price0;
        }else{
            tokenAUsdtPrice = price1;
        }
    }

    //every half day to update
    function getTokenAprice()external view returns(uint price){
        (uint224 price0, uint224 price1) = UniswapOracleLibrary.currentTokenAUsdtPrice(pair);
        if(tokenAIsToken0){
            price = price0;
        }else{
            price = price1;
        }
    }

    // 计算价格变化。
    function getPriceChangeRatio()external override view returns(uint256 priceChangeRatio){
        (uint224 price0, uint224 price1) = UniswapOracleLibrary.currentTokenAUsdtPrice(pair);
        if(tokenAIsToken0){
            priceChangeRatio = tokenAUsdtPrice > price0?(tokenAUsdtPrice - price0)*100/tokenAUsdtPrice:0;
        }else{
            priceChangeRatio = tokenAUsdtPrice > price1?(tokenAUsdtPrice - price1)*100/tokenAUsdtPrice:0;
        }
        return priceChangeRatio;
    }

    // note this will always return 0 before update has been called successfully for the first time.
    function consult(address token, uint amountIn) external view returns (uint amountOut) {
        if (token == token0) {
            amountOut = price0Average.mul(amountIn).decode144();
        } else {
            require(token == token1, "ExampleOracleSimple: INVALID_TOKEN");
            amountOut = price1Average.mul(amountIn).decode144();
        }
    }
}
