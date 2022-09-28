// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../CoinAllocation.sol"; 

contract CoinAllocationDeployFactory {

    event DeployLog(address indexed operator, address admin, address impl, address proxy);

    function deployProxy(address adminOwner, address proxyOwner, address tokenAddress) external returns (address _admin, address _proxy, address _impl) {
        bytes memory _data = abi.encodeWithSelector(bytes4(keccak256("initialize(address)")), tokenAddress);

        ProxyAdmin proxyAdmin = new ProxyAdmin();
        _admin = address(proxyAdmin);

        CoinAllocation impl = new CoinAllocation();
        _impl = address(impl);

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(_impl, _admin, _data);
        _proxy = address(proxy);

        proxyAdmin.transferOwnership(adminOwner);

        CoinAllocation handler = CoinAllocation(_proxy);
        handler.transferOwnership(proxyOwner);

        emit DeployLog(msg.sender, _admin, _impl, _proxy);
    }
}