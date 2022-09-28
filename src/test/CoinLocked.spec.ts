import {ethers} from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish, Wallet } from "ethers";
import {CoinLocked} from "../types/CoinLocked";
import{BananaSwapToken}from "../types/BananaSwapToken";
import { expandTo18Decimals } from "./shared/utilities";
import { isBytesLike } from "ethers/lib/utils";
import {CoinAllocation} from "../types/CoinAllocation";
import { execPath } from "process";
const { time } = require("./shared");

describe("CoinLocked user func", async function() {
    let owner: { address: string; },one: { address: string; },two:{ address: string; },three:{ address: string; },four:{address:string}
    let CoinLocked1: CoinLocked,CoinLocked2: CoinLocked,CoinLocked3: CoinLocked,CoinLocked4: CoinLocked,TokenAFeeHandler:BananaSwapToken;
    
    before(async function() {
        this.signers = await ethers.getSigners();
        owner = this.signers[0];
        one = this.signers[1];
        two = this.signers[2];
        three = this.signers[3];
        four = this.signers[4];
        // console.log(`owner.address ${owner.address}`);
        CoinLocked1 = await (await ethers.getContractFactory("CoinLocked")).deploy();
        CoinLocked2 = await (await ethers.getContractFactory("CoinLocked")).deploy();
        CoinLocked3 = await (await ethers.getContractFactory("CoinLocked")).deploy();
        CoinLocked4 = await (await ethers.getContractFactory("CoinLocked")).deploy();
        TokenAFeeHandler= await (await ethers.getContractFactory("BananaSwapToken")).deploy();
        // CoinAllocation= await (await ethers.getContractFactory("CoinAllocation")).deploy();
    });
    it('initialized', async () => {
        await CoinLocked1.initialize(TokenAFeeHandler.address,four.address);
        let p=[5000,2000,2000,1000];
        let addr=[CoinLocked1.address,CoinLocked2.address,CoinLocked3.address,CoinLocked4.address];
        let locks =[true,true,true,true];
        // await CoinAllocation.initialize(TokenAFeeHandler.address);
        // await CoinAllocation.setPercent(p,addr);
        TokenAFeeHandler.initialize("t1","t1",p,addr,expandTo18Decimals(100000000));
        // await TokenAFeeHandler.transferOwnership(CoinAllocation.address);
        await expect(CoinLocked1.setParams(expandTo18Decimals(2),86460,1659008207)).to.be.revertedWith("_releaseAmount is wrong"); 
        // await CoinAllocation.mint(expandTo18Decimals(100000000));
        await expect(await TokenAFeeHandler.owner()==owner.address);
    });

    it("setParams",async()=>{
        await expect(CoinLocked1.setParams(0,86460,1659008207)).to.be.revertedWith("_releaseAmount is wrong");   
        await expect(CoinLocked1.setParams(expandTo18Decimals(200000000),86460,1659008207)).to.be.revertedWith("_releaseAmount is wrong");   
        await CoinLocked1.setParams(10000,86460,await time.latestTime())
        // console.log("totalSupply:",await CoinLocked1.totalSupply());
    });

    it("withdraw",async()=>{
        // console.log(await CoinLocked1.startTime());
        // console.log(await TokenAFeeHandler.balanceOf(CoinLocked1.address));
        // console.log(await TokenAFeeHandler.balanceOf(CoinLocked2.address));
        // console.log(await TokenAFeeHandler.balanceOf(CoinLocked3.address));
        // console.log(await TokenAFeeHandler.balanceOf(CoinLocked4.address));
        await expect(CoinLocked1.withdraw()).to.be.revertedWith("endTime gt now");        

        await CoinLocked1.setParams(100000,86400,await time.latestTime());   
        await time.advanceTimeAndBlock(86400*2);
        await CoinLocked1.withdraw();
        // console.log("new CoinLocked1:",await TokenAFeeHandler.balanceOf(CoinLocked1.address));
        // console.log(await TokenAFeeHandler.balanceOf(four.address));
        // console.log("day:",await CoinLocked1.haveDay());

        await time.advanceTimeAndBlock(86400*3);
        await CoinLocked1.withdraw();
        // console.log("new CoinLocked1:",await TokenAFeeHandler.balanceOf(CoinLocked1.address));
        // console.log(await TokenAFeeHandler.balanceOf(four.address));
        // console.log("day:",await CoinLocked1.haveDay());

        await time.advanceTimeAndBlock(86400);
        await CoinLocked1.withdraw();
        // console.log("new CoinLocked1:",await TokenAFeeHandler.balanceOf(CoinLocked1.address));
        // console.log(await TokenAFeeHandler.balanceOf(four.address));
        // console.log("day:",await CoinLocked1.haveDay());
    });
});