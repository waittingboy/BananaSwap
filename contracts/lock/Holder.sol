//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/TransferHelper.sol";
// import "hardhat/console.sol";

contract Holder is Ownable {

    using SafeMath for uint256;
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableMap for EnumerableMap.UintToAddressMap;

    struct Order {
        address tokenAddr;
        uint256 lockAmount;
        uint256 startTime;
        uint256 endTime;
        uint claim;
    }

    EnumerableSet.AddressSet private _tokens;
    //address==>Order[]
    mapping(address => Order[]) userOrders;
    //token=>lockAmount
    mapping(address => uint256) tokenLockAmounts;
    address public feeAddress;
    uint256[] public dates;
    uint256 public feeAmount = 8 * 10 ** 17;

    event Lock(address user, address tokenAddr, uint256 value, uint256 time);
    event UnLock(address user, address tokenAddr, uint256 value);

    constructor(address _feeAddress) {
        dates.push(1 days);
        dates.push(7 days);
        dates.push(15 days);
        dates.push(30 days);
        dates.push(90 days);
        dates.push(180 days);
        dates.push(360 days);
        dates.push(540 days);
        dates.push(720 days);
        dates.push(900 days);
        dates.push(1080 days);

        feeAddress = _feeAddress;
    }

    function lock(address _tokenAddr, uint256 _amount, uint256 _seconds) external payable returns (bool){
        require(_tokenAddr != address(0), "invalid token address");
        require(_amount > 0, "amount must be greater than 0");
        require(_seconds >= dates[0] && _seconds <= dates[dates.length - 1], "invalid time");
        
        // fee
        require(msg.value >= feeAmount, "invalid bnb fee");
        TransferHelper.safeTransferETH(feeAddress, feeAmount);
        if (msg.value > feeAmount) { // refund rest fee
            TransferHelper.safeTransferETH(msg.sender, msg.value.sub(feeAmount));
        }

        IERC20(_tokenAddr).transferFrom(msg.sender, address(this), _amount);
        Order memory order = Order(_tokenAddr, _amount, block.timestamp, block.timestamp.add(_seconds), 0);
        userOrders[msg.sender].push(order);
        tokenLockAmounts[_tokenAddr] = tokenLockAmounts[_tokenAddr].add(_amount);
        if (!EnumerableSet.contains(_tokens, _tokenAddr)) {
            EnumerableSet.add(_tokens, _tokenAddr);
        }
        emit Lock(msg.sender, _tokenAddr, _amount, _seconds);
        return true;
    }

    function unlock(uint _index) external returns (bool) {
        require(userOrders[msg.sender].length - 1 >= _index, "invalid index");
        Order storage order = userOrders[msg.sender][_index];
        require(order.claim == 0, "claimed");
        require(block.timestamp >= order.endTime, "unlock time not reached");
        order.claim = 1;

        uint256 withdrawAmount = getLockAmount(order.tokenAddr,order.lockAmount);
        IERC20(order.tokenAddr).transfer(msg.sender, withdrawAmount);
        tokenLockAmounts[order.tokenAddr] = tokenLockAmounts[order.tokenAddr].sub(order.lockAmount);
        emit UnLock(msg.sender, order.tokenAddr, order.lockAmount);
        return true;
    }

    function getLockAmount(address tokenAddr,uint lockAmount) internal  view returns(uint256){
        uint256 balance =  IERC20(tokenAddr).balanceOf(address(this));
        uint256 totalAmount = tokenLockAmounts[tokenAddr];
        uint256 withdrawAmount = balance.mul(1e16).div(totalAmount).mul(lockAmount).div(1e16);
        return withdrawAmount;
    }

    function getOrders() public view returns (Order[] memory order){
        return userOrders[msg.sender];
    }

    function getUserOrderLength() public view returns (uint){
        return userOrders[msg.sender].length;
    }

    function getOrder(uint _index) public view returns (Order memory order){
        return userOrders[msg.sender][_index];
    }

    function getPercentOrders() public view returns (Order[] memory orders){
        uint256 orderLength = userOrders[msg.sender].length;
        orders = new Order[](orderLength);
        for(uint i = 0; i < orderLength; i++) {
            orders[i]  = getOrderView(i);
        }
        return orders;
    }

    function getPercentOrder(uint _index) public view returns (Order memory order){
         uint256 orderLength = userOrders[msg.sender].length;
         return orderLength > _index? getOrderView(_index) : userOrders[msg.sender][_index];
    }

    function getOrderView(uint _index) internal view returns(Order memory order){
        Order memory  userOrder = userOrders[msg.sender][_index];
        uint256 withdrawAmount = getLockAmount(userOrder.tokenAddr,userOrder.lockAmount);
        order =  Order(userOrder.tokenAddr, withdrawAmount, userOrder.startTime, userOrder.endTime, userOrder.claim);
        return order;
    }

    function canUnlock(uint _index) public view returns (bool){
        return block.timestamp >= userOrders[msg.sender][_index].endTime ? true : false;
    }

    function getTokens() public view returns (address[] memory tokens){
        tokens = new address[](getTokensLength());
        for (uint i = 0; i < getTokensLength(); i++) {
            tokens[i] = EnumerableSet.at(_tokens, i);
        }
        return tokens;
    }

    function getTokensLength() public view returns (uint){
        return EnumerableSet.length(_tokens);
    }

    function getToken(uint256 _index) public view returns (address){
        require(_index <= getTokensLength() - 1, "index out of bounds");
        return EnumerableSet.at(_tokens, _index);
    }

    function getTokenLockAmounts(address _tokenAddr) public view returns(uint256){
        return tokenLockAmounts[_tokenAddr];
    }

    function containsToken(address _tokenAddr) public view returns (bool) {
        return EnumerableSet.contains(_tokens, _tokenAddr);
    }

    function setDate(uint _index, uint256 _seconds) external onlyOwner returns (bool){
        if(_index > 0){
            require(_seconds > dates[_index-1], "invalid seconds");
        }

        if(_index < dates.length -1){
            require(_seconds < dates[_index+1], "invalid seconds");
        }
        dates[_index] = _seconds;
        return true;
    }

    function setFeeAddress(address _feeAddress) public onlyOwner returns(bool){
        feeAddress = _feeAddress;
        return true;
    }

    function setFeeAmount(uint256 _feeAmount) external onlyOwner {
        feeAmount = _feeAmount;
    }

}