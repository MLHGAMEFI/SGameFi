const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

/**
 * @title 检查派奖状态脚本
 * @notice 检查特定请求ID的派奖状态和交易记录
 * @dev 用于调试派奖问题
 */
async function checkPayoutStatus() {
    try {
        console.log("🔍 开始检查派奖状态...");
        
        // 获取签名者
        const [deployer] = await ethers.getSigners();
        console.log(`📝 检查账户: ${deployer.address}`);
        
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
        
        const bettingContract = await ethers.getContractAt(
            "BettingContract", 
            deploymentInfo.contracts.bettingContract
        );
        
        console.log(`💰 PayoutContract: ${deploymentInfo.contracts.payoutContract}`);
        console.log(`🎲 BettingContract: ${deploymentInfo.contracts.bettingContract}`);
        
        // 检查问题请求ID
        const problemRequestId = "111730113583286175234820362484128707134166961320408822298037464845252073700236";
        console.log(`\n🔍 检查请求ID: ${problemRequestId}`);
        
        // 获取派奖信息
        try {
            const payoutInfo = await payoutContract.getPayoutInfo(problemRequestId);
            console.log(`\n📊 派奖信息:`);
            console.log(`   请求ID: ${payoutInfo.requestId}`);
            console.log(`   玩家地址: ${payoutInfo.player}`);
            console.log(`   派奖金额: ${ethers.formatEther(payoutInfo.payoutAmount)}`);
            console.log(`   代币地址: ${payoutInfo.tokenAddress}`);
            console.log(`   投注金额: ${ethers.formatEther(payoutInfo.betAmount)}`);
            console.log(`   创建时间: ${new Date(Number(payoutInfo.createdAt) * 1000).toLocaleString()}`);
            console.log(`   结算时间: ${new Date(Number(payoutInfo.settledAt) * 1000).toLocaleString()}`);
            console.log(`   派奖时间: ${payoutInfo.payoutAt > 0 ? new Date(Number(payoutInfo.payoutAt) * 1000).toLocaleString() : '未派奖'}`);
            console.log(`   状态: ${getStatusName(payoutInfo.status)}`);
            console.log(`   玩家选择: ${payoutInfo.playerChoice ? '双数' : '单数'}`);
            console.log(`   骰子结果: ${payoutInfo.diceResult ? '双数' : '单数'}`);
            console.log(`   是否中奖: ${payoutInfo.isWinner ? '✅ 中奖' : '❌ 未中奖'}`);
            
            // 如果状态是已完成，检查实际转账记录
            if (payoutInfo.status === 1) { // PayoutStatus.Completed
                console.log(`\n🔍 检查转账记录...`);
                await checkTransferEvents(payoutContract, problemRequestId, payoutInfo.player, payoutInfo.payoutAmount);
            } else {
                console.log(`\n⚠️ 派奖状态不是已完成: ${getStatusName(payoutInfo.status)}`);
            }
            
        } catch (error) {
            console.log(`❌ 获取派奖信息失败: ${error.message}`);
            console.log(`   可能原因: 请求ID不存在或格式错误`);
        }
        
        // 检查合约余额
        console.log(`\n💰 检查合约余额:`);
        const nativeBalance = await payoutContract.getContractBalance(ethers.ZeroAddress);
        const mlhBalance = await payoutContract.getContractBalance(deploymentInfo.config.MLH_TOKEN);
        const mlhgBalance = await payoutContract.getContractBalance(deploymentInfo.config.MLHG_TOKEN);
        
        console.log(`   原生代币(S): ${ethers.formatEther(nativeBalance)}`);
        console.log(`   MLH代币: ${ethers.formatEther(mlhBalance)}`);
        console.log(`   MLHG代币: ${ethers.formatEther(mlhgBalance)}`);
        
        // 检查玩家余额
        const playerAddress = "0x3F42974C17247ea6991052108Fa01A00aB369250";
        console.log(`\n👤 检查玩家余额 (${playerAddress}):`);
        const playerNativeBalance = await ethers.provider.getBalance(playerAddress);
        console.log(`   原生代币(S): ${ethers.formatEther(playerNativeBalance)}`);
        
        // 获取最近的派奖事件
        console.log(`\n📋 获取最近的派奖事件...`);
        await getRecentPayoutEvents(payoutContract);
        
        console.log(`\n✅ 检查完成`);
        
    } catch (error) {
        console.error(`❌ 检查失败:`, error.message);
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
 * @notice 检查转账事件
 * @param contract 合约实例
 * @param requestId 请求ID
 * @param player 玩家地址
 * @param amount 金额
 */
async function checkTransferEvents(contract, requestId, player, amount) {
    try {
        // 获取PayoutCompleted事件
        const filter = contract.filters.PayoutCompleted(requestId);
        const events = await contract.queryFilter(filter, -10000); // 查询最近10000个区块
        
        if (events.length > 0) {
            console.log(`✅ 找到 ${events.length} 个PayoutCompleted事件:`);
            for (const event of events) {
                console.log(`   区块: ${event.blockNumber}`);
                console.log(`   交易哈希: ${event.transactionHash}`);
                console.log(`   请求ID: ${event.args.requestId}`);
                console.log(`   玩家: ${event.args.player}`);
                console.log(`   代币: ${event.args.tokenAddress}`);
                console.log(`   金额: ${ethers.formatEther(event.args.amount)}`);
                
                // 获取交易详情
                const tx = await ethers.provider.getTransaction(event.transactionHash);
                const receipt = await ethers.provider.getTransactionReceipt(event.transactionHash);
                console.log(`   Gas使用: ${receipt.gasUsed}`);
                console.log(`   状态: ${receipt.status === 1 ? '成功' : '失败'}`);
            }
        } else {
            console.log(`❌ 未找到PayoutCompleted事件`);
            console.log(`   这表明虽然状态显示已完成，但实际转账可能失败了`);
        }
        
    } catch (error) {
        console.error(`❌ 检查转账事件失败:`, error.message);
    }
}

/**
 * @notice 获取最近的派奖事件
 * @param contract 合约实例
 */
async function getRecentPayoutEvents(contract) {
    try {
        // 获取最近的PayoutRequested事件
        const requestedFilter = contract.filters.PayoutRequested();
        const requestedEvents = await contract.queryFilter(requestedFilter, -1000);
        
        console.log(`📝 最近的PayoutRequested事件 (${requestedEvents.length}个):`);
        for (const event of requestedEvents.slice(-5)) { // 只显示最近5个
            console.log(`   请求ID: ${event.args.requestId}`);
            console.log(`   玩家: ${event.args.player}`);
            console.log(`   金额: ${ethers.formatEther(event.args.payoutAmount)}`);
            console.log(`   区块: ${event.blockNumber}`);
            console.log(`   ---`);
        }
        
        // 获取最近的PayoutCompleted事件
        const completedFilter = contract.filters.PayoutCompleted();
        const completedEvents = await contract.queryFilter(completedFilter, -1000);
        
        console.log(`✅ 最近的PayoutCompleted事件 (${completedEvents.length}个):`);
        for (const event of completedEvents.slice(-5)) { // 只显示最近5个
            console.log(`   请求ID: ${event.args.requestId}`);
            console.log(`   玩家: ${event.args.player}`);
            console.log(`   金额: ${ethers.formatEther(event.args.amount)}`);
            console.log(`   区块: ${event.blockNumber}`);
            console.log(`   交易: ${event.transactionHash}`);
            console.log(`   ---`);
        }
        
        // 获取最近的PayoutFailed事件
        const failedFilter = contract.filters.PayoutFailed();
        const failedEvents = await contract.queryFilter(failedFilter, -1000);
        
        if (failedEvents.length > 0) {
            console.log(`❌ 最近的PayoutFailed事件 (${failedEvents.length}个):`);
            for (const event of failedEvents.slice(-5)) { // 只显示最近5个
                console.log(`   请求ID: ${event.args.requestId}`);
                console.log(`   玩家: ${event.args.player}`);
                console.log(`   原因: ${event.args.reason}`);
                console.log(`   区块: ${event.blockNumber}`);
                console.log(`   ---`);
            }
        }
        
    } catch (error) {
        console.error(`❌ 获取事件失败:`, error.message);
    }
}

// 执行检查
if (require.main === module) {
    checkPayoutStatus()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { checkPayoutStatus };