# BananaSwap

Build BananaSwap with Solidity 0.8+

## BSC Mainnet

### 1 账户信息汇总
```
deployer
0x58432Cf8c7f46c59f6f83306A4b58ee6ECa8aECE
 
Feeto手续费钱包
0x376BD87EBDd0fC66B41f04C980dc90d3Eb3A2179

领取奖励钱包
0xBCD777Ee32ddBd7CE36337CbFdeff9c72671F70B

Banana币生态建设钱包
0xEb1aDf8A02af7D5CF4ff6875c6fFa1340a346D86

发tokenA使用的钱包
0x1a8dEf16f2b9A69743Fb301f82Bd61DDFA65F7F6

DDC生态建设钱包
0x3b3095D0F80Fe533A826094791dD142338dF16FC

DDC市场营销钱包
0x0b86A52a33Ab78aA953c36509defE757dCD75a2e
```

### 2 bsc主链第一版

```
2022年 8月26日 星期五 14时51分20秒 CST
deployer         : 0x58432Cf8c7f46c59f6f83306A4b58ee6ECa8aECE
usdt             : 0x55d398326f99059ff775485246999027b3197955
WETH             : 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
Banana           : 0x2fD6ba48e977Ff38bF9c43A9ba9DaC72A1f88195

codeHash         : c5564e611b966954f9ac6bf876e38c89499892a8f82d72ae80352d51e7917fd9
factory          : 0x4a14021C00233313360664384EC68dDd67be3302
setFeeTo         : 0x376BD87EBDd0fC66B41f04C980dc90d3Eb3A2179
routerSwap       : 0x22Dc25866BB53c52BAfA6cB80570FC83FC7dd125
routerLiquid     : 0x6bb1165C8bee838a213dE2608C7A1d575b63e918
routerQuery      : 0xa38fc5838bD6c0b333F21EE969a012aC00Aa2410
routerSwap4B     : 0xA27767E2FCf2A138a831F9FdD05c7AdEd77A7413
pairB            : 0x2F0908Ab762AB3a48566c8a2EdD4fA973E55CE2F

TokenManager     : 0x547aE92f7c0a7aD4230fb12a348BC56810dF3868
usdtFeeHandle    : 0x8672cfB5F822C38D9023c84cBbBF4471aCd5c93C
rewardHandler    : 0xE1a5f7Cb03A5Ff1F7B68c89A9E423Fa1A8255D4d

coinLockDeployFactory                     : 0xE1D8CDecf0B9638fd36aF40F67C59300B65cf2Ff
reflowFeeHandlerDeployFactory             : 0xC0f05dE3EDc981Ce8bE9FbD1c1967FE277B3c612
repurchaseDestroyFeeHandlerDeployFactory  : 0xF3885Cd171F86233F075A66F375e2630578a5308

routerQuery4Swap : 0x2208DcA4A9d19B1592518FA2ba27479E1945710a
```

### 3 deploy log
```
---- deploy start
wallet: 0x58432Cf8c7f46c59f6f83306A4b58ee6ECa8aECE
usdt address: 0x55d398326f99059ff775485246999027b3197955
WETH address: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
Banana tokenB address: 0x2fD6ba48e977Ff38bF9c43A9ba9DaC72A1f88195
TokenManager address: 0x547aE92f7c0a7aD4230fb12a348BC56810dF3868
tokenManager Impl address 0xEfADce528668B7315887220fD539842BC6E6f964
usdtFeeHandle address: 0x8672cfB5F822C38D9023c84cBbBF4471aCd5c93C
usdtFeeHandle Impl address 0xE932fB810dad56d2aE5a9c52114e7992ADDC9b53
factory address: 0x4a14021C00233313360664384EC68dDd67be3302
factory setFeeTo: 0x376BD87EBDd0fC66B41f04C980dc90d3Eb3A2179
routerSwap address: 0x22Dc25866BB53c52BAfA6cB80570FC83FC7dd125
routerLiquid address: 0x6bb1165C8bee838a213dE2608C7A1d575b63e918
routerQuery address: 0xa38fc5838bD6c0b333F21EE969a012aC00Aa2410
routerQuery4Swap address: 0x2208DcA4A9d19B1592518FA2ba27479E1945710a
pairB token0: 0x2fD6ba48e977Ff38bF9c43A9ba9DaC72A1f88195
pairB token1: 0x55d398326f99059ff775485246999027b3197955
pairB address 0x2F0908Ab762AB3a48566c8a2EdD4fA973E55CE2F
pairB Impl address 0xDAdb8175036D6e9C73F32eaeCD81161Fe71A9023
usdtFeeHandle.setBPair pairB address: 0x2F0908Ab762AB3a48566c8a2EdD4fA973E55CE2F
routerSwap initialize
routerLiquid initialize
routerQuery initialize
routerQuery4Swap initialize
routerSwap setBananaQuery
tokenManager.addUsdtList
tokenManager.addTokenBList
tokenManager.addRouter 0 
tokenManager.addRouter 1 
tokenB.setManager usdtFeeHandle  afeter
pairB.addTokenBExcludeBalanceList afeter
routerSwap4B address: 0xA27767E2FCf2A138a831F9FdD05c7AdEd77A7413
routerSwap4B initialize: 0xA27767E2FCf2A138a831F9FdD05c7AdEd77A7413
routerSwap4B.setUsdtFeeHandle
routerSwap4B.setUsdt
routerSwap4B.setPairB
routerSwap4B.setTokenB
tokenB.setTransferParams 0 
tokenB.setTransferParams 1 
tokenB.setRouterSwap4B 
====== routerSwap4B.initLiquid
tokenB.setTransferParams 3 
tokenB.setTransferParams 4 
usdtFeeHandle.setBConfig
tokenManager.setManager tokenA deployer
usdtFeeHandle.setManager tokenA deployer
ConnectTimeoutError: Connect Timeout Error
    at onConnectTimeout (/Users/admin/swap/git/freedom/contract/node_modules/undici/lib/core/connect.js:131:24)
    at /Users/admin/swap/git/freedom/contract/node_modules/undici/lib/core/connect.js:78:46
    at Immediate._onImmediate (/Users/admin/swap/git/freedom/contract/node_modules/undici/lib/core/connect.js:119:9)
    at processImmediate (internal/timers.js:464:21) {
  code: 'UND_ERR_CONNECT_TIMEOUT',
  transactionHash: '0x6ae100290578d88d952cdfb380076da00695a1e6e60a1b351eebb66d8e190361'
}
rewardHandler address: 0xE1a5f7Cb03A5Ff1F7B68c89A9E423Fa1A8255D4d
rewardHandler Impl address 0x234E27998d60A0476bF83C6F4f9baC8824Fe0106
coinLockDeployFactory address: 0xE1D8CDecf0B9638fd36aF40F67C59300B65cf2Ff
reflowFeeHandlerDeployFactory address: 0xC0f05dE3EDc981Ce8bE9FbD1c1967FE277B3c612
repurchaseDestroyFeeHandlerDeployFactory address: 0xF3885Cd171F86233F075A66F375e2630578a5308
---- deploy end
```

## BSC Testnet

