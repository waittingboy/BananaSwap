import { BigNumberish } from "ethers";

const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");
const { BN } = require("@openzeppelin/test-helpers");

async function withDecimals(amount: number) {
    return new BN(amount).mul(new BN(10).pow(new BN(18))).toString();
}

function expandTo18Decimals(n: number) {
    return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
}

async function main() {
    console.log("---- deploy start");

    let signers = await ethers.getSigners();
    let wallet = signers[0];
    console.log("wallet:", wallet.address);

    const commonTokenFactory = await ethers.getContractFactory("CommonToken");
    const usdt = await commonTokenFactory.deploy();
    await usdt.initialize("USDT", "USDT", expandTo18Decimals(10000000000), {gasLimit: "4700000"});
    console.log("usdt address:", usdt.address);

     // deploy tokenB
     const TokenBFactory = await ethers.getContractFactory("BananaToken");
     const tokenB = await TokenBFactory.deploy();
     await tokenB.deployed();
     console.log("Banana tokenB address:", tokenB.address);
     
     let tx = await tokenB.initialize("anana", "ANANA", { gasLimit: "6000000" });
     await tx.wait();
     console.log("Banana initialize", tokenB.address);
 
     tx = await tokenB.mint(wallet.address, expandTo18Decimals(1), { gasLimit: "6000000" });
     await tx.wait();
     console.log("Banana mint address:", tokenB.address);

    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await upgrades.deployProxy(TokenManager, [tokenB.address, usdt.address], { initializer: "initialize" });
    console.log("TokenManager address:", tokenManager.address);
    await tokenManager.deployTransaction.wait(2);
    console.log("tokenManager Impl address", await upgrades.erc1967.getImplementationAddress(tokenManager.address)); 

    //deploy WETH 
    const weth = await ethers.getContractFactory("WETH9");
    const WETH = await weth.deploy();
    console.log("WETH address:", WETH.address);

    // usdtFeeHandle
    const USDTFeeHandleFactory = await ethers.getContractFactory("USDTFeeHandle");
    const usdtFeeHandle = await upgrades.deployProxy(
        USDTFeeHandleFactory, 
        [usdt.address, tokenB.address, ethers.constants.AddressZero], 
        { initializer: "initialize" }
    );
    console.log("usdtFeeHandle address:", usdtFeeHandle.address);
    await usdtFeeHandle.deployTransaction.wait(2);
    console.log("usdtFeeHandle Impl address", await upgrades.erc1967.getImplementationAddress(usdtFeeHandle.address)); 
    
    // // deploy V2 factory
    const v2factory = await ethers.getContractFactory("BananaSwapFactory");
    const factoryV2 = await v2factory.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
    console.log("factory address:", factoryV2.address);

    await factoryV2.setFeeTo(wallet.address, {gasLimit: "4700000"});
    console.log("factory setFeeTo:", wallet.address);

    // deploy router-swap
    const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
    const routerSwap = await BananaSwapFactory.deploy();
    console.log("routerSwap address:", routerSwap.address);

    const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
    const routerLiquid = await BananaLiquidFactory.deploy();
    console.log("routerLiquid address:", routerLiquid.address);

    const BananaQuertyFactory = await ethers.getContractFactory("BananaQuery");
    const routerQuery = await BananaQuertyFactory.deploy();
    console.log("routerQuery address:", routerQuery.address);

    const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
    const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
    console.log("routerQuery4Swap address:", routerQuery4Swap.address);

    // pairB
    let pairBtoken0 = tokenB.address > usdt.address ? usdt : tokenB; // token 0 is TokenB
    let pairBtoken1 = tokenB.address > usdt.address ? tokenB : usdt;
    console.log("pairB token0:", pairBtoken0.address);
    console.log("pairB token1:", pairBtoken1.address);

    const TokenBPoolFactory = await ethers.getContractFactory("TokenBPool");
    const pairB = await upgrades.deployProxy(
        TokenBPoolFactory, 
        [pairBtoken0.address, pairBtoken1.address, tokenB.address, factoryV2.address, wallet.address], 
        { initializer: "initialize"
    });
    console.log("pairB address:", pairB.address);

    await pairB.deployTransaction.wait(2);
    console.log("pairB Impl address", await upgrades.erc1967.getImplementationAddress(pairB.address)); 

    await usdtFeeHandle.setBPair(pairB.address);
    console.log("usdtFeeHandle.setBPair pairB address:", pairB.address);

    await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "4700000"});
    console.log("routerSwap initialize");

    await routerLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "4700000"});
    console.log("routerLiquid initialize");

    await routerQuery.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "4700000"});
    console.log("routerQuery initialize");

    await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "4700000"});
    console.log("routerQuery4Swap initialize");

    await routerSwap.setBananaQuery(routerQuery4Swap.address, {gasLimit: "4700000"});
    console.log("routerSwap setBananaQuery");

    await tokenManager.addUsdtList(usdt.address, true, {gasLimit: "4700000"});
    await tokenManager.addTokenBList(tokenB.address, true, {gasLimit: "4700000"});

    await tokenManager.addRouter(routerLiquid.address, true, {gasLimit: "4700000"});
    await tokenManager.addRouter(routerSwap.address, true, {gasLimit: "4700000"});

    await tokenB.setManager(usdtFeeHandle.address, true);
    console.log("tokenB.setManager afeter");

    let accounts = [
        wallet.address, 
        usdtFeeHandle.address,
        "0x000000000000000000000000000000000000dEaD",
        "0x0000000000000000000000000000000000000000"
    ];
    await pairB.addTokenBExcludeBalanceList(accounts);
    console.log("pairB.addTokenBExcludeBalanceList afeter");

    const BananaSwap4BFactory = await ethers.getContractFactory("BananaSwap4B");
    const routerSwap4B = await BananaSwap4BFactory.deploy();
    console.log("routerSwap4B address:", routerSwap4B.address);

    await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "4700000"});
    console.log("routerSwap4B initialize:", routerSwap4B.address);

    await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, {gasLimit: "4700000"});
    await routerSwap4B.setUsdt(usdt.address, {gasLimit: "4700000"});
    await routerSwap4B.setPairB(pairB.address, {gasLimit: "4700000"});
    await routerSwap4B.setTokenB(tokenB.address, {gasLimit: "4700000"});

    console.log("tokenB.setTransferParams 0 ");
    await tokenB.setTransferParams(BigNumber.from("10000"), pairB.address, wallet.address, BigNumber.from("0"), BigNumber.from("0"), {gasLimit: "4700000"});
    console.log("tokenB.setTransferParams 1 ");
    await pairB.setRouterSwap4B(routerSwap4B.address, {gasLimit: "4700000"});

    await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), {gasLimit: "4700000"});
    console.log("====== routerSwap4B.initLiquid");

    console.log("tokenB.setTransferParams 3 ");
    await tokenB.setTransferParams(BigNumber.from("9900"), pairB.address, wallet.address, BigNumber.from("500"), BigNumber.from("500"), {gasLimit: "4700000"});
    console.log("tokenB.setTransferParams 4 ");
    {
        let tokenBExist = true;
        let bConfig = {
            sellFeeRatio: BigNumber.from("1000"),
            sellToBPoolRatio: BigNumber.from("5000"),
            sellToBPoolAddr: pairB.address,
            sellShareRatios: [5000],
            sellShareAddrs: [wallet.address],
            bExist: tokenBExist
        }
        await usdtFeeHandle.setBConfig(tokenB.address, bConfig, {gasLimit: "4700000"});
        console.log("usdtFeeHandle.setBConfig");
    }

    const CoinLockDeployFactoryFactory = await ethers.getContractFactory("CoinLockDeployFactory");
    const coinLockDeployFactory = await CoinLockDeployFactoryFactory.deploy();
    console.log("coinLockDeployFactory address:", coinLockDeployFactory.address);

    const ReflowFeeHandlerDeployFactoryFactory = await ethers.getContractFactory("ReflowFeeHandlerDeployFactory");
    const reflowFeeHandlerDeployFactory = await ReflowFeeHandlerDeployFactoryFactory.deploy();
    console.log("reflowFeeHandlerDeployFactory address:", reflowFeeHandlerDeployFactory.address);

    const RepurchaseDestroyFeeHandlerDeployFactoryFactory = await ethers.getContractFactory("RepurchaseDestroyFeeHandlerDeployFactory");
    const repurchaseDestroyFeeHandlerDeployFactory = await RepurchaseDestroyFeeHandlerDeployFactoryFactory.deploy();
    console.log("repurchaseDestroyFeeHandlerDeployFactory address:", repurchaseDestroyFeeHandlerDeployFactory.address);

    // usdtFeeHandle
    const RewardHandlerFactory = await ethers.getContractFactory("RewardHandler");
    const rewardHandler = await upgrades.deployProxy(
        RewardHandlerFactory, 
        [usdt.address, expandTo18Decimals(10), wallet.address], 
        { initializer: "initialize" }
    );
    console.log("rewardHandler address:", rewardHandler.address);
    await rewardHandler.deployTransaction.wait(2);
    console.log("rewardHandler Impl address", await upgrades.erc1967.getImplementationAddress(rewardHandler.address)); 

    // const HolderFactory = await ethers.getContractFactory("Holder");
    // const holder = await HolderFactory.deploy();
    // await holder.deployed();
    // console.log("holder address:", holder.address);

    console.log("---- deploy end");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
