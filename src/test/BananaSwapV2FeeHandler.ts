import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import bn from 'bignumber.js';
const { ADDRESS_DEAD } = require("./shared");
const feeToAddress = "200bf50Dc45A3C846526390BE39e6411dA4f55e9";

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

describe.skip("BananaSwapV2FeeHandler", () => {
	const loadFixture = waffle.createFixtureLoader(
		waffle.provider.getWallets(),
		waffle.provider
	);

	async function v2Fixture([wallet, user]: Wallet[], provider: MockProvider) {
		const token = await ethers.getContractFactory("SmartERC20");
		const tokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
		const TokenManager = await ethers.getContractFactory("TokenManager");
		const tokenManager = await TokenManager.deploy();
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
		// usdtFeeHandle
		const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
		const usdtFeeHandle = await usdtFeeFactory.deploy();
		// deploy V2
		const v2factory = await ethers.getContractFactory("BananaSwapFactory");
		const factoryV2 = await v2factory.deploy(wallet.address,tokenManager.address,usdtFeeHandle.address);

		const routerEmit = await ethers.getContractFactory("RouterEventEmitter");

		const RouterEmit = await routerEmit.deploy();
		// const delegatorFactory = await ethers.getContractFactory("BananaSwapV2RouterDelegatorMock");
		// const delegator = await delegatorFactory.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const feeHandler = await FeeHandler.deploy();
		// deploy routers

		const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
		const oracle = await oracleFactory.deploy();
		
		tokenManager.initialize(tokenBB.address, usdt.address);
		// await delegator.initialize(tokenManager.address, router02.address, factoryV2.address, WETH.address);
		// await router02.setTokenManager(tokenManager.address);
		// initialize V2
		console.log("tokenA.address, tokenB.address",tokenA.address, tokenB.address);
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
		
		console.log("pairAddress is:",pairAddress);
		
		const pair = new Contract(
			pairAddress,
			pairFactory.interface,
			provider
		).connect(wallet);
		await pair.setTokenManager(tokenManager.address);
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

		// deploy router-swap
		const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
		const routerSwap = await BananaSwapFactory.deploy();
	
		const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
		const routerLiquid = await BananaLiquidFactory.deploy();


		const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
    	const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
		
		await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    	await routerLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
		await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
		await routerSwap.setBananaQuery(routerQuery4Swap.address);

		return {
			token0,
			tokenA,
			token1,
			tokenB,
			WETH,
			WETHPartner,
			factoryV2,
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
			routerSwap,
			routerLiquid,
		};
	}

	describe("swapExactTokensForTokens", () => {
		const token0Amount = expandTo18Decimals(5);
		const token1Amount = expandTo18Decimals(10);
		const swapAmount = expandTo18Decimals(1);

		it("tokenA swap tokenB with reflowFee handler", async () => {
			const { token0,token1, tokenA, tokenB, wallet, pair, tokenManager,factoryV2,routerSwap,routerLiquid, } = await loadFixture(
				v2Fixture
			);
			const codeHashOfPair = await factoryV2.PAIR_HASH();
    		console.log("codeHashOfPair is:", codeHashOfPair);

			// before each
			await tokenA.transfer(pair.address, token0Amount);
			await tokenB.transfer(pair.address, token1Amount);
			await pair.mint(wallet.address);
			console.log("the pair is :",pair.address);
			let [reserve0,reserve1] = await pair.getReserves();
			let r0,r1;
			if (token0 === tokenA){
				r0 = reserve0;
				r1 = reserve1;
			}else{
				r0 = reserve1;
				r1 = reserve0;
			}
			console.log("r0,r1 is:",r0,r1);
			await tokenA.approve(routerSwap.address, ethers.constants.MaxUint256);
			await tokenManager.addTokenAList(tokenA.address,true);
			

			let actionType = 1;
			const rewardFeeRatio = 500;
			const ReflowFeeHandler = await ethers.getContractFactory("ReflowFeeHandler");
			const reflowFeeHandler = await ReflowFeeHandler.deploy();
			await reflowFeeHandler.initialize(tokenB.address,routerSwap.address,routerLiquid.address,expandTo18Decimals(1).div(10));
			console.log("reflowFeeHandler.address",reflowFeeHandler.address);
			await tokenA.addWeList([reflowFeeHandler.address]);
			let reflowRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandler.address, needHandle: true };
			let rewardType = 5;
			await tokenA.setFeeConfig(actionType, rewardType, reflowRewardFeeConfig, true);

			await routerSwap.swapExactTokensForTokens(
				swapAmount,
				0,
				[tokenA.address, tokenB.address],
				wallet.address,
				ethers.constants.MaxUint256
			);
			var balanceOfBlackHole = await pair.balanceOf(ADDRESS_DEAD);
			expect(balanceOfBlackHole).to.be.eq(0);
			let leftAmount = swapAmount.mul(baseRatio - rewardFeeRatio).div(baseRatio);
			console.log("leftAmount is:",leftAmount);
			let [reserve0Check,reserve1Check] = await pair.getReserves();
			console.log("reserve0Check,reserve1Check is:",reserve0Check,reserve1Check);
			let r0Checked,r1Checked;
			if (token0 === tokenA){
				r0Checked = reserve0Check;
				r1Checked = reserve1Check;
			}else{
				r0Checked = reserve1Check;
				r1Checked = reserve0Check;
			}
			let feeAmount = swapAmount.sub(leftAmount);
			let feeHandlerBalance = await tokenA.balanceOf(reflowFeeHandler.address);
			console.log("feeHandlerBalance is:",feeHandlerBalance);
			console.log("feeAmount is:",feeAmount);
			expect(feeHandlerBalance).to.equal(feeAmount);
			// expect(r0).to.be.equals(r0Checked.sub(leftAmount).sub(feeAmount));
			
			await routerSwap.swapExactTokensForTokens(
				swapAmount,
				0,
				[tokenA.address, tokenB.address],
				wallet.address,
				ethers.constants.MaxUint256
			);
			let feeHandlerBalanceAfterDeliver = await tokenA.balanceOf(reflowFeeHandler.address);
			console.log("feeHandlerBalanceAfterDeliver is:",feeHandlerBalanceAfterDeliver);
			expect(feeHandlerBalanceAfterDeliver).to.equal(0);
			var balanceOfBlackHole = await pair.balanceOf(ADDRESS_DEAD);
			console.log("balanceOfBlackHole is:",balanceOfBlackHole);
			expect(balanceOfBlackHole).to.be.eq(BigNumber.from("50870991452269605"));
		});
	});
});
