import { Address } from "cluster";
import { ethers, waffle } from "hardhat";
const { expect } = require("chai");
const {BN} = require('@openzeppelin/test-helpers');
const { time ,ADDRESS_ZERO} = require("./shared")
const {createFixtureLoader} = require("ethereum-waffle");
import { MockProvider } from "@ethereum-waffle/provider";
import { constants as ethconst, Wallet,BigNumber } from "ethers";
import { BananaToken } from "../types";

const TOTAL_SUPPLY = expandTo18Decimals(10000);
const TEST_AMOUNT = expandTo18Decimals(10);

export function expandTo18Decimals(n: number): BigNumber {
    return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
  }

describe("tokenb Base user func", async function() {

    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function fixture([wallet, other, user1, user2]: Wallet[], provider: MockProvider) {
        const tokenB = (await (await ethers.getContractFactory("BananaToken")).deploy()) as BananaToken;
        return { tokenB, wallet, other, user1, user2, provider};
    }

    it("tokenb init", async () => {
        const { tokenB, wallet, other, user1, user2, provider } = await loadFixture(fixture);
        await tokenB.initialize("tb","tb");
        expect(await tokenB.symbol()).to.eq("tb");
        expect(await tokenB.name()).to.eq("tb");
    });

    it("tokenb setManager", async () => {
        const { tokenB, wallet, other, user1, user2, provider} = await loadFixture(fixture);
        await tokenB.connect(wallet).initialize("tb","tb");
        await expect(tokenB.connect(other.address).setManager(user1.address,true)).to.be
        .reverted;
        await tokenB.connect(wallet).setManager(other.address,true)
        expect(await tokenB.connect(wallet).getManager(other.address)).to.eq(true);
    });
   
    it("tokenb transferFrom", async function() {
        const { tokenB, wallet, other, user1, user2, provider} = await loadFixture(fixture);
        await tokenB.connect(wallet).initialize("tb","tb");
        await tokenB.connect(wallet).mint(wallet.address,TOTAL_SUPPLY);
        await tokenB.approve(other.address, TEST_AMOUNT);
        await expect(
            tokenB
            .connect(other)
            .transferFrom(wallet.address, other.address, TEST_AMOUNT)
        )
          .to.emit(tokenB, "Transfer")
          .withArgs(wallet.address, other.address, TEST_AMOUNT);
        expect(await tokenB.allowance(wallet.address, other.address)).to.eq(0);
        expect(await tokenB.balanceOf(wallet.address)).to.eq(
          TOTAL_SUPPLY.sub(TEST_AMOUNT)
        );
        expect(await tokenB.balanceOf(other.address)).to.eq(TEST_AMOUNT);
    });

    it("tokenb transferFrom open", async function() {
        const { tokenB, wallet, other, user1, user2, provider} = await loadFixture(fixture);
        await tokenB.connect(wallet).initialize("tb","tb");
        await tokenB.connect(wallet).mint(wallet.address,TOTAL_SUPPLY);
        await tokenB.connect(wallet).mint(other.address,TEST_AMOUNT);
        //other 给 wallet.address 授权 TEST_AMOUNT
        await tokenB.connect(other).approve(wallet.address, TEST_AMOUNT);      
        let otherallowance = await tokenB.connect(other).allowance(other.address, wallet.address)
        // console.log(`otherallowance is ${otherallowance}`);
        //那么可以从other转移到wallet
        let whiteAddress=[user1.address];
        await expect(tokenB.connect(wallet).transferFrom(other.address, wallet.address, TEST_AMOUNT)).to.be.reverted;
    });

});
