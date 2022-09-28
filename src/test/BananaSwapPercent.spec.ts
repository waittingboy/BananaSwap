import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, Contract, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import {
  expandTo18Decimals,
  tokenAIsToken0,
  MINIMUM_LIQUIDITY,
  setNextBlockTime,
} from "./shared/utilities";

const BLACK_HOLE = "0x000000000000000000000000000000000000dead";

describe("UniswapV2Router", () => {
  const loadFixture = waffle.createFixtureLoader(
    waffle.provider.getWallets(),
    waffle.provider
  );


  async function v2Fixture([wallet]: Wallet[], provider: MockProvider) {
    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await TokenManager.deploy();

    const token = await ethers.getContractFactory("SmartERC20");
    const TokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");

    // deploy tokens
    // const tokenA = await token.deploy(expandTo18Decimals(10000));
    const tokenB = await token.deploy(expandTo18Decimals(10000));
    const usdt = await token.deploy(expandTo18Decimals(10000));
    const tokenAFeeHandler = await TokenAFeeHandler.deploy();
    await tokenAFeeHandler.initialize("tokenAFeeHandler", "Token A",[10000],[wallet.address], expandTo18Decimals(10000));
    // await tokenAFeeHandler.born(wallet.address, expandTo18Decimals(10000));
    await tokenManager.initialize(tokenAFeeHandler.address, usdt.address);
    await tokenManager.addTokenAList(tokenAFeeHandler.address, true);
    let tokenAFeeHandlerIsTokenA = await tokenManager.isTokenA(tokenAFeeHandler.address);
    console.log("tokenAFeeHandlerIsTokenA is:", tokenAFeeHandlerIsTokenA);
    // await tokenManager.addTokenAList(tokenAFeeHandler.address,true);


    const weth = await ethers.getContractFactory("WETH9");
    const WETH = await weth.deploy();

    const erc20 = await ethers.getContractFactory("SmartERC20");
    const WETHPartner = await erc20.deploy(expandTo18Decimals(10000));

    // deploy V2
    const v2factory = await ethers.getContractFactory("BananaSwapFactory");
    // usdtFeeHandle
		const usdtFeeFactory = await ethers.getContractFactory("USDTFeeHandle");
		const usdtFeeHandle = await usdtFeeFactory.deploy();
    const factoryV2 = await v2factory.deploy(wallet.address,tokenManager.address,usdtFeeHandle.address);

    const routerEmit = await ethers.getContractFactory("RouterEventEmitter");

    const RouterEmit = await routerEmit.deploy();

    // const BananaSwapPair = await ethers.getContractFactory("BananaSwapPair");
    const codeHashOfPair = await factoryV2.PAIR_HASH();
    console.log("codeHashOfPair is:", codeHashOfPair);
    // deploy routers
    const router = await ethers.getContractFactory("BananaSwap");
    
    const router02 = await router.deploy();
    await router02.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
    const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
    await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await router02.setBananaQuery(routerQuery4Swap.address);
    // await router02.setTokenManager(tokenManager.address);
    // initialize V2
    await factoryV2.createPair(tokenAFeeHandler.address, tokenB.address);
    console.log("tokenAFeeHandler.address is ================", tokenAFeeHandler.address, tokenB.address);
    const pairAddress = await factoryV2.getPair(tokenAFeeHandler.address, tokenB.address);
    const pairFactory = await ethers.getContractFactory("BananaSwapPair");
    const pair = new Contract(
      pairAddress,
      pairFactory.interface,
      provider
    ).connect(wallet);

    const token0Address = await pair.token0();
    const token0 = tokenAFeeHandler.address === token0Address ? tokenAFeeHandler : tokenB;
    const token1 = tokenAFeeHandler.address === token0Address ? tokenB : tokenAFeeHandler;

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

    await tokenManager.addRouter(router02.address,true);
    await tokenManager.addRouter(wallet.address,true);

    return {
      token0,
      token1,
      WETH,
      WETHPartner,
      factoryV2,
      router02,
      pair,
      RouterEmit,
      wallet,
      wethPair,
      provider,
      tokenAFeeHandler,
      tokenB,
    };
  }

  describe("swapExactTokenAForTokens", () => {
    const tokenAAmount = expandTo18Decimals(5);
    const tokenBAmount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const expectedOutputAmount = BigNumber.from("1662497915624478906");
    it("test reduce fee", async () => {
      const { router02, wallet, pair, tokenAFeeHandler, tokenB } = await loadFixture(
        v2Fixture
      );
      // before each 
      await tokenAFeeHandler.transfer(pair.address, tokenAAmount);
      await tokenB.transfer(pair.address, tokenBAmount);
      await pair.mint(wallet.address);
      await tokenAFeeHandler.approve(router02.address, ethers.constants.MaxUint256);
      await tokenAFeeHandler.addWeList([BLACK_HOLE]);
      let balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      let reserve = await pair.getReserves();
      const rewardFeeRatio = 2000;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: BLACK_HOLE, needHandle: false };
      let actionType = 5;
      let feeType = 9;
      await tokenAFeeHandler.setFeeConfig(actionType, feeType, nodeRewardFeeConfig, true);
      await router02.swapExactTokensForTokens(
          swapAmount,
          0,
          [tokenAFeeHandler.address, tokenB.address],
          wallet.address,
          ethers.constants.MaxUint256
        )
      // const feeConfig = await tokenAFeeHandler.getSellFeeConfigMap(16);
      await tokenAFeeHandler.addWeList([wallet.address]);
      const feeConfig = await tokenAFeeHandler.getFeeConfig(actionType, feeType);
      balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      expect(balanceOfBlackHole).eq(swapAmount.mul(feeConfig.feeRatio).div(10000));
      reserve = await pair.getReserves();
      let reserveTokenA = tokenAIsToken0(tokenAFeeHandler.address,tokenB.address) ? reserve._reserve0:reserve._reserve1;
      expect(reserveTokenA).eq(swapAmount.mul((BigNumber.from(10000).sub(feeConfig.feeRatio))).div(10000).add(tokenAAmount));
    });

    it("test no reduce fee because white list", async () => {
      const { router02, wallet, pair, tokenAFeeHandler, tokenB } = await loadFixture(
        v2Fixture
      );
      // before each 
      await tokenAFeeHandler.transfer(pair.address, tokenAAmount);
      await tokenB.transfer(pair.address, tokenBAmount);
      await pair.mint(wallet.address);
      await tokenAFeeHandler.approve(router02.address, ethers.constants.MaxUint256);
      await tokenAFeeHandler.addWeList([BLACK_HOLE]);
      let balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      let reserve = await pair.getReserves();
      const rewardFeeRatio = 2000;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: BLACK_HOLE, needHandle: false };
      let actionType = 5;
      let feeType = 9;
      await tokenAFeeHandler.setFeeConfig(actionType, feeType, nodeRewardFeeConfig, true);
      await router02.swapExactTokensForTokens(
          swapAmount,
          0,
          [tokenAFeeHandler.address, tokenB.address],
          wallet.address,
          ethers.constants.MaxUint256
        )
      // const feeConfig = await tokenAFeeHandler.getSellFeeConfigMap(16);
      await tokenAFeeHandler.addWeList([wallet.address]);
      const feeConfig = await tokenAFeeHandler.getFeeConfig(actionType, feeType);
      balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      expect(balanceOfBlackHole).eq(swapAmount.mul(feeConfig.feeRatio).div(10000));
      reserve = await pair.getReserves();
      let reserveTokenA = tokenAIsToken0(tokenAFeeHandler.address,tokenB.address) ? reserve._reserve0:reserve._reserve1;
      expect(reserveTokenA).eq(swapAmount.mul((BigNumber.from(10000).sub(feeConfig.feeRatio))).div(10000).add(tokenAAmount));
    });

    it("test reduce threshold", async () => {
      const { router02, wallet, pair, tokenAFeeHandler, tokenB } = await loadFixture(
        v2Fixture
      );
      // before each 
      await tokenAFeeHandler.transfer(pair.address, tokenAAmount);
      await tokenB.transfer(pair.address, tokenBAmount);
      await pair.mint(wallet.address);
      tokenAFeeHandler.setReduceThreshold(expandTo18Decimals(5));
      await tokenAFeeHandler.approve(router02.address, ethers.constants.MaxUint256);
      let balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      let reserve = await pair.getReserves();
      const rewardFeeRatio = 2000;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: BLACK_HOLE, needHandle: false };
      let actionType = 5;
      let feeType = 9;
      await tokenAFeeHandler.setFeeConfig(actionType, feeType, nodeRewardFeeConfig, true);
      await router02.swapExactTokensForTokens(
          swapAmount,
          0,
          [tokenAFeeHandler.address, tokenB.address],
          wallet.address,
          ethers.constants.MaxUint256
      )
      // const feeConfig = await tokenAFeeHandler.getSellFeeConfigMap(16);

      const feeConfig = await tokenAFeeHandler.getFeeConfig(actionType, feeType);
      balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      expect(balanceOfBlackHole).eq(0);
      reserve = await pair.getReserves();
      let reserveTokenA = tokenAIsToken0(tokenAFeeHandler.address,tokenB.address) ? reserve._reserve0:reserve._reserve1;
      expect(reserveTokenA).eq(swapAmount.add(tokenAAmount));
      await router02.swapExactTokensForTokens(
        swapAmount,
        0,
        [tokenAFeeHandler.address, tokenB.address],
        wallet.address,
        ethers.constants.MaxUint256
      );
      balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      expect(balanceOfBlackHole).eq(swapAmount.mul(rewardFeeRatio).div(10000));
    });
  });


  describe("swapTokensForExactTokens", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const expectedSwapAmount = BigNumber.from("557227237267357629");
    const outputAmount = expandTo18Decimals(1);

    it("swap with reduceRatio(9) fee", async () => {
      const { router02, token0, token1, wallet, pair, tokenAFeeHandler, tokenB } = await loadFixture(
        v2Fixture
      );

      // before each
      await tokenAFeeHandler.transfer(pair.address, token0Amount);
      await tokenB.transfer(pair.address, token1Amount);
      await pair.mint(wallet.address);

      await tokenAFeeHandler.approve(router02.address, ethers.constants.MaxUint256);

      let balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      let reserve = await pair.getReserves();

      const rewardFeeRatio = 2000;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: BLACK_HOLE, needHandle: false };
      let actionType = 5;
      let feeType = 9;
      await tokenAFeeHandler.setFeeConfig(actionType, feeType, nodeRewardFeeConfig, true);
      await router02.swapTokensForExactTokens(
        outputAmount,
        ethers.constants.MaxUint256,
        [tokenAFeeHandler.address, tokenB.address],
        wallet.address,
        ethers.constants.MaxUint256
      )

      const feeConfig = await tokenAFeeHandler.getFeeConfig(actionType, feeType);
      balanceOfBlackHole = await tokenAFeeHandler.balanceOf(BLACK_HOLE);
      console.log("balanceOfBlackHole is:++++++++++", balanceOfBlackHole.toString());
      expect(balanceOfBlackHole).eq(expectedSwapAmount.mul(feeConfig.feeRatio).div(10000));
      console.log("(feeConfig.feeRatio:------------", feeConfig.feeRatio);
      reserve = await pair.getReserves();
      // expect(reserve._reserve0).eq(expectedSwapAmount.mul((BigNumber.from(10000).sub(feeConfig.feeRatio))).div(10000).add(token0Amount));

      let reserveTokenA = tokenAIsToken0(tokenAFeeHandler.address,tokenB.address) ? reserve._reserve0:reserve._reserve1;
      expect(reserveTokenA).eq(expectedSwapAmount.sub(balanceOfBlackHole).add(token0Amount));
      console.log("_reserve0,_reserve1,_blockTimestampLast is-------------", reserve._reserve0.toString(), reserve._reserve1.toString(), reserve._blockTimestampLast.toString());
    });
  })
});
