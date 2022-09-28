const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");
const { BN } = require("@openzeppelin/test-helpers");
async function withDecimals(amount) {
  return new BN(amount).mul(new BN(10).pow(new BN(18))).toString();
}
async function withDecimals6(amount) {
  return new BN(amount).mul(new BN(10).pow(new BN(6))).toString();
}

//let url = "https://data-seed-prebsc-2-s2.binance.org:8545/";//bsc_test
let url = "https://matic-mumbai.chainstacklabs.com";//matic_test
let customHttpProvider = new ethers.providers.JsonRpcProvider(url);
let feeTo = "0x3649bef8045D7C5E73d1358550B9393D88298aa6";
let testAddr = "0xD60AA52cA3A42b31A12fEB9C00b636Ae3C32f0a9";
let NFTFundAccount = "0x7301546B65Fb480dfF1f84079c16407210Cc1ef2";
let handlingFeeAccount = "0x6AcC53962396609f6138C9E17F3E7777dE72165c";
//BSC_test
//let testFactoryAddr = "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc";
//Matic_Test_mumbai
let testFactoryAddr = "0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32";
//let usdTokenAddr = "0x1DE439f072074CC8106e60897FA8F101137dd153";

// //USDC test
// 0xf49c8a3D93Fd9dEEba7A369836292ec724D58348
// //ELC test
// 0xd5A423a8C5bC9931cFc2C42D1383da8E90dd8Ea8
// //HIPT质押代币合约
// 0xA89895987F34BBc7b4365A471A6e0A866f3bb307
// //资格Token合约
// 0x33BFF1201A6977c334F7278a7976913475CFD63b
let usdcAddr = "0xf49c8a3D93Fd9dEEba7A369836292ec724D58348";
let elcAddr = "0xd5A423a8C5bC9931cFc2C42D1383da8E90dd8Ea8";
let hiptAddr = "0xA89895987F34BBc7b4365A471A6e0A866f3bb307";
let hnqtAddr = "0x33BFF1201A6977c334F7278a7976913475CFD63b";

async function main() {
  this.signers = await ethers.getSigners();
  this.owner = this.signers[0];
  this.user = this.signers[1];
  console.log("owner is", this.owner.address);
  this.ERC20Mock = await ethers.getContractFactory("ERC20Mock");
  this.ERC20Mock6 = await ethers.getContractFactory("ERC20MockDecimals6");

  this.pledgeToken = await this.ERC20Mock.attach(hiptAddr);
  this.hnqToken = await this.ERC20Mock.attach(hnqtAddr);
  this.usdc = await this.ERC20Mock6.attach(usdcAddr);
  this.elc = await this.ERC20Mock.attach(elcAddr);

  // this.pledgeToken = await this.ERC20Mock.deploy("HIP Test token", "HIPT");
  // this.hnqToken = await this.ERC20Mock.deploy("HNQ Test Token", "HNQT");
  // this.usdc = await this.ERC20Mock6.deploy("USDC Test token", "USDCT");
  // this.elc = await this.ERC20Mock.deploy("ELC Test token", "ELCT");

  // await this.pledgeToken.deployed();
  // await this.hnqToken.deployed();
  // await this.usdc.deployed();
  // await this.elc.deployed();

  // await this.pledgeToken.mint(
  //   this.owner.address,
  //   await withDecimals(990000000000)
  // );
  // await this.pledgeToken.mint(testAddr, await withDecimals(10000000000));
  //
  // await this.hnqToken.mint(this.owner.address, await withDecimals(100000000));
  // await this.hnqToken.mint(testAddr, await withDecimals(10000000));
  //
  // await this.usdc.mint(this.owner.address, await withDecimals6(100000000));
  // let bal = await this.usdc.balanceOf(this.owner.address);
  // console.log("==========bal:", bal.toString());
  // await this.usdc.mint(testAddr, await withDecimals6(10000000));
  //
  // await this.elc.mint(this.owner.address, await withDecimals(100000000));
  // await this.elc.mint(testAddr, await withDecimals(10000000));

  console.log("this.elc is", this.elc.address);
  console.log("this.usdc is", this.usdc.address);
  console.log("this.pledgeToken is", this.pledgeToken.address);
  console.log("this.hnqToken is", this.hnqToken.address);

  const bonusTokens = [this.usdc.address, this.elc.address];

  //NFTFactoryMock
  this.NFTFactory = await ethers.getContractFactory("NFTFactory");
  this.nft = await upgrades.deployProxy(
    this.NFTFactory,
    [],
    { initializer: false }
  );
  await this.nft.deployed();
  console.log("this.nft is", this.nft.address);
  console.log(
    "nft ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.nft.address)
  );
  console.log(
    "nft AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.nft.address)
  );

  this.MysteryBox = await ethers.getContractFactory("MysteryBox");
  this.mysteryBox = await upgrades.deployProxy(
    this.MysteryBox,
    [this.owner.address],
    { initializer: "initialize" }
  );
  await this.mysteryBox.deployed();
  console.log("this.mysteryBox is", this.mysteryBox.address);
  console.log(
    "mysteryBox ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.mysteryBox.address)
  );
  console.log(
    "mysteryBox AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.mysteryBox.address)
  );

  this.RandomNumber = await ethers.getContractFactory("RandomNumber");
  this.randomNumber = await this.RandomNumber.deploy();
  await this.randomNumber.deployed();
  console.log("this.randomNumber is", this.randomNumber.address);

  this.DrawLots = await ethers.getContractFactory("DrawLots");
  this.drawLots = await upgrades.deployProxy(this.DrawLots, [this.randomNumber.address], {initializer: 'initialize'});
  await this.drawLots.deployed();
  console.log("this.drawLots is", this.drawLots.address);
  console.log(
    "drawLots ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.drawLots.address)
  );
  console.log(
    "drawLots AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.drawLots.address)
  );


  this.Token = await ethers.getContractFactory("ERC20Smart");
  this.BancorFormula = await ethers.getContractFactory("BancorFormula");
  this.NFTFundToken = await ethers.getContractFactory("NFTFundToken");

  this.bancor = await this.BancorFormula.deploy();
  await this.bancor.deployed();
  this.nft_fund = await upgrades.deployProxy(
    this.NFTFundToken,
    ["testFund",
    "testFundToken",
    "800000",
    200,
    await withDecimals(3000),
    this.bancor.address],
    {initializer: 'initialize'}
  );
  await this.nft_fund.deployed();
  console.log("this.nft_fund is", this.nft_fund.address);
  console.log(
    "nft_fund ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(
      this.nft_fund.address
    )
  );
  console.log(
    "nft_fund AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.nft_fund.address)
  );
  console.log("smart token is :",await this.nft_fund.token())


  this.MysteryBoxMarket = await ethers.getContractFactory("MysteryBoxMarket");
  this.mysteryBoxMarket = await upgrades.deployProxy(
    this.MysteryBoxMarket,
    [],
    { initializer: false }
  );
  await this.mysteryBoxMarket.deployed();
  console.log("this.mysteryBoxMarket is", this.mysteryBoxMarket.address);
  console.log(
    "mysteryBoxMarket ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(
      this.mysteryBoxMarket.address
    )
  );
  console.log(
    "mysteryBoxMarket AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.mysteryBoxMarket.address)
  );

  //deploy luckyLottery proxy
  this.LuckyLottery = await ethers.getContractFactory("LuckyLottery");
  this.luckyLottery = await upgrades.deployProxy(this.LuckyLottery,
    [this.mysteryBoxMarket.address,this.drawLots.address],//,this.randomNumber.address
    {initializer: 'initialize'}
  );
  await this.luckyLottery.deployed();
  console.log("this.luckyLottery is",this.luckyLottery.address);
  console.log("luckyLottery ImplementationAddress is",await upgrades.erc1967.getImplementationAddress(this.luckyLottery.address));
  console.log("luckyLottery AdminAddress is",await upgrades.erc1967.getAdminAddress(this.luckyLottery.address));

  //transfer Ownership of nftFound
  await this.nft_fund.transferOwnership(this.mysteryBoxMarket.address);
  console.log("finished nftFound.transferOwnership to mysteryBoxMarket");

  //mysteryBox setInternalCaller(mysteryBoxMarketAddr)
  await this.mysteryBox.setInternalCaller(this.mysteryBoxMarket.address,true)
  console.log("mysteryBox finished setInternalCaller(mysteryBoxMarketAddr)")

  this.Democracy = await ethers.getContractFactory("Democracy");
  //只生成proxy,admin,implement 地址，不初始化
  this.democracy = await upgrades.deployProxy(this.Democracy, [], {
    initializer: false,
  });
  await this.democracy.deployed();
  console.log("this.democracy is", this.democracy.address);
  // //erc1967.getImplementationAddress
  console.log(
    "democracy ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.democracy.address)
  );
  console.log(
    "democracy AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.democracy.address)
  );

  this.CrowdfundPools = await ethers.getContractFactory("CrowdfundPools");
  //只生成proxy,admin,implement 地址，不初始化
  this.crowdfundPools = await upgrades.deployProxy(this.CrowdfundPools, [], {
    initializer: false,
  });
  await this.crowdfundPools.deployed();
  console.log("this.crowdfundPools is", this.crowdfundPools.address);
  // //erc1967.getImplementationAddress
  console.log(
    "crowdfundPools ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.crowdfundPools.address)
  );
  console.log(
    "crowdfundPools AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.crowdfundPools.address)
  );

  this.Base = await ethers.getContractFactory("Base");
  this.base = await upgrades.deployProxy(
    this.Base,
    [
      this.pledgeToken.address,
      this.nft.address,
      this.mysteryBox.address,
      this.democracy.address,
      this.crowdfundPools.address,
    ],
    { initializer: "initialize" }
  );
  await this.base.deployed();
  console.log("this.base is", this.base.address);
  //erc1967.getImplementationAddress
  console.log(
    "base ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(this.base.address)
  );
  console.log(
    "base AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.base.address)
  );

  await this.democracy.initialize(
    this.pledgeToken.address,
    await withDecimals(200000),
    this.base.address,
    feeTo,
    testFactoryAddr,
    this.usdc.address,
  );
  console.log("democracy initialize end");

  await this.democracy.setCrowdfund(this.crowdfundPools.address);

  let now = await customHttpProvider.getBlockNumber();
  let startBlock = now + 10;
  await this.crowdfundPools.initialize(
    startBlock,
    this.pledgeToken.address,
    this.mysteryBoxMarket.address,
    this.hnqToken.address,
    this.nft.address,
    this.base.address,
    this.democracy.address,
    this.drawLots.address,
    bonusTokens
  );
  console.log("crowdfundPools initialize end");

  //set base as InternalCaller of mysteryBox
  await this.mysteryBox.setInternalCaller(this.base.address, true);
  console.log("setInternalCaller(this.base.address,true) end");

  //deploy UserToken address
  this.UserTokens = await ethers.getContractFactory("UserTokens");
  this.userTokens = await upgrades.deployProxy(this.UserTokens, [this.nft.address], {initializer: 'initialize'});
  await this.userTokens.deployed();
  console.log("this.userTokens is",this.userTokens.address);
  console.log("userTokens ImplementationAddress is",await upgrades.erc1967.getImplementationAddress(this.userTokens.address));
  console.log("userTokens AdminAddress is",await upgrades.erc1967.getAdminAddress(this.userTokens.address));

  //set internal caller with mysteryBoxMarket,nftExchangeMarket, nftAuctionMarket,nftFactory
  await this.userTokens.setInternalCaller(this.mysteryBoxMarket.address,true)
  console.log("userTokens finished setInternalCaller(mysteryBoxMarket)")
  await this.userTokens.setInternalCaller(this.nft.address,true)
  console.log("userTokens finished setInternalCaller(nftFactoryAddr)")

  await this.mysteryBoxMarket.initialize(
    this.nft.address,
    this.mysteryBox.address,
    this.randomNumber.address,
    this.crowdfundPools.address,
    this.luckyLottery.address,
    this.nft_fund.address,
    NFTFundAccount,
    handlingFeeAccount,
    bonusTokens
  );
  console.log("mysteryBoxMarket initialize end");

  await this.mysteryBoxMarket.setTokenFeeReduction(this.elc.address,"400");
  //token20sFeeReduction(tokenAddress)
  console.log("==getToken20FeeReduction",await this.mysteryBoxMarket.getToken20FeeReduction(this.elc.address))
  //adjustMaxOpenQuantity on MysteryBoxMarket
  await this.mysteryBoxMarket.adjustMaxOpenQuantity("200");
  console.log("adjustMaxOpenQuantity finished");

  await this.nft.initialize(this.userTokens.address,this.crowdfundPools.address);
  console.log("nft initialize end");

  //deploy NFTAuctionMarket proxy
  this.NFTAuctionMarket = await ethers.getContractFactory("NFTAuctionMarket");
  this.nftAuctionMarket = await upgrades.deployProxy(
    this.NFTAuctionMarket,
    [
      this.nft.address,
      handlingFeeAccount,
      bonusTokens,
    ],
    { initializer: "initialize" }
  );
  await this.nftAuctionMarket.deployed();
  console.log("this.nftAuctionMarket is", this.nftAuctionMarket.address);
  console.log(
    "nftAuctionMarket ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(
      this.nftAuctionMarket.address
    )
  );
  console.log(
    "nftAuctionMarket AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.nftAuctionMarket.address)
  );
  ////deploy NFTExchangeMarket proxy
  this.NFTExchangeMarket = await ethers.getContractFactory("NFTExchangeMarket");
  this.nftExchangeMarket = await upgrades.deployProxy(
    this.NFTExchangeMarket,
    [
      this.nft.address,
      handlingFeeAccount,
      bonusTokens,
    ],
    { initializer: "initialize" }
  );
  await this.nftExchangeMarket.deployed();
  console.log("this.nftExchangeMarket is", this.nftExchangeMarket.address);
  console.log(
    "nftExchangeMarket ImplementationAddress is",
    await upgrades.erc1967.getImplementationAddress(
      this.nftExchangeMarket.address
    )
  );
  console.log(
    "nftExchangeMarket AdminAddress is",
    await upgrades.erc1967.getAdminAddress(this.nftExchangeMarket.address)
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
