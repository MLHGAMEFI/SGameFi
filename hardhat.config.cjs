require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Sonic Blaze Testnet配置 - 2024年优化版本
    "sonic-testnet": {
      url: "https://rpc.blaze.soniclabs.com",
      chainId: 57054,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      // 根据Sonic测试网实际情况优化gas配置
      gasPrice: 2000000000, // 2 gwei - 基于当前网络基础费用1 gwei优化
      gas: 8000000, // 保持较高的gas限制以支持复杂交易
      // 添加超时和重试配置
      timeout: 60000, // 60秒超时
      // 针对Sonic网络的特殊配置
      allowUnlimitedContractSize: true,
    },
    // 本地开发网络
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    // Sonic区块链浏览器配置（如果有的话）
    apiKey: {
      sonicTestnet: process.env.SONIC_API_KEY || "dummy",
    },
    customChains: [
      {
        network: "sonic-testnet",
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