// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../banana/RepurchaseDestroyFeeHandler.sol"; 

contract RepurchaseDestroyFeeHandlerDeployFactory {

    event DeployLog(address indexed operator, address admin, address impl, address proxy);

    function deployProxy(
        address adminOwner, 
        address proxyOwner, 
        address _usdtAddress, 
        address _uniswapV2Router, 
        uint _threshold,
        address _tokenB
    ) external returns(address _admin, address _proxy, address _impl) {
        bytes memory _data = abi.encodeWithSelector(bytes4(keccak256("initialize(address,address,uint256,address)")), _usdtAddress, _uniswapV2Router, _threshold, _tokenB);

        ProxyAdmin proxyAdmin = new ProxyAdmin();
        _admin = address(proxyAdmin);

        RepurchaseDestroyFeeHandler impl = new RepurchaseDestroyFeeHandler();
        _impl = address(impl);

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(_impl, _admin, _data);
        _proxy = address(proxy);

        proxyAdmin.transferOwnership(adminOwner);

        RepurchaseDestroyFeeHandler handler = RepurchaseDestroyFeeHandler(_proxy);
        handler.setManager(address(this), false);
        handler.setManager(proxyOwner, true);
        handler.transferOwnership(proxyOwner);

        emit DeployLog(msg.sender, _admin, _impl, _proxy);
    }
}