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
      viaIR: true,
    },
  },
  networks: {
    // Sonic Blaze Testnet配置
    sonicTestnet: {
      url: "https://rpc.blaze.soniclabs.com",
      chainId: 57054,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 1000000000, // 1 gwei
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