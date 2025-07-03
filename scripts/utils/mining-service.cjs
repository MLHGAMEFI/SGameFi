const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * @notice Sonic测试网优化配置
 * @dev 根据Sonic Blaze测试网特性优化gas费和交易参数
 * 
 * Sonic测试网关键信息:
 * - Network: Blaze Testnet
 * - Chain ID: 57054
 * - Symbol: S
 * - RPC URL: https://rpc.blaze.soniclabs.com
 * - Block Explorer: https://testnet.sonicscan.org/
 * 
 * 代币合约地址:
 * - MLHG合约地址: 0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb
 * - MLH测试币合约地址: 0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF
 * - USDC测试币合约地址: 0x44BAE34265D58238c8B3959740E07964f589ce01
 */
const SONIC_CONFIG = {
    // Sonic测试网基础gas费约1 Gwei
    gasPrice: ethers.parseUnits('2', 'gwei'), // 2 Gwei，略高于基础费用确保交易成功
    gasLimit: {
        submitMining: 300000,    // 提交挖矿请求
        executeMining: 500000,   // 执行挖矿
        default: 200000          // 默认操作
    },
    // 交易重试配置
    maxRetries: 3,
    retryDelay: 2000, // 2秒
    // 确认等待配置
    confirmations: 1  // Sonic网络确认速度快，1个确认即可
};

/**
 * @notice 自动挖矿服务脚本
 * @dev 监听BettingContract的BetSettled事件，自动为未中奖玩家提交挖矿请求并执行挖矿
 *      适配重新设计的MiningContract，支持动态减产机制和独立挖矿奖励发放
 */
class MiningService {
    constructor() {
        this.provider = null;
        this.bettingContract = null;
        this.miningContract = null;
        this.signer = null;
        this.isRunning = false;
        this.processedEvents = new Set(); // 防止重复处理
    }

    /**
     * @notice 初始化服务
     * @dev 包含Sonic测试网特定的初始化配置
     */
    async initialize() {
        console.log("🚀 初始化挖矿服务 - Sonic测试网优化版本...");
        
        // 获取签名者
        const [signer] = await ethers.getSigners();
        this.signer = signer;
        this.provider = signer.provider;
        
        // 验证网络连接
        await this.verifyNetwork();
        
        console.log("服务账户:", signer.address);
        console.log("账户余额:", ethers.formatEther(await signer.provider.getBalance(signer.address)), "S (Sonic代币)");
        
        // 显示Sonic配置信息
        console.log("🔧 Sonic测试网配置:");
        console.log(`- Gas价格: ${ethers.formatUnits(SONIC_CONFIG.gasPrice, 'gwei')} Gwei`);
        console.log(`- 提交挖矿Gas限制: ${SONIC_CONFIG.gasLimit.submitMining}`);
        console.log(`- 执行挖矿Gas限制: ${SONIC_CONFIG.gasLimit.executeMining}`);
        console.log(`- 最大重试次数: ${SONIC_CONFIG.maxRetries}`);
        console.log(`- 确认等待数: ${SONIC_CONFIG.confirmations}`);
        
        // 读取部署信息
        const deploymentInfo = this.loadDeploymentInfo();
        if (!deploymentInfo) {
            throw new Error("无法读取部署信息，请先部署合约");
        }
        
        // 初始化合约实例
        this.bettingContract = await ethers.getContractAt(
            "BettingContract", 
            deploymentInfo.contracts.bettingContract,
            signer
        );
        
        this.miningContract = await ethers.getContractAt(
            "MiningContract", 
            deploymentInfo.contracts.miningContract,
            signer
        );
        
        console.log("合约地址:");
        console.log("- BettingContract:", await this.bettingContract.getAddress());
        console.log("- MiningContract:", await this.miningContract.getAddress());
        
        // 验证权限
        await this.verifyPermissions();
        
        console.log("✅ 挖矿服务初始化完成");
    }

    /**
     * @notice 验证网络连接
     * @dev 确保连接到正确的Sonic测试网
     */
    async verifyNetwork() {
        try {
            const network = await this.provider.getNetwork();
            const chainId = Number(network.chainId);
            
            console.log(`🌐 网络信息: Chain ID ${chainId}`);
            
            if (chainId === 57054) {
                console.log("✅ 已连接到Sonic Blaze测试网");
                
                // 获取当前gas价格
                try {
                    const currentGasPrice = await this.provider.getFeeData();
                    if (currentGasPrice.gasPrice) {
                        console.log(`📊 当前网络Gas价格: ${ethers.formatUnits(currentGasPrice.gasPrice, 'gwei')} Gwei`);
                        
                        // 如果网络gas价格明显高于配置，给出警告
                        if (currentGasPrice.gasPrice > SONIC_CONFIG.gasPrice * 2n) {
                            console.warn(`⚠️  警告: 当前网络Gas价格较高，建议调整配置`);
                        }
                    }
                } catch (error) {
                    console.log("📊 无法获取当前Gas价格，使用预设配置");
                }
                
            } else if (chainId === 146) {
                console.log("🔴 检测到Sonic主网连接，请确认是否为测试环境");
            } else {
                console.warn(`⚠️  警告: 未知网络 Chain ID ${chainId}，请确认网络配置`);
            }
            
        } catch (error) {
            console.error("❌ 网络验证失败:", error.message);
            throw new Error("无法验证网络连接，请检查RPC配置");
        }
    }

    /**
     * @notice 验证服务权限
     */
    async verifyPermissions() {
        try {
            const signerAddress = this.signer.address;
            
            // 检查操作员权限（新的挖矿合约只需要OPERATOR_ROLE）
            const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
            const hasOperatorRole = await this.miningContract.hasRole(
                OPERATOR_ROLE, 
                signerAddress
            );
            
            console.log("权限验证:");
            console.log("- 操作员权限:", hasOperatorRole ? "✅" : "❌");
            
            if (!hasOperatorRole) {
                console.warn("⚠️  警告: 缺少操作员权限，挖矿功能无法正常工作");
                console.log("请联系合约管理员添加操作员权限 (OPERATOR_ROLE)");
            } else {
                console.log("✅ 权限验证通过");
            }
        } catch (error) {
            console.warn("⚠️  跳过权限验证 - 直接启动服务");
            console.log("权限验证失败:", error.message);
        }
    }

    /**
     * @notice 读取部署信息
     */
    loadDeploymentInfo() {
        try {
            const deploymentFiles = fs.readdirSync('./deployments')
                .filter(f => f.endsWith('.json'))
                .sort();
            
            if (deploymentFiles.length === 0) {
                console.error("未找到部署文件");
                return null;
            }
            
            // 读取最新的部署文件
            const latestFile = deploymentFiles.pop();
            const deploymentPath = path.join('./deployments', latestFile);
            const deploymentData = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
            
            console.log(`读取部署信息: ${latestFile}`);
            
            if (!deploymentData.contracts.bettingContract || !deploymentData.contracts.miningContract) {
                console.error("部署文件中缺少必要的合约地址");
                return null;
            }
            
            return deploymentData;
        } catch (error) {
            console.error("读取部署信息失败:", error.message);
            return null;
        }
    }

    /**
     * @notice 启动挖矿服务
     */
    async start() {
        if (this.isRunning) {
            console.log("挖矿服务已在运行中");
            return;
        }
        
        console.log("\n🚀 启动挖矿服务...");
        this.isRunning = true;
        
        // 监听BetSettled事件
        this.bettingContract.on("BetSettled", async (
            requestId,
            player,
            betAmount,
            payoutAmount,
            playerChoice,
            diceResult,
            isWinner,
            event
        ) => {
            await this.handleBetSettled({
                requestId,
                player,
                betAmount,
                payoutAmount,
                playerChoice,
                diceResult,
                isWinner,
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash
            });
        });
        
        console.log("✅ 事件监听已启动");
        console.log("正在监听BettingContract的BetSettled事件...");
        
        // 处理历史事件（可选）
        await this.processHistoricalEvents();
        
        // 定期状态报告
        this.startStatusReporting();
    }

    /**
     * @notice 处理投注结算事件
     */
    async handleBetSettled(eventData) {
        const { requestId, player, betAmount, isWinner, playerChoice, diceResult } = eventData;
        
        // 防止重复处理
        const eventKey = `${requestId}-${eventData.transactionHash}`;
        if (this.processedEvents.has(eventKey)) {
            return;
        }
        this.processedEvents.add(eventKey);
        
        console.log(`\n📥 收到投注结算事件: RequestID ${requestId}`);
        console.log(`玩家: ${player}`);
        console.log(`投注金额: ${ethers.formatEther(betAmount)} 代币`);
        console.log(`游戏结果: ${isWinner ? '中奖' : '未中奖'}`);
        
        // 只处理未中奖的投注
        if (isWinner) {
            console.log(`⏭️  跳过中奖投注 (RequestID: ${requestId})`);
            return;
        }
        
        try {
            // 检查是否已经创建挖矿记录
            const existingRecord = await this.miningContract.getMiningInfo(requestId);
            if (existingRecord.requestId.toString() !== "0") {
                console.log(`⏭️  挖矿记录已存在 (RequestID: ${requestId})`);
                return;
            }
            
            // 获取投注详细信息
            const betInfo = await this.bettingContract.getBetInfo(requestId);
            
            // 提交挖矿请求
            await this.submitMiningRequest({
                requestId,
                player,
                tokenAddress: betInfo.tokenAddress,
                originalBetAmount: betAmount,
                betCreatedAt: betInfo.createdAt,
                betSettledAt: betInfo.settledAt,
                playerChoice,
                diceResult,
                gameResult: isWinner
            });
            
            // 执行挖矿
            await this.executeMining(requestId);
            
        } catch (error) {
            console.error(`❌ 处理投注事件失败 (RequestID: ${requestId}):`, error.message);
        }
    }

    /**
     * @notice 提交挖矿请求
     * @dev 使用Sonic测试网优化的gas配置
     */
    async submitMiningRequest(data) {
        console.log(`📝 提交挖矿请求 (RequestID: ${data.requestId})...`);
        
        let retries = 0;
        while (retries < SONIC_CONFIG.maxRetries) {
            try {
                // Sonic测试网优化的交易配置
                const txOptions = {
                    gasPrice: SONIC_CONFIG.gasPrice,
                    gasLimit: SONIC_CONFIG.gasLimit.submitMining
                };
                
                console.log(`🔧 使用Sonic优化配置: gasPrice=${ethers.formatUnits(txOptions.gasPrice, 'gwei')} Gwei, gasLimit=${txOptions.gasLimit}`);
                
                const tx = await this.miningContract.submitMiningRequest(
                    data.requestId,
                    data.player,
                    data.tokenAddress,
                    data.originalBetAmount,
                    data.betCreatedAt,
                    data.betSettledAt,
                    data.playerChoice,
                    data.diceResult,
                    data.gameResult,
                    txOptions
                );
                
                console.log(`⏳ 等待交易确认: ${tx.hash}`);
                const receipt = await tx.wait(SONIC_CONFIG.confirmations);
                console.log(`✅ 挖矿请求提交成功 (RequestID: ${data.requestId}), Gas使用: ${receipt.gasUsed.toString()}`);
                
                return; // 成功则退出重试循环
                
            } catch (error) {
                retries++;
                console.error(`❌ 提交挖矿请求失败 (尝试 ${retries}/${SONIC_CONFIG.maxRetries}):`, error.message);
                
                if (retries >= SONIC_CONFIG.maxRetries) {
                    throw error;
                }
                
                // 等待后重试
                console.log(`⏳ ${SONIC_CONFIG.retryDelay/1000}秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, SONIC_CONFIG.retryDelay));
            }
        }
    }

    /**
     * @notice 执行挖矿
     * @dev 使用Sonic测试网优化的gas配置
     */
    async executeMining(requestId) {
        console.log(`⛏️  执行挖矿 (RequestID: ${requestId})...`);
        
        let retries = 0;
        while (retries < SONIC_CONFIG.maxRetries) {
            try {
                // Sonic测试网优化的交易配置
                const txOptions = {
                    gasPrice: SONIC_CONFIG.gasPrice,
                    gasLimit: SONIC_CONFIG.gasLimit.executeMining
                };
                
                console.log(`🔧 使用Sonic优化配置: gasPrice=${ethers.formatUnits(txOptions.gasPrice, 'gwei')} Gwei, gasLimit=${txOptions.gasLimit}`);
                
                const tx = await this.miningContract.executeMining(requestId, txOptions);
                console.log(`⏳ 等待挖矿交易确认: ${tx.hash}`);
                
                const receipt = await tx.wait(SONIC_CONFIG.confirmations);
                
                // 解析事件获取奖励金额
                const miningCompletedEvent = receipt.logs.find(log => {
                    try {
                        const parsed = this.miningContract.interface.parseLog(log);
                        return parsed.name === 'MiningCompleted';
                    } catch {
                        return false;
                    }
                });
                
                if (miningCompletedEvent) {
                    const parsed = this.miningContract.interface.parseLog(miningCompletedEvent);
                    const miningAmount = parsed.args.miningAmount;
                    console.log(`✅ 挖矿完成! 奖励: ${ethers.formatEther(miningAmount)} MLHG (RequestID: ${requestId}), Gas使用: ${receipt.gasUsed.toString()}`);
                } else {
                    console.log(`✅ 挖矿交易完成 (RequestID: ${requestId}), Gas使用: ${receipt.gasUsed.toString()}`);
                }
                
                return; // 成功则退出重试循环
                
            } catch (error) {
                retries++;
                console.error(`❌ 执行挖矿失败 (尝试 ${retries}/${SONIC_CONFIG.maxRetries}):`, error.message);
                
                if (retries >= SONIC_CONFIG.maxRetries) {
                    throw error;
                }
                
                // 等待后重试
                console.log(`⏳ ${SONIC_CONFIG.retryDelay/1000}秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, SONIC_CONFIG.retryDelay));
            }
        }
    }

    /**
     * @notice 处理历史事件
     */
    async processHistoricalEvents() {
        console.log("\n🔍 检查历史未处理事件...");
        
        try {
            // 获取最近1000个区块的事件
            const currentBlock = await this.provider.getBlockNumber();
            const fromBlock = Math.max(0, currentBlock - 1000);
            
            const filter = this.bettingContract.filters.BetSettled();
            const events = await this.bettingContract.queryFilter(filter, fromBlock, currentBlock);
            
            console.log(`找到 ${events.length} 个历史事件`);
            
            let processedCount = 0;
            for (const event of events) {
                const args = event.args;
                
                // 只处理未中奖的事件
                if (!args.isWinner) {
                    try {
                        // 检查是否已经处理
                        const existingRecord = await this.miningContract.getMiningInfo(args.requestId);
                        if (existingRecord.requestId.toString() === "0") {
                            await this.handleBetSettled({
                                requestId: args.requestId,
                                player: args.player,
                                betAmount: args.betAmount,
                                payoutAmount: args.payoutAmount,
                                playerChoice: args.playerChoice,
                                diceResult: args.diceResult,
                                isWinner: args.isWinner,
                                blockNumber: event.blockNumber,
                                transactionHash: event.transactionHash
                            });
                            processedCount++;
                        }
                    } catch (error) {
                        console.error(`处理历史事件失败 (RequestID: ${args.requestId}):`, error.message);
                    }
                }
            }
            
            console.log(`✅ 历史事件处理完成，共处理 ${processedCount} 个事件`);
            
        } catch (error) {
            console.error("处理历史事件失败:", error.message);
        }
    }

    /**
     * @notice 启动状态报告
     */
    startStatusReporting() {
        // 每5分钟报告一次状态
        setInterval(async () => {
            try {
                await this.reportStatus();
            } catch (error) {
                console.error("状态报告失败:", error.message);
            }
        }, 5 * 60 * 1000); // 5分钟
        
        // 立即报告一次状态
        setTimeout(() => this.reportStatus(), 5000);
    }

    /**
     * @notice 报告服务状态
     * @dev 包含Sonic测试网特定的性能监控
     */
    async reportStatus() {
        console.log("\n📊 挖矿服务状态报告 - Sonic测试网");
        console.log("时间:", new Date().toLocaleString());
        
        try {
            // 验证合约连接
            console.log("验证合约连接...");
            const miningContractAddress = await this.miningContract.getAddress();
            console.log(`挖矿合约地址: ${miningContractAddress}`);
            
            // Sonic网络状态监控
            await this.monitorSonicNetwork();
            
            console.log("✅ 合约连接正常");
            console.log("📡 事件监听正在运行");
            
            // 检查账户余额
            const balance = await this.provider.getBalance(this.signer.address);
            console.log(`💰 服务账户余额: ${ethers.formatEther(balance)} S`);
            
            // Sonic测试网余额警告阈值调整
            if (balance < ethers.parseEther("0.1")) {
                console.warn("⚠️  警告: 服务账户余额不足，请及时充值 (建议保持至少0.1 S)");
            }
            
            console.log("🔄 挖矿服务运行正常");
            console.log("📊 状态报告完成");
            
        } catch (error) {
            console.error("获取状态信息失败:", error.message);
        }
    }

    /**
     * @notice 监控Sonic网络状态
     * @dev 专门监控Sonic测试网的性能指标
     */
    async monitorSonicNetwork() {
        try {
            console.log("🌐 Sonic网络状态监控:");
            
            // 获取当前区块信息
            const currentBlock = await this.provider.getBlockNumber();
            console.log(`- 当前区块高度: ${currentBlock}`);
            
            // 获取当前gas费信息
            const feeData = await this.provider.getFeeData();
            if (feeData.gasPrice) {
                const currentGasPrice = ethers.formatUnits(feeData.gasPrice, 'gwei');
                const configGasPrice = ethers.formatUnits(SONIC_CONFIG.gasPrice, 'gwei');
                console.log(`- 当前网络Gas价格: ${currentGasPrice} Gwei`);
                console.log(`- 配置Gas价格: ${configGasPrice} Gwei`);
                
                // Gas价格建议
                if (feeData.gasPrice > SONIC_CONFIG.gasPrice * 3n) {
                    console.warn(`⚠️  网络拥堵: 当前Gas价格是配置的${Number(feeData.gasPrice / SONIC_CONFIG.gasPrice)}倍`);
                } else if (feeData.gasPrice < SONIC_CONFIG.gasPrice / 2n) {
                    console.log(`💡 网络空闲: 可以考虑降低Gas价格以节省费用`);
                }
            }
            
            // 检查网络延迟
            const startTime = Date.now();
            await this.provider.getBlockNumber();
            const latency = Date.now() - startTime;
            console.log(`- RPC延迟: ${latency}ms`);
            
            if (latency > 5000) {
                console.warn(`⚠️  网络延迟较高: ${latency}ms，可能影响交易速度`);
            }
            
        } catch (error) {
            console.error("Sonic网络监控失败:", error.message);
        }
    }

    /**
     * @notice 停止服务
     */
    stop() {
        if (!this.isRunning) {
            console.log("挖矿服务未在运行");
            return;
        }
        
        console.log("\n🛑 停止挖矿服务...");
        this.isRunning = false;
        
        // 移除事件监听器
        this.bettingContract.removeAllListeners("BetSettled");
        
        console.log("✅ 挖矿服务已停止");
    }
}

/**
 * @notice 主函数
 */
async function main() {
    const service = new MiningService();
    
    try {
        await service.initialize();
        await service.start();
        
        // 优雅关闭处理
        process.on('SIGINT', () => {
            console.log("\n收到停止信号...");
            service.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log("\n收到终止信号...");
            service.stop();
            process.exit(0);
        });
        
        // 保持进程运行
        console.log("\n挖矿服务正在运行中... (按 Ctrl+C 停止)");
        
    } catch (error) {
        console.error("挖矿服务启动失败:", error);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch((error) => {
        console.error("脚本执行失败:", error);
        process.exit(1);
    });
}

module.exports = { MiningService };