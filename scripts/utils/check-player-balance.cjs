const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
    console.log('🔍 检查玩家代币余额...');
    
    // 获取部署信息
    const deploymentFile = path.join(__dirname, '..', 'deployments', 'sonic-testnet-complete-1751281033428.json');
    const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    
    const playerAddress = "0x3F42974C17247ea6991052108Fa01A00aB369250";
    const mlhgTokenAddress = "0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb";
    
    console.log(`👤 玩家地址: ${playerAddress}`);
    console.log(`🪙 MLHG代币地址: ${mlhgTokenAddress}`);
    
    // 获取MLHG代币合约实例
    const MLHG = await hre.ethers.getContractAt("ERC20", mlhgTokenAddress);
    
    // 检查玩家的MLHG代币余额
    const balance = await MLHG.balanceOf(playerAddress);
    const decimals = await MLHG.decimals();
    const symbol = await MLHG.symbol();
    
    const balanceFormatted = hre.ethers.formatUnits(balance, decimals);
    
    console.log(`\n💰 玩家${symbol}代币余额: ${balanceFormatted}`);
    
    // 检查原生代币余额
    const provider = hre.ethers.provider;
    const nativeBalance = await provider.getBalance(playerAddress);
    const nativeBalanceFormatted = hre.ethers.formatEther(nativeBalance);
    
    console.log(`💰 玩家原生代币(S)余额: ${nativeBalanceFormatted}`);
    
    console.log('\n✅ 余额检查完成');
}

main().catch((error) => {
    console.error('❌ 检查失败:', error.message);
    process.exitCode = 1;
});