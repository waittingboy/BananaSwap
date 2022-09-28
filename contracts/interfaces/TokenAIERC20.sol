//SPDX-License-Identifier: MIT

//solhint-disable-next-line compiler-version
pragma solidity >=0.5.0;
import "./IERC20.sol";
import "./ITokenAFeeHandler.sol";

interface TokenAIERC20 is IERC20 {
    function transferFromFee(
        address from,
        address to,
        uint256 amount,
        ITokenAFeeHandler.ActionType actionType,
        address user
    ) external returns (uint256 deductFeeLeftAmount);

    function transferFee(address to, uint256 amount,ITokenAFeeHandler.ActionType actionType,address user) external returns (uint256 deductFeeLeftAmount);
}
