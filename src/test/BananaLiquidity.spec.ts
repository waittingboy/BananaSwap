import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { BananaQuery, ITokenAFeeHandler, IBananaSwapPair, TokenManager } from "../types";
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import bn from 'bignumber.js';
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

describe("BananaLiquid", () => {
    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function v2Fixture([wallet, other, user1, user2, user3, user4, user5, user6]: Wallet[], provider: MockProvider) {
        const commonTokenFactory = await ethers.getContractFactory("CommonToken");
        const cake = await commonTokenFactory.deploy({ gasLimit: "4600000" });
        await cake.initialize("CAKE", "CAKE", expandTo18Decimals(10000000000), { gasLimit: "4600000" });
        // console.log('cake address:', cake.address);

        const usdt = await commonTokenFactory.deploy({ gasLimit: "4600000" });
        await usdt.initialize("USDT", "USDT", expandTo18Decimals(10000000000), { gasLimit: "4600000" });
        // console.log('usdt address:', usdt.address);

        const nana = await commonTokenFactory.deploy({ gasLimit: "4600000" });
        await nana.initialize("NANA", "NANA", expandTo18Decimals(10000000000), { gasLimit: "4600000" });
        // console.log('nana address:', nana.address);

        const dota = await commonTokenFactory.deploy({ gasLimit: "4600000" });
        await dota.initialize("DOT", "DOT", expandTo18Decimals(10000000000), { gasLimit: "4600000" });
        // console.log('dota address:', dota.address);

        const TokenManager = await ethers.getContractFactory("TokenManager");
        const tokenManager = await TokenManager.deploy();
        // console.log('TokenManager address:', tokenManager.address);

        const tokenAFeeHandlerFactory = await ethers.getContractFactory("BananaSwapToken");
        // deploy tokenA DDC
        const tokenDDC = await tokenAFeeHandlerFactory.deploy();
        // console.log('tokenDDC address:', tokenDDC.address);
        await tokenDDC.initialize("DDC", "DDC",[10000],[wallet.address],expandTo18Decimals(10000000000));
        // await tokenDDC.born(wallet.address, expandTo18Decimals(10000000000), { gasLimit: "2600000" });

        const FeeHandler = await ethers.getContractFactory("FeeHandler");
        const ddcFeeHandler = await FeeHandler.deploy();
        await ddcFeeHandler.initialize();
        // console.log('ddcFeeHandler address:', ddcFeeHandler.address);

        // deploy tokenA apple
        const tokenApple = await tokenAFeeHandlerFactory.deploy();
        // console.log('tokenApple address:', tokenApple.address);
        await tokenApple.initialize("Apple", "APPLE",[10000],[wallet.address],expandTo18Decimals(10000000000));
        // await tokenApple.born(wallet.address, expandTo18Decimals(10000000000), { gasLimit: "2600000" });

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
        await tokenB.mint(wallet.address, expandTo18Decimals(10000000000), { gasLimit: "2600000" });

        //deploy WETH 
        const weth = await ethers.getContractFactory("WETH9");
        const WETH = await weth.deploy();
        // console.log('WETH address:', WETH.address);

        // usdtFeeHandle
        const usdtFeefactory = await ethers.getContractFactory("USDTFeeHandle");
        const usdtFeeHandle = await usdtFeefactory.deploy();
        //  console.log("usdtFeeHandle address:", usdtFeeHandle.address);

        // deploy V2 factory
        const v2factory = await ethers.getContractFactory("BananaSwapFactory");
        const factoryV2 = await v2factory.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
        // console.log('factoryV2 address:', factoryV2.address);

        console.log("============= codeHash: ", await factoryV2.PAIR_HASH());

        // deploy router-swap
        const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
        const routerSwap = await BananaSwapFactory.deploy();
        // console.log('routerSwap address:', routerSwap.address);

        const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
        const routerLiquid = await BananaLiquidFactory.deploy();
        // console.log('routerLiquid address:', routerLiquid.address);


        const BananaQuertyFactory = await ethers.getContractFactory("BananaQuery");
        const routerQuery = await BananaQuertyFactory.deploy();
        // console.log('routerQuery address:', routerQuery.address);

        const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
        const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
        // console.log('routerQuery4Swap address:', routerQuery4Swap.address);

        // pairB
        let pairBtoken0 = tokenB.address > usdt.address ? usdt : tokenB; // token 0 is TokenB
        let pairBtoken1 = tokenB.address > usdt.address ? tokenB : usdt;
        // console.log("pairB token0:", pairBtoken0.address);
        // console.log("pairB token1:", pairBtoken1.address);

        const TokenBPoolFactory = await ethers.getContractFactory("TokenBPool");
        const pairB = await upgrades.deployProxy(TokenBPoolFactory, [pairBtoken0.address, pairBtoken1.address, tokenB.address, factoryV2.address, wallet.address], { initializer: "initialize" });
        // console.log("pairB address:", pairB.address);

        await tokenManager.initialize(tokenB.address, usdt.address);

        await tokenManager.addRouter(routerSwap.address,true);
        await tokenManager.addRouter(routerLiquid.address,true);

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
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("0"), aFeeConfig, true, { gasLimit: "4600000" });
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("0"), aFeeConfig, true, { gasLimit: "4600000" });
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("1")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("1"), aFeeConfig, true, { gasLimit: "4600000" });
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("1"), aFeeConfig, true, { gasLimit: "4600000" });
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("2")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("2"), aFeeConfig, true, { gasLimit: "4600000" });
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("2"), aFeeConfig, true, { gasLimit: "4600000" });
        }
        {
            let aFeeConfig = {
                feeRatio: BigNumber.from("1000"),
                fee4UserRatio: BigNumber.from("9000"),
                actionType: BigNumber.from("3")
            }
            await usdtFeeHandle.setAFeeConfig(tokenDDC.address, BigNumber.from("3"), aFeeConfig, true, { gasLimit: "4600000" });
            await usdtFeeHandle.setAFeeConfig(tokenApple.address, BigNumber.from("3"), aFeeConfig, true, { gasLimit: "4600000" });
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
            await tokenDDC.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, { gasLimit: "4600000" });
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
            await tokenApple.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true, { gasLimit: "4600000" });
            await tokenApple.addWeList([reflowFeeHandlerApple.address])
        }

        await tokenB.setManager(usdtFeeHandle.address, true);
        let accounts = [
            wallet.address,
            usdtFeeHandle.address,
            "0x000000000000000000000000000000000000dEaD",
            "0x0000000000000000000000000000000000000000"
        ];
        await pairB.addTokenBExcludeBalanceList(accounts);
        // console.log("pairB.addTokenBExcludeBalanceList afeter");

        const BananaSwap4BFactory = await ethers.getContractFactory("BananaSwap4B");
        const routerSwap4B = await BananaSwap4BFactory.deploy();
        // console.log('routerSwap4B address:', routerSwap4B.address);

        await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "6000000" });
        await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, { gasLimit: "6000000" });
        await routerSwap4B.setUsdt(usdt.address, { gasLimit: "6000000" });
        await routerSwap4B.setPairB(pairB.address, { gasLimit: "6000000" });
        await routerSwap4B.setTokenB(tokenB.address, { gasLimit: "6000000" });

        await pairB.setRouterSwap4B(routerSwap4B.address, { gasLimit: "6000000" });

        await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), { gasLimit: "6000000" });
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
            await usdtFeeHandle.setBConfig(tokenB.address, bConfig, { gasLimit: "6000000" });
        }

        // await factoryV2.createPair(usdt.address, tokenDDC.address, { gasLimit: "9000000" });
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
            await tokenDDC.setLiquidityLockConfig(config, { gasLimit: "6000000" });
            // console.log("tokenDDC setLiquidityLockConfig: ");
        }

        // await factoryV2.createPair(usdt.address, tokenApple.address, { gasLimit: "9000000" });
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
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
            // console.log("tokenApple setLiquidityLockConfig: ");
        }

        // const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
        // const oracleDDC = await oracleFactory.deploy();
        // console.log("oracleDDC address: ", oracleDDC.address);

        // let initialPrice = 1;
        // await oracleDDC.initialize(factoryV2.address, tokenA.address, usdt.address, initialPrice, {gasLimit: "4600000"});
        // await tokenA.setOracle(oracleDDC.address, {gasLimit: "6000000"});

        // const oracleApple = await oracleFactory.deploy();
        // console.log("oracleApple address: ", oracleApple.address);

        // await oracleApple.initialize(factoryV2.address, tokenApple.address, usdt.address, initialPrice, {gasLimit: "4600000"});
        // await tokenApple.setOracle(oracleApple.address, {gasLimit: "6000000"});

        return {
            cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider
        };
    }

    it("setTokenManager", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await routerLiquid.setTokenManager(tokenManager.address);
        expect(await routerLiquid.tokenManager()).to.eq(tokenManager.address);
     });

    it("addLiquidity USDT-Cake", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            usdt.address,
            cake.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        const expectedLiquidity = expandTo18Decimals(10000);
        let pairCakeAddr = await routerQuery.pairFor(usdt.address, cake.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairCake = await PairFactory.attach(pairCakeAddr);

        expect(await pairCake.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await cake.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            usdt.address,
            cake.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );

        expect(await pairCake.balanceOf(user2.address)).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
    });

    it("removeLiquidity USDT-Cake", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            usdt.address,
            cake.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        const expectedLiquidity = expandTo18Decimals(10000);
        let pairCakeAddr = await routerQuery.pairFor(usdt.address, cake.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairCake = await PairFactory.attach(pairCakeAddr);

        expect(await pairCake.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await cake.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            usdt.address,
            cake.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        let liquidity = await pairCake.balanceOf(user2.address);

        expect(liquidity).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        expect(await usdt.balanceOf(user2.address)).to.eq(0);
        expect(await cake.balanceOf(user2.address)).to.eq(0);

        await pairCake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).removeLiquidity(
            usdt.address,
            cake.address,
            liquidity,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await usdt.balanceOf(user2.address)).to.eq(token0Amount);
        expect(await cake.balanceOf(user2.address)).to.eq(token0Amount);
    });

    it("addLiquidity Cake-USDT", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            cake.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        const expectedLiquidity = expandTo18Decimals(10000);
        let pairCakeAddr = await routerQuery.pairFor(usdt.address, cake.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairCake = await PairFactory.attach(pairCakeAddr);

        expect(await pairCake.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await cake.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            cake.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );

        expect(await pairCake.balanceOf(user2.address)).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
    });

    it("removeLiquidity Cake-USDT", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            cake.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        const expectedLiquidity = expandTo18Decimals(10000);
        let pairCakeAddr = await routerQuery.pairFor(usdt.address, cake.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairCake = await PairFactory.attach(pairCakeAddr);

        expect(await pairCake.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await cake.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await cake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            cake.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        let liquidity = await pairCake.balanceOf(user2.address);

        expect(liquidity).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        expect(await usdt.balanceOf(user2.address)).to.eq(0);
        expect(await cake.balanceOf(user2.address)).to.eq(0);

        await pairCake.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).removeLiquidity(
            cake.address,
            usdt.address,
            liquidity,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await usdt.balanceOf(user2.address)).to.eq(token0Amount);
        expect(await cake.balanceOf(user2.address)).to.eq(token0Amount);
    });

    it("addLiquidity USDT-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            usdt.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        const expectedLiquidity = expandTo18Decimals(1000);
        let pairBNBAddr = await routerQuery.pairFor(usdt.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(1000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            usdt.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
    });

    it("removeLiquidity USDT-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            usdt.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        const expectedLiquidity = expandTo18Decimals(1000);
        let pairBNBAddr = await routerQuery.pairFor(usdt.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(1000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            usdt.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );
        expect(await usdt.balanceOf(user2.address)).to.eq(0);

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expectedLiquidity);
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        await pairBNB.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).removeLiquidityETH(
            usdt.address,
            expectedLiquidity,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await usdt.balanceOf(user2.address)).to.eq(token0Amount);
    });

    it("addLiquidity USDT-TokenA", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);
        // console.log("wallet,user is:",wallet.address,user2.address);
        await tokenApple.addWeList([wallet.address]);

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
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        let reserves = await pairB.getReserves();
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
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(token0Amount.mul(9).div(100));
        let reserves2 = await pairB.getReserves();
        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

        await usdt.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            usdt.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenApple.removeBkList(user3.address);
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

        await usdt.transfer(user4.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user4.address, expandTo18Decimals(10000));
        await usdt.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
    });

    it("removeLiquidity USDT-TokenA", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);
        await tokenApple.addWeList([wallet.address]);

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
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
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

    it("addLiquidity TokenA-USDT", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            tokenApple.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        const expectedLiquidity = expandTo18Decimals(10000);
        expect(await pairA.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await usdt.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
        await usdt.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        let reserves = await pairB.getReserves();
        await routerLiquid.connect(user2).addLiquidity(
            tokenApple.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );

        expect(await pairA.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(token0Amount.mul(9).div(100));
        let reserves2 = await pairB.getReserves();
        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

        await usdt.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            usdt.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            usdt.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            usdt.address,
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

        await usdt.transfer(user4.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user4.address, expandTo18Decimals(10000));
        await usdt.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
    });

    it("removeLiquidity TokenA-USDT", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);
        await tokenApple.addWeList([wallet.address]);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            tokenApple.address,
            usdt.address,
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
            tokenApple.address,
            usdt.address,
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
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
            // console.log("tokenApple setLiquidityLockConfig: ");
        }

        expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

        await usdt.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            usdt.address,
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
            tokenApple.address,
            usdt.address,
            expectedLiquidity.mul(90).div(100),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );

        expect(await usdt.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
    });

    it("addLiquidity TokenA-TokenA", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);
        await tokenDDC.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await tokenDDC.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        let pairAddr = await routerQuery.pairFor(tokenApple.address, tokenDDC.address);
        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pair = await PairFactory.attach(pairAddr);
        
        const expectedLiquidity = expandTo18Decimals(10000);
        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenDDC.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
        await tokenDDC.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user2.address)).to.eq(0);
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(0);
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        await tokenDDC.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));

        await routerLiquid.connect(user2).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user2.address)).to.eq(0);
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(0);
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }
        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockDDC.address
            };
            await tokenDDC.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        await tokenDDC.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));

        await tokenDDC.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenDDC.addWeList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenApple.removeBkList(user3.address);
        await tokenDDC.removeWeList(user3.address);
        await routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(0);
        expect(await tokenB.balanceOf(user3.address)).to.eq(0);
        expect(await pair.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        await tokenDDC.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));

        await routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );

        expect(await tokenDDC.balanceOf(user3.address)).to.eq(0);
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await tokenB.balanceOf(user3.address)).to.eq(0);
        expect(await pair.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2));
        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        await tokenDDC.transfer(user4.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user4.address, expandTo18Decimals(9000));
        expect(await tokenDDC.balanceOf(user4.address)).to.eq(expandTo18Decimals(10000));
        expect(await tokenApple.balanceOf(user4.address)).to.eq(expandTo18Decimals(9000));

        await tokenDDC.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addWeList([user4.address]);
        await routerLiquid.connect(user4).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            expandTo18Decimals(10000),
            expandTo18Decimals(9000),
            0,
            0,
            user4.address,
            ethers.constants.MaxUint256
        );

        expect(await tokenDDC.balanceOf(user4.address)).to.eq(0);
        expect(await tokenApple.balanceOf(user4.address)).to.eq(0);
        expect(await tokenB.balanceOf(user4.address)).to.eq(0);
        expect(await pair.balanceOf(user4.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        await tokenDDC.transfer(user4.address, expandTo18Decimals(9000));
        await tokenApple.transfer(user4.address, expandTo18Decimals(10000));
        expect(await tokenDDC.balanceOf(user4.address)).to.eq(expandTo18Decimals(9000));
        expect(await tokenApple.balanceOf(user4.address)).to.eq(expandTo18Decimals(10000));

        await tokenDDC.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user4).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.removeWeList(user4.address);
        await tokenDDC.addWeList([user4.address]);
        await routerLiquid.connect(user4).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            expandTo18Decimals(9000),
            expandTo18Decimals(10000),
            0,
            0,
            user4.address,
            ethers.constants.MaxUint256
        );

        expect(await tokenDDC.balanceOf(user4.address)).to.eq(0);
        expect(await tokenApple.balanceOf(user4.address)).to.eq(0);
        expect(await tokenB.balanceOf(user4.address)).to.eq(0);
        expect(await pair.balanceOf(user4.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2));
        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);
    });

    it("removeLiquidity TokenA-TokenA", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);
        await tokenDDC.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);

        await tokenDDC.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256
        );

        let pairAddr = await routerQuery.pairFor(tokenApple.address, tokenDDC.address);
        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pair = await PairFactory.attach(pairAddr);
        
        const expectedLiquidity = expandTo18Decimals(10000);
        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenDDC.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));
        await tokenDDC.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await routerLiquid.connect(user2).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user2.address)).to.eq(0);
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(0);
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        await tokenDDC.transfer(user2.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user2.address, expandTo18Decimals(10000));

        await routerLiquid.connect(user2).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user2.address)).to.eq(0);
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(0);
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);
        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        await pair.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).removeLiquidity(
            tokenApple.address,
            tokenDDC.address,
            expandTo18Decimals(1000),
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );

        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2).sub(expandTo18Decimals(1000)));
        expect(await tokenApple.balanceOf(user2.address)).to.eq(expandTo18Decimals(1000).mul(90).div(100));
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(expandTo18Decimals(1000).mul(90).div(100));

        await routerLiquid.connect(user2).removeLiquidity(
            tokenDDC.address,
            tokenApple.address,
            expandTo18Decimals(1000),
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256
        );

        expect(await pair.balanceOf(user2.address)).to.eq(expectedLiquidity.mul(90).div(100).mul(2).sub(expandTo18Decimals(2000)));
        expect(await tokenApple.balanceOf(user2.address)).to.eq(expandTo18Decimals(1000).mul(90).div(100).mul(2));
        expect(await tokenDDC.balanceOf(user2.address)).to.eq(expandTo18Decimals(1000).mul(90).div(100).mul(2));

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }
        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockDDC.address
            };
            await tokenDDC.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        await tokenDDC.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));

        await tokenDDC.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenDDC.addWeList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenApple.removeBkList(user3.address);
        await tokenDDC.removeWeList(user3.address);
        await tokenApple.addWeList([user3.address]);
        await tokenDDC.addBkList([user3.address]);

        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenDDC.address,
            tokenApple.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");
        await expect(routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            token0Amount,
            token1Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        )).to.revertedWith("in blacklist");

        await tokenDDC.removeBkList(user3.address);
        
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000));

        await routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            tokenDDC.address,
            expandTo18Decimals(10000),
            expandTo18Decimals(10000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(10000).mul(10).div(100));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(0);
        expect(await tokenB.balanceOf(user3.address)).to.eq(0);
        expect(await pair.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(90).div(100));
        expect(await pair.balanceOf(timeLockApple.address)).to.eq(0);
        expect(await pair.balanceOf(timeLockDDC.address)).to.eq(0);

        let user3AppleAmt = await tokenApple.balanceOf(user3.address);
        let user3DDCAmt = await tokenDDC.balanceOf(user3.address);
        let lpUser3Amt = await pair.balanceOf(user3.address);

        await pair.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user3).removeLiquidity(
            tokenApple.address,
            tokenDDC.address,
            expandTo18Decimals(1000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect( await pair.balanceOf(user3.address)).to.eq(lpUser3Amt.sub(expandTo18Decimals(1000)));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(user3DDCAmt.add(expandTo18Decimals(1000).mul(90).div(100)));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(user3AppleAmt.add(expandTo18Decimals(1000)));

        user3AppleAmt = await tokenApple.balanceOf(user3.address);
        user3DDCAmt = await tokenDDC.balanceOf(user3.address);
        lpUser3Amt = await pair.balanceOf(user3.address);

        await tokenApple.removeWeList(user3.address);
        await routerLiquid.connect(user3).removeLiquidity(
            tokenApple.address,
            tokenDDC.address,
            expandTo18Decimals(1000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect( await pair.balanceOf(user3.address)).to.eq(lpUser3Amt.sub(expandTo18Decimals(1000)));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(user3DDCAmt.add(expandTo18Decimals(1000).mul(90).div(100)));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(user3AppleAmt.add(expandTo18Decimals(1000).mul(90).div(100)));

        user3AppleAmt = await tokenApple.balanceOf(user3.address);
        user3DDCAmt = await tokenDDC.balanceOf(user3.address);
        lpUser3Amt = await pair.balanceOf(user3.address);

        await tokenApple.removeWeList(user3.address);
        await routerLiquid.connect(user3).removeLiquidity(
            tokenDDC.address,
            tokenApple.address,
            expandTo18Decimals(1000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect( await pair.balanceOf(user3.address)).to.eq(lpUser3Amt.sub(expandTo18Decimals(1000)));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(user3DDCAmt.add(expandTo18Decimals(1000).mul(90).div(100)));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(user3AppleAmt.add(expandTo18Decimals(1000).mul(90).div(100)));

        await tokenDDC.addWeList([user3.address]);

        user3AppleAmt = await tokenApple.balanceOf(user3.address);
        user3DDCAmt = await tokenDDC.balanceOf(user3.address);
        lpUser3Amt = await pair.balanceOf(user3.address);

        await tokenApple.removeWeList(user3.address);
        await routerLiquid.connect(user3).removeLiquidity(
            tokenDDC.address,
            tokenApple.address,
            expandTo18Decimals(1000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect( await pair.balanceOf(user3.address)).to.eq(lpUser3Amt.sub(expandTo18Decimals(1000)));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(user3DDCAmt.add(expandTo18Decimals(1000)));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(user3AppleAmt.add(expandTo18Decimals(1000).mul(90).div(100)));

        user3AppleAmt = await tokenApple.balanceOf(user3.address);
        user3DDCAmt = await tokenDDC.balanceOf(user3.address);
        lpUser3Amt = await pair.balanceOf(user3.address);

        await tokenApple.removeWeList(user3.address);
        await routerLiquid.connect(user3).removeLiquidity(
            tokenApple.address,
            tokenDDC.address,
            expandTo18Decimals(1000),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );
        expect( await pair.balanceOf(user3.address)).to.eq(lpUser3Amt.sub(expandTo18Decimals(1000)));
        expect(await tokenDDC.balanceOf(user3.address)).to.eq(user3DDCAmt.add(expandTo18Decimals(1000)));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(user3AppleAmt.add(expandTo18Decimals(1000).mul(90).div(100)));

    });

    it("removeLiquidityWithPermit TokenA-USDT", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        const token0Amount = expandTo18Decimals(10000);
        const token1Amount = expandTo18Decimals(10000);
        await tokenApple.addWeList([wallet.address]);

        await usdt.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidity(
            tokenApple.address,
            usdt.address,
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
            tokenApple.address,
            usdt.address,
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
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
            // console.log("tokenApple setLiquidityLockConfig: ");
        }

        expect(await pairA.balanceOf(timeLockApple.address)).to.eq(0);

        await usdt.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        await usdt.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user3).addLiquidity(
            tokenApple.address,
            usdt.address,
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

        const nonce = await pairA.nonces(user3.address);
        const digest = await getApprovalDigest(
            pairA,
            {
                owner: user3.address,
                spender: routerLiquid.address,
                value: expectedLiquidity.mul(90).div(100),
            },
            nonce,
            ethers.constants.MaxUint256
        );

        const { v, r, s } = user3
            ._signingKey()
            .signDigest(Buffer.from(digest.slice(2), "hex"));

        await routerLiquid.connect(user3).removeLiquidityWithPermit(
            tokenApple.address,
            usdt.address,
            expectedLiquidity.mul(90).div(100),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            false,
            v,
            r,
            s
        );

        expect(await usdt.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expectedLiquidity.mul(81).div(100));
    });

    it("addLiquidity TokenA-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        let pairBNBAddr = await routerQuery.pairFor(tokenApple.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        const expectedLiquidity = expandTo18Decimals(1000);
        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenApple.transfer(user2.address, expandTo18Decimals(1000));
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairBNB.balanceOf(timeLockApple.address)).to.eq(0);

        await tokenApple.transfer(user3.address, expandTo18Decimals(10000));
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        )).to.revertedWith("in black list");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user3.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(9000));
    });

    

    it("removeLiquidity TokenA-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        let pairBNBAddr = await routerQuery.pairFor(tokenApple.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        const expectedLiquidity = expandTo18Decimals(1000);
        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenApple.transfer(user2.address, expandTo18Decimals(1000));
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairBNB.balanceOf(timeLockApple.address)).to.eq(0);

        await tokenApple.transfer(user3.address, expandTo18Decimals(1000));
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        )).to.revertedWith("in black list");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await pairBNB.balanceOf(user3.address)).to.eq(expandTo18Decimals(900));

        await pairBNB.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user3).removeLiquidityETH(
            tokenApple.address,
            expandTo18Decimals(900),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );

        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(900).mul(90).div(100));
    });

    it("removeLiquidityETHWithPermit TokenA-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        let pairBNBAddr = await routerQuery.pairFor(tokenApple.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        const expectedLiquidity = expandTo18Decimals(1000);
        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenApple.transfer(user2.address, expandTo18Decimals(1000));
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairBNB.balanceOf(timeLockApple.address)).to.eq(0);

        await tokenApple.transfer(user3.address, expandTo18Decimals(1000));
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        )).to.revertedWith("in black list");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await pairBNB.balanceOf(user3.address)).to.eq(expandTo18Decimals(900));

        const nonce = await pairBNB.nonces(user3.address);
        const digest = await getApprovalDigest(
            pairBNB,
            {
                owner: user3.address,
                spender: routerLiquid.address,
                value: expandTo18Decimals(900),
            },
            nonce,
            ethers.constants.MaxUint256
        );

        const { v, r, s } = user3._signingKey().signDigest(Buffer.from(digest.slice(2), "hex"));
        await routerLiquid.connect(user3).removeLiquidityETHWithPermit(
            tokenApple.address,
            expandTo18Decimals(900),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            false,
            v,
            r,
            s
        );

        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(900).mul(90).div(100));
    });

    it("removeLiquidityETHSupportingFeeOnTransferTokens TokenA-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        let pairBNBAddr = await routerQuery.pairFor(tokenApple.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        const expectedLiquidity = expandTo18Decimals(1000);
        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenApple.transfer(user2.address, expandTo18Decimals(1000));
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairBNB.balanceOf(timeLockApple.address)).to.eq(0);

        await tokenApple.transfer(user3.address, expandTo18Decimals(1000));
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        )).to.revertedWith("in black list");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await pairBNB.balanceOf(user3.address)).to.eq(expandTo18Decimals(900));

        await pairBNB.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user3).removeLiquidityETHSupportingFeeOnTransferTokens(
            tokenApple.address,
            expandTo18Decimals(900),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256
        );

        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(900).mul(90).div(100));
    });

    it("removeLiquidityETHWithPermitSupportingFeeOnTransferTokens TokenA-BNB", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        await tokenApple.addWeList([wallet.address]);

        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);

        await tokenApple.approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            wallet.address,
            ethers.constants.MaxUint256,
            { value: token1Amount }
        );

        let pairBNBAddr = await routerQuery.pairFor(tokenApple.address, WETH.address);

        let PairFactory = await ethers.getContractFactory("BananaSwapPair");
        let pairBNB = await PairFactory.attach(pairBNBAddr);

        const expectedLiquidity = expandTo18Decimals(1000);
        expect(await pairBNB.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(wallet.address)).to.eq((await tokenB.totalSupply()).sub(expandTo18Decimals(1)));

        await tokenApple.transfer(user2.address, expandTo18Decimals(1000));
        await tokenApple.connect(user2).approve(routerLiquid.address, ethers.constants.MaxUint256);
        await routerLiquid.connect(user2).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user2.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );

        expect(await pairBNB.balanceOf(user2.address)).to.eq(expandTo18Decimals(900));
        expect(await tokenB.balanceOf(pairB.address)).to.eq(expandTo18Decimals(1));
        expect(await tokenB.balanceOf(user2.address)).to.eq(0);

        {
            let config = {
                openLockLiquid: true,
                lockLiquidDuration: BigNumber.from("300"),
                lpTimeLock: timeLockApple.address
            };
            await tokenApple.setLiquidityLockConfig(config, { gasLimit: "4600000" });
        }

        expect(await pairBNB.balanceOf(timeLockApple.address)).to.eq(0);

        await tokenApple.transfer(user3.address, expandTo18Decimals(1000));
        await tokenApple.connect(user3).approve(routerLiquid.address, ethers.constants.MaxUint256);

        await tokenApple.addBkList([user3.address]);
        await expect(routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        )).to.revertedWith("in black list");

        await tokenApple.removeBkList(user3.address);
        await routerLiquid.connect(user3).addLiquidityETH(
            tokenApple.address,
            token0Amount,
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            { value: expandTo18Decimals(900) }
        );
        expect(await tokenApple.balanceOf(user3.address)).to.eq(0);
        expect(await pairBNB.balanceOf(user3.address)).to.eq(expandTo18Decimals(900));

        const nonce = await pairBNB.nonces(user3.address);
        const digest = await getApprovalDigest(
            pairBNB,
            {
                owner: user3.address,
                spender: routerLiquid.address,
                value: expandTo18Decimals(900),
            },
            nonce,
            ethers.constants.MaxUint256
        );

        const { v, r, s } = user3._signingKey().signDigest(Buffer.from(digest.slice(2), "hex"));
        await routerLiquid.connect(user3).removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
            tokenApple.address,
            expandTo18Decimals(900),
            0,
            0,
            user3.address,
            ethers.constants.MaxUint256,
            false,
            v,
            r,
            s
        );

        expect(await tokenApple.balanceOf(user3.address)).to.eq(expandTo18Decimals(900).mul(90).div(100));
    });

});
