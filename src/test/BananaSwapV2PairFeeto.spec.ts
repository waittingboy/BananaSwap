import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { ITokenAFeeHandler, IBananaSwapPair, TokenManager } from "../types";
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import bn from 'bignumber.js';
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

describe.skip("BananaSwapV2PairFeeTo", () => {
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

		const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
		const usdtFeeHandle = await usdtFeeFactory.deploy();
		// deploy V2
		const v2factory = await ethers.getContractFactory("BananaSwapFactory");
		const factoryV2 = await v2factory.deploy(wallet.address,tokenManager.address,usdtFeeHandle.address);

		const routerEmit = await ethers.getContractFactory("RouterEventEmitter");

		const RouterEmit = await routerEmit.deploy();
		const delegatorFactory = await ethers.getContractFactory("BananaSwapV2RouterDelegatorMock");
		const delegator = await delegatorFactory.deploy();
		const FeeHandler = await ethers.getContractFactory("FeeHandler");
		const feeHandler = await FeeHandler.deploy();

		const rewardHandlerFactory = await ethers.getContractFactory("RewardHandler");
		const rewardHandler = await rewardHandlerFactory.deploy();
		// deploy routers
		const router = await ethers.getContractFactory("BananaSwapV2Router");
		const router02 = await router.deploy();

		const oracleFactory = await ethers.getContractFactory("ExampleOracleSimple");
		const oracle = await oracleFactory.deploy();


		tokenManager.initialize(tokenBB.address, usdt.address);
		await delegator.initialize(tokenManager.address, router02.address, factoryV2.address, WETH.address);
		await router02.initialize(factoryV2.address, WETH.address, tokenManager.address, delegator.address);
		// await router02.setTokenManager(tokenManager.address);
		// initialize V2
		await factoryV2.createPair(tokenA.address, tokenB.address);
		await factoryV2.createPair(tokenA.address, WETHPartner.address);
		await factoryV2.createPair(tokenA.address, usdt.address);
		const newTokenAUsdtPairAddress = await factoryV2.getPair(tokenA.address, usdt.address);
		const pairFactory = await ethers.getContractFactory("BananaSwapPair");
		const codeHashOfPair = await factoryV2.PAIR_HASH();
    	console.log("codeHashOfPair is:", codeHashOfPair);
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
		return {
			token0,
			tokenA,
			token1,
			tokenB,
			WETH,
			WETHPartner,
			factoryV2,
			router02,
			pair,
			RouterEmit,
			wallet,
			user,
			wethPair,
			provider,
			delegator,
			tokenManager,
			feeHandler,
			tokenAUsdtPair,
			usdt,
			newTokenAUsdtPair,
			oracle,
			rewardHandler,
		};
	}

	function calFeeToLiquid(rootK: BigNumber,rootKLast: BigNumber,totalSupply: BigNumber,factor:BigNumber):BigNumber{
		// uint256 numerator = totalSupply * (rootK - rootKLast);
		// uint256 denominator = rootK * 3 + rootKLast;
		// uint256 liquidity = numerator / denominator;
		let numerator = totalSupply.mul(rootK.sub(rootKLast));
		console.log("++++++numerator is:",numerator);
		let denominator = rootK.mul(factor).add(rootKLast);
		console.log("++++++denominator is:",denominator);
		let liquidity = numerator.div(denominator);
		console.log("++++++denominator is:",denominator);
		return liquidity;
	}

	describe("swapExactTokensForTokens", () => {
		const token0Amount = expandTo18Decimals(5);
		const token1Amount = expandTo18Decimals(10);
		const swapAmount = expandTo18Decimals(1);
		const expectedOutputAmount = BigNumber.from("1662497915624478906");

		it("usdt swap tokenA origin", async () => {
			const { router02, token0, token1, wallet, pair, delegator, factoryV2, user } = await loadFixture(
				v2Fixture
			);

			await factoryV2.setFeeTo(user.address);
			let feeToAddress = await factoryV2.feeTo();
			expect(feeToAddress).to.be.equals(user.address);
			// before each
			await token0.transfer(pair.address, token0Amount);
			await token1.transfer(pair.address, token1Amount);
			await pair.mint(wallet.address);
			let balanceOfUserPair = await pair.balanceOf(user.address);
			console.log("balanceOfUserPair is:", balanceOfUserPair);
			await token0.approve(delegator.address, ethers.constants.MaxUint256);
			await delegator.swapExactTokensForTokens(
				swapAmount,
				0,
				[token0.address, token1.address],
				wallet.address,
				ethers.constants.MaxUint256
			);
			let [_reserve0, _reserve1 ] = await pair.getReserves();
			console.log("test _reserve0, _reserve1 is:",_reserve0, _reserve1);
			// before each
			await token0.transfer(pair.address, token0Amount);
			await token1.transfer(pair.address, token1Amount);
			await pair.mint(wallet.address);
			let balanceOfUserPairAfterSwap = await pair.balanceOf(user.address);
			console.log("balanceOfUserPairAfterSwap is:", balanceOfUserPairAfterSwap);

			// rootK: BigNumber,rootKLast: BigNumber,totalSupply: BigNumber
			let rootK = BigNumber.from("7072836242007383459");
			let rootKLast = BigNumber.from("7071067811865475244");
			let totalSupply = BigNumber.from("7071067811865475244");
			let liquid = calFeeToLiquid(rootK,rootKLast,totalSupply,BigNumber.from("1"));
			console.log("liquid is:",liquid);
			expect(liquid).to.be.equals(balanceOfUserPairAfterSwap);
			let liquidOrigin = calFeeToLiquid(rootK,rootKLast,totalSupply,BigNumber.from("5"));
			console.log("liquidOrigin is:",liquidOrigin);
			// expect(liquid.div(3)).to.be.equals(liquidOrigin);
		});

	});

});
