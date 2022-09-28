import { Address } from "cluster";
import { ethers, upgrades, waffle } from "hardhat";
const { expect } = require("chai");
const { BN } = require('@openzeppelin/test-helpers');
const { time, ADDRESS_ZERO } = require("./shared")
const { createFixtureLoader } = require("ethereum-waffle");
import { MockProvider } from "@ethereum-waffle/provider";
import { BigNumber, constants as ethconst, Wallet } from "ethers";
import { BananaToken, SmartERC20, TokenBPool, BananaSwapPair } from "../types";
import {
    expandTo18Decimals,
    getApprovalDigest,
    MINIMUM_LIQUIDITY,
    setNextBlockTime,
    encodePrice
} from "./shared/utilities";
import exp from "constants";

describe("TokenBPool", async function () {

    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function fixture([wallet, other, user1, user2]: Wallet[], provider: MockProvider) {

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

        //console.log("============= codeHash: ", await factoryV2.PAIR_HASH());

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
        // let accounts = [
        //     wallet.address,
        //     usdtFeeHandle.address,
        //     "0x000000000000000000000000000000000000dEaD",
        //     "0x0000000000000000000000000000000000000000"
        // ];
        // await pairB.addTokenBExcludeBalanceList(accounts);
        // console.log("pairB.addTokenBExcludeBalanceList afeter");

        const BananaSwap4BFactory = await ethers.getContractFactory("BananaSwap4B");
        const routerSwap4B = await BananaSwap4BFactory.deploy();
        // console.log('routerSwap4B address:', routerSwap4B.address);

        await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "3900000" });
        await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, { gasLimit: "3900000" });
        await routerSwap4B.setUsdt(usdt.address, { gasLimit: "3900000" });
        await routerSwap4B.setPairB(pairB.address, { gasLimit: "3900000" });
        await routerSwap4B.setTokenB(tokenB.address, { gasLimit: "3900000" });

        // await pairB.setRouterSwap4B(routerSwap4B.address, { gasLimit: "3900000" });

        // await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        // await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        // await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), { gasLimit: "4900000" });
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
            await usdtFeeHandle.setBConfig(tokenB.address, bConfig, { gasLimit: "4900000" });
        }

        // await factoryV2.createPair(usdt.address, tokenDDC.address, { gasLimit: "4900000" });
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
            await tokenDDC.setLiquidityLockConfig(config, { gasLimit: "4900000" });
            // console.log("tokenDDC setLiquidityLockConfig: ");
        }

        // await factoryV2.createPair(usdt.address, tokenApple.address, { gasLimit: "4900000" });
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
        // await tokenA.setOracle(oracleDDC.address, {gasLimit: "3900000"});

        // const oracleApple = await oracleFactory.deploy();
        // console.log("oracleApple address: ", oracleApple.address);

        // await oracleApple.initialize(factoryV2.address, tokenApple.address, usdt.address, initialPrice, {gasLimit: "4600000"});
        // await tokenApple.setOracle(oracleApple.address, {gasLimit: "3900000"});

        // const factory = await (await ethers.getContractFactory("BananaSwapFactory")).deploy(wallet.address);

        // const USDTToken = await ethers.getContractFactory("SmartERC20");
        // const usdt = await USDTToken.deploy(expandTo18Decimals(100000000));

        // const tokenb = await ethers.getContractFactory("BananaToken");
        // const tokenB = await upgrades.deployProxy(tokenb, ["tb", "tb"], { initializer: "initialize" });

        // await tokenB.mint(wallet.address, expandTo18Decimals(10000));
        // expect(await tokenB.totalSupply()).to.eq(expandTo18Decimals(10000));
        // await tokenB.setOpenTransfer(true);
        // expect(await tokenB.getOpenTransfer()).to.eq(true);

        // // let token0 = usdt.address < tokenB.address ? usdt : tokenB;
        // // let token1 = usdt.address < tokenB.address ? tokenB : usdt;
        // let token0 = tokenB; // token 0 is TokenB
        // let token1 = usdt;

        // const tokenbpool = await ethers.getContractFactory("TokenBPool");
        // const pair = await upgrades.deployProxy(tokenbpool, [token0.address, token1.address, tokenB.address, factory.address, wallet.address], { initializer: "initialize" });
       
        let pair = pairB;
        let factory = factoryV2;
        let token0 = pairBtoken0;
        let token1 = pairBtoken1;
        await pairB.setRouterSwap4B(wallet.address);
        return { token0, token1, usdt, tokenB, pair, factory, pairB,routerSwap4B, wallet, other, user1, user2, provider };
    }

    it("grantRole manager", async () => {
        const { token0, token1, usdt, tokenB, pair, wallet, other, user1, user2, provider } = await loadFixture(fixture);

        let manganerBytes = await pair.MANAGER_ROLE();
        let defaultAdminBytes = await pair.DEFAULT_ADMIN_ROLE();
        expect(await pair.hasRole(manganerBytes, wallet.address)).to.eq(true);
        expect(await pair.hasRole(manganerBytes, user1.address)).to.eq(false);
        
        await expect(pair.connect(user2).grantRole(manganerBytes, user1.address)).to.be.reverted;

        await pair.grantRole(manganerBytes, user1.address);
        expect(await pair.hasRole(manganerBytes, user1.address)).to.eq(true);

        await pair.revokeRole(manganerBytes, user1.address);
        expect(await pair.hasRole(manganerBytes, user1.address)).to.eq(false);
    });

    it("mint", async () => {
        const { token0, token1, usdt, tokenB, pair, pairB, routerSwap4B, wallet, other, user1, user2, provider } = await loadFixture(fixture);
        await pairB.setRouterSwap4B(routerSwap4B.address, { gasLimit: "3900000" });

        await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), { gasLimit: "4900000" });
    });

    it("setTokenB", async () => {
        const { pair, wallet, token0, token1, tokenB, other, factory } = await loadFixture( fixture );
        expect(await pair.tokenB()).to.eq(tokenB.address);

        const tokenb2 = await ethers.getContractFactory("BananaToken");
        const tokenB2 = await upgrades.deployProxy(tokenb2, ["tb", "tb"], { initializer: "initialize" });
        await expect(pair.connect(other).setTokenB(tokenB2)).to.be.reverted;
        await expect(pair.setTokenB(tokenB2.address))
            .to.emit(pair, "SetTokenB")
            .withArgs(wallet.address, tokenB2.address);
        expect(await pair.tokenB()).to.eq(tokenB2.address);
    });
  
    it("addTokenBExcludeBalanceList", async () => {
        const { pair, wallet, token0, token1, tokenB, other, user1, user2, factory } = await loadFixture(fixture);
        
        let accounts = [user1.address, user2.address];
        let values = [true, true];
        await expect(pair.connect(other).addTokenBExcludeBalanceList(accounts, values)).to.be.reverted;
        accounts = [];
        await expect(pair.addTokenBExcludeBalanceList(accounts)).to.be.revertedWith("array length 0");

        expect((await tokenB.totalSupply())).to.eq(await tokenB.balanceOf(wallet.address));
        expect(await pair.getTokenBReserve()).to.eq(await tokenB.totalSupply());

        await tokenB.transfer(user1.address, expandTo18Decimals(100));
        expect(await pair.getTokenBReserve()).to.eq(await tokenB.totalSupply());
        
        accounts = [user1.address, user2.address];
        await pair.addTokenBExcludeBalanceList(accounts);
        expect(await pair.getTokenBExcludeBalanceListLength()).to.eq(2);
        expect(await pair.checkTokenBExcludeBalanceList(user1.address)).to.eq(true);
        expect(await pair.checkTokenBExcludeBalanceList(user2.address)).to.eq(true);
        expect(await pair.checkTokenBExcludeBalanceList(other.address)).to.eq(false);

        let expectValue = BigNumber.from(await tokenB.totalSupply()).sub(expandTo18Decimals(100));
        expect(await pair.getTokenBReserve()).to.eq(expectValue);

        accounts = [wallet.address, user1.address, user2.address, other.address];
        await pair.addTokenBExcludeBalanceList(accounts);
        expect(await pair.getTokenBExcludeBalanceListLength()).to.eq(4);
        expect(await pair.checkTokenBExcludeBalanceList(wallet.address)).to.eq(true);
        expect(await pair.checkTokenBExcludeBalanceList(user1.address)).to.eq(true);
        expect(await pair.checkTokenBExcludeBalanceList(user2.address)).to.eq(true);
        expect(await pair.checkTokenBExcludeBalanceList(other.address)).to.eq(true);
        expect((await pair.getTokenBExcludeBalanceList()).length).to.eq(4);

        expect(await pair.getTokenBReserve()).to.eq(0);
        
        let revmoveList = [user1.address];
        await expect(pair.connect(other).removeTokenBExcludeBalanceList(revmoveList)).to.be.reverted;
        revmoveList = [];
        await expect(pair.removeTokenBExcludeBalanceList(revmoveList)).to.be.revertedWith("array length 0");
        revmoveList = [user1.address];
        await pair.removeTokenBExcludeBalanceList(revmoveList);
        expect(await pair.getTokenBExcludeBalanceListLength()).to.eq(3);
        expect(await pair.getTokenBReserve()).to.eq(expandTo18Decimals(100));
    });
});