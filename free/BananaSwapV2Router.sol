// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity =0.8.4;

//solhint-disable not-rely-on-time
//solhint-disable var-name-mixedcase
//solhint-disable reason-string

import "./interfaces/IBananaSwapFactory.sol";
import "./banana/FeeHandler.sol";
import "./libraries/TransferHelper.sol";

import "./interfaces/IBananaSwapRouter.sol";
import "./libraries/BananaSwapLibrary.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/ITokenAFeeHandler.sol";
import "./UniswapV2Router.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//import "hardhat/console.sol";

contract BananaSwapV2Router is IBananaSwapRouter,OwnableUpgradeable {
    address public override factory;
    address public override WETH;
    ITokenManager public tokenManager;
    address public delegator;

    function setDelegator(address _delegator)public onlyManager{
        delegator = _delegator;
    }

    function setTokenManager(ITokenManager _tokenManager)public onlyManager{
        tokenManager = _tokenManager;
    }
    mapping(address => bool) public isManager;
    //onlyManager
    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    //onlyManager
    modifier onlyDelegator() {
        require(delegator == _msgSender(), "Not Delegator");
        _;
    }

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, ": EXPIRED");
        _;
    }

    function initialize(address _factory, address _WETH,ITokenManager _tokenManager,address _delegator) public initializer{
        __Ownable_init();
        factory = _factory;
        WETH = _WETH;
        tokenManager = _tokenManager;
        delegator = _delegator;
        isManager[_msgSender()] = true;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal virtual returns (uint256 amountA, uint256 amountB) {
        // create the pair if it doesn't exist yet
        if (IBananaSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IBananaSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = BananaSwapLibrary.getReserves(
            factory,
            tokenA,
            tokenB
        );
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = BananaSwapLibrary.quote(
                amountADesired,
                reserveA,
                reserveB
            );
            if (amountBOptimal <= amountBDesired) {
                require(
                    amountBOptimal >= amountBMin,
                    "BananaSwap: INSUFFICIENT_B_AMOUNT"
                );
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = BananaSwapLibrary.quote(
                    amountBDesired,
                    reserveB,
                    reserveA
                );
                assert(amountAOptimal <= amountADesired);
                require(
                    amountAOptimal >= amountAMin,
                    "BananaSwap: INSUFFICIENT_A_AMOUNT"
                );
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (
            uint256 amountA,
            uint256 amountB,
            uint256 liquidity
        )
    {
        (amountA, amountB) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        // TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        // TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IBananaSwapPair(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        )
    {
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        assert(IWETH(WETH).transfer(pair, amountETH));
        liquidity = IBananaSwapPair(pair).mint(to);
        // refund dust eth, if any
        if (msg.value > amountETH)
            TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 /* liquidity */,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        public
        virtual
        override
        ensure(deadline)
        onlyDelegator
        returns (uint256 amountA, uint256 amountB)
    {
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        // IBananaSwapPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint256 amount0, uint256 amount1) = IBananaSwapPair(pair).burn(to);
        (address token0, ) = BananaSwapLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0
            ? (amount0, amount1)
            : (amount1, amount0);
        require(
            amountA >= amountAMin,
            "BananaSwap: INSUFFICIENT_A_AMOUNT"
        );
        require(
            amountB >= amountBMin,
            "BananaSwap: INSUFFICIENT_B_AMOUNT"
        );
    }

    function removeLiquidityETH(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        public
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountETH)
    {
        (amountToken, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint256 amountA, uint256 amountB) {
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IBananaSwapPair(pair).permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );
        (amountA, amountB) = removeLiquidity(
            tokenA,
            tokenB,
            liquidity,
            amountAMin,
            amountBMin,
            to,
            deadline
        );
    }

    function removeLiquidityETHWithPermit(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        external
        virtual
        override
        returns (uint256 amountToken, uint256 amountETH)
    {
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IBananaSwapPair(pair).permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );
        (amountToken, amountETH) = removeLiquidityETH(
            token,
            liquidity,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
    }

    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) public virtual override ensure(deadline) returns (uint256 amountETH) {
        (, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(
            token,
            to,
            IERC20(token).balanceOf(address(this))
        );
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }

    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint256 amountETH) {
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        uint256 value = approveMax ? type(uint256).max : liquidity;
        IBananaSwapPair(pair).permit(
            msg.sender,
            address(this),
            value,
            deadline,
            v,
            r,
            s
        );
        amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
            token,
            liquidity,
            amountTokenMin,
            amountETHMin,
            to,
            deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair 
    function _swap(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? BananaSwapLibrary.pairFor(factory, output, path[i + 2])
                : _to;
            //检查是否需要调用
            bool isTokenAReduce = false;
            uint256 feeAmount = 0;
            address feeHandler;
            uint256 amountIn = amounts[i];
            if(tokenManager.isTokenA(input)){
                ITokenAFeeHandler.FeeConfig memory feeConfig = ITokenAFeeHandler(input).getFeeConfig(ITokenAFeeHandler.ActionType.SellReduce,ITokenAFeeHandler.FeeType.reduceRatio);
                if(feeConfig.feeRatio > 0){
                    isTokenAReduce = true;
                    feeAmount = amountIn*feeConfig.feeRatio/ITokenAFeeHandler(input).getBase();
                    feeHandler = feeConfig.feeHandler;
                }
            }
            if(isTokenAReduce){
                IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output))
                    .swapTokenAReduce(amount0Out, amount1Out, to, new bytes(0),feeAmount,feeHandler);
            }else{
                IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output))
                    .swap(amount0Out, amount1Out, to, new bytes(0), msg.sender);
            }
        }
    }

    // 处理卖出扣除滑点⼿续费后剩余销毁
    //deprecate
    // requires the initial amount to have already been sent to the first pair
    // function _swap_sell_tokenA(
    //     uint256[] memory amounts,
    //     address[] memory path,
    //     address _to,
    //     uint256 feeAmount,
    //     address feeHandler
    // ) internal virtual {
    //     for (uint256 i; i < path.length - 1; i++) {
    //         (address input, address output) = (path[i], path[i + 1]);
    //         (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
    //         uint256 amountOut = amounts[i + 1];
    //         (uint256 amount0Out, uint256 amount1Out) = input == token0
    //             ? (uint256(0), amountOut)
    //             : (amountOut, uint256(0));
    //         address to = i < path.length - 2
    //             ? BananaSwapLibrary.pairFor(factory, output, path[i + 2])
    //             : _to;
    //         IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output))
    //             .swapTokenA(amount0Out, amount1Out, to, new bytes(0),feeAmount,feeHandler);
    //         //the Fee transfer to blackhole directly.The fee handler not need to be invoked
    //         // FeeHandler(feeHandler).handleFee(path[0],feeAmount);
    //     }
    // }
    // // **** SWAP ****
    // // requires the initial amount to have already been sent to the first pair
    // function _swap_tokenA(
    //     uint256[] memory amounts,
    //     address[] memory path,
    //     address _to,
    //     uint256[] memory feeAmounts,
    //     address[] memory feeHandlers,
    //     ITokenAFeeHandler.ActionType[] memory actionTypes
    // ) internal virtual {
    //     address feeHandler;
    //     uint256 j;
    //     for (uint256 i; i < path.length - 1; i++) {
    //         j++;
    //         (address input, address output) = (path[i], path[i + 1]);
    //         (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
    //         uint256 amountOut = amounts[i + 1];
    //         (uint256 amount0Out, uint256 amount1Out) = input == token0
    //             ? (uint256(0), amountOut)
    //             : (amountOut, uint256(0));
    //         address to = i < path.length - 2
    //             ? BananaSwapLibrary.pairFor(factory, output, path[i + 2])
    //             : _to;
    //         //判断换出来是否token是否需要处理手续费。
    //         if(feeAmounts[j] > 0||feeAmounts[j+1] > 0){
    //             feeHandler = feeHandlers[j];
    //         }
    //         uint256 feeAmountj = feeAmounts[j]+feeAmounts[j+1];
    //         IBananaSwapPair(BananaSwapLibrary.pairFor(factory, input, output))
    //             .swapWithFee(amount0Out+feeAmountj, amount1Out+feeAmountj, to, new bytes(0),feeHandlers[j],feeAmountj);
    //         //处理换出来的手续费。手续费已经通过swap转移到了feeHandler了。
    //         if(feeAmounts[j] > 0){
    //             if(ITokenManager(tokenManager).isTokenA(feeHandlers[j])){
    //                 ITokenAFeeHandler(feeHandlers[j]).handleDeductFee(actionTypes[j],feeAmounts[j]);
    //             }
    //         }
    //         //如果还有下一个交易路由。
    //         if(i+1<path.length - 1){
    //             j++;
    //             if(feeAmounts[j] > 0){
    //                 if(ITokenManager(tokenManager).isTokenA(feeHandlers[j])){
    //                     ITokenAFeeHandler(feeHandlers[j]).handleDeductFee(actionTypes[j],feeAmounts[j]);
    //                 }
    //             }
    //         }
    //     }
    // }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 /* amountOutMin */,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        amounts = BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
        // require(
        //     amounts[amounts.length - 1] >= amountOutMin,
        //     "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        // );
        // TransferHelper.safeTransferFrom(
        //     path[0],
        //     msg.sender,
        //     BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //     amounts[0]
        // );
        _swap(amounts, path, to);
    }


    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        amounts = BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
        require(
            amounts[0] <= amountInMax,
            "BananaSwap: EXCESSIVE_INPUT_AMOUNT"
        );
        // TransferHelper.safeTransferFrom(
        //     path[0],
        //     msg.sender,
        //     BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //     amounts[0]
        // );
        _swap(amounts, path, to);
    }

    function swapExactETHForTokens(
        uint256 amountIn,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        // require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        amounts = BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
        // require(
        //     amounts[amounts.length - 1] >= amountOutMin,
        //     "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        // );
        // IWETH(WETH).deposit{value: amounts[0]}();
        // assert(
        //     IWETH(WETH).transfer(
        //         BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //         amounts[0]
        //     )
        // );
        _swap(amounts, path, to);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 /* amountInMax */,
        address[] calldata path,
        address /* to */,
        uint256 deadline
    )
        external
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        // require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        amounts = BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
        // require(
        //     amounts[0] <= amountInMax,
        //     "BananaSwap: EXCESSIVE_INPUT_AMOUNT"
        // );
        // TransferHelper.safeTransferFrom(
        //     path[0],
        //     msg.sender,
        //     BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //     amounts[0]
        // );
        _swap(amounts, path, address(this));
        // IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        // TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        amounts = BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        // TransferHelper.safeTransferFrom(
        //     path[0],
        //     msg.sender,
        //     BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //     amounts[0]
        // );
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
    }

    function swapETHForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        override
        onlyDelegator
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        // require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        amounts = BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
        // require(
        //     amounts[0] <= msg.value,
        //     "BananaSwap: EXCESSIVE_INPUT_AMOUNT"
        // );
        // IWETH(WETH).deposit{value: amounts[0]}();
        // assert(
        //     IWETH(WETH).transfer(
        //         BananaSwapLibrary.pairFor(factory, path[0], path[1]),
        //         amounts[0]
        //     )
        // );
        _swap(amounts, path, to);
        // refund dust eth, if any
        // if (msg.value > amounts[0])
        //     TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(
        address[] memory path,
        address _to
    ) internal virtual {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
            IBananaSwapPair pair = IBananaSwapPair(
                BananaSwapLibrary.pairFor(factory, input, output)
            );
            uint256 amountInput;
            uint256 amountOutput;
            {
                // scope to avoid stack too deep errors
                (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
                (uint256 reserveInput, uint256 reserveOutput) = input == token0
                    ? (reserve0, reserve1)
                    : (reserve1, reserve0);
                amountInput =
                    IERC20(input).balanceOf(address(pair)) -
                    reserveInput;
                amountOutput = BananaSwapLibrary.getAmountOut(
                    amountInput,
                    reserveInput,
                    reserveOutput
                );
            }
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOutput)
                : (amountOutput, uint256(0));
            address to = i < path.length - 2
                ? BananaSwapLibrary.pairFor(factory, output, path[i + 2])
                : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0), msg.sender);
        }
    }

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            BananaSwapLibrary.pairFor(factory, path[0], path[1]),
            amountIn
        );
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >=
                amountOutMin,
            "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        );
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable virtual override ensure(deadline) {
        require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        uint256 amountIn = msg.value;
        IWETH(WETH).deposit{value: amountIn}();
        assert(
            IWETH(WETH).transfer(
                BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                amountIn
            )
        );
        uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >=
                amountOutMin,
            "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        );
    }

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual override ensure(deadline) {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            BananaSwapLibrary.pairFor(factory, path[0], path[1]),
            amountIn
        );
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint256 amountOut = IERC20(WETH).balanceOf(address(this));
        require(
            amountOut >= amountOutMin,
            "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        IWETH(WETH).withdraw(amountOut);
        TransferHelper.safeTransferETH(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        uint256 amountA,
        uint256 reserveA,
        uint256 reserveB
    ) public pure virtual override returns (uint256 amountB) {
        return BananaSwapLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountOut) {
        return BananaSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure virtual override returns (uint256 amountIn) {
        return BananaSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint256[] memory amounts)
    {
        return BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        virtual
        override
        onlyDelegator
        returns (uint256[] memory amounts)
    {
        
        return BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
    }
}
