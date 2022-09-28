// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

contract MyERC20 is ERC20Upgradeable {
    
    function init(address account, uint256 amount) public {
        _mint(account, amount);
    }

    fallback() external {}
}
