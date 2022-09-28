// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity ^0.8.4;

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
import "./interfaces/IBkWeList.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
//import "hardhat/console.sol";

contract BananaSwapV2RouterDelegator is OwnableUpgradeable {
    address public factory;
    address public WETH;
    ITokenManager public tokenManager;
    IBananaSwapRouter public bananaSwapRouter;
    IUSDTFeeHandle public usdtFeeHandle;

    function setTokenManager(ITokenManager _tokenManager) public onlyManager {
        tokenManager = _tokenManager;
    }

    mapping(address => bool) public isManager;
    //onlyManager
    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }
    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "BananaSwap: EXPIRED");
        _;
    }

    // constructor(address _factory, address _WETH) {
    //     factory = _factory;
    //     WETH = _WETH;
    //     isManager[_msgSender()] = true;
    // }

    function initialize(
        ITokenManager _tokenManager,
        IBananaSwapRouter _uniswapRouter,
        address _factory,
        address _WETH
    ) public initializer {
        __Ownable_init();
        tokenManager = _tokenManager;
        bananaSwapV2Router = _uniswapV2Router;

        factory = _factory;
        WETH = _WETH;
        isManager[_msgSender()] = true;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    function setUsdtFeeHandle(address _usdtFeeHandle) external onlyManager {
        require(_usdtFeeHandle != address(0), "USDTFeeHandle zero address");
        usdtFeeHandle = IUSDTFeeHandle(_usdtFeeHandle);
    }

    function _swap( uint256[] memory amounts, address[] memory path, uint deadline) internal virtual {
        uint leftAmount = amounts[0];
        for (uint256 i = 0; i < path.length - 1; i++) {
            //计算扣减的手续费后剩余的量
            {
                if(tokenManager.isTokenA(path[i]) && !IBkWeList(path[i]).isWeList(msg.sender)){
                    leftAmount = deductTokenAFee(path[i], leftAmount, ITokenAFeeHandler.ActionType.Sell);
                }
                // USDT -> A
                if (tokenManager.isUsdt(path[i]) 
                    && tokenManager.isTokenA(path[i + 1]) 
                    && tokenManager.isAssociateWithB(path[i + 1])
                    && !IBkWeList(path[i + 1]).isWeList(msg.sender)) 
                {
                    // uint256 feeAmt = usdtFeeHandle.calcBuyFee(path[i + 1], leftAmount);
                    uint256 feeAmt = usdtFeeHandle.calcFee(path[i + 1], IUSDTFeeHandle.ActionType.Buy, leftAmount);
                    if (feeAmt > 0) {
                        TransferHelper.safeTransfer(path[i], address(usdtFeeHandle), feeAmt);
                        // usdtFeeHandle.buyFeeToReward(path[i + 1], _msgSender(), leftAmount);
                        usdtFeeHandle.handleFee(path[i + 1], IUSDTFeeHandle.ActionType.Buy, feeAmt, msg.sender);
                    }
                    leftAmount = leftAmount - feeAmt;
                }
            }
            {
                address[] memory pairePath = new address[](2);
                pairePath[0] = path[i];
                pairePath[1] = path[i + 1];
                TransferHelper.safeTransfer( path[i], BananaSwapLibrary.pairFor(factory, path[i], path[i+1]), leftAmount);
                leftAmount = bananaSwapV2Router.swapExactTokensForTokens( leftAmount, 0, pairePath, address(this), deadline)[1];
            }
            {
                //计算交换出来的量扣减手续费后的量。
                if(tokenManager.isTokenA(path[i+1]) && !IBkWeList(path[i+1]).isWeList(msg.sender)){
                    leftAmount = deductTokenAFee( path[i + 1], leftAmount, ITokenAFeeHandler.ActionType.Buy );
                }
                // A -> USDT
                if (tokenManager.isUsdt(path[i + 1]) 
                    && tokenManager.isTokenA(path[i])
                    && tokenManager.isAssociateWithB(path[i])
                    && !IBkWeList(path[i]).isWeList(msg.sender)) 
                {
                    // uint256 feeAmt = usdtFeeHandle.calcSellFee(path[i], leftAmount);
                    uint256 feeAmt = usdtFeeHandle.calcFee(path[i], IUSDTFeeHandle.ActionType.Sell, leftAmount);
                    if (feeAmt > 0) {
                        TransferHelper.safeTransfer(path[i + 1], address(usdtFeeHandle), feeAmt);
                        // usdtFeeHandle.sellFeeToReward(path[i], _msgSender(), leftAmount);
                        usdtFeeHandle.handleFee(path[i], IUSDTFeeHandle.ActionType.Sell, feeAmt, msg.sender);
                    }
                    leftAmount = leftAmount - feeAmt;
                }

                amounts[i + 1] = leftAmount;

            }
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual ensure(deadline) returns (uint256[] memory amounts) {
        if (!isContainsTokenA(path)) {
            TransferHelper.safeTransferFrom(
                path[0],
                msg.sender,
                BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                amountIn
            );            
            amounts = bananaSwapV2Router.swapExactTokensForTokens( amountIn, amountOutMin, path, to, deadline );
            return amounts;
        }

        //check tokenATransaction
        checkTokenATransaction(path);
        
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(this), amountIn);
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        _swap(amounts, path, deadline);
        amounts[0] = amountIn;
        require( amounts[amounts.length - 1] >= amountOutMin, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");

        IBananaSwapERC20(path[path.length - 1]).transfer(to, amounts[amounts.length - 1]);
        
    }
    function checkTokenATransaction(address[]memory path) private view {
        for (uint256 i = 0; i < path.length - 1; i++) {
            if(tokenManager.isTokenA(path[i])){              
                ITokenAFeeHandler(path[i]).checkSell(msg.sender);
            }
            if(tokenManager.isTokenA(path[i+1])){                               
                ITokenAFeeHandler(path[i+1]).checkBuy(msg.sender);
            }
        }
    }
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external virtual ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsIn(amountOut, path);
        if (!isContainsTokenA(path)) {
            require( amounts[0] <= amountInMax, "BananaSwap: EXCESSIVE_INPUT_AMOUNT" );
            TransferHelper.safeTransferFrom(
                path[0],
                msg.sender,
                BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                amounts[0]
            );
            return bananaSwapV2Router.swapTokensForExactTokens( amountOut, amountInMax, path, to, deadline );
        }
        //check tokenATransaction
        checkTokenATransaction(path);

        require(amounts[0] < amountInMax, "BananaSwap: EXCESSIVE_INPUT_AMOUNT");      
        TransferHelper.safeTransferFrom(path[0], msg.sender, address(this), amounts[0]);
        _swap(amounts, path, deadline);
        IBananaSwapERC20(path[path.length - 1]).transfer(to, amounts[amounts.length - 1]);
    }

    function deductTokenAFee(
        address tokenPath,
        uint256 amountIn,
        ITokenAFeeHandler.ActionType actionType
    ) internal returns (uint256 deductFeeLeftAmount) {
        deductFeeLeftAmount = amountIn;
        if (tokenManager.isTokenA(tokenPath)) {
            deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee(
                actionType,
                amountIn
            );
            
            uint256 feeAmount = amountIn - deductFeeLeftAmount;
            if (feeAmount > 0) {
                TransferHelper.safeTransfer(tokenPath, tokenPath, feeAmount);
                //分发手续费。
                distributeFee(tokenPath, feeAmount, actionType);
            }
        }
    }

    function caculateTokenAFee(
        address tokenPath,
        uint256 amountIn,
        ITokenAFeeHandler.ActionType actionType
    ) internal view returns (uint256 deductFeeLeftAmount) {
        deductFeeLeftAmount = amountIn;
        if (tokenManager.isTokenA(tokenPath)) {
            deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee(
                actionType,
                amountIn
            );
        }
    }

    function distributeFee(
        address token,
        uint256 amountIn,
        ITokenAFeeHandler.ActionType actionType
    ) private {
        ITokenAFeeHandler(token).handleDeductFee(actionType, amountIn,msg.sender);
    }


    // not included the uset token
    function isContainsTokenA(address[] memory path)
        public
        view
        returns (bool isTokenAOrUsdt)
    {
        for (uint256 index = 0; index < path.length; index++) {
            if (tokenManager.isTokenA(path[index])) {
                isTokenAOrUsdt = true;
            }
        }
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        virtual
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "BananaSwapLibrary: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            return BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
        }
        
        amounts = new uint256[](path.length);
        uint256 leftAmount = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            //先扣减输入的手续费
            {
                if (tokenManager.isTokenA(path[i])) {                    
                    if(!IBkWeList(path[i]).isWeList(msg.sender)){
                        leftAmount = ITokenAFeeHandler(path[i]).calDeductFee(
                            ITokenAFeeHandler.ActionType.Sell,
                            leftAmount
                        );
                    }
                }
                // USDT -> A
                if (tokenManager.isUsdt(path[i]) 
                    && tokenManager.isTokenA(path[i + 1])
                    && tokenManager.isAssociateWithB(path[i + 1])
                    && !IBkWeList(path[i + 1]).isWeList(msg.sender) ) 
                {
                    // uint256 feeAmount = usdtFeeHandle.calcBuyFee(path[i + 1], leftAmount);
                    uint256 feeAmount = usdtFeeHandle.calcFee(path[i + 1], IUSDTFeeHandle.ActionType.Buy, leftAmount);
                    leftAmount = leftAmount - feeAmount;
                }
            }
            amounts[i] = leftAmount;
            {
                address[] memory swapPath = new address[](2);
                swapPath[0] = path[i];
                swapPath[1] = path[i+1];
                leftAmount = BananaSwapLibrary.getAmountsOut(factory, leftAmount, swapPath)[1];
            }
            //计算扣减输出的费用
            {
                if (tokenManager.isTokenA(path[i+1])) {
                    if(!IBkWeList(path[i+1]).isWeList(msg.sender)){
                        leftAmount = ITokenAFeeHandler(path[i+1]).calDeductFee(
                            ITokenAFeeHandler.ActionType.Buy,
                            leftAmount
                        );
                    }
                }
                // A -> USDT 
                if (tokenManager.isUsdt(path[i+1]) 
                    && tokenManager.isTokenA(path[i])
                    && tokenManager.isAssociateWithB(path[i])
                    && !IBkWeList(path[i]).isWeList(msg.sender)) 
                {
                    // uint256 feeAmount = usdtFeeHandle.calcSellFee( path[i], leftAmount ); 
                    uint256 feeAmount = usdtFeeHandle.calcFee(path[i], IUSDTFeeHandle.ActionType.Sell, leftAmount);
                    leftAmount = leftAmount - feeAmount;
                }
                amounts[i+1] = leftAmount;
            }
        }
        amounts[0] = amountIn;
    }

    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        virtual
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "BananaSwapLibrary: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            return BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
        }

        amounts = new uint256[](path.length);
        uint256 beforeDecutAmount = amountOut;
        for (uint256 i = (path.length - 1); i > 0; i--) {
            //计算扣减输出的费用
            {
                amounts[i] = beforeDecutAmount;
                if (tokenManager.isTokenA(path[i])) {
                    if(!IBkWeList(path[i]).isWeList(msg.sender)){
                        beforeDecutAmount = ITokenAFeeHandler(path[i]).calAddFee(
                            ITokenAFeeHandler.ActionType.Buy,
                            beforeDecutAmount
                        );
                    }
                } 
                // A -> USDT
                if (tokenManager.isUsdt(path[i]) 
                    && tokenManager.isTokenA(path[i - 1]) 
                    && tokenManager.isAssociateWithB(path[i - 1])
                    && !IBkWeList(path[i - 1]).isWeList(msg.sender)) 
                {
                    // beforeDecutAmount = usdtFeeHandle.calcSellAddFee(path[i - 1], beforeDecutAmount);
                    beforeDecutAmount = usdtFeeHandle.calcAddFee(path[i - 1], IUSDTFeeHandle.ActionType.Sell, beforeDecutAmount);
                }
            }
            {
                address[] memory swapPath = new address[](2);
                swapPath[0] = path[i - 1];
                swapPath[1] = path[i];
                beforeDecutAmount = BananaSwapLibrary.getAmountsIn(factory, beforeDecutAmount, swapPath)[0];
            }
            {
                if (tokenManager.isTokenA(path[i-1])) {
                    if(!IBkWeList(path[i-1]).isWeList(msg.sender)){
                        beforeDecutAmount = ITokenAFeeHandler(path[i-1]).calAddFee(
                            ITokenAFeeHandler.ActionType.Sell,
                            beforeDecutAmount
                        );
                    }
                } 
                // USDT -> A
                if (tokenManager.isUsdt(path[i - 1]) 
                    && tokenManager.isTokenA(path[i]) 
                    && tokenManager.isAssociateWithB(path[i])
                    && !IBkWeList(path[i]).isWeList(msg.sender)) 
                {
                    // beforeDecutAmount = usdtFeeHandle.calcBuyAddFee( path[i], beforeDecutAmount );
                    beforeDecutAmount = usdtFeeHandle.calcAddFee(path[i], IUSDTFeeHandle.ActionType.Buy, beforeDecutAmount);

                }
                amounts[i-1] = beforeDecutAmount;
            }
        }
        amounts[path.length - 1] = amountOut;
    }

    function calcAddLiquid(
        address tokenA, 
        address tokenB, 
        uint256 amountADesired, 
        uint256 amountBDesired
    ) external view virtual returns(uint amountADesired_, uint amountBDesired_) {
        (uint256 _reserve0, uint256 _reserve1) = BananaSwapLibrary.getReserves(factory, tokenA, tokenB);
        if (_reserve0 == 0 && _reserve1 == 0) {
            return (amountADesired, amountBDesired);
        }

        uint amountBCalc = quote(tokenA, tokenB, amountADesired);
        (amountADesired_, amountBDesired_) = amountBCalc > amountBDesired ? (quote(tokenB, tokenA, amountBDesired), amountBDesired) : (amountADesired, amountBCalc);
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
    ) external virtual ensure(deadline) returns ( uint256 amountA, uint256 amountB, uint256 liquidity ) {
        {
            (amountADesired, amountBDesired) = this.calcAddLiquid(tokenA, tokenB, amountADesired, amountBDesired);
        }
        {
            TransferHelper.safeTransferFrom(tokenA, msg.sender, address(this), amountADesired);
            TransferHelper.safeTransferFrom(tokenB, msg.sender, address(this), amountBDesired);
            if(tokenManager.isTokenA(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender)){
                require(!IBkWeList(tokenA).isBkList(msg.sender),"the address in blackList");
                amountADesired = deductTokenAFee(tokenA, amountADesired, ITokenAFeeHandler.ActionType.AddLiquid);
                amountAMin = caculateTokenAFee(tokenA, amountAMin, ITokenAFeeHandler.ActionType.AddLiquid);
            }
            if(tokenManager.isTokenA(tokenB) && !IBkWeList(tokenB).isWeList(msg.sender)){
                require(!IBkWeList(tokenB).isBkList(msg.sender),"the address in blackList");
                amountBDesired = deductTokenAFee(tokenB, amountBDesired, ITokenAFeeHandler.ActionType.AddLiquid);
                amountBMin = caculateTokenAFee(tokenA, amountBMin, ITokenAFeeHandler.ActionType.AddLiquid);
            }
        }
        // USDT fee
        {
            (amountADesired, amountBDesired) = processUSDTFeeAddLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        }
        {
            address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
            TransferHelper.safeTransfer(tokenA, pair, amountADesired);
            TransferHelper.safeTransfer(tokenB, pair, amountBDesired);
        }
        {
            (amountA,amountB,liquidity) = bananaSwapV2Router.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline);
        }
    }

    function processUSDTFeeAddLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 /* amountAMin */,
        uint256 /* amountBMin */) internal returns( uint256 _amountADesired, uint256 _amountBDesired) {
        uint256 usdtAmt = tokenManager.isUsdt(tokenA) ? amountADesired : (tokenManager.isUsdt(tokenB) ? amountBDesired : 0);
        address aTokenAddr = tokenManager.isTokenA(tokenA) ? tokenA : (tokenManager.isTokenA(tokenB) ? tokenB : address(0));
        if (usdtAmt > 0 && aTokenAddr != address(0) && tokenManager.isAssociateWithB(aTokenAddr) && !IBkWeList(aTokenAddr).isWeList(msg.sender)) {
            uint256 feeAmt = usdtFeeHandle.calcFee(aTokenAddr, IUSDTFeeHandle.ActionType.AddLiquid, usdtAmt);
            if (feeAmt > 0) {
                address usdtAddr = tokenManager.isUsdt(tokenA) ? tokenA : tokenB;  
                TransferHelper.safeTransfer(usdtAddr, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(aTokenAddr, IUSDTFeeHandle.ActionType.AddLiquid, feeAmt, msg.sender);
                (_amountADesired, _amountBDesired) = aTokenAddr == tokenA ? (amountADesired, amountBDesired - feeAmt) : (amountADesired - feeAmt, amountBDesired);
                return (_amountADesired, _amountBDesired);
           }
        }
        return (amountADesired, amountBDesired);
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
        ensure(deadline)
        returns (
            uint256 amountToken,
            uint256 amountETH,
            uint256 liquidity
        )
    {
        //扣减tokenaA手续费。
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), amountTokenDesired);
        if (tokenManager.isTokenA(token)){
            if(!IBkWeList(token).isWeList(msg.sender)){
                require(!IBkWeList(token).isBkList(msg.sender),"the address in blackList");
                amountTokenDesired = deductTokenAFee(token, amountTokenDesired, ITokenAFeeHandler.ActionType.AddLiquid);
            }
        }
        (amountToken, amountETH) = _addLiquidity(
            token,
            WETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        // uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        TransferHelper.safeTransfer(token, pair,amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        // uint256 balance = IERC20(WETH).balanceOf(address(this));
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
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public virtual ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        IBananaSwapPair(pair).transferFrom(msg.sender, pair, liquidity);

        (amountA, amountB) = bananaSwapV2Router.removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, address(this), deadline);
        //收取手续费
        if(tokenManager.isTokenA(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender)){
            require(!IBkWeList(tokenA).isBkList(msg.sender),"the address in blackList");
            amountA = deductTokenAFee(tokenA, amountA, ITokenAFeeHandler.ActionType.RemoveLiquid);
        }
        if(tokenManager.isTokenA(tokenB) && !IBkWeList(tokenB).isWeList(msg.sender)){
            require(!IBkWeList(tokenB).isBkList(msg.sender),"the address in blackList");
            amountB = deductTokenAFee(tokenB, amountB, ITokenAFeeHandler.ActionType.RemoveLiquid);
        }

        // USDT fee
        {
            (amountA, amountB) = processUSDTFeeRemoveLiquidity(tokenA, tokenB, amountA, amountB, amountAMin, amountBMin);
        }

        require(amountA >= amountAMin, "BananaSwap: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "BananaSwap: INSUFFICIENT_B_AMOUNT");
        if(to != address(this)){
            TransferHelper.safeTransfer(tokenA, to, amountA);
            TransferHelper.safeTransfer(tokenB, to, amountB);
        }
    }

    function processUSDTFeeRemoveLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 /* amountAMin */,
        uint256 /* amountBMin */) internal returns( uint256 _amountADesired, uint256 _amountBDesired) {

        uint usdtAmt = tokenManager.isUsdt(tokenA) ? amountA : (tokenManager.isUsdt(tokenB) ? amountB : 0);
        address aTokenAddr = tokenManager.isTokenA(tokenA) ? tokenA : (tokenManager.isTokenA(tokenB) ? tokenB : address(0));
        if (usdtAmt > 0 
            && aTokenAddr != address(0) 
            && tokenManager.isAssociateWithB(aTokenAddr) 
            && !IBkWeList(aTokenAddr).isWeList(msg.sender)) 
        {
            address usdtAddr = tokenManager.isUsdt(tokenA) ? tokenA : tokenB;
            // uint feeAmt = usdtFeeHandle.calcRemoveLiquidFee(aTokenAddr, usdtAmt);
            uint feeAmt = usdtFeeHandle.calcFee(aTokenAddr, IUSDTFeeHandle.ActionType.RemoveLiquid, usdtAmt);
            if (feeAmt > 0) {
                TransferHelper.safeTransfer(usdtAddr, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(aTokenAddr, IUSDTFeeHandle.ActionType.RemoveLiquid, feeAmt, msg.sender);
            }
            // if (feeAmt > 0) usdtFeeHandle.removeLiquidFeeToReward(aTokenAddr, _msgSender(), usdtAmt);
            (_amountADesired, _amountBDesired) = aTokenAddr == tokenA ? (amountA, amountB - feeAmt) : (amountA - feeAmt, amountB);

            return (_amountADesired, _amountBDesired);
        }
        return (amountA, amountB);
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
    ) external virtual returns (uint256 amountA, uint256 amountB) {
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

    // // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    // function removeLiquidityETHSupportingFeeOnTransferTokens(
    //     address token,
    //     uint256 liquidity,
    //     uint256 amountTokenMin,
    //     uint256 amountETHMin,
    //     address to,
    //     uint256 deadline
    // ) public virtual override ensure(deadline) returns (uint256 amountETH) {
    //     (, amountETH) = removeLiquidity(
    //         token,
    //         WETH,
    //         liquidity,
    //         amountTokenMin,
    //         amountETHMin,
    //         address(this),
    //         deadline
    //     );
    //     TransferHelper.safeTransfer(
    //         token,
    //         to,
    //         IERC20(token).balanceOf(address(this))
    //     );
    //     IWETH(WETH).withdraw(amountETH);
    //     TransferHelper.safeTransferETH(to, amountETH);
    // }

    // function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
    //     address token,
    //     uint256 liquidity,
    //     uint256 amountTokenMin,
    //     uint256 amountETHMin,
    //     address to,
    //     uint256 deadline,
    //     bool approveMax,
    //     uint8 v,
    //     bytes32 r,
    //     bytes32 s
    // ) external virtual override returns (uint256 amountETH) {
    //     address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
    //     uint256 value = approveMax ? type(uint256).max : liquidity;
    //     IBananaSwapPair(pair).permit(
    //         msg.sender,
    //         address(this),
    //         value,
    //         deadline,
    //         v,
    //         r,
    //         s
    //     );
    //     amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
    //         token,
    //         liquidity,
    //         amountTokenMin,
    //         amountETHMin,
    //         to,
    //         deadline
    //     );
    // }



    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        virtual
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "BananaRouterDelegator: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            amounts = BananaSwapLibrary.getAmountsOut(factory, msg.value, path);
            require(
                amounts[amounts.length - 1] >= amountOutMin,
                "BananaRouterDelegator: INSUFFICIENT_OUTPUT_AMOUNT"
            );
            IWETH(WETH).deposit{value: amounts[0]}();
            assert(
                IWETH(WETH).transfer(
                    BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                    amounts[0]
                )
            );
            return bananaSwapV2Router.swapExactETHForTokens(msg.value,path,to,deadline);
            // _swap(amounts, path, to);
        }
        amounts = getAmountsOut(msg.value, path);
        require(
            amounts[amounts.length - 1] >= amountOutMin,
            "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
        );
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(
            IWETH(WETH).transfer(
                address(this),
                amounts[0]
            )
        );
        _swap(amounts, path, deadline);
        IBananaSwapERC20(path[path.length - 1]).transfer(to, amounts[amounts.length - 1]);
    }

    function swapTokensForExactETH(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        virtual
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");

        if (!isContainsTokenA(path)) {
            amounts = BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
            require(
                amounts[0] <= amountInMax,
                "BananaV2Router: EXCESSIVE_INPUT_AMOUNT"
            );
            TransferHelper.safeTransferFrom(
                path[0],
                msg.sender,
                BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                amounts[0]
            );
            return bananaSwapV2Router.swapTokensForExactETH(amountOut,amountInMax,path,to,deadline);
            // _swap(amounts, path, to);
        }

        amounts = getAmountsIn(amountOut, path);
        require(
            amounts[0] <= amountInMax,
            "BananaV2Router: EXCESSIVE_INPUT_AMOUNT"
        );
        TransferHelper.safeTransferFrom(
            path[0],
            msg.sender,
            address(this),
            amounts[0]
        );
        _swap(amounts, path, deadline);
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferETH(to, amounts[amounts.length - 1]);
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
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            TransferHelper.safeTransferFrom(
                path[0],
                msg.sender,
                BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                amountIn
            );
            amounts = bananaSwapV2Router.swapExactTokensForETH( amountIn, amountOutMin, path, to, deadline );
            return amounts;
        }

        TransferHelper.safeTransferFrom( path[0], msg.sender, address(this), amountIn );
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        _swap(amounts, path, deadline);
        amounts[0] = amountIn;
        require( amounts[amounts.length - 1] >= amountOutMin, "BananaSwapRouter: INSUFFICIENT_OUTPUT_AMOUNT");
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
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "BananaSwap: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            amounts = BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
            require(
                amounts[0] <= msg.value,
                "BananaSwap: EXCESSIVE_INPUT_AMOUNT"
            );
            IWETH(WETH).deposit{value: amounts[0]}();
            assert(
                IWETH(WETH).transfer(
                    BananaSwapLibrary.pairFor(factory, path[0], path[1]),
                    amounts[0]
                )
            );
            amounts = bananaSwapV2Router.swapETHForExactTokens(amountOut, path, to,deadline);
            if (msg.value > amounts[0])
                TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
            return amounts;
        }

        amounts = getAmountsIn(amountOut, path);
        require(
            amounts[0] <= msg.value,
            "BananaSwap: EXCESSIVE_INPUT_AMOUNT"
        );
        IWETH(WETH).deposit{value: amounts[0]}();
        assert(
            IWETH(WETH).transfer(
                address(this),
                amounts[0]
            )
        );
        _swap(amounts, path, deadline);
        // uint256 ethBalance = address(this).balance;
        // refund dust eth, if any
        if (msg.value > amounts[0])
            TransferHelper.safeTransferETH(msg.sender, msg.value - amounts[0]);
    }

    // // **** SWAP (supporting fee-on-transfer tokens) ****
    // // requires the initial amount to have already been sent to the first pair
    // function _swapSupportingFeeOnTransferTokens(
    //     address[] memory path,
    //     address _to
    // ) internal virtual {
    //     for (uint256 i; i < path.length - 1; i++) {
    //         (address input, address output) = (path[i], path[i + 1]);
    //         (address token0, ) = BananaSwapLibrary.sortTokens(input, output);
    //         IBananaSwapPair pair = IBananaSwapPair(
    //             BananaSwapLibrary.pairFor(factory, input, output)
    //         );
    //         uint256 amountInput;
    //         uint256 amountOutput;
    //         {
    //             // scope to avoid stack too deep errors
    //             (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
    //             (uint256 reserveInput, uint256 reserveOutput) = input == token0
    //                 ? (reserve0, reserve1)
    //                 : (reserve1, reserve0);
    //             amountInput =
    //                 IERC20(input).balanceOf(address(pair)) -
    //                 reserveInput;
    //             amountOutput = BananaSwapLibrary.getAmountOut(
    //                 amountInput,
    //                 reserveInput,
    //                 reserveOutput
    //             );
    //         }
    //         (uint256 amount0Out, uint256 amount1Out) = input == token0
    //             ? (uint256(0), amountOutput)
    //             : (amountOutput, uint256(0));
    //         address to = i < path.length - 2
    //             ? BananaSwapLibrary.pairFor(factory, output, path[i + 2])
    //             : _to;
    //         pair.swap(amount0Out, amount1Out, to, new bytes(0));
    //     }
    // }

    // function swapExactTokensForTokensSupportingFeeOnTransferTokens(
    //     uint256 amountIn,
    //     uint256 amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint256 deadline
    // ) external virtual override ensure(deadline) {
    //     TransferHelper.safeTransferFrom(
    //         path[0],
    //         msg.sender,
    //         BananaSwapLibrary.pairFor(factory, path[0], path[1]),
    //         amountIn
    //     );
    //     uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    //     _swapSupportingFeeOnTransferTokens(path, to);
    //     require(
    //         IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >=
    //             amountOutMin,
    //         "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    //     );
    // }

    // function swapExactETHForTokensSupportingFeeOnTransferTokens(
    //     uint256 amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint256 deadline
    // ) external payable virtual override ensure(deadline) {
    //     require(path[0] == WETH, "BananaSwap: INVALID_PATH");
    //     uint256 amountIn = msg.value;
    //     IWETH(WETH).deposit{value: amountIn}();
    //     assert(
    //         IWETH(WETH).transfer(
    //             BananaSwapLibrary.pairFor(factory, path[0], path[1]),
    //             amountIn
    //         )
    //     );
    //     uint256 balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
    //     _swapSupportingFeeOnTransferTokens(path, to);
    //     require(
    //         IERC20(path[path.length - 1]).balanceOf(to) - balanceBefore >=
    //             amountOutMin,
    //         "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    //     );
    // }

    // function swapExactTokensForETHSupportingFeeOnTransferTokens(
    //     uint256 amountIn,
    //     uint256 amountOutMin,
    //     address[] calldata path,
    //     address to,
    //     uint256 deadline
    // ) external virtual override ensure(deadline) {
    //     require(path[path.length - 1] == WETH, "BananaSwap: INVALID_PATH");
    //     TransferHelper.safeTransferFrom(
    //         path[0],
    //         msg.sender,
    //         BananaSwapLibrary.pairFor(factory, path[0], path[1]),
    //         amountIn
    //     );
    //     _swapSupportingFeeOnTransferTokens(path, address(this));
    //     uint256 amountOut = IERC20(WETH).balanceOf(address(this));
    //     require(
    //         amountOut >= amountOutMin,
    //         "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT"
    //     );
    //     IWETH(WETH).withdraw(amountOut);
    //     TransferHelper.safeTransferETH(to, amountOut);
    // }

    // // **** LIBRARY FUNCTIONS ****
    // function quote(
    //     uint256 amountA,
    //     uint256 reserveA,
    //     uint256 reserveB
    // ) public pure virtual override returns (uint256 amountB) {
    //     return BananaSwapLibrary.quote(amountA, reserveA, reserveB);
    // }

    function quote(
        address tokenA,
        address tokenB,
        uint256 amountA
    ) public view virtual returns (uint256 amountB) {
        // process fee
        if (tokenManager.isUsdt(tokenA) 
            && tokenManager.isTokenA(tokenB) 
            && tokenManager.isAssociateWithB(tokenB)
            && !IBkWeList(tokenB).isWeList(msg.sender)) 
        {
            // uint feeAmt = usdtFeeHandle.calcAddLiquidFee(tokenB, amountA);
            uint feeAmt = usdtFeeHandle.calcFee(tokenB, IUSDTFeeHandle.ActionType.AddLiquid, amountA);
            amountA = amountA - feeAmt;
        } else if (tokenManager.isTokenA(tokenA) 
            && tokenManager.isUsdt(tokenB) 
            && !IBkWeList(tokenA).isWeList(msg.sender)) {
            amountA = ITokenAFeeHandler(tokenA).calDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, amountA);
        }

        (uint256 _reserve0, uint256 _reserve1) = BananaSwapLibrary.getReserves(factory, tokenA, tokenB);
        (address token0, ) = BananaSwapLibrary.sortTokens(tokenA, tokenB);
        (uint256 reserveA, uint256 reserveB) = tokenA == token0 ? (_reserve0, _reserve1):(_reserve1, _reserve0);
        amountB = BananaSwapLibrary.quote(amountA, reserveA, reserveB);

        if (tokenManager.isUsdt(tokenB) 
            && tokenManager.isTokenA(tokenA) 
            && tokenManager.isAssociateWithB(tokenA)
            && !IBkWeList(tokenA).isWeList(msg.sender)) 
        {
            // amountB = usdtFeeHandle.calcAddLiquidAddFee(tokenA, amountB);
            amountB = usdtFeeHandle.calcAddFee(tokenA, IUSDTFeeHandle.ActionType.AddLiquid, amountB);
        } else if (tokenManager.isTokenA(tokenB) && tokenManager.isUsdt(tokenA) && !IBkWeList(tokenB).isWeList(msg.sender)) {
            amountB = ITokenAFeeHandler(tokenB).calAddFee(ITokenAFeeHandler.ActionType.AddLiquid, amountB);
        }
    }

    // function getAmountOut(
    //     uint256 amountIn,
    //     uint256 reserveIn,
    //     uint256 reserveOut
    // ) public pure virtual override returns (uint256 amountOut) {
    //     return BananaSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    // }

    // function getAmountIn(
    //     uint256 amountOut,
    //     uint256 reserveIn,
    //     uint256 reserveOut
    // ) public pure virtual override returns (uint256 amountIn) {
    //     return BananaSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    // }
}
