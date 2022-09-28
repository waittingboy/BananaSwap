import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, Contract, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import { execPath } from "process";
import { TokenManager } from "../src/types";
import {
    expandTo18Decimals,
    getApprovalDigest,
    MINIMUM_LIQUIDITY,
    setNextBlockTime,
} from "../src/test/shared/utilities";

describe("LiquidManager", () => {
    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function v2Fixture([wallet, user1, user2, user3, user4, user5, user6]: Wallet[], provider: MockProvider) {
        const token = await ethers.getContractFactory("SmartERC20");
        const TokenManager = await ethers.getContractFactory("TokenManager");
		const tokenManager = await TokenManager.deploy();
        // deploy tokens
        const tokenA = await token.deploy(expandTo18Decimals(100000));
        const usdtToken = await token.deploy(expandTo18Decimals(100000));

        // deploy weth
        const weth = await ethers.getContractFactory("WETH9");
        const WETH = await weth.deploy();

        const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
		const usdtFeeHandle = await usdtFeeFactory.deploy();
        // deploy V2
        const v2factory = await ethers.getContractFactory("BananaSwapFactory");
        const factoryV2 = await v2factory.deploy(wallet.address,tokenManager.address,usdtFeeHandle.address);

        const routerEmit = await ethers.getContractFactory("RouterEventEmitter");
        const RouterEmit = await routerEmit.deploy();

        // deploy routers
        const router = await ethers.getContractFactory("UniswapV2Router");
        const router02 = await router.deploy(factoryV2.address, WETH.address);

        // pair A
        await factoryV2.createPair(tokenA.address, usdtToken.address);
        const ApairAddress = await factoryV2.getPair(tokenA.address, usdtToken.address);
        const pairFactory = await ethers.getContractFactory("BananaSwapPair");
        const pairA = new Contract(ApairAddress, pairFactory.interface, provider).connect(wallet);

        // lpTokenLock
        const LPTimeLock = await ethers.getContractFactory("LPTimeLock");
        const lpTokenLock = await LPTimeLock.deploy();
        await lpTokenLock.initialize();

        // LiquidManager
        const LiquidManager = await ethers.getContractFactory("LiquidManager");
        const liquidManager = await LiquidManager.deploy();
        await liquidManager.initialize(router02.address, usdtToken.address, lpTokenLock.address);

        return {
            tokenA,
            usdtToken,
            pairA,
            WETH,
            factoryV2,
            router02,
            RouterEmit,
            wallet,
            user1,
            user2,
            user3,
            user4,
            user5,
            user6,
            provider,
            lpTokenLock,
            liquidManager
        };
    }

    it("setManager", async () => {
        const { wallet, user1, user2, liquidManager } = await loadFixture(v2Fixture);
        expect(await liquidManager.isManager(wallet.address)).to.eq(true);
        expect(await liquidManager.isManager(user1.address)).to.eq(false);
        await liquidManager.setManager(user1.address, true);
        expect(await liquidManager.isManager(user1.address)).to.eq(true);
        await liquidManager.setManager(user1.address, false);
        expect(await liquidManager.isManager(user1.address)).to.eq(false); 
        await expect(liquidManager.connect(user2).setManager(user1.address, true)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("adminAddBaseLiquidList", async () => {
        const { tokenA, user1, user2, pairA, liquidManager } = await loadFixture(v2Fixture);

        let accounts = [user1.address];
        let tokenAAmts = [expandTo18Decimals(1000)];
        await expect(liquidManager.adminAddBaseLiquidList(ethers.constants.AddressZero, tokenA.address, accounts, tokenAAmts)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.adminAddBaseLiquidList(pairA.address, ethers.constants.AddressZero, accounts, tokenAAmts)).to.be.revertedWith("tokenAAddr is 0");
        
        accounts = [];
        tokenAAmts = [expandTo18Decimals(1000)];
        await expect(liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts)).to.be.revertedWith("LM:arrary length no eq");

        accounts = [];
        tokenAAmts = [];
        await expect(liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts)).to.be.revertedWith("LM:arrary length no eq");

        accounts = [user1.address];
        tokenAAmts = [expandTo18Decimals(1000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);

        await expect(liquidManager.getBaseLiquidAmount(ethers.constants.AddressZero, user1.address)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.getBaseLiquidAmount(pairA.address, ethers.constants.AddressZero)).to.be.revertedWith("LP:user is 0");

        let user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(0);
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        accounts = [user1.address];
        tokenAAmts = [expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);

        let openFlag = true;
        await liquidManager.openBaseAddLiquid(pairA.address, openFlag);

        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(2000));
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        accounts = [user1.address];
        tokenAAmts = [expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);

        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(2000));
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        let accounts2 = [user2.address];
        let tokenAAmts2 = [expandTo18Decimals(100)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts2, tokenAAmts2);

        let user2Info = await liquidManager.getBaseLiquidAmount(pairA.address, user2.address);
        expect(user2Info.tokenAAmut).to.eq(expandTo18Decimals(100));
        expect(user2Info.tokenAAddedAmt).to.eq(0)
    });

    it("getBaseLiquidAmount", async () => {
        const { tokenA, user1, user2, pairA, liquidManager } = await loadFixture(v2Fixture);

        let accounts = [user1.address];
        let tokenAAmts = [expandTo18Decimals(1000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);

        await expect(liquidManager.getBaseLiquidAmount(ethers.constants.AddressZero, user1.address)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.getBaseLiquidAmount(pairA.address, ethers.constants.AddressZero)).to.be.revertedWith("LP:user is 0");

        let user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(0);
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        let openFlag = true;
        await liquidManager.openBaseAddLiquid(pairA.address, openFlag);

        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(1000));
        expect(user1Info.tokenAAddedAmt).to.eq(0);
        
        let skipFlag = true;
        await liquidManager.adminSetBaseLiquidSkip(pairA.address, user1.address, skipFlag);

        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(0));
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        skipFlag = false;
        await liquidManager.adminSetBaseLiquidSkip(pairA.address, user1.address, skipFlag);
        let delFlag = true;
        await liquidManager.adminSetBaseLiquidDel(pairA.address, user1.address, delFlag);
        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(0));
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        delFlag = false;
        await liquidManager.adminSetBaseLiquidDel(pairA.address, user1.address, delFlag);

        accounts = [user1.address];
        tokenAAmts = [expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);

        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(2000));
        expect(user1Info.tokenAAddedAmt).to.eq(0);

        let accounts2 = [user2.address];
        let tokenAAmts2 = [expandTo18Decimals(100)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts2, tokenAAmts2);

        let user2Info = await liquidManager.getBaseLiquidAmount(pairA.address, user2.address);
        expect(user2Info.tokenAAmut).to.eq(expandTo18Decimals(100));
        expect(user2Info.tokenAAddedAmt).to.eq(0)
    });

    it("adminSetBaseLiquidSkip", async () => {
        const { tokenA, user1, user2, user3, pairA, liquidManager } = await loadFixture(v2Fixture);
        await expect(liquidManager.adminSetBaseLiquidSkip(ethers.constants.AddressZero, user1.address, true)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.adminSetBaseLiquidSkip(pairA.address, user1.address, true)).to.be.revertedWith("LM:pair not exist");

        let openBaseAddLiquid = true;
        await liquidManager.openBaseAddLiquid(pairA.address, openBaseAddLiquid);

        let accounts = [user1.address, user2.address];
        let tokenAAmts = [expandTo18Decimals(1000), expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);
        let user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(1000));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));

        await expect(liquidManager.connect(user3).adminSetBaseLiquidSkip(pairA.address, user1.address, true)).to.be.revertedWith("Not manager");
       
        await liquidManager.adminSetBaseLiquidSkip(pairA.address, user1.address, true);
        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(0));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));

        await liquidManager.adminSetBaseLiquidSkip(pairA.address, user1.address, false);
        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(1000));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));

     });

     it("adminSetBaseLiquidDel", async () => {
        const { tokenA, user1, user2, user3, pairA, liquidManager } = await loadFixture(v2Fixture);
        await expect(liquidManager.adminSetBaseLiquidDel(ethers.constants.AddressZero, user1.address, true)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.adminSetBaseLiquidDel(pairA.address, user1.address, true)).to.be.revertedWith("LM:pair not exist");

        let openBaseAddLiquid = true;
        await liquidManager.openBaseAddLiquid(pairA.address, openBaseAddLiquid);

        let accounts = [user1.address, user2.address];
        let tokenAAmts = [expandTo18Decimals(1000), expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);
        let user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(1000));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));

        await expect(liquidManager.connect(user3).adminSetBaseLiquidDel(pairA.address, user1.address, true)).to.be.revertedWith("Not manager");
       
        await liquidManager.adminSetBaseLiquidDel(pairA.address, user1.address, true);
        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(0));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));

        await liquidManager.adminSetBaseLiquidDel(pairA.address, user1.address, false);
        user1Info = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(user1Info.tokenAAmut).to.eq(expandTo18Decimals(1000));
        expect(user1Info.tokenAAddedAmt).to.eq(expandTo18Decimals(0));
     });

    it("addBaseLiquid", async () => { 
        const { tokenA, user1, user2, user3, user4, user5, user6, pairA, liquidManager } = await loadFixture(v2Fixture);

        let tokenAAmt = expandTo18Decimals(1000);
        let tokenAAmtOfffee = expandTo18Decimals(1000);
        await expect(liquidManager.addBaseLiquid(ethers.constants.AddressZero, user1.address, tokenAAmt, tokenAAmtOfffee)).to.be.revertedWith("LM:pair is 0");
        await expect(liquidManager.addBaseLiquid(pairA.address, user1.address, tokenAAmt, tokenAAmtOfffee)).to.be.revertedWith("LM:pair not exist");

        let accounts = [user1.address, user2.address, user3.address, user4.address];
        let tokenAAmts = [expandTo18Decimals(1000), expandTo18Decimals(1000), expandTo18Decimals(1000), expandTo18Decimals(2000)];
        await liquidManager.adminAddBaseLiquidList(pairA.address, tokenA.address, accounts, tokenAAmts);
        
        await expect(liquidManager.addBaseLiquid(pairA.address, user1.address, tokenAAmt, tokenAAmtOfffee)).to.be.revertedWith("LM:openBaseAddLiquidFlag is false");
        await liquidManager.openBaseAddLiquid(pairA.address, true);

        await liquidManager.addBaseLiquid(pairA.address, user1.address, tokenAAmt, tokenAAmtOfffee);
        let result = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(result.tokenAAmut).to.eq(tokenAAmt);
        expect(result.tokenAAddedAmt).to.eq(tokenAAmt);

        await liquidManager.adminSetBaseLiquidSkip(pairA.address, user2.address, true);

        await liquidManager.addBaseLiquid(pairA.address, user3.address, tokenAAmt, tokenAAmtOfffee);
        let result2 = await liquidManager.getBaseLiquidAmount(pairA.address, user1.address);
        expect(result2.tokenAAmut).to.eq(tokenAAmt);
        expect(result2.tokenAAddedAmt).to.eq(tokenAAmt);
        
    });

    it("openBaseAddLiquid", async () => {
        const { pairA, tokenA, wallet, user2, liquidManager } = await loadFixture(v2Fixture);
        let flag = false;
        await expect(liquidManager.openBaseAddLiquid(pairA.address, flag)).to.be.revertedWith("LM:openBaseAddLiquidFlag already");
        flag = true;
        await expect(liquidManager.connect(user2).openBaseAddLiquid(pairA.address, flag)).to.be.revertedWith("Not manager");
        await liquidManager.openBaseAddLiquid(pairA.address, flag);
        await expect(liquidManager.checkOpenBaseAddLiquid(ethers.constants.AddressZero)).to.be.revertedWith("LM:pair is 0");
        expect(await liquidManager.checkOpenBaseAddLiquid(pairA.address)).to.eq(true);
        expect(await liquidManager.checkOpenBaseAddLiquid(tokenA.address)).to.eq(false);
        await expect(liquidManager.openBaseAddLiquid(pairA.address, flag)).to.be.revertedWith("LM:openBaseAddLiquidFlag already");
        flag = false;
        await liquidManager.openBaseAddLiquid(pairA.address, flag);
        expect(await liquidManager.checkOpenBaseAddLiquid(pairA.address)).to.eq(false);
    });

    it("openAddLiquid", async () => {
        const { pairA, tokenA, wallet, user2, liquidManager } = await loadFixture(v2Fixture);
        let flag = false;
        await expect(liquidManager.openAddLiquid(pairA.address, flag)).to.be.revertedWith("LM:openAddLiquidFlag already");
        flag = true;
        await expect(liquidManager.connect(user2).openAddLiquid(pairA.address, flag)).to.be.revertedWith("Not manager");
        await liquidManager.openAddLiquid(pairA.address, flag);
        await expect(liquidManager.checkAddLiquid(ethers.constants.AddressZero)).to.be.revertedWith("LM:pair is 0");
        expect(await liquidManager.checkAddLiquid(pairA.address)).to.eq(true);
        expect(await liquidManager.checkAddLiquid(tokenA.address)).to.eq(false);
        await expect(liquidManager.openAddLiquid(pairA.address, flag)).to.be.revertedWith("LM:openAddLiquidFlag already");
        flag = false;
        await liquidManager.openAddLiquid(pairA.address, flag);
        expect(await liquidManager.checkAddLiquid(pairA.address)).to.eq(false);
    });

    it("openRemoveLiquid", async () => {
        const { pairA, tokenA, wallet, user2, liquidManager } = await loadFixture(v2Fixture);
        let flag = false;
        await expect(liquidManager.openRemoveLiquid(pairA.address, flag)).to.be.revertedWith("LM:openRemoveLiquidFlag already");
        flag = true;
        await expect(liquidManager.connect(user2).openRemoveLiquid(pairA.address, flag)).to.be.revertedWith("Not manager");
        await liquidManager.openRemoveLiquid(pairA.address, flag);
        await expect(liquidManager.checkRemoveLiquid(ethers.constants.AddressZero)).to.be.revertedWith("LM:pair is 0");
        expect(await liquidManager.checkRemoveLiquid(pairA.address)).to.eq(true);
        expect(await liquidManager.checkRemoveLiquid(tokenA.address)).to.eq(false);
        await expect(liquidManager.openRemoveLiquid(pairA.address, flag)).to.be.revertedWith("LM:openRemoveLiquidFlag already");
        flag = false;
        await liquidManager.openRemoveLiquid(pairA.address, flag);
        expect(await liquidManager.checkRemoveLiquid(pairA.address)).to.eq(false);
    });

    it("addWhiteList", async () => {
        const { pairA, tokenA, wallet, user1, user2, user3, liquidManager } = await loadFixture(v2Fixture);
        let users = [user1.address, user2.address];
        let values = [true, true];
        await expect(liquidManager.addWhiteList(ethers.constants.AddressZero, users, values)).to.be.revertedWith("LM:pair is 0");
        users = [];
        values = [true, true];
        await expect(liquidManager.addWhiteList(pairA.address, users, values)).to.be.revertedWith("LM:arrary error");
        users = [user1.address];
        values = [true, true];
        await expect(liquidManager.addWhiteList(pairA.address, users, values)).to.be.revertedWith("LM:arrary error");
        users = [user1.address, user2.address];
        values = [true, true];
        await liquidManager.addWhiteList(pairA.address, users, values);
        expect(await liquidManager.whiteList(pairA.address, user1.address)).to.eq(true);
        expect(await liquidManager.whiteList(pairA.address, user2.address)).to.eq(true);
        users = [user1.address, user2.address];
        values = [false, false];
        await liquidManager.addWhiteList(pairA.address, users, values);
        expect(await liquidManager.whiteList(pairA.address, user1.address)).to.eq(false);
        expect(await liquidManager.whiteList(pairA.address, user2.address)).to.eq(false);
        users = [user1.address, user2.address];
        values = [true, true];
        await expect(liquidManager.connect(user3).addWhiteList(pairA.address, users, values)).to.be.revertedWith("Not manager");
    });

    it("addBlackList", async () => {
        const { pairA, tokenA, wallet, user1, user2, user3, liquidManager } = await loadFixture(v2Fixture);
        let users = [user1.address, user2.address];
        let values = [true, true];
        await expect(liquidManager.addBlackList(ethers.constants.AddressZero, users, values)).to.be.revertedWith("LM:pair is 0");
        users = [];
        values = [true, true];
        await expect(liquidManager.addBlackList(pairA.address, users, values)).to.be.revertedWith("LM:arrary error");
        users = [user1.address];
        values = [true, true];
        await expect(liquidManager.addBlackList(pairA.address, users, values)).to.be.revertedWith("LM:arrary error");
        users = [user1.address, user2.address];
        values = [true, true];
        await liquidManager.addBlackList(pairA.address, users, values);
        expect(await liquidManager.blackList(pairA.address, user1.address)).to.eq(true);
        expect(await liquidManager.blackList(pairA.address, user2.address)).to.eq(true);
        users = [user1.address, user2.address];
        values = [false, false];
        await liquidManager.addBlackList(pairA.address, users, values);
        expect(await liquidManager.blackList(pairA.address, user1.address)).to.eq(false);
        expect(await liquidManager.blackList(pairA.address, user2.address)).to.eq(false);
        users = [user1.address, user2.address];
        values = [true, true];
        await expect(liquidManager.connect(user3).addBlackList(pairA.address, users, values)).to.be.revertedWith("Not manager");
    });

    it("lockLiquid", async () => {
        const { tokenA, usdtToken, router02, wallet, user1, pairA, lpTokenLock, liquidManager } = await loadFixture(v2Fixture);

        // add liquid for pairA
        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);
        const expectedLiquidity = expandTo18Decimals(1000);
        let token0 = await pairA.token0();
        let token1 = await pairA.token1();

        await tokenA.approve(router02.address, ethers.constants.MaxUint256);
        await usdtToken.approve(router02.address, ethers.constants.MaxUint256);

        await expect(
            router02.addLiquidity(
                token0,
                token1,
                token0Amount,
                token1Amount,
                0,
                0,
                wallet.address,
                ethers.constants.MaxUint256
            )
        )
            .to.emit(token0, "Transfer")
            .withArgs(wallet.address, pairA.address, token0Amount)
            .to.emit(token1, "Transfer")
            .withArgs(wallet.address, pairA.address, token1Amount)
            .to.emit(pairA, "Transfer")
            .withArgs(
                ethers.constants.AddressZero,
                ethers.constants.AddressZero,
                MINIMUM_LIQUIDITY
            )
            .to.emit(pairA, "Transfer")
            .withArgs(
                ethers.constants.AddressZero,
                wallet.address,
                expectedLiquidity.sub(MINIMUM_LIQUIDITY)
            )
            .to.emit(pairA, "Sync")
            .withArgs(token0Amount, token1Amount)
            .to.emit(pairA, "Mint")
            .withArgs(router02.address, token0Amount, token1Amount);

        expect(await pairA.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY));

        await lpTokenLock.addPoolInfo(pairA.address);
        expect(await lpTokenLock.poolLength()).to.eq(1);

        expect(await pairA.balanceOf(lpTokenLock.address)).to.eq(0);
        expect(await lpTokenLock.getLockedAmount(pairA.address, wallet.address)).to.eq(0);

        let lockPairALiquidAmt = expandTo18Decimals(100);
        await expect(
            liquidManager.lockLiquid(
                pairA.address,
                wallet.address,
                lockPairALiquidAmt)
        ).to.be.be.revertedWith("LM:balance error");

        await pairA.transfer(liquidManager.address, lockPairALiquidAmt);
        await liquidManager.lockLiquid(
            pairA.address,
            wallet.address,
            lockPairALiquidAmt);

        expect(await pairA.balanceOf(lpTokenLock.address)).to.eq(lockPairALiquidAmt);
        expect(await lpTokenLock.getLockedAmount(pairA.address, wallet.address)).to.eq(lockPairALiquidAmt);
    });
});