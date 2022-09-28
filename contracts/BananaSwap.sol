//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./libraries/TransferHelper.sol";
import "./interfaces/ITokenAFeeHandler.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "./libraries/BananaSwapLibrary.sol";
import "./interfaces/IBkWeList.sol";
import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/TokenAIERC20.sol";
//import "hardhat/console.sol";

interface IBananaQuery {
    function quote(address tokenA, address tokenB, uint256 amountA, address user) external view returns (uint256 amountB);
    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut ) external pure returns (uint amountOut);
    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut ) external pure returns (uint amountIn);
    function getAmountsOut(uint256 amountIn, address[] memory path, address user) external view returns (uint256[] memory amounts);
    function getAmountsIn(uint256 amountOut, address[] memory path, address user) external view returns (uint256[] memory amounts);
}

contract BananaSwap is Initializable, OwnableUpgradeable {
    using SafeMath for uint;

    address public factory;
    address public WETH;

    mapping(address => bool) public isManager;

    ITokenManager public tokenManager;
    IUSDTFeeHandle public usdtFeeHandle;
    IBananaQuery public bananaQuery;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, "BananaSwap: EXPIRED");
        _;
    }

    // constructor(address _factory, address _WETH)  {
    //     factory = _factory;
    //     WETH = _WETH;
    // }

    function initialize(address _factory, address _WETH, address _tokenManager, address _usdtFeeHandle) public initializer {
        __Ownable_init();
        factory = _factory;
        WETH = _WETH;
        isManager[_msgSender()] = true;
        tokenManager = ITokenManager(_tokenManager);
        usdtFeeHandle = IUSDTFeeHandle(_usdtFeeHandle);
    }

    function setTokenManager(ITokenManager _tokenManager)public onlyManager{
        tokenManager = _tokenManager;
    }

    function setUsdtFeeHandle(address _usdtFeeHandle) external onlyManager {
        require(_usdtFeeHandle != address(0), "USDTFeeHandle zero address");
        usdtFeeHandle = IUSDTFeeHandle(_usdtFeeHandle);
    }

    function setBananaQuery(address _bananaQuery) external onlyManager {
        require(_bananaQuery != address(0), "bananaQuery zero address");
        bananaQuery = IBananaQuery(_bananaQuery);
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    function caculateTokenAFee( address tokenPath, uint256 amountIn, ITokenAFeeHandler.ActionType actionType ) internal view returns (uint256 deductFeeLeftAmount) {
        deductFeeLeftAmount = amountIn;
        if (tokenManager.isTokenA(tokenPath)) {
            deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee( actionType, amountIn );
        }
    }
    function isTokenANeedFee(address tokenA) internal view returns(bool need) {
        return tokenManager.isTokenA(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender);
    }
    function isTokenAUsdtNeedFee(address tokenUsdt, address tokenA) internal view returns(bool need) {
        return tokenManager.isUsdt(tokenUsdt) 
            && tokenManager.isTokenA(tokenA) 
            && tokenManager.isAssociateWithB(tokenA) 
            && !IBkWeList(tokenA).isWeList(msg.sender);
    }
    function isNeedFee(address[] memory path) internal view returns (bool isUseFee) {
        for (uint256 index = 0; index < path.length; index++) {
            if (tokenManager.isTokenA(path[index]) && !IBkWeList(path[index]).isWeList(msg.sender)) {
                require(!IBkWeList(path[index]).isBkList(msg.sender), "IN_BKLIST");
                isUseFee = true;
            }
        }
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path,address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            {
                // token -> pair
                // TransferHelper.safeTransfer( path[i], BananaSwapLibrary.pairFor(factory, path[i], path[i + 1]), amounts[i]);
                (address input, address output) = (path[i], path[i + 1]);
                (address token0,) = BananaSwapLibrary.sortTokens(input, output);
                IBananaSwapPair pair = IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output));
                uint amountOut = amounts[i + 1];
                address to = i < path.length - 2 ? BananaSwapLibrary.pairFor(factory, output, path[i + 2]) : _to;
                bool isNeedReduce = false;
                ITokenAFeeHandler.FeeConfig memory feeConfig;
                uint feeAmount;
                if (tokenManager.isTokenA(input)) {
                    feeConfig = ITokenAFeeHandler(input).getFeeConfig(ITokenAFeeHandler.ActionType.SellReduce,ITokenAFeeHandler.FeeType.reduceRatio);
                    if(feeConfig.feeRatio > 0){
                        feeAmount = amounts[i]*feeConfig.feeRatio/ITokenAFeeHandler(input).getBase();
                        (uint112 _reserve0, uint112 _reserve1,) = pair.getReserves();
                        uint112 inputReserve = input == token0?_reserve0:_reserve1;
                        uint reduceThreshold = ITokenAFeeHandler(input).getReduceThreshold();
                        if(feeConfig.feeRatio > 0&&inputReserve >reduceThreshold){
                            isNeedReduce = true;
                        }
                    }
                }
                (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
                if (isTokenANeedFee(input) && isNeedReduce) {
                    pair.swapTokenAReduce(amount0Out, amount1Out, to, new bytes(0), feeAmount, feeConfig.feeHandler,msg.sender);
                } else {
                    pair.swap(amount0Out, amount1Out, to, new bytes(0), msg.sender);
                }                
                amounts[i + 1] = amount0Out > 0 ? amount0Out : amount1Out;
            }
        }
        for (uint j; j < path.length; ++j) {
            if (tokenManager.isTokenA(path[j]) && !IBkWeList(path[j]).isWeList(msg.sender)) {
                ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.Buy);
                ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.Sell);
                ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.AddLiquid);
                ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.RemoveLiquid);
            }
        }
    }

    // function deductTokenAFee(address tokenPath, uint256 amountIn, ITokenAFeeHandler.ActionType actionType,IBananaSwapPair pair ) internal returns (uint256 deductFeeLeftAmount) {
    //     deductFeeLeftAmount = amountIn;
    //     if (tokenManager.isTokenA(tokenPath)) {
    //         TokenAIERC20(tokenPath).transferFee(address(pair),amountIn,actionType);
    //         deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee( actionType, amountIn );
    //         // uint256 feeAmount = amountIn - deductFeeLeftAmount;
    //         // if (feeAmount > 0) {
    //         //     TransferHelper.safeTransfer(tokenPath, tokenPath, feeAmount);
    //         //     ITokenAFeeHandler(tokenPath).handleDeductFee(actionType, feeAmount);
    //         // }
    //     }
    // }

    function checkTokenATransaction(address[]memory path) internal view {
        for (uint256 i = 0; i < path.length ; i++) {
            if(tokenManager.isTokenA(path[i])){              
                ITokenAFeeHandler(path[i]).validateBk(msg.sender);
            }
            // if(tokenManager.isTokenA(path[i+1])){                               
            //     ITokenAFeeHandler(path[i+1]).validateBk(msg.sender);
            // }
        }
    }
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual  ensure(deadline) returns (uint[] memory amounts) {
        checkTokenATransaction(path);
        amounts = bananaQuery.getAmountsOut(amountIn, path, msg.sender);
        require(amounts[amounts.length - 1] >= amountOutMin, "BS:INSUFFICIENT_OUTPUT_AMOUNT");
        if (isTokenANeedFee(path[0])) {
            ITokenAFeeHandler(path[0]).transferFromFee(msg.sender,BananaSwapLibrary.pairFor(factory, path[0], path[1]),amountIn,ITokenAFeeHandler.ActionType.Sell,msg.sender);
        } else if (isTokenAUsdtNeedFee(path[0], path[1])) {
            uint256 feeAmt = usdtFeeHandle.calcFee(path[1], IUSDTFeeHandle.ActionType.Buy, amounts[0]);
            if (feeAmt > 0) {
                TransferHelper.safeTransferFrom(path[0], msg.sender, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(path[1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
                amounts[0] = amounts[0] - feeAmt;
            }
            IERC20(path[0]).transferFrom(msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        } else {
            IERC20(path[0]).transferFrom(msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amountIn);
        }
        _swap(amounts, path, to);
    }
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual  ensure(deadline) returns (uint[] memory amounts) {
        checkTokenATransaction(path);
        amounts = bananaQuery.getAmountsIn(amountOut, path,msg.sender);
        require( amounts[0] <= amountInMax, "BananaSwap: EXCESSIVE_INPUT_AMOUNT" );
        if(isTokenANeedFee(path[0])){
            ITokenAFeeHandler(path[0]).transferFromFee(msg.sender,BananaSwapLibrary.pairFor(factory, path[0], path[1]),amounts[0],ITokenAFeeHandler.ActionType.Sell,msg.sender);
        } else if (isTokenAUsdtNeedFee(path[0], path[1])) {
            uint256 feeAmt = usdtFeeHandle.calcFee(path[1], IUSDTFeeHandle.ActionType.Buy, amounts[0]);
            if (feeAmt > 0) {
                TransferHelper.safeTransferFrom(path[0], msg.sender, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(path[1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
                amounts[0] = amounts[0] - feeAmt;
            }
            IERC20(path[0]).transferFrom(msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        }else{
            TransferHelper.safeTransferFrom(path[0], msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        }
        _swap(amounts, path, to);
    }
    function swapExactETHForTokens(
        uint amountOutMin, 
        address[] calldata path, 
        address to, 
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint[] memory amounts) {
        require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        amounts = bananaQuery.getAmountsOut(msg.value, path,msg.sender);
        require(amounts[amounts.length - 1] >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        return amounts;
    }
    
    function swapTokensForExactETH(
        uint amountOut, 
        uint amountInMax, 
        address[] calldata path, 
        address to, 
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        amounts = bananaQuery.getAmountsIn(amountOut, path,msg.sender);
        require(amounts[0] <= amountInMax, "BananaSwap: EXCESSIVE_INPUT_AMOUNT");
        if (isTokenANeedFee(path[0])) {
            ITokenAFeeHandler(path[0]).transferFromFee(msg.sender,BananaSwapLibrary.pairFor(factory, path[0], path[1]),amounts[0],ITokenAFeeHandler.ActionType.Sell,msg.sender);
        } else if (isTokenAUsdtNeedFee(path[0], path[1])) {
            uint256 feeAmt = usdtFeeHandle.calcFee(path[1], IUSDTFeeHandle.ActionType.Buy, amounts[0]);
            if (feeAmt > 0) {
                TransferHelper.safeTransferFrom(path[0], msg.sender, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(path[1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
                amounts[0] = amounts[0] - feeAmt;
            }
            IERC20(path[0]).transferFrom(msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        } else {
            TransferHelper.safeTransferFrom(path[0], msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        }
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        return amounts;
    }
    function swapExactTokensForETH(
        uint amountIn, 
        uint amountOutMin, 
        address[] calldata path, 
        address to, 
        uint deadline
    ) external virtual ensure(deadline) returns (uint[] memory amounts) {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        amounts = bananaQuery.getAmountsOut( amountIn, path,msg.sender);
        require(amounts[amounts.length - 1] >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");
        if (isTokenANeedFee(path[0])) {
            ITokenAFeeHandler(path[0]).transferFromFee(msg.sender,BananaSwapLibrary.pairFor(factory, path[0], path[1]),amounts[0],ITokenAFeeHandler.ActionType.Sell,msg.sender);
        } else if (isTokenAUsdtNeedFee(path[0], path[1])) {
            uint256 feeAmt = usdtFeeHandle.calcFee(path[1], IUSDTFeeHandle.ActionType.Buy, amounts[0]);
            if (feeAmt > 0) {
                TransferHelper.safeTransferFrom(path[0], msg.sender, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(path[1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
                amounts[0] = amounts[0] - feeAmt;
            }
            IERC20(path[0]).transferFrom(msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        } else {
            TransferHelper.safeTransferFrom(path[0], msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        }
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
        return amounts;
    }
    function swapETHForExactTokens(
        uint amountOut, 
        address[] calldata path, 
        address to, 
        uint deadline
    ) external virtual payable ensure(deadline) returns (uint[] memory amounts) {
        require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        amounts = bananaQuery.getAmountsIn( amountOut, path,msg.sender);
        require(amounts[0] <= msg.value, "BananaSwap: EXCESSIVE_INPUT_AMOUNT");
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(IWETH(WETH).transfer(BananaSwapLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
        return amounts;
    }
    // // **** SWAP (supporting fee-on-transfer tokens) ****
    // // requires the initial amount to have already been sent to the first pair
    // function _swapSupportingFeeOnTransferTokens(uint[] memory amounts, address[] memory path) internal virtual {
    //     for (uint i; i < path.length - 1; i++) {
    //         {
    //             // tokenA fee
    //             if(isTokenANeedFee(path[i])){
    //                 IBananaSwapPair pair = IBananaSwapPair(BananaSwapLibrary.pairFor(factory, path[i], path[i + 1]));
    //                 amounts[i] = deductTokenAFee(path[i], amounts[i], ITokenAFeeHandler.ActionType.Sell,pair);
    //             }
    //             // USDT -> A
    //             if (isTokenAUsdtNeedFee(path[i], path[i + 1])) {
    //                 uint256 feeAmt = usdtFeeHandle.calcFee(path[i + 1], IUSDTFeeHandle.ActionType.Buy, amounts[i]);
    //                 if (feeAmt > 0) {
    //                     TransferHelper.safeTransfer(path[i], address(usdtFeeHandle), feeAmt);
    //                     usdtFeeHandle.handleFee(path[i + 1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
    //                 }
    //                 amounts[i] = amounts[i] - feeAmt;
    //             }
    //         }
    //         (address input, address output) = (path[i], path[i + 1]);
    //         (address token0,) = BananaSwapLibrary.sortTokens(input, output);
    //         IBananaSwapPair pair = IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output));
    //         TransferHelper.safeTransfer(path[i], address(pair), amounts[i]);
    //         uint amountInput;
    //         uint amountOutput;
    //         { // scope to avoid stack too deep errors
    //             (uint reserve0, uint reserve1,) = pair.getReserves();
    //             (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    //             amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
    //             amountOutput = BananaSwapLibrary.getAmountOut(amountInput, reserveInput, reserveOutput);
    //         }
    //         (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
    //         // pair.swap(amount0Out, amount1Out, address(this), new bytes(0));
    //         if(isTokenANeedFee(input) && ITokenAFeeHandler(input).getFeeConfig(ITokenAFeeHandler.ActionType.SellReduce, ITokenAFeeHandler.FeeType.reduceRatio).feeRatio > 0) {
    //             ITokenAFeeHandler.FeeConfig memory feeConfig = ITokenAFeeHandler(input).getFeeConfig(ITokenAFeeHandler.ActionType.SellReduce,ITokenAFeeHandler.FeeType.reduceRatio);
    //             uint feeAmount = amountInput * feeConfig.feeRatio / ITokenAFeeHandler(input).getBase();
    //             pair.swapTokenAReduce(amount0Out, amount1Out, address(this), new bytes(0), feeAmount, feeConfig.feeHandler);
    //         } else {
    //             pair.swap( amount0Out, amount1Out, address(this), new bytes(0));
    //         }
    //         amounts[i + 1] = amount0Out > 0 ? amount0Out : amount1Out;

    //         {
    //             // tokenA fee
    //             if(isTokenANeedFee(path[i + 1])){
    //                 IBananaSwapPair pair = IBananaSwapPair(BananaSwapLibrary.pairFor(factory, path[i], path[i + 1]));
    //                 amounts[i + 1] = deductTokenAFee( path[i + 1], amounts[i + 1], ITokenAFeeHandler.ActionType.Buy,pair );
    //             }
    //             // A -> USDT
    //             if (isTokenAUsdtNeedFee(path[i + 1], path[i])) {
    //                 uint256 feeAmt = usdtFeeHandle.calcFee(path[i], IUSDTFeeHandle.ActionType.Sell, amounts[i + 1]);
    //                 if (feeAmt > 0) {
    //                     TransferHelper.safeTransfer(path[i + 1], address(usdtFeeHandle), feeAmt);
    //                     usdtFeeHandle.handleFee(path[i], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
    //                 }
    //                 amounts[i + 1] = amounts[i + 1] - feeAmt;
    //             }
    //         }
    //     }
        
    //     for (uint j; j < path.length; ++j) {
    //         if(tokenManager.isTokenA(path[j]) && !IBlackWhiteList(path[j]).isWhiteList(msg.sender)) {
    //             ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.Buy);
    //             ITokenAFeeHandler(path[j]).reflowDistributeFee(ITokenAFeeHandler.ActionType.Sell);
    //         }
    //     }
    // }
    // function _swapSupportingFeeOnTransferTokensNoFee(address[] memory path, address _to) internal virtual {
    //     for (uint256 i; i < path.length - 1; i++) {
    //         (address input, address output) = (path[i], path[i + 1]);
    //         (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
    //         IBananaSwapPair pair = IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output));
    //         uint256 amountInput;
    //         uint256 amountOutput;
    //         {
    //             // scope to avoid stack too deep errors
    //             (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
    //             (uint256 reserveInput, uint256 reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
    //             amountInput = IERC20(input).balanceOf(address(pair)) - reserveInput;
    //             amountOutput = BananaSwapLibrary.getAmountOut( amountInput, reserveInput, reserveOutput );
    //         }
    //         (uint256 amount0Out, uint256 amount1Out) = input == token0 ? (uint256(0), amountOutput) : (amountOutput, uint256(0));
    //         address to = i < path.length - 2 ? BananaSwapLibrary.pairFor(factory, output, path[i + 2]) : _to;
    //         pair.swap(amount0Out, amount1Out, to, new bytes(0));
    //     }
    // }
    // function swapExactTokensForTokensSupportingFeeOnTransferTokens(
    //     uint amountIn,
    //     uint amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint deadline
    // ) external virtual  ensure(deadline) {
    //     if (!isContainsTokenA(path)) {
    //         TransferHelper.safeTransferFrom(path[0], msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amountIn);
    //         uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    //         _swapSupportingFeeOnTransferTokensNoFee(path, to);
    //         require(IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");
    //         return;
    //     }
    //     {
    //         checkTokenATransaction(path);
    //         TransferHelper.safeTransferFrom( path[0], msg.sender, address(this), amountIn );
    //         uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(address(this));
    //         uint[] memory amounts = new uint[](path.length);
    //         amounts[0] = amountIn;
    //         _swapSupportingFeeOnTransferTokens(amounts, path);
    //         require(
    //             IERC20(path[path.length - 1]).balanceOf(address(this)).sub(balanceBefore) >= amountOutMin,
    //             "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    //         );
    //         TransferHelper.safeTransfer(path[path.length - 1], to, amounts[path.length - 1]);
    //     }
    // }
    // function swapExactETHForTokensSupportingFeeOnTransferTokens(
    //     uint amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint deadline
    // ) external virtual payable ensure(deadline) {
    //     require(path[0] == WETH, "BananaSwap: INVALID_PATH");
    //     if (!isContainsTokenA(path)) {
    //         uint256 amountIn = msg.value;
    //         IWETH(WETH).deposit{value: amountIn}();
    //         assert( IWETH(WETH).transfer( BananaSwapLibrary.pairFor(factory, path[0], path[1]), amountIn ) );
    //         uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    //         _swapSupportingFeeOnTransferTokensNoFee(path, to);
    //         require( IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");
    //         return;
    //     }
    //     {
    //         checkTokenATransaction(path);
    //         uint amountIn = msg.value;
    //         IWETH(WETH).deposit{value: amountIn}();
    //         assert(IWETH(WETH).transfer(address(this), amountIn));
    //         uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    //         uint[] memory amounts = new uint[](path.length);
    //         amounts[0] = amountIn;
    //         _swapSupportingFeeOnTransferTokens(amounts, path);
    //         require(
    //             IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
    //             "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    //         );
    //         TransferHelper.safeTransfer(path[path.length - 1], to, amounts[path.length - 1]);
    //     }
    // }
    // function swapExactTokensForETHSupportingFeeOnTransferTokens(
    //     uint amountIn,
    //     uint amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint deadline
    // ) external virtual ensure(deadline) {
    //     require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
    //     if (!isContainsTokenA(path)) { 
    //         TransferHelper.safeTransferFrom( path[0], msg.sender, BananaSwapLibrary.pairFor(factory, path[0], path[1]), amountIn );
    //         _swapSupportingFeeOnTransferTokensNoFee(path, address(this));
    //         uint256 amountOut = IERC20(WETH).balanceOf(address(this));
    //         require( amountOut >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT" );
    //         IWETH(WETH).withdraw(amountOut);
    //         TransferHelper.safeTransferETH(to, amountOut);
    //         return;
    //     }
    //     {
    //         checkTokenATransaction(path);
    //         TransferHelper.safeTransferFrom( path[0], msg.sender, address(this), amountIn );
    //         uint[] memory amounts = new uint[](path.length);
    //         amounts[0] = amountIn;
    //         _swapSupportingFeeOnTransferTokens(amounts, path);
    //         uint amountOut = IERC20(WETH).balanceOf(address(this));
    //         require(amountOut >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");
    //         IWETH(WETH).withdraw(amountOut);
    //         TransferHelper.safeTransferETH(to, amountOut);
    //     }
        
    // // }
}
