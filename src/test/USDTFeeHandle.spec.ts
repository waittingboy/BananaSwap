import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { execPath } from "process";
import {
    expandTo18Decimals,
    getApprovalDigest,
    MINIMUM_LIQUIDITY,
    setNextBlockTime,
} from "./shared/utilities";

describe("USDTFeeHandle", () => {
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
            // await tokenDDC.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

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

        await routerSwap.setUsdtFeeHandle(usdtFeeHandle.address);
        await routerLiquid.setUsdtFeeHandle(usdtFeeHandle.address);
        await routerQuery.setUsdtFeeHandle(usdtFeeHandle.address);
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

        await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "3900000" });
        await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, { gasLimit: "3900000" });
        await routerSwap4B.setUsdt(usdt.address, { gasLimit: "3900000" });
        await routerSwap4B.setPairB(pairB.address, { gasLimit: "3900000" });
        await routerSwap4B.setTokenB(tokenB.address, { gasLimit: "3900000" });

        await pairB.setRouterSwap4B(routerSwap4B.address, { gasLimit: "3900000" });

        await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
        await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), { gasLimit: "4900000" });
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

        return {
            cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA, ddcFeeHandler, appleFeeHandler,
            wallet, other, user1, user2, user3, user4, user5, user6, provider
        };
    }
    it("setManager", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        expect(await usdtFeeHandle.isManager(wallet.address)).to.eq(true);
        expect(await usdtFeeHandle.isManager(user2.address)).to.eq(false);
        await usdtFeeHandle.setManager(user2.address, true);
        expect(await usdtFeeHandle.isManager(user2.address)).to.eq(true);
        await usdtFeeHandle.setManager(user2.address, false);
        expect(await usdtFeeHandle.isManager(user2.address)).to.eq(false);

        await expect(usdtFeeHandle.connect(user3).setManager(user2.address, true)).to.revertedWith("Ownable: caller is not the owner");
        await expect(usdtFeeHandle.connect(user3).setManager(user2.address, false)).to.revertedWith("Ownable: caller is not the owner");
    });
    it("setRouter", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        expect(await usdtFeeHandle.router()).to.eq(ethers.constants.AddressZero);
        await expect(usdtFeeHandle.connect(user2).setRouter(routerSwap.address)).to.revertedWith("Not manager");
        await usdtFeeHandle.setRouter(routerSwap.address);
        expect(await usdtFeeHandle.router()).to.eq(routerSwap.address);
        await usdtFeeHandle.setRouter(ethers.constants.AddressZero);
        expect(await usdtFeeHandle.router()).to.eq(ethers.constants.AddressZero);
    });
    it("setAFeeConfig", async () => {
        const { cake, usdt, nana, dota, tokenManager, tokenDDC, tokenApple, tokenB, pairB, usdtFeeHandle,
            factoryV2, WETH, routerLiquid, routerQuery, routerQuery4Swap, routerSwap, routerSwap4B,
            timeLockDDC, timeLockApple, pairA, ddcFeeHandler, appleFeeHandler,
            wallet, other, user1, user2, user3, user4, user5, user6, provider } = await loadFixture(v2Fixture);

        let aFeeConfig = {
            feeRatio: BigNumber.from("1000"),
            fee4UserRatio: BigNumber.from("9000"),
            actionType: BigNumber.from("0")
        }
        await expect(
            usdtFeeHandle.connect(user2).setAFeeConfig(
                tokenDDC.address,
                BigNumber.from("0"),
                aFeeConfig,
                true,
                { gasLimit: "4600000" }
            )
        ).to.revertedWith("Not manager");

        await expect(
            usdtFeeHandle.setAFeeConfig(
                ethers.constants.AddressZero,
                BigNumber.from("0"),
                aFeeConfig,
                true,
                { gasLimit: "4600000" }
            )
        ).to.revertedWith("token a is 0");

        await usdtFeeHandle.setAFeeConfig(
            tokenDDC.address,
            BigNumber.from("0"),
            aFeeConfig,
            true,
            { gasLimit: "4600000" }
        );

        let feeConfigBuy = await usdtFeeHandle.tokenAFeeConfig(tokenDDC.address, BigNumber.from(0));
        expect(feeConfigBuy.feeRatio).to.eq(BigNumber.from(1000));
        expect(feeConfigBuy.fee4UserRatio).to.eq(BigNumber.from(9000));
        expect(feeConfigBuy.actionType).to.eq(BigNumber.from(0));

        await usdtFeeHandle.setAFeeConfig(
            tokenDDC.address,
            BigNumber.from("0"),
            aFeeConfig,
            false,
            { gasLimit: "4600000" }
        );

        feeConfigBuy = await usdtFeeHandle.tokenAFeeConfig(tokenDDC.address, BigNumber.from(0));
        expect(feeConfigBuy.feeRatio).to.eq(BigNumber.from(0));
        expect(feeConfigBuy.fee4UserRatio).to.eq(BigNumber.from(0));
        expect(feeConfigBuy.actionType).to.eq(BigNumber.from(0));
    });
});