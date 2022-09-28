import { Address } from "cluster";
import { ethers, waffle } from "hardhat";
const { expect } = require("chai");
const {BN} = require('@openzeppelin/test-helpers');
const { time ,ADDRESS_ZERO} = require("./shared")
const {createFixtureLoader} = require("ethereum-waffle");
import { MockProvider } from "@ethereum-waffle/provider";
import { constants as ethconst, Wallet,BigNumber } from "ethers";
import { FeeHandler } from "../types";
import { expandTo18Decimals, getApprovalDigest } from "./shared/utilities";
import exp from "constants";


const TOTAL_SUPPLY = expandTo18Decimals(10000);
const TEST_AMOUNT = expandTo18Decimals(10);

describe("FeeHandler Base user func", async function() {

    const loadFixture = waffle.createFixtureLoader(
        waffle.provider.getWallets(),
        waffle.provider
    );

    async function fixture([wallet, other, user1, user2,user3,user4,user5,user6]: Wallet[], provider: MockProvider) {
        const FeeHandler = (await (await ethers.getContractFactory("FeeHandler")).deploy()) as FeeHandler;
        return { FeeHandler, wallet, other, user1, user2,user3,user4,user5,user6, provider};
    }

    it("FeeHandler setManager", async () => {
        const { FeeHandler, wallet, other, user1, user2,user3,user4,user5,user6, provider} = await loadFixture(fixture);
        FeeHandler.connect(wallet).initialize();
        await expect(FeeHandler.connect(other.address).setManager(user1.address,true)).to.be
        .reverted;
    });

    // it("FeeHandler inputUserPendingAmount", async () => {
    //     const { FeeHandler, wallet, other, user1, user2, user3,user4,user5,user6,provider} = await loadFixture(fixture);
    //     // await FeeHandler.connect(wallet).initialize();
    //     await FeeHandler.connect(wallet).inputUserPendingAmount([other.address],[user1.address],[100])
    //     await expect(FeeHandler.connect(wallet).inputUserPendingAmount([other.address,user2.address],[user1.address],[100])).to.be.reverted;
    //     await expect(FeeHandler.connect(other).inputUserPendingAmount([other.address],[user1.address],[100])).to.be.reverted;
    // });

    // it("FeeHandler getUserPendingTokens", async () => {
    //     const { FeeHandler, wallet, other, user1, user2,user3,user4,user5,user6, provider} = await loadFixture(fixture);
    //     await FeeHandler.initialize();
    //     await FeeHandler.connect(wallet).setManager(other.address,true);
    //     await FeeHandler.connect(wallet).inputUserPendingAmount([other.address],[user1.address],[100])
    //     const {tokens,amounts} = await FeeHandler.connect(wallet).getUserPendingTokens(other.address);
    //     await expect(tokens[0]).to.eq(user1.address);
    //     await expect(amounts[0]).to.eq(100);
    // });

    // it("FeeHandler claims", async () => {
    //     const { FeeHandler, wallet, other, user1, user2,user3,user4,user5,user6, provider} = await loadFixture(fixture);
    //     await FeeHandler.initialize();

    //     const factory = await ethers.getContractFactory("SmartERC20");
    //     const token = await factory.deploy(TOTAL_SUPPLY);
    //     expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY);
    //     expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);
        
    //     await FeeHandler.connect(wallet).setManager(other.address, true);
    //     await FeeHandler.connect(wallet).inputUserPendingAmount([other.address],[token.address],[expandTo18Decimals(100)]);
    //     await token.transfer(FeeHandler.address, expandTo18Decimals(1000));

    //     // await expect((await FeeHandler.connect(other).claims([token.address],[100]))).to.be.reverted;

    //     await expect(await token.balanceOf(FeeHandler.address)).to.eq(expandTo18Decimals(1000));

    //     let beforeBalance = await token.balanceOf(other.address);
    //     await FeeHandler.connect(other).claims([token.address],[expandTo18Decimals(10)]);
    //     let afterBalance = await token.balanceOf(other.address);
    //     expect(afterBalance.sub(beforeBalance)).to.eq(expandTo18Decimals(10));
    //     expect(await token.balanceOf(FeeHandler.address)).to.eq(expandTo18Decimals(990));

    //     await expect(FeeHandler.connect(other).claims([token.address],[expandTo18Decimals(10)]))
    //     .to.emit(FeeHandler, "UserClaimAmount");
    //     await expect(FeeHandler.connect(wallet).inputUserPendingAmount([other.address],[token.address],[expandTo18Decimals(100)]))
    //     .to.emit(FeeHandler,"InputUserPendingAmount");

    // });

    // it("FeeHandler all", async () => {
    //     const { FeeHandler, wallet, other, user1, user2, user3, user4, user5, user6, provider} = await loadFixture(fixture);
    //     await FeeHandler.initialize();

    //     const factory = await ethers.getContractFactory("MyToken");
    //     const token = await factory.connect(wallet).deploy("A1","A1");
    //     expect(await token.name()).to.eq("A1");
    //     expect(await token.symbol()).to.eq("A1");
    //     expect(await token.totalSupply()).to.eq(TOTAL_SUPPLY);
    //     expect(await token.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);

    //     const factory1 = await ethers.getContractFactory("MyToken");
    //     const token1 = await factory1.connect(wallet).deploy("A2","A2")
    //     expect(await token1.name()).to.eq("A2");
    //     expect(await token1.symbol()).to.eq("A2");
    //     expect(await token1.totalSupply()).to.eq(TOTAL_SUPPLY);
    //     expect(await token1.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);

    //     const factory2 = await ethers.getContractFactory("MyToken");
    //     const token2 = await factory2.connect(wallet).deploy("A3","A3")
    //     expect(await token2.name()).to.eq("A3");
    //     expect(await token2.symbol()).to.eq("A3");
    //     expect(await token2.totalSupply()).to.eq(TOTAL_SUPPLY);
    //     expect(await token2.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);    
    
    //     const factory3 = await ethers.getContractFactory("MyToken");
    //     const token3 = await factory3.connect(wallet).deploy("A4","A4")
    //     expect(await token3.name()).to.eq("A4");
    //     expect(await token3.symbol()).to.eq("A4");
    //     expect(await token3.totalSupply()).to.eq(TOTAL_SUPPLY);
    //     expect(await token3.balanceOf(wallet.address)).to.eq(TOTAL_SUPPLY);   

    //     await FeeHandler.connect(wallet).inputUserPendingAmount(
    //         [wallet.address,user2.address,user3.address,user4.address, user4.address],
    //         [token.address,token1.address,token2.address,token3.address, token2.address],
    //         [expandTo18Decimals(100),expandTo18Decimals(100),
    //             expandTo18Decimals(100),expandTo18Decimals(100),expandTo18Decimals(90)]
    //     );        
    //     let {tokens,amounts} = await FeeHandler.connect(user2).getUserPendingTokens(user2.address);
    //     await expect(tokens[0]).to.eq(token1.address);
    //     await expect(amounts[0]).to.eq(expandTo18Decimals(100));

    //     await token.transfer(FeeHandler.address, TOTAL_SUPPLY);
    //     await token1.transfer(FeeHandler.address, TOTAL_SUPPLY);
    //     await token2.transfer(FeeHandler.address, TOTAL_SUPPLY);
    //     await token3.transfer(FeeHandler.address, TOTAL_SUPPLY);
    //     expect(await token.balanceOf(FeeHandler.address)).to.eq(TOTAL_SUPPLY);
    //     expect(await token1.balanceOf(FeeHandler.address)).to.eq(TOTAL_SUPPLY);
    //     expect(await token2.balanceOf(FeeHandler.address)).to.eq(TOTAL_SUPPLY);
    //     expect(await token3.balanceOf(FeeHandler.address)).to.eq(TOTAL_SUPPLY);
        
    //     expect(await token1.balanceOf(user2.address)).to.eq(0);
    //     await FeeHandler.connect(user2).claims([token1.address],[expandTo18Decimals(10)]);
    //     expect(await token1.balanceOf(user2.address)).to.eq(expandTo18Decimals(10));

    //     await FeeHandler.connect(user2).claims([token1.address],[expandTo18Decimals(90)]);
    //     expect(await token1.balanceOf(user2.address)).to.eq(expandTo18Decimals(100));

    //     await expect(FeeHandler.connect(user2).claims([token1.address],[expandTo18Decimals(90)])).to.be.reverted;

    //     let result3 = await FeeHandler.connect(user3).getUserPendingTokens(user3.address);
    //     await expect(result3.tokens[0]).to.eq(token2.address);
    //     await expect(result3.amounts[0]).to.eq(expandTo18Decimals(100));

    //     expect(await token2.balanceOf(user3.address)).to.eq(0);
    //     await FeeHandler.connect(user3).claims([token2.address],[expandTo18Decimals(10)]);
    //     expect(await token2.balanceOf(user3.address)).to.eq(expandTo18Decimals(10));

    //     await FeeHandler.connect(user3).claims([token2.address],[expandTo18Decimals(90)]);
    //     expect(await token2.balanceOf(user3.address)).to.eq(expandTo18Decimals(100));

    //     await expect(FeeHandler.connect(user3).claims([token2.address],[expandTo18Decimals(90)])).to.be.reverted;

    //     let result4 = await FeeHandler.connect(user4).getUserPendingTokens(user4.address);
    //     await expect(result4.tokens[0]).to.eq(token3.address);
    //     await expect(result4.tokens[1]).to.eq(token2.address);
    //     await expect(result4.amounts[0]).to.eq(expandTo18Decimals(100));
    //     await expect(result4.amounts[1]).to.eq(expandTo18Decimals(90));

    //     await expect(FeeHandler.connect(user2).claims([token1.address],[expandTo18Decimals(10)]))
    //         .to.be.revertedWith("exceeds user amount");

    //     await expect(FeeHandler.connect(user2).claims([token2.address],[expandTo18Decimals(10)]))
    //         .to.be.revertedWith("tokenAddresses not exist");

    // });



});
