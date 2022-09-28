//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./interfaces/IBananaSwapPair.sol";
import "./libraries/TransferHelper.sol";
import "./BkWeList.sol";

contract BananaToken is ERC20Upgradeable, OwnableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    
    uint public transferPercent;
    uint public constant base = 10000;
    uint public pairFeeRatio;
    uint public ecosystemFeeRatio;
    address public pairB;
    address public ecosystem;

    mapping(address => bool) public isManager;
    event SetManager(address manager, bool flag);

    modifier onlyManager() {
        require(isManager[_msgSender()], "Not manager");
        _;
    }
    
    function initialize(string memory name, string memory symbol) public initializer {
        __Ownable_init();
        __ERC20_init(name, symbol);
        setManager(_msgSender(),true);
        transferPercent = 9999;
    }

    function setManager(address manager, bool flag) public onlyOwner {
        isManager[manager] = flag;
        emit SetManager(manager, flag);
    }

    function getManager(address manager) public view returns (bool) {
        return isManager[manager];
    }

    function mint(address account, uint256 amount) external onlyManager {
        _mint(account, amount);
    }

    function setTransferParams(
        uint _transferPercent, 
        address _pairB, 
        address _ecosystem, 
        uint _pairFeeRatio,
        uint _ecosystemFeeRatio
    ) public onlyManager {
        require(_transferPercent <= base, "ERROR_PARAM");
        require((_pairFeeRatio + _ecosystemFeeRatio) <= base, "ERROR_PARAM");

        transferPercent = _transferPercent;
        pairB = _pairB;
        ecosystem = _ecosystem;
        pairFeeRatio = _pairFeeRatio;
        ecosystemFeeRatio = _ecosystemFeeRatio;
    }

    function transferFee(address from, address to, uint256 amount) internal returns(uint256 leftAmount) {
        if (!TransferHelper.isContract(from)) {
            require(amount <= (balanceOf(from) * transferPercent / base), "amount gt balance");
        }
        leftAmount = amount;
        if (!(TransferHelper.isContract(from) || TransferHelper.isContract(to))) {
            uint256 feePairB = amount * pairFeeRatio / base;
            if (feePairB > 0) {
                _transfer(from, pairB, feePairB);
                IBananaSwapPair(pairB).sync();
                leftAmount -= feePairB;
            }

            uint256 feeEcosystem = amount * ecosystemFeeRatio / base;
            if (feeEcosystem > 0) {
                _transfer(from, ecosystem, feePairB);
                leftAmount -= feeEcosystem;
            }
        }
        return leftAmount;
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        uint256 leftAmount = transferFee(owner, to, amount);
        _transfer(owner, to, leftAmount);
        return true;
    }

    function transferFrom(address from,address to, uint256 amount) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        uint256 leftAmount = transferFee(from, to, amount);
        _transfer(from, to, leftAmount);
        return true;
    }
    
}