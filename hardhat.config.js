require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// 安全性验证：检查必要的环境变量
if (!process.env.PRIVATE_KEY) {
  throw new Error('请在.env文件中设置 PRIVATE_KEY');
}

// 验证私钥格式
if (!process.env.PRIVATE_KEY.startsWith('0x')) {
  throw new Error('PRIVATE_KEY 必须以 0x 开头');
}

// 验证私钥长度
if (process.env.PRIVATE_KEY.length !== 66) {
  throw new Error('PRIVATE_KEY 长度必须为 66 个字符（包含 0x 前缀）');
}

// 验证 RPC URL（可选但推荐）
if (process.env.SONIC_TESTNET_RPC && !process.env.SONIC_TESTNET_RPC.startsWith('http')) {
  throw new Error('SONIC_TESTNET_RPC 必须是有效的 HTTP/HTTPS URL');
}

console.log('✅ 环境变量验证通过');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    // Sonic Blaze Testnet配置
    sonicTestnet: {
      url: process.env.SONIC_TESTNET_RPC || "https://rpc.blaze.soniclabs.com",
      chainId: 57054,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: parseInt(process.env.GAS_PRICE) || 1000000000, // 1 gwei
      gas: parseInt(process.env.GAS_LIMIT) || 8000000,
      timeout: 60000, // 60秒超时
    },
    // Sonic 主网配置
    sonicMainnet: {
      url: process.env.SONIC_MAINNET_RPC || "https://rpc.soniclabs.com",
      chainId: 146,
      accounts: [process.env.PRIVATE_KEY],
      gasPrice: parseInt(process.env.GAS_PRICE) || 20000000000, // 20 gwei
      gas: parseInt(process.env.GAS_LIMIT) || 8000000,
      timeout: 60000,
    },
    // 本地开发网络
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      timeout: 60000,
    },
    // Hardhat 网络
    hardhat: {
      chainId: 31337,
      gas: 12000000,
      blockGasLimit: 12000000,
      allowUnlimitedContractSize: true,
    },
  },
  etherscan: {
    // Sonic区块链浏览器配置（如果有的话）
    apiKey: {
      sonicTestnet: process.env.SONIC_API_KEY || "dummy",
    },
    customChains: [
      {
        network: "sonicTestnet",
        chainId: 57054,
        urls: {
          apiURL: "https://api.sonicscan.org/api",
          browserURL: "https://sonicscan.org",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
};