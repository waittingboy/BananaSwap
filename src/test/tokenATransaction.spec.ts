
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { MockProvider } from "ethereum-waffle";
import { ethers, upgrades, waffle } from "hardhat";
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import {
  expandTo18Decimals,
  getApprovalDigest,
  MINIMUM_LIQUIDITY,
  setNextBlockTime,
} from "./shared/utilities";
import { expect } from "chai";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { MyERC20 } from "../types/MyERC20";
import { BananaSwap4B, TokenManager } from "../types";
const overrides = {
  gasLimit: 9999999
}
const baseRatio = 10000;

let owner: { address: string; }, one: { address: string; }, two: { address: string; }, three: { address: string; }, four: { address: string; }, feeToSetter: { address: string; }
let V2ERC201: MyERC20, V2ERC202: MyERC20;
describe("tokenATransaction", () => {
  before(async function () {
    this.signers = await ethers.getSigners();
    owner = this.signers[0];
    one = this.signers[1];
    two = this.signers[2];
    three = this.signers[3];
    four = this.signers[4];
    feeToSetter = this.signers[5];

    V2ERC201 = await (await ethers.getContractFactory("MyERC20")).deploy();
    V2ERC202 = await (await ethers.getContractFactory("MyERC20")).deploy();
  });
  const loadFixture = waffle.createFixtureLoader(
    waffle.provider.getWallets(),
    waffle.provider
  );
  async function v2Fixture([wallet, user]: Wallet[], provider: MockProvider) {
    const token = await ethers.getContractFactory("SmartERC20");
    const tokenAFeeHandler = await ethers.getContractFactory("BananaSwapToken");
    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await TokenManager.deploy();
    const bToken = await (await ethers.getContractFactory("BananaToken")).deploy();

    // deploy tokens
    let mintAmount = expandTo18Decimals(1000000000000);
    const tokenA = await tokenAFeeHandler.deploy();
    await tokenA.initialize("tokenA token", "tokenA",[10000],[wallet.address],mintAmount);
    // await tokenA.born(wallet.address, mintAmount);
    const tokenB = await tokenAFeeHandler.deploy();
    await tokenB.initialize("tokenB token", "tokenB",[10000],[wallet.address],mintAmount);
    // await tokenB.born(wallet.address, mintAmount);
    const tokenC = await tokenAFeeHandler.deploy();
    await tokenC.initialize("tokenC token", "tokenC",[10000],[wallet.address],mintAmount);
    // await tokenC.born(wallet.address, mintAmount);
    await bToken.initialize("tb token", "tb");
    await bToken.mint(wallet.address, mintAmount);


    const tokenBB = await token.deploy(expandTo18Decimals(10000));
    const usdt = await token.deploy(expandTo18Decimals(10000));

    const weth = await ethers.getContractFactory("WETH9");
    const WETH = await weth.deploy();

    const erc20 = await ethers.getContractFactory("SmartERC20");
    const WETHPartner = await erc20.deploy(expandTo18Decimals(10000));

    const usdtFeeHandle = await (await ethers.getContractFactory("USDTFeeHandle")).deploy();
    // deploy V2
    const v2factory = await ethers.getContractFactory("BananaSwapFactory");
    const factoryV2 = await v2factory.deploy(feeToSetter.address, tokenManager.address, usdtFeeHandle.address);

    await tokenManager.initialize(tokenBB.address, usdt.address);
    await tokenManager.addUsdtList(usdt.address, true);

    const bananaLiquid = await (await ethers.getContractFactory("BananaLiquid")).deploy();
    const BananaSwap = await ethers.getContractFactory("BananaSwap");
    const bananaSwap = await BananaSwap.deploy();

    await tokenManager.addRouter(bananaLiquid.address,true);
    await tokenManager.addRouter(bananaSwap.address,true);
    const bananaSwap4B = await (await ethers.getContractFactory("BananaSwap4B")).deploy();
    const FeeHandler = await ethers.getContractFactory("FeeHandler");
    const feeHandler = await FeeHandler.deploy();
    const bTokenPool = await (await ethers.getContractFactory("TokenBPool")).deploy();
    const bananaQuery4Swap = await (await ethers.getContractFactory("BananaQuery4Swap")).deploy();
    const reflowFeeHandler = await (await ethers.getContractFactory("ReflowFeeHandler")).deploy();
    const repurchaseDestroyFeeHandler = await (await ethers.getContractFactory("RepurchaseDestroyFeeHandler")).deploy();
    // deploy routers
    // const router = await ethers.getContractFactory("BananaSwapV2Router");
    // const router02 = await router.deploy();
   
    // await delegator.initialize(tokenManager.address, router02.address, factoryV2.address, WETH.address);
    // await router02.initialize(factoryV2.address, WETH.address, tokenManager.address, delegator.address);
    await bananaLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await bananaSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, feeHandler.address);
    await bTokenPool.initialize(usdt.address, bToken.address, bToken.address, factoryV2.address, bananaSwap4B.address);
    await bananaSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await bananaSwap4B.setPairB(bTokenPool.address);
    await usdtFeeHandle.initialize(usdt.address, bToken.address, bTokenPool.address);
    await bananaQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address);
    await bananaSwap.setBananaQuery(bananaQuery4Swap.address);
    await bananaSwap.setUsdtFeeHandle(usdtFeeHandle.address);
    await repurchaseDestroyFeeHandler.initialize(usdt.address, bananaSwap.address, BigNumber.from("0"), bToken.address);
    // initialize V2
    await factoryV2.createPair(tokenA.address, tokenB.address);
    const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address);
    const pairFactory = await ethers.getContractFactory("BananaSwapPair");
    const pair = new Contract(
      pairAddress,
      pairFactory.interface,
      provider
    ).connect(wallet);

    await factoryV2.createPair(V2ERC201.address, V2ERC202.address);
    const pairAddressERC20 = await factoryV2.getPair(V2ERC201.address, V2ERC202.address);
    const pairERC20 = new Contract(
      pairAddressERC20,
      pairFactory.interface,
      provider
    ).connect(wallet);

    const token0Address = await pair.token0();
    const token0 = tokenA.address === token0Address ? tokenA : tokenB;
    let token1 = tokenA.address === token0Address ? tokenB : tokenA;

    await factoryV2.createPair(token1.address, tokenC.address);
    const pairAddressC = await factoryV2.getPair(token1.address, tokenC.address);
    const pairC = new Contract(
      pairAddressC,
      pairFactory.interface,
      provider
    ).connect(wallet);
    const token2 =  tokenC;

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

    await factoryV2.createPair(bToken.address, tokenA.address);
    const BPairAddress = await factoryV2.getPair(bToken.address, tokenA.address);
    const BPair = new Contract(
      BPairAddress,
      pairFactory.interface,
      provider
    ).connect(wallet);
    await factoryV2.createPair(usdt.address, token0.address);
    const usdtPairAddress = await factoryV2.getPair(usdt.address, token0.address);
    const usdtPair = new Contract(
      usdtPairAddress,
      pairFactory.interface,
      provider
    ).connect(wallet);
    const usdtPairAddress1 = await factoryV2.getPair(usdt.address, token1.address);
    const usdtPair1 = new Contract(
      usdtPairAddress1,
      pairFactory.interface,
      provider
    ).connect(wallet);

    return {
      token0,
      token1,
      WETH,
      WETHPartner,
      factoryV2,
      pair,
      wallet,
      user,
      wethPair,
      provider,
      tokenManager,
      feeHandler,
      pairERC20,
      token2,
      pairC,
      pairFactory,
      bananaLiquid,
      BPair,
      bananaSwap,
      bananaQuery4Swap,
      usdt,
      bToken,
      usdtPair,
      usdtPair1,
      reflowFeeHandler,
      repurchaseDestroyFeeHandler,
      usdtFeeHandle,
      bTokenPool,
      bananaSwap4B
    };
  }
  describe("swapExactTokensForTokens", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("996900609009281774");

    it("swapExactTokensForTokens with erc20", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, pairERC20, bananaQuery4Swap } = await loadFixture(
        v2Fixture
      );
      console.log("your codehash:",await factoryV2.PAIR_HASH());
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      await V2ERC201.init(wallet.address, MaxAmount);
      await V2ERC202.init(wallet.address, token1Amount);
      await V2ERC201.approve(bananaLiquid.address, MaxAmount);
      await V2ERC202.approve(bananaLiquid.address, MaxAmount);
      await expect(bananaLiquid.addLiquidity(
        V2ERC201.address,
        V2ERC202.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )).to.emit(V2ERC201, "Transfer")
        .withArgs(wallet.address, pairERC20.address, token0Amount)
        .to.emit(V2ERC202, "Transfer")
        .withArgs(wallet.address, pairERC20.address, token1Amount)

      // console.log("old V2ERC201:",await V2ERC201.balanceOf(wallet.address));
      // console.log("old V2ERC202:",await V2ERC202.balanceOf(wallet.address));
      await V2ERC201.approve(bananaSwap.address, MaxAmount);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [V2ERC201.address, V2ERC202.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      //   console.log("old V2ERC201:",await V2ERC201.balanceOf(wallet.address));
      //   console.log("old V2ERC202:",await V2ERC202.balanceOf(wallet.address));

      //   console.log("old V2ERC201:",await V2ERC201.balanceOf(wallet.address));
      // console.log("old V2ERC202:",await V2ERC202.balanceOf(wallet.address));

      await bananaSwap.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [V2ERC201.address, V2ERC202.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      //   console.log("old V2ERC201:",await V2ERC201.balanceOf(wallet.address));
      // console.log("old V2ERC202:",await V2ERC202.balanceOf(wallet.address));

    });
    it("swapExactTokensForTokens whit tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      tokenManager.addTokenAList(token0.address, true);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // console.log("new token0 pair:", await token0.balanceOf(pair.address));
      // console.log("new token1 pair:", await token1.balanceOf(pair.address));
      // token0.born(wallet.address, MaxAmount)
      token0.approve(bananaSwap.address, MaxAmount);


      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));

    });
    it.skip("swapExactTokensForTokens whit tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      tokenManager.addTokenAList(token0.address, true);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      console.log("new token0 pair:", await token0.balanceOf(pair.address));
      console.log("new token1 pair:", await token1.balanceOf(pair.address));
      console.log("new address pair:", pair.address);

      token0.approve(bananaSwap.address, MaxAmount);

      actionType = 1; //sell
      rewardFeeRatio = 1000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      console.log("old in", await token0.balanceOf(wallet.address));
      console.log("old out", await token1.balanceOf(wallet.address));
      console.log("swapAmount:",swapAmount);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )

      console.log("new in", await token0.balanceOf(wallet.address));
      console.log("new out", await token1.balanceOf(wallet.address));

    });
    it("swapExactTokensForTokens BlackWhit white for tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      // token0.born(wallet.address, MaxAmount)
      token0.approve(bananaSwap.address, MaxAmount);
      tokenManager.addTokenAList(token0.address, true);
      let blackAddress = [wallet.address]
      await token0.addBkList(blackAddress);
      await expect(bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )).to.be.revertedWith("address in bl");
      await token0.removeBkList(wallet.address);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      let whiteAddress = [wallet.address];
      await token0.addWeList(whiteAddress);
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));

    });

    it("swapExactTokensForTokens whit tokenA to tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // await token0.born(wallet.address, MaxAmount)
      await token0.approve(bananaSwap.address, MaxAmount);

      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);

      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));

      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));
    });
    it("swapExactTokensForTokens whit tokenAFee to tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      await token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);

      // await token0.born(wallet.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      // console.log("old pair:", await token0.balanceOf(pair.address));
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      rewardType = 0;
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));
      // console.log("new pair:", await token0.balanceOf(pair.address));
    });
    it("swapExactTokensForTokens white tokenAFee to tokenAFee for sellDestroy", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      await token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);

      // await token0.born(wallet.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      // console.log("old pair:", await token0.balanceOf(pair.address));
      let actionType = 1; //sell
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      rewardType = 0;
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      rewardFeeRatio = 5000;
      actionType = 5  //处理pool池中销售回购功能,回扣流动性
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      rewardType = 9   //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await token0.setReduceThreshold(100000);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));
      // console.log("new pair:", await token0.balanceOf(pair.address));
    });
    it("swapExactTokensForTokens whit tokenAFee to tokenAFee to tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      // await token1.born(wallet.address, expandTo18Decimals(10000));
      await token2.approve(bananaLiquid.address, MaxAmount);

      await bananaLiquid.addLiquidity(
        token1.address,
        token2.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )

      await token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);
      await tokenManager.addTokenAList(token2.address, true);

      // await token0.born(wallet.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token2.balanceOf(wallet.address));
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      rewardType = 0;
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address, token2.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token2.balanceOf(wallet.address));
    });
    it("swapExactTokensForTokens whit tokenAFee to tokenA_buy_SellFee to tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      // await token1.born(wallet.address, expandTo18Decimals(10000));
      await token2.approve(bananaLiquid.address, MaxAmount);

      await bananaLiquid.addLiquidity(
        token1.address,
        token2.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )

      await token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);
      await tokenManager.addTokenAList(token2.address, true);

      // await token0.born(wallet.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token2.balanceOf(wallet.address));
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 1; //sell
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address, token2.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token2.balanceOf(wallet.address));
    });
    it("swapExactTokensForTokens whit tokenAFee to tokenA_buy_SellFee to tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);

      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      // await token1.born(wallet.address, expandTo18Decimals(10000));
      await token2.approve(bananaLiquid.address, MaxAmount);

      await bananaLiquid.addLiquidity(
        token1.address,
        token2.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )

      await token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenAList(token1.address, true);
      await tokenManager.addTokenAList(token2.address, true);

      // await token0.born(wallet.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token2.balanceOf(wallet.address));
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 1; //sell
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      actionType = 0; //buy
      await token2.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, token1.address, token2.address],
        wallet.address,
        ethers.constants.MaxUint256
      )

      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token2.balanceOf(wallet.address));
    });
  });

  describe("swapExactTokensForTokens with usdt", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("996900609009281774");
    it.skip("swapExactTokensForTokens with usdt to tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair } = await loadFixture(
        v2Fixture
      );
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      await token0.approve(bananaLiquid.address, MaxAmount);
      await usdt.approve(bananaLiquid.address, MaxAmount);
      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;  //节点奖励
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      rewardFeeRatio = 1000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      rewardType = 5;  //回流铸池
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await expect(
        bananaLiquid.addLiquidity(
          token0.address,
          usdt.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          ethers.constants.MaxUint256
        )
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, usdtPair.address, token0Amount)
        .to.emit(usdt, "Transfer")
        .withArgs(wallet.address, usdtPair.address, token1Amount)
      // console.log("new token0 pair", await token0.balanceOf(usdtPair.address));
      // console.log("new token1 pair", await usdt.balanceOf(usdtPair.address));

      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
    });
    it("swapExactTokensForTokens with tokenAFee to usdtFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair, bananaSwap4B } = await loadFixture(
        v2Fixture
      );
      console.log("your pair:",await factoryV2.PAIR_HASH());
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      await token0.approve(bananaLiquid.address, MaxAmount);
      await usdt.approve(bananaLiquid.address, MaxAmount);
      await token1.approve(bananaLiquid.address, MaxAmount);
      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;  //节点奖励
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      //token0回流铸池
      actionType = 1;
      reflowFeeHandler.initialize(usdt.address, bananaSwap.address, bananaLiquid.address, 10000);
      rewardFeeRatio = 1000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: reflowFeeHandler.address, needHandle: true };
      rewardType = 5;  //回流铸池
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      let whiteAddress = [reflowFeeHandler.address];
      await token0.addWeList(whiteAddress);

      await bananaLiquid.addLiquidity(
        token0.address,
        usdt.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )
      //添加token0和btoken的流动性

      await usdt.approve(bananaSwap4B.address, MaxAmount);
      await bToken.approve(bananaSwap4B.address, MaxAmount);
      await bananaSwap4B.initLiquid(token0Amount, token1Amount);
      await bToken.setManager(usdtFeeHandle.address, true);

      // console.log("liquid:", await usdtPair.balanceOf(reflowFeeHandler.address));
      // console.log("bToken address:", bToken.address);
      let aFeeConfig = {
        feeRatio: 1000,
        fee4UserRatio: 9000,
        actionType: 1
      }
      await usdtFeeHandle.setAFeeConfig(token0.address, 1, aFeeConfig, true);

      await token0.approve(bananaSwap.address, MaxAmount);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await usdt.balanceOf(wallet.address));
      // console.log("old bToken out", await bToken.balanceOf(wallet.address));
      // console.log("old usdtFeeHand usdt out", await usdt.balanceOf(usdtFeeHandle.address));
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await usdt.balanceOf(wallet.address));
      // console.log("new bToken out", await bToken.balanceOf(wallet.address));
      // console.log("liquid:", await usdtPair.balanceOf(reflowFeeHandler.address));
      // console.log("new usdtfeehand usdt out", await usdt.balanceOf(usdtFeeHandle.address));
    });
    it("swapExactTokensForTokens with tokenAFee to usdtFee for reduceRatio", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair, bananaSwap4B } = await loadFixture(
        v2Fixture
      );
      // console.log(await factoryV2.PAIR_HASH());
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      await token0.approve(bananaLiquid.address, MaxAmount);
      await usdt.approve(bananaLiquid.address, MaxAmount);
      await token1.approve(bananaLiquid.address, MaxAmount);
      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;  //节点奖励
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      //token0卖出扣除滑点⼿续费后剩余销毁
      actionType = 5;    //5 处理pool池中销售回购功能,回扣流动性.
      rewardFeeRatio = 5000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dead", needHandle: false };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      await bananaLiquid.addLiquidity(
        token0.address,
        usdt.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )
      //添加token0和btoken的流动性


      await usdt.approve(bananaSwap4B.address, MaxAmount);
      await bToken.approve(bananaSwap4B.address, MaxAmount);
      await bananaSwap4B.initLiquid(token0Amount, token1Amount);
      await bToken.setManager(usdtFeeHandle.address, true);

      console.log("liquid:", await usdtPair.balanceOf(reflowFeeHandler.address));
      console.log("bToken address:", bToken.address);
      let aFeeConfig = {
        feeRatio: 1000,
        fee4UserRatio: 9000,
        actionType: 1
      }
      await usdtFeeHandle.setAFeeConfig(token0.address, 1, aFeeConfig, true);

      await token0.approve(bananaSwap.address, MaxAmount);
      await usdt.approve(bananaSwap.address, MaxAmount);
      console.log("old in", await token0.balanceOf(wallet.address));
      console.log("old out", await usdt.balanceOf(wallet.address));
      console.log("old bToken out", await bToken.balanceOf(wallet.address));
      console.log("old token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("old token1 feehand:", await token1.balanceOf(feeHandler.address));
      let oldBTokenAmount = await token0.balanceOf(wallet.address);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // expect(await bToken.balanceOf(wallet.address)).to.be.eq(oldBTokenAmount.add(BigNumber.from("9347167098971842800")));
      console.log("new in", await token0.balanceOf(wallet.address));
      console.log("new out", await usdt.balanceOf(wallet.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new token1 feehand:", await token1.balanceOf(feeHandler.address));

      //手续费为0
      rewardFeeRatio = 0;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: true };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));

      //设置阈值
      rewardFeeRatio = 5000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: true };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      token0.setReduceThreshold(expandTo18Decimals(100));
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));
    });
    it("swapExactTokensForTokens with usdtFee to tokenAFee for reduceRatio", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair, bananaSwap4B } = await loadFixture(
        v2Fixture
      );
      // console.log(await factoryV2.PAIR_HASH());
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      await token0.approve(bananaLiquid.address, MaxAmount);
      await usdt.approve(bananaLiquid.address, MaxAmount);
      await token1.approve(bananaLiquid.address, MaxAmount);
      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;  //节点奖励
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      //token0卖出扣除滑点⼿续费后剩余销毁
      actionType = 5;    //5 处理pool池中销售回购功能,回扣流动性.
      rewardFeeRatio = 5000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: "0x000000000000000000000000000000000000dead", needHandle: false };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      await bananaLiquid.addLiquidity(
        token0.address,
        usdt.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )
      //添加token0和btoken的流动性


      await usdt.approve(bananaSwap4B.address, MaxAmount);
      await bToken.approve(bananaSwap4B.address, MaxAmount);
      await bananaSwap4B.initLiquid(token0Amount, token1Amount);
      await bToken.setManager(usdtFeeHandle.address, true);

      console.log("liquid:", await usdtPair.balanceOf(reflowFeeHandler.address));
      console.log("bToken address:", bToken.address);
      let aFeeConfig = {
        feeRatio: 1000,
        fee4UserRatio: 9000,
        actionType: 1
      }
      await usdtFeeHandle.setAFeeConfig(token0.address, 1, aFeeConfig, true);

      await token0.approve(bananaSwap.address, MaxAmount);
      await usdt.approve(bananaSwap.address, MaxAmount);
      console.log("old in", await token0.balanceOf(wallet.address));
      console.log("old out", await usdt.balanceOf(wallet.address));
      console.log("old bToken out", await bToken.balanceOf(wallet.address));
      console.log("old token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("old token1 feehand:", await token1.balanceOf(feeHandler.address));
      let oldBTokenAmount = await token0.balanceOf(wallet.address);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // expect(await bToken.balanceOf(wallet.address)).to.be.eq(oldBTokenAmount.add(BigNumber.from("9347167098971842800")));
      console.log("new in", await token0.balanceOf(wallet.address));
      console.log("new out", await usdt.balanceOf(wallet.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new token1 feehand:", await token1.balanceOf(feeHandler.address));

      //手续费为0
      rewardFeeRatio = 0;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: true };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));

      //设置阈值
      rewardFeeRatio = 5000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: true };
      rewardType = 9;  //卖出扣除滑点⼿续费后剩余销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      token0.setReduceThreshold(expandTo18Decimals(100));
      await bananaSwap.swapExactTokensForTokens(
        swapAmount,
        0,
        [token0.address, usdt.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      console.log("new token0 feehand:", await token0.balanceOf(feeHandler.address));
      console.log("new bToken out", await bToken.balanceOf(wallet.address));
    });
  });

  describe("swapTokensForExactTokens", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("1662497915624478906");
    it("swapTokensForExactTokens whit tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // token0.born(wallet.address, token0Amount)
      token0.approve(bananaSwap.address, MaxAmount);
      tokenManager.addTokenAList(token0.address, true);

      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));

      /* await expect(
        delegator.swapTokensForExactTokens(
          swapAmount,
          MaxAmount,
          [token1.address, token0.address],
          wallet.address,
          ethers.constants.MaxUint256
        )).to.be.revertedWith("tokenAPool is not exist");
      
        tokenManager.addTokenAPoolList(token1.address,tokenAPool.address,true);
      await expect(delegator.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [token1.address, token0.address],
        wallet.address,
        ethers.constants.MaxUint256
      )).to.be.revertedWith("openBaseListBuy is not open");  */

    });
    it("swapTokensForExactTokens BlackWhit white for tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)
      // token0.born(wallet.address, MaxAmount)
      token0.approve(bananaSwap.address, MaxAmount);
      await tokenManager.addTokenAList(token0.address, true);
      let blackAddress = [wallet.address];
      await token0.addBkList(blackAddress);
      await expect(bananaSwap.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )).to.be.revertedWith("address in bl");
      await token0.removeBkList(wallet.address);

      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      let whiteAddress = [wallet.address]
      await token0.addWeList(whiteAddress);
      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      await bananaSwap.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256

      )
      // console.log("new in", await token0.balanceOf(wallet.address));
      // console.log("new out", await token1.balanceOf(wallet.address));

    });
    it("swapTokensForExactTokens whit tokenA to tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // token0.born(wallet.address, token0Amount)
      token0.approve(bananaSwap.address, MaxAmount);
      tokenManager.addTokenAList(token0.address, true);

      let actionType = 1; //sell
      const rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
      await bananaSwap.swapTokensForExactTokens(
        swapAmount,
        MaxAmount,
        [token0.address, token1.address],
        wallet.address,
        ethers.constants.MaxUint256
      )
      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));
    });

  });

  describe("addLiquidity and removeLiquidity", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("1662497915624478906");
    it("addLiquidity token", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, pairERC20, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      await V2ERC201.init(wallet.address, token0Amount);
      await V2ERC202.init(wallet.address, token1Amount);
      await V2ERC201.approve(bananaLiquid.address, MaxAmount);
      await V2ERC202.approve(bananaLiquid.address, MaxAmount);

      // console.log('old Liquidity:', await pairERC20.balanceOf(wallet.address));
      await bananaLiquid.addLiquidity(
        V2ERC201.address,
        V2ERC202.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )

      // console.log('new Liquidity:', await pairERC20.balanceOf(wallet.address));
      let liquid = await pairERC20.balanceOf(wallet.address);
      await pairERC20.approve(bananaLiquid.address, liquid);
      await bananaLiquid.removeLiquidity(
        V2ERC201.address,
        V2ERC202.address,
        liquid,
        0, 0, wallet.address, ethers.constants.MaxUint256
      )
      // console.log('new Liquidity:', await pairERC20.balanceOf(wallet.address));
    });
    it("addLiquidity tokenA", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, pairERC20, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      tokenManager.addTokenAList(token0.address, true);
      tokenManager.addTokenAList(token1.address, true);
      // console.log("oldA:", await token0.balanceOf(wallet.address));
      // console.log("oldB:", await token1.balanceOf(wallet.address));
      // console.log('old Liquidity:', await pair.balanceOf(wallet.address));
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // console.log('new Liquidity:', await pair.balanceOf(wallet.address));
      // console.log("newA:", await token0.balanceOf(wallet.address));
      // console.log("newB:", await token1.balanceOf(wallet.address));

      let liquid = await pair.balanceOf(wallet.address);
      await pair.approve(bananaLiquid.address, liquid);
      await bananaLiquid.removeLiquidity(
        token0.address,
        token1.address,
        liquid,
        0, 0, wallet.address, ethers.constants.MaxUint256
      )
      // console.log('new Liquidity:', await pair.balanceOf(wallet.address));
      // console.log("newA:", await token0.balanceOf(wallet.address));
      // console.log("newB:", await token1.balanceOf(wallet.address));
    });
    it("addLiquidity tokenA with blackwhite", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, pairERC20, token2, pairC } = await loadFixture(
        v2Fixture
      );
      const token0Amount = expandTo18Decimals(10000);
      const token1Amount = expandTo18Decimals(10000);
      token0.approve(bananaLiquid.address, MaxAmount);
      token1.approve(bananaLiquid.address, MaxAmount);
      tokenManager.addTokenAList(token0.address, true);
      tokenManager.addTokenAList(token1.address, true);
      let blockAddress = [wallet.address];
      await token1.addBkList(blockAddress);
      await expect(
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
      ).to.be.revertedWith("in blacklist");

      token1.removeBkList(wallet.address);
      // console.log("oldA:", await token0.balanceOf(wallet.address));
      // console.log("oldB:", await token1.balanceOf(wallet.address));
      // console.log('old Liquidity:', await pair.balanceOf(wallet.address));
      await expect(
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
      )
        .to.emit(token0, "Transfer")
        .withArgs(wallet.address, pair.address, token0Amount)
        .to.emit(token1, "Transfer")
        .withArgs(wallet.address, pair.address, token1Amount)

      // console.log('new Liquidity:', await pair.balanceOf(wallet.address));
      // console.log("newA:", await token0.balanceOf(wallet.address));
      // console.log("newB:", await token1.balanceOf(wallet.address));

      let liquid = await pair.balanceOf(wallet.address);
      await pair.approve(bananaLiquid.address, liquid);
      await bananaLiquid.removeLiquidity(
        token0.address,
        token1.address,
        liquid,
        0, 0, wallet.address, ethers.constants.MaxUint256
      )
      // console.log('new Liquidity:', await pair.balanceOf(wallet.address));
      // console.log("newA:", await token0.balanceOf(wallet.address));
      // console.log("newB:", await token1.balanceOf(wallet.address));
    });
    it("addLiquidity with usdtFee to tokenAFee", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1 } = await loadFixture(
        v2Fixture
      );
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      await token0.approve(bananaLiquid.address, MaxAmount);
      await usdt.approve(bananaLiquid.address, MaxAmount);
      await token1.approve(bananaLiquid.address, MaxAmount);
      let actionType = 2; //AddLiquid
      let rewardFeeRatio = 500;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;  //节点奖励
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      repurchaseDestroyFeeHandler.setPurchaseToken(token1.address);
      await bananaLiquid.addLiquidity(
        token1.address,
        usdt.address,
        token0Amount,
        token1Amount,
        0,
        0,
        wallet.address,
        ethers.constants.MaxUint256
      )
      await expect(
        bananaLiquid.addLiquidity(
          token0.address,
          usdt.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          ethers.constants.MaxUint256
        )
      )
        // .to.emit(token0, "Transfer")
        // .withArgs(wallet.address, usdtPair.address, token0Amount)
        // .to.emit(usdt, "Transfer")
        // .withArgs(wallet.address, usdtPair.address, token1Amount)
      // console.log("new token0 pair", await token0.balanceOf(usdtPair.address));
      // console.log("new token1 pair", await usdt.balanceOf(usdtPair.address));
      // console.log("new token0 feeHandler", await token0.balanceOf(feeHandler.address));


      // console.log("old in", await token0.balanceOf(wallet.address));
      // console.log("old out", await token1.balanceOf(wallet.address));

      //token0回购销毁
      reflowFeeHandler.initialize(usdt.address, bananaSwap.address, bananaLiquid.address, 10000);
      rewardFeeRatio = 1000;
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: repurchaseDestroyFeeHandler.address, needHandle: true };
      rewardType = 8;  //回购销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      let whiteAddress = [repurchaseDestroyFeeHandler.address];
      await token0.addWeList(whiteAddress);

      // console.log("old token1 ead", await token1.balanceOf(usdt.address));
      await
        bananaLiquid.addLiquidity(
          token0.address,
          usdt.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          ethers.constants.MaxUint256
        )
      // console.log("new token1 ead", await token1.balanceOf("0x000000000000000000000000000000000000dEaD"));
      tokenManager.addTokenAList(token1.address, true);
      //token1买入回购销毁
      actionType = 0
      rewardFeeRatio = 1000;
      // reflowFeeHandler.initialize(usdt.address,bananaSwap.address,bananaLiquid.address,10000);
      nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: repurchaseDestroyFeeHandler.address, needHandle: true };
      rewardType = 8;  //回购销毁
      await token1.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      whiteAddress = [repurchaseDestroyFeeHandler.address];
      await token1.addWeList(whiteAddress);
      // console.log("tokena1:", token1.address);
      // console.log(repurchaseDestroyFeeHandler.address);
      await
        bananaLiquid.addLiquidity(
          token0.address,
          usdt.address,
          token0Amount,
          token1Amount,
          0,
          0,
          wallet.address,
          ethers.constants.MaxUint256
        )
      // console.log(repurchaseDestroyFeeHandler.address);
      // console.log("new token1 ead", await token1.balanceOf("0x000000000000000000000000000000000000dEaD"));
    });
  });
  describe("addLiquidityETH and removeLiquidity", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("1662497915624478906");
    it("addLiquidityETH token", async () => {
      const {
        wallet,
        WETHPartner,
        WETH,
        tokenManager,
        token0,
        factoryV2,
        provider,
        pair,
        pairFactory,
        bananaLiquid,
        bananaSwap
      } = await loadFixture(v2Fixture);
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2);
      await token0.approve(bananaLiquid.address, MaxUint256);


      await factoryV2.createPair(WETH.address, token0.address);
      let WETHPairAddress = await factoryV2.getPair(
        WETH.address,
        token0.address
      );

      const wethPair = new Contract(
        WETHPairAddress,
        pairFactory.interface,
        provider
      ).connect(wallet);

      // console.log("old liquidity:", await wethPair.balanceOf(wallet.address));
      await token0.removeBkList(wallet.address);
      let whiteAddress = [wallet.address]
      await token0.addWeList(whiteAddress);
      await bananaLiquid.addLiquidityETH(
        token0.address,
        WETHPartnerAmount,
        WETHPartnerAmount,
        ETHAmount,
        wallet.address,
        MaxUint256,
        { ...overrides, value: ETHAmount }
      )
      // console.log("new liquidity:", await wethPair.balanceOf(wallet.address));

      let liquid = await wethPair.balanceOf(wallet.address);
      await wethPair.approve(bananaLiquid.address, liquid);
      //WETH.approve(delegator.address,MaxAmount);
      await bananaLiquid.removeLiquidityETH(
        token0.address,
        liquid,
        0, 0, wallet.address,
        MaxUint256
      )
      // console.log("new liquidity:", await wethPair.balanceOf(wallet.address));
    });
    it("addLiquidityETH tokenA", async () => {
      const {
        wallet,
        WETHPartner,
        WETH,
        tokenManager,
        token0,
        factoryV2,
        provider,
        pair,
        pairFactory,
        bananaLiquid,
        bananaSwap
      } = await loadFixture(v2Fixture);
      const WETHPartnerAmount = expandTo18Decimals(1)
      const ETHAmount = expandTo18Decimals(4)

      const expectedLiquidity = expandTo18Decimals(2);
      await token0.approve(bananaLiquid.address, MaxUint256);
      await tokenManager.addTokenAList(token0.address, true);
      let blackAddress = [wallet.address];
      await token0.addBkList(blackAddress);

      await expect(
        bananaLiquid.addLiquidityETH(
          token0.address,
          WETHPartnerAmount,
          WETHPartnerAmount,
          ETHAmount,
          wallet.address,
          MaxUint256,
          { ...overrides, value: ETHAmount }
        )).to.be.revertedWith("in black list");

      await factoryV2.createPair(WETH.address, token0.address);
      let WETHPairAddress = await factoryV2.getPair(
        WETH.address,
        token0.address
      );

      const wethPair = new Contract(
        WETHPairAddress,
        pairFactory.interface,
        provider
      ).connect(wallet);

      // console.log("old liquidity:", await wethPair.balanceOf(wallet.address));
      await token0.removeBkList(wallet.address);
      let whiteAddress = [wallet.address]
      await token0.addWeList(whiteAddress);
      await bananaLiquid.addLiquidityETH(
        token0.address,
        WETHPartnerAmount,
        WETHPartnerAmount,
        ETHAmount,
        wallet.address,
        MaxUint256,
        { ...overrides, value: ETHAmount }
      )
      // console.log("new liquidity:", await wethPair.balanceOf(wallet.address));

      let liquid = await wethPair.balanceOf(wallet.address);
      await wethPair.approve(bananaLiquid.address, liquid);
      //WETH.approve(delegator.address,MaxAmount);
      await bananaLiquid.removeLiquidityETH(
        token0.address,
        liquid,
        0, 0, wallet.address,
        MaxUint256
      )
      // console.log("new liquidity:", await wethPair.balanceOf(wallet.address));
    });
  });
  describe("TokenA to tokenB", async () => {
    it("addLiquidity tokenA  B", async () => {
      const {
        wallet,
        WETHPartner,
        WETH,
        tokenManager,
        token0,
        factoryV2,
        provider,
        pair,
        pairFactory,
        bananaLiquid,
        BPair,
        bananaSwap
      } = await loadFixture(v2Fixture);

    });
  });
  describe("Transfer", () => {
    const token0Amount = expandTo18Decimals(5);
    const token1Amount = expandTo18Decimals(10);
    const swapAmount = expandTo18Decimals(1);
    const MaxAmount = expandTo18Decimals(10000000);
    const expectedOutputAmount = BigNumber.from("9999999000000000000000");
    it("Transfer user to user:", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair } = await loadFixture(
        v2Fixture
      );
      // console.log(await factoryV2.PAIR_HASH());
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(9999);
      const token1Amount = expandTo18Decimals(100);

      // console.log("old token0 balanceOf wallet:", await token0.balanceOf(wallet.address));
      // console.log("old token0 balanceOf Amount:", token0Amount);
      // console.log("old token0 balanceOf:", await token0.balanceOf(one.address));
      // console.log("old token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
      await token0.setTransferPercent(0);
      await token0.approve(wallet.address, MaxAmount);
      await token0.transferFrom(wallet.address, one.address, token0Amount);
      // console.log("new token0 balanceOf wallet:", await token0.balanceOf(wallet.address));
      // console.log("new token0 balanceOf:", await token0.balanceOf(one.address));
      // console.log("new token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
    });
    it("Transfer with blackWhite userFee to user:", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair } = await loadFixture(
        v2Fixture
      );
      // console.log(await factoryV2.PAIR_HASH());
      //token0转账
      let actionType = 4
      let rewardFeeRatio = 1000;
      // reflowFeeHandler.initialize(usdt.address,bananaSwap.address,bananaLiquid.address,10000);
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 0;
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);

      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);

      // console.log("old token0 balanceOf wallet:", await token0.balanceOf(wallet.address));
      // console.log("old token0 balanceOf Amount:", token0Amount);
      // console.log("old token0 balanceOf one:", await token0.balanceOf(one.address));
      // console.log("old token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
      await token0.setTransferPercent(0);
      let Backlist = [wallet.address];
      await token0.addBkList(Backlist);
      await token0.approve(wallet.address, MaxAmount);
      await expect(token0.transferFrom(wallet.address, one.address, token0Amount)).to.be.revertedWith("is Bk");

      await token0.removeBkList(wallet.address);
      let whitelist =[wallet.address];
      await token0.addWeList(whitelist);      
      
      await token0.approve(wallet.address, MaxAmount);
      await token0.transferFrom(wallet.address, one.address, token0Amount);
      // console.log("new token0 balanceOf wallet:", await token0.balanceOf(wallet.address));
      // console.log("new token0 balanceOf one:", await token0.balanceOf(one.address));
      // console.log("new token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
    });
    it("Transfer user to userFee:", async () => {
      const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair } = await loadFixture(
        v2Fixture
      );
      // console.log(await factoryV2.PAIR_HASH());
      await tokenManager.addTokenAList(token0.address, true);
      await tokenManager.addTokenBList(bToken.address, true);
      await tokenManager.associateA2B(token0.address, bToken.address, true);
      const token0Amount = expandTo18Decimals(100);
      const token1Amount = expandTo18Decimals(100);
      let actionType = 4; //AddLiquid
      let rewardFeeRatio = 5000;
      let nodeRewardFeeConfig = { feeRatio: rewardFeeRatio, feeHandler: feeHandler.address, needHandle: false };
      let rewardType = 3;  //销毁
      await token0.setFeeConfig(actionType, rewardType, nodeRewardFeeConfig, true);
      // console.log("old token0 balanceOf:", await token0.balanceOf(one.address));
      // console.log("old token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
      await token0.approve(wallet.address, MaxAmount);
      await token0.transferFrom(wallet.address, one.address, token0Amount);
      // console.log("new token0 balanceOf:", await token0.balanceOf(one.address));
      // console.log("new token0 balanceOf feeHandler:", await token0.balanceOf(feeHandler.address));
    });
  });
  describe("getAmountsOut with getAmountsIn", () => {
    const MaxAmount = expandTo18Decimals(10000000);
      it("getAmountsOut:",async()=>{
        const { bananaLiquid, token0, token1, wallet, pair, bananaSwap, tokenManager, factoryV2, feeHandler, token2, pairC, usdt, bToken, usdtPair, reflowFeeHandler, repurchaseDestroyFeeHandler, usdtPair1, usdtFeeHandle, bTokenPool, WETH, BPair, bananaSwap4B } = await loadFixture(
          v2Fixture
        );     
        const token0Amount = expandTo18Decimals(1000);
        const token1Amount = expandTo18Decimals(1000);
        token0.approve(bananaLiquid.address, MaxAmount);
        token1.approve(bananaLiquid.address, MaxAmount);
  
        await expect(
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
        )
          .to.emit(token0, "Transfer")
          .withArgs(wallet.address, pair.address, token0Amount)
          .to.emit(token1, "Transfer")
          .withArgs(wallet.address, pair.address, token1Amount)
        let path=[token0.address,token1.address];
        let bananaQuery = await (await ethers.getContractFactory("BananaQuery")).deploy();
        await bananaQuery.initialize(factoryV2.address,WETH.address,tokenManager.address,usdtFeeHandle.address);
        let amounts=await bananaQuery.getAmountsOut(expandTo18Decimals(100),path);
        console.log(amounts[0],amounts[1]);
        amounts = await bananaQuery.getAmountsIn(BigNumber.from("90661089388014913158"),path);
        console.log(amounts[0],amounts[1]);
      });
  });
});

