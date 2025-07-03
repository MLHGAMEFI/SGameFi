const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * @title 自动派奖服务启动脚本
 * @notice 用于启动、停止和管理自动派奖服务
 * @dev 提供服务管理功能
 */
class AutoPayoutServiceManager {
    constructor() {
        this.servicePath = path.join(__dirname, 'auto-payout-service.cjs');
        this.pidFile = path.join(__dirname, '..', 'logs', 'auto-payout-service.pid');
        this.logFile = path.join(__dirname, '..', 'logs', 'auto-payout-service.log');
        this.errorLogFile = path.join(__dirname, '..', 'logs', 'auto-payout-service.error.log');
        
        // 确保日志目录存在
        this.ensureLogDirectory();
    }

    /**
     * @notice 确保日志目录存在
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
            console.log(`📁 创建日志目录: ${logDir}`);
        }
    }

    /**
     * @notice 启动自动派奖服务
     */
    async start() {
        try {
            // 检查服务是否已在运行
            if (await this.isRunning()) {
                console.log('⚠️  自动派奖服务已在运行');
                return;
            }

            console.log('🚀 启动自动派奖服务...');
            
            // 创建日志文件流
            const logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
            const errorLogStream = fs.createWriteStream(this.errorLogFile, { flags: 'a' });
            
            // 启动服务进程
            const child = spawn('npx', ['hardhat', 'run', this.servicePath, '--network', 'sonicTestnet'], {
                detached: true,
                stdio: ['ignore', logStream, errorLogStream],
                cwd: path.join(__dirname, '..')
            });
            
            // 保存PID
            fs.writeFileSync(this.pidFile, child.pid.toString());
            
            // 分离进程
            child.unref();
            
            console.log(`✅ 自动派奖服务已启动 (PID: ${child.pid})`);
            console.log(`📝 日志文件: ${this.logFile}`);
            console.log(`❌ 错误日志: ${this.errorLogFile}`);
            
            // 等待一段时间检查服务是否正常启动
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            if (await this.isRunning()) {
                console.log('✅ 服务启动成功');
            } else {
                console.log('❌ 服务启动失败，请检查日志文件');
            }
            
        } catch (error) {
            console.error('❌ 启动服务失败:', error.message);
        }
    }

    /**
     * @notice 停止自动派奖服务
     */
    async stop() {
        try {
            if (!(await this.isRunning())) {
                console.log('⚠️  自动派奖服务未运行');
                return;
            }

            const pid = this.getPid();
            if (pid) {
                console.log(`🛑 停止自动派奖服务 (PID: ${pid})...`);
                
                // 发送SIGTERM信号
                process.kill(pid, 'SIGTERM');
                
                // 等待进程结束
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // 检查进程是否已结束
                if (await this.isRunning()) {
                    console.log('⚠️  进程未正常结束，强制终止...');
                    process.kill(pid, 'SIGKILL');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
                
                // 清理PID文件
                if (fs.existsSync(this.pidFile)) {
                    fs.unlinkSync(this.pidFile);
                }
                
                console.log('✅ 自动派奖服务已停止');
            }
            
        } catch (error) {
            console.error('❌ 停止服务失败:', error.message);
        }
    }

    /**
     * @notice 重启自动派奖服务
     */
    async restart() {
        console.log('🔄 重启自动派奖服务...');
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.start();
    }

    /**
     * @notice 检查服务状态
     */
    async status() {
        const isRunning = await this.isRunning();
        const pid = this.getPid();
        
        console.log('\n📊 自动派奖服务状态:');
        console.log(`   状态: ${isRunning ? '✅ 运行中' : '❌ 已停止'}`);
        
        if (isRunning && pid) {
            console.log(`   进程ID: ${pid}`);
            
            // 显示进程信息
            try {
                const { exec } = require('child_process');
                const { promisify } = require('util');
                const execAsync = promisify(exec);
                
                // Windows系统使用tasklist命令
                const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV`);
                const lines = stdout.split('\n');
                if (lines.length > 1) {
                    const processInfo = lines[1].split(',');
                    if (processInfo.length >= 5) {
                        console.log(`   内存使用: ${processInfo[4].replace(/"/g, '')}`);
                    }
                }
            } catch (error) {
                // 忽略获取进程信息的错误
            }
        }
        
        // 显示日志文件信息
        if (fs.existsSync(this.logFile)) {
            const stats = fs.statSync(this.logFile);
            console.log(`   日志文件: ${this.logFile}`);
            console.log(`   日志大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`   最后修改: ${stats.mtime.toLocaleString('zh-CN')}`);
        }
        
        if (fs.existsSync(this.errorLogFile)) {
            const stats = fs.statSync(this.errorLogFile);
            console.log(`   错误日志: ${this.errorLogFile}`);
            console.log(`   错误日志大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        }
        
        return isRunning;
    }

    /**
     * @notice 查看日志
     * @param {string} type 日志类型 ('normal' | 'error')
     * @param {number} lines 显示行数
     */
    async logs(type = 'normal', lines = 50) {
        const logFile = type === 'error' ? this.errorLogFile : this.logFile;
        
        if (!fs.existsSync(logFile)) {
            console.log(`⚠️  日志文件不存在: ${logFile}`);
            return;
        }
        
        try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Windows系统使用PowerShell的Get-Content命令
            const command = `powershell "Get-Content '${logFile}' -Tail ${lines}"`;
            const { stdout } = await execAsync(command);
            
            console.log(`\n📝 ${type === 'error' ? '错误' : ''}日志 (最后${lines}行):`);
            console.log('='.repeat(80));
            console.log(stdout);
            console.log('='.repeat(80));
            
        } catch (error) {
            console.error('❌ 读取日志失败:', error.message);
        }
    }

    /**
     * @notice 检查服务是否运行
     */
    async isRunning() {
        const pid = this.getPid();
        if (!pid) return false;
        
        try {
            // Windows系统检查进程是否存在
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /FO CSV`);
            return stdout.includes(pid.toString());
            
        } catch (error) {
            return false;
        }
    }

    /**
     * @notice 获取服务PID
     */
    getPid() {
        if (!fs.existsSync(this.pidFile)) {
            return null;
        }
        
        try {
            const pid = parseInt(fs.readFileSync(this.pidFile, 'utf8').trim());
            return isNaN(pid) ? null : pid;
        } catch (error) {
            return null;
        }
    }

    /**
     * @notice 清理日志文件
     */
    async cleanLogs() {
        try {
            console.log('🧹 清理日志文件...');
            
            if (fs.existsSync(this.logFile)) {
                fs.unlinkSync(this.logFile);
                console.log(`✅ 已删除: ${this.logFile}`);
            }
            
            if (fs.existsSync(this.errorLogFile)) {
                fs.unlinkSync(this.errorLogFile);
                console.log(`✅ 已删除: ${this.errorLogFile}`);
            }
            
            console.log('✅ 日志清理完成');
            
        } catch (error) {
            console.error('❌ 清理日志失败:', error.message);
        }
    }
}

/**
 * @notice 主函数
 */
async function main() {
    const manager = new AutoPayoutServiceManager();
    const command = process.argv[2];
    
    switch (command) {
        case 'start':
            await manager.start();
            break;
            
        case 'stop':
            await manager.stop();
            break;
            
        case 'restart':
            await manager.restart();
            break;
            
        case 'status':
            await manager.status();
            break;
            
        case 'logs':
            const logType = process.argv[3] || 'normal';
            const lines = parseInt(process.argv[4]) || 50;
            await manager.logs(logType, lines);
            break;
            
        case 'clean':
            await manager.cleanLogs();
            break;
            
        default:
            console.log('\n🎯 自动派奖服务管理器');
            console.log('\n用法:');
            console.log('  node start-auto-payout-service.cjs <command>');
            console.log('\n命令:');
            console.log('  start    - 启动服务');
            console.log('  stop     - 停止服务');
            console.log('  restart  - 重启服务');
            console.log('  status   - 查看状态');
            console.log('  logs [type] [lines] - 查看日志 (type: normal|error, lines: 数字)');
            console.log('  clean    - 清理日志文件');
            console.log('\n示例:');
            console.log('  node start-auto-payout-service.cjs start');
            console.log('  node start-auto-payout-service.cjs logs error 100');
            break;
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ 未处理的错误:', error);
        process.exit(1);
    });
}

module.exports = { AutoPayoutServiceManager };