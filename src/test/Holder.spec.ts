import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { BigNumber, BigNumberish, Contract, Wallet } from "ethers";
import { ethers, upgrades, waffle } from "hardhat";
import { BananaQuery, ITokenAFeeHandler, IBananaSwapPair, TokenManager } from "../types";
import { AddressZero, MaxUint256, Zero } from '@ethersproject/constants';
import bn from 'bignumber.js';
const { time } = require("./shared");

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

describe("Holder", () => {
    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function v2Fixture([wallet, other, user1, user2, user3, user4, user5, user6]: Wallet[], provider: MockProvider) {
        const commonTokenFactory = await ethers.getContractFactory("CommonToken");
        const cake = await commonTokenFactory.deploy();
        await cake.deployed();
        let tx = await cake.initialize("CAKE", "CAKE", expandTo18Decimals(10000000000));
        await tx.wait();
        // console.log('cake address:', cake.address);

        const usdt = await commonTokenFactory.deploy();
        await usdt.deployed();
        tx = await usdt.initialize("USDT", "USDT", expandTo18Decimals(10000000000));
        await tx.wait();
        // console.log('usdt address:', usdt.address);

        const HolderFactory = await ethers.getContractFactory("Holder");
        const holder = await HolderFactory.deploy(other.address);
        await holder.deployed();

        return { cake, usdt, holder, wallet, other, user1, user2, user3, provider };
    }

    it("setFeeAddress ", async () => {
        const { cake, usdt, holder, wallet, other, user1, user2, user3, provider } = await loadFixture(v2Fixture);
        expect(await cake.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000));

        expect(await holder.feeAddress()).to.eq(other.address);
        await holder.setFeeAddress(user1.address);
        expect(await holder.feeAddress()).to.eq(user1.address);
    });

    it("set FeeAmount", async () => {
        const { cake, usdt, holder, wallet, other, user1, user2, user3, provider } = await loadFixture(v2Fixture);
        expect(await cake.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000));

        expect(await holder.feeAmount()).to.eq(BigNumber.from(10).pow(17).mul(8));
        await holder.setFeeAmount(expandTo18Decimals(1));
        expect(await holder.feeAmount()).to.eq(expandTo18Decimals(1));
    });

    it("setDate", async () => {
        const { cake, usdt, holder, wallet, other, user1, user2, user3, provider } = await loadFixture(v2Fixture);
        await holder.setDate(10, BigNumber.from(86400).mul(1260));
    });

    it("lock and unlock", async () => {
        const { cake, usdt, holder, wallet, other, user1, user2, user3, provider } = await loadFixture(v2Fixture);
        expect(await cake.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000));

        let lockTokens = await holder.getTokens();
        expect(lockTokens.length).to.eq(0);
        expect(await holder.getTokensLength()).to.eq(0);
        
        await cake.approve(holder.address, ethers.constants.MaxInt256);
        let balance0 = await provider.getBalance(other.address);
        let tx = await holder.lock(cake.address, expandTo18Decimals(10000), BigNumber.from("86400").mul(15), { value: BigNumber.from("10").pow("17").mul("8") });
        await tx.wait();
        expect(await cake.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000).sub(expandTo18Decimals(10000)));
        expect(await cake.balanceOf(holder.address)).to.eq(expandTo18Decimals(10000));
        expect(await provider.getBalance(other.address)).to.eq(BigNumber.from(balance0).add(BigNumber.from("10").pow(17).mul(8)));

        let orders = await holder.getOrders();
        expect(orders.length).to.eq(1);

        lockTokens = await holder.getTokens();
        expect(lockTokens.length).to.eq(1);
        expect(lockTokens[0]).to.eq(cake.address);
        expect(await holder.getTokensLength()).to.eq(1);
        await expect(holder.getToken(1)).to.be.revertedWith("index out of bounds");
        expect(await holder.getToken(0)).to.eq(cake.address);
        expect(await holder.containsToken(cake.address)).to.eq(true);
        expect(await holder.containsToken(usdt.address)).to.eq(false);
        expect(await holder.getTokenLockAmounts(cake.address)).to.eq(expandTo18Decimals(10000));

        await time.advanceTimeAndBlock(86400 * 10);
        await expect(holder.unlock(1)).to.be.revertedWith("invalid index");
        await expect(holder.unlock(0)).to.be.revertedWith("unlock time not reached");
        expect(await holder.canUnlock(0)).to.eq(false);

        await time.advanceTimeAndBlock(86400 * 5);

        expect(await holder.canUnlock(0)).to.eq(true);
        await holder.unlock(0);
        expect(await cake.balanceOf(holder.address)).to.eq(0);
        expect(await cake.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000));

        await usdt.approve(holder.address, ethers.constants.MaxInt256);
        await holder.lock(usdt.address, expandTo18Decimals(10000), BigNumber.from("86400").mul(30), { value: BigNumber.from("10").pow("17").mul("8") });
        expect(await usdt.balanceOf(wallet.address)).to.eq(expandTo18Decimals(10000000000).sub(expandTo18Decimals(10000)));
        expect(await usdt.balanceOf(holder.address)).to.eq(expandTo18Decimals(10000));
        expect(await provider.getBalance(other.address)).to.eq(BigNumber.from(balance0).add(BigNumber.from("10").pow(17).mul(16)));

        orders = await holder.getOrders();
        expect(orders.length).to.eq(2);

        lockTokens = await holder.getTokens();
        expect(lockTokens.length).to.eq(2);
        expect(lockTokens[0]).to.eq(cake.address);
        expect(lockTokens[1]).to.eq(usdt.address);

        await expect(holder.getToken(2)).to.be.revertedWith("index out of bounds");
        expect(await holder.getToken(0)).to.eq(cake.address);
        expect(await holder.getToken(1)).to.eq(usdt.address);
        expect(await holder.containsToken(cake.address)).to.eq(true);
        expect(await holder.containsToken(usdt.address)).to.eq(true);

        // await time.advanceTimeAndBlock(86400 * 30);
    });

});