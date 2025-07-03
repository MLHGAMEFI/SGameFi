const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * Sonic Blaze Testnet 配置信息
 * 网络: Sonic Blaze Testnet
 * 链ID: 57054
 * 符号: S
 * RPC URL: https://rpc.blaze.soniclabs.com
 * 区块浏览器: https://testnet.soniclabs.com
 * 水龙头: https://testnet.soniclabs.com/account
 * 
 * 代币合约地址:
 * - MLHG Token: 0x123...(待部署)
 * - MLH测试币: 0x456...(待部署) 
 * - USDC测试币: 0x789...(待部署)
 */
const SONIC_CONFIG = {
    // Gas 配置 - 针对Sonic测试网优化
    gasPrice: ethers.parseUnits('2', 'gwei'), // 2 Gwei (从25 Gwei优化)
    gasLimit: {
        submitPayout: 400000,    // 提交派奖请求
        executePayout: 600000,   // 执行派奖
        default: 300000          // 默认gas限制
    },
    
    // 交易重试配置
    maxRetries: 3,
    retryDelay: 2000, // 2秒基础延迟
    
    // 确认等待配置
    confirmations: 1, // Sonic网络快速确认
    
    // 网络配置
    chainId: 57054,
    networkName: 'Sonic Blaze Testnet'
};

/**
 * @title 自动派奖服务
 * @notice 监听BettingContract的BetSettled事件，自动处理派奖
 * @dev 链下监听 + 自动执行方案
 * @author SGameFi Team
 */
class AutoPayoutService {
    constructor() {
        this.bettingContract = null;
        this.payoutContract = null;
        this.provider = null;
        this.signer = null;
        this.isRunning = false;
        this.processedEvents = new Set(); // 防止重复处理
        this.retryQueue = new Map(); // 重试队列
        this.maxRetries = SONIC_CONFIG.maxRetries;
        this.retryDelay = SONIC_CONFIG.retryDelay;
        
        // Sonic测试网优化配置
        this.gasConfig = {
            gasPrice: SONIC_CONFIG.gasPrice,
            gasLimit: SONIC_CONFIG.gasLimit
        };
        
        // 监听配置
        this.eventFilter = null;
        this.lastProcessedBlock = 0;
        this.blockConfirmations = SONIC_CONFIG.confirmations;
    }

    /**
     * @notice 初始化自动派奖服务
     */
    async initialize() {
        try {
            console.log('🚀 初始化Sonic测试网自动派奖服务...');
            
            // 获取provider和signer
            this.provider = ethers.provider;
            [this.signer] = await ethers.getSigners();
            
            console.log(`📋 操作员地址: ${this.signer.address}`);
            
            // 验证Sonic测试网络
            await this.verifyNetwork();
            
            // 显示账户余额
            const balance = await this.provider.getBalance(this.signer.address);
            console.log(`💰 账户余额: ${ethers.formatEther(balance)} S`);
            
            // 显示Sonic配置信息
            console.log(`⚙️  Sonic配置:`);
            console.log(`   Gas价格: ${ethers.formatUnits(SONIC_CONFIG.gasPrice, 'gwei')} Gwei`);
            console.log(`   提交派奖Gas限制: ${SONIC_CONFIG.gasLimit.submitPayout.toLocaleString()}`);
            console.log(`   执行派奖Gas限制: ${SONIC_CONFIG.gasLimit.executePayout.toLocaleString()}`);
            console.log(`   最大重试次数: ${SONIC_CONFIG.maxRetries}`);
            console.log(`   确认等待数: ${SONIC_CONFIG.confirmations}`);
            
            // 读取部署信息
            const deploymentFile = path.join(__dirname, '..', 'deployments', 'sonic-testnet-complete-1751281033428.json');
            if (!fs.existsSync(deploymentFile)) {
                throw new Error('部署文件不存在');
            }
            
            const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
            
            // 获取合约实例
            this.bettingContract = await ethers.getContractAt(
                'BettingContract',
                deployment.contracts.bettingContract,
                this.signer
            );
            
            this.payoutContract = await ethers.getContractAt(
                'PayoutContract', 
                deployment.contracts.payoutContract,
                this.signer
            );
            
            console.log(`📋 BettingContract: ${await this.bettingContract.getAddress()}`);
            console.log(`📋 PayoutContract: ${await this.payoutContract.getAddress()}`);
            
            // 验证权限
            await this.verifyPermissions();
            
            // 设置事件过滤器
            this.eventFilter = this.bettingContract.filters.BetSettled();
            
            // 获取当前区块号
            this.lastProcessedBlock = await this.provider.getBlockNumber();
            console.log(`📊 当前区块号: ${this.lastProcessedBlock}`);
            
            console.log('✅ 自动派奖服务初始化完成');
            
        } catch (error) {
            console.error('❌ 初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * @notice 验证Sonic测试网络连接
     */
    async verifyNetwork() {
        try {
            const network = await this.provider.getNetwork();
            console.log(`🌐 网络: ${network.name} (Chain ID: ${network.chainId})`);
            
            // 验证链ID
            if (Number(network.chainId) !== SONIC_CONFIG.chainId) {
                throw new Error(`错误的网络! 期望链ID: ${SONIC_CONFIG.chainId}, 当前链ID: ${network.chainId}`);
            }
            
            // 检查当前网络gas价格
            const currentGasPrice = await this.provider.getFeeData();
            if (currentGasPrice.gasPrice) {
                const currentGasPriceGwei = ethers.formatUnits(currentGasPrice.gasPrice, 'gwei');
                console.log(`📊 当前网络Gas价格: ${currentGasPriceGwei} Gwei`);
                
                // 如果当前gas价格显著高于配置，发出警告
                const configGasPriceGwei = ethers.formatUnits(SONIC_CONFIG.gasPrice, 'gwei');
                if (parseFloat(currentGasPriceGwei) > parseFloat(configGasPriceGwei) * 2) {
                    console.log(`⚠️  警告: 当前网络Gas价格(${currentGasPriceGwei} Gwei)显著高于配置(${configGasPriceGwei} Gwei)`);
                }
            }
            
            console.log(`✅ Sonic测试网络验证通过`);
            
        } catch (error) {
            console.error('❌ 网络验证失败:', error.message);
            throw error;
        }
    }

    /**
     * @notice 验证操作权限
     */
    async verifyPermissions() {
        try {
            // 检查PayoutContract的OPERATOR_ROLE权限
            const OPERATOR_ROLE = await this.payoutContract.OPERATOR_ROLE();
            const hasOperatorRole = await this.payoutContract.hasRole(OPERATOR_ROLE, this.signer.address);
            
            if (!hasOperatorRole) {
                throw new Error(`地址 ${this.signer.address} 没有PayoutContract的OPERATOR_ROLE权限`);
            }
            
            console.log('✅ 权限验证通过');
            
        } catch (error) {
            console.error('❌ 权限验证失败:', error.message);
            throw error;
        }
    }

    /**
     * @notice 启动自动派奖服务
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  服务已在运行中');
            return;
        }
        
        console.log('🚀 启动自动派奖服务...');
        this.isRunning = true;
        
        // 处理历史未处理的事件
        await this.processHistoricalEvents();
        
        // 开始监听新事件
        this.startEventListener();
        
        // 启动重试处理器
        this.startRetryProcessor();
        
        console.log('✅ 自动派奖服务已启动');
        console.log('📡 正在监听BetSettled事件...');
    }

    /**
     * @notice 处理历史未处理的事件
     */
    async processHistoricalEvents() {
        try {
            console.log('🔍 检查历史未处理事件...');
            
            // 查询最近1000个区块的事件
            const fromBlock = Math.max(0, this.lastProcessedBlock - 1000);
            const toBlock = this.lastProcessedBlock;
            
            const events = await this.bettingContract.queryFilter(
                this.eventFilter,
                fromBlock,
                toBlock
            );
            
            console.log(`📊 找到 ${events.length} 个历史BetSettled事件`);
            
            for (const event of events) {
                await this.processEvent(event);
            }
            
        } catch (error) {
            console.error('❌ 处理历史事件失败:', error.message);
        }
    }

    /**
     * @notice 开始监听事件
     */
    startEventListener() {
        // 监听新的BetSettled事件
        this.bettingContract.on('BetSettled', async (
            requestId,
            player,
            betAmount,
            payoutAmount,
            playerChoice,
            diceResult,
            isWinner,
            event
        ) => {
            try {
                console.log(`\n🎲 检测到新的BetSettled事件:`);
                console.log(`   RequestId: ${requestId}`);
                console.log(`   Player: ${player}`);
                console.log(`   IsWinner: ${isWinner}`);
                
                await this.processEvent(event);
                
            } catch (error) {
                console.error('❌ 处理事件失败:', error.message);
                // 添加到重试队列
                this.addToRetryQueue(event);
            }
        });
        
        // 监听区块更新
        this.provider.on('block', (blockNumber) => {
            if (blockNumber > this.lastProcessedBlock) {
                this.lastProcessedBlock = blockNumber;
            }
        });
    }

    /**
     * @notice 处理BetSettled事件
     * @param {Object} event 事件对象
     */
    async processEvent(event) {
        const eventId = `${event.transactionHash}-${event.logIndex}`;
        
        // 防止重复处理
        if (this.processedEvents.has(eventId)) {
            return;
        }
        
        try {
            // 等待足够的确认数
            const currentBlock = await this.provider.getBlockNumber();
            if (currentBlock - event.blockNumber < this.blockConfirmations) {
                console.log(`⏳ 等待更多确认 (${currentBlock - event.blockNumber}/${this.blockConfirmations})`);
                return;
            }
            
            const {
                requestId,
                player,
                betAmount,
                payoutAmount,
                playerChoice,
                diceResult,
                isWinner
            } = event.args;
            
            // 只处理中奖的投注
            if (!isWinner) {
                console.log(`📝 RequestId ${requestId}: 玩家未中奖，跳过派奖`);
                this.processedEvents.add(eventId);
                return;
            }
            
            console.log(`\n💰 处理中奖派奖:`);
            console.log(`   RequestId: ${requestId}`);
            console.log(`   Player: ${player}`);
            console.log(`   PayoutAmount: ${ethers.formatEther(payoutAmount)} ETH`);
            
            // 获取投注详细信息
            const betInfo = await this.bettingContract.bets(requestId);
            
            // 检查是否已经提交过派奖请求
            const existingPayout = await this.payoutContract.payouts(requestId);
            if (existingPayout.player !== ethers.ZeroAddress) {
                console.log(`⚠️  RequestId ${requestId}: 派奖请求已存在，跳过`);
                this.processedEvents.add(eventId);
                return;
            }
            
            // 提交派奖请求
            await this.submitPayoutRequest({
                requestId,
                player,
                tokenAddress: betInfo.tokenAddress,
                payoutAmount,
                betAmount,
                createdAt: betInfo.createdAt,
                settledAt: betInfo.settledAt,
                playerChoice,
                diceResult,
                isWinner
            });
            
            // 执行派奖
            await this.executePayout(requestId);
            
            // 标记为已处理
            this.processedEvents.add(eventId);
            
            console.log(`✅ RequestId ${requestId}: 派奖处理完成`);
            
        } catch (error) {
            console.error(`❌ 处理事件失败 (${eventId}):`, error.message);
            // 添加到重试队列
            this.addToRetryQueue(event);
        }
    }

    /**
     * @notice 提交派奖请求
     * @param {Object} payoutData 派奖数据
     */
    async submitPayoutRequest(payoutData) {
        let retryCount = 0;
        const maxRetries = SONIC_CONFIG.maxRetries;
        
        while (retryCount <= maxRetries) {
            try {
                console.log(`📤 提交派奖请求: RequestId ${payoutData.requestId}${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
                
                const tx = await this.payoutContract.submitPayoutRequest(
                    payoutData.requestId,
                    payoutData.player,
                    payoutData.tokenAddress,
                    payoutData.payoutAmount,
                    payoutData.betAmount,
                    payoutData.createdAt,
                    payoutData.settledAt,
                    payoutData.playerChoice,
                    payoutData.diceResult,
                    payoutData.isWinner,
                    {
                        gasPrice: SONIC_CONFIG.gasPrice,
                        gasLimit: SONIC_CONFIG.gasLimit.submitPayout
                    }
                );
                
                console.log(`⏳ 等待交易确认: ${tx.hash}`);
                const receipt = await tx.wait(SONIC_CONFIG.confirmations);
                console.log(`✅ 派奖请求已提交 (Gas Used: ${receipt.gasUsed.toLocaleString()})`);
                
                return; // 成功，退出重试循环
                
            } catch (error) {
                retryCount++;
                console.error(`❌ 提交派奖请求失败 (尝试 ${retryCount}/${maxRetries + 1}):`, error.message);
                
                if (retryCount > maxRetries) {
                    throw error; // 达到最大重试次数，抛出错误
                }
                
                // 等待后重试
                const delay = SONIC_CONFIG.retryDelay * Math.pow(2, retryCount - 1);
                console.log(`⏳ ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * @notice 执行派奖
     * @param {BigInt} requestId 请求ID
     */
    async executePayout(requestId) {
        let retryCount = 0;
        const maxRetries = SONIC_CONFIG.maxRetries;
        
        while (retryCount <= maxRetries) {
            try {
                console.log(`💸 执行派奖: RequestId ${requestId}${retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : ''}`);
                
                const tx = await this.payoutContract.executePayout(
                    requestId,
                    {
                        gasPrice: SONIC_CONFIG.gasPrice,
                        gasLimit: SONIC_CONFIG.gasLimit.executePayout
                    }
                );
                
                console.log(`⏳ 等待派奖交易确认: ${tx.hash}`);
                const receipt = await tx.wait(SONIC_CONFIG.confirmations);
                console.log(`✅ 派奖执行完成 (Gas Used: ${receipt.gasUsed.toLocaleString()})`);
                
                return; // 成功，退出重试循环
                
            } catch (error) {
                retryCount++;
                console.error(`❌ 执行派奖失败 (尝试 ${retryCount}/${maxRetries + 1}):`, error.message);
                
                if (retryCount > maxRetries) {
                    throw error; // 达到最大重试次数，抛出错误
                }
                
                // 等待后重试
                const delay = SONIC_CONFIG.retryDelay * Math.pow(2, retryCount - 1);
                console.log(`⏳ ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * @notice 添加到重试队列
     * @param {Object} event 事件对象
     */
    addToRetryQueue(event) {
        const eventId = `${event.transactionHash}-${event.logIndex}`;
        
        if (!this.retryQueue.has(eventId)) {
            this.retryQueue.set(eventId, {
                event,
                retryCount: 0,
                nextRetryTime: Date.now() + this.retryDelay
            });
            console.log(`🔄 添加到重试队列: ${eventId}`);
        }
    }

    /**
     * @notice 启动重试处理器
     */
    startRetryProcessor() {
        setInterval(async () => {
            if (this.retryQueue.size === 0) return;
            
            const now = Date.now();
            const toRetry = [];
            
            for (const [eventId, retryData] of this.retryQueue.entries()) {
                if (now >= retryData.nextRetryTime) {
                    toRetry.push({ eventId, retryData });
                }
            }
            
            for (const { eventId, retryData } of toRetry) {
                try {
                    console.log(`🔄 重试处理事件: ${eventId} (第${retryData.retryCount + 1}次)`);
                    
                    await this.processEvent(retryData.event);
                    
                    // 成功处理，从重试队列移除
                    this.retryQueue.delete(eventId);
                    console.log(`✅ 重试成功: ${eventId}`);
                    
                } catch (error) {
                    retryData.retryCount++;
                    
                    if (retryData.retryCount >= this.maxRetries) {
                        console.error(`❌ 重试失败，已达最大重试次数: ${eventId}`);
                        this.retryQueue.delete(eventId);
                    } else {
                        retryData.nextRetryTime = now + this.retryDelay * Math.pow(2, retryData.retryCount);
                        console.log(`⏳ 将在 ${retryData.nextRetryTime - now}ms 后重试`);
                    }
                }
            }
        }, 10000); // 每10秒检查一次重试队列
    }

    /**
     * @notice 停止服务
     */
    async stop() {
        if (!this.isRunning) {
            console.log('⚠️  服务未运行');
            return;
        }
        
        console.log('🛑 停止自动派奖服务...');
        this.isRunning = false;
        
        // 移除所有监听器
        this.bettingContract.removeAllListeners('BetSettled');
        this.provider.removeAllListeners('block');
        
        console.log('✅ 自动派奖服务已停止');
    }

    /**
     * @notice 获取服务状态
     */
    async getStatus() {
        const currentBlock = await this.provider.getBlockNumber();
        const balance = await this.provider.getBalance(this.signer.address);
        
        const status = {
            isRunning: this.isRunning,
            lastProcessedBlock: this.lastProcessedBlock,
            currentBlock: currentBlock,
            processedEventsCount: this.processedEvents.size,
            retryQueueSize: this.retryQueue.size,
            operatorAddress: this.signer?.address,
            balance: ethers.formatEther(balance),
            gasConfig: this.gasConfig
        };
        
        console.log('\n📊 Sonic自动派奖服务状态:');
        console.log(`   运行状态: ${status.isRunning ? '✅ 运行中' : '❌ 已停止'}`);
        console.log(`   当前区块: ${status.currentBlock.toLocaleString()}`);
        console.log(`   最后处理区块: ${status.lastProcessedBlock.toLocaleString()}`);
        console.log(`   区块差距: ${status.currentBlock - status.lastProcessedBlock}`);
        console.log(`   已处理事件数: ${status.processedEventsCount}`);
        console.log(`   重试队列大小: ${status.retryQueueSize}`);
        console.log(`   操作员地址: ${status.operatorAddress}`);
        console.log(`   账户余额: ${status.balance} S`);
        
        // 余额警告 (Sonic测试网)
        if (parseFloat(status.balance) < 0.1) {
            console.log(`⚠️  警告: 账户余额不足 (${status.balance} S)，请及时充值`);
        }
        
        // Sonic网络监控
        await this.monitorSonicNetwork();
        
        return status;
    }
    
    /**
     * @notice 监控Sonic网络状态
     */
    async monitorSonicNetwork() {
        try {
            console.log('\n🔍 Sonic网络监控:');
            
            // 检查区块高度
            const currentBlock = await this.provider.getBlockNumber();
            console.log(`   当前区块高度: ${currentBlock.toLocaleString()}`);
            
            // 检查Gas价格
            const feeData = await this.provider.getFeeData();
            if (feeData.gasPrice) {
                const currentGasPrice = ethers.formatUnits(feeData.gasPrice, 'gwei');
                const configGasPrice = ethers.formatUnits(SONIC_CONFIG.gasPrice, 'gwei');
                console.log(`   当前Gas价格: ${currentGasPrice} Gwei (配置: ${configGasPrice} Gwei)`);
                
                if (parseFloat(currentGasPrice) > parseFloat(configGasPrice) * 1.5) {
                    console.log(`   💡 建议: 当前Gas价格较高，考虑调整配置`);
                }
            }
            
            // 检查RPC延迟
            const startTime = Date.now();
            await this.provider.getBlockNumber();
            const rpcLatency = Date.now() - startTime;
            console.log(`   RPC延迟: ${rpcLatency}ms`);
            
            if (rpcLatency > 2000) {
                console.log(`   ⚠️  警告: RPC延迟较高 (${rpcLatency}ms)`);
            }
            
        } catch (error) {
            console.error('❌ Sonic网络监控失败:', error.message);
        }
    }
}

/**
 * @notice 主函数
 */
async function main() {
    const service = new AutoPayoutService();
    
    try {
        // 初始化服务
        await service.initialize();
        
        // 启动服务
        await service.start();
        
        // 设置优雅退出
        process.on('SIGINT', async () => {
            console.log('\n🛑 接收到退出信号...');
            await service.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n🛑 接收到终止信号...');
            await service.stop();
            process.exit(0);
        });
        
        // 定期显示状态
        setInterval(async () => {
            await service.getStatus();
        }, 300000); // 每5分钟显示一次状态
        
        // 保持进程运行
        console.log('\n🎯 自动派奖服务正在运行...');
        console.log('💡 按 Ctrl+C 停止服务');
        
    } catch (error) {
        console.error('❌ 服务启动失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ 未处理的错误:', error);
        process.exit(1);
    });
}

module.exports = { AutoPayoutService };