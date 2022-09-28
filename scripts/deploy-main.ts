import { BigNumberish } from "ethers";

const { ethers, upgrades } = require("hardhat");
const { BigNumber } = require("ethers");
const { BN } = require("@openzeppelin/test-helpers");

async function withDecimals(amount: number) {
    return new BN(amount).mul(new BN(10).pow(new BN(18))).toString();
}

function expandTo18Decimals(n: number) {
    return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
}

async function main() {
    console.log("---- deploy start");

    let signers = await ethers.getSigners();
    let wallet = signers[0];
    console.log("wallet:", wallet.address);

    const commonTokenFactory = await ethers.getContractFactory("CommonToken");
    let usdt = await commonTokenFactory.attach("0x55d398326f99059ff775485246999027b3197955");
    console.log("usdt address:", usdt.address);

    //deploy WETH 
    const weth = await ethers.getContractFactory("WETH9");
    const WETH = await weth.attach("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c");
    console.log("WETH address:", WETH.address);

    // deploy tokenB
    const TokenBFactory = await ethers.getContractFactory("BananaToken");
    const tokenB = await TokenBFactory.deploy();
    await tokenB.deployed();
    console.log("Banana tokenB address:", tokenB.address);

    let tx = await tokenB.initialize("Banana", "BANANA", { gasLimit: "6000000" });
    await tx.wait();
    console.log("Banana initialize", tokenB.address);

    tx = await tokenB.mint(wallet.address, expandTo18Decimals(1), { gasLimit: "6000000" });
    await tx.wait();
    console.log("Banana mint address:", tokenB.address);

    const TokenManagerFactory = await ethers.getContractFactory("TokenManager");
    const tokenManager = await upgrades.deployProxy(TokenManagerFactory, [tokenB.address, usdt.address], { initializer: "initialize" });
    await tokenManager.deployed();
    console.log("TokenManager address:", tokenManager.address);

    await tokenManager.deployTransaction.wait(2);
    console.log("tokenManager Impl address", await upgrades.erc1967.getImplementationAddress(tokenManager.address));

    // usdtFeeHandle
    const USDTFeeHandleFactory = await ethers.getContractFactory("USDTFeeHandle");
    const usdtFeeHandle = await upgrades.deployProxy(
        USDTFeeHandleFactory,
        [usdt.address, tokenB.address, ethers.constants.AddressZero],
        { initializer: "initialize" }
    );
    await usdtFeeHandle.deployed();
    console.log("usdtFeeHandle address:", usdtFeeHandle.address);

    await usdtFeeHandle.deployTransaction.wait(2);
    console.log("usdtFeeHandle Impl address", await upgrades.erc1967.getImplementationAddress(usdtFeeHandle.address));

    // deploy V2 factory
    const v2factory = await ethers.getContractFactory("BananaSwapFactory");
    const factoryV2 = await v2factory.deploy(wallet.address, tokenManager.address, usdtFeeHandle.address);
    await factoryV2.deployed();
    console.log("factory address:", factoryV2.address);

    let feeTo = "0x376BD87EBDd0fC66B41f04C980dc90d3Eb3A2179";
    tx = await factoryV2.setFeeTo(feeTo, { gasLimit: "6000000" });
    await tx.wait();
    console.log("factory setFeeTo:", feeTo);

    // deploy router-swap
    const BananaSwapFactory = await ethers.getContractFactory("BananaSwap");
    const routerSwap = await BananaSwapFactory.deploy();
    await routerSwap.deployed();
    console.log("routerSwap address:", routerSwap.address);

    const BananaLiquidFactory = await ethers.getContractFactory("BananaLiquid");
    const routerLiquid = await BananaLiquidFactory.deploy({ gasLimit: "8000000" });
    await routerLiquid.deployed();
    console.log("routerLiquid address:", routerLiquid.address);

    const BananaQuertyFactory = await ethers.getContractFactory("BananaQuery");
    const routerQuery = await BananaQuertyFactory.deploy();
    await routerQuery.deployed();
    console.log("routerQuery address:", routerQuery.address);

    const BananaQuery4SwapFactory = await ethers.getContractFactory("BananaQuery4Swap");
    const routerQuery4Swap = await BananaQuery4SwapFactory.deploy();
    await routerQuery4Swap.deployed();
    console.log("routerQuery4Swap address:", routerQuery4Swap.address);

    // pairB sort token
    let pairBtoken0 = tokenB.address > usdt.address ? usdt : tokenB;
    let pairBtoken1 = tokenB.address > usdt.address ? tokenB : usdt;
    console.log("pairB token0:", pairBtoken0.address);
    console.log("pairB token1:", pairBtoken1.address);

    const TokenBPoolFactory = await ethers.getContractFactory("TokenBPool");
    const pairB = await upgrades.deployProxy(
        TokenBPoolFactory,
        [pairBtoken0.address, pairBtoken1.address, tokenB.address, factoryV2.address, wallet.address],
        { initializer: "initialize" }
    );
    await pairB.deployed();
    console.log("pairB address", pairB.address);

    await pairB.deployTransaction.wait(2);
    console.log("pairB Impl address", await upgrades.erc1967.getImplementationAddress(pairB.address));

    tx = await usdtFeeHandle.setBPair(pairB.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("usdtFeeHandle.setBPair pairB address:", pairB.address);

    tx = await routerSwap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "8000000" });
    await tx.wait();
    console.log("routerSwap initialize");

    tx = await routerLiquid.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "9000000" });
    await tx.wait();
    console.log("routerLiquid initialize");

    tx = await routerQuery.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "9000000" });
    await tx.wait();
    console.log("routerQuery initialize");

    tx = await routerQuery4Swap.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "9000000" });
    await tx.wait();
    console.log("routerQuery4Swap initialize");

    tx = await routerSwap.setBananaQuery(routerQuery4Swap.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap setBananaQuery");

    tx = await tokenManager.addUsdtList(usdt.address, true, { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenManager.addUsdtList");
    tx = await tokenManager.addTokenBList(tokenB.address, true, { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenManager.addTokenBList");

    tx = await tokenManager.addRouter(routerLiquid.address, true, { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenManager.addRouter 0 ");

    tx = await tokenManager.addRouter(routerSwap.address, true, { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenManager.addRouter 1 ");

    tx = await tokenB.setManager(usdtFeeHandle.address, true);
    await tx.wait();
    console.log("tokenB.setManager usdtFeeHandle  afeter");

    let accounts = [
        "0xEb1aDf8A02af7D5CF4ff6875c6fFa1340a346D86",
        usdtFeeHandle.address,
        "0x000000000000000000000000000000000000dEaD",
        "0x0000000000000000000000000000000000000000"
    ];
    tx = await pairB.addTokenBExcludeBalanceList(accounts, { gasLimit: "8000000" });
    await tx.wait();
    console.log("pairB.addTokenBExcludeBalanceList afeter");

    const BananaSwap4BFactory = await ethers.getContractFactory("BananaSwap4B");
    const routerSwap4B = await BananaSwap4BFactory.deploy();
    await routerSwap4B.deployed();
    console.log("routerSwap4B address:", routerSwap4B.address);

    tx = await routerSwap4B.initialize(factoryV2.address, WETH.address, tokenManager.address, usdtFeeHandle.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap4B initialize:", routerSwap4B.address);

    tx = await routerSwap4B.setUsdtFeeHandle(usdtFeeHandle.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap4B.setUsdtFeeHandle");

    tx = await routerSwap4B.setUsdt(usdt.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap4B.setUsdt");

    tx = await routerSwap4B.setPairB(pairB.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap4B.setPairB");

    tx = await routerSwap4B.setTokenB(tokenB.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("routerSwap4B.setTokenB");

    let BananaEcosystemAccount = "0xEb1aDf8A02af7D5CF4ff6875c6fFa1340a346D86";

    console.log("tokenB.setTransferParams 0 ");
    tx = await tokenB.setTransferParams(BigNumber.from("10000"), pairB.address, BananaEcosystemAccount, BigNumber.from("0"), BigNumber.from("0"), { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenB.setTransferParams 1 ");
    tx = await pairB.setRouterSwap4B(routerSwap4B.address, { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenB.setRouterSwap4B ");

    tx = await usdt.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await tx.wait();
    tx = await tokenB.approve(routerSwap4B.address, ethers.constants.MaxUint256);
    await tx.wait();
    tx = await routerSwap4B.initLiquid(expandTo18Decimals(1), expandTo18Decimals(1), { gasLimit: "6000000" });
    await tx.wait();
    console.log("====== routerSwap4B.initLiquid");

    console.log("tokenB.setTransferParams 3 ");
    tx = await tokenB.setTransferParams(BigNumber.from("0"), pairB.address, BananaEcosystemAccount, BigNumber.from("0"), BigNumber.from("10000"), { gasLimit: "6000000" });
    await tx.wait();
    console.log("tokenB.setTransferParams 4 ");

    {
        let tokenBExist = true;
        let bConfig = {
            sellFeeRatio: BigNumber.from("10000"),
            sellToBPoolRatio: BigNumber.from("0"),
            sellToBPoolAddr: pairB.address,
            sellShareRatios: [10000],
            sellShareAddrs: [BananaEcosystemAccount],
            bExist: tokenBExist
        }
        tx = await usdtFeeHandle.setBConfig(tokenB.address, bConfig, { gasLimit: "8000000" });
        await tx.wait();
        console.log("usdtFeeHandle.setBConfig");
    }

    // set tokenA deployer manager
    tx = await tokenManager.setManager("0x1a8dEf16f2b9A69743Fb301f82Bd61DDFA65F7F6", true);
    await tx.wait();
    console.log("tokenManager.setManager tokenA deployer");

    tx = await usdtFeeHandle.setManager("0x1a8dEf16f2b9A69743Fb301f82Bd61DDFA65F7F6", true);
    await tx.wait();
    console.log("usdtFeeHandle.setManager tokenA deployer");

    // fee account: 0xBCD777Ee32ddBd7CE36337CbFdeff9c72671F70B
    let rewardFeeAccount = "0xBCD777Ee32ddBd7CE36337CbFdeff9c72671F70B";
    const RewardHandlerFactory = await ethers.getContractFactory("RewardHandler");
    const rewardHandler = await upgrades.deployProxy(
        RewardHandlerFactory,
        ["0x55d398326f99059ff775485246999027b3197955", expandTo18Decimals(2), rewardFeeAccount],
        { initializer: "initialize" }
    );
    await rewardHandler.deployed();
    console.log("rewardHandler address:", rewardHandler.address);

    await rewardHandler.deployTransaction.wait(2);
    console.log("rewardHandler Impl address", await upgrades.erc1967.getImplementationAddress(rewardHandler.address));

    const CoinLockDeployFactoryFactory = await ethers.getContractFactory("CoinLockDeployFactory");
    const coinLockDeployFactory = await CoinLockDeployFactoryFactory.deploy();
    await coinLockDeployFactory.deployed();
    console.log("coinLockDeployFactory address:", coinLockDeployFactory.address);

    const ReflowFeeHandlerDeployFactoryFactory = await ethers.getContractFactory("ReflowFeeHandlerDeployFactory");
    const reflowFeeHandlerDeployFactory = await ReflowFeeHandlerDeployFactoryFactory.deploy();
    await reflowFeeHandlerDeployFactory.deployed();
    console.log("reflowFeeHandlerDeployFactory address:", reflowFeeHandlerDeployFactory.address);

    const RepurchaseDestroyFeeHandlerDeployFactoryFactory = await ethers.getContractFactory("RepurchaseDestroyFeeHandlerDeployFactory");
    const repurchaseDestroyFeeHandlerDeployFactory = await RepurchaseDestroyFeeHandlerDeployFactoryFactory.deploy();
    await repurchaseDestroyFeeHandlerDeployFactory.deployed();
    console.log("repurchaseDestroyFeeHandlerDeployFactory address:", repurchaseDestroyFeeHandlerDeployFactory.address);

    // const HolderFactory = await ethers.getContractFactory("Holder");
    // const holder = await HolderFactory.deploy(wallet.address);
    // await holder.deployed();
    // console.log("holder address:", holder.address);

    console.log("---- deploy end");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
