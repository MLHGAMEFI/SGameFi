const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * @title 手动派奖脚本
 * @notice 手动执行特定请求ID的派奖
 * @dev 用于解决自动派奖失败的问题
 */
async function manualPayout() {
    try {
        console.log("🚀 开始手动派奖...");
        
        // 获取签名者
        const [deployer] = await ethers.getSigners();
        console.log(`📝 操作员地址: ${deployer.address}`);
        
        // 读取部署信息
        const deploymentFiles = fs.readdirSync('./deployments')
            .filter(file => file.endsWith('.json'))
            .sort((a, b) => b.localeCompare(a)); // 按时间倒序
        
        if (deploymentFiles.length === 0) {
            throw new Error("未找到部署文件");
        }
        
        const latestDeployment = deploymentFiles[0];
        const deploymentPath = path.join('./deployments', latestDeployment);
        const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        
        console.log(`📋 使用部署文件: ${latestDeployment}`);
        
        // 获取合约实例
        const payoutContract = await ethers.getContractAt(
            "PayoutContract", 
            deploymentInfo.contracts.payoutContract
        );
        
        console.log(`💰 PayoutContract: ${deploymentInfo.contracts.payoutContract}`);
        
        // 问题请求ID
        const requestId = "111730113583286175234820362484128707134166961320408822298037464845252073700236";
        console.log(`\n🎯 目标请求ID: ${requestId}`);
        
        // 检查当前状态
        const payoutInfo = await payoutContract.getPayoutInfo(requestId);
        console.log(`\n📊 当前派奖状态: ${getStatusName(payoutInfo.status)}`);
        console.log(`🔍 状态值调试: ${payoutInfo.status} (类型: ${typeof payoutInfo.status})`);
        
        if (Number(payoutInfo.status) !== 0) { // 不是Pending状态
            console.log(`⚠️ 派奖状态不是待处理，当前状态: ${getStatusName(payoutInfo.status)}`);
            console.log(`💡 只有待处理状态的派奖才能执行`);
            return;
        }
        
        console.log(`✅ 派奖状态检查通过，可以执行派奖`);
        
        // 检查是否满足最小结算时间（1分钟）
        const currentTime = Math.floor(Date.now() / 1000);
        const settledAt = Number(payoutInfo.settledAt);
        const minExecutionTime = settledAt + 60; // 1分钟后
        
        console.log(`⏰ 时间检查:`);
        console.log(`   当前时间: ${new Date(currentTime * 1000).toLocaleString()}`);
        console.log(`   结算时间: ${new Date(settledAt * 1000).toLocaleString()}`);
        console.log(`   最早执行时间: ${new Date(minExecutionTime * 1000).toLocaleString()}`);
        
        if (currentTime < minExecutionTime) {
            const waitTime = minExecutionTime - currentTime;
            console.log(`⏳ 需要等待 ${waitTime} 秒才能执行派奖`);
            console.log(`💡 建议稍后再运行此脚本`);
            return;
        }
        
        // 检查合约余额
        const tokenAddress = payoutInfo.tokenAddress;
        const payoutAmount = payoutInfo.payoutAmount;
        const contractBalance = await payoutContract.getContractBalance(tokenAddress);
        
        console.log(`\n💰 余额检查:`);
        console.log(`   需要金额: ${ethers.formatEther(payoutAmount)} ${getTokenName(tokenAddress)}`);
        console.log(`   合约余额: ${ethers.formatEther(contractBalance)} ${getTokenName(tokenAddress)}`);
        
        if (contractBalance < payoutAmount) {
            console.log(`❌ 合约余额不足，无法执行派奖`);
            console.log(`💡 请先为合约充值`);
            return;
        }
        
        // 检查操作员权限
        const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
        const hasRole = await payoutContract.hasRole(OPERATOR_ROLE, deployer.address);
        
        if (!hasRole) {
            console.log(`❌ 当前账户没有OPERATOR_ROLE权限`);
            console.log(`💡 请使用有权限的账户执行`);
            return;
        }
        
        console.log(`✅ 权限检查通过`);
        
        // 执行派奖
        console.log(`\n🚀 开始执行派奖...`);
        
        try {
            // 估算Gas
            const gasEstimate = await payoutContract.executePayout.estimateGas(requestId);
            console.log(`⛽ 预估Gas: ${gasEstimate}`);
            
            // 执行派奖交易
            const tx = await payoutContract.connect(deployer).executePayout(requestId, {
                gasLimit: gasEstimate * 120n / 100n, // 增加20%的Gas缓冲
                gasPrice: ethers.parseUnits('25', 'gwei') // 设置合适的Gas价格
            });
            
            console.log(`📝 交易已提交: ${tx.hash}`);
            console.log(`⏳ 等待交易确认...`);
            
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                console.log(`✅ 派奖执行成功!`);
                console.log(`   区块号: ${receipt.blockNumber}`);
                console.log(`   Gas使用: ${receipt.gasUsed}`);
                
                // 检查更新后的状态
                const updatedInfo = await payoutContract.getPayoutInfo(requestId);
                console.log(`   新状态: ${getStatusName(updatedInfo.status)}`);
                console.log(`   派奖时间: ${new Date(Number(updatedInfo.payoutAt) * 1000).toLocaleString()}`);
                
                // 检查事件
                const payoutCompletedEvents = receipt.logs.filter(log => {
                    try {
                        const parsed = payoutContract.interface.parseLog(log);
                        return parsed.name === 'PayoutCompleted';
                    } catch {
                        return false;
                    }
                });
                
                if (payoutCompletedEvents.length > 0) {
                    console.log(`🎉 PayoutCompleted事件已触发`);
                    const event = payoutContract.interface.parseLog(payoutCompletedEvents[0]);
                    console.log(`   玩家: ${event.args.player}`);
                    console.log(`   金额: ${ethers.formatEther(event.args.amount)}`);
                    console.log(`   代币: ${event.args.tokenAddress}`);
                } else {
                    console.log(`⚠️ 未找到PayoutCompleted事件`);
                }
                
            } else {
                console.log(`❌ 交易失败`);
            }
            
        } catch (error) {
            console.error(`❌ 执行派奖失败:`, error.message);
            
            // 解析具体错误原因
            if (error.reason) {
                console.error(`   合约错误: ${error.reason}`);
            }
            
            if (error.code === 'CALL_EXCEPTION') {
                console.error(`   这通常表示合约执行被回滚`);
                console.error(`   可能原因: 余额不足、权限问题、时间限制等`);
            }
        }
        
        console.log(`\n✅ 手动派奖流程完成`);
        
    } catch (error) {
        console.error(`❌ 手动派奖失败:`, error.message);
        process.exit(1);
    }
}

/**
 * @notice 获取状态名称
 * @param status 状态码
 * @return 状态名称
 */
function getStatusName(status) {
    const statusNames = {
        0: "待处理 (Pending)",
        1: "已完成 (Completed)",
        2: "失败 (Failed)",
        3: "已过期 (Expired)"
    };
    return statusNames[status] || `未知状态 (${status})`;
}

/**
 * @notice 获取代币名称
 * @param tokenAddress 代币地址
 * @return 代币名称
 */
function getTokenName(tokenAddress) {
    if (tokenAddress === ethers.ZeroAddress) {
        return "S (原生代币)";
    }
    // 这里可以根据实际的代币地址返回对应的名称
    return "代币";
}

// 执行手动派奖
if (require.main === module) {
    manualPayout()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { manualPayout };