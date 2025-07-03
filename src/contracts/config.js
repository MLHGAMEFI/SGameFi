/**
 * 智能合约配置文件
 * 包含合约地址、ABI和网络配置
 */

// Sonic Blaze Testnet 配置
export const NETWORK_CONFIG = {
  chainId: 57054,
  chainIdHex: '0xdede',
  name: 'Sonic Blaze Testnet',
  rpcUrl: 'https://rpc.blaze.soniclabs.com',
  explorer: 'https://testnet.sonicscan.org',
  nativeCurrency: {
    name: 'Sonic',
    symbol: 'S',
    decimals: 18
  }
}

// 合约地址配置
export const CONTRACT_ADDRESSES = {
  BETTING_CONTRACT: '0x4A763ed78e2b840c21Fe02e050CC961fC10B852F',
  DICE_GAME: '0xfc9D49702FfB690d39f268F4Fb96DFfA4f3aF3ac',
  MLH_TOKEN: '0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF',
  MLHG_TOKEN: '0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb',
  VRF_COORDINATOR: '0x6E3efcB244e74Cb898A7961061fAA43C3cf79691',
  MINING_CONTRACT: '0xF77935Db465081E06169907580EaC9a123059a8B',
  PAYOUT_CONTRACT: '0x91D5c382fEd5B9415D0B43Ae21E70f0531092A5F'
}

// 代币配置
export const TOKEN_CONFIG = {
  NATIVE: {
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'S',
    name: 'Sonic',
    decimals: 18
  },
  MLH: {
    address: CONTRACT_ADDRESSES.MLH_TOKEN,
    symbol: 'MLH',
    name: 'MLH Token',
    decimals: 18
  },
  MLHG: {
    address: CONTRACT_ADDRESSES.MLHG_TOKEN,
    symbol: 'MLHG',
    name: 'MLHG Token',
    decimals: 18
  }
}

// 投注配置
export const BETTING_CONFIG = {
  MIN_BET_AMOUNT: 1,
  MAX_BET_AMOUNT: 1000,
  PAYOUT_RATIO: 1.9
}

// BettingContract ABI (简化版，只包含需要的函数)
export const BETTING_CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isEvenChoice",
        "type": "bool"
      }
    ],
    "name": "placeBet",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getVRFCost",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "getPlayerBets",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "name": "getBetInfo",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "requestId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "uint96",
            "name": "betAmount",
            "type": "uint96"
          },
          {
            "internalType": "address",
            "name": "tokenAddress",
            "type": "address"
          },
          {
            "internalType": "uint96",
            "name": "payoutAmount",
            "type": "uint96"
          },
          {
            "internalType": "uint64",
            "name": "createdAt",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "settledAt",
            "type": "uint64"
          },
          {
            "internalType": "enum BettingContract.BetStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "isEvenChoice",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "diceResult",
            "type": "bool"
          }
        ],
        "internalType": "struct BettingContract.BetInfo",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "isEvenChoice",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "createdAt",
        "type": "uint256"
      }
    ],
    "name": "BetConfirmed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "payoutAmount",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "playerChoice",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "diceResult",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "isWinner",
        "type": "bool"
      }
    ],
    "name": "BetSettled",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "paused",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]

// MiningContract ABI
export const MINING_CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      }
    ],
    "name": "createMiningRecord",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "name": "mine",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256[]",
        "name": "requestIds",
        "type": "uint256[]"
      }
    ],
    "name": "claimRewards",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "getPlayerMiningStats",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "totalMined",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalRewards",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "claimedRewards",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "pendingRewards",
            "type": "uint256"
          }
        ],
        "internalType": "struct MiningContract.PlayerStats",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "player",
        "type": "address"
      }
    ],
    "name": "getPlayerMiningHistory",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      }
    ],
    "name": "getMiningRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "requestId",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "player",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "betAmount",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "tokenAddress",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "rewardAmount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "createdAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "minedAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "claimedAt",
            "type": "uint256"
          },
          {
            "internalType": "enum MiningContract.MiningStatus",
            "name": "status",
            "type": "uint8"
          }
        ],
        "internalType": "struct MiningContract.MiningRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getContractStats",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "totalMiningRecords",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalRewardsDistributed",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "totalPlayerCount",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "currentMiningRatio",
            "type": "uint256"
          }
        ],
        "internalType": "struct MiningContract.ContractStats",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      }
    ],
    "name": "calculateMiningReward",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "betAmount",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "tokenAddress",
        "type": "address"
      }
    ],
    "name": "MiningRecordCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "requestId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "rewardAmount",
        "type": "uint256"
      }
    ],
    "name": "MiningCompleted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "player",
        "type": "address"
      },
      {
        "internalType": "uint256[]",
        "name": "requestIds",
        "type": "uint256[]"
      },
      {
        "internalType": "uint256",
        "name": "totalAmount",
        "type": "uint256"
      }
    ],
    "name": "RewardsClaimed",
    "type": "event"
  }
]

// ERC20 Token ABI (简化版)
export const ERC20_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "approve",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "spender",
        "type": "address"
      }
    ],
    "name": "allowance",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "balanceOf",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
]