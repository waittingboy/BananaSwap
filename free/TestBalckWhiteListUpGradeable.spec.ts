import {ethers} from "hardhat";
import { expect } from "chai";
import { TestBkWeListUpGradeable } from "../src/types/TestBkWeListUpGradeable";
import { Test } from "mocha";
import { join } from "path";

describe("TokenAPool user func", async function() {
    let owner: { address: string; },one: { address: string; },two:{ address: string; },three:{ address: string; };
    let TestBkWeListUpGradeable: TestBkWeListUpGradeable;
    before(async function() {
        this.signers = await ethers.getSigners();
        owner = this.signers[0];
        one = this.signers[1];
        two = this.signers[2];
        three = this.signers[3];
        TestBkWeListUpGradeable = await (await ethers.getContractFactory("TestBkWeListUpGradeable")).deploy();
    });
    it("initialize",async()=>{
        await TestBkWeListUpGradeable.initialize();        
    });
    it("addWhiteList",async()=>{
        let whiteAddress=[one.address];
        await TestBkWeListUpGradeable.addWeList(whiteAddress);
        expect(await TestBkWeListUpGradeable.isWeList(one.address)).to.eq(true);
    });

    it("removeWhiteList",async()=>{
        await TestBkWeListUpGradeable.removeWeList(one.address);
        expect(await TestBkWeListUpGradeable.isWeList(one.address)).to.eq(false);
    });

    it("addBlackList",async()=>{
        let whiteBlack=[one.address];
        await TestBkWeListUpGradeable.addBkList(whiteBlack);
        expect(await TestBkWeListUpGradeable.isBkList(one.address)).to.eq(true);
    });

    it("removeBlackList",async()=>{
        await TestBkWeListUpGradeable.removeBkList(one.address);
        expect(await TestBkWeListUpGradeable.isBkList(one.address)).to.eq(false);
    });

    it("test",async()=>{
        let whiteAddress=[one.address];
        await TestBkWeListUpGradeable.addWeList(whiteAddress);
        // await TestBkWeListUpGradeable.test(one.address);
        await TestBkWeListUpGradeable.removeWeList(one.address);
        
        let whiteBlack=[one.address];
        await TestBkWeListUpGradeable.addBkList(whiteBlack);
        // await expect(TestBkWeListUpGradeable.test(one.address)).to.be.revertedWith("address in blackList");
    });
});