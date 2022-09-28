//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/nana/IFeeHandler.sol";
import "../interfaces/IBananaSwapRouter.sol";
import "../libraries/BananaUtils.sol";
import "../interfaces/IERC20.sol";
// //import "hardhat/console.sol";

interface ITokenB  {
    function ecosystem() external view returns(address);
}

contract RepurchaseDestroyFeeHandler is IFeeHandler, OwnableUpgradeable {
    address public repurchaseToken;
    address public usdtAddress;
    IBananaSwapRouter public uniswapV2Router;
    mapping(address => bool) private isManager;
    uint public threshold;
    bool public isHandling;
    address public tokenB;
    uint public thresholdTokenB;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(address _usdtAddress, IBananaSwapRouter _uniswapV2Router, uint _threshold, address _tokenB) public initializer {
        __Ownable_init();
        usdtAddress = _usdtAddress;
        uniswapV2Router = _uniswapV2Router;
        setManager(_msgSender(),true);
        isHandling = false;
        threshold = _threshold;
        tokenB = _tokenB;
        thresholdTokenB = 10 * 10 ** 18;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function setPurchaseToken(address tokenAddress) public onlyManager {
        repurchaseToken = tokenAddress;
    }

    function setRouter(IBananaSwapRouter router) public onlyManager {
        uniswapV2Router = router;
    }

    function setThreshold(uint _threshold) public onlyManager {
        require(_threshold > 0, "INVALIDATE_THRESHOLD");
        threshold = _threshold;
    }

    function seTokenB(address _tokenB) public onlyManager {
        tokenB = _tokenB;
    }

    function setThresholdTokenB(uint _thresholdTokenB) public onlyManager {
        require(_thresholdTokenB > 0, "INVALIDATE_THRESHOLD");
        thresholdTokenB = _thresholdTokenB;
    }

    function handleFee(address tokenAddress, uint256 /* amount */) external virtual override returns (bool) {
        uint256 totalAmount = IERC20(tokenAddress).balanceOf(address(this));
        if(totalAmount >= threshold && !isHandling) {
            isHandling = true;

            address[] memory path = new address[](3);
            path[0] = tokenAddress;
            path[1] = usdtAddress;
            path[2] = repurchaseToken;
            IERC20(tokenAddress).approve(address(uniswapV2Router), totalAmount);
            uniswapV2Router.swapExactTokensForTokens(totalAmount, 0, path, BananaUtils.BLACK_HOLE, type(uint256).max);

            // transfer tokenb to ecosystem account
            uint256 myTotal = IERC20(tokenB).balanceOf(address(this));
            if (myTotal >= thresholdTokenB && ITokenB(tokenB).ecosystem() != address(0)) {
                IERC20(tokenB).transfer(ITokenB(tokenB).ecosystem(), myTotal);
            }

            isHandling = false;
        }
        return true;
    }
}
