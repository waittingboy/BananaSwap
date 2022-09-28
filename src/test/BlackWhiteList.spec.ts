import {ethers} from "hardhat";
import { expect } from "chai";
import { BkWeList } from "../types/BkWeList";
import { BigNumberish } from "ethers";

describe("BlackWhiteList user func", async function() {
    let owner: { address: string; },one: { address: string; },two:{ address: string; },three:{ address: string; },four:{address:string}
    let blackWhiteList: BkWeList;
    /*
    before(async function() {
        this.signers = await ethers.getSigners();
        owner = this.signers[0];
        one = this.signers[1];
        two = this.signers[2];
        three = this.signers[3];
        four = this.signers[4];
        console.log(`owner.address ${owner.address}`);
        blackWhiteList = await (await ethers.getContractFactory("BlackWhiteList")).deploy();
    });
    it('initialized', async () => {
        await blackWhiteList.initialize();
    });

    it('addBlackList',async ()=>{
        let whiteList = blackWhiteList.blackList;
        console.log(await whiteList(two.address));
        blackWhiteList.addBlackList(two.address);
        console.log(await whiteList(two.address));
    });
    it('addWhiteList exist black',async ()=>{
        let whiteList = blackWhiteList.whiteList;
        console.log(await whiteList(two.address));
        await expect(blackWhiteList.addWhiteList(two.address)).to.be.revertedWith("address is blackList");
        console.log(await whiteList(two.address));
    });
    it('addWhiteList',async ()=>{
        let whiteList = blackWhiteList.whiteList;
        console.log(await whiteList(one.address));
        console.log(await whiteList(two.address));
        console.log(await whiteList(three.address));
        blackWhiteList.addWhiteList(one.address);
        blackWhiteList.addWhiteList(two.address);
        blackWhiteList.addWhiteList(three.address);
        console.log(await whiteList(one.address));
        console.log(await whiteList(two.address));
        console.log(await whiteList(three.address));
    });
    it('removeWhiteList',async ()=>{
        let whiteList = blackWhiteList.whiteList;
        blackWhiteList.removeWhiteList(one.address);
        console.log(await whiteList(one.address));
        console.log(await whiteList(two.address));

    });

    it('addBlackList exist white',async ()=>{
        let blackList = blackWhiteList.blackList;
        console.log(await blackList(three.address));
        await expect(blackWhiteList.addBlackList(three.address)).to.be.revertedWith("address is whiteList");
        console.log(await blackList(three.address));
    });
    it('addBlackList',async ()=>{
        let blackList = blackWhiteList.blackList;
        console.log(await blackList(one.address));
        blackWhiteList.addBlackList(one.address);
        console.log(await blackList(one.address));
    });
    it('removeBlackList',async ()=>{
        let blackList = blackWhiteList.blackList;
        blackWhiteList.removeBlackList(one.address);
        console.log(await blackList(one.address));
    });
    */

});