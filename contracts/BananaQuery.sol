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
// import "hardhat/console.sol";

contract BananaQuery is Initializable, OwnableUpgradeable {
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

    function isTokenANeedFee(address tokenA) internal view returns(bool need) {
        return tokenManager.isTokenA(tokenA) && !IBkWeList(tokenA).isWeList(msg.sender);
    }
    
    function isTokenAUsdtNeedFee(address tokenUsdt, address tokenA) internal view returns(bool need) {
        return tokenManager.isUsdt(tokenUsdt) 
            && tokenManager.isTokenA(tokenA) 
            && tokenManager.isAssociateWithB(tokenA) 
            && !IBkWeList(tokenA).isWeList(msg.sender);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(
        address tokenA,
        address tokenB,
        uint256 amountA
    ) public view virtual returns (uint256 amountB) {
        if (isTokenAUsdtNeedFee(tokenA, tokenB)) {
            uint feeAmt = usdtFeeHandle.calcFee(tokenB, IUSDTFeeHandle.ActionType.AddLiquid, amountA);
            amountA = amountA - feeAmt;
        } 
        if (isTokenANeedFee(tokenA)) {
            amountA = ITokenAFeeHandler(tokenA).calDeductFee(ITokenAFeeHandler.ActionType.AddLiquid, amountA);
        }
        
        (uint256 _reserve0, uint256 _reserve1) = BananaSwapLibrary.getReserves(factory, tokenA, tokenB);
        amountB = BananaSwapLibrary.quote(amountA, _reserve0, _reserve1);
        
        if (isTokenAUsdtNeedFee(tokenB, tokenA)) {
            amountB = usdtFeeHandle.calcAddFee(tokenA, IUSDTFeeHandle.ActionType.AddLiquid, amountB);
        } 
        if (isTokenANeedFee(tokenB)) {
            amountB = ITokenAFeeHandler(tokenB).calAddFee(ITokenAFeeHandler.ActionType.AddLiquid, amountB);
        }
    }

    function getAmountOut(
        uint amountIn, 
        uint reserveIn, 
        uint reserveOut
    ) public pure virtual returns (uint amountOut) {
        return BananaSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(
        uint amountOut, 
        uint reserveIn, 
        uint reserveOut
    ) public pure virtual returns (uint amountIn) {
        return BananaSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOutOld(
        uint256 amountIn,
        address[] memory path
    ) public view returns (uint256[] memory amounts) {
        return BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsInOld(
        uint256 amountOut,
        address[] memory path
    ) public view returns (uint256[] memory amounts) {
        return BananaSwapLibrary.getAmountsIn(factory, amountOut, path);
    }

    function getAmountsOut(
        uint256 amountIn, 
        address[] memory path
    ) public view virtual returns (uint256[] memory amounts) {
        require(path.length >= 2, "BananaSwapLibrary: INVALID_PATH");
        if (!isContainsTokenA(path)) {
            return BananaSwapLibrary.getAmountsOut(factory, amountIn, path);
        }
        
        amounts = new uint256[](path.length);
        uint256 leftAmount = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            {
                // tokenA fee
                if (isTokenANeedFee(path[i])) {
                    leftAmount = ITokenAFeeHandler(path[i]).calDeductFee(ITokenAFeeHandler.ActionType.Sell, leftAmount);
                }
                // USDT -> A
                if (isTokenAUsdtNeedFee(path[i], path[i + 1])) {
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
            {
                // tokenA fee
                if (isTokenANeedFee(path[i + 1])) {
                    leftAmount = ITokenAFeeHandler(path[i+1]).calDeductFee(ITokenAFeeHandler.ActionType.Buy, leftAmount);
                }
                // A -> USDT 
                if (isTokenAUsdtNeedFee(path[i + 1], path[i])) {
                    uint256 feeAmount = usdtFeeHandle.calcFee(path[i], IUSDTFeeHandle.ActionType.Sell, leftAmount);
                    leftAmount = leftAmount - feeAmount;
                }
                amounts[i + 1] = leftAmount;
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
                if (isTokenANeedFee(path[i])) {
                    beforeDecutAmount = ITokenAFeeHandler(path[i]).calAddFee(ITokenAFeeHandler.ActionType.Buy, beforeDecutAmount);
                }
                // A -> USDT
                if (isTokenAUsdtNeedFee(path[i], path[i - 1])) {
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
                if (isTokenANeedFee(path[i - 1])) {
                    beforeDecutAmount = ITokenAFeeHandler(path[i-1]).calAddFee(ITokenAFeeHandler.ActionType.Sell, beforeDecutAmount);
                }
                // USDT -> A
                if (isTokenAUsdtNeedFee(path[i - 1], path[i])) {
                    beforeDecutAmount = usdtFeeHandle.calcAddFee(path[i], IUSDTFeeHandle.ActionType.Buy, beforeDecutAmount);

                }
                amounts[i-1] = beforeDecutAmount;
            }
        }
        amounts[path.length - 1] = amountOut;
    }

    function isContainsTokenA(address[] memory path) internal view returns (bool isTokenAOrUsdt) {
        for (uint256 index = 0; index < path.length; index++) {
            if (tokenManager.isTokenA(path[index]) && !IBkWeList(path[index]).isWeList(msg.sender)) {
                isTokenAOrUsdt = true;
            }
        }
    }

    function pairFor(address tokenA, address tokenB) external view returns(address) {
        return BananaSwapLibrary.pairFor(factory, tokenA, tokenB);
    }

}
