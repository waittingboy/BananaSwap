//SPDX-License-Identifier: MIT
pragma solidity =0.8.4;

import "./interfaces/IBananaSwapFactory.sol";
import "./BananaSwapPair.sol";
import "./libraries/BananaSwapLibrary.sol";

contract BananaSwapFactory is IBananaSwapFactory {
    bytes32 public constant PAIR_HASH = keccak256(type(BananaSwapPair).creationCode);

    address public override feeTo;
    address public override feeToSetter;
    ITokenManager public tokenManager;
    IUSDTFeeHandle public usdtFeeHandle;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address _feeToSetter,ITokenManager _tokenManager, IUSDTFeeHandle _usdtFeeHandle) {
        feeToSetter = _feeToSetter;
        tokenManager = _tokenManager;
        usdtFeeHandle = _usdtFeeHandle;
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        require(tokenA != tokenB, "BananaSwap: IDENTICAL_ADDRESSES");
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(token0 != address(0), "BananaSwap: ZERO_ADDRESS");
        require(getPair[token0][token1] == address(0), "BananaSwap: PAIR_EXISTS"); // single check is sufficient
        pair = address(
            new BananaSwapPair{
                salt: keccak256(abi.encodePacked(token0, token1))
            }()
        );
        IBananaSwapPair(pair).initialize(token0, token1, tokenManager, usdtFeeHandle);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // populate mapping in the reverse direction
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address _feeTo) external override {
        require(msg.sender == feeToSetter, "BananaSwap: FORBIDDEN");
        feeTo = _feeTo;
    }

    function setFeeToSetter(address _feeToSetter) external override {
        require(msg.sender == feeToSetter, "BananaSwap: FORBIDDEN");
        feeToSetter = _feeToSetter;
    }

    function pairFor(address tokenA, address tokenB) external view  override returns (address pair) {
        return BananaSwapLibrary.pairFor(address(this), tokenA, tokenB);
    }
}
