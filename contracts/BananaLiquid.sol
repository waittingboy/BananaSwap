//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./interfaces/IBananaSwapFactory.sol";
import "./libraries/TransferHelper.sol";
import "./interfaces/ITokenAFeeHandler.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "./libraries/BananaSwapLibrary.sol";
import "./interfaces/IBkWeList.sol";
import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/ITimeLock.sol";
//import "hardhat/console.sol";

contract BananaLiquid is Initializable, OwnableUpgradeable {
    using SafeMath for uint;

    address public factory;
    address public WETH;
    mapping(address => bool) public isManager;

    ITokenManager public tokenManager;
    IUSDTFeeHandle public usdtFeeHandle;

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

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn"t exist yet
        if (IBananaSwapFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IBananaSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = BananaSwapLibrary.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = BananaSwapLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "BananaSwap: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = BananaSwapLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "BananaSwap: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
    // function caculateTokenAFee( address tokenPath, uint256 amountIn, ITokenAFeeHandler.ActionType actionType ) internal view returns (uint256 deductFeeLeftAmount) {
    //     deductFeeLeftAmount = amountIn;
    //     if (tokenManager.isTokenA(tokenPath)) {
    //         deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee( actionType, amountIn );
    //     }
    // }

    function isTokenANeedFee(address tokenA) internal view returns(bool need) {
        return tokenManager.isTokenA(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender);
    }

    function isTokenAUsdtNeedFee(address tokenA) internal view returns(bool need) {
        return tokenManager.isTokenA(tokenA) && tokenManager.isAssociateWithB(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender);
    }
    function addLiquidityBefore(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired
    ) internal view returns(uint amountA, uint amountB, bool isInWhiteList, bool isInWhiteList2) {
        isInWhiteList = true;
        isInWhiteList2 = true;
        (amountA, amountB) = (amountADesired, amountBDesired);
        if (tokenManager.isTokenA(tokenA)) { // tokenA is apple token
            require(!IBkWeList(tokenA).isBkList(msg.sender), "in blacklist");
            if (!IBkWeList(tokenA).isWeList(msg.sender)) {
                isInWhiteList = false;
                // apple token fee
                amountA = ITokenAFeeHandler(tokenA).calDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, amountADesired);
                // USDT fee
                if (tokenManager.isUsdt(tokenB) && tokenManager.isAssociateWithB(tokenA)) {
                    uint feeAmt = usdtFeeHandle.calcFee(tokenA, IUSDTFeeHandle.ActionType.AddLiquid, amountBDesired);
                    amountB = amountBDesired - feeAmt;
                }
            }
        } 
        if (tokenManager.isTokenA(tokenB)) { // tokenB is apple token
            require(!IBkWeList(tokenB).isBkList(msg.sender), "in blacklist");
            if (!IBkWeList(tokenB).isWeList(msg.sender)) {
                isInWhiteList2 = false;
                //  apple token fee
                amountB = ITokenAFeeHandler(tokenB).calDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, amountBDesired);
                // USDT fee
                if (tokenManager.isUsdt(tokenA) && tokenManager.isAssociateWithB(tokenB)) {
                    uint feeAmt = usdtFeeHandle.calcFee(tokenB, IUSDTFeeHandle.ActionType.AddLiquid, amountADesired);
                    amountA = amountADesired - feeAmt;
                } 
            }
        }
    }
    function addLiquidityAfter(
        address tokenA,
        address tokenB,
        uint amountA,
        uint amountB,
        bool isInWhiteList,
        bool isInWhiteList2
    ) internal {
        if (tokenManager.isTokenA(tokenA) && !isInWhiteList) { // tokenA is apple token
            // apple token fee
            uint amountADesired = ITokenAFeeHandler(tokenA).calAddFee(ITokenAFeeHandler.ActionType.AddLiquid, amountA);
            uint feeAmt = amountADesired - amountA;
            if (feeAmt > 0) {
                // TransferHelper.safeTransferFrom(tokenA, msg.sender, tokenA, feeAmt);transferFromFee
                ITokenAFeeHandler(tokenA).handleDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, feeAmt,msg.sender,msg.sender);
            }
            // USDT fee
            if (tokenManager.isUsdt(tokenB) && tokenManager.isAssociateWithB(tokenA)) {
                uint amountBDesired = usdtFeeHandle.calcAddFee(tokenA, IUSDTFeeHandle.ActionType.AddLiquid, amountB);
                feeAmt = amountBDesired - amountB;
                if (feeAmt > 0) {
                    TransferHelper.safeTransferFrom(tokenB, msg.sender, address(usdtFeeHandle), feeAmt);
                    usdtFeeHandle.handleFee(tokenA, IUSDTFeeHandle.ActionType.AddLiquid, feeAmt, msg.sender);
                }
            }
        }
        if (tokenManager.isTokenA(tokenB) && !isInWhiteList2) { // tokenB is anther apple token
            // apple token fee
            uint amountBDesired = ITokenAFeeHandler(tokenB).calAddFee(ITokenAFeeHandler.ActionType.AddLiquid, amountB);
            uint feeAmt = amountBDesired - amountB;
            if (feeAmt > 0) {
                // TransferHelper.safeTransferFrom(tokenB, msg.sender, tokenB, feeAmt);
                ITokenAFeeHandler(tokenB).handleDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, feeAmt,msg.sender,msg.sender);
            }
            // USDT fee
            if (tokenManager.isUsdt(tokenA) && tokenManager.isAssociateWithB(tokenB)) {
                uint amountADesired = usdtFeeHandle.calcAddFee(tokenB, IUSDTFeeHandle.ActionType.AddLiquid, amountA);
                feeAmt = amountADesired - amountA;
                if (feeAmt > 0) {
                    TransferHelper.safeTransferFrom(tokenA, msg.sender, address(usdtFeeHandle), feeAmt);
                    usdtFeeHandle.handleFee(tokenB, IUSDTFeeHandle.ActionType.AddLiquid, feeAmt, msg.sender);
                }
            }
        }
    }
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual  ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        if (isTokenANeedFee(tokenA) || isTokenANeedFee(tokenB)) {
            {
                bool isInWhiteList = true;
                bool isInWhiteList2 = true;
                (amountA, amountB, isInWhiteList, isInWhiteList2) = addLiquidityBefore(tokenA, tokenB, amountADesired, amountBDesired);
                (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountA, amountB, amountAMin, amountBMin);
                addLiquidityAfter(tokenA, tokenB, amountA, amountB, isInWhiteList, isInWhiteList2);
            }
            address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
            TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
            TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
            liquidity = mintLiquidity(tokenA, tokenB, pair, to);
        } else {
            (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
            address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
            TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
            TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
            liquidity = IBananaSwapPair(pair).mint(to);
        }
    }
    function mintLiquidity(address tokenA, address tokenB, address pair, address to) internal returns(uint liquidity) {
        ITokenAFeeHandler.LiquidityLockConfig memory config;
        bool needLock;
        if (tokenManager.isTokenA(tokenA) && tokenManager.isUsdt(tokenB)) {
            config = ITokenAFeeHandler(tokenA).getLiquidityLockConfig();
            needLock = config.openLockLiquid;
        } else if (tokenManager.isTokenA(tokenB) && tokenManager.isUsdt(tokenA)) {
            config = ITokenAFeeHandler(tokenB).getLiquidityLockConfig();
            needLock = config.openLockLiquid;
        }
        if (needLock) {
            require(config.lockLiquidDuration > 0, "lockLiquidDuration ERROR");
            require(config.lpTimeLock != address(0), "lpTimeLock ERROR");

            liquidity = IBananaSwapPair(pair).mint(address(this));
            IBananaSwapPair(pair).approve(config.lpTimeLock, liquidity);
            ITimeLock(config.lpTimeLock).deposit(to, liquidity, config.lockLiquidDuration);
        } else {
            liquidity = IBananaSwapPair(pair).mint(to);
        }
    }
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external virtual  payable ensure(deadline) returns (uint amountToken, uint amountETH, uint liquidity) {
        if (isTokenANeedFee(token)) {
            require(!IBkWeList(token).isBkList(msg.sender), "in black list");
            amountTokenDesired = ITokenAFeeHandler(token).calDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, amountTokenDesired);
            (amountToken, amountETH) = _addLiquidity(token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin);
            amountTokenDesired = ITokenAFeeHandler(token).calAddFee(ITokenAFeeHandler.ActionType.AddLiquid, amountToken);
            uint feeAmt = amountTokenDesired - amountToken;
            if (feeAmt > 0) {
                // TransferHelper.safeTransferFrom(token, msg.sender, token, feeAmt);
                ITokenAFeeHandler(token).handleDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, feeAmt,msg.sender,msg.sender);
            }
            address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
            TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
            IWETH(WETH).deposit{value: amountETH}();
            assert(IWETH(WETH).transfer(pair, amountETH));
            liquidity = IBananaSwapPair(pair).mint(to);
        } else {
            (amountToken, amountETH) = _addLiquidity( token, WETH, amountTokenDesired, msg.value, amountTokenMin, amountETHMin );
            address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
            TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
            IWETH(WETH).deposit{value: amountETH}();
            assert(IWETH(WETH).transfer(pair, amountETH));
            liquidity = IBananaSwapPair(pair).mint(to);
        }
        // refund dust eth, if any  
        if (msg.value > amountETH) TransferHelper.safeTransferETH(msg.sender, msg.value - amountETH);
    }
    function processUSDTFeeRemoveLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) internal returns( uint256 _amountADesired, uint256 _amountBDesired) {
        uint usdtAmt = tokenManager.isUsdt(tokenA) ? amountA : (tokenManager.isUsdt(tokenB) ? amountB : 0);
        address aTokenAddr = tokenManager.isTokenA(tokenA) ? tokenA : (tokenManager.isTokenA(tokenB) ? tokenB : address(0));
        if (usdtAmt > 0 && isTokenAUsdtNeedFee(aTokenAddr)) {
            require(!IBkWeList(aTokenAddr).isBkList(msg.sender),"the address in blackList");
            address usdtAddr = tokenManager.isUsdt(tokenA) ? tokenA : tokenB;
            uint feeAmt = usdtFeeHandle.calcFee(aTokenAddr, IUSDTFeeHandle.ActionType.RemoveLiquid, usdtAmt);
            if (feeAmt > 0) {
                TransferHelper.safeTransfer(usdtAddr, address(usdtFeeHandle), feeAmt);
                usdtFeeHandle.handleFee(aTokenAddr, IUSDTFeeHandle.ActionType.RemoveLiquid, feeAmt, msg.sender);
            }
            (_amountADesired, _amountBDesired) = aTokenAddr == tokenA ? (amountA, amountB - feeAmt) : (amountA - feeAmt, amountB);

            return (_amountADesired, _amountBDesired);
        }
        return (amountA, amountB);
    }
    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual  ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        IBananaSwapPair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        if (!(isTokenANeedFee(tokenA) || isTokenANeedFee(tokenB))) {
            (uint256 amount0, uint256 amount1) = IBananaSwapPair(pair).burn(to);
            (address token0, ) = BananaSwapLibrary.sortTokens(tokenA, tokenB);
            (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
            require(amountA >= amountAMin, "BananaSwap: INSUFFICIENT_A_AMOUNT");
            require(amountB >= amountBMin, "BananaSwap: INSUFFICIENT_B_AMOUNT");
        } else {
            (uint amount0, uint amount1) = IBananaSwapPair(pair).burn(address(this));
            (address token0,) = BananaSwapLibrary.sortTokens(tokenA, tokenB);
            (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
            // tokenA fee
            if(isTokenANeedFee(tokenA)){
                require(!IBkWeList(tokenA).isBkList(msg.sender),"IN_BLACKLIST");
                amountA = deductTokenAFee(tokenA, amountA, ITokenAFeeHandler.ActionType.RemoveLiquid,pair);
            }
            if(isTokenANeedFee(tokenB)){
                require(!IBkWeList(tokenB).isBkList(msg.sender),"IN_BLACKLIST");
                amountB = deductTokenAFee(tokenB, amountB, ITokenAFeeHandler.ActionType.RemoveLiquid,pair);
            }
            { // USDT fee
                (amountA, amountB) = processUSDTFeeRemoveLiquidity(tokenA, tokenB, amountA, amountB);
            }
            require(amountA >= amountAMin, "BananaSwap: INSUFFICIENT_A_AMOUNT");
            require(amountB >= amountBMin, "BananaSwap: INSUFFICIENT_B_AMOUNT");
            if (to != address(this)) {
                TransferHelper.safeTransfer(tokenA, to, amountA);
                TransferHelper.safeTransfer(tokenB, to, amountB);
            }
        }
    }
    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) public virtual  ensure(deadline) returns (uint amountToken, uint amountETH) {
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
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual  returns (uint amountA, uint amountB) {
        address pair = BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? type(uint).max : liquidity;
        IBananaSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }
    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual  returns (uint amountToken, uint amountETH) {
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        uint value = approveMax ? type(uint).max : liquidity;
        IBananaSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountETH) = removeLiquidityETH(token, liquidity, amountTokenMin, amountETHMin, to, deadline);
    }
    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) public virtual  ensure(deadline) returns (uint amountETH) {
        (, amountETH) = removeLiquidity(
            token,
            WETH,
            liquidity,
            amountTokenMin,
            amountETHMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWETH(WETH).withdraw(amountETH);
        TransferHelper.safeTransferETH(to, amountETH);
    }
    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual  returns (uint amountETH) {
        address pair = BananaSwapLibrary.pairFor(factory, token, WETH);
        uint value = approveMax ? type(uint).max : liquidity;
        IBananaSwapPair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountETH = removeLiquidityETHSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountETHMin, to, deadline
        );
    }
    function deductTokenAFee(
        address tokenPath, 
        uint256 amountIn, 
        ITokenAFeeHandler.ActionType actionType ,
        address /* pair */
    ) internal returns (uint256 deductFeeLeftAmount) {
        deductFeeLeftAmount = ITokenAFeeHandler(tokenPath).calDeductFee(actionType, amountIn);
        uint256 feeAmount = amountIn - deductFeeLeftAmount;
        if (feeAmount > 0) {
            // TransferHelper.safeTransfer(tokenPath, tokenPath, feeAmount);
            ITokenAFeeHandler(tokenPath).handleDeductFee(actionType, feeAmount,address(this),msg.sender);
        }
    }
}
