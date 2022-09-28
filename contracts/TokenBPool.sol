//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/ITokenManager.sol";
import "./interfaces/IUSDTFeeHandle.sol";
import "./interfaces/ITokenBPool.sol";
import "./interfaces/IBananaSwapFactory.sol";
import "./interfaces/IBananaSwapCallee.sol";
import "./interfaces/IERC20.sol";
import "./libraries/UQ112x112.sol";
import "./libraries/Math.sol";
import "./libraries/TransferHelper.sol";
import "./BananaSwapERC20Upgradeable.sol";
//import "hardhat/console.sol";

contract TokenBPool is Initializable, ITokenBPool, BananaSwapERC20Upgradeable, AccessControlEnumerableUpgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using UQ112x112 for uint224;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURN_ROLE = keccak256("BURN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    event SetManager(address manager, bool flag);
    event SetTokenB(address indexed oper, address indexed newTokenB);

    uint256 public override constant MINIMUM_LIQUIDITY = 10**3;

    address public override factory;
    address public override token0;
    address public override token1;

    uint112 private reserve0; // uses single storage slot, accessible via getReserves
    uint112 private reserve1; // uses single storage slot, accessible via getReserves
    uint32 private blockTimestampLast; // uses single storage slot, accessible via getReserves

    uint256 public override price0CumulativeLast;
    uint256 public override price1CumulativeLast;
    uint256 public override kLast; // reserve0 * reserve1, as of immediately after the most recent liquidity event

    uint256 private unlocked;
    modifier lock() {
        require(unlocked == 1, "BananaSwap: LOCKED");
        unlocked = 0;
        _;
        unlocked = 1;
    }

    EnumerableSet.AddressSet private tokenBExcludeBalanceList;
    address public override tokenB;
    address public override usdtFeeHandle;
    address public override routerSwap4B;

    modifier onlyRouter() {
        require(routerSwap4B == msg.sender, "ONLY_ROUTER4B");
        _;
    }

    function initialize(address _token0, address _token1, address _tokenB, address _factory, address _routerSwap4B) public virtual initializer {
        __UniswapV2ERC20_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(MANAGER_ROLE, _msgSender());

        token0 = _token0;
        token1 = _token1;
        tokenB = _tokenB;
        factory = _factory;
        routerSwap4B = _routerSwap4B;
        unlocked = 1;
    }

    function setUsdtFeeHandle(address _usdtFeeHandle) external onlyRole(MANAGER_ROLE) {
        require(_usdtFeeHandle != address(0), "ZERO_ADDRESS");
        usdtFeeHandle = _usdtFeeHandle;
    }

    function setRouterSwap4B(address _routerSwap4B) external override onlyRole(MANAGER_ROLE) {
        routerSwap4B = _routerSwap4B;
    }
    
    function _getReserves() public view virtual override returns ( uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast ){
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function getReserves() public view virtual override returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
        uint amount = this.getTokenBReserve();
        _reserve0 = token0 == tokenB ? uint112(amount) : reserve0;
        _reserve1 = token1 == tokenB ? uint112(amount) : reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _safeTransfer( address token, address to, uint256 value ) private {
        (bool success, bytes memory data) = token.call( abi.encodeWithSelector(IERC20.transfer.selector, to, value) );
        require( success && (data.length == 0 || abi.decode(data, (bool))), "BananaSwap: TRANSFER_FAILED" );
    }

    // update reserves and, on the first call per block, price accumulators
    function _update( uint256 balance0, uint256 balance1, uint112 _reserve0, uint112 _reserve1 ) internal virtual {
        require( balance0 <= type(uint112).max && balance1 <= type(uint112).max, "BananaSwap: OVERFLOW" );
        uint32 blockTimestamp = uint32(block.timestamp % 2**32);
        unchecked {
            uint32 timeElapsed = blockTimestamp - blockTimestampLast; // overflow is desired
            if (timeElapsed > 0 && _reserve0 != 0 && _reserve1 != 0) {
                // * never overflows, and + overflow is desired
                price0CumulativeLast += uint256(UQ112x112.encode(_reserve1).uqdiv(_reserve0)) * timeElapsed;
                price1CumulativeLast += uint256(UQ112x112.encode(_reserve0).uqdiv(_reserve1)) * timeElapsed;
            }
        }
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = blockTimestamp;
        emit Sync(reserve0, reserve1);
    }

    // if fee is on, mint liquidity equivalent to 1/6th of the growth in sqrt(k)
    function _mintFee(uint112 _reserve0, uint112 _reserve1) private returns (bool feeOn) {
        address feeTo = IBananaSwapFactory(factory).feeTo();
        feeOn = feeTo != address(0);
        uint256 _kLast = kLast; // gas savings
        if (feeOn) {
            if (_kLast != 0) {
                uint256 rootK = Math.sqrt(uint256(_reserve0) * _reserve1);
                uint256 rootKLast = Math.sqrt(_kLast);
                if (rootK > rootKLast) {
                    uint256 numerator = totalSupply * (rootK - rootKLast);
                    uint256 denominator = rootK + rootKLast;
                    uint256 liquidity = numerator / denominator;
                    if (liquidity > 0) _mint(feeTo, liquidity);
                }
            }
        } else if (_kLast != 0) {
            kLast = 0;
        }
    }

    // this low-level function should be called from a contract which performs important safety checks
    function mint(address to) external override lock onlyRouter returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        if (_totalSupply == 0) {
            liquidity = Math.sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY;
            _mint(address(0), MINIMUM_LIQUIDITY); // permanently lock the first MINIMUM_LIQUIDITY tokens
        } else {
            liquidity = Math.min( (amount0 * _totalSupply) / _reserve0, (amount1 * _totalSupply) / _reserve1 );
        }
        require(liquidity > 0, "BananaSwap: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1; // reserve0 and reserve1 are up-to-date
        emit Mint(msg.sender, amount0, amount1);
    }

    // this low-level function should be called from a contract which performs important safety checks
    function burn(address to) external override lock onlyRouter returns (uint256 amount0, uint256 amount1) {
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf[address(this)];

        bool feeOn = _mintFee(_reserve0, _reserve1);
        uint256 _totalSupply = totalSupply; // gas savings, must be defined here since totalSupply can update in _mintFee
        amount0 = (liquidity * balance0) / _totalSupply; // using balances ensures pro-rata distribution
        amount1 = (liquidity * balance1) / _totalSupply; // using balances ensures pro-rata distribution
        require( amount0 > 0 && amount1 > 0, "BananaSwap: INSUFFICIENT_LIQUIDITY_BURNED" );
        _burn(address(this), liquidity);
        _safeTransfer(_token0, to, amount0);
        _safeTransfer(_token1, to, amount1);
        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1, _reserve0, _reserve1);
        if (feeOn) kLast = uint256(reserve0) * reserve1; // reserve0 and reserve1 are up-to-date
        emit Burn(msg.sender, amount0, amount1, to);
    }

    // given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure override returns (uint256 amountOut) {
        require(amountIn > 0, "BananaSwapLibrary: INSUFFICIENT_INPUT_AMOUNT");
        require( reserveIn > 0 && reserveOut > 0, "BananaSwapLibrary: INSUFFICIENT_LIQUIDITY" );
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = reserveIn * 1000 + amountInWithFee;
        amountOut = numerator / denominator;
    }
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal pure returns (uint256 amountIn) {
        require(amountOut > 0, "BananaSwapLibrary: INSUFFICIENT_OUTPUT_AMOUNT");
        require(
            reserveIn > 0 && reserveOut > 0,
            "BananaSwapLibrary: INSUFFICIENT_LIQUIDITY"
        );
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = numerator / denominator + 1;
    }

    // this low-level function should be called from a contract which performs important safety checks
    function swap( uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data ) external override lock onlyRouter {
        require( amount0Out > 0 || amount1Out > 0, "BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT" );
        (uint112 _reserve0, uint112 _reserve1, ) = getReserves(); // gas savings
        if (token0 == tokenB) require(amount0Out == 0, "BananaSwap: CAN'T_BUY_B");
        if (token1 == tokenB) require(amount1Out == 0, "BananaSwap: CAN'T_BUY_B");
        require( amount0Out < _reserve0 && amount1Out < _reserve1, "BananaSwap: INSUFFICIENT_LIQUIDITY");

        uint256 balance0;
        uint256 balance1;
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            require(to != _token0 && to != _token1, "BananaSwap: INVALID_TO");
            if (amount0Out > 0) _safeTransfer(_token0, to, amount0Out); // optimistically transfer tokens
            if (amount1Out > 0) _safeTransfer(_token1, to, amount1Out); // optimistically transfer tokens
            if (data.length > 0) IBananaSwapCallee(to).bananaSwapCall( msg.sender, amount0Out, amount1Out, data );
            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        uint256 amount0In = balance0 > reserve0 - amount0Out ? balance0 - (reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > reserve1 - amount1Out ? balance1 - (reserve1 - amount1Out) : 0;
        require( amount0In > 0 || amount1In > 0, "BananaSwap: INSUFFICIENT_INPUT_AMOUNT" );
        if (token0 == tokenB && amount0In > 0) IERC20(tokenB).transfer(0x000000000000000000000000000000000000dEaD, amount0In); 
        if (token1 == tokenB && amount1In > 0) IERC20(tokenB).transfer(0x000000000000000000000000000000000000dEaD, amount1In);
        {
            // scope for _token{0,1}, avoids stack too deep errors
            address _token0 = token0;
            address _token1 = token1;
            // scope for reserve{0,1}Adjusted, avoids stack too deep errors
            uint256 balance0Adjusted = balance0 * 1000 - amount0In * 3;
            uint256 balance1Adjusted = balance1 * 1000 - amount1In * 3;
            require( balance0Adjusted * balance1Adjusted >= uint256(reserve0) * reserve1 * 1e6, "BananaSwap: K" );

            balance0 = IERC20(_token0).balanceOf(address(this));
            balance1 = IERC20(_token1).balanceOf(address(this));
        }
        _update(balance0, balance1, _reserve0, _reserve1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    // force balances to match reserves
    function skim(address to) external override lock {
        address _token0 = token0; // gas savings
        address _token1 = token1; // gas savings
        _safeTransfer( _token0, to, IERC20(_token0).balanceOf(address(this)) - reserve0);
        _safeTransfer( _token1, to, IERC20(_token1).balanceOf(address(this)) - reserve1);
    }

    // force reserves to match balances
    function sync() external override lock {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)), reserve0, reserve1);
    }

    function setTokenB(address _tokenB) external onlyRole(MANAGER_ROLE) {
        tokenB = _tokenB;
        emit SetTokenB(msg.sender, _tokenB);
    }

    function addTokenBExcludeBalanceList(address[] memory accounts) external override onlyRole(MANAGER_ROLE) {
        require(accounts.length > 0, "array length 0");
        for (uint index; index < accounts.length; ++index) {
            if (!tokenBExcludeBalanceList.contains(accounts[index])) {
                tokenBExcludeBalanceList.add(accounts[index]);
            }
        }
    }

    function checkTokenBExcludeBalanceList(address account) external view override returns(bool) {
        return tokenBExcludeBalanceList.contains(account);
    }

    function removeTokenBExcludeBalanceList(address[] memory accounts) external override onlyRole(MANAGER_ROLE) {
        require(accounts.length > 0, "array length 0");
        for (uint index; index < accounts.length; ++index) {
            if (tokenBExcludeBalanceList.contains(accounts[index])) {
                tokenBExcludeBalanceList.remove(accounts[index]);
            }
        }
    }

    function getTokenBExcludeBalanceListLength() external view override returns(uint) {
        return tokenBExcludeBalanceList.length();
    }

    function getTokenBExcludeBalanceList() external view override returns(address[] memory) {
        return tokenBExcludeBalanceList.values();
    }

    function getTokenBReserve() external view override returns(uint) {
        require(tokenB != address(0), "tokenB 0");
        uint length = tokenBExcludeBalanceList.length();
        uint totalSupply = IERC20(tokenB).totalSupply();
        uint excludeTotal;        
        for (uint index; index < length; ++index) {
            uint balance = IERC20(tokenB).balanceOf(tokenBExcludeBalanceList.at(index));
            excludeTotal = excludeTotal + balance;
        }
        return totalSupply - excludeTotal;
    }

}