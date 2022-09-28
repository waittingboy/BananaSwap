const {ethers} = require("hardhat");
const { expect } = require("chai");
const { BigNumber } = ethers;
const {BN} = require('@openzeppelin/test-helpers');
const { time } = require("./shared")
const { ADDRESS_ZERO } = require("./shared");


let owner, user, alice;
let tokenManager;

const usdtAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const usdt1Address = "0xce4Ec2a346b817C808C803A5696123eaA1FFBEBa";
const token1Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const token2Address = "0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa";
const token3Address = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const tokenBddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const tokenB1ddress = "0xc443F00DB55eB74fBEa235fd904103F929d821B2";

async function withDecimals(amount) {
    return new BN(amount).mul(new BN(10).pow(new BN(18))).toString();
}

describe("Base user func", async function() {
    before(async function() {
        this.signers = await ethers.getSigners();
        owner = this.signers[0];
        user = this.signers[1];
        alice = this.signers[2];
        this.TokenManager = await ethers.getContractFactory("TokenManager");
    });

    beforeEach(async function() {
        tokenManager = await this.TokenManager.deploy();
        await tokenManager.deployed();
    });

    it("initialize", async function() {

        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(false);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(false);
        await tokenManager.initialize(
            tokenBddress,usdtAddress
        );
        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(true);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(false);
    });

    it("add tokenAList", async function() {
        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(false);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(false);
        await expect(tokenManager.addTokenAList(token1Address,true)).to.be.revertedWith("Not manager");
        await tokenManager.initialize(
            tokenBddress,usdtAddress
        );
        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(true);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(false);
        await tokenManager.setManager(owner.address,true);
        await expect(tokenManager.connect(user).addTokenAList(token1Address,true,{from:user.address})).to.be.revertedWith("Not manager");
        await tokenManager.addTokenAList(token1Address,true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token2Address)).to.be.equal(false);
        await tokenManager.addTokenAList(token2Address,true);
        expect(await tokenManager.isTokenA(token2Address)).to.be.equal(true);
        await tokenManager.addTokenAList(token3Address,true);
        expect(await tokenManager.isTokenA(token3Address)).to.be.equal(true);
        await tokenManager.addTokenAList(token2Address,false);
        expect(await tokenManager.isTokenA(token2Address)).to.be.equal(false);
        await tokenManager.addTokenBList(tokenB1ddress,true);
        expect(await tokenManager.isTokenB(tokenB1ddress)).to.be.equal(true);
        await tokenManager.addUsdtList(usdt1Address,true);
        expect(await tokenManager.isUsdt(usdt1Address)).to.be.equal(true);
        await expect(tokenManager.connect(user).addTokenBList(token1Address,true,{from:user.address})).to.be.revertedWith("Not manager");
        await expect(tokenManager.connect(user).addUsdtList(token1Address,true,{from:user.address})).to.be.revertedWith("Not manager");
    });
    

    it("test A associate B", async function() {
        await tokenManager.initialize(
            tokenBddress,usdtAddress
        );
        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(true);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(false);
        await tokenManager.setManager(owner.address,true);
        await tokenManager.addTokenAList(token1Address,true);
        await expect(tokenManager.connect(user).associateA2B(tokenBddress,token1Address,true,{from:user.address})).to.be.revertedWith("Not manager");
        await tokenManager.associateA2B(token1Address,tokenBddress,true);
        expect(await tokenManager.associateA2BMapping(token1Address)).to.be.equal(tokenBddress);
        expect(await tokenManager.isAssociate(token1Address,tokenBddress)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(true);
        await tokenManager.addTokenAList(token2Address,true);
        expect(await tokenManager.isAssociate(token2Address,tokenBddress)).to.be.equal(false);
        await tokenManager.associateA2B(token2Address,tokenBddress,true);
        expect(await tokenManager.isAssociate(token2Address,tokenBddress)).to.be.equal(true);
        await tokenManager.associateA2B(token2Address,tokenBddress,false);
        expect(await tokenManager.isAssociate(token2Address,tokenBddress)).to.be.equal(false);
        
    });

    it("test is TokenA", async function() {
        await tokenManager.initialize(
            tokenBddress,usdtAddress
        );
        expect(await tokenManager.isTokenB(tokenBddress)).to.be.equal(true);
        expect(await tokenManager.isUsdt(usdtAddress)).to.be.equal(true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(false);
        await tokenManager.setManager(owner.address,true);
        await tokenManager.addTokenAList(token1Address,true);
        expect(await tokenManager.isTokenA(token1Address)).to.be.equal(true);
    });
    

});
