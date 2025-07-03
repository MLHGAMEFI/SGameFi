/**
 * 部署前检查脚本
 * 在合约部署前执行全面的安全和配置检查
 */

require('dotenv').config();
const { ethers } = require('hardhat');
const securityCheck = require('../utils/security-check.cjs');

/**
 * 检查编译状态
 */
async function checkCompilation() {
  console.log('🔨 检查合约编译状态...');
  
  try {
    // 尝试获取合约工厂来验证编译
    const contractNames = [
      'BettingContract',
      'DiceGame',
      'MiningContract',
      'PayoutContract',
      'MLHGToken'
    ];
    
    for (const contractName of contractNames) {
      try {
        await ethers.getContractFactory(contractName);
        console.log(`✅ ${contractName} 编译成功`);
      } catch (error) {
        console.warn(`⚠️  ${contractName} 编译可能有问题: ${error.message}`);
      }
    }
  } catch (error) {
    throw new Error(`❌ 合约编译检查失败: ${error.message}`);
  }
}

/**
 * 检查部署配置
 */
function checkDeploymentConfig() {
  console.log('⚙️  检查部署配置...');
  
  const requiredEnvs = [
    'PRIVATE_KEY',
    'SONIC_TESTNET_RPC'
  ];
  
  const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
  
  if (missingEnvs.length > 0) {
    throw new Error(`❌ 缺少必要的环境变量: ${missingEnvs.join(', ')}`);
  }
  
  console.log('✅ 部署配置检查通过');
}

/**
 * 检查网络连接
 */
async function checkNetworkConnection() {
  console.log('🌐 检查网络连接...');
  
  try {
    const network = await ethers.provider.getNetwork();
    const blockNumber = await ethers.provider.getBlockNumber();
    
    console.log(`✅ 网络连接正常`);
    console.log(`📍 Chain ID: ${network.chainId}`);
    console.log(`📦 当前区块: ${blockNumber}`);
    
    // 检查网络是否为预期网络
    const expectedChainIds = {
      'sonicTestnet': 57054,
      'sonicMainnet': 146,
      'localhost': 31337,
      'hardhat': 31337
    };
    
    const networkName = process.env.HARDHAT_NETWORK || 'unknown';
    const expectedChainId = expectedChainIds[networkName];
    
    if (expectedChainId && network.chainId !== expectedChainId) {
      console.warn(`⚠️  网络 Chain ID 不匹配。期望: ${expectedChainId}, 实际: ${network.chainId}`);
    }
    
  } catch (error) {
    throw new Error(`❌ 网络连接失败: ${error.message}`);
  }
}

/**
 * 检查 Gas 估算
 */
async function checkGasEstimation() {
  console.log('⛽ 检查 Gas 估算...');
  
  try {
    const gasPrice = await ethers.provider.getGasPrice();
    const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
    
    console.log(`📊 当前网络 Gas 价格: ${gasPriceGwei} gwei`);
    
    // 估算部署成本
    const estimatedGasForDeployment = 5000000; // 估算值
    const estimatedCost = gasPrice.mul(estimatedGasForDeployment);
    const estimatedCostEth = ethers.utils.formatEther(estimatedCost);
    
    console.log(`💰 预估部署成本: ${estimatedCostEth} ETH`);
    
    // 检查配置的 Gas 价格
    if (process.env.GAS_PRICE) {
      const configuredGasPrice = ethers.BigNumber.from(process.env.GAS_PRICE);
      const configuredGasPriceGwei = ethers.utils.formatUnits(configuredGasPrice, 'gwei');
      
      console.log(`⚙️  配置的 Gas 价格: ${configuredGasPriceGwei} gwei`);
      
      // 如果配置的 Gas 价格过低，给出警告
      if (configuredGasPrice.lt(gasPrice.div(2))) {
        console.warn('⚠️  配置的 Gas 价格可能过低，交易可能失败');
      }
    }
    
  } catch (error) {
    console.warn(`⚠️  Gas 估算失败: ${error.message}`);
  }
}

/**
 * 检查现有合约
 */
async function checkExistingContracts() {
  console.log('📋 检查现有合约部署...');
  
  const contractAddresses = {
    'DICE_GAME_ADDRESS': process.env.DICE_GAME_ADDRESS,
    'BETTING_CONTRACT_ADDRESS': process.env.BETTING_CONTRACT_ADDRESS,
    'PAYOUT_CONTRACT_ADDRESS': process.env.PAYOUT_CONTRACT_ADDRESS,
    'MINING_CONTRACT_ADDRESS': process.env.MINING_CONTRACT_ADDRESS,
    'MLHG_TOKEN_ADDRESS': process.env.MLHG_TOKEN_ADDRESS
  };
  
  for (const [envName, address] of Object.entries(contractAddresses)) {
    if (address && ethers.utils.isAddress(address)) {
      try {
        const code = await ethers.provider.getCode(address);
        if (code !== '0x') {
          console.log(`✅ ${envName}: 合约已部署 (${address})`);
        } else {
          console.warn(`⚠️  ${envName}: 地址无合约代码 (${address})`);
        }
      } catch (error) {
        console.warn(`⚠️  ${envName}: 无法验证合约 (${address})`);
      }
    }
  }
}

/**
 * 主检查函数
 */
async function main() {
  console.log('🚀 开始部署前检查...');
  console.log('=' .repeat(60));
  
  try {
    // 基础安全检查
    securityCheck.validatePrivateKey();
    securityCheck.validateGasConfig();
    securityCheck.validateContractAddresses();
    
    // 部署相关检查
    checkDeploymentConfig();
    await checkNetworkConnection();
    await securityCheck.checkAccountBalance();
    await checkGasEstimation();
    await checkCompilation();
    await checkExistingContracts();
    
    console.log('=' .repeat(60));
    console.log('🎉 所有部署前检查通过！可以安全部署。');
    console.log('💡 建议：部署前请再次确认网络和配置无误。');
    
  } catch (error) {
    console.log('=' .repeat(60));
    console.error('💥 部署前检查失败:', error.message);
    console.log('🛠️  请修复上述问题后重新运行检查。');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  checkCompilation,
  checkDeploymentConfig,
  checkNetworkConnection,
  checkGasEstimation,
  checkExistingContracts
};