import { expect } from "chai";
import { constants as ethconst, Wallet } from "ethers";
import { BananaSwapFactory } from "../types";

import { getCreate2Address } from "./shared/utilities";
import { ethers, waffle } from "hardhat";

const TEST_ADDRESSES: [string, string] = [
  "0x1000000000000000000000000000000000000000",
  "0x2000000000000000000000000000000000000000",
];

describe("BananaSwapFactory", () => {
  const loadFixture = waffle.createFixtureLoader(
    waffle.provider.getWallets(),
    waffle.provider
  );

  async function fixture([wallet, other, user1, user2]: Wallet[]) {

    const commonTokenFactory = await ethers.getContractFactory("CommonToken");
    const usdt = await commonTokenFactory.deploy({ gasLimit: "4600000" });

    const TokenBFactory = await ethers.getContractFactory("BananaToken");
    const tokenB = await TokenBFactory.deploy();
    await tokenB.initialize("Banana", "Banana");

    const TokenManager = await ethers.getContractFactory("TokenManager");
    const tokenManager = await TokenManager.deploy();
    await tokenManager.initialize(tokenB.address, usdt.address);

    let pairBtoken0 = tokenB.address > usdt.address ? usdt : tokenB; // token 0 is TokenB
    let pairBtoken1 = tokenB.address > usdt.address ? tokenB : usdt;

    const usdtFeefactory = await ethers.getContractFactory("USDTFeeHandle");
    const usdtFeeHandle = await usdtFeefactory.deploy();

    const TokenBPoolFactory = await ethers.getContractFactory("TokenBPool");
    const pairB = await TokenBPoolFactory.deploy();

    const tmp = await ethers.getContractFactory("BananaSwapFactory");
    const factory = await tmp.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
    await pairB.initialize(pairBtoken0.address, pairBtoken1.address, tokenB.address, factory.address, wallet.address);
    await usdtFeeHandle.initialize(usdt.address, tokenB.address, pairB.address);
    return { factory: factory, wallet, other };
  }

  it("feeTo, feeToSetter, allPairsLength", async () => {
    const { factory, wallet } = await loadFixture(fixture);
    expect(await factory.feeTo()).to.eq(ethconst.AddressZero);
    expect(await factory.feeToSetter()).to.eq(wallet.address);
    expect(await factory.allPairsLength()).to.eq(0);
  });

  async function createPair(
    factory: BananaSwapFactory,
    tokens: [string, string]
  ) {
    const pairContract = await ethers.getContractFactory("BananaSwapPair");
    const create2Address = getCreate2Address(
      factory.address,
      tokens,
      pairContract.bytecode
    );
    await expect(factory.createPair(tokens[0], tokens[1]))
      .to.emit(factory, "PairCreated")
      .withArgs(TEST_ADDRESSES[0], TEST_ADDRESSES[1], create2Address, 1);

    await expect(factory.createPair(tokens[0], tokens[1])).to.be.reverted; // BananaSwap: PAIR_EXISTS
    await expect(factory.createPair(tokens[1], tokens[0])).to.be.reverted; // BananaSwap: PAIR_EXISTS
    expect(await factory.getPair(tokens[0], tokens[1])).to.eq(create2Address);
    expect(await factory.getPair(tokens[1], tokens[0])).to.eq(create2Address);
    expect(await factory.allPairs(0)).to.eq(create2Address);
    expect(await factory.allPairsLength()).to.eq(1);

    const pair = pairContract.attach(create2Address);
    expect(await pair.factory()).to.eq(factory.address);
    expect(await pair.token0()).to.eq(TEST_ADDRESSES[0]);
    expect(await pair.token1()).to.eq(TEST_ADDRESSES[1]);
  }

  it("Pair:codeHash", async () => {
    const { factory } = await loadFixture(fixture);
    const codehash = await factory.PAIR_HASH();
    // console.log("=========== codeHash: ", codehash);
    // const pair = await ethers.getContractFactory("BananaSwapPair");
    // expect(ethers.utils.keccak256(pair.bytecode)).to.be.eq(codehash);
    // expect(codehash).to.be.eq(
    //   "0x81676b6b4f94b61213f0bb7f9aa9f20641c7f3963f2f22f0492d631f9a619eea"
    // );
  });

  it("createPair", async () => {
    const { factory } = await loadFixture(fixture);
    await createPair(factory, [...TEST_ADDRESSES]);
  });

  it("createPair:reverse", async () => {
    const { factory } = await loadFixture(fixture);
    await createPair(
      factory,
      TEST_ADDRESSES.slice().reverse() as [string, string]
    );
  });

  // it("createPair:gas", async () => {
  //   const { factory } = await loadFixture(fixture);
  //   const tx = await factory.createPair(...TEST_ADDRESSES);
  //   const receipt = await tx.wait();
  //   expect(receipt.gasUsed).to.eq(2355845);
  // });

  it("setFeeTo", async () => {
    const { factory, wallet, other } = await loadFixture(fixture);
    await expect(
      factory.connect(other).setFeeTo(other.address)
    ).to.be.revertedWith("BananaSwap: FORBIDDEN");
    await factory.setFeeTo(wallet.address);
    expect(await factory.feeTo()).to.eq(wallet.address);
  });

  it("setFeeToSetter", async () => {
    const { factory, wallet, other } = await loadFixture(fixture);
    await expect(
      factory.connect(other).setFeeToSetter(other.address)
    ).to.be.revertedWith("BananaSwap: FORBIDDEN");
    await factory.setFeeToSetter(other.address);
    expect(await factory.feeToSetter()).to.eq(other.address);
    await expect(factory.setFeeToSetter(wallet.address)).to.be.revertedWith(
      "BananaSwap: FORBIDDEN"
    );
  });
});
