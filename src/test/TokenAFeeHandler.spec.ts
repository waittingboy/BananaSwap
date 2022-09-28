import { expect, use } from "chai";
import { ethers, waffle } from "hardhat";
import { expandTo18Decimals, getApprovalDigest } from "./shared/utilities";
import { Contract, Wallet } from "ethers";
import { BigNumber } from "ethers";
import { TokenAFeeHandler } from "../types/TokenAFeeHandler";
import { FeeHandler } from "../types/FeeHandler";
import { MockProvider } from "ethereum-waffle";
const { time } = require("./shared");

const TOTAL_SUPPLY = expandTo18Decimals(10000);
const TEST_AMOUNT = expandTo18Decimals(10);
const BURN_AMOUNT = 0;
const BLACK_HOLE = "0x000000000000000000000000000000000000dEaD";
const ratioBase = 10000;

describe("TokenAFeeHandler sell must left", () => {
	const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );
	const token0Amount = expandTo18Decimals(5);
	const token1Amount = expandTo18Decimals(10);
	const swapAmount = expandTo18Decimals(1);
	const expectedOutputAmount = BigNumber.from("1662497915624478906");

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
        const router02 = await router.deploy();

        const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
        const oracle = await oracleFactory.deploy();
        

        tokenManager.initialize(tokenBB.address, usdt.address);
        await router02.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
        const bananaQuery4Swap = await (await ethers.getContractFactory("BananaQuery4Swap")).deploy();
        await bananaQuery4Swap.initialize(factoryV2.address,WETH.address,tokenManager.address,feeHandler.address);
        console.log("bananaQuery4Swap.address is:",bananaQuery4Swap.address);
        await router02.setBananaQuery(bananaQuery4Swap.address);
        // await router02.setTokenManager(tokenManager.address);
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

        
        await bananaLiquid.initialize(factoryV2.address,WETH.address,tokenManager.address,usdtFeeHandle.address);
        const BananaSwap = await ethers.getContractFactory("BananaSwap");
        const bananaSwap = await BananaSwap.deploy();
        await bananaSwap.initialize(factoryV2.address,WETH.address,tokenManager.address,feeHandler.address);
        await bananaSwap.setBananaQuery(bananaQuery4Swap.address);
        await bananaSwap.setUsdtFeeHandle(usdtFeeHandle.address);
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

	it("test sell fee 99.99", async () => {
		const { bananaSwap,token0, token1, wallet, pair,user,tokenManager} = await loadFixture(
			v2Fixture
		);

		// before each
		await token0.transfer(pair.address, token0Amount);
		await token1.transfer(pair.address, token1Amount);
		await pair.mint(wallet.address);
		await token0.transfer(user.address,swapAmount);
		await token0.setSellPercent(1);
		tokenManager.addTokenAList(token0.address,true);
		await token0.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256,{from: user.address});
		await expect(
			bananaSwap.connect(user).swapExactTokensForTokens(
				swapAmount,
				0,
				[token0.address, token1.address],
				wallet.address,
				ethers.constants.MaxUint256,
				{from:user.address}
			)
		).to.be.revertedWith("sellAmount gt balance");
		await
		bananaSwap.connect(user).swapExactTokensForTokens(
				swapAmount.mul(9999).div(10000),
				0,
				[token0.address, token1.address],
				wallet.address,
				ethers.constants.MaxUint256,
				{from:user.address}
			);
	});
	it("test sell fee not set", async () => {
		const { bananaSwap, token0, token1, wallet, pair,user,tokenManager} = await loadFixture(
			v2Fixture
		);

		// before each
		await token0.transfer(pair.address, token0Amount);
		await token1.transfer(pair.address, token1Amount);
		await pair.mint(wallet.address);
		await token0.transfer(user.address,swapAmount);
		// await token0.setSellPercent(1);
		tokenManager.addTokenAList(token0.address,true);
		await token0.connect(user).approve(bananaSwap.address, ethers.constants.MaxUint256,{from: user.address});
		await 
		bananaSwap.connect(user).swapExactTokensForTokens(
				swapAmount,
				0,
				[token0.address, token1.address],
				wallet.address,
				ethers.constants.MaxUint256,
				{from:user.address}
			);
	});




	describe("drop permission", () => {
		let handler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;
		const loadFixture = waffle.createFixtureLoader(
			waffle.provider.getWallets(),
			waffle.provider
		);
	
		async function fixture([wallet, user1, user2]: Wallet[]) {
			const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
			const tokenAFeeHandler = await TokenAFeeHandler.deploy();
			return { tokenAFeeHandler, wallet, user1, user2 };
		}
	
		beforeEach('deploy initialized test ', async () => {
			let {tokenAFeeHandler, wallet, user1,user2} = await loadFixture(fixture);
			handler = tokenAFeeHandler;
			owner = wallet;
			user = user1;
			alice = user2;
			await handler.initialize("tokenAFeeHandler", "tokenA",[10000],[wallet.address],100);

			expect(await handler.name()).to.eq("tokenAFeeHandler");
			expect(await handler.symbol()).to.eq("tokenA");
		})
	
		it("test renounceOwnership", async () => {
			await handler.setManager(user.address,true);
			let isManager = await handler.isManager(user.address);
			expect(isManager).to.be.true;
			await expect(handler.connect(user).renounceOwnership({from:user.address})).to.be.revertedWith("Ownable: caller is not the owner");
			await handler.renounceOwnership();
			await expect(handler.setManager(alice.address,true)).to.be.revertedWith("Ownable: caller is not the owner");
		});

		it("test truncateManager", async () => {
			await handler.setManager(user.address,true);
			let isManager = await handler.isManager(user.address);
			expect(isManager).to.be.true;
			await handler.connect(user).truncateManager({from:user.address});
			let isManagerDelete = await handler.isManager(user.address);
			expect(isManagerDelete).to.be.false;
			await expect(handler.connect(alice).truncateManager({from:alice.address})).to.be.revertedWith("Not manager");
		});
	})

});


describe("TokenAFeeHandler transfer must left", () => {
	let newTokenAHandler: TokenAFeeHandler,handler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;
	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function fixture([wallet, user1, user2]: Wallet[]) {
		const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const tokenAFeeHandler = await TokenAFeeHandler.deploy();
		const newTokenAFeeHandler = await TokenAFeeHandler.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const myFeeHandler = await FeeHandler.deploy();
		return { newTokenAFeeHandler,tokenAFeeHandler, wallet, user1, user2, myFeeHandler };
	}

	beforeEach('deploy initialized test ', async () => {
		let { newTokenAFeeHandler,tokenAFeeHandler, wallet, user1, user2, myFeeHandler } = await loadFixture(fixture);
		handler = tokenAFeeHandler;
		newTokenAHandler = newTokenAFeeHandler;
		owner = wallet;
		user = user1;
		alice = user2;
		feeHandler = myFeeHandler;
		let mintAmount = 10000;
		await handler.initialize("tokenAFeeHandler", "tokenA",[10000],[owner.address],mintAmount);
		expect(await handler.name()).to.eq("tokenAFeeHandler");
		expect(await handler.symbol()).to.eq("tokenA");
	})

	it("test transfer fee 99.99", async () => {
		let mintAmount = 10000;
		let transferAmount = 10000;
		await handler.setTransferPercent(1);
		await expect(handler.transfer(handler.address, transferAmount)).to.be.revertedWith("amount gt balance");
		transferAmount = 9999;
		await handler.transfer(handler.address, transferAmount);
		expect(await handler.balanceOf(owner.address)).to.be.eq(1);
	});

	it("test transfer fee 99.99 with balance is 100000", async () => {
		let mintAmount = 100000;
		let transferAmount = 10000;
		await handler.setTransferPercent(1);
		// await handler.born(owner.address, mintAmount);
		await expect(handler.transfer(handler.address, transferAmount)).to.be.revertedWith("amount gt balance");
		transferAmount = 9990;
		await handler.transfer(handler.address, transferAmount);
		expect(await handler.balanceOf(owner.address)).to.be.eq(10);
	});

	it("test transfer fee not set transferPercent", async () => {
		let mintAmount = 10000;
		let transferAmount = 10000;
		// await handler.born(owner.address, mintAmount);
		await handler.transfer(handler.address, transferAmount);
	});

	it("test transfer from 99.99", async () => {
		let mintAmount = 10000;
		let transferAmount = 1000;
		await handler.setTransferPercent(1);
		// await handler.born(user.address, mintAmount);
		await handler.transfer(user.address, transferAmount);
		await handler.connect(user).approve(alice.address, transferAmount, { from: user.address });
		await expect(handler.connect(alice).transferFrom(user.address, handler.address, transferAmount, { from: alice.address })).to.be.revertedWith("amount gt balance");
		transferAmount = 999;
		
		await handler.connect(alice).transferFrom(user.address, handler.address, transferAmount, { from: alice.address });
		expect(await handler.balanceOf(user.address)).to.be.eq(1);
	});

	it("test transfer not set transferPercent", async () => {
		let mintAmount = 10000;
		let transferAmount = 10000;
		// await handler.born(user.address, mintAmount);
		// await handler.connect(user).approve(alice.address, transferAmount, { from: user.address });
		await handler.transfer(handler.address, transferAmount);
	});

	it("test inflation", async () => {
		await newTokenAHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[owner.address],expandTo18Decimals(100000));
		expect(await newTokenAHandler.inflationPattern()).to.eq(0);
		// await handler.born(owner.address, expandTo18Decimals(100000));
		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000));

		let blockInfo1 = await time.latestBlockInfo();
		await time.advanceTimeAndBlock(130);
		let blockInfo2 = await time.latestBlockInfo();
		// expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 130);

		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000));

		await newTokenAHandler.setInflationPattern(BigNumber.from("1"));
		await newTokenAHandler.setStep(BigNumber.from("900"));
		expect(await newTokenAHandler.inflationPattern()).to.eq(1);
		await newTokenAHandler.transfer(user.address, expandTo18Decimals(10000));
		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000).sub(expandTo18Decimals(10000)));
		expect(await newTokenAHandler.balanceOf(user.address)).to.eq(expandTo18Decimals(10000));

		blockInfo1 = await time.latestBlockInfo();
		await time.advanceTimeAndBlock(990);
		blockInfo2 = await time.latestBlockInfo();
		// expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 990);
		let ss = await newTokenAHandler.balanceOf(user.address);

		let spy = await newTokenAHandler.spy();
		let base = BigNumber.from("10").pow(18);
		let addAmout = expandTo18Decimals(10000).mul(spy).div(base).mul(BigNumber.from("100"));
		// expect(await handler.balanceOf(user.address)).to.eq(expandTo18Decimals(10000).add(addAmout));
		await newTokenAHandler.setInflationPattern(BigNumber.from("0"));
	});

	it("test inflation step 120", async () => {
		await newTokenAHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[owner.address],expandTo18Decimals(100000));
		expect(await newTokenAHandler.inflationPattern()).to.eq(0);
		// await handler.born(owner.address, expandTo18Decimals(100000));
		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000));

		let blockInfo1 = await time.latestBlockInfo();
		await time.advanceTimeAndBlock(130);
		let blockInfo2 = await time.latestBlockInfo();
		// expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 130);

		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000));

		await newTokenAHandler.setInflationPattern(BigNumber.from("1"));
		await newTokenAHandler.setStep(BigNumber.from("120"));

		expect(await newTokenAHandler.inflationPattern()).to.eq(1);
		await newTokenAHandler.transfer(user.address, expandTo18Decimals(10000));
		expect(await newTokenAHandler.balanceOf(owner.address)).to.eq(expandTo18Decimals(100000).sub(expandTo18Decimals(10000)));
		expect(await newTokenAHandler.balanceOf(user.address)).to.eq(expandTo18Decimals(10000));

		blockInfo1 = await time.latestBlockInfo();
		await time.advanceTimeAndBlock(100);
		blockInfo2 = await time.latestBlockInfo();
		// expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 100);

		expect(await newTokenAHandler.balanceOf(user.address)).to.eq(expandTo18Decimals(10000));

		blockInfo1 = await time.latestBlockInfo();
		await time.advanceTimeAndBlock(50);
		blockInfo2 = await time.latestBlockInfo();
		// expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 50);

		let spy = await newTokenAHandler.spy();
		let base = BigNumber.from("10").pow(18);
		let addAmout = expandTo18Decimals(10000).mul(spy).mul(150).div(base);
		expect(await newTokenAHandler.balanceOf(user.address)).to.eq(expandTo18Decimals(10000).add(addAmout));
	});
})

describe("TokenAFeeHandler for test", () => {
	let tokenAFeeHandler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;
	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function fixture([wallet, user1, user2]: Wallet[]) {
		const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const tokenAFeeHandler = await TokenAFeeHandler.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const myFeeHandler = await FeeHandler.deploy();
		return { tokenAFeeHandler, wallet, user1, user2, myFeeHandler };
	}

	beforeEach('deploy initialized test ', async () => {
		let { tokenAFeeHandler: myTokenAFeeHandler, wallet, user1, user2, myFeeHandler } = await loadFixture(fixture);
		tokenAFeeHandler = myTokenAFeeHandler;
		owner = wallet;
		user = user1;
		alice = user2;
		feeHandler = myFeeHandler;
		let mintAmount = 60000;
		await tokenAFeeHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[owner.address],mintAmount);
		expect(await tokenAFeeHandler.name()).to.eq("tokenAFeeHandler");
		expect(await tokenAFeeHandler.symbol()).to.eq("tokenA");
	})

	// let actionType = 0;
	const actionTypes = [0, 1, 2, 3,]  //0:Buy,1:Sell,2:AddLiquid,3:RemoveLiquid,4:Transfer
	const rewardTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
	actionTypes.forEach((actionType, _) => {
		rewardTypes.forEach((rewardType, _) => {
			it(`test actionType:${actionType} nodeReward fee to reward`, async () => {
				// console.log("actionType is:",actionType);
				let mintAmount = 60000;
				let inputAmount = 50000;
				const rewardFeeRatio = 500;
				// await tokenAFeeHandler.born(owner.address, mintAmount);;
				await tokenAFeeHandler.setTransferPercent(100);
				let feeAmount = inputAmount * rewardFeeRatio / ratioBase;
				// console.log("feeAmount is:",feeAmount);
				await tokenAFeeHandler.transfer(tokenAFeeHandler.address, feeAmount,);
				let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
				expect(handlerBalance).to.eq(feeAmount);

				let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: true };
				// 0 parameter is nodeReward
				// let rewardType = 0;
				await tokenAFeeHandler.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
				let feeConfig = await tokenAFeeHandler.getFeeConfig(actionType, rewardType);
				expect(feeConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
				expect(feeConfig.feeHandler).to.be.equal(feeHandler.address);
				await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
				// let tx = await tokenAFeeHandler.handleDeductFee(actionType,feeAmount);
				// let leftBalance = await tokenAFeeHandler.balanceOf(user.address);
				// expect(leftBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
				// let nodeRewardFee = await tokenAFeeHandler.balanceOf(feeHandler.address);
				// expect(nodeRewardFee).to.be.eq(feeAmount);
				// // check event
				// let receipt = await tx.wait();
				// console.log("receipt.events is:",receipt.events);
				// let listEvent = receipt.events?.at(1);
				// expect(listEvent?.event).to.be.eq("FeeDeduct");
				// // uint256 inputAmount,
				// //     uint256 feeAmount,
				// //     uint256 feeRatio,
				// //     RewardType rewardType
				// expect(listEvent?.eventSignature)
				//   .to.be.eq("FeeDeduct(uint256,uint256,uint8,uint8)");
				// let args = listEvent?.args;
				// expect(args?.actionType).to.be.equal(actionType);
				// expect(args?.feeAmount).to.be.equal(feeAmount);
				// expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
				// expect(args?.rewardType).to.be.equal(rewardType);
			});
		});
	});


});



describe("TokenAFeeHandler for transfer", () => {
	let tokenAFeeHandler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;

	let actionType = 4;

	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function fixture([wallet, user1, user2]: Wallet[]) {
		const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const tokenAFeeHandler = await TokenAFeeHandler.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const myFeeHandler = await FeeHandler.deploy();
		return { tokenAFeeHandler, wallet, user1, user2, myFeeHandler };
	}

	beforeEach('deploy initialized test ', async () => {
		let { tokenAFeeHandler: myTokenAFeeHandler, wallet, user1, user2, myFeeHandler } = await loadFixture(fixture);
		tokenAFeeHandler = myTokenAFeeHandler;
		owner = wallet;
		user = user1;
		alice = user2;
		feeHandler = myFeeHandler;
		let mintAmount = 60000;
		await tokenAFeeHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[wallet.address],mintAmount);
		expect(await tokenAFeeHandler.name()).to.be.equal("tokenAFeeHandler");
		expect(await tokenAFeeHandler.symbol()).to.eq("tokenA");
	})

	const rewardTypes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
	rewardTypes.forEach((rewardType, _) => {
		it("test reward for transfer", async () => {
			// console.log("rewardType is:",rewardType);
			let mintAmount = 60000;
			let inputAmount = 50000;
			// await tokenAFeeHandler.born(owner.address, mintAmount);

			// await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
			let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
			expect(handlerBalance).to.eq(0);
			const rewardFeeRatio = 500;
			let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
			// 0 parameter is nodeReward
			await tokenAFeeHandler.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
			let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType, rewardType);
			expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(500);
			expect(nodeRewardConfig.feeHandler).to.be.equal(feeHandler.address);
			await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
			let tx = await tokenAFeeHandler.transfer(user.address, inputAmount);

			let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
			const ratioBase = 10000;
			expect(leftBalance).to.eq(mintAmount - inputAmount);
			let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
			expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
			let nodeRewardFee = await tokenAFeeHandler.balanceOf(feeHandler.address);
			expect(nodeRewardFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
			// // check event
			let receipt = await tx.wait();
			// // console.log("receipt.events is:",receipt.events);
			// let listEvent = receipt.events?.at(1);
			// expect(listEvent?.event).to.be.eq("FeeDeduct");
			// // uint256 inputAmount,
			// //     uint256 feeAmount,
			// //     uint256 feeRatio,
			// //     RewardType rewardType
			// expect(listEvent?.eventSignature)
			//   .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
			// let args = listEvent?.args;
			// expect(args?.inputAmount).to.be.equal(inputAmount);
			// expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
			// expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
			// expect(args?.rewardType).to.be.equal(rewardType);
		});
	});


	// it("test transfer marketing 1 fee to reward", async () => {
	//   let mintAmount = 60000;
	//   let inputAmount = 50000;
	//   await tokenAFeeHandler.born(owner.address, mintAmount);;

	//   // await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
	//   let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
	//   expect(handlerBalance).to.eq(0);
	//   const rewardFeeRatio = 500;
	//   let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: alice.address,needHandle:false };
	//   // 1 parameter is marketing
	//   let rewardType = 1;
	//   await tokenAFeeHandler.setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true);
	//   let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType,rewardType);
	//   expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
	//   expect(nodeRewardConfig.feeHandler).to.be.equal(alice.address);
	//   await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
	//   let tx = await tokenAFeeHandler.transfer(user.address,inputAmount);
	//   let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
	//   const ratioBase = 10000;

	//   let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
	//   expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
	//   expect(leftBalance).to.eq(mintAmount - inputAmount);
	//   let deductFee = await tokenAFeeHandler.balanceOf(alice.address);
	//   expect(deductFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
	//   // // check event
	//   let receipt = await tx.wait();

	//   let listEvent = receipt.events?.at(1);
	//   expect(listEvent?.event).to.be.eq("FeeDeduct");
	//   // uint256 inputAmount,
	//   //     uint256 feeAmount,
	//   //     uint256 feeRatio,
	//   //     RewardType rewardType
	//   expect(listEvent?.eventSignature)
	//     .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
	//   let args = listEvent?.args;
	//   expect(args?.inputAmount).to.be.equal(inputAmount);
	//   expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
	//   expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
	//   expect(args?.rewardType).to.be.equal(rewardType);
	// });

	// it("test transfer destroy 2 fee to reward", async () => {
	//   let mintAmount = 60000;
	//   let inputAmount = 50000;
	//   await tokenAFeeHandler.born(owner.address, mintAmount);;

	//   // await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
	//   let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
	//   expect(handlerBalance).to.eq(0);
	//   const rewardFeeRatio = 500;
	//   let feeHandlerAddress = BLACK_HOLE;
	//   let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandlerAddress,needHandle:false };
	//   // 1 parameter is marketing
	//   let rewardType = 2;
	//   await tokenAFeeHandler.setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true);
	//   let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType,rewardType);
	//   expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
	//   expect(nodeRewardConfig.feeHandler).to.be.equal(feeHandlerAddress);
	//   await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
	//   let tx = await tokenAFeeHandler.transfer(user.address,inputAmount);
	//   let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
	//   const ratioBase = 10000;

	//   let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
	//   expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
	//   expect(leftBalance).to.eq(mintAmount - inputAmount);
	//   let deductFee = await tokenAFeeHandler.balanceOf(feeHandlerAddress);
	//   expect(deductFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
	//   // // check event
	//   let receipt = await tx.wait();

	//   let listEvent = receipt.events?.at(1);
	//   expect(listEvent?.event).to.be.eq("FeeDeduct");
	//   // uint256 inputAmount,
	//   //     uint256 feeAmount,
	//   //     uint256 feeRatio,
	//   //     RewardType rewardType
	//   expect(listEvent?.eventSignature)
	//     .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
	//   let args = listEvent?.args;
	//   expect(args?.inputAmount).to.be.equal(inputAmount);
	//   expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
	//   expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
	//   expect(args?.rewardType).to.be.equal(rewardType);
	// });


	// it("test transfer destroy 3 fee to reward", async () => {
	//   let mintAmount = 60000;
	//   let inputAmount = 50000;
	//   await tokenAFeeHandler.born(owner.address, mintAmount);;

	//   // await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
	//   let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
	//   expect(handlerBalance).to.eq(0);
	//   const rewardFeeRatio = 500;
	//   let feeHandlerAddress = feeHandler.address;
	//   let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandlerAddress,needHandle:false };
	//   // 1 parameter is marketing
	//   let rewardType = 3;
	//   await tokenAFeeHandler.setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true);
	//   let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType,rewardType);
	//   expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
	//   expect(nodeRewardConfig.feeHandler).to.be.equal(feeHandlerAddress);
	//   await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
	//   let tx = await tokenAFeeHandler.transfer(user.address,inputAmount);
	//   let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
	//   const ratioBase = 10000;

	//   let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
	//   expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
	//   expect(leftBalance).to.eq(mintAmount - inputAmount);
	//   let deductFee = await tokenAFeeHandler.balanceOf(feeHandlerAddress);
	//   expect(deductFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
	//   // // check event
	//   let receipt = await tx.wait();

	//   let listEvent = receipt.events?.at(1);
	//   expect(listEvent?.event).to.be.eq("FeeDeduct");
	//   // uint256 inputAmount,
	//   //     uint256 feeAmount,
	//   //     uint256 feeRatio,
	//   //     RewardType rewardType
	//   expect(listEvent?.eventSignature)
	//     .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
	//   let args = listEvent?.args;
	//   expect(args?.inputAmount).to.be.equal(inputAmount);
	//   expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
	//   expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
	//   expect(args?.rewardType).to.be.equal(rewardType);
	// });

	// it("test transfer destroy 4 fee to reward", async () => {
	//   let mintAmount = 60000;
	//   let inputAmount = 50000;
	//   await tokenAFeeHandler.born(owner.address, mintAmount);;

	//   // await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
	//   let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
	//   expect(handlerBalance).to.eq(0);
	//   const rewardFeeRatio = 500;
	//   let feeHandlerAddress = feeHandler.address;
	//   let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandlerAddress,needHandle:true };
	//   // 1 parameter is marketing
	//   let rewardType = 4;
	//   await tokenAFeeHandler.setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true);
	//   let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType,rewardType);
	//   expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
	//   expect(nodeRewardConfig.feeHandler).to.be.equal(feeHandlerAddress);
	//   await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType,rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
	//   let tx = await tokenAFeeHandler.transfer(user.address,inputAmount);
	//   let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
	//   const ratioBase = 10000;

	//   let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
	//   expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
	//   expect(leftBalance).to.eq(mintAmount - inputAmount);
	//   let deductFee = await tokenAFeeHandler.balanceOf(feeHandlerAddress);
	//   expect(deductFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
	//   // // check event
	//   let receipt = await tx.wait();

	//   let listEvent = receipt.events?.at(1);
	//   expect(listEvent?.event).to.be.eq("FeeDeduct");
	//   // uint256 inputAmount,
	//   //     uint256 feeAmount,
	//   //     uint256 feeRatio,
	//   //     RewardType rewardType
	//   expect(listEvent?.eventSignature)
	//     .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
	//   let args = listEvent?.args;
	//   expect(args?.inputAmount).to.be.equal(inputAmount);
	//   expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
	//   expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
	//   expect(args?.rewardType).to.be.equal(rewardType);
	// });
});


describe("TokenAFeeHandler for transfer repurchaseDestroy", () => {
	let tokenAFeeHandler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;

	let actionType = 4;

	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function fixture([wallet, user1, user2]: Wallet[]) {
		const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const tokenAFeeHandler = await TokenAFeeHandler.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const myFeeHandler = await FeeHandler.deploy();
		return { tokenAFeeHandler, wallet, user1, user2, myFeeHandler };
	}

	beforeEach('deploy initialized test ', async () => {
		let { tokenAFeeHandler: myTokenAFeeHandler, wallet, user1, user2, myFeeHandler } = await loadFixture(fixture);
		tokenAFeeHandler = myTokenAFeeHandler;
		owner = wallet;
		user = user1;
		alice = user2;
		feeHandler = myFeeHandler;
		let mintAmount = 60000;
		await tokenAFeeHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[wallet.address],mintAmount);
		expect(await tokenAFeeHandler.name()).to.be.equal("tokenAFeeHandler");
		expect(await tokenAFeeHandler.symbol()).to.eq("tokenA");
	})

	it("test transfer 8 repurchaseDestroy", async () => {
		let mintAmount = 60000;
		let inputAmount = 50000;
		// await tokenAFeeHandler.born(owner.address, mintAmount);;

		// await tokenAFeeHandler.transfer(tokenAFeeHandler.address, inputAmount,);
		let handlerBalance = await tokenAFeeHandler.balanceOf(tokenAFeeHandler.address);
		expect(handlerBalance).to.eq(0);
		const rewardFeeRatio = 500;
		let feeHandlerAddress = feeHandler.address;
		let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandlerAddress, needHandle: true };
		// 1 parameter is marketing
		let rewardType = 8;
		await tokenAFeeHandler.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
		let nodeRewardConfig = await tokenAFeeHandler.getFeeConfig(actionType, rewardType);
		expect(nodeRewardConfig.feeRatio.toNumber()).to.be.equal(rewardFeeRatio);
		expect(nodeRewardConfig.feeHandler).to.be.equal(feeHandlerAddress);
		await expect(tokenAFeeHandler.connect(user).setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true)).revertedWith("Not manager");
		let tx = await tokenAFeeHandler.transfer(user.address, inputAmount);
		let leftBalance = await tokenAFeeHandler.balanceOf(owner.address);
		const ratioBase = 10000;

		let userReceivedBalance = await tokenAFeeHandler.balanceOf(user.address);
		expect(userReceivedBalance).to.eq(inputAmount - inputAmount * rewardFeeRatio / ratioBase);
		expect(leftBalance).to.eq(mintAmount - inputAmount);
		let deductFee = await tokenAFeeHandler.balanceOf(feeHandlerAddress);
		expect(deductFee).to.be.eq(inputAmount * rewardFeeRatio / ratioBase - BURN_AMOUNT);
		// // check event
		let receipt = await tx.wait();

		// let listEvent = receipt.events?.at(1);
		// expect(listEvent?.event).to.be.eq("FeeDeduct");
		// // uint256 inputAmount,
		// //     uint256 feeAmount,
		// //     uint256 feeRatio,
		// //     RewardType rewardType
		// expect(listEvent?.eventSignature)
		//   .to.be.eq("FeeDeduct(uint256,uint256,uint256,uint8,uint8)");
		// let args = listEvent?.args;
		// expect(args?.inputAmount).to.be.equal(inputAmount);
		// expect(args?.feeAmount).to.be.equal(inputAmount * rewardFeeRatio / ratioBase);
		// expect(args?.feeRatio).to.be.equal(rewardFeeRatio);
		// expect(args?.rewardType).to.be.equal(rewardType);
	});


});
describe("TokenAFeeHandler checkTransfer", async () => {
	let tokenAFeeHandler: TokenAFeeHandler, owner: Wallet, user: Wallet, alice: Wallet, feeHandler: FeeHandler;

	let actionType = 4;

	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function fixture([wallet, user1, user2]: Wallet[]) {
		const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const tokenAFeeHandler = await TokenAFeeHandler.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const myFeeHandler = await FeeHandler.deploy();
		return { tokenAFeeHandler, wallet, user1, user2, myFeeHandler };
	}
	beforeEach('deploy initialized test ', async () => {
		let { tokenAFeeHandler: myTokenAFeeHandler, wallet, user1, user2, myFeeHandler } = await loadFixture(fixture);
		tokenAFeeHandler = myTokenAFeeHandler;
		owner = wallet;
		user = user1;
		alice = user2;
		feeHandler = myFeeHandler;
		await tokenAFeeHandler.initialize("tokenAFeeHandler", "tokenA",[10000],[wallet.address],100);
		expect(await tokenAFeeHandler.name()).to.be.equal("tokenAFeeHandler");
		expect(await tokenAFeeHandler.symbol()).to.eq("tokenA");
	})





});