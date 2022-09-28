import { expect } from "chai";
import { BigNumber, constants as ethconst, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
const { time } = require("./shared")

import {
  expandTo18Decimals,
  encodePrice,
  setNextBlockTime,
} from "./shared/utilities";
import { BananaSwapPair, SmartERC20 } from "../types";
import { MockProvider } from "@ethereum-waffle/provider";
import { log } from "util";

const MINIMUM_LIQUIDITY = BigNumber.from(10).pow(3);

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

describe("LPTimeLock", () => {
  const loadFixture = waffle.createFixtureLoader(
    waffle.provider.getWallets(),
    waffle.provider
  );

  async function fixture([wallet, other, user2]: Wallet[], provider: MockProvider) {
    const factory = await (
      await ethers.getContractFactory("BananaSwapFactory")
    ).deploy(wallet.address);

    const tokenA = (await (
      await ethers.getContractFactory("SmartERC20")
    ).deploy(expandTo18Decimals(10000))) as SmartERC20;
    const tokenB = (await (
      await ethers.getContractFactory("SmartERC20")
    ).deploy(expandTo18Decimals(10000))) as SmartERC20;

    await factory.createPair(tokenA.address, tokenB.address);
    const pair = (await ethers.getContractFactory("BananaSwapPair")).attach(
      await factory.getPair(tokenA.address, tokenB.address)
    );
    const token0Address = await pair.token0();
    const token0 = tokenA.address === token0Address ? tokenA : tokenB;
    const token1 = tokenA.address === token0Address ? tokenB : tokenA;

    const lpTimeLock = await (await ethers.getContractFactory("LPTimeLock")).deploy();
    await lpTimeLock.initialize();

    return { pair, token0, token1, wallet, other, user2, factory, provider, lpTimeLock };
  }

  it("lock base", async () => { 
    const { pair, wallet, token0, token1, lpTimeLock } = await loadFixture(fixture);

    expect(await lpTimeLock.paused()).to.eq(false);
    await lpTimeLock.setPause();
    expect(await lpTimeLock.paused()).to.eq(true);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("0"));
    await lpTimeLock.addPoolInfo(pair.address);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));

    let poolInfo = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo.lpToken).to.eq(pair.address);
    expect(poolInfo.endTime.sub(poolInfo.startTime)).to.eq(BigNumber.from("3045081600"));

    expect(await lpTimeLock.lockDuration()).to.eq(BigNumber.from("3045081600"));
    await lpTimeLock.setLockDuration(BigNumber.from("10000"));
    expect(await lpTimeLock.lockDuration()).to.eq(BigNumber.from("10000"));
  });

  it("setManager", async () => {
      const { pair, wallet, other, user2, token0, token1, lpTimeLock } = await loadFixture(fixture);
      expect(await lpTimeLock.isManager(wallet.address)).to.eq(true);
      expect(await lpTimeLock.isManager(other.address)).to.eq(false);
      await lpTimeLock.setManager(other.address, true);
      expect(await lpTimeLock.isManager(other.address)).to.eq(true);
      await lpTimeLock.setManager(other.address, false);
      expect(await lpTimeLock.isManager(other.address)).to.eq(false);
      await expect(lpTimeLock.connect(user2).setManager(other.address, true)).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("addPoolInfo", async () => { 
    const { pair, wallet, token0, token1, lpTimeLock } = await loadFixture(fixture);

    await expect(lpTimeLock.addPoolInfo(ethconst.AddressZero)).to.be.revertedWith("_lpToken is the zero address");
    await lpTimeLock.addPoolInfo(pair.address);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));
    await expect(lpTimeLock.addPoolInfo(pair.address)).to.be.revertedWith("_lpToken exist");
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));
  });

  it("setPoolInfo", async () => { 
    const { pair, wallet, token0, token1, lpTimeLock } = await loadFixture(fixture);

    await lpTimeLock.addPoolInfo(pair.address);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));

    let _startTime = BigNumber.from("1656383271897");
    let _endTime = BigNumber.from("1656383203382");
    await expect(lpTimeLock.setPoolInfo(ethconst.AddressZero, _startTime, _endTime)).to.be.revertedWith("lpToken zero address");
    await expect(lpTimeLock.setPoolInfo(pair.address, _startTime, _endTime)).to.be.revertedWith("time error");
   
    _endTime = BigNumber.from("1656383376182");
    await lpTimeLock.setPoolInfo(pair.address, _startTime, _endTime);
    
    await expect(lpTimeLock.addPoolInfo(pair.address)).to.be.revertedWith("_lpToken exist");
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));

    await expect(lpTimeLock.setPoolInfo(token0.address, _startTime, _endTime)).to.be.revertedWith("_lpToken not exist");
  });

  it("deposit", async () => {
    const { pair, wallet, token0, token1, lpTimeLock } = await loadFixture(fixture);

    const token0Amount = expandTo18Decimals(1);
    const token1Amount = expandTo18Decimals(4);
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);

    const expectedLiquidity = expandTo18Decimals(2);
    await expect(pair.mint(wallet.address))
      .to.emit(pair, "Transfer")
      .withArgs(ethconst.AddressZero, ethconst.AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, "Transfer")
      .withArgs(
        ethconst.AddressZero,
        wallet.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
      )
      .to.emit(pair, "Sync")
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, "Mint")
      .withArgs(wallet.address, token0Amount, token1Amount);

    expect(await pair.totalSupply()).to.eq(expectedLiquidity);
    expect(await pair.balanceOf(wallet.address)).to.eq(
      expectedLiquidity.sub(MINIMUM_LIQUIDITY)
    );
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount);
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount);
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(token0Amount);
    expect(reserves[1]).to.eq(token1Amount);

    await lpTimeLock.addPoolInfo(pair.address);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));

    let poolInfo = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo.lpToken).to.eq(pair.address);
    expect(poolInfo.endTime.sub(poolInfo.startTime)).to.eq(BigNumber.from("3045081600"));

    const depositLPAmt = expectedLiquidity.sub(MINIMUM_LIQUIDITY);
    let beforeLock = await pair.balanceOf(wallet.address);
    expect(beforeLock).to.eq(depositLPAmt);

    pair.approve(lpTimeLock.address, depositLPAmt);

    await expect(lpTimeLock.deposit(ethconst.AddressZero, wallet.address, depositLPAmt)).to.be.revertedWith("lp zero address");
    await expect(lpTimeLock.deposit(pair.address, wallet.address, BigNumber.from("0"))).to.be.revertedWith("lp amout 0");
    await expect(lpTimeLock.deposit(pair.address, ethconst.AddressZero, depositLPAmt)).to.be.revertedWith("user zero address");
    await expect(lpTimeLock.deposit(token0.address, wallet.address, depositLPAmt)).to.be.revertedWith("_lpToken not exist");

    await lpTimeLock.setPause();
    await expect(lpTimeLock.deposit(pair.address, wallet.address, depositLPAmt)).to.be.revertedWith("LPTimeLock has been suspended");
    
    await lpTimeLock.setPause();
    await lpTimeLock.deposit(pair.address, wallet.address, depositLPAmt);

    let afterLock = await pair.balanceOf(wallet.address);
    expect(await pair.balanceOf(wallet.address)).to.eq(BigNumber.from("0"));
    expect(depositLPAmt).to.eq(beforeLock.sub(afterLock));

    expect(await lpTimeLock.getLockedAmount(pair.address, wallet.address)).to.eq(depositLPAmt);

    let poolInfo2 = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo2.totalAmount).to.eq(depositLPAmt);

  });

  it("withdraw", async () => {
    const { pair, wallet, token0, token1, lpTimeLock } = await loadFixture(fixture);

    const token0Amount = expandTo18Decimals(1);
    const token1Amount = expandTo18Decimals(4);
    await token0.transfer(pair.address, token0Amount);
    await token1.transfer(pair.address, token1Amount);

    const expectedLiquidity = expandTo18Decimals(2);
    await expect(pair.mint(wallet.address))
      .to.emit(pair, "Transfer")
      .withArgs(ethconst.AddressZero, ethconst.AddressZero, MINIMUM_LIQUIDITY)
      .to.emit(pair, "Transfer")
      .withArgs(
        ethconst.AddressZero,
        wallet.address,
        expectedLiquidity.sub(MINIMUM_LIQUIDITY)
      )
      .to.emit(pair, "Sync")
      .withArgs(token0Amount, token1Amount)
      .to.emit(pair, "Mint")
      .withArgs(wallet.address, token0Amount, token1Amount);

    expect(await pair.totalSupply()).to.eq(expectedLiquidity);
    expect(await pair.balanceOf(wallet.address)).to.eq(
      expectedLiquidity.sub(MINIMUM_LIQUIDITY)
    );
    expect(await token0.balanceOf(pair.address)).to.eq(token0Amount);
    expect(await token1.balanceOf(pair.address)).to.eq(token1Amount);
    const reserves = await pair.getReserves();
    expect(reserves[0]).to.eq(token0Amount);
    expect(reserves[1]).to.eq(token1Amount);

    await lpTimeLock.setLockDuration(BigNumber.from("10"));
    expect(await lpTimeLock.lockDuration()).to.eq(BigNumber.from("10"));

    await lpTimeLock.addPoolInfo(pair.address);
    expect(await lpTimeLock.poolLength()).to.eq(BigNumber.from("1"));

    let poolInfo = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo.lpToken).to.eq(pair.address);
    expect(poolInfo.endTime.sub(poolInfo.startTime)).to.eq(BigNumber.from("10"));

    const depositLPAmt = expectedLiquidity.sub(MINIMUM_LIQUIDITY);
    let beforeLock = await pair.balanceOf(wallet.address);
    expect(beforeLock).to.eq(depositLPAmt);

    await pair.approve(lpTimeLock.address, depositLPAmt);
    await lpTimeLock.deposit(pair.address, wallet.address, depositLPAmt);

    let afterLock = await pair.balanceOf(wallet.address);
    expect(await pair.balanceOf(wallet.address)).to.eq(BigNumber.from("0"));
    expect(depositLPAmt).to.eq(beforeLock.sub(afterLock));

    expect(await lpTimeLock.getLockedAmount(pair.address, wallet.address)).to.eq(depositLPAmt);

    let poolInfo3 = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo3.totalAmount).to.eq(depositLPAmt);

    let blockInfo1 = await time.latestBlockInfo();
    await time.advanceTimeAndBlock(20);
    let blockInfo2 = await time.latestBlockInfo();
    expect(blockInfo2.timestamp).to.eq(blockInfo1.timestamp + 20);

    await expect(lpTimeLock.withdraw(ethconst.AddressZero, wallet.address)).to.be.revertedWith("lp zero address");
    await expect(lpTimeLock.withdraw(token0.address, wallet.address)).to.be.revertedWith("_lpToken not exist");

    await lpTimeLock.setPause();
    await expect(lpTimeLock.withdraw(pair.address, wallet.address)).to.be.revertedWith("LPTimeLock has been suspended");

    await lpTimeLock.setPause();
    let unlockAmt = await lpTimeLock.withdraw(pair.address, wallet.address);
    await unlockAmt.wait();
    
    expect(await lpTimeLock.getLockedAmount(pair.address, wallet.address)).to.eq(BigNumber.from("0"));
    expect(await pair.balanceOf(wallet.address)).to.eq(depositLPAmt);
    let poolInfo4 = await lpTimeLock.poolInfo(BigNumber.from("0"));
    expect(poolInfo4.totalAmount).to.eq(BigNumber.from("0"));

    await expect(lpTimeLock.withdraw(pair.address, wallet.address)).to.be.revertedWith("lp amout 0");
    
    let _startTime = BigNumber.from(new Date().getTime());
    let _endTime = _startTime.add(BigNumber.from("86400"));
    await lpTimeLock.setPoolInfo(pair.address, _startTime, _endTime);

    await pair.approve(lpTimeLock.address, depositLPAmt);
    await lpTimeLock.deposit(pair.address, wallet.address, depositLPAmt);
    await expect(lpTimeLock.withdraw(pair.address, wallet.address)).to.be.revertedWith("endTime gt now");
  });
});
