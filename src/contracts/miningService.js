import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, MINING_CONTRACT_ABI, TOKEN_CONFIG } from './config.js';

/**
 * @notice 挖矿服务类
 * @dev 处理与挖矿合约的交互
 */
class MiningService {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.miningContract = null;
        this.isInitialized = false;
    }

    /**
     * @notice 初始化挖矿服务
     * @param {Object} provider Web3 provider
     * @param {Object} signer 签名者
     */
    async initialize(provider, signer) {
        try {
            this.provider = provider;
            this.signer = signer;

            // 初始化挖矿合约
            this.miningContract = new ethers.Contract(
                CONTRACT_ADDRESSES.MINING_CONTRACT,
                MINING_CONTRACT_ABI,
                signer
            );

            this.isInitialized = true;
            console.log('挖矿服务初始化成功');
        } catch (error) {
            console.error('挖矿服务初始化失败:', error);
            throw error;
        }
    }

    /**
     * @notice 检查服务是否已初始化
     */
    _checkInitialized() {
        if (!this.isInitialized) {
            throw new Error('挖矿服务未初始化');
        }
    }

    /**
     * @notice 获取玩家挖矿统计信息
     * @param {string} playerAddress 玩家地址
     * @returns {Object} 挖矿统计信息
     */
    async getPlayerMiningStats(playerAddress) {
        this._checkInitialized();
        
        try {
            const stats = await this.miningContract.getPlayerMiningStats(playerAddress);
            
            return {
                totalMined: stats[0].toString(),
                totalRewards: ethers.formatEther(stats[1]),
                pendingRewards: ethers.formatEther(stats[2]),
                pendingRewardsWei: stats[2]
            };
        } catch (error) {
            console.error('获取玩家挖矿统计失败:', error);
            throw error;
        }
    }

    /**
     * @notice 获取玩家挖矿历史
     * @param {string} playerAddress 玩家地址
     * @returns {Array} 挖矿历史记录
     */
    async getPlayerMiningHistory(playerAddress) {
        this._checkInitialized();
        
        try {
            const requestIds = await this.miningContract.getPlayerMiningHistory(playerAddress);
            
            if (requestIds.length === 0) {
                return [];
            }

            // 批量获取挖矿信息
            const miningInfos = await this.miningContract.getBatchMiningInfo(requestIds);
            
            return miningInfos.map((info, index) => ({
                requestId: requestIds[index].toString(),
                player: info.player,
                tokenAddress: info.tokenAddress,
                originalBetAmount: ethers.formatEther(info.originalBetAmount),
                miningReward: ethers.formatEther(info.miningReward),
                betCreatedAt: new Date(Number(info.betCreatedAt) * 1000),
                betSettledAt: new Date(Number(info.betSettledAt) * 1000),
                minedAt: info.minedAt > 0 ? new Date(Number(info.minedAt) * 1000) : null,
                status: this._getStatusText(info.status),
                statusCode: info.status,
                playerChoice: info.playerChoice,
                diceResult: info.diceResult,
                gameResult: info.gameResult
            }));
        } catch (error) {
            console.error('获取玩家挖矿历史失败:', error);
            throw error;
        }
    }

    /**
     * @notice 获取挖矿记录详情
     * @param {string} requestId 请求ID
     * @returns {Object} 挖矿记录详情
     */
    async getMiningInfo(requestId) {
        this._checkInitialized();
        
        try {
            const info = await this.miningContract.getMiningInfo(requestId);
            
            if (info.requestId.toString() === '0') {
                return null;
            }

            return {
                requestId: info.requestId.toString(),
                player: info.player,
                tokenAddress: info.tokenAddress,
                originalBetAmount: ethers.formatEther(info.originalBetAmount),
                miningReward: ethers.formatEther(info.miningReward),
                betCreatedAt: new Date(Number(info.betCreatedAt) * 1000),
                betSettledAt: new Date(Number(info.betSettledAt) * 1000),
                minedAt: info.minedAt > 0 ? new Date(Number(info.minedAt) * 1000) : null,
                status: this._getStatusText(info.status),
                statusCode: info.status,
                playerChoice: info.playerChoice,
                diceResult: info.diceResult,
                gameResult: info.gameResult
            };
        } catch (error) {
            console.error('获取挖矿记录详情失败:', error);
            throw error;
        }
    }

    /**
     * @notice 领取挖矿奖励
     * @returns {Object} 交易结果
     */
    async claimRewards() {
        this._checkInitialized();
        
        try {
            // 检查待领取奖励
            const playerAddress = await this.signer.getAddress();
            const stats = await this.getPlayerMiningStats(playerAddress);
            
            if (parseFloat(stats.pendingRewards) === 0) {
                throw new Error('没有可领取的奖励');
            }

            // 估算Gas费用
            const gasEstimate = await this.miningContract.claimRewards.estimateGas();
            
            // 执行领取
            const tx = await this.miningContract.claimRewards({
                gasLimit: gasEstimate * BigInt(120) / BigInt(100) // 增加20%的Gas缓冲
            });

            console.log('领取奖励交易已提交:', tx.hash);
            
            // 等待交易确认
            const receipt = await tx.wait();
            
            // 解析事件获取领取金额
            let claimedAmount = '0';
            for (const log of receipt.logs) {
                try {
                    const parsed = this.miningContract.interface.parseLog(log);
                    if (parsed.name === 'RewardsClaimed') {
                        claimedAmount = ethers.formatEther(parsed.args.amount);
                        break;
                    }
                } catch (e) {
                    // 忽略解析失败的日志
                }
            }

            return {
                success: true,
                transactionHash: tx.hash,
                claimedAmount,
                gasUsed: receipt.gasUsed.toString(),
                blockNumber: receipt.blockNumber
            };
        } catch (error) {
            console.error('领取奖励失败:', error);
            return {
                success: false,
                error: error.message || '领取奖励失败'
            };
        }
    }

    /**
     * @notice 获取合约统计信息
     * @returns {Object} 合约统计信息
     */
    async getContractStats() {
        this._checkInitialized();
        
        try {
            const stats = await this.miningContract.getContractStats();
            
            return {
                totalMiningRecords: stats[0].toString(),
                totalCompletedMining: stats[1].toString(),
                totalRewardsDistributed: ethers.formatEther(stats[2]),
                contractBalance: ethers.formatEther(stats[3])
            };
        } catch (error) {
            console.error('获取合约统计失败:', error);
            throw error;
        }
    }

    /**
     * @notice 获取当前挖矿比例
     * @returns {string} 当前挖矿比例
     */
    async getCurrentMiningRatio() {
        this._checkInitialized();
        
        try {
            const ratio = await this.miningContract.getCurrentMiningRatio();
            return ratio.toString();
        } catch (error) {
            console.error('获取当前挖矿比例失败:', error);
            throw error;
        }
    }

    /**
     * @notice 计算挖矿奖励
     * @param {string} betAmount 投注金额（以wei为单位）
     * @param {number} settledAt 结算时间戳
     * @returns {string} 预计奖励金额
     */
    async calculateMiningReward(betAmount, settledAt) {
        this._checkInitialized();
        
        try {
            const reward = await this.miningContract.calculateMiningReward(betAmount, settledAt);
            return ethers.formatEther(reward);
        } catch (error) {
            console.error('计算挖矿奖励失败:', error);
            throw error;
        }
    }

    /**
     * @notice 监听挖矿完成事件
     * @param {Function} callback 回调函数
     */
    onMiningCompleted(callback) {
        this._checkInitialized();
        
        this.miningContract.on('MiningCompleted', (requestId, player, rewardAmount, minedAt, event) => {
            callback({
                requestId: requestId.toString(),
                player,
                rewardAmount: ethers.formatEther(rewardAmount),
                minedAt: new Date(Number(minedAt) * 1000),
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        });
    }

    /**
     * @notice 监听奖励领取事件
     * @param {Function} callback 回调函数
     */
    onRewardsClaimed(callback) {
        this._checkInitialized();
        
        this.miningContract.on('RewardsClaimed', (player, amount, timestamp, event) => {
            callback({
                player,
                amount: ethers.formatEther(amount),
                timestamp: new Date(Number(timestamp) * 1000),
                transactionHash: event.transactionHash,
                blockNumber: event.blockNumber
            });
        });
    }

    /**
     * @notice 移除所有事件监听器
     */
    removeAllListeners() {
        if (this.miningContract) {
            this.miningContract.removeAllListeners();
        }
    }

    /**
     * @notice 获取状态文本
     * @param {number} status 状态码
     * @returns {string} 状态文本
     */
    _getStatusText(status) {
        const statusMap = {
            0: '待挖矿',
            1: '已完成',
            2: '已取消'
        };
        return statusMap[status] || '未知状态';
    }

    /**
     * @notice 获取代币符号
     * @param {string} tokenAddress 代币地址
     * @returns {string} 代币符号
     */
    getTokenSymbol(tokenAddress) {
        if (tokenAddress === ethers.ZeroAddress) {
            return 'S'; // 原生代币
        } else if (tokenAddress.toLowerCase() === CONTRACT_ADDRESSES.MLH_TOKEN?.toLowerCase()) {
            return 'MLH';
        } else if (tokenAddress.toLowerCase() === CONTRACT_ADDRESSES.MLHG_TOKEN?.toLowerCase()) {
            return 'MLHG';
        }
        return 'Unknown';
    }

    /**
     * @notice 格式化时间
     * @param {Date} date 日期对象
     * @returns {string} 格式化的时间字符串
     */
    formatTime(date) {
        if (!date) return '-';
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * @notice 格式化金额
     * @param {string} amount 金额字符串
     * @param {number} decimals 小数位数
     * @returns {string} 格式化的金额
     */
    formatAmount(amount, decimals = 4) {
        const num = parseFloat(amount);
        if (num === 0) return '0';
        if (num < 0.0001) return '< 0.0001';
        return num.toFixed(decimals);
    }
}

// 创建单例实例
const miningService = new MiningService();

export default miningService;