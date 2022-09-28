//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../interfaces/nana/IFeeHandler.sol";
import "../interfaces/IBananaSwapRouter.sol";
import "../libraries/BananaUtils.sol";
import "../interfaces/IERC20.sol";
//import "hardhat/console.sol";

// This handler needs to handle swap and addliquid without handling fees. 
// Therefore, it is necessary to manually add the handler to the tokena whitelist.
contract ReflowFeeHandler is IFeeHandler, OwnableUpgradeable {
    address public reflowPaternToken;
    // Only when the service charge reaches this threshold can swap and add liquidity be performed.
    uint public threshold;
    bool public isHandling;
    IBananaSwapRouter public bananaSwap;
    IBananaSwapRouter public bananaLiquid;
    mapping(address => bool) private isManager;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(address _reflowPaternToken, IBananaSwapRouter _bananaSwap, IBananaSwapRouter _bananaLiquid, uint _threshold) public initializer {
        __Ownable_init();
        reflowPaternToken = _reflowPaternToken;
        bananaSwap = _bananaSwap;
        bananaLiquid = _bananaLiquid;
        setManager(_msgSender(),true);
        threshold = _threshold;
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function setSwapRouter(IBananaSwapRouter _bananaSwap) public onlyManager {
        bananaSwap = _bananaSwap;
    }

    function setLiquidRouter(IBananaSwapRouter _bananaSwap) public onlyManager {
        bananaSwap = _bananaSwap;
    }

    function setThreshold(uint _threshold) public onlyManager {
        require(_threshold > 0, "INVALIDATE_THRESHOLD");
        threshold = _threshold;
    }

    function handleFee(address tokenA, uint256 /* amount */) external virtual override returns(bool) {
        uint256 totalAmount = IERC20(tokenA).balanceOf(address(this));
        if(totalAmount >= threshold && !isHandling) {
            isHandling = true;
            
            // 1/2 tokenA swap to reflowPaternToken
            uint256 halfAmount = totalAmount / 2;
            address[] memory path = new address[](2);
            path[0] = tokenA;
            path[1] = reflowPaternToken;
            IERC20(tokenA).approve(address(bananaSwap), halfAmount);
            uint256 swapOutAmount = bananaSwap.swapExactTokensForTokens(halfAmount, 0, path, address(this), type(uint256).max)[1];
            
            // add liquidity
            uint256 leftAmount = totalAmount - halfAmount;
            IERC20(path[0]).approve(address(bananaLiquid), leftAmount);
            IERC20(path[1]).approve(address(bananaLiquid), swapOutAmount);
            bananaLiquid.addLiquidity(path[0], path[1], leftAmount, swapOutAmount, 0, 0, BananaUtils.BLACK_HOLE, type(uint256).max);
           
            isHandling = false;
        }
        return true;
    }
}
