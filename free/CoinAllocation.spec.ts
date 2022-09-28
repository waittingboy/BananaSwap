import {ethers} from "hardhat";
import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import {CoinAllocation} from "../types/CoinAllocation";
import{TokenAFeeHandler}from "../types/TokenAFeeHandler";
import { expandTo18Decimals } from "./shared/utilities";
import { isBytesLike } from "ethers/lib/utils";

describe("BlackWhiteList user func", async function() {
    let owner: { address: string; },one: { address: string; },two:{ address: string; },three:{ address: string; },four:{address:string}
    let CoinAllocation: CoinAllocation,TokenAFeeHandler:TokenAFeeHandler
    
    before(async function() {
        this.signers = await ethers.getSigners();
        owner = this.signers[0];
        one = this.signers[1];
        two = this.signers[2];
        three = this.signers[3];
        four = this.signers[4];
        // console.log(`owner.address ${owner.address}`);
        CoinAllocation = await (await ethers.getContractFactory("CoinAllocation")).deploy();
        TokenAFeeHandler= await (await ethers.getContractFactory("TokenAFeeHandler")).deploy();
    });
    it('initialized', async () => {
        await CoinAllocation.initialize(TokenAFeeHandler.address);
    });

    it("mint no address",async()=>{
        await expect(CoinAllocation.mint(expandTo18Decimals(1))).to.be.revertedWith("no address");
    });

    it("setPercent",async()=>{
        let p=[50,20,20,5];
        let addr=[one.address,two.address];
        await expect(CoinAllocation.setPercent(p,addr)).to.be.revertedWith("input length eq");
        addr=[one.address,two.address,three.address,four.address];
        await expect(CoinAllocation.setPercent(p,addr)).to.be.revertedWith("not is 100");
        p=[5000,2000,2000,1000];
        await CoinAllocation.setPercent(p,addr);
    });

    it("setPercent send:",async()=>{
        let p=[5000,2000,2000,1000];
        let addr=[one.address,two.address,three.address,four.address];
        let locks =[true,false,true,true];
        await CoinAllocation.setPercent(p,addr);
    });

    it("mint",async()=>{       
        await expect(CoinAllocation.mint(expandTo18Decimals(1))).to.be.revertedWith("Ownable: caller is not the owner");
        TokenAFeeHandler.initialize("t1","t1");

        await TokenAFeeHandler.transferOwnership(CoinAllocation.address);
        await expect(await TokenAFeeHandler.owner()==owner.address);
        await CoinAllocation.mint(expandTo18Decimals(1));
        // console.log("one:",await TokenAFeeHandler.balanceOf(one.address));
        // console.log("two:",await TokenAFeeHandler.balanceOf(two.address));
        // console.log("three:",await TokenAFeeHandler.balanceOf(three.address));
        // console.log("four:",await TokenAFeeHandler.balanceOf(four.address));
    });
});