//SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ITokenAInterface.sol";

// //import "hardhat/console.sol";

contract CoinAllocation is OwnableUpgradeable {
    mapping(address => bool) private isManager;
    IERC20 private tokenA;
    ITokenAInterface private tokenAI;

    struct Data {
        uint percent;
        address addr;
    }

    Data[] public data;

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }

    function initialize(address _tokenAaddress) public initializer {
        __Ownable_init();
        setManager(_msgSender(), true);
        tokenA = IERC20(_tokenAaddress);
        tokenAI = ITokenAInterface(_tokenAaddress);
    }

    function setPercent(uint[] memory percentage, address[] memory addrs) public onlyOwner {
        require(percentage.length == addrs.length, "input length eq");
        uint total;
        delete data;
        for (uint256 i = 0; i < percentage.length; i++) {
            data.push(Data({percent: percentage[i], addr: addrs[i]}));
            total = total + percentage[i];
        }
        require(total == 10000, "not is 10000");
    }

    function setManager(address _manager, bool _flag) public onlyOwner {
        isManager[_manager] = _flag;
    }

    function mint(uint256 total) public onlyOwner {
        require(data.length > 0, "no address");
        //allow tokenA mint
        for (uint256 i = 0; i < data.length; i++) {
            tokenAI.born(data[i].addr, (data[i].percent * total) / 10000);
        }
        //Return owner permission
        tokenAI.transferOwnership(msg.sender);

    }
}
