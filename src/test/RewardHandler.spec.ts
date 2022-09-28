import { expect } from "chai";
import { BigNumber, constants as ethconst, Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
const { time } = require("./shared")

import {
  expandTo18Decimals,
  encodePrice,
  setNextBlockTime,
} from "./shared/utilities";
import { SmartERC20 } from "../types";
import { MockProvider } from "@ethereum-waffle/provider";


const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

describe("RewardFee", () => {
  const loadFixture = waffle.createFixtureLoader(
    waffle.provider.getWallets(),
    waffle.provider
  );

  async function fixture([wallet, other, user2,feeWallet]: Wallet[], provider: MockProvider) {
    const mainToken = (await (
      await ethers.getContractFactory("SmartERC20")
    ).deploy(expandTo18Decimals(10000))) as SmartERC20;
    const distributeToken = (await (
      await ethers.getContractFactory("SmartERC20")
    ).deploy(expandTo18Decimals(10000))) as SmartERC20;
    const rewardHandler = await (
      await ethers.getContractFactory("RewardHandler")
    ).deploy();

    return { mainToken: mainToken, rewardHandler,wallet,user2,distributeToken,feeWallet };
  }

  it("distribute the fee!", async () => {
    const { mainToken: feeToken, rewardHandler,wallet,user2,distributeToken,feeWallet } = await loadFixture(fixture);
    await rewardHandler.initialize(feeToken.address, expandTo18Decimals(1),feeWallet.address);
    await feeToken.transfer(user2.address,expandTo18Decimals(500));
    let feeAmount = expandTo18Decimals(1);
    await feeToken.connect(user2).approve(rewardHandler.address, feeAmount,{from: user2.address});
    await distributeToken.transfer(rewardHandler.address,expandTo18Decimals(1));
    // await expect(rewardHandler.connect(user2)
    //   .distributeRewardToUser(user2.address,distributeToken.address,expandTo18Decimals(1),{from:user2.address}))
    //   .to.be.revertedWith("Not manager");
    let distributeAmount = expandTo18Decimals(1);
    await rewardHandler.distributeRewardToUser(user2.address,distributeToken.address,distributeAmount);
    let distributeBalance = await distributeToken.balanceOf(user2.address);
    expect(distributeBalance).to.be.equals(distributeAmount);
    let contractBalance = await distributeToken.balanceOf(rewardHandler.address);
    expect(contractBalance).to.be.equals(0);
    let balanceOfFeeUser = await feeToken.balanceOf(feeWallet.address);
    console.log("balanceOfFeeUser is: " , balanceOfFeeUser);

  });


});
