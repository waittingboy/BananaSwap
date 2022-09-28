const Web3 = require('web3')
const WETH9 = require('../artifacts/contracts/test/WETH9.sol/WETH9.json')
const BananaSwapPair = require('../artifacts/contracts/BananaSwapPair.sol/BananaSwapPair.json')
const BananaSwapFactory = require('../artifacts/contracts/BananaSwapFactory.sol/BananaSwapFactory.json')
const BananaSwapV2RouterDelegator = require('../artifacts/contracts/BananaSwapV2RouterDelegator.sol/BananaSwapV2RouterDelegator.json')
const BananaSwapV2Router = require('../artifacts/contracts/BananaSwapV2Router.sol/BananaSwapV2Router.json')

const endpoint = 'HTTP://127.0.0.1:8545';
const hexPrivateKey = '0x9f0f69e455254f16ee173808734aeaa023b41fb29b107afbf6262055c238802f';

async function sendTransaction(web3, chainId, account, data, nonce, gasPrice) {
    const message = {
        from: account.address,
        gas: 5000000,
        gasPrice: gasPrice,
        data: data.startsWith('0x') ? data : '0x' + data,
        nonce: nonce,
        chainId: chainId
    }
    const transaction = await account.signTransaction(message)
    return web3.eth.sendSignedTransaction(transaction.rawTransaction)
}

(async () => {
    const options = { timeout: 1000 * 30 }
    const web3 = new Web3(new Web3.providers.HttpProvider(endpoint, options))
    const account = web3.eth.accounts.privateKeyToAccount(hexPrivateKey)

    const chainId = await web3.eth.getChainId()
    const gasPrice = await web3.eth.getGasPrice()
    let nonce = await web3.eth.getTransactionCount(account.address)

    // deploy WETH contract
    let weth = null
    {
        const contract = new web3.eth.Contract(WETH9.abi)
        const data = contract.deploy({ data: WETH9.bytecode }).encodeABI()
        const receipt = await sendTransaction(web3, chainId, account, data, nonce, gasPrice)
        console.info('WETH:', weth = receipt.contractAddress)
        nonce = nonce + 1
    }

    // deploy BananaSwapFactory contract
    let factory = null
    {
        const contract = new web3.eth.Contract(BananaSwapFactory.abi)
        const options = { data: BananaSwapFactory.bytecode, arguments: [account.address] }
        const data = contract.deploy(options).encodeABI()
        const receipt = await sendTransaction(web3, chainId, account, data, nonce, gasPrice)
        console.info('BananaSwapFactory:', factory = receipt.contractAddress)
        nonce = nonce + 1
    }

    // deploy BananaSwapV2RouterDelegator contract
    {
        const contract = new web3.eth.Contract(BananaSwapV2RouterDelegator.abi)
        const options = { data: BananaSwapV2RouterDelegator.bytecode, arguments: [factory, weth] }
        const data = contract.deploy(options).encodeABI()
        const receipt = await sendTransaction(web3, chainId, account, data, nonce, gasPrice)
        console.info('BananaSwapV2RouterDelegator:', receipt.contractAddress)
        nonce = nonce + 1
    }

    // deploy UniswapV2Router contract
    {
        const contract = new web3.eth.Contract(BananaSwapV2Router.abi)
        const options = { data: BananaSwapV2Router.bytecode, arguments: [factory, weth] }
        const data = contract.deploy(options).encodeABI()
        const receipt = await sendTransaction(web3, chainId, account, data, nonce, gasPrice)
        console.info('BananaSwapV2Router:', receipt.contractAddress)
        nonce = nonce + 1
    }

    let data = BananaSwapPair.bytecode
    if (!data.startsWith('0x')) data = '0x' + data
    console.info('INIT_CODE_HASH:', web3.utils.keccak256(data))
})()
