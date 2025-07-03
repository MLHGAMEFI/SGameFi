/**
 * SGameFi 项目类型定义
 */

// 合约相关类型
export interface ContractConfig {
  address: string;
  abi: any[];
  network: string;
}

// 游戏相关类型
export interface GameResult {
  player: string;
  betAmount: string;
  result: number;
  winAmount: string;
  timestamp: number;
}

export interface BettingConfig {
  minBet: string;
  maxBet: string;
  houseEdge: number;
  maxPayout: string;
}

// 挖矿相关类型
export interface MiningInfo {
  user: string;
  stakedAmount: string;
  rewards: string;
  lastClaimTime: number;
}

// 支付相关类型
export interface PayoutRequest {
  player: string;
  amount: string;
  gameId: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
}

// 网络配置类型
export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// 钱包相关类型
export interface WalletInfo {
  address: string;
  balance: string;
  network: string;
  connected: boolean;
}

// API 响应类型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 事件类型
export interface GameEvent {
  type: 'bet' | 'win' | 'lose' | 'payout';
  player: string;
  amount: string;
  timestamp: number;
  txHash?: string;
}