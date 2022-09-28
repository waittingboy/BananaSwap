const { ethers } = require("hardhat")

const { BigNumber } = ethers

async function advanceBlock() {
  return ethers.provider.send("evm_mine", [])
}

async function advanceBlockTo(blockNumber) {
  for (let i = await ethers.provider.getBlockNumber(); i < blockNumber; i++) {
    await advanceBlock()
  }
}

async function increase(value) {
  await ethers.provider.send("evm_increaseTime", [value.toNumber()])
  await advanceBlock()
}

async function latestTime() {
  const block = await ethers.provider.getBlock("latest")
  return BigNumber.from(block.timestamp)
  //return getDate(block.timestamp*1000)
}

async function latestDate() {
  const block = await ethers.provider.getBlock("latest")
  return getDate(block.timestamp*1000)
}

async function getDate(timestamp) {
  let date = new Date(timestamp);
  let Y = date.getFullYear() + '-';
  let  M = (date.getMonth()+1 < 10 ? '0'+(date.getMonth()+1) : date.getMonth()+1) + '-';
  let D = date.getDate() + ' ';
  let h = date.getHours() + ':';
  let m = date.getMinutes() + ':';
  let s = date.getSeconds();

  return Y+M+D+h+m+s
}

async function latestBlock() {
  const block = await ethers.provider.getBlock("latest")
  return block.number
  //return block
}

async function latestBlockInfo() {
  const block = await ethers.provider.getBlock("latest")
  return block
}

async function advanceTimeAndBlock(time) {
  await advanceTime(time)
  await advanceBlock()
  //console.log("=====passed",time.toString(),"seconds")
}

async function advanceTime(time) {
  await ethers.provider.send("evm_increaseTime", [time])
}

const duration = {
  seconds: function (val) {
    return BigNumber.from(val)
  },
  minutes: function (val) {
    return BigNumber.from(val).mul(this.seconds("60"))
  },
  hours: function (val) {
    return BigNumber.from(val).mul(this.minutes("60"))
  },
  days: function (val) {
    return BigNumber.from(val).mul(this.hours("24"))
  },
  weeks: function (val) {
    return BigNumber.from(val).mul(this.days("7"))
  },
  years: function (val) {
    return BigNumber.from(val).mul(this.days("365"))
  },
}

module.exports = {
  advanceBlock,
  advanceBlockTo,
  duration,
  //latest,
  latestTime,
  latestDate,
  latestBlock,
  latestBlockInfo,
  increase,
  advanceTime,
  advanceTimeAndBlock,
  getDate,
}
