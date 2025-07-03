const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * @title 自动派奖服务监控脚本
 * @notice 监控自动派奖服务的运行状态和合约余额
 */

class AutoPayoutMonitor {
    constructor() {
        this.payoutContract = null;
        this.bettingContract = null;
        this.checkInterval = 60000; // 1分钟检查一次
        this.isRunning = false;
    }

    /**
     * @notice 初始化监控服务
     */
    async initialize() {
        try {
            console.log('🔍 初始化自动派奖监控服务...');
            
            // 读取部署信息
            const deploymentFile = path.join(__dirname, '..', 'deployments', 'sonic-testnet-complete-1751281033428.json');
            const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
            
            // 获取合约实例
            this.payoutContract = await hre.ethers.getContractAt(
                "PayoutContract", 
                deployment.PayoutContract
            );
            this.bettingContract = await hre.ethers.getContractAt(
                "BettingContract", 
                deployment.BettingContract
            );
            
            console.log(`📋 PayoutContract: ${deployment.PayoutContract}`);
            console.log(`📋 BettingContract: ${deployment.BettingContract}`);
            console.log('✅ 监控服务初始化完成');
            
        } catch (error) {
            console.error('❌ 初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * @notice 启动监控
     */
    async start() {
        if (this.isRunning) {
            console.log('⚠️  监控服务已在运行');
            return;
        }
        
        console.log('🚀 启动自动派奖监控服务...');
        this.isRunning = true;
        
        // 立即执行一次检查
        await this.performCheck();
        
        // 设置定期检查
        this.intervalId = setInterval(async () => {
            try {
                await this.performCheck();
            } catch (error) {
                console.error('❌ 监控检查失败:', error.message);
            }
        }, this.checkInterval);
        
        console.log(`✅ 监控服务已启动，每 ${this.checkInterval / 1000} 秒检查一次`);
    }

    /**
     * @notice 执行监控检查
     */
    async performCheck() {
        const timestamp = new Date().toLocaleString('zh-CN');
        console.log(`\n🔍 [${timestamp}] 执行监控检查...`);
        
        try {
            // 检查合约余额
            await this.checkContractBalances();
            
            // 检查待处理的派奖
            await this.checkPendingPayouts();
            
            // 检查最近的派奖统计
            await this.checkPayoutStats();
            
            console.log('✅ 监控检查完成\n');
            
        } catch (error) {
            console.error('❌ 监控检查失败:', error.message);
        }
    }

    /**
     * @notice 检查合约余额
     */
    async checkContractBalances() {
        try {
            const nativeBalance = await this.payoutContract.getContractBalance(hre.ethers.ZeroAddress);
            const mlhBalance = await this.payoutContract.getContractBalance('0x5B38Da6a701c568545dCfcB03FcB875f56beddC4'); // MLH地址
            const mlhgBalance = await this.payoutContract.getContractBalance('0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb'); // MLHG地址
            
            console.log('💰 合约余额状态:');
            console.log(`   原生代币(S): ${hre.ethers.formatEther(nativeBalance)}`);
            console.log(`   MLH代币: ${hre.ethers.formatEther(mlhBalance)}`);
            console.log(`   MLHG代币: ${hre.ethers.formatEther(mlhgBalance)}`);
            
            // 余额警告
            const criticalBalance = hre.ethers.parseEther('10');
            const warningBalance = hre.ethers.parseEther('100');
            
            if (nativeBalance < criticalBalance) {
                console.error('🚨 原生代币余额严重不足！');
            } else if (nativeBalance < warningBalance) {
                console.warn('⚠️  原生代币余额偏低');
            }
            
            if (mlhgBalance < criticalBalance) {
                console.error('🚨 MLHG代币余额严重不足！');
            } else if (mlhgBalance < warningBalance) {
                console.warn('⚠️  MLHG代币余额偏低');
            }
            
        } catch (error) {
            console.error('❌ 检查余额失败:', error.message);
        }
    }

    /**
     * @notice 检查待处理的派奖
     */
    async checkPendingPayouts() {
        try {
            // 这里可以添加检查待处理派奖的逻辑
            // 由于合约可能没有直接的方法获取所有待处理派奖，
            // 可以通过事件日志来检查
            console.log('📋 检查待处理派奖...');
            
            // 获取最近的PayoutRequested事件
            const filter = this.payoutContract.filters.PayoutRequested();
            const events = await this.payoutContract.queryFilter(filter, -1000); // 最近1000个区块
            
            let pendingCount = 0;
            for (const event of events) {
                try {
                    const payoutInfo = await this.payoutContract.getPayoutInfo(event.args.requestId);
                    if (Number(payoutInfo.status) === 0) { // Pending状态
                        pendingCount++;
                    }
                } catch (error) {
                    // 忽略单个查询失败
                }
            }
            
            if (pendingCount > 0) {
                console.warn(`⚠️  发现 ${pendingCount} 个待处理派奖`);
            } else {
                console.log('✅ 无待处理派奖');
            }
            
        } catch (error) {
            console.error('❌ 检查待处理派奖失败:', error.message);
        }
    }

    /**
     * @notice 检查派奖统计
     */
    async checkPayoutStats() {
        try {
            const stats = await this.payoutContract.getContractStats();
            console.log('📊 派奖统计:');
            console.log(`   总派奖数: ${stats[0]}`);
            console.log(`   成功派奖: ${stats[1]}`);
            console.log(`   失败派奖: ${stats[2]}`);
            console.log(`   总派奖金额: ${hre.ethers.formatEther(stats[3])}`);
            
        } catch (error) {
            console.error('❌ 获取派奖统计失败:', error.message);
        }
    }

    /**
     * @notice 停止监控
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️  监控服务未在运行');
            return;
        }
        
        console.log('🛑 停止监控服务...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.isRunning = false;
        console.log('🔴 监控服务已停止');
    }
}

// 主函数
async function main() {
    const monitor = new AutoPayoutMonitor();
    
    try {
        await monitor.initialize();
        await monitor.start();
        
        // 处理进程终止信号
        process.on('SIGINT', () => {
            console.log('\n🛑 收到终止信号，停止监控服务...');
            monitor.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('\n🛑 收到终止信号，停止监控服务...');
            monitor.stop();
            process.exit(0);
        });
        
        // 保持进程运行
        console.log('💡 按 Ctrl+C 停止监控服务');
        
    } catch (error) {
        console.error('❌ 监控服务启动失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ 监控服务异常:', error.message);
        process.exit(1);
    });
}

module.exports = AutoPayoutMonitor;