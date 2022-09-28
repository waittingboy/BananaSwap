import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { BananaQuery, ITokenAFeeHandler, IBananaSwapPair, TokenManager } from "../types";
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import bn from 'bignumber.js';
const utilities = require('./shared/utilities');

const { time } = require("./shared");

const blackHoleAddress = "000000000000000000000000000000000000dEaD";
const overrides = {
    gasLimit: 9999999
}
import {
    expandTo18Decimals,
    getApprovalDigest,
    MINIMUM_LIQUIDITY,
    setNextBlockTime,
} from "./shared/utilities";
import exp from "constants";
const baseRatio = 10000;

describe("BananaSwapLiquidV2", () => {
    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function v2Fixture([wallet, user]: Wallet[], provider: MockProvider) {
        const token = await ethers.getContractFactory("SmartERC20");
        const tokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
        const TokenManager = await ethers.getContractFactory("TokenManager");
        const tokenManager = await TokenManager.deploy();
        const bananaLiquid = await (await ethers.getContractFactory("BananaLiquid")).deploy();
        // deploy tokens
        let mintAmount = expandTo18Decimals(10000);
        const tokenA = await tokenAFeeHandler.deploy();
        await tokenA.initialize("tokenA token", "tokenA",[10000],[wallet.address],mintAmount);
        // await tokenA.born(wallet.address, mintAmount);
        const tokenB = await tokenAFeeHandler.deploy();
        await tokenB.initialize("tokenB token", "BananaToken",[10000],[wallet.address],mintAmount);
        // await tokenB.born(wallet.address, mintAmount);
        const tokenBB = await token.deploy(expandTo18Decimals(10000));
        const usdt = await token.deploy(expandTo18Decimals(10000));

        const weth = await ethers.getContractFactory("WETH9");
        const WETH = await weth.deploy();

        const erc20 = await ethers.getContractFactory("SmartERC20");
        const WETHPartner = await tokenAFeeHandler.deploy();
        await WETHPartner.initialize("tokenB token", "BananaToken",[10000],[wallet.address],expandTo18Decimals(10000));
        // await WETHPartner.born(wallet.address, expandTo18Decimals(10000));

        const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
        const usdtFeeHandle = await usdtFeeFactory.deploy();
        // deploy V2
        const v2factory = await ethers.getContractFactory("BananaSwapFactory");
        const factoryV2 = await v2factory.deploy(wallet.address,tokenManager.address,usdtFeeHandle.address);

        const routerEmit = await ethers.getContractFactory("RouterEventEmitter");

        const RouterEmit = await routerEmit.deploy();
        const FeeHandler = await ethers.getContractFactory("FeeHandler");
        const feeHandler = await FeeHandler.deploy();

        const rewardHandlerFactory = await ethers.getContractFactory("RewardHandler");
        const rewardHandler = await rewardHandlerFactory.deploy();
        // deploy routers
        const router = await ethers.getContractFactory("BananaSwap");
        const bananaSwap = await router.deploy();

        const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
        const oracle = await oracleFactory.deploy();
        

        tokenManager.initialize(tokenBB.address, usdt.address);
        await bananaSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        const bananaQuery4Swap = await (await ethers.getContractFactory("BananaQuery4Swap")).deploy();
        await bananaQuery4Swap.initialize(factoryV2.address,WETH.address,tokenManager.address,feeHandler.address);
        console.log("bananaQuery4Swap.address is:",bananaQuery4Swap.address);
        await bananaSwap.setBananaQuery(bananaQuery4Swap.address);
        // await bananaSwap.setTokenManager(tokenManager.address);
        // initialize V2
        await factoryV2.createPair(tokenA.address, tokenB.address);
        await factoryV2.createPair(tokenA.address, WETHPartner.address);
        await factoryV2.createPair(tokenA.address, usdt.address);
        const newTokenAUsdtPairAddress = await factoryV2.getPair(tokenA.address,usdt.address);
        const pairFactory = await ethers.getContractFactory("BananaSwapPair");
        const newTokenAUsdtPair = new Contract(
            newTokenAUsdtPairAddress,
            pairFactory.interface,
            provider
        ).connect(wallet);
        const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address);

        
        const pair = new Contract(
            pairAddress,
            pairFactory.interface,
            provider
        ).connect(wallet);

        const token0Address = await pair.token0();
        
        const token0 = tokenA.address === token0Address ? tokenA : tokenB;
        const token1 = tokenA.address === token0Address ? tokenB : tokenA;

        await factoryV2.createPair(WETH.address, WETHPartner.address);
        const WETHPairAddress = await factoryV2.getPair(
            WETH.address,
            WETHPartner.address
        );

        const wethPair = new Contract(
            WETHPairAddress,
            pairFactory.interface,
            provider
        ).connect(wallet);

        const pairTokenAUsdtAddress = await factoryV2.getPair(tokenA.address, WETHPartner.address);
        const tokenAUsdtPair = new Contract(
            pairTokenAUsdtAddress,
            pairFactory.interface,
            provider
        ).connect(wallet);
        const BananaQueryFactory = await ethers.getContractFactory("BananaQuery");
        const routerQuery = await BananaQueryFactory.deploy();
        await routerQuery.initialize(factoryV2.address,WETH.address,tokenManager.address,feeHandler.address);

        // pairB
        let pairBToken0 = tokenB; // token 0 is TokenB
        let pairBToken1 = usdt;

        const tokenBPool = await ethers.getContractFactory("TokenBPool");
        const pairB = await upgrades.deployProxy(tokenBPool, [pairBToken0.address, pairBToken1.address, tokenB.address, factoryV2.address, wallet.address], { initializer: "initialize" });

        
        await usdtFeeHandle.initialize(usdt.address, tokenB.address, pairB.address);
        await bananaLiquid.initialize(factoryV2.address,WETH.address,tokenManager.address,usdtFeeHandle.address);
        await tokenManager.addRouter(bananaSwap.address,true);
        await tokenManager.addRouter(bananaLiquid.address,true);
        await tokenManager.addRouter(wallet.address,true);


        return {
            token0,
            tokenA,
            token1,
            tokenB,
            WETH,
            WETHPartner,
            factoryV2,
            routerQuery,
            pair,
            RouterEmit,
            wallet,
            user,
            wethPair,
            provider,
            tokenManager,
            feeHandler,
            tokenAUsdtPair,
            usdt,
            newTokenAUsdtPair,
            oracle,
            rewardHandler,
            bananaLiquid,
            bananaSwap,
        };
    }

    async function v2FixtureWithUSDTFeeHandle([wallet, other, user1, user2, user3, user4, user5, user6]: Wallet[], provider: MockProvider) {
        const commonTokenFactory = await ethers.getContractFactory("CommonToken");
        const cake = await commonTokenFactory.deploy({gasLimit: "4600000"});
        await cake.initialize("CAKE", "CAKE", expandTo18Decimals(10000000000), {gasLimit: "4600000"});
        // console.log('cake address:', cake.address);
    
        const usdt = await commonTokenFactory.deploy({gasLimit: "4600000"});
        await usdt.initialize("USDT", "USDT", expandTo18Decimals(10000000000), {gasLimit: "4600000"});
        // console.log('usdt address:', usdt.address);
    
        const nana = await commonTokenFactory.deploy({gasLimit: "4600000"});
        await nana.initialize("NANA", "NANA", expandTo18Decimals(10000000000), {gasLimit: "4600000"});
        // console.log('nana address:', nana.address);
    
        const dota = await commonTokenFactory.deploy({gasLimit: "4600000"});
        await dota.initialize("DOT", "DOT", expandTo18Decimals(10000000000), {gasLimit: "4600000"});
        // console.log('dota address:', dota.address);
    
        const TokenManager = await ethers.getContractFactory("TokenManager");
        const tokenManager = await TokenManager.deploy();
        // console.log('TokenManager address:', tokenManager.address);
    
        const tokenAFeeHandlerFactory = await ethers.getContractFactory("BananaSwapToken");
        // deploy tokenA DDC
        const tokenDDC = await tokenAFeeHandlerFactory.deploy();
        // console.log('tokenDDC address:', tokenDDC.address);
        await tokenDDC.initialize("DDC", "DDC",[10000],[wallet.address],expandTo18Decimals(10000000000));
        // await tokenDDC.born(wallet.address, expandTo18Decimals(10000000000), {gasLimit: "2600000"});
    
        const FeeHandler = await ethers.getContractFactory("FeeHandler");
        const ddcFeeHandler = await FeeHandler.deploy();
        await ddcFeeHandler.initialize();
        // console.log('ddcFeeHandler address:', ddcFeeHandler.address);
    
        // deploy tokenA apple
        const tokenApple = await tokenAFeeHandlerFactory.deploy();
        // console.log('tokenApple address:', tokenApple.address);
        await tokenApple.initialize("Apple", "APPLE",[10000],[wallet.address],expandTo18Decimals(10000000000));
        // await tokenApple.born(wallet.address, expandTo18Decimals(10000000000), {gasLimit: "2600000"});
    
        const AppleFeeHandlerFactory = await ethers.getContractFactory("FeeHandler");
        const appleFeeHandler = await AppleFeeHandlerFactory.deploy();
        await appleFeeHandler.initialize();
        // console.log('appleFeeHandler address:', appleFeeHandler.address);
    
        // set TokenA config
        { // buy tokenA
            let actionType = 0;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: ddcFeeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
    
            let nodeRewardFeeConfig2 = { feeRatio: rewardFeeRatio, feeHandler: appleFeeHandler.address, needHandle: false };
            await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig2, true);
            // console.log("tokenAFeeHandle.setFeeConfig actionType = 0 finished");
        }
        { // sell tokenA
            let actionType = 1;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: ddcFeeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
    
            let nodeRewardFeeConfig2 = { feeRatio: rewardFeeRatio, feeHandler: appleFeeHandler.address, needHandle: false };
            await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig2, true);
            // console.log("tokenAFeeHandle.setFeeConfig actionType = 1 finished");
        }
        { // pairA add liquidity
            let actionType = 2;
            const rewardFeeRatio = 1000;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
            let rewardType = 3;
            await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // console.log("tokenAFeeHandle.setFeeConfig actionType = 2 finished");
        }
        { // pairA remove liquidity
            let actionType = 3;
            const rewardFeeRatio = 1000;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dEaD", needHandle: false };
            let rewardType = 3;
            await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            await tokenApple.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // console.log("tokenAFeeHandle.setFeeConfig actionType = 3 finished");
        }
    
        // deploy tokenB
        const TokenBFactory = await ethers.getContractFactory("BananaToken");
        const tokenB = await TokenBFactory.deploy();
        // console.log('Banana tokenB address:', tokenB.address)
        await tokenB.initialize("Banana", "Banana");
        await tokenB.mint(wallet.address, expandTo18Decimals(10000000000), {gasLimit: "2600000"});
    
        //deploy WETH 
        const weth = await ethers.getContractFactory("WETH9");
        const WETH = await weth.deploy();
        // console.log('WETH address:', WETH.address);

         // usdtFeeHandle
         const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
         const usdtFeeHandle = await usdtFeeFactory.deploy();
        //  console.log("usdtFeeHandle address:", usdtFeeHandle.address);
        
        // deploy V2 factory
        const v2factory = await ethers.getContractFactory("BananaSwapFactory");
        const factoryV2 = await v2factory.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
        // console.log('factoryV2 address:', factoryV2.address);

        //console.log("============= codeHash: ", await factoryV2.PAIR_HASH());
    
        // deploy router-swap
        const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
        const routerSwap = await BananaSwapFactory.deploy();
        // console.log('routerSwap address:', routerSwap.address);
    
        const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
        const routerLiquid = await BananaLiquidFactory.deploy();
        // console.log('routerLiquid address:', routerLiquid.address);
    
        const BananaQueryFactory = await ethers.getContractFactory("BananaQuery");
        const routerQuery = await BananaQueryFactory.deploy();
        // console.log('routerQuery address:', routerQuery.address);
    
        const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
        const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
        // console.log('routerQuery4Swap address:', routerQuery4Swap.address);
    
        // pairB
        let pairBToken0 = tokenB.address > usdt.address ? usdt : tokenB; // token 0 is TokenB
        let pairBToken1 = tokenB.address > usdt.address ? tokenB : usdt;
        // console.log("pairB token0:", pairBToken0.address);
        // console.log("pairB token1:", pairBToken1.address);
    
        const TokenBPoolFactory = await ethers.getContractFactory("TokenBPool");
        const pairB = await upgrades.deployProxy(TokenBPoolFactory, [pairBToken0.address, pairBToken1.address, tokenB.address, factoryV2.address, wallet.address], { initializer: "initialize" });
        // console.log("pairB address:", pairB.address);
    
        await tokenManager.initialize(tokenB.address, usdt.address);
        await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        await routerLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        await routerQuery.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        await routerSwap.setBananaQuery(routerQuery4Swap.address);
        await usdtFeeHandle.initialize(usdt.address, tokenB.address, pairB.address);
        // console.log("usdtFeeHandle address:", usdtFeeHandle.address);
    
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("0")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("0"), aFeeConfig, true, {gasLimit: "4600000"});
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("0"), aFeeConfig, true, {gasLimit: "4600000"});
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("1")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("1"), aFeeConfig, true, {gasLimit: "4600000"});
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("1"), aFeeConfig, true, {gasLimit: "4600000"});
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("2")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("2"), aFeeConfig, true, {gasLimit: "4600000"});
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("2"), aFeeConfig, true, {gasLimit: "4600000"});
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
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
            // console.log("reflowFeeHandlerDDC: ", reflowFeeHandlerDDC.address);
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
            // console.log("reflowFeeHandlerApple: ", reflowFeeHandlerApple.address);
            await reflowFeeHandlerApple.initialize(usdt.address, routerSwap.address, routerLiquid.address, expandTo18Decimals(10));
            let actionType = 1;
            let rewardType = 5;
            const rewardFeeRatio = 500;
            let reflowRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandlerApple.address, needHandle: true };
            await tokenApple.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, {gasLimit: "4600000"});
            await tokenApple.addWeList([reflowFeeHandlerApple.address])
        }
    
        await tokenB.setManager(wallet.address, true);
        await tokenB.setManager(usdtFeeHandle.address, true);
    
        let accounts = [
            wallet.address, 
            usdtFeeHandle.address,
            "0x000000000000000000000000000000000000dEaD",
            "0x0000000000000000000000000000000000000000"
        ];
        await pairB.addTokenBExcludeBalanceList(accounts);
        // console.log("pairB.addTokenBExcludeBalanceList after");
    
        const BananaSwap4BFactory = await ethers.getContractFactory("BananaSwap4B");
        const routerSwap4B = await BananaSwap4BFactory.deploy();
        // console.log('routerSwap4B address:', routerSwap4B.address);
    
        await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, {gasLimit: "3900000"});
        await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, {gasLimit: "3900000"});
        await routerSwap4B.setUsdt(usdt.address, {gasLimit: "3900000"});
        await routerSwap4B.setPairB(pairB.address, {gasLimit: "3900000"});
        await routerSwap4B.setTokenB(tokenB.address, {gasLimit: "3900000"});
    
        await pairB.setRouterSwap4B(routerSwap4B.address, {gasLimit: "3900000"});
    
        await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), {gasLimit: "4900000"});
        // console.log("====== routerSwap4B.initLiquid");
        
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
            await usdtFeeHandle.setBConfig(tokenB.address, bConfig, {gasLimit: "4900000"});
        }
    
        // await factoryV2.createPair(usdt.address, tokenDDC.address, {gasLimit: "4900000"});
        let pairDDCAddr = await routerQuery.pairFor(usdt.address, tokenDDC.address);
        // console.log("pairDDCAddr:", pairDDCAddr);
        
        let TimeLockFactory = await ethers.getContractFactory("FinalTimeLock");
        let timeLockDDC = await TimeLockFactory.deploy();
        await timeLockDDC.initialize(pairDDCAddr);
        // console.log("timeLockDDC: ", timeLockDDC.address);
        {
            let config = {
                openLockLiquid: false,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockDDC.address
            };
            await tokenDDC.setLiquidityLockConfig(config, {gasLimit: "4900000"});
            // console.log("tokenDDC setLiquidityLockConfig: ");
        }
    
        // await factoryV2.createPair(usdt.address, tokenApple.address, {gasLimit: "4900000"});
        let pairAppleAddr = await routerQuery.pairFor(usdt.address, tokenApple.address);
        // console.log("pairAppleAddr:", pairAppleAddr);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairA = await PairFactory.attach(pairAppleAddr);
    
        let timeLockApple = await TimeLockFactory.deploy();
        await timeLockApple.initialize(pairAppleAddr);
        // console.log("timeLockApple: ", timeLockApple.address);
        {
            let config = {
                openLockLiquid: false,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, {gasLimit: "4600000"});
            // console.log("tokenApple setLiquidityLockConfig: ");
        }
        await tokenApple.addWeList([wallet.address]);
    
        // const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
        // const oracleDDC = await oracleFactory.deploy();
        // console.log("oracleDDC address: ", oracleDDC.address);
    
        // let initialPrice = 1;
        // await oracleDDC.initialize(factoryV2.address, tokenA.address, usdt.address, initialPrice, {gasLimit: "4600000"});
        // await tokenA.setOracle(oracleDDC.address, {gasLimit: "3900000"});
    
        // const oracleApple = await oracleFactory.deploy();
        // console.log("oracleApple address: ", oracleApple.address);
    
        // await oracleApple.initialize(factoryV2.address, tokenApple.address, usdt.address, initialPrice, {gasLimit: "4600000"});
        // await tokenApple.setOracle(oracleApple.address, {gasLimit: "3900000"});
    
        // console.log("---- deploy end");
        await tokenManager.addRouter(routerSwap.address,true);
        await tokenManager.addRouter(routerLiquid.address,true);
        await tokenManager.addRouter(wallet.address,true);
        return {
            cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider
        };
    }

    describe("swapExactTokensForTokens", () => {
        const token0Amount = expandTo18Decimals(5);
        const token1Amount = expandTo18Decimals(10);
        const swapAmount = expandTo18Decimals(1);
        const expectedOutputAmount = BigNumber.from("1662497915624478906");

        it("usdt swap tokenA origin", async () => {
            const { bananaSwap, token0, token1, wallet, pair,} = await loadFixture(
                v2Fixture
            );

            // before each
            await token0.transfer(pair.address, token0Amount);
            await token1.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);

            await token0.approve(bananaSwap.address, ethers.constants.MaxUint256);
            console.log("delegator.address,wallet.address is:", bananaSwap.address, wallet.address);
            await expect(
                bananaSwap.swapExactTokensForTokens(
                    swapAmount,
                    0,
                    [token0.address, token1.address],
                    wallet.address,
                    ethers.constants.MaxUint256
                )
            )
                .to.emit(token0, "Transfer")
                .withArgs(wallet.address, pair.address, swapAmount)
                .to.emit(token1, "Transfer")
                .withArgs(pair.address, wallet.address, expectedOutputAmount)
                .to.emit(pair, "Sync")
                .withArgs(
                    token0Amount.add(swapAmount),
                    token1Amount.sub(expectedOutputAmount)
                )
                .to.emit(pair, "Swap")
                .withArgs(
                    bananaSwap.address,
                    swapAmount,
                    0,
                    0,
                    expectedOutputAmount,
                    wallet.address
                )
                .to.emit(token1, "Transfer")
                .withArgs(pair.address, wallet.address, expectedOutputAmount);

            // let tx = await delegator.swapExactTokensForTokens(
            //       swapAmount,
            //       0,
            //       [token0.address, token1.address],
            //       wallet.address,
            //       ethers.constants.MaxUint256
            //     );
            // let receipt = await tx.wait();
            // let listEvent = receipt.events?.at(0);
            // console.log("listEvent is:",listEvent);
        });

        it("normal token swap TokenA without fee Config", async () => {
            const { bananaSwap, token0, token1, wallet, user, pair,routerQuery,  tokenManager } = await loadFixture(
                v2Fixture
            );

            // before each
            await token0.transfer(pair.address, token0Amount);
            await token1.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);
            await token0.transfer(user.address, swapAmount);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(token1.address, true);
            //set the token0 is usdt
            // await tokenManager.addUsdtList(token0.address,true);

            await token0.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            let deductUsdtAmount = swapAmount;

            await expect(bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                expectedOutputAmount.mul(2),
                [token0.address, token1.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            )).to.be.revertedWith("BS:INSUFFICIENT_OUTPUT_AMOUNT");

            let userBalanceOfToken1Before = await token1.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsOut(deductUsdtAmount, [token0.address, token1.address]);
            let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                0,
                [token0.address, token1.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            );
            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            expect(reserve0).to.be.equals(deductUsdtAmount.add(token0Amount));

            let userBalanceOfToken0 = await token0.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(deductUsdtAmount));
            let userBalanceOfToken1 = await token1.balanceOf(user.address);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
        });

        it("normal swap TokenA with fee", async () => {
            const { bananaSwap, token0, token1, wallet, user, pair,  tokenManager,routerQuery, feeHandler,rewardHandler } = await loadFixture(
                v2Fixture
            );

            // before each
            await token0.transfer(pair.address, token0Amount);
            await token1.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);
            await token0.transfer(user.address, swapAmount);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(token1.address, true);
            let actionType = 0;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: rewardHandler.address, needHandle: false };
            let rewardType = 0;
            await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            //set the token0 is usdt
            // await tokenManager.addUsdtList(token0.address,true);

            await token0.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            let deductUsdtAmount = swapAmount;

            // await expect(delegator.connect(user).swapExactTokensForTokens(
            //   swapAmount,
            //   expectedOutputAmount,
            //   [token0.address, token1.address],
            //   user.address,
            //   ethers.constants.MaxUint256, { from: user.address }
            // )).to.be.revertedWith("BananaSwap: INSUFFICIENT_OUTPUT_AMOUNT");

            let userBalanceOfToken1Before = await token1.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsOut(deductUsdtAmount, [token0.address, token1.address]);
            let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                0,
                [token0.address, token1.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            );
            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            expect(reserve0).to.be.equals(deductUsdtAmount.add(token0Amount));

            let userBalanceOfToken0 = await token0.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(deductUsdtAmount));
            let userBalanceOfToken1 = await token1.balanceOf(user.address);
            let swapOutAmount = amounts[1].mul(baseRatio).div(baseRatio - rewardFeeRatio);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            let feeAmount = swapOutAmount.sub(amounts[1]);
            let balanceOfFeeHandler = await token1.balanceOf(rewardHandler.address);
            expect(feeAmount.div(10)).to.be.equals(balanceOfFeeHandler.div(10));
        });

        it("USDT swap TokenA with USDTFeeHandle", async () => {
            const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            wallet, other, user1, user2, user3, user4, user5, user6, provider} = await loadFixture(v2FixtureWithUSDTFeeHandle);
        
            let tokenBTotalSupplyBefore = await tokenB.totalSupply();
            let swapAmount = expandTo18Decimals(100);
            
            await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.addLiquidity(
                usdt.address,
                tokenApple.address,
                expandTo18Decimals(10000),
                expandTo18Decimals(10000),
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            );
            let tokenBTotalSupplyAfter = await tokenB.totalSupply();
            expect(tokenBTotalSupplyAfter).to.eq(tokenBTotalSupplyBefore);

            await usdt.transfer(user2.address, expandTo18Decimals(100000));
            expect(await usdt.balanceOf(user2.address)).to.eq(expandTo18Decimals(100000));

            await tokenApple.transfer(user2.address, expandTo18Decimals(100000));
            expect(await tokenApple.balanceOf(user2.address)).to.eq(expandTo18Decimals(100000));

            await usdt.connect(user2).approve(routerSwap.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user2).approve(routerSwap.address, ethers.constants.MaxUint256);

            let amounts = await routerQuery4Swap.connect(user3).getAmountsOut(expandTo18Decimals(100), [usdt.address, tokenApple.address], user2.address);
            let amounts2 = await routerQuery.connect(user3).getAmountsOut(swapAmount, [usdt.address, tokenApple.address]);
            expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
            await routerSwap.connect(user2).swapExactTokensForTokens(
                swapAmount,
                0,
                [usdt.address, tokenApple.address],
                user3.address,
                ethers.constants.MaxUint256
            );
            expect(await tokenB.balanceOf(user2.address)).to.eq(swapAmount.mul(9).div(100));
            expect(await tokenApple.balanceOf(user3.address)).to.eq(amounts[1].mul(95).div(100).toString());

        });

        it("TokenA swap USDT with USDTFeeHandle", async () => {
            const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            wallet, other, user1, user2, user3, user4, user5, user6, provider} = await loadFixture(v2FixtureWithUSDTFeeHandle);
        
            let tokenBTotalSupplyBefore = await tokenB.totalSupply();
            let swapAmount = expandTo18Decimals(100);
            
            await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.addLiquidity(
                usdt.address,
                tokenApple.address,
                expandTo18Decimals(10000),
                expandTo18Decimals(10000),
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            );
            let tokenBTotalSupplyAfter = await tokenB.totalSupply();
            expect(tokenBTotalSupplyAfter).to.eq(tokenBTotalSupplyBefore);

            await usdt.transfer(user2.address, expandTo18Decimals(100000));
            expect(await usdt.balanceOf(user2.address)).to.eq(expandTo18Decimals(100000));

            await tokenApple.transfer(user2.address, expandTo18Decimals(100000));
            expect(await tokenApple.balanceOf(user2.address)).to.eq(expandTo18Decimals(100000));

            await usdt.connect(user2).approve(routerSwap.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user2).approve(routerSwap.address, ethers.constants.MaxUint256);

            let amounts = await routerQuery4Swap.connect(user3).getAmountsOut(expandTo18Decimals(100), [tokenApple.address, usdt.address], user2.address);
            let amounts2 = await routerQuery.connect(user3).getAmountsOut(swapAmount, [tokenApple.address, usdt.address]);
            expect(await usdt.balanceOf(user3.address)).to.eq(0);

            let reserves = await pairB.getReserves();

            await routerSwap.connect(user2).swapExactTokensForTokens(
                expandTo18Decimals(100),
                0,
                [tokenApple.address, usdt.address],
                user3.address,
                ethers.constants.MaxUint256
            );
            expect(await usdt.balanceOf(user3.address)).to.eq(amounts2[1]);
            expect((await tokenB.balanceOf(user2.address)).div(10)).to.eq(amounts2[1].div(100));
        });

        it("addLiquidity with USDTFeeHandle", async () => {
            const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
                factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
                timeLockDDC, timeLockApple, pairA,
                wallet, other, user1, user2, user3, user4, user5, user6, provider} = await loadFixture(v2FixtureWithUSDTFeeHandle);

            const token0Amount = expandTo18Decimals(10000);
            const token1Amount = expandTo18Decimals(10000);

            let tokenBTotalSupplyBefore = await tokenB.totalSupply();
            let swapAmount = expandTo18Decimals(100);
            
            await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            );

            const expectedLiquidity = expandTo18Decimals(10000);
            expect(await pairA.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));

            await usdt.transfer(user2.address, expandTo18Decimals(10000));
            await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
            await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
            let user2BalanceOfTokenABefore = await tokenApple.balanceOf(user2.address);
            console.log("user2BalanceOfTokenABefore is:",user2BalanceOfTokenABefore);
            let user2BalanceOfUsdtBefore = await usdt.balanceOf(user2.address);
            console.log("user2BalanceOfTokenABefore is:",user2BalanceOfUsdtBefore);
            await routerLiquid.connect(user2).addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                user2.address,
                ethers.constants.MaxUint256
            );
            let user2BalanceOfTokenAAfter = await tokenApple.balanceOf(user2.address);
            console.log("user2BalanceOfTokenAAfter is:",user2BalanceOfTokenAAfter);
            let user2BalanceOfUsdtAfter = await usdt.balanceOf(user2.address);
            console.log("user2BalanceOfUsdtAfter is:",user2BalanceOfUsdtAfter);
            expect(await pairA.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100));

            {
                let config = {
                    openLockLiquid: true,
                    lockLiquidDuration: BigNumber.from("300"),
                    lpTimeLock: timeLockApple.address
                };
                await tokenApple.setLiquidityLockConfig(config, {gasLimit: "4600000"});
                // console.log("tokenApple setLiquidityLockConfig: ");
            }

            expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

            await usdt.transfer(user3.address, expandTo18Decimals(10000));
            await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
            await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.connect(user3).addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                user3.address,
                ethers.constants.MaxUint256
            );

            expect(await pairA.balanceOf(user3.address)).to.eq(0);
            expect(await pairA.balanceOf(timeLockApple.address)).to.eq(expectedLiquidity.mul(90).div(100));

            await time.advanceTimeAndBlock(400);

            await timeLockApple.connect(user3).withdraw();
            expect(await pairA.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(90).div(100));
        });

        it("removeLiquidity fee with USDTFeeHandle", async () => {
            const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
                factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
                timeLockDDC, timeLockApple, pairA,
                wallet, other, user1, user2, user3, user4, user5, user6, provider} = await loadFixture(v2FixtureWithUSDTFeeHandle);

            const token0Amount = expandTo18Decimals(10000);
            const token1Amount = expandTo18Decimals(10000);
            
            await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            );

            const expectedLiquidity = expandTo18Decimals(10000);
            expect(await pairA.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));

            await usdt.transfer(user2.address, expandTo18Decimals(10000));
            await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
            await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.connect(user2).addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                user2.address,
                ethers.constants.MaxUint256
            );

            expect(await pairA.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100));

            {
                let config = {
                    openLockLiquid: true,
                    lockLiquidDuration: BigNumber.from("300"),
                    lpTimeLock: timeLockApple.address
                };
                await tokenApple.setLiquidityLockConfig(config, {gasLimit: "4600000"});
                // console.log("tokenApple setLiquidityLockConfig: ");
            }

            expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

            await usdt.transfer(user3.address, expandTo18Decimals(10000));
            await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
            await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.connect(user3).addLiquidity(
                usdt.address,
                tokenApple.address,
                token0Amount,
                token1Amount,
                0,
                0,
                user3.address,
                ethers.constants.MaxUint256
            );

            expect(await pairA.balanceOf(user3.address)).to.eq(0);
            expect(await pairA.balanceOf(timeLockApple.address)).to.eq(expectedLiquidity.mul(90).div(100));

            await time.advanceTimeAndBlock(400);

            await timeLockApple.connect(user3).withdraw();
            expect(await pairA.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(90).div(100));

            expect(await usdt.balanceOf(user3.address)).to.eq(0);
            expect(await tokenApple.balanceOf(user3.address)).to.eq(0);

            await pairA.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
            await routerLiquid.connect(user3).removeLiquidity(
                usdt.address,
                tokenApple.address,
                expectedLiquidity.mul(90).div(100),
                0,
                0,
                user3.address,
                ethers.constants.MaxUint256
            );

            expect(await usdt.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
            expect(await tokenApple.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
        });
    });

    it("test getAmountsOut", async () => {
        const {
            bananaSwap,
            bananaLiquid,
            routerQuery,
            token0,
            token1,
            wallet,
            pair,
        } = await loadFixture(v2Fixture);
        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );
        await expect(
            routerQuery.getAmountsOut(BigNumber.from(2), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        const path = [token0.address, token1.address];
        expect(await routerQuery.getAmountsOut(BigNumber.from(100), path)).to.deep.eq([
            BigNumber.from(100),
            BigNumber.from(98),
        ]);
    });


    it("getAmountsOut with sell fee", async () => {
        const {
            bananaSwap,
            token0,
            token1,
            wallet,
            pair,
            tokenManager,
            feeHandler,
            bananaLiquid,
            routerQuery,
        } = await loadFixture(v2Fixture);

        await tokenManager.addTokenAList(token0.address, true);
        let actionType = 1; //sell
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0; //nodeRewardRatio
        await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);


        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );
        await expect(
            routerQuery.getAmountsOut(BigNumber.from(2), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        expect(await routerQuery.getAmountsOut(BigNumber.from(100), [token0.address, token1.address])).to.deep.eq([
            BigNumber.from(100),
            BigNumber.from(93),
        ]);
    });

    it("getAmountsOut with buy fee", async () => {
        const {
            bananaSwap: router,
            token0,
            token1,
            wallet,
            pair,
            tokenManager,
            feeHandler,
            bananaLiquid,
            routerQuery,
        } = await loadFixture(v2Fixture);

        await tokenManager.addTokenAList(token1.address, true);
        let actionType = 0; //buy
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 1; //nodeRewardRatio
        await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);


        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );
        await expect(
            routerQuery.getAmountsOut(BigNumber.from(2), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        // console.log("---------------3");
        expect(await routerQuery.getAmountsOut(BigNumber.from(100), [token0.address, token1.address])).to.deep.eq([
            BigNumber.from(100),
            BigNumber.from(93),
        ]);
        // console.log("---------------4");
    });


    it("test getAmountsIn", async () => {
        const {
            bananaSwap: router,
            token0,
            token1,
            wallet,
            bananaLiquid,
            routerQuery,
        } = await loadFixture(v2Fixture);

        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        // await expect(bananaLiquid.addLiquidity(
        //  token0.address,
        //  token1.address,
        //  BigNumber.from(10000),
        //  BigNumber.from(10000),
        //  0,
        //  0,
        //  wallet.address,
        //  ethers.constants.MaxUint256
        // )).to.be.revertedWith("Not Delegator");

        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        await expect(
            routerQuery.getAmountsIn(BigNumber.from(1), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        const path = [token0.address, token1.address];
        expect(await routerQuery.getAmountsIn(BigNumber.from(98), path)).to.deep.eq([
            BigNumber.from(100),
            BigNumber.from(98),
        ]);
    });


    it("getAmountsIn with sell fee", async () => {
        const {
            bananaSwap: router,
            token0,
            token1,
            wallet,
            tokenManager,
            feeHandler,
            bananaLiquid,
            routerQuery,
        } = await loadFixture(v2Fixture);


        await tokenManager.addTokenAList(token0.address, true);
        let actionType = 1; //sell
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0; //nodeRewardRatio
        await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        // await expect(bananaLiquid.addLiquidity(
        //  token0.address,
        //  token1.address,
        //  BigNumber.from(10000),
        //  BigNumber.from(10000),
        //  0,
        //  0,
        //  wallet.address,
        //  ethers.constants.MaxUint256
        // )).to.be.revertedWith("Not Delegator");

        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        await expect(
            routerQuery.getAmountsIn(BigNumber.from(98), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        const path = [token0.address, token1.address];
        expect(await routerQuery.getAmountsIn(BigNumber.from(98), path)).to.deep.eq([
            BigNumber.from(101).mul(baseRatio).div(baseRatio - rewardFeeRatio),
            BigNumber.from(98),
        ]);
    });


    it("getAmountsIn with buy fee", async () => {
        const {
            bananaSwap: router,
            token0,
            token1,
            wallet,
            tokenManager,
            feeHandler,
            bananaLiquid,
            routerQuery,
        } = await loadFixture(v2Fixture);


        await tokenManager.addTokenAList(token1.address, true);
        let actionType = 0; //buy
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 1; //nodeRewardRatio
        await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        // await expect(bananaLiquid.addLiquidity(
        //  token0.address,
        //  token1.address,
        //  BigNumber.from(10000),
        //  BigNumber.from(10000),
        //  0,
        //  0,
        //  wallet.address,
        //  ethers.constants.MaxUint256
        // )).to.be.revertedWith("Not Delegator");

        await bananaLiquid.addLiquidity(
            token0.address,
            token1.address,
            BigNumber.from(10000),
            BigNumber.from(10000),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        await expect(
            routerQuery.getAmountsIn(BigNumber.from(98), [token0.address])
        ).to.be.revertedWith("BananaSwapLibrary: INVALID_PATH");
        const path = [token0.address, token1.address];
        expect(await routerQuery.getAmountsIn(BigNumber.from(98), path)).to.deep.eq([
            BigNumber.from(101).mul(baseRatio).div(baseRatio - rewardFeeRatio),
            BigNumber.from(98),
        ]);
    });

    // // it("factory, WETH", async () => {
    // //   const { bananaSwap, factoryV2, WETH } = await loadFixture(v2Fixture);
    // //   expect(await bananaSwap.factory()).to.eq(factoryV2.address);
    // //   expect(await bananaSwap.WETH()).to.eq(WETH.address);
    // // });

    it("test addLiquidity", async () => {
        const { bananaSwap, token0, token1, wallet, pair, bananaLiquid } = await loadFixture(
            v2Fixture
        );

        const token0Amount = expandTo18Decimals(1);
        const token1Amount = expandTo18Decimals(4);

        const expectedLiquidity = expandTo18Decimals(2);
        await token0.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await token1.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        // await expect(
        //  bananaLiquid.addLiquidity(
        //      token0.address,
        //      token1.address,
        //      token0Amount,
        //      token1Amount,
        //      0,
        //      0,
        //      wallet.address,
        //      ethers.constants.MaxUint256
        //  )
        // ).revertedWith("Not Delegator");
        console.log("wallet.address,bananaLiquid.address,bananaSwap.address is:",wallet.address,bananaLiquid.address,bananaSwap.address);
        await 
            bananaLiquid.addLiquidity(
                token0.address,
                token1.address,
                token0Amount,
                token1Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            )
            // .to.emit(token0, "Transfer")
            // .withArgs(wallet.address, bananaLiquid.address, token0Amount)
            // .to.emit(token1, "Transfer")
            // .withArgs(wallet.address, bananaLiquid.address, token1Amount)
            // .to.emit(token0, "Transfer")
            // .withArgs(bananaLiquid.address, pair.address, token0Amount)
            // .to.emit(token1, "Transfer")
            // .withArgs(bananaLiquid.address, pair.address, token1Amount)
            // .to.emit(pair, "Transfer")
            // .withArgs(
            //  ethers.constants.AddressZero,
            //  ethers.constants.AddressZero,
            //  MINIMUM_LIQUIDITY
            // )
            // .to.emit(pair, "Transfer")
            // .withArgs(
            //  ethers.constants.AddressZero,
            //  bananaLiquid.address,
            //  expectedLiquidity.sub(MINIMUM_LIQUIDITY)
            // )
            // .to.emit(pair, "Sync")
            // .withArgs(token0Amount, token1Amount)
            // .to.emit(pair, "Mint")
            // .withArgs(bananaSwap.address, token0Amount, token1Amount);

        expect(await pair.balanceOf(wallet.address)).to.eq(
            expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        );
    });

    it("removeLiquidity", async () => {
        const { bananaSwap, token0, token1, wallet, pair,  tokenManager,bananaLiquid } = await loadFixture(
            v2Fixture
        );

        const token0Amount = expandTo18Decimals(1);
        const token1Amount = expandTo18Decimals(1);
        await token0.transfer(pair.address, token0Amount);
        await token1.transfer(pair.address, token1Amount);
        await pair.mint(wallet.address);

        const expectedLiquidity = expandTo18Decimals(1);
        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));

        await pair.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        await expect(
            bananaLiquid.removeLiquidity(
                token0.address,
                token1.address,
                expectedLiquidity.sub(MINIMUM_LIQUIDITY),
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            )
        )
        // .to.emit(pair, "Transfer")
        // .withArgs(
        //   wallet.address,
        //   pair.address,
        //   expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        // )
        // .to.emit(pair, "Transfer")
        // .withArgs(
        //   pair.address,
        //   ethers.constants.AddressZero,
        //   expectedLiquidity.sub(MINIMUM_LIQUIDITY)
        // )
        // .to.emit(token0, "Transfer")
        // .withArgs(pair.address, wallet.address, token0Amount.sub(500))
        // .to.emit(token1, "Transfer")
        // .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
        // .to.emit(pair, "Sync")
        // .withArgs(500, 2000)
        // .to.emit(pair, "Burn")
        // .withArgs(
        //   bananaSwap.address,
        //   token0Amount.sub(500),
        //   token1Amount.sub(2000),
        //   delegator.address
        // );

        expect(await pair.balanceOf(wallet.address)).to.eq(0);
        const totalSupplyToken0 = await token0.totalSupply();
        const totalSupplyToken1 = await token1.totalSupply();
        expect(await token0.balanceOf(wallet.address)).to.eq(
            totalSupplyToken0.sub(1000)
        );
        expect(await token1.balanceOf(wallet.address)).to.eq(
            totalSupplyToken1.sub(1000)
        );
    });

    it("removeLiquidity with fee", async () => {
        const { bananaSwap, token0, token1, wallet, pair, tokenManager, feeHandler,bananaLiquid } = await loadFixture(
            v2Fixture
        );

        const token0Amount = expandTo18Decimals(1);
        const token1Amount = expandTo18Decimals(4);
        await token0.transfer(pair.address, token0Amount);
        await token1.transfer(pair.address, token1Amount);
        await pair.mint(wallet.address);

        await tokenManager.addTokenAList(token0.address, true);
        let actionType = 3; //remove liquid
        const rewardFeeRatio = 500;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0; //nodeRewardRatio
        await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

        const expectedLiquidity = expandTo18Decimals(2);
        await pair.approve(bananaLiquid.address, ethers.constants.MaxUint256);
        // await delegator.removeLiquidity(
        //     token0.address,
        //     token1.address,
        //     expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        //     0,
        //     0,
        //     wallet.address,
        //     ethers.constants.MaxUint256
        //   )
        await 
            bananaLiquid.removeLiquidity(
                token0.address,
                token1.address,
                expectedLiquidity.sub(MINIMUM_LIQUIDITY),
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            )
            // .to.emit(pair, "Transfer")
            // .withArgs(
            //  wallet.address,
            //  pair.address,
            //  expectedLiquidity.sub(MINIMUM_LIQUIDITY)
            // )
            // .to.emit(pair, "Transfer")
            // .withArgs(
            //  pair.address,
            //  ethers.constants.AddressZero,
            //  expectedLiquidity.sub(MINIMUM_LIQUIDITY)
            // )
            // .to.emit(token0, "Transfer")
            // .withArgs(pair.address, wallet.address, token0Amount.sub(500))
            // .to.emit(token1, "Transfer")
            // .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
            // .to.emit(pair, "Sync")
            // .withArgs(500, 2000)
            // .to.emit(pair, "Burn")
            // .withArgs(
            //  bananaSwap.address,
            //  token0Amount.sub(500),
            //  token1Amount.sub(2000),
            //  bananaLiquid.address
            // );

        expect(await pair.balanceOf(wallet.address)).to.eq(0);
        const totalSupplyToken0 = await token0.totalSupply();
        const totalSupplyToken1 = await token1.totalSupply();
        expect(await token0.balanceOf(wallet.address)).to.eq(
            totalSupplyToken0.sub(500).sub(token0Amount.sub(500).mul(rewardFeeRatio).div(baseRatio))
        );
        expect(await token1.balanceOf(wallet.address)).to.eq(
            totalSupplyToken1.sub(2000)
        );
    });


    it('addLiquidityETH', async () => {
        const {
            bananaSwap: router,
            wallet,
            WETHPartner,
            WETH,
            wethPair: WETHPair,
            bananaLiquid,
        } = await loadFixture(v2Fixture);
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WETHPairToken0 = await WETHPair.token0()
        await WETHPartner.approve(bananaLiquid.address, MaxUint256);
        // await expect(
        //  bananaLiquid.addLiquidityETH(
        //      WETHPartner.address,
        //      WETHPartnerAmount,
        //      WETHPartnerAmount,
        //      ETHAmount,
        //      wallet.address,
        //      MaxUint256,
        //      { ...overrides, value: ETHAmount }
        //  )
        // ).to.be.revertedWith("Not Delegator");

        await 
            bananaLiquid.addLiquidityETH(
                WETHPartner.address,
                WETHPartnerAmount,
                WETHPartnerAmount,
                ETHAmount,
                wallet.address,
                MaxUint256,
                { ...overrides, value: ETHAmount }
            )
            // .to.emit(WETHPair, 'Transfer')
            // .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
            // .to.emit(WETHPair, 'Transfer')
            // .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
            // .to.emit(WETHPair, 'Sync')
            // .withArgs(
            //  WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            //  WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
            // )
            // .to.emit(WETHPair, 'Mint')
            // .withArgs(
            //  delegator.address,
            //  WETHPairToken0 === WETHPartner.address ? WETHPartnerAmount : ETHAmount,
            //  WETHPairToken0 === WETHPartner.address ? ETHAmount : WETHPartnerAmount
            // )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
    })

    describe("add liquidity test", () => {
    it('addLiquidity with tokenA fee', async () => {
        const { bananaSwap, token0, token1, wallet, pair, bananaLiquid,tokenManager,feeHandler,user } = await loadFixture(
            v2Fixture
        );

        const token0Amount = expandTo18Decimals(1);
        const token1Amount = expandTo18Decimals(4);

        const expectedLiquidity = expandTo18Decimals(2);
        

        //set the token1 is tokenA
        await tokenManager.addTokenAList(token0.address, true);
        let ethBalanceOfUserBefore = await wallet.getBalance();
        let actionType = 2; //AddLiquid
        const rewardFeeRatio = 100;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0;
        await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);


        await token0.transfer(user.address, token0Amount);
        await token1.transfer(user.address, token1Amount);
        await token0.connect(user).approve(bananaLiquid.address, MaxUint256, { from: user.address });
        await token1.connect(user).approve(bananaLiquid.address, ethers.constants.MaxUint256,{from:user.address});
        let user2BalanceOfToken0Before = await token0.balanceOf(user.address);
        console.log("user2BalanceOfToken0Before is:",user2BalanceOfToken0Before);
        await 
            bananaLiquid.connect(user).addLiquidity(
                token0.address,
                token1.address,
                token0Amount,
                token1Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256,
                {from:user.address}
            )
        let user2BalanceOfToken0After = await token0.balanceOf(user.address);
        expect(user2BalanceOfToken0After).to.be.equals(0);
        console.log("user2BalanceOfToken0After is:",user2BalanceOfToken0After);
        
    })
});

    it('addLiquidityETH with tokenA fee', async () => {
        const {
            bananaSwap: router,
            wallet,
            WETHPartner,
            WETH,
            wethPair: WETHPair,
            tokenManager,
            feeHandler,
            user,
            bananaLiquid
        } = await loadFixture(v2Fixture);
        const WETHPartnerAmount = expandTo18Decimals(1)
        const ETHAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WETHPairToken0 = await WETHPair.token0()
        await WETHPartner.approve(bananaLiquid.address, MaxUint256);
        // await expect(
        //  bananaLiquid.addLiquidityETH(
        //      WETHPartner.address,
        //      WETHPartnerAmount,
        //      WETHPartnerAmount,
        //      ETHAmount,
        //      wallet.address,
        //      MaxUint256,
        //      { ...overrides, value: ETHAmount }
        //  )
        // ).to.be.revertedWith("Not Delegator");

        //set the token1 is tokenA
        await tokenManager.addTokenAList(WETHPartner.address, true);
        let ethBalanceOfUserBefore = await wallet.getBalance();
        let actionType = 2; //AddLiquid
        const rewardFeeRatio = 100;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0;
        await WETHPartner.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);


        await WETHPartner.transfer(user.address, WETHPartnerAmount);
        await WETHPartner.connect(user).approve(bananaLiquid.address, MaxUint256, { from: user.address });
        let user2BalanceOfWETHPartnerBefore = await WETHPartner.balanceOf(user.address);
        console.log("user2BalanceOfWETHPartnerBefore is:",user2BalanceOfWETHPartnerBefore);
        await bananaLiquid.connect(user).addLiquidityETH(
            WETHPartner.address,
            WETHPartnerAmount,
            WETHPartnerAmount,
            ETHAmount,
            user.address,
            MaxUint256,
            { value: ETHAmount, from: user.address }
        );
        let user2BalanceOfWETHPartnerAfter = await WETHPartner.balanceOf(user.address);
        console.log("user2BalanceOfWETHPartnerAfter is:",user2BalanceOfWETHPartnerAfter);

        let balanceOfFeeHandler = await WETHPartner.balanceOf(feeHandler.address);
        expect(balanceOfFeeHandler).to.equals(WETHPartnerAmount.mul(rewardFeeRatio).div(baseRatio));
        let tokenAAmount: BigNumber, wethAmount: BigNumber;
        let [reserve0, reserve1] = await WETHPair.getReserves();
        console.log("reserve0,reserve1",reserve0,reserve1);
        let token0 = await WETHPair.token0();
        tokenAAmount = token0 ==WETHPartner.address? reserve0:reserve1;
        wethAmount = token0 ==WETHPartner.address? reserve1:reserve0;
        expect(tokenAAmount).to.be.equals(WETHPartnerAmount.mul(baseRatio - rewardFeeRatio).div(baseRatio));
        expect(wethAmount).to.be.equals(ETHAmount);
        let newExpectedLiquidity = WETHPartnerAmount.mul(baseRatio - rewardFeeRatio).div(baseRatio).mul(ETHAmount);
        newExpectedLiquidity = BigNumber.from(new bn(newExpectedLiquidity.toString()).sqrt().toFixed().split('.')[0]);
        expect(await WETHPair.balanceOf(user.address)).to.eq(BigNumber.from(newExpectedLiquidity).sub(MINIMUM_LIQUIDITY));
    })

    it("removeLiquidityETH", async () => {
        const {
            bananaSwap,
            wallet,
            WETHPartner,
            WETH,
            wethPair: WETHPair,
            bananaLiquid,
        } = await loadFixture(v2Fixture);

        const WETHPartnerAmount = expandTo18Decimals(1);
        const ETHAmount = expandTo18Decimals(4);
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
        await WETH.deposit({ value: ETHAmount });
        await WETH.transfer(WETHPair.address, ETHAmount);
        await WETHPair.mint(wallet.address);

        const expectedLiquidity = expandTo18Decimals(2);
        const WETHPairToken0 = await WETHPair.token0();
        await WETHPair.approve(bananaLiquid.address, ethers.constants.MaxUint256);

        await bananaLiquid.removeLiquidityETH(
            WETHPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(0);
        const totalSupplyWETHPartner = await WETHPartner.totalSupply();
        const totalSupplyWETH = await WETH.totalSupply();
        expect(await WETHPartner.balanceOf(wallet.address)).to.eq(
            totalSupplyWETHPartner.sub(500)
        );
        expect(await WETH.balanceOf(wallet.address)).to.eq(
            totalSupplyWETH.sub(2000)
        );
    });


    it("removeLiquidityETH with fee", async () => {
        const {
            bananaSwap,
            wallet,
            WETHPartner,
            WETH,
            wethPair: WETHPair,
            tokenManager,
            feeHandler,
            user,
            bananaLiquid,
        } = await loadFixture(v2Fixture);

        const WETHPartnerAmount = expandTo18Decimals(1);
        const ETHAmount = expandTo18Decimals(4);
        await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
        await WETH.deposit({ value: ETHAmount });
        await WETH.transfer(WETHPair.address, ETHAmount);
        await WETHPair.mint(wallet.address);

        const expectedLiquidity = expandTo18Decimals(2);
        const WETHPairToken0 = await WETHPair.token0();
        await WETHPair.approve(bananaLiquid.address, ethers.constants.MaxUint256);

        //set the token1 is tokenA
        await tokenManager.addTokenAList(WETHPartner.address, true);
        let ethBalanceOfUserBefore = await wallet.getBalance();
        let actionType = 3; //AddLiquid
        const rewardFeeRatio = 100;
        let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
        let rewardType = 0;
        await WETHPartner.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);


        // await WETHPartner.transfer(user.address, WETHPartnerAmount);
        // await WETHPartner.connect(user).approve(delegator.address, MaxUint256, { from: user.address });

        // await expect(
        //  bananaLiquid.removeLiquidityETH(
        //      WETHPartner.address,
        //      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
        //      0,
        //      0,
        //      wallet.address,
        //      ethers.constants.MaxUint256
        //  )
        // ).to.be.revertedWith("Not Delegator");

        await bananaLiquid.removeLiquidityETH(
            WETHPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        )

        expect(await WETHPair.balanceOf(wallet.address)).to.eq(0);
        const totalSupplyWETHPartner = await WETHPartner.totalSupply();
        const totalSupplyWETH = await WETH.totalSupply();
        expect(await WETHPartner.balanceOf(wallet.address)).to.eq(
            totalSupplyWETHPartner.sub(500).sub((WETHPartnerAmount.sub(500)).mul(rewardFeeRatio).div(baseRatio))
        );
        expect(await WETH.balanceOf(wallet.address)).to.eq(
            totalSupplyWETH.sub(2000)
        );
    });

    // it("removeLiquidityWithPermit", async () => {
    //  const { bananaSwap, token0, token1, wallet, pair, delegator } = await loadFixture(
    //      v2Fixture
    //  );

    //  const token0Amount = expandTo18Decimals(1);
    //  const token1Amount = expandTo18Decimals(4);
    //  await token0.transfer(pair.address, token0Amount);
    //  await token1.transfer(pair.address, token1Amount);
    //  await pair.mint(wallet.address);

    //  const expectedLiquidity = expandTo18Decimals(2);

    //  const nonce = await pair.nonces(wallet.address);
    //  const digest = await getApprovalDigest(
    //      pair,
    //      {
    //          owner: wallet.address,
    //          spender: delegator.address,
    //          value: expectedLiquidity.sub(MINIMUM_LIQUIDITY),
    //      },
    //      nonce,
    //      ethers.constants.MaxUint256
    //  );

    //  const { v, r, s } = wallet
    //      ._signingKey()
    //      .signDigest(Buffer.from(digest.slice(2), "hex"));

    //  await delegator.removeLiquidityWithPermit(
    //      token0.address,
    //      token1.address,
    //      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
    //      0,
    //      0,
    //      wallet.address,
    //      ethers.constants.MaxUint256,
    //      false,
    //      v,
    //      r,
    //      s
    //  );
    // });

    // it("removeLiquidityETHWithPermit", async () => {
    //  const { bananaSwap, wallet, WETHPartner, wethPair, WETH, delegator, user } = await loadFixture(
    //      v2Fixture
    //  );

    //  const WETHPartnerAmount = expandTo18Decimals(1);
    //  const ETHAmount = expandTo18Decimals(4);
    //  await WETHPartner.transfer(wethPair.address, WETHPartnerAmount);
    //  await WETH.deposit({ value: ETHAmount });
    //  await WETH.transfer(wethPair.address, ETHAmount);
    //  await wethPair.mint(wallet.address);

    //  const expectedLiquidity = expandTo18Decimals(2);

    //  const nonce = await wethPair.nonces(wallet.address);
    //  const digest = await getApprovalDigest(
    //      wethPair,
    //      {
    //          owner: wallet.address,
    //          spender: delegator.address,
    //          value: expectedLiquidity.sub(MINIMUM_LIQUIDITY),
    //      },
    //      nonce,
    //      ethers.constants.MaxUint256
    //  );

    //  const { v, r, s } = wallet
    //      ._signingKey()
    //      .signDigest(Buffer.from(digest.slice(2), "hex"));

    //  await delegator.removeLiquidityETHWithPermit(
    //      WETHPartner.address,
    //      expectedLiquidity.sub(MINIMUM_LIQUIDITY),
    //      0,
    //      0,
    //      wallet.address,
    //      ethers.constants.MaxUint256,
    //      false,
    //      v,
    //      r,
    //      s
    //  );
    // });

    describe("swapTokensForExactTokens", () => {
        const token0Amount = expandTo18Decimals(5);
        const token1Amount = expandTo18Decimals(10);
        const expectedSwapAmount = BigNumber.from("557227237267357629");
        const outputAmount = expandTo18Decimals(1);

        it("swap token for exact token without fee", async () => {
            const { token0, token1, wallet, pair,bananaSwap } = await loadFixture(
                v2Fixture
            );

            // before each
            await token0.transfer(pair.address, token0Amount);
            await token1.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);

            await token0.approve(bananaSwap.address, ethers.constants.MaxUint256);
            // await expect(
            //  bananaSwap.swapTokensForExactTokens(
            //      outputAmount,
            //      ethers.constants.MaxUint256,
            //      [token0.address, token1.address],
            //      wallet.address,
            //      ethers.constants.MaxUint256
            //  )
            // ).to.be.revertedWith("Not Delegator");
            await expect(
                bananaSwap.swapTokensForExactTokens(
                    outputAmount,
                    ethers.constants.MaxUint256,
                    [token0.address, token1.address],
                    wallet.address,
                    ethers.constants.MaxUint256
                )
            )
                .to.emit(token0, "Transfer")
                .withArgs(wallet.address, pair.address, expectedSwapAmount)
                .to.emit(token1, "Transfer")
                .withArgs(pair.address, wallet.address, outputAmount)
                .to.emit(pair, "Sync")
                .withArgs(
                    token0Amount.add(expectedSwapAmount),
                    token1Amount.sub(outputAmount)
                )
                .to.emit(pair, "Swap")
                .withArgs(
                 bananaSwap.address,
                 expectedSwapAmount,
                 0,
                 0,
                 outputAmount,
                 wallet.address
                );
        });


        it("swap token for exact token with buy fee", async () => {
            const { token0, token1, wallet, pair, tokenManager, feeHandler, user,bananaSwap,routerQuery } = await loadFixture(
                v2Fixture
            );

            // before each
            await token0.transfer(pair.address, token0Amount);
            await token1.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            const swapAmount = expandTo18Decimals(1);
            await token0.transfer(user.address, swapAmount);
            // await token0.approve(delegator.address, ethers.constants.MaxUint256);



            //set the token1 is tokenA
            await tokenManager.addTokenAList(token1.address, true);
            let actionType = 0; //buy
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            //set the token0 is usdt
            // await tokenManager.addUsdtList(token0.address,true);

            await token0.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });


            let userBalanceOfToken1Before = await token1.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsIn(outputAmount, [token0.address, token1.address]);

            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            expect(reserve0).to.be.equals(token0Amount);
            console.log("before reserve0 is:", reserve0);
            let tx = await bananaSwap.connect(user).swapTokensForExactTokens(
                outputAmount,
                ethers.constants.MaxUint256,
                [token0.address, token1.address],
                user.address,
                ethers.constants.MaxUint256,
                { from: user.address }
            );



            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;

            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            console.log("after reserve0,reserve1 is:", reserve0,reserve1);
            console.log("amounts is:", amounts);
            expect(reserve0).to.be.equals(amounts[0].add(token0Amount));

            let userBalanceOfToken0 = await token0.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(amounts[0]));
            let userBalanceOfToken1 = await token1.balanceOf(user.address);
            let leftAmount = amounts[1];
            expect(userBalanceOfToken1).to.be.equals(outputAmount);
            expect(userBalanceOfToken1).to.be.equals(leftAmount);
            // let feeAmount = amounts[1].mul(baseRatio).div(baseRatio-rewardFeeRatio).sub(amounts[1]);
            let feeAmount = amounts[1].mul(baseRatio).div(baseRatio - rewardFeeRatio).sub(amounts[1]);
            console.log("amounts[1].mul(baseRatio).div(baseRatio-rewardFeeRatio) is:", amounts[1].mul(baseRatio).div(baseRatio - rewardFeeRatio));
            let balanceOfFeeHandler = await token1.balanceOf(feeHandler.address);
            expect(feeAmount.div(10)).to.be.equals(balanceOfFeeHandler.div(10));
        });

    });

    describe("swapExactETHForTokens", () => {
        const WETHPartnerAmount = expandTo18Decimals(10);
        const ETHAmount = expandTo18Decimals(5);
        const swapAmount = expandTo18Decimals(1);
        const expectedOutputAmount = BigNumber.from("1662497915624478906");

        it.skip("happy path", async () => {
            const {
                token0,
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            // before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);
            await token0.approve(bananaSwap.address, ethers.constants.MaxUint256);

            const WETHPairToken0 = await WETHPair.token0();
            // await expect(
            //  bananaSwap.swapExactETHForTokens(
            //      0,
            //      [WETH.address, WETHPartner.address],
            //      wallet.address,
            //      ethers.constants.MaxUint256,
            //      {
            //          value: swapAmount,
            //      }
            //  )
            // ).to.be.revertedWith("Not Delegator");
            await expect(
                bananaSwap.swapExactETHForTokens(
                    0,
                    [WETH.address, WETHPartner.address],
                    wallet.address,
                    ethers.constants.MaxUint256,
                    {
                        value: swapAmount,
                    }
                )
            )
                .to.emit(WETH, "Transfer")
                .withArgs(wallet.address, WETHPair.address, swapAmount)
                .to.emit(WETHPartner, "Transfer")
                .withArgs(WETHPair.address, wallet.address, expectedOutputAmount)
                .to.emit(WETHPair, "Sync")
                .withArgs(
                    WETHPairToken0 === WETHPartner.address
                        ? WETHPartnerAmount.sub(expectedOutputAmount)
                        : ETHAmount.add(swapAmount),
                    WETHPairToken0 === WETHPartner.address
                        ? ETHAmount.add(swapAmount)
                        : WETHPartnerAmount.sub(expectedOutputAmount)
                )
                .to.emit(WETHPair, "Swap")
                .withArgs(
                 bananaSwap.address,
                 WETHPairToken0 === WETHPartner.address ? 0 : swapAmount,
                 WETHPairToken0 === WETHPartner.address ? swapAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount,
                 wallet.address
                );
        });

        it("swapExactETHForTokens with fee", async () => {
            const {
                token0,
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                tokenA,
                tokenAUsdtPair,
                tokenManager,
                feeHandler,
                routerQuery,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            // before each
            const WETHPartnerAmount = expandTo18Decimals(5);
            const TokenAPartnerAmount = expandTo18Decimals(5);
            const ETHAmount = expandTo18Decimals(10);
            const TokenAAmount = expandTo18Decimals(10);
            const swapAmountOut = expandTo18Decimals(1);
            //before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);


            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 0; //buy
            const rewardFeeRatio = 200;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let ethBalanceBefore = await wallet.getBalance();
            console.log("ethBalanceBefore is:", ethBalanceBefore.toString());
            let path = [WETH.address, WETHPartner.address, tokenA.address];
            let amountOut = await routerQuery.getAmountsOut(swapAmount, path);
            console.log("amountOut", amountOut);

            const WETHPairToken0 = await WETHPair.token0();
            let tokenABalanceBefore = await tokenA.balanceOf(wallet.address);
            console.log("tokenABalanceBefore is:", tokenABalanceBefore);
            await bananaSwap.swapExactETHForTokens(
                0,
                path,
                wallet.address,
                ethers.constants.MaxUint256,
                {
                    value: swapAmount,
                }
            )
            console.log("abcdef1");
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            console.log("abcdef2");
            let feeAmount = amountOut[2].mul(rewardFeeRatio).div(baseRatio - rewardFeeRatio);
            console.log("abcdef3");
            expect(balanceOfFeeHandler.div(10)).to.equal(feeAmount.div(10));
            //检查 pair0 reserve0
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            console.log("reserve0, reserve1", reserve0, reserve1);
            let pToken0 = await WETHPair.token0();
            let tokenFirst = WETH.address==pToken0?reserve0:reserve1;
            expect(tokenFirst).to.be.equals(ETHAmount.add(swapAmount));
            [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            console.log("reserve0, reserve1", reserve0, reserve1);
            let tokenAAmountOut = amountOut[2];
            let tokenABalanceAfter = await tokenA.balanceOf(wallet.address);
            console.log("tokenABalanceAfter is:", tokenABalanceAfter);
            expect(tokenAAmountOut).to.equal(tokenABalanceAfter.sub(tokenABalanceBefore));
        });
    });

    describe("swapTokensForExactTokens", () => {
        const WETHPartnerAmount = expandTo18Decimals(5);
        const ETHAmount = expandTo18Decimals(10);
        const expectedSwapAmount = BigNumber.from("557227237267357629");
        const outputAmount = expandTo18Decimals(1);

        it("happy path", async () => {
            const {
                token0,
                wallet,
                WETHPartner,
                WETH,
                tokenA,
                tokenAUsdtPair,
                tokenManager,
                feeHandler,
                routerQuery,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            // before each
            const TokenAPartnerAmount = expandTo18Decimals(5);
            const TokenAAmount = expandTo18Decimals(10);
            const swapAmountOut = expandTo18Decimals(1);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);


            let actionType = 1; //sell
            const rewardFeeRatio = 200;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let path = [tokenA.address,WETHPartner.address];
            let amountIn = await routerQuery.getAmountsIn(swapAmountOut, path);
            console.log("amountIn", amountIn);


            await tokenA.approve(bananaSwap.address, ethers.constants.MaxUint256);
            console.log("abc1");
            await
                bananaSwap.swapTokensForExactTokens(
                    swapAmountOut,
                    ethers.constants.MaxUint256,
                    path,
                    wallet.address,
                    ethers.constants.MaxUint256
                )
                console.log("abc2");
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            // let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            // [reserve0, reserve1, blockTimestampLast] = await tokenAUsdtPair.getReserves();
            // console.log("reserve0, reserve1", reserve0, reserve1);
            // expect(reserve1).to.be.equals(TokenAAmount.add(amountIn[0].mul(baseRatio-rewardFeeRatio).div(baseRatio)));
            // console.log("reserve0, reserve1", reserve0, reserve1);

            // let ethAmountOut = amountIn[2];
            // let ethBalance = await wallet.getBalance();
            // expect(ethAmountOut).to.equal(swapAmountOut);
        });

        it.skip("swapTokensForExactToken with fee", async () => {
            const {
                token0,
                wallet,
                WETHPartner,
                WETH,
                tokenA,
                tokenAUsdtPair,
                tokenManager,
                feeHandler,
                routerQuery,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            // before each
            const TokenAPartnerAmount = expandTo18Decimals(5);
            const TokenAAmount = expandTo18Decimals(10);
            const swapAmountOut = expandTo18Decimals(1);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);


            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1; //sell
            const rewardFeeRatio = 200;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let path = [tokenA.address,WETHPartner.address];
            let amountIn = await routerQuery.getAmountsIn(swapAmountOut, path);
            console.log("amountIn", amountIn);


            await tokenA.approve(bananaSwap.address, ethers.constants.MaxUint256);
            console.log("abc1");
            await
                bananaSwap.swapTokensForExactTokens(
                    swapAmountOut,
                    ethers.constants.MaxUint256,
                    path,
                    wallet.address,
                    ethers.constants.MaxUint256
                )
                console.log("abc2");
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            let feeAmount = amountIn[0].mul(rewardFeeRatio).div(baseRatio);
            expect(balanceOfFeeHandler.sub(1)).to.equal(feeAmount);
            //检查 pair0 reserve0
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await tokenAUsdtPair.getReserves();
            console.log("reserve0, reserve1", reserve0, reserve1);
            expect(reserve0).to.be.equals(TokenAAmount.add(amountIn[0].mul(baseRatio-rewardFeeRatio).div(baseRatio)));
            console.log("reserve0, reserve1", reserve0, reserve1);

            // let ethAmountOut = amountIn[2];
            // let ethBalance = await wallet.getBalance();
            // expect(ethAmountOut).to.equal(swapAmountOut);

            
        });

    });

    describe("swapTokensForExactETH", () => {
        const WETHPartnerAmount = expandTo18Decimals(5);
        const ETHAmount = expandTo18Decimals(10);
        const expectedSwapAmount = BigNumber.from("557227237267357629");
        const outputAmount = expandTo18Decimals(1);

        it("happy path", async () => {
            const {
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                bananaSwap
            } = await loadFixture(v2Fixture);

            // before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            await WETHPartner.approve(bananaSwap.address, ethers.constants.MaxUint256);
            const WETHPairToken0 = await WETHPair.token0();
            // await expect(
            //  bananaSwap.swapTokensForExactETH(
            //      outputAmount,
            //      ethers.constants.MaxUint256,
            //      [WETHPartner.address, WETH.address],
            //      wallet.address,
            //      ethers.constants.MaxUint256
            //  )
            // ).to.be.revertedWith("Not Delegator");
            await expect(
                bananaSwap.swapTokensForExactETH(
                    outputAmount,
                    ethers.constants.MaxUint256,
                    [WETHPartner.address, WETH.address],
                    wallet.address,
                    ethers.constants.MaxUint256
                )
            )
                .to.emit(WETHPartner, "Transfer")
                .withArgs(wallet.address, WETHPair.address, expectedSwapAmount)
                .to.emit(WETH, "Transfer")
                .withArgs(WETHPair.address, bananaSwap.address, outputAmount)
                .to.emit(WETHPair, "Sync")
                .withArgs(
                    WETHPairToken0 === WETHPartner.address
                        ? WETHPartnerAmount.add(expectedSwapAmount)
                        : ETHAmount.sub(outputAmount),
                    WETHPairToken0 === WETHPartner.address
                        ? ETHAmount.sub(outputAmount)
                        : WETHPartnerAmount.add(expectedSwapAmount)
                )
                .to.emit(WETHPair, "Swap")
                .withArgs(
                 bananaSwap.address,
                 WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount,
                 WETHPairToken0 === WETHPartner.address ? 0 : outputAmount,
                 WETHPairToken0 === WETHPartner.address ? outputAmount : 0,
                 bananaSwap.address
                );
        });

        it("swapTokensForExactETH with fee", async () => {
            const {
                token0,
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                tokenA,
                tokenAUsdtPair,
                tokenManager,
                feeHandler,
                routerQuery,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            // before each
            const WETHPartnerAmount = expandTo18Decimals(5);
            const TokenAPartnerAmount = expandTo18Decimals(5);
            const ETHAmount = expandTo18Decimals(10);
            const TokenAAmount = expandTo18Decimals(10);
            const swapAmountOut = expandTo18Decimals(1);
            //before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);


            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1; //sell
            const rewardFeeRatio = 200;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let ethBalanceBefore = await wallet.getBalance();
            console.log("ethBalanceBefore is:", ethBalanceBefore.toString());
            let path = [tokenA.address,WETHPartner.address,WETH.address];
            let amountIn = await routerQuery.getAmountsIn(swapAmountOut, path);
            console.log("amountIn", amountIn);

            const WETHPairToken0 = await WETHPair.token0();




            let expectedSwapEthAmount = BigNumber.from("1390276097408206921");
            await tokenA.approve(bananaSwap.address, ethers.constants.MaxUint256);
            console.log("abc1");
            await
                bananaSwap.swapTokensForExactETH(
                    swapAmountOut,
                    ethers.constants.MaxUint256,
                    path,
                    wallet.address,
                    ethers.constants.MaxUint256
                )
                console.log("abc2");
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            let feeAmount = amountIn[0].mul(rewardFeeRatio).div(baseRatio);
            expect(balanceOfFeeHandler.sub(1)).to.equal(feeAmount);
            //检查 pair0 reserve0
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await tokenAUsdtPair.getReserves();
            let pToken0 = await tokenAUsdtPair.token0();
            let tokenFirst = tokenA.address==pToken0?reserve0:reserve1;
            expect(tokenFirst).to.be.equals(TokenAAmount.add(amountIn[0].mul(baseRatio-rewardFeeRatio).div(baseRatio)));
            [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            console.log("reserve0, reserve1", reserve0, reserve1);

            let ethAmountOut = amountIn[2];
            let ethBalance = await wallet.getBalance();
            expect(ethAmountOut).to.equal(swapAmountOut);

            
        });

        //   it("amounts", async () => {
        //     const {
        //       bananaSwap,
        //       wallet,
        //       WETHPartner,
        //       wethPair: WETHPair,
        //       WETH,
        //       RouterEmit,
        //     } = await loadFixture(v2Fixture);

        //     // before each
        //     await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
        //     await WETH.deposit({ value: ETHAmount });
        //     await WETH.transfer(WETHPair.address, ETHAmount);
        //     await WETHPair.mint(wallet.address);

        //     await WETHPartner.approve(
        //       RouterEmit.address,
        //       ethers.constants.MaxUint256
        //     );
        //     await expect(
        //       RouterEmit.swapTokensForExactETH(
        //         bananaSwap.address,
        //         outputAmount,
        //         ethers.constants.MaxUint256,
        //         [WETHPartner.address, WETH.address],
        //         wallet.address,
        //         ethers.constants.MaxUint256
        //       )
        //     )
        //       .to.emit(RouterEmit, "Amounts")
        //       .withArgs([expectedSwapAmount, outputAmount]);
        //   });
    });

    describe("swap tokenA => usdt => eth ExactTokensForETH", () => {
        const WETHPartnerAmount = expandTo18Decimals(5);
        const TokenAPartnerAmount = expandTo18Decimals(5);
        const ETHAmount = expandTo18Decimals(10);
        const TokenAAmount = expandTo18Decimals(10);
        const swapAmount = expandTo18Decimals(1);
        const expectedOutputAmount = BigNumber.from("1662497915624478906");

        it("happy path", async () => {
            const {
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            //before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            await WETHPartner.approve(bananaSwap.address, ethers.constants.MaxUint256);
            const WETHPairToken0 = await WETHPair.token0();
            await expect(
                bananaSwap.swapExactTokensForETH(
                    swapAmount,
                    0,
                    [WETHPartner.address, WETH.address],
                    wallet.address,
                    ethers.constants.MaxUint256
                )
            )
                .to.emit(WETHPartner, "Transfer")
                .withArgs(wallet.address, WETHPair.address, swapAmount)
                .to.emit(WETH, "Transfer")
                .withArgs(WETHPair.address, bananaSwap.address, expectedOutputAmount)
                .to.emit(WETHPair, "Sync")
                .withArgs(
                    WETHPairToken0 === WETHPartner.address
                        ? WETHPartnerAmount.add(swapAmount)
                        : ETHAmount.sub(expectedOutputAmount),
                    WETHPairToken0 === WETHPartner.address
                        ? ETHAmount.sub(expectedOutputAmount)
                        : WETHPartnerAmount.add(swapAmount)
                )
                .to.emit(WETHPair, "Swap")
                .withArgs(
                 bananaSwap.address,
                 WETHPairToken0 === WETHPartner.address ? swapAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? 0 : swapAmount,
                 WETHPairToken0 === WETHPartner.address ? 0 : expectedOutputAmount,
                 WETHPairToken0 === WETHPartner.address ? expectedOutputAmount : 0,
                 bananaSwap.address
                );
        });


        it("tokenA => usdt => eth ExactTokensForETH with fee", async () => {
            const {
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                tokenAUsdtPair,
                tokenA,
                feeHandler,
                tokenManager,
                user,
                bananaSwap,
                routerQuery,

            } = await loadFixture(v2Fixture);

            //before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);

            await tokenA.approve(bananaSwap.address, ethers.constants.MaxUint256);

            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1; //sell
            const rewardFeeRatio = 100;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let ethBalanceBefore = await wallet.getBalance();
            console.log("ethBalanceBefore is:", ethBalanceBefore.toString());
            let amountOut = await routerQuery.getAmountsOut(swapAmount, [tokenA.address, WETHPartner.address, WETH.address]);
            console.log("amountOut", amountOut);
            let tx = await bananaSwap.swapExactTokensForETH(
                swapAmount,
                0,
                [tokenA.address, WETHPartner.address, WETH.address],
                wallet.address,
                ethers.constants.MaxUint256
            );
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            expect(balanceOfFeeHandler).to.equal(feeAmount);
            //检查 pair0 reserve0
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await tokenAUsdtPair.getReserves();
            let pToken0 = await tokenAUsdtPair.token0();
            let tokenFirst = tokenA.address==pToken0?reserve0:reserve1;
            expect(tokenFirst).to.be.equals(TokenAAmount.add(swapAmount.mul(baseRatio - rewardFeeRatio).div(baseRatio)));
            // [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            // console.log("reserve0, reserve1", reserve0, reserve1);


            let ethAmountOut = amountOut[2];
            let ethBalance = await wallet.getBalance();
            expect(ethAmountOut.div(expandTo18Decimals(1))).to.equal((ethBalance.sub(ethBalanceBefore)).div(expandTo18Decimals(1)));
        });
    });

    describe("swapETHForExactTokens", () => {
        const WETHPartnerAmount = expandTo18Decimals(10);
        const ETHAmount = expandTo18Decimals(5);
        const expectedSwapAmount = BigNumber.from("557227237267357629");
        const outputAmount = expandTo18Decimals(1);

        it("happy path", async () => {
            const {
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                bananaSwap,
            } = await loadFixture(v2Fixture);

            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            const WETHPairToken0 = await WETHPair.token0();
            await expect(
                bananaSwap.swapETHForExactTokens(
                    outputAmount,
                    [WETHPartner.address, WETH.address],
                    wallet.address,
                    ethers.constants.MaxUint256,
                    {
                        value: expectedSwapAmount,
                    }
                )
            ).to.be.revertedWith("INVALID_PATH");
            await expect(
                bananaSwap.swapETHForExactTokens(
                    outputAmount,
                    [WETH.address, WETHPartner.address],
                    wallet.address,
                    ethers.constants.MaxUint256,
                    {
                        value: 0,
                    }
                )
            ).to.be.revertedWith("EXCESSIVE_INPUT_AMOUNT");
            await expect(
                bananaSwap.swapETHForExactTokens(
                    outputAmount,
                    [WETH.address, WETHPartner.address],
                    wallet.address,
                    ethers.constants.MaxUint256,
                    {
                        value: expectedSwapAmount,
                    }
                )
            )
                .to.emit(WETH, "Transfer")
                .withArgs(bananaSwap.address, WETHPair.address, expectedSwapAmount)
                .to.emit(WETHPartner, "Transfer")
                .withArgs(WETHPair.address, wallet.address, outputAmount)
                .to.emit(WETHPair, "Sync")
                .withArgs(
                    WETHPairToken0 === WETHPartner.address
                        ? WETHPartnerAmount.sub(outputAmount)
                        : ETHAmount.add(expectedSwapAmount),
                    WETHPairToken0 === WETHPartner.address
                        ? ETHAmount.add(expectedSwapAmount)
                        : WETHPartnerAmount.sub(outputAmount)
                )
                .to.emit(WETHPair, "Swap")
                .withArgs(
                 bananaSwap.address,
                 WETHPairToken0 === WETHPartner.address ? 0 : expectedSwapAmount,
                 WETHPairToken0 === WETHPartner.address ? expectedSwapAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? outputAmount : 0,
                 WETHPairToken0 === WETHPartner.address ? 0 : outputAmount,
                 wallet.address
                );
        });

        it("eth => usdt => tokenA swapETHForExactTokens with fee", async () => {
            const {
                wallet,
                WETHPartner,
                wethPair: WETHPair,
                WETH,
                tokenAUsdtPair,
                tokenA,
                feeHandler,
                tokenManager,
                routerQuery,
                bananaSwap
            } = await loadFixture(v2Fixture);


            const WETHPartnerAmount = expandTo18Decimals(5);
            const TokenAPartnerAmount = expandTo18Decimals(5);
            const ETHAmount = expandTo18Decimals(10);
            const TokenAAmount = expandTo18Decimals(10);
            const swapAmountOut = expandTo18Decimals(1);
            //before each
            await WETHPartner.transfer(WETHPair.address, WETHPartnerAmount);
            await WETH.deposit({ value: ETHAmount });
            await WETH.transfer(WETHPair.address, ETHAmount);
            await WETHPair.mint(wallet.address);

            //添加tokenA的流动性。
            await WETHPartner.transfer(tokenAUsdtPair.address, TokenAPartnerAmount);
            await tokenA.transfer(tokenAUsdtPair.address, TokenAAmount);
            await tokenAUsdtPair.mint(wallet.address);

            // await tokenA.approve(delegator.address, ethers.constants.MaxUint256);

            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 0; //buy
            const rewardFeeRatio = 200;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            let ethBalanceBefore = await wallet.getBalance();
            console.log("ethBalanceBefore is:", ethBalanceBefore.toString());
            let amountIn = await routerQuery.getAmountsIn(swapAmountOut, [WETH.address, WETHPartner.address, tokenA.address]);
            console.log("amountIn", amountIn);
            let expectedSwapEthAmount = BigNumber.from("1390276097408206921");
            let tx = await
                bananaSwap.swapETHForExactTokens(
                    swapAmountOut,
                    [WETH.address, WETHPartner.address, tokenA.address],
                    wallet.address,
                    ethers.constants.MaxUint256,
                    {
                        value: expectedSwapEthAmount,
                    }
                )
            //开始计算交易金额
            //先扣第一笔手续费到feeHandler。
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            let feeAmount = amountIn[2].mul(rewardFeeRatio).div(baseRatio - rewardFeeRatio);
            expect(balanceOfFeeHandler.div(10)).to.equal(feeAmount.div(10));
            //检查 pair0 reserve0
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            // let reserveEth;
            // let token0=WETHPair.token0();
            // if(WETH==token0){
            //  reserveEth = reserve0;
            // }else{
            //  reserveEth = reserve1;
            // }
            let pToken0 = await WETHPair.token0();
            let tokenFirst = WETH.address==pToken0?reserve0:reserve1;
            expect(tokenFirst).to.be.equals(ETHAmount.add(expectedSwapEthAmount.sub(BigNumber.from("100000000000000000"))));
            [reserve0, reserve1, blockTimestampLast] = await WETHPair.getReserves();
            console.log("reserve0, reserve1", reserve0, reserve1);


            let ethAmountOut = amountIn[2];
            let ethBalance = await wallet.getBalance();
            expect(ethAmountOut).to.equal(swapAmountOut);
        });
    });

    describe("swapExactTokensForTokens reduceRatio", () => {
        const token0Amount = expandTo18Decimals(5);
        const token1Amount = expandTo18Decimals(10);
        const swapAmount = expandTo18Decimals(1);
        const outputAmount = expandTo18Decimals(1);
        const expectedOutputAmount = BigNumber.from("1662497915624478906");

        it("TokenA sell USDT with fee add reducedConfig", async () => {
            const { tokenA, wallet, user, tokenManager, feeHandler,
                usdt, newTokenAUsdtPair, oracle, factoryV2,
                bananaSwap, routerQuery } = await loadFixture(v2Fixture);

            // before each
            await tokenA.transfer(newTokenAUsdtPair.address, token0Amount);
            await usdt.transfer(newTokenAUsdtPair.address, token1Amount);
            await newTokenAUsdtPair.mint(wallet.address);
            let initialPrice = BigNumber.from(4).shl(112);
            let tokenAAddress = "0xC08e1e90D85105e4f9F01f7FD23aF8d48e4737f3";
            let usdtAddress = "0x37786ab151f92Aec61b23576F26142698F72e3Bc";
            let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            console.log("pairAddress is:----------",pairAddress);
            await oracle.initialize(factoryV2.address, tokenA.address, usdt.address,pairAddress,initialPrice);
            await tokenA.setOracle(oracle.address);

            console.log("newTokenAUsdtPair is:",newTokenAUsdtPair.address);
            await tokenA.transfer(user.address, swapAmount);
            // let oracle = await tokenA.oracle();
            let oraclePair = await oracle.pair();
            console.log("oraclePair is:",oraclePair);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // set reducerRatio
            let startPriceChange = 10;
            let endPriceChange = 80;
            let reducedRatio = 100;
            let insuredConfig = {start:startPriceChange,end:endPriceChange,ratio:reducedRatio};
            await tokenA.addInsuredConfig(insuredConfig);
            let tokenAUsdtPrice = await oracle.tokenAUsdtPrice();
            expect(tokenAUsdtPrice).to.equals(initialPrice);
            let getPriceChangeRatio = await oracle.getPriceChangeRatio();
            console.log("getPriceChangeRatio is:",getPriceChangeRatio);

            let insuredConfigRatio = await tokenA.getInsuredConfigRatio();
            console.log("insuredConfigRatio is:",insuredConfigRatio);
            expect(insuredConfigRatio).to.be.equals(reducedRatio);


            await tokenA.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            let deductUsdtAmount = swapAmount;


            let userBalanceOfToken1Before = await usdt.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsOut(swapAmount, [tokenA.address, usdt.address]);
            let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                0,
                [tokenA.address, usdt.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            );
            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await newTokenAUsdtPair.getReserves();
            let leftAmount = swapAmount.mul(baseRatio-(rewardFeeRatio+reducedRatio)).div(baseRatio);
            let tokenARserve = utilities.tokenAIsToken0(tokenA.address,usdt.address)?reserve0:reserve1;
            expect(tokenARserve).to.be.equals(leftAmount.add(token0Amount));

            let userBalanceOfToken0 = await tokenA.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(deductUsdtAmount));
            let userBalanceOfToken1 = await usdt.balanceOf(user.address);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            expect(feeAmount).to.be.equals(balanceOfFeeHandler);
            let reducedFee = swapAmount.mul(reducedRatio).div(baseRatio);
            let blackHoleBalance =await tokenA.balanceOf(blackHoleAddress);
            expect(reducedFee).to.be.equals(blackHoleBalance);
        });

        it("TokenA sell TokenB with fee add reducedConfig ", async () => {
            const { tokenA,tokenB,wallet, user, tokenManager, feeHandler,usdt,newTokenAUsdtPair,pair,oracle,factoryV2,bananaSwap,routerQuery } = await loadFixture(
                v2Fixture
            );

            // 设置tokenA/usdt的现价。
            await tokenA.transfer(newTokenAUsdtPair.address, token0Amount);
            await usdt.transfer(newTokenAUsdtPair.address, token1Amount);
            await newTokenAUsdtPair.mint(wallet.address);

            //设置tokenA/tokenB的现价
            await tokenA.transfer(pair.address, token0Amount);
            await tokenB.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);

            
            let initialPrice = BigNumber.from(4).shl(112);
            let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            await oracle.initialize(factoryV2.address, tokenA.address, usdt.address,pairAddress,initialPrice);
            await tokenA.setOracle(oracle.address);

            console.log("newTokenAUsdtPair is:",newTokenAUsdtPair.address);
            await tokenA.transfer(user.address, swapAmount);
            // let oracle = await tokenA.oracle();
            let oraclePair = await oracle.pair();
            console.log("oraclePair is:",oraclePair);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // set reducerRatio
            let startPriceChange = 10;
            let endPriceChange = 80;
            let reducedRatio = 100;
            let insuredConfig = {start:startPriceChange,end:endPriceChange,ratio:reducedRatio};
            await tokenA.addInsuredConfig(insuredConfig);
            let tokenAUsdtPrice = await oracle.tokenAUsdtPrice();
            expect(tokenAUsdtPrice).to.equals(initialPrice);
            let getPriceChangeRatio = await oracle.getPriceChangeRatio();
            console.log("getPriceChangeRatio is:",getPriceChangeRatio);

            let insuredConfigRatio = await tokenA.getInsuredConfigRatio();
            console.log("insuredConfigRatio is:",insuredConfigRatio);
            expect(insuredConfigRatio).to.be.equals(reducedRatio);


            await tokenA.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            let deductUsdtAmount = swapAmount;


            let userBalanceOfToken1Before = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsOut(swapAmount, [tokenA.address, tokenB.address]);
            let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                0,
                [tokenA.address, tokenB.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            );
            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            let leftAmount = swapAmount.mul(baseRatio-(rewardFeeRatio+reducedRatio)).div(baseRatio);
            let tokenARserve = utilities.tokenAIsToken0(tokenA.address,tokenB.address)?reserve0:reserve1;
            expect(tokenARserve).to.be.equals(leftAmount.add(token0Amount));

            let userBalanceOfToken0 = await tokenA.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(deductUsdtAmount));
            let userBalanceOfToken1 = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            expect(feeAmount).to.be.equals(balanceOfFeeHandler);
            let reducedFee = swapAmount.mul(reducedRatio).div(baseRatio);
            let blackHoleBalance = await tokenA.balanceOf(blackHoleAddress);
            expect(reducedFee).to.be.equals(blackHoleBalance);
        });

        it("TokenA sell exact TokenB with fee add reducedConfig", async () => {
            const { tokenA,tokenB,wallet, user, tokenManager, feeHandler,usdt,newTokenAUsdtPair,pair,oracle,factoryV2,bananaSwap,routerQuery } = await loadFixture(
                v2Fixture
            );

            // 设置tokenA/usdt的现价。
            await tokenA.transfer(newTokenAUsdtPair.address, token0Amount);
            await usdt.transfer(newTokenAUsdtPair.address, token1Amount);
            await newTokenAUsdtPair.mint(wallet.address);

            //设置tokenA/tokenB的现价
            await tokenA.transfer(pair.address, token0Amount);
            await tokenB.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);

            
            let initialPrice = BigNumber.from(4).shl(112);
            let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            await oracle.initialize(factoryV2.address, tokenA.address, usdt.address,pairAddress,initialPrice);
            await tokenA.setOracle(oracle.address);

            console.log("newTokenAUsdtPair is:",newTokenAUsdtPair.address);
            
            // let oracle = await tokenA.oracle();
            let oraclePair = await oracle.pair();
            console.log("oraclePair is:",oraclePair);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // set reducerRatio
            let startPriceChange = 10;
            let endPriceChange = 80;
            let reducedRatio = 100;
            let insuredConfig = {start:startPriceChange,end:endPriceChange,ratio:reducedRatio};
            await tokenA.addInsuredConfig(insuredConfig);
            let tokenAUsdtPrice = await oracle.tokenAUsdtPrice();
            expect(tokenAUsdtPrice).to.equals(initialPrice);
            let getPriceChangeRatio = await oracle.getPriceChangeRatio();
            console.log("getPriceChangeRatio is:",getPriceChangeRatio);

            let insuredConfigRatio = await tokenA.getInsuredConfigRatio();
            console.log("insuredConfigRatio is:",insuredConfigRatio);
            expect(insuredConfigRatio).to.be.equals(reducedRatio);


            await tokenA.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            
            let userBalanceOfToken1Before = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsIn(outputAmount, [tokenA.address, tokenB.address]);
            await tokenA.transfer(user.address, amounts[0]);

            let tx = await bananaSwap.connect(user).swapTokensForExactTokens(
                outputAmount,
                ethers.constants.MaxUint256,
                [tokenA.address, tokenB.address],
                user.address,
                ethers.constants.MaxUint256,
                { from: user.address }
            );

            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            let swapAmount = amounts[0];
            let leftAmount = swapAmount.mul(baseRatio-(rewardFeeRatio+reducedRatio)).div(baseRatio);
            let token0 = await pair.token0();
            let reserveTokenA = token0 == tokenA.address ? reserve0 : reserve1;
            expect(reserveTokenA).to.be.equals(leftAmount.add(token0Amount));

            let userBalanceOfToken0 = await tokenA.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(0);
            let userBalanceOfToken1 = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            expect(feeAmount).to.be.equals(balanceOfFeeHandler);
            let reducedFee = swapAmount.mul(reducedRatio).div(baseRatio);
            let blackHoleBalance = await tokenA.balanceOf(blackHoleAddress);
            expect(reducedFee).to.be.equals(blackHoleBalance);
        });

        it("TokenA sell TokenB with fee add reducedConfig without fee", async () => {
            const { tokenA,tokenB,wallet, user, tokenManager, feeHandler,usdt,newTokenAUsdtPair,pair,oracle,factoryV2,bananaSwap,routerQuery } = await loadFixture(
                v2Fixture
            );

            // 设置tokenA/usdt的现价。
            await tokenA.transfer(newTokenAUsdtPair.address,token1Amount );
            await usdt.transfer(newTokenAUsdtPair.address, token0Amount);
            await newTokenAUsdtPair.mint(wallet.address);

            // 设置tokenA/tokenB的现价
            await tokenA.transfer(pair.address, token0Amount);
            await tokenB.transfer(pair.address, token1Amount);
            await pair.mint(wallet.address);

            
            let initialPrice = BigNumber.from(4).shl(112);
            let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            await oracle.initialize(factoryV2.address, tokenA.address, usdt.address,pairAddress,initialPrice);
            await tokenA.setOracle(oracle.address);

            console.log("newTokenAUsdtPair is:",newTokenAUsdtPair.address);
            await tokenA.transfer(user.address, swapAmount);
            // let oracle = await tokenA.oracle();
            let oraclePair = await oracle.pair();
            console.log("oraclePair is:",oraclePair);
            //set the token1 is tokenA
            await tokenManager.addTokenAList(tokenA.address, true);
            let actionType = 1;
            const rewardFeeRatio = 500;
            let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            let rewardType = 0;
            await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // set reducerRatio
            let startPriceChange = 10;
            let endPriceChange = 80;
            let reducedRatio = 100;
            let insuredConfig = {start:startPriceChange,end:endPriceChange,ratio:reducedRatio};
            await tokenA.addInsuredConfig(insuredConfig);
            let tokenAUsdtPrice = await oracle.tokenAUsdtPrice();
            expect(tokenAUsdtPrice).to.equals(initialPrice);
            let getPriceChangeRatio = await oracle.getPriceChangeRatio();
            console.log("getPriceChangeRatio is:",getPriceChangeRatio);

            let insuredConfigRatio = await tokenA.getInsuredConfigRatio();
            console.log("insuredConfigRatio is:",insuredConfigRatio);
            expect(insuredConfigRatio).to.be.equals(0);


            await tokenA.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            let deductUsdtAmount = swapAmount;


            let userBalanceOfToken1Before = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1Before).to.equals(0);
            let amounts = await routerQuery.getAmountsOut(swapAmount, [tokenA.address, tokenB.address]);
            let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
                swapAmount,
                0,
                [tokenA.address, tokenB.address],
                user.address,
                ethers.constants.MaxUint256, { from: user.address }
            );
            let receipt = await tx.wait();
            // let listEvent = await receipt.events?.at(0);
            // console.log("listEvent is:",await listEvent);
            //test the swap result;
            let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            let token0 = await pair.token0();
            let resereTokenA = token0 == tokenA.address ? reserve0 : reserve1;
            let leftAmount = swapAmount.mul(baseRatio-(rewardFeeRatio)).div(baseRatio);
            expect(resereTokenA).to.be.equals(leftAmount.add(token0Amount));

            let userBalanceOfToken0 = await tokenA.balanceOf(user.address);
            expect(userBalanceOfToken0).to.be.equals(swapAmount.sub(deductUsdtAmount));
            let userBalanceOfToken1 = await tokenB.balanceOf(user.address);
            expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            expect(feeAmount).to.be.equals(balanceOfFeeHandler);
            let reducedFee = swapAmount.mul(reducedRatio).div(baseRatio);
            let blackHoleBalance = await tokenA.balanceOf(blackHoleAddress);
            expect(blackHoleBalance).to.be.equals(0);
        });

        it("test oracle initialize", async () => {
            const { tokenA,tokenB,wallet, user, tokenManager, feeHandler,usdt,newTokenAUsdtPair,pair,oracle,factoryV2,bananaSwap,routerQuery } = await loadFixture(
                v2Fixture
            );
            let initialPrice = BigNumber.from(4).shl(112);
            let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            await oracle.initialize(factoryV2.address, tokenB.address, usdt.address,pairAddress,initialPrice);
        });

        it("TokenA sell TokenB with fee add reducedConfig without fee", async () => {
            const { tokenA,tokenB,wallet, user, tokenManager, feeHandler,usdt,newTokenAUsdtPair,pair,oracle,factoryV2,bananaSwap,bananaLiquid,routerQuery } = await loadFixture(
                v2Fixture
            );

            
            // await tokenA.transfer(newTokenAUsdtPair.address,token1Amount );
            // await usdt.transfer(newTokenAUsdtPair.address, token0Amount);
            // await newTokenAUsdtPair.mint(wallet.address);
            let tokenABalanceOfWallet = await tokenA.balanceOf(wallet.address);
            let usdtBalanceOfWallet = await usdt.balanceOf(wallet.address);
            console.log("tokenABalanceOfWallet,usdtBalanceOfWallet is:",tokenABalanceOfWallet,usdtBalanceOfWallet);
            // 设置tokenA/usdt的现价。
            await tokenA.approve(bananaLiquid.address,ethers.constants.MaxUint256 );
            await usdt.approve(bananaLiquid.address, ethers.constants.MaxUint256);
            await bananaLiquid.addLiquidity(
                tokenA.address,
                usdt.address,
                token1Amount,
                token0Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            )

            // //设置tokenA/tokenB的现价
            // await tokenA.transfer(pair.address, token1Amount);
            // await tokenB.transfer(pair.address, token0Amount);
            // await pair.mint(wallet.address);


            //设置tokenA/tokenB的现价
            // await tokenA.approve(pair.address,token1Amount );
            // await tokenB.approve(pair.address, token0Amount);
            // await bananaLiquid.addLiquidity(
            //     tokenA.address,
            //     tokenB.address,
            //     token1Amount,
            //     token0Amount,
            //     0,
            //     0,
            //     wallet.address,
            //     ethers.constants.MaxUint256,
            // )

            
            // let initialPrice = BigNumber.from(4).shl(112);

            // let pairAddress = await factoryV2.pairFor(tokenA.address, usdt.address);
            // await oracle.initialize(factoryV2.address, tokenA.address, usdt.address,pairAddress,initialPrice);
            // await tokenA.setOracle(oracle.address);

            // console.log("newTokenAUsdtPair is:",newTokenAUsdtPair.address);
            // await tokenB.transfer(user.address, swapAmount);
            // // let oracle = await tokenA.oracle();
            // let oraclePair = await oracle.pair();
            // console.log("oraclePair is:",oraclePair);
            // //set the token1 is tokenA
            // await tokenManager.addTokenAList(tokenA.address, true);
            // let actionType = 1;
            // const rewardFeeRatio = 500;
            // let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
            // // tokenA is buy,So the feeConfig is not work.
            // let rewardType = 0;
            // await tokenA.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
            // // set reducerRatio
            // let startPriceChange = 10;
            // let endPriceChange = 80;
            // let reducedRatio = 100;
            // let insuredConfig = {start:startPriceChange,end:endPriceChange,ratio:reducedRatio};
            // await tokenA.addInsuredConfig(insuredConfig);
            // let tokenAUsdtPrice = await oracle.tokenAUsdtPrice();
            // expect(tokenAUsdtPrice).to.equals(initialPrice);
            // let getPriceChangeRatio = await oracle.getPriceChangeRatio();
            // console.log("getPriceChangeRatio is:",getPriceChangeRatio);

            // let insuredConfigRatio = await tokenA.getInsuredConfigRatio();
            // console.log("insuredConfigRatio is:",insuredConfigRatio);
            // expect(insuredConfigRatio).to.be.equals(0);


            // await tokenB.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256, { from: user.address });
            // let deductUsdtAmount = swapAmount;


            // let userBalanceOfToken1Before = await tokenA.balanceOf(user.address);
            // expect(userBalanceOfToken1Before).to.equals(0);
            // let amounts = await routerQuery.getAmountsOut(swapAmount, [tokenB.address, tokenA.address]);
            // let tx = await bananaSwap.connect(user).swapExactTokensForTokens(
            //     swapAmount,
            //     0,
            //     [tokenB.address, tokenA.address],
            //     user.address,
            //     ethers.constants.MaxUint256, { from: user.address }
            // );
            // let receipt = await tx.wait();
            // // let listEvent = await receipt.events?.at(0);
            // // console.log("listEvent is:",await listEvent);
            // //test the swap result;
            // let reserve0: BigNumber, reserve1: BigNumber, blockTimestampLast: BigNumber;
            // [reserve0, reserve1, blockTimestampLast] = await pair.getReserves();
            // let leftAmount = swapAmount.mul(baseRatio).div(baseRatio);
            // expect(reserve0).to.be.equals(token0Amount.add(swapAmount));

            // let userBalanceOfToken0 = await tokenB.balanceOf(user.address);
            // expect(userBalanceOfToken0).to.be.equals(0);
            // let userBalanceOfToken1 = await tokenA.balanceOf(user.address);
            // expect(userBalanceOfToken1).to.be.equals(amounts[1]);
            // let feeAmount = swapAmount.mul(rewardFeeRatio).div(baseRatio);
            // let balanceOfFeeHandler = await tokenA.balanceOf(feeHandler.address);
            // expect(balanceOfFeeHandler).to.be.equals(0);
            // let reducedFee = swapAmount.mul(reducedRatio).div(baseRatio);
            // let blackHoleBalance = await tokenA.balanceOf(blackHoleAddress);
            // expect(blackHoleBalance).to.be.equals(0);
        });
    });
});
