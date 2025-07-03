/**
 * 安全性检查脚本
 * 用于验证环境配置和部署前的安全检查
 */

require('dotenv').config();
const { ethers } = require('hardhat');

/**
 * 验证私钥格式和安全性
 */
function validatePrivateKey() {
  console.log('🔐 验证私钥配置...');
  
  if (!process.env.PRIVATE_KEY) {
    throw new Error('❌ 未设置 PRIVATE_KEY 环境变量');
  }
  
  const privateKey = process.env.PRIVATE_KEY;
  
  // 检查格式
  if (!privateKey.startsWith('0x')) {
    throw new Error('❌ PRIVATE_KEY 必须以 0x 开头');
  }
  
  // 检查长度
  if (privateKey.length !== 66) {
    throw new Error('❌ PRIVATE_KEY 长度必须为 66 个字符');
  }
  
  // 检查是否为有效的十六进制
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('❌ PRIVATE_KEY 包含无效字符');
  }
  
  // 检查是否为示例私钥（安全风险）
  const dangerousKeys = [
    '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Hardhat 默认私钥
  ];
  
  if (dangerousKeys.includes(privateKey.toLowerCase())) {
    throw new Error('❌ 检测到示例私钥，请使用真实的私钥');
  }
  
  console.log('✅ 私钥格式验证通过');
}

/**
 * 验证网络配置
 */
async function validateNetworkConfig() {
  console.log('🌐 验证网络配置...');
  
  const networks = ['sonicTestnet', 'sonicMainnet'];
  
  for (const networkName of networks) {
    try {
      const network = await ethers.provider.getNetwork();
      console.log(`✅ ${networkName} 网络连接正常，Chain ID: ${network.chainId}`);
    } catch (error) {
      console.warn(`⚠️  ${networkName} 网络连接失败: ${error.message}`);
    }
  }
}

/**
 * 验证 Gas 配置
 */
function validateGasConfig() {
  console.log('⛽ 验证 Gas 配置...');
  
  const gasPrice = process.env.GAS_PRICE;
  const gasLimit = process.env.GAS_LIMIT;
  
  if (gasPrice) {
    const gasPriceNum = parseInt(gasPrice);
    if (isNaN(gasPriceNum) || gasPriceNum <= 0) {
      throw new Error('❌ GAS_PRICE 必须是正整数');
    }
    
    // 检查 Gas 价格是否过高（防止意外高费用）
    const maxGasPrice = 100000000000; // 100 gwei
    if (gasPriceNum > maxGasPrice) {
      console.warn(`⚠️  Gas 价格较高: ${gasPriceNum / 1e9} gwei`);
    }
  }
  
  if (gasLimit) {
    const gasLimitNum = parseInt(gasLimit);
    if (isNaN(gasLimitNum) || gasLimitNum <= 0) {
      throw new Error('❌ GAS_LIMIT 必须是正整数');
    }
  }
  
  console.log('✅ Gas 配置验证通过');
}

/**
 * 检查账户余额
 */
async function checkAccountBalance() {
  console.log('💰 检查账户余额...');
  
  try {
    const [deployer] = await ethers.getSigners();
    const balance = await deployer.getBalance();
    const balanceEth = ethers.utils.formatEther(balance);
    
    console.log(`📍 部署账户: ${deployer.address}`);
    console.log(`💵 账户余额: ${balanceEth} ETH`);
    
    // 检查余额是否足够部署
    const minBalance = ethers.utils.parseEther('0.1'); // 最少 0.1 ETH
    if (balance.lt(minBalance)) {
      console.warn('⚠️  账户余额可能不足以完成部署');
    } else {
      console.log('✅ 账户余额充足');
    }
  } catch (error) {
    console.error('❌ 无法获取账户信息:', error.message);
  }
}

/**
 * 验证合约地址格式
 */
function validateContractAddresses() {
  console.log('📋 验证合约地址配置...');
  
  const contractEnvs = [
    'DICE_GAME_ADDRESS',
    'BETTING_CONTRACT_ADDRESS',
    'PAYOUT_CONTRACT_ADDRESS',
    'MINING_CONTRACT_ADDRESS',
    'MLH_TOKEN_ADDRESS',
    'MLHG_TOKEN_ADDRESS',
    'VRF_COORDINATOR_ADDRESS'
  ];
  
  for (const envName of contractEnvs) {
    const address = process.env[envName];
    if (address && !ethers.utils.isAddress(address)) {
      console.warn(`⚠️  ${envName} 不是有效的以太坊地址: ${address}`);
    } else if (address) {
      console.log(`✅ ${envName}: ${address}`);
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔒 开始安全性检查...');
  console.log('=' .repeat(50));
  
  try {
    // 基础配置验证
    validatePrivateKey();
    validateGasConfig();
    validateContractAddresses();
    
    // 网络相关验证
    await validateNetworkConfig();
    await checkAccountBalance();
    
    console.log('=' .repeat(50));
    console.log('🎉 所有安全检查通过！');
    
  } catch (error) {
    console.log('=' .repeat(50));
    console.error('💥 安全检查失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  validatePrivateKey,
  validateNetworkConfig,
  validateGasConfig,
  checkAccountBalance,
  validateContractAddresses
};