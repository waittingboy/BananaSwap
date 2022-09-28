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

async function deployTokenA() {
    let signers = await ethers.getSigners();
    let wallet = signers[0];
    let user = signers[1];
    console.log("wallet:", wallet.address);

    const commonTokenFactory = await ethers.getContractFactory("CommonToken");
    let usdt = await commonTokenFactory.attach("0x37DA7d277135336b7a1EC2aD99AcC100FA7Dc258");
    console.log("usdt address:", usdt.address);

    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await TokenManager.attach("0xcfAb64b3f7761e22Bae6Ff33Fd9a866d5d5D81Ab");
    console.log("TokenManager address:", tokenManager.address)

    // deploy router-swap
    const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
    const routerSwap = await BananaSwapFactory.attach("0x5973Be56d09a3d25C4e8f326E633F32460603362");
    console.log("routerSwap address:", routerSwap.address);

    const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
    const routerLiquid = await BananaLiquidFactory.attach("0x6B53cF7ac3A12b8CeE930FfAe245a11dB3a1E87f");
    console.log("routerLiquid address:", routerLiquid.address);

    const tokenAFeeHandlerFactory = await ethers.getContractFactory("TokenAFeeHandler");
    const tokenApple = await tokenAFeeHandlerFactory.deploy();
    console.log("tokenApple address:", tokenApple.address);
    await tokenApple.initialize("MUC", "MUC");
    await tokenApple.mint(wallet.address, expandTo18Decimals(10000000000), {gasLimit: "3600000"});

    {
		const ReflowFeeHandler = await ethers.getContractFactory("ReflowFeeHandler");
		const reflowFeeHandlerApple = await ReflowFeeHandler.deploy();
        console.log("reflowFeeHandlerApple:", reflowFeeHandlerApple.address);
		await reflowFeeHandlerApple.initialize(usdt.address, routerSwap.address, routerLiquid.address, expandTo18Decimals(10));
        let actionType = 4;
		let rewardType = 5;
		const rewardFeeRatio = 10000;
		let reflowRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandlerApple.address, needHandle: true };
		await tokenApple.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, {gasLimit: "4600000"});
        await tokenApple.addWeList([reflowFeeHandlerApple.address, wallet.address]);
    }

    await tokenManager.addTokenAList(tokenApple.address, true);
    // await tokenManager.associateA2B(tokenApple.address, tokenB.address, true);
}

async function deployBananaSwap() {
    let signers = await ethers.getSigners();
    let wallet = signers[0];
    console.log("wallet:", wallet.address);

    // deploy router-swap
    const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
    // await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    const routerSwap = await upgrades.deployProxy(
        BananaSwapFactory, 
        [
            "0x7DBc487089546cF46Dfa97d3fC3CA4E34b663F4d", 
            "0x2F30DFe998fFCac35345295f3700B8b5174F9752", 
            "0x6B9Ba0Ea9aA347Cd7C9DCa475DDcC05ef193f2c0", 
            "0xc492b6fAdDa2cEb3FcDE753894c90eab75050e97"
        ], 
        { initializer: "initialize" } 
    );
    console.log("routerSwap address:", routerSwap.address);
    await routerSwap.deployTransaction.wait(2);
    console.log("routerSwap Impl address:", await upgrades.erc1967.getImplementationAddress(routerSwap.address));
    console.log("routerSwap AdminAddress address:", await upgrades.erc1967.getAdminAddress(routerSwap.address));
    await routerSwap.setBananaQuery("0x59Cf3F9FC0A2F8b825cE53C49E330446eb8D77Be");
    await routerSwap.setUsdtFeeHandle("0xc492b6fAdDa2cEb3FcDE753894c90eab75050e97");
}

async function main() {
    
    let signers = await ethers.getSigners();
    let wallet = signers[0];
    let user = signers[1];
    console.log("wallet:", wallet.address);

    // await deployTokenA();
    // await deployBananaSwap();

    let myGasLimit = "4700000";
    const commonTokenFactory = await ethers.getContractFactory("CommonToken");
    const cake = await commonTokenFactory.deploy();
    await cake.initialize("CAKE", "CAKE", expandTo18Decimals(10000000000), {gasLimit: "4700000"});
    console.log("cake address:", cake.address);

    const usdt = await commonTokenFactory.deploy();
    await usdt.initialize("USDT", "USDT", expandTo18Decimals(10000000000), {gasLimit: "4700000"});
    console.log("usdt address:", usdt.address);

    const nana = await commonTokenFactory.deploy();
    await nana.initialize("NANA", "NANA", expandTo18Decimals(10000000000), {gasLimit: "4700000"});
    console.log("nana address:", nana.address);

    const dota = await commonTokenFactory.deploy();
    await dota.initialize("DOT", "DOT", expandTo18Decimals(10000000000), {gasLimit: "4700000"});
    console.log("dota address:", dota.address);

    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await TokenManager.deploy();
    console.log("TokenManager address:", tokenManager.address)

    const tokenAFeeHandlerFactory = await ethers.getContractFactory("BananaSwapToken");
    // deploy tokenA DDC
    const tokenDDC = await tokenAFeeHandlerFactory.deploy();
    console.log("tokenDDC address:", tokenDDC.address);
    await tokenDDC.initialize("DDC", "DDC", [10000], [wallet.address], expandTo18Decimals(10000000000), {gasLimit: myGasLimit});
    await tokenDDC.setInflationPattern(BigNumber.from("1"), {gasLimit: myGasLimit});
    console.log("tokenDDC mint address:", tokenDDC.address);

    // deploy tokenA apple
    const tokenApple = await tokenAFeeHandlerFactory.deploy();
    console.log("tokenApple address:", tokenApple.address);
    await tokenApple.initialize("Apple", "APPLE", [10000], [wallet.address], expandTo18Decimals(10000000000), {gasLimit: myGasLimit} );
    console.log("tokenApple mint address:", tokenApple.address);

    const RewardHandlerFactory = await ethers.getContractFactory("RewardHandler");
    const rewardHandler = await RewardHandlerFactory.deploy();
    await rewardHandler.initialize(nana.address, expandTo18Decimals(10000), nana.address);
    console.log("rewardHandler address:", rewardHandler.address);

    // set TokenA config
    { // buy tokenA 
        let actionType = 0;
        const rewardFeeRatio = 200;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        let rewardType = 0;
        await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        let nodeRewardFeeConfig2 = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig2, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 0 finished");
    }
    { // buy tokenA dividendRatio 1
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 1;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 1 finished");
    }
    { // buy tokenA dividendRatio 2
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 2;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: wallet.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 2 finished");
    }
    { // buy tokenA dividendRatio 3
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 3;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 3 finished");
    }
    { // buy tokenA dividendRatio 4
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 4;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 4 finished");
    }
    { // buy tokenA dividendRatio 6
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 6;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 6 finished");
    }
    { // buy tokenA dividendRatio 7
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 7;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: wallet.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 7 finished");
    }
    { // sell tokenA
        let actionType = 1;
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        let rewardType = 0;
        await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        let nodeRewardFeeConfig2 = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig2, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 1 finished");
    }
    { // sell tokenA dividendRatio 6
        let actionType = 1;
        const rewardFeeRatio = 300;
        let rewardType = 6;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 6 finished");
    }
    { // sell tokenA
        let actionType = 1;
        const rewardFeeRatio = 800;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
        let rewardType = 9;
        await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        let nodeRewardFeeConfig2 = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig2, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 1 finished");
    }
    { // pairA add liquidity
        let actionType = 2;
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
        let rewardType = 3;
        await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 2 finished");
    }
    { // pairA remove liquidity
        let actionType = 3;
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
        let rewardType = 3;
        await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
        console.log("tokenAFeeHandle.setFeeConfig actionType = 3 finished");
    }
    // { // tokenA transfer 3
    //     let actionType = 4;
    //     const rewardFeeRatio = 600;
    //     let nodeRewardFeeConfig = { feeRato: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
    //     let rewardType = 3;
    //     await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
    //     await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
    //     console.log("tokenAFeeHandle.setFeeConfig actionType = 4 rewardType = 3 finished");
    // }
    // { // tokenA transfer 4
    //     let actionType = 4;
    //     const rewardFeeRatio = 700;
    //     let rewardType = 4;
    //     let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
    //     await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
    //     console.log("tokenAFeeHandle.setFeeConfig actionType = 4 rewardType = 4 finished");
    // }

    // deploy tokenB
    const TokenBFactory = await ethers.getContractFactory("BananaToken");
    const tokenB = await TokenBFactory.deploy();
    console.log("Banana tokenB address:", tokenB.address);
    await tokenB.initialize("Banana", "Banana");
    await tokenB.mint(wallet.address, expandTo18Decimals(10000000000), {gasLimit: "2600000"});

    //deploy WETH 
    const weth = await ethers.getContractFactory("WETH9");
    const WETH = await weth.deploy();
    console.log("WETH address:", WETH.address);

    // usdtFeeHandle
    const usdtFeefactory = await ethers.getContractFactory("USDTFeeHandle");
    const usdtFeeHandle = await usdtFeefactory.deploy();
    
    // deploy V2 factory
    const v2factory = await ethers.getContractFactory("BananaSwapFactory");
    const factoryV2 = await v2factory.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
    console.log("factoryV2 address:", factoryV2.address);

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
    const pairB = await upgrades.deployProxy(TokenBPoolFactory, [pairBtoken0.address, pairBtoken1.address, tokenB.address, factoryV2.address, wallet.address], { initializer: "initialize" });
    console.log("pairB address:", pairB.address);

    await tokenManager.initialize(tokenB.address, usdt.address);
    await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await routerLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await routerQuery.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await routerSwap.setBananaQuery(routerQuery4Swap.address);
    await usdtFeeHandle.initialize(usdt.address, tokenB.address, pairB.address);
    console.log("usdtFeeHandle address:", usdtFeeHandle.address);

    {
        let aFeeConfig = {
            feeRatio: BigNumber.from("500"),
            fee4UserRatio: BigNumber.from("9000"),
            actionType: BigNumber.from("0")
        }
        await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("0"), aFeeConfig, true, {gasLimit: "4600000"});
        await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("0"), aFeeConfig, true, {gasLimit: "4600000"});
    }
    {
        let aFeeConfig = {
            feeRatio: BigNumber.from("500"),
            fee4UserRatio: BigNumber.from("9000"),
            actionType: BigNumber.from("1")
        }
        await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("1"), aFeeConfig, true, {gasLimit: "4600000"});
        await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("1"), aFeeConfig, true, {gasLimit: "4600000"});
    }
    {
        let aFeeConfig = {
            feeRatio: BigNumber.from("500"),
            fee4UserRatio: BigNumber.from("9000"),
            actionType: BigNumber.from("2")
        }
        await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("2"), aFeeConfig, true, {gasLimit: "4600000"});
        await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("2"), aFeeConfig, true, {gasLimit: "4600000"});
    }
    {
        let aFeeConfig = {
            feeRatio: BigNumber.from("500"),
            fee4UserRatio: BigNumber.from("9000"),
            actionType: BigNumber.from("3")
        }
        await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("3"), aFeeConfig, true, {gasLimit: "4600000"});
        await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("3"), aFeeConfig, true, {gasLimit: "4600000"});
    }

    await routerSwap.setUsdtFeeHandle(usdtFeeHandle.address);
    await routerLiquid.setUsdtFeeHandle(usdtFeeHandle.address);
    await routerQuery.setUsdtFeeHandle(usdtFeeHandle.address);

    await tokenManager.addTokenAList(tokenDDC.address, true);
    await tokenManager.addTokenAList(tokenApple.address, true);
    await tokenManager.addUsdtList(usdt.address, true);
    await tokenManager.addTokenBList(tokenB.address, true);
    await tokenManager.associateA2B(tokenDDC.address, tokenB.address, true);
    await tokenManager.associateA2B(tokenApple.address, tokenB.address, true);

    {
		const ReflowFeeHandler = await ethers.getContractFactory("ReflowFeeHandler");
		const reflowFeeHandlerDDC = await ReflowFeeHandler.deploy();
        console.log("reflowFeeHandlerDDC:", reflowFeeHandlerDDC.address);
		await reflowFeeHandlerDDC.initialize(usdt.address, routerSwap.address, routerLiquid.address, expandTo18Decimals(10));
		let actionType = 1;
		let rewardType = 5;
		const rewardFeeRatio = 500;
        let reflowRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandlerDDC.address, needHandle: true };
		await tokenDDC.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, {gasLimit: "4600000"});
        await tokenDDC.addWeList([reflowFeeHandlerDDC.address]);
    }
    {
		const ReflowFeeHandler = await ethers.getContractFactory("ReflowFeeHandler");
		const reflowFeeHandlerApple = await ReflowFeeHandler.deploy();
        console.log("reflowFeeHandlerApple:", reflowFeeHandlerApple.address);
		await reflowFeeHandlerApple.initialize(usdt.address, routerSwap.address, routerLiquid.address, expandTo18Decimals(10));
        let actionType = 1;
		let rewardType = 5;
		const rewardFeeRatio = 500;
		let reflowRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandlerApple.address, needHandle: true };
		await tokenApple.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, {gasLimit: "4600000"});
        await tokenApple.addWeList([reflowFeeHandlerApple.address])
    }
    { // buy tokenA dividendRatio 8 RepurchaseDestroyFeeHandler
        const RepurchaseDestroyFeeHandlerFactory = await ethers.getContractFactory("RepurchaseDestroyFeeHandler");
        const repurchaseDestroyFeeHandler = await RepurchaseDestroyFeeHandlerFactory.deploy();
        await repurchaseDestroyFeeHandler.initialize(usdt.address, routerSwap.address, expandTo18Decimals(10));
        console.log("repurchaseDestroyFeeHandler address:", repurchaseDestroyFeeHandler.address);
        await repurchaseDestroyFeeHandler.setPurchaseToken(nana.address,  {gasLimit: "4600000"});
        
        let actionType = 0;
        const rewardFeeRatio = 200;
        let rewardType = 8;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: repurchaseDestroyFeeHandler.address, needHandle: true };
        await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true, {gasLimit: "4600000"});
        console.log("tokenAFeeHandle.setFeeConfig actionType = 0 rewardType = 8 finished");
        await tokenApple.addWeList([repurchaseDestroyFeeHandler.address])
    }

    let MINTER_ROLE = await tokenB.MINTER_ROLE();
    await tokenB.grantRole(MINTER_ROLE, usdtFeeHandle.address);
    console.log("tokenB.grantRole afeter");
    let openTransfer = true;
    await tokenB.setOpenTransfer(openTransfer);

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

    await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "3900000"});
    await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, {gasLimit: "4600000"});
    await routerSwap4B.setUsdt(usdt.address, {gasLimit: "4600000"});
    await routerSwap4B.setPairB(pairB.address, {gasLimit: "4600000"});
    await routerSwap4B.setTokenB(tokenB.address, {gasLimit: "4600000"});

    console.log("tokenB.setTransferParams 0 ");
    await tokenB.setTransferParams(BigNumber.from("9999"), pairB.address, wallet.address, BigNumber.from("500"), BigNumber.from("500"), {gasLimit: "4600000"});
    console.log("tokenB.setTransferParams 1 ");
    await pairB.setRouterSwap4B(routerSwap4B.address, {gasLimit: "4600000"});

    await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), {gasLimit: "4600000"});
    console.log("====== routerSwap4B.initLiquid");
    
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
        await usdtFeeHandle.setBConfig(tokenB.address, bConfig, {gasLimit: "3600000"});
    }

    await factoryV2.createPair(usdt.address, tokenDDC.address, {gasLimit: "3600000"});
    let pairDDCAddr = await routerQuery.pairFor(usdt.address, tokenDDC.address);
    console.log("pairDDCAddr:", pairDDCAddr);
    
    let TimeLockFactory = await ethers.getContractFactory("FinalTimeLock");
    let timeLockDDC = await TimeLockFactory.deploy();
    await timeLockDDC.initialize(pairDDCAddr);
    console.log("timeLockDDC:", timeLockDDC.address);
    {
        let config = {
            openLockLiquid: true,
            lockLiquidDuration: BigNumber.from("300"),
            lpTimeLock: timeLockDDC.address
        };
        await tokenDDC.setLiquidityLockConfig(config, {gasLimit: "4600000"});
        console.log("tokenDDC setLiquidityLockConfig");
    }

    await factoryV2.createPair(usdt.address, tokenApple.address, {gasLimit: "3600000"});
    let pairAppleAddr = await routerQuery.pairFor(usdt.address, tokenApple.address);
    console.log("pairAppleAddr:", pairAppleAddr);

    let timeLockApple = await TimeLockFactory.deploy();
    await timeLockApple.initialize(pairAppleAddr);
    console.log("timeLockApple:", timeLockApple.address);
    {
        let config = {
            openLockLiquid: true,
            lockLiquidDuration: BigNumber.from("300"),
            lpTimeLock: timeLockApple.address
        };
        await tokenApple.setLiquidityLockConfig(config, {gasLimit: "4600000"});
        console.log("tokenApple setLiquidityLockConfig");
    }

    await nana.approve(routerLiquid.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});
    await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});
    await routerLiquid.addLiquidity(
        usdt.address,
        nana.address,
        expandTo18Decimals(100000),
        expandTo18Decimals(100000),
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256,
        {gasLimit: "6600000"}
    )

    await tokenApple.transfer(user.address, expandTo18Decimals(500000), {gasLimit: "4600000"});
    await usdt.transfer(user.address, expandTo18Decimals(500000), {gasLimit: "4600000"});
    await tokenDDC.transfer(user.address, expandTo18Decimals(500000), {gasLimit: "4600000"});

    await tokenApple.connect(user).approve(routerLiquid.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});
    await usdt.connect(user).approve(routerLiquid.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});
    await routerLiquid.connect(user).addLiquidity(
        usdt.address,
        tokenApple.address,
        expandTo18Decimals(100000),
        expandTo18Decimals(100000),
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256,
        {gasLimit: "6600000"}
    )

    await tokenApple.connect(user).approve(routerSwap.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});
    await usdt.connect(user).approve(routerSwap.address, ethers.constants.MaxUint256, {gasLimit: "4600000"});


    // const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
	// const oracleDDC = await oracleFactory.deploy();
    // console.log("oracleDDC address:", oracleDDC.address);

    // let initialPrice = 1;
	// await oracleDDC.initialize(factoryV2.address, tokenA.address, usdt.address, initialPrice, {gasLimit: "4600000"});
	// await tokenA.setOracle(oracleDDC.address, {gasLimit: "3900000"});

    // const oracleApple = await oracleFactory.deploy();
    // console.log("oracleApple address:", oracleApple.address);

    // await oracleApple.initialize(factoryV2.address, tokenApple.address, usdt.address, initialPrice, {gasLimit: "4600000"});
	// await tokenApple.setOracle(oracleApple.address, {gasLimit: "3900000"});

    console.log("---- deploy end");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
