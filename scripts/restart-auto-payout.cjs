const { spawn } = require('child_process');
const path = require('path');

/**
 * @title 重启自动派奖服务脚本
 * @notice 停止当前运行的自动派奖服务并重新启动
 */

console.log('🔄 重启自动派奖服务...');

// 项目根目录
const projectRoot = path.join(__dirname, '..');

// 停止现有服务（如果有的话）
console.log('🛑 停止现有服务...');

// 启动新的自动派奖服务
console.log('🚀 启动自动派奖服务...');

const autoPayoutProcess = spawn('npx', [
    'hardhat', 
    'run', 
    'scripts/auto-payout-service.js', 
    '--network', 
    'sonicTestnet'
], {
    cwd: projectRoot,
    stdio: 'inherit', // 继承父进程的输入输出
    shell: true // 在Windows上需要shell
});

// 处理进程事件
autoPayoutProcess.on('error', (error) => {
    console.error('❌ 启动自动派奖服务失败:', error.message);
    process.exit(1);
});

autoPayoutProcess.on('exit', (code, signal) => {
    if (code !== 0) {
        console.error(`❌ 自动派奖服务异常退出，退出码: ${code}`);
        if (signal) {
            console.error(`   信号: ${signal}`);
        }
    } else {
        console.log('✅ 自动派奖服务正常退出');
    }
});

// 处理进程终止信号
process.on('SIGINT', () => {
    console.log('\n🛑 收到终止信号，停止自动派奖服务...');
    autoPayoutProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，停止自动派奖服务...');
    autoPayoutProcess.kill('SIGTERM');
    process.exit(0);
});

console.log('✅ 自动派奖服务已启动');
console.log('💡 按 Ctrl+C 停止服务');