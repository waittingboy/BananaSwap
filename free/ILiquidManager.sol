// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

interface ILiquidManager {
    event OpenBaseAddLiquid(address oper, address pair, bool value);
    event OpenAddLiquid(address oper, address pair, bool value);
    event OpenRemoveLiquid(address oper, bool value);
    event AddBaseLiquid(address pair, address user, uint tokenAAmt, uint tokenAAmtOfffee);

    function adminAddBaseLiquidList(
        address pair,
        address tokenAAddr,
        address[] memory accounts,
        uint[] memory  tokenAAmts
    ) external;
    
    function addBaseLiquid(address pair, address user, uint tokenAAmt, uint tokenAAmtOfffee) external returns(uint amt);

    function openBaseAddLiquid(address pair, bool value) external;
    function checkOpenBaseAddLiquid(address pair) external view returns(bool);

    function openAddLiquid(address pair, bool value) external;
    function checkAddLiquid(address pair) external view returns(bool);

    function openRemoveLiquid(address pair, bool flag) external;
    function checkRemoveLiquid(address pair) external view returns(bool);

    function addWhiteList(address pair, address[] memory users, bool[] memory values) external;
    function whiteList(address _pair, address user) external view returns(bool);

    function addBlackList(address pair, address[] memory users, bool[] memory values) external;
    function blackList(address _pair, address user) external view returns(bool);

    function lockLiquid(address pair, address user, uint256 liquidity) external;
}