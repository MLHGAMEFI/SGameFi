const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * @title 派奖监控和管理工具
 * @notice 用于监控派奖状态、手动处理和故障排除
 */
class PayoutMonitor {
    constructor() {
        this.bettingContract = null;
        this.payoutContract = null;
        this.operator = null;
    }

    /**
     * @notice 初始化监控器
     */
    async initialize() {
        try {
            console.log("🔍 初始化派奖监控器...");
            
            // 获取签名者
            const [deployer] = await ethers.getSigners();
            this.operator = deployer;
            
            // 读取部署信息
            const deploymentInfo = this.getLatestDeployment();
            if (!deploymentInfo) {
                throw new Error("未找到部署信息");
            }
            
            // 获取合约实例
            this.bettingContract = await ethers.getContractAt(
                "BettingContract", 
                deploymentInfo.contracts.bettingContract
            );
            this.payoutContract = await ethers.getContractAt(
                "PayoutContract", 
                deploymentInfo.contracts.payoutContract
            );
            
            console.log("✅ 监控器初始化完成");
            
        } catch (error) {
            console.error("❌ 初始化失败:", error.message);
            throw error;
        }
    }

    /**
     * @notice 显示完整状态报告
     */
    async showFullStatus() {
        console.log("\n" + "=".repeat(60));
        console.log("📊 派奖系统完整状态报告");
        console.log("=".repeat(60));
        
        try {
            // 合约地址信息
            await this.showContractInfo();
            
            // 权限信息
            await this.showPermissions();
            
            // 余额信息
            await this.showBalances();
            
            // 统计信息
            await this.showStatistics();
            
            // 最近的派奖记录
            await this.showRecentPayouts();
            
            // 待处理的投注
            await this.showPendingBets();
            
        } catch (error) {
            console.error("❌ 获取状态失败:", error.message);
        }
        
        console.log("=".repeat(60));
    }

    /**
     * @notice 显示合约信息
     */
    async showContractInfo() {
        console.log("\n🏗️  合约信息:");
        console.log(`   BettingContract: ${await this.bettingContract.getAddress()}`);
        console.log(`   PayoutContract: ${await this.payoutContract.getAddress()}`);
        console.log(`   操作员地址: ${this.operator.address}`);
        
        // 检查合约是否暂停
        try {
            const isPaused = await this.payoutContract.paused();
            console.log(`   PayoutContract状态: ${isPaused ? '⏸️  已暂停' : '▶️  运行中'}`);
        } catch (error) {
            console.log(`   PayoutContract状态: ❓ 无法获取`);
        }
    }

    /**
     * @notice 显示权限信息
     */
    async showPermissions() {
        console.log("\n🔐 权限信息:");
        
        try {
            const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
            const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
            
            const isAdmin = await this.payoutContract.hasRole(DEFAULT_ADMIN_ROLE, this.operator.address);
            const isOperator = await this.payoutContract.hasRole(OPERATOR_ROLE, this.operator.address);
            
            console.log(`   管理员权限: ${isAdmin ? '✅' : '❌'}`);
            console.log(`   操作员权限: ${isOperator ? '✅' : '❌'}`);
            
            if (!isOperator) {
                console.log(`   ⚠️  当前账户无操作员权限，无法执行派奖操作`);
            }
            
        } catch (error) {
            console.log(`   权限检查失败: ${error.message}`);
        }
    }

    /**
     * @notice 显示余额信息
     */
    async showBalances() {
        console.log("\n💰 合约余额:");
        
        try {
            const deploymentInfo = this.getLatestDeployment();
            const nativeBalance = await this.payoutContract.getContractBalance(ethers.ZeroAddress);
            const mlhBalance = await this.payoutContract.getContractBalance(deploymentInfo['MLH Token']);
            const mlhgBalance = await this.payoutContract.getContractBalance(deploymentInfo['MLHG Token']);
            
            console.log(`   原生代币 (S): ${ethers.formatEther(nativeBalance)}`);
            console.log(`   MLH代币: ${ethers.formatEther(mlhBalance)}`);
            console.log(`   MLHG代币: ${ethers.formatEther(mlhgBalance)}`);
            
            // 余额警告
            const minBalance = ethers.parseEther("1");
            if (nativeBalance < minBalance) {
                console.log(`   ⚠️  原生代币余额过低`);
            }
            if (mlhBalance < minBalance) {
                console.log(`   ⚠️  MLH代币余额过低`);
            }
            if (mlhgBalance < minBalance) {
                console.log(`   ⚠️  MLHG代币余额过低`);
            }
            
        } catch (error) {
            console.log(`   余额查询失败: ${error.message}`);
        }
    }

    /**
     * @notice 显示统计信息
     */
    async showStatistics() {
        console.log("\n📈 派奖统计:");
        
        try {
            const stats = await this.payoutContract.getContractStats();
            const totalPayouts = stats[0];
            const completedPayouts = stats[1];
            const failedPayouts = stats[2];
            const totalAmount = stats[3];
            
            console.log(`   总派奖请求: ${totalPayouts}`);
            console.log(`   成功派奖: ${completedPayouts}`);
            console.log(`   失败派奖: ${failedPayouts}`);
            console.log(`   总派奖金额: ${ethers.formatEther(totalAmount)}`);
            
            if (totalPayouts > 0) {
                const successRate = (Number(completedPayouts) / Number(totalPayouts) * 100).toFixed(2);
                console.log(`   成功率: ${successRate}%`);
            }
            
        } catch (error) {
            console.log(`   统计信息获取失败: ${error.message}`);
        }
    }

    /**
     * @notice 显示最近的派奖记录
     */
    async showRecentPayouts(limit = 5) {
        console.log(`\n📋 最近 ${limit} 条派奖记录:`);
        
        try {
            // 这里需要根据实际的事件查询来获取最近的派奖记录
            // 由于合约可能没有提供批量查询接口，这里提供一个示例实现
            console.log(`   (需要通过事件日志查询最近的派奖记录)`);
            
            // 示例：查询最近的PayoutCompleted事件
            const filter = this.payoutContract.filters.PayoutCompleted();
            const events = await this.payoutContract.queryFilter(filter, -1000); // 查询最近1000个区块
            
            const recentEvents = events.slice(-limit);
            
            if (recentEvents.length === 0) {
                console.log(`   暂无派奖记录`);
            } else {
                for (const event of recentEvents) {
                    const args = event.args;
                    console.log(`   • 请求ID: ${args.requestId}, 玩家: ${args.player.slice(0,8)}..., 金额: ${ethers.formatEther(args.amount)}`);
                }
            }
            
        } catch (error) {
            console.log(`   查询派奖记录失败: ${error.message}`);
        }
    }

    /**
     * @notice 显示待处理的投注
     */
    async showPendingBets() {
        console.log(`\n⏳ 待处理投注:`);
        
        try {
            // 查询最近的BetSettled事件，检查是否有未派奖的中奖投注
            const filter = this.bettingContract.filters.BetSettled();
            const events = await this.bettingContract.queryFilter(filter, -100); // 查询最近100个区块
            
            let pendingWinners = 0;
            
            for (const event of events) {
                const args = event.args;
                if (args.isWinner) {
                    // 检查是否已经派奖
                    try {
                        const payoutInfo = await this.payoutContract.getPayoutInfo(args.requestId);
                        if (payoutInfo.status === 0) { // Pending状态
                            pendingWinners++;
                        }
                    } catch (error) {
                        // 如果查询失败，可能是还没有提交派奖请求
                        pendingWinners++;
                    }
                }
            }
            
            if (pendingWinners === 0) {
                console.log(`   ✅ 暂无待处理的中奖投注`);
            } else {
                console.log(`   ⚠️  发现 ${pendingWinners} 个待处理的中奖投注`);
                console.log(`   建议检查自动派奖服务是否正常运行`);
            }
            
        } catch (error) {
            console.log(`   查询待处理投注失败: ${error.message}`);
        }
    }

    /**
     * @notice 手动处理指定的派奖请求
     */
    async manualPayout(requestId) {
        console.log(`\n🔧 手动处理派奖请求: ${requestId}`);
        
        try {
            // 检查派奖信息
            let payoutInfo;
            try {
                payoutInfo = await this.payoutContract.getPayoutInfo(requestId);
                console.log(`   当前状态: ${this.getStatusName(payoutInfo.status)}`);
            } catch (error) {
                console.log(`   ❌ 派奖请求不存在，需要先提交请求`);
                
                // 尝试从BettingContract获取投注信息
                const betInfo = await this.bettingContract.getBetInfo(requestId);
                if (betInfo.isSettled && betInfo.isWinner) {
                    console.log(`   📝 发现中奖投注，正在提交派奖请求...`);
                    
                    const submitTx = await this.payoutContract.connect(this.operator).submitPayoutRequest(
                        requestId,
                        betInfo.player,
                        betInfo.tokenAddress,
                        betInfo.payoutAmount,
                        betInfo.betAmount,
                        betInfo.createdAt,
                        betInfo.settledAt,
                        betInfo.playerChoice,
                        betInfo.diceResult,
                        betInfo.isWinner
                    );
                    
                    await submitTx.wait();
                    console.log(`   ✅ 派奖请求已提交`);
                    
                    payoutInfo = await this.payoutContract.getPayoutInfo(requestId);
                } else {
                    throw new Error("投注未结算或未中奖");
                }
            }
            
            // 如果状态是Pending，执行派奖
            if (payoutInfo.status === 0) {
                console.log(`   🚀 执行派奖...`);
                
                const executeTx = await this.payoutContract.connect(this.operator).executePayout(requestId);
                await executeTx.wait();
                
                // 检查结果
                const updatedInfo = await this.payoutContract.getPayoutInfo(requestId);
                console.log(`   ✅ 派奖完成，状态: ${this.getStatusName(updatedInfo.status)}`);
                
            } else {
                console.log(`   ℹ️  派奖已处理，无需重复操作`);
            }
            
        } catch (error) {
            console.error(`   ❌ 手动派奖失败: ${error.message}`);
        }
    }

    /**
     * @notice 批量处理待处理的派奖
     */
    async processPendingPayouts() {
        console.log(`\n🔄 批量处理待处理派奖...`);
        
        try {
            // 查询最近的BetSettled事件
            const filter = this.bettingContract.filters.BetSettled();
            const events = await this.bettingContract.queryFilter(filter, -200);
            
            const pendingRequestIds = [];
            
            for (const event of events) {
                const args = event.args;
                if (args.isWinner) {
                    try {
                        const payoutInfo = await this.payoutContract.getPayoutInfo(args.requestId);
                        if (payoutInfo.status === 0) { // Pending
                            pendingRequestIds.push(args.requestId);
                        }
                    } catch (error) {
                        // 可能还没有提交派奖请求
                        console.log(`   发现未提交的中奖投注: ${args.requestId}`);
                        await this.manualPayout(args.requestId);
                    }
                }
            }
            
            if (pendingRequestIds.length > 0) {
                console.log(`   发现 ${pendingRequestIds.length} 个待执行的派奖`);
                
                // 批量执行
                const batchTx = await this.payoutContract.connect(this.operator).batchExecutePayout(pendingRequestIds);
                await batchTx.wait();
                
                console.log(`   ✅ 批量派奖完成`);
            } else {
                console.log(`   ✅ 暂无待处理的派奖`);
            }
            
        } catch (error) {
            console.error(`   ❌ 批量处理失败: ${error.message}`);
        }
    }

    /**
     * @notice 获取状态名称
     */
    getStatusName(status) {
        const statusNames = ['Pending', 'Completed', 'Failed', 'Expired'];
        return statusNames[status] || 'Unknown';
    }

    /**
     * @notice 获取最新部署信息
     */
    getLatestDeployment() {
        try {
            const deploymentsDir = path.join(__dirname, '..', 'deployments');
            const files = fs.readdirSync(deploymentsDir)
                .filter(file => file.startsWith('sonic-testnet-') && file.endsWith('.json'))
                .sort((a, b) => {
                    const timeA = parseInt(a.match(/sonic-testnet-(\d+)\.json/)[1]);
                    const timeB = parseInt(b.match(/sonic-testnet-(\d+)\.json/)[1]);
                    return timeB - timeA;
                });
            
            if (files.length === 0) {
                return null;
            }
            
            const latestFile = files[0];
            const deploymentPath = path.join(deploymentsDir, latestFile);
            return JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        } catch (error) {
            return null;
        }
    }
}

/**
 * @notice 主函数
 */
async function main() {
    const monitor = new PayoutMonitor();
    
    try {
        await monitor.initialize();
        
        const args = process.argv.slice(2);
        const command = args[0];
        
        switch (command) {
            case 'status':
                await monitor.showFullStatus();
                break;
                
            case 'manual':
                const requestId = args[1];
                if (!requestId) {
                    console.error('❌ 请提供请求ID: npm run monitor manual <requestId>');
                    process.exit(1);
                }
                await monitor.manualPayout(requestId);
                break;
                
            case 'batch':
                await monitor.processPendingPayouts();
                break;
                
            default:
                console.log('📋 派奖监控工具使用说明:');
                console.log('');
                console.log('查看完整状态:');
                console.log('  npx hardhat run scripts/payout-monitor.js --network sonic-testnet -- status');
                console.log('');
                console.log('手动处理指定派奖:');
                console.log('  npx hardhat run scripts/payout-monitor.js --network sonic-testnet -- manual <requestId>');
                console.log('');
                console.log('批量处理待处理派奖:');
                console.log('  npx hardhat run scripts/payout-monitor.js --network sonic-testnet -- batch');
                console.log('');
                break;
        }
        
    } catch (error) {
        console.error('❌ 监控工具执行失败:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序异常:', error);
        process.exit(1);
    });
}

module.exports = { PayoutMonitor };