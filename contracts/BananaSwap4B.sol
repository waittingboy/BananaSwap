//SPDX-License-Identifier: MIT
pragma solidity >=0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./libraries/TransferHelper.sol";
import "./interfaces/ITokenAFeeHandler.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "./interfaces/ITokenBPool.sol";
import "./libraries/BananaSwapLibrary.sol";
import "./libraries/SafeMath.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IWETH.sol";
//import "hardhat/console.sol";
import "./BananaSwap.sol";

interface IBananaSwap4B {
    function getAmountOut(uint256 amountB) external view returns (uint256 amountU);
    function getAmountIn(uint256 amountU) external view returns (uint256 amountB);
    function sell(uint amountIn, address to) external returns (uint amountOut);
}

contract BananaSwap4B is Initializable, OwnableUpgradeable {
    using SafeMath for uint;

    address public factory;
    address public WETH;
    mapping(address => bool) public isManager;

    ITokenManager public tokenManager;
    IUSDTFeeHandle public usdtFeeHandle;
    address public pairB;
    address public tokenB;
    address public usdt;
    bool public isInitLiquidity;

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
        isInitLiquidity = false;
    }

    function setTokenManager(ITokenManager _tokenManager)public onlyManager{
        tokenManager = _tokenManager;
    }

    function setUsdtFeeHandle(address _usdtFeeHandle) external onlyManager {
        require(_usdtFeeHandle != address(0), "USDTFeeHandle zero address");
        usdtFeeHandle = IUSDTFeeHandle(_usdtFeeHandle);
    }

    function setPairB(address _pairB) external onlyManager {
        require(_pairB != address(0), "ZERO_ADDRESS");
        pairB = _pairB;
    }

    function setTokenB(address _tokenB) external onlyManager {
        require(_tokenB != address(0), "ZERO_ADDRESS");
        tokenB = _tokenB;
    }

    function setUsdt(address _usdt) external onlyManager {
        require(_usdt != address(0), "ZERO_ADDRESS");
        usdt = _usdt;
    }

    function setIsInitLiquidity(bool _isInitLiquidity) external onlyManager {
        isInitLiquidity = _isInitLiquidity;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }

    function getAmountOut(uint256 amountB) public view virtual returns (uint256 amountU) {
        require(pairB != address(0), "pairB_ZERO_ADDRESS");
        require(tokenB != address(0), "tokenB_ZERO_ADDRESS");

        (uint112 _reserve0, uint112 _reserve1, ) = IBananaSwapPair(pairB).getReserves();
        (uint256 reserve0, uint256 reserve1) = tokenB == IBananaSwapPair(pairB).token0() ? (uint(_reserve0), uint(_reserve1)) : (uint(_reserve1), uint(_reserve0));
        amountU = BananaSwapLibrary.getAmountOut(amountB, reserve0, reserve1); 
        {
            uint fee = usdtFeeHandle.calcSellFee(tokenB, amountU);
            amountU = amountU - fee;
        }
    }

    function getAmountIn(uint256 amountU) public view virtual returns (uint256 amountB) {
        require(pairB != address(0), "pairB_ZERO_ADDRESS");
        require(tokenB != address(0), "tokenB_ZERO_ADDRESS");
        amountU = usdtFeeHandle.calcSellAddFee(tokenB, amountU);
        (uint112 _reserve0, uint112 _reserve1, ) = IBananaSwapPair(pairB).getReserves();
        (uint256 reserveIn , uint256 reserveOut) = tokenB == IBananaSwapPair(pairB).token0() ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
        amountB = BananaSwapLibrary.getAmountIn(amountU, reserveIn, reserveOut);
    }

    function initLiquid(uint token0Amount, uint token1Amount) external onlyManager {
        require(!isInitLiquidity, "INITED_LIQUIDITY");
        address token0 = ITokenBPool(pairB).token0();
        address token1 = ITokenBPool(pairB).token1();
        TransferHelper.safeTransferFrom(token0, msg.sender, pairB, token0Amount);
        TransferHelper.safeTransferFrom(token1, msg.sender, pairB, token1Amount);
        ITokenBPool(pairB).mint(msg.sender);
        isInitLiquidity = true;
    }

    function sell(uint amountIn, address to) external virtual returns (uint amountOut) {
        require(pairB != address(0), "pairB_ZERO_ADDRESS");
        require(tokenB != address(0), "tokenB_ZERO_ADDRESS");

        TransferHelper.safeTransferFrom(tokenB, msg.sender, pairB, amountIn);
        ITokenBPool pair = ITokenBPool(pairB);
        {
            (uint112 _reserve0, uint112 _reserve1,) = pair.getReserves();
            (uint reserveIn, uint reserveOut) = tokenB == pair.token0() ? (_reserve0, _reserve1) : (_reserve1, _reserve0);
            amountOut = BananaSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut); 
            (uint amount0Out, uint amount1Out) = tokenB == pair.token0() ? (uint256(0), amountOut) : (amountOut, uint256(0));
            pair.swap(amount0Out, amount1Out, address(this), new bytes(0));
        }

        uint feeAmount = IUSDTFeeHandle(usdtFeeHandle).calcSellFee(tokenB, amountOut);
        if (feeAmount > 0 ) {
            TransferHelper.safeTransfer(usdt, address(usdtFeeHandle), feeAmount);
            IUSDTFeeHandle(usdtFeeHandle).sellFeeToReward(tokenB, msg.sender, amountOut);
        }
        amountOut = amountOut - feeAmount;
        TransferHelper.safeTransfer(usdt, to, amountOut);
    }

    function isContract(address addr) external view returns(bool) {
        return TransferHelper.isContract(addr);
    }

}
