const { ethers } = require("hardhat")
const { BigNumber } = require("ethers")

const BASE_TEN = 10
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"
const ADDRESS_DEAD = "0x000000000000000000000000000000000000dEaD"

function encodeParameters(types, values) {
  const abi = new ethers.utils.AbiCoder()
  return abi.encode(types, values)
}

async function prepare(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract] = await ethers.getContractFactory(contract)
  }
  thisObject.signers = await ethers.getSigners()
  thisObject.addr1 = thisObject.signers[0]
  thisObject.addr2 = thisObject.signers[1]
  thisObject.addr3 = thisObject.signers[2]
  thisObject.addr4 = thisObject.signers[3]
  thisObject.addr1PrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  thisObject.addr2PrivateKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  thisObject.addr3PrivateKey = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
}

async function deploy(thisObject, contracts) {
  for (let i in contracts) {
    let contract = contracts[i]
    thisObject[contract[0]] = await contract[1].deploy(...(contract[2] || []))
    await thisObject[contract[0]].deployed()
  }
}

async function createSLP(thisObject, name, tokenA, tokenB, amount) {
  const createPairTx = await thisObject.factory.createPair(tokenA.address, tokenB.address)

  const _pair = (await createPairTx.wait()).events[0].args.pair

  thisObject[name] = await thisObject.BananaSwapPair.attach(_pair)

  await tokenA.transfer(thisObject[name].address, amount)
  await tokenB.transfer(thisObject[name].address, amount)

  await thisObject[name].mint(thisObject.addr1.address)
}
// Defaults to e18 using amount * 10^18
function getBigNumber(amount, decimals = 18) {
  return BigNumber.from(amount).mul(BigNumber.from(BASE_TEN).pow(decimals))
}

module.exports = {
  encodeParameters,
  prepare,
  deploy,
  createSLP,
  getBigNumber,
  time: require("./time"),
  ADDRESS_ZERO,
  ADDRESS_DEAD,
}
