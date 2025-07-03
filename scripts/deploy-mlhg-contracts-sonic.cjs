const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

/**
 * @notice 在Sonic测试网部署完整的MLHG系统
 * @dev 按顺序部署MLHGToken、TailOrderPool和BuyKingPool合约
 * @dev 包含完整的部署后配置和验证流程
 */
async function main() {
    console.log("🚀 开始在Sonic测试网部署MLHG系统...");
    console.log("=".repeat(60));
    
    // 获取部署者账户
    const [deployer] = await ethers.getSigners();
    console.log("部署账户:", deployer.address);
    
    const balance = await deployer.provider.getBalance(deployer.address);
    console.log("账户余额:", ethers.formatEther(balance), "S");
    
    if (balance < ethers.parseEther("0.1")) {
        console.warn("⚠️  警告: 账户余额较低，可能不足以完成所有合约部署");
    }
    
    // Sonic测试网配置
    const SONIC_CONFIG = {
        // 网络参数
        NETWORK_NAME: "Sonic Blaze Testnet",
        CHAIN_ID: 57054,
        SYMBOL: "S",
        RPC_URL: "https://rpc.blaze.soniclabs.com",
        EXPLORER_URL: "https://testnet.sonicscan.org",
        
        // Sonic测试网已部署的代币地址
        MLH_TOKEN: "0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF", // MLH代币地址
        
        // Shadow DEX路由器地址 (Sonic网络)
        SHADOW_ROUTER: "0x1D368773735ee1E678950B7A97bcA2CafB330CDc",
        
        // 管理员和开发者地址配置
        ADMIN_ADDRESS: "0x3F42974C17247ea6991052108Fa01A00aB369250", // 管理员地址
        DEV_ADDRESS: "0x3F42974C17247ea6991052108Fa01A00aB369250", // 开发者地址
        
        // 初始充值金额配置
        INITIAL_POOL_FUNDING: {
            TAIL_ORDER_POOL: ethers.parseEther("1000000"), // TailOrderPool MLHG代币
            BUY_KING_POOL: ethers.parseEther("1000000"), // BuyKingPool MLHG代币
            NATIVE: ethers.parseEther("10") // 原生代币
        }
    };
    
    console.log("\n📋 使用的配置:");
    console.log("网络:", SONIC_CONFIG.NETWORK_NAME);
    console.log("链ID:", SONIC_CONFIG.CHAIN_ID);
    console.log("MLH Token:", SONIC_CONFIG.MLH_TOKEN);
    console.log("Shadow Router:", SONIC_CONFIG.SHADOW_ROUTER);
    console.log("管理员地址:", SONIC_CONFIG.ADMIN_ADDRESS);
    console.log("开发者地址:", SONIC_CONFIG.DEV_ADDRESS);
    
    const deploymentResults = {};
    const deploymentTxs = {};
    
    try {
        // 1. 部署MLHGToken合约
        console.log("\n" + "=".repeat(60));
        console.log("📦 第1步: 部署MLHGToken合约");
        console.log("=".repeat(60));
        
        let mlhgToken, mlhgTokenAddress;
        try {
            const MLHGToken = await ethers.getContractFactory("MLHGToken");
            mlhgToken = await MLHGToken.deploy(
                SONIC_CONFIG.DEV_ADDRESS // 开发者地址
            );
            
            await mlhgToken.waitForDeployment();
            mlhgTokenAddress = await mlhgToken.getAddress();
            deploymentResults.mlhgToken = mlhgTokenAddress;
            deploymentTxs.mlhgToken = mlhgToken.deploymentTransaction().hash;
            
            console.log("✅ MLHGToken部署成功!");
            console.log("地址:", mlhgTokenAddress);
            console.log("交易哈希:", deploymentTxs.mlhgToken);
            
            // 验证代币基本信息
            const name = await mlhgToken.name();
            const symbol = await mlhgToken.symbol();
            const totalSupply = await mlhgToken.totalSupply();
            const decimals = await mlhgToken.decimals();
            
            console.log("\n📊 代币信息:");
            console.log("名称:", name);
            console.log("符号:", symbol);
            console.log("小数位:", decimals);
            console.log("总供应量:", ethers.formatEther(totalSupply), symbol);
            
        } catch (error) {
            console.error("❌ MLHGToken部署失败:", error.message);
            console.error("🔧 解决方案:");
            console.error("   1. 确认开发者地址有效");
            console.error("   2. 检查网络连接和RPC节点状态");
            console.error("   3. 确认部署者账户有足够的Gas费用");
            console.error("   4. 验证合约编译是否成功");
            throw error;
        }
        
        // 2. 部署TailOrderPool合约
        console.log("\n" + "=".repeat(60));
        console.log("📦 第2步: 部署TailOrderPool合约");
        console.log("=".repeat(60));
        
        let tailOrderPool, tailOrderPoolAddress;
        try {
            const TailOrderPool = await ethers.getContractFactory("TailOrderPool");
            tailOrderPool = await TailOrderPool.deploy(
                mlhgTokenAddress // MLHGToken合约地址
            );
            
            await tailOrderPool.waitForDeployment();
            tailOrderPoolAddress = await tailOrderPool.getAddress();
            deploymentResults.tailOrderPool = tailOrderPoolAddress;
            deploymentTxs.tailOrderPool = tailOrderPool.deploymentTransaction().hash;
            
            console.log("✅ TailOrderPool部署成功!");
            console.log("地址:", tailOrderPoolAddress);
            console.log("交易哈希:", deploymentTxs.tailOrderPool);
            
            // 验证TailOrderPool配置
            const currentRound = await tailOrderPool.currentRound();
            console.log("\n📊 TailOrderPool信息:");
            console.log("当前轮次ID:", currentRound.roundId.toString());
            console.log("轮次开始时间:", new Date(Number(currentRound.startTime) * 1000).toLocaleString());
            console.log("轮次结束时间:", new Date(Number(currentRound.endTime) * 1000).toLocaleString());
            
        } catch (error) {
            console.error("❌ TailOrderPool部署失败:", error.message);
            console.error("🔧 解决方案:");
            console.error("   1. 确认MLHGToken合约地址正确且已部署");
            console.error("   2. 检查网络连接和RPC节点状态");
            console.error("   3. 确认部署者账户有足够的Gas费用");
            console.error("   4. 验证合约编译和依赖关系");
            throw error;
        }
        
        // 3. 部署BuyKingPool合约
        console.log("\n" + "=".repeat(60));
        console.log("📦 第3步: 部署BuyKingPool合约");
        console.log("=".repeat(60));
        
        let buyKingPool, buyKingPoolAddress;
        try {
            const BuyKingPool = await ethers.getContractFactory("BuyKingPool");
            buyKingPool = await BuyKingPool.deploy(
                mlhgTokenAddress // MLHGToken合约地址
            );
            
            await buyKingPool.waitForDeployment();
            buyKingPoolAddress = await buyKingPool.getAddress();
            deploymentResults.buyKingPool = buyKingPoolAddress;
            deploymentTxs.buyKingPool = buyKingPool.deploymentTransaction().hash;
            
            console.log("✅ BuyKingPool部署成功!");
            console.log("地址:", buyKingPoolAddress);
            console.log("交易哈希:", deploymentTxs.buyKingPool);
            
            // 验证BuyKingPool配置
            const currentRound = await buyKingPool.currentRound();
            console.log("\n📊 BuyKingPool信息:");
            console.log("当前轮次ID:", currentRound.roundId.toString());
            console.log("轮次开始时间:", new Date(Number(currentRound.startTime) * 1000).toLocaleString());
            console.log("轮次结束时间:", new Date(Number(currentRound.endTime) * 1000).toLocaleString());
            
        } catch (error) {
            console.error("❌ BuyKingPool部署失败:", error.message);
            console.error("🔧 解决方案:");
            console.error("   1. 确认MLHGToken合约地址正确且已部署");
            console.error("   2. 检查网络连接和RPC节点状态");
            console.error("   3. 确认部署者账户有足够的Gas费用");
            console.error("   4. 验证合约编译和依赖关系");
            throw error;
        }
        
        // 4. 配置MLHGToken合约
        console.log("\n" + "=".repeat(60));
        console.log("⚙️  第4步: 配置MLHGToken合约");
        console.log("=".repeat(60));
        
        try {
            // 设置奖金池地址
            console.log("🔧 设置TailOrderPool地址...");
            const setTailPoolTx = await mlhgToken.setTailOrderPool(tailOrderPoolAddress);
            await setTailPoolTx.wait();
            console.log("✅ TailOrderPool地址设置成功");
            
            console.log("🔧 设置BuyKingPool地址...");
            const setBuyKingPoolTx = await mlhgToken.setBuyKingPool(buyKingPoolAddress);
            await setBuyKingPoolTx.wait();
            console.log("✅ BuyKingPool地址设置成功");
            
            // 创建与MLH的交易对
            console.log("🔧 创建MLH-MLHG交易对...");
            const setUniswapPairTx = await mlhgToken.setUniswapPair(SONIC_CONFIG.MLH_TOKEN);
            await setUniswapPairTx.wait();
            console.log("✅ MLH-MLHG交易对创建成功");
            
            // 启动交易
            console.log("🔧 启动代币交易...");
            const launchTx = await mlhgToken.setLaunch(true);
            await launchTx.wait();
            console.log("✅ 代币交易启动成功");
            
        } catch (error) {
            console.error("❌ MLHGToken配置失败:", error.message);
            console.error("🔧 解决方案:");
            console.error("   1. 确认所有合约地址正确");
            console.error("   2. 确认部署者有管理员权限");
            console.error("   3. 检查MLH代币地址是否有效");
            console.error("   4. 验证Shadow DEX路由器地址");
            throw error;
        }
        
        // 5. 初始化奖金池
        console.log("\n" + "=".repeat(60));
        console.log("💰 第5步: 初始化奖金池");
        console.log("=".repeat(60));
        
        try {
            // 向TailOrderPool转账MLHG代币
            console.log("💸 向TailOrderPool转账MLHG代币...");
            const transferToTailPoolTx = await mlhgToken.transfer(
                tailOrderPoolAddress,
                SONIC_CONFIG.INITIAL_POOL_FUNDING.TAIL_ORDER_POOL
            );
            await transferToTailPoolTx.wait();
            console.log("✅ TailOrderPool初始资金转账成功:", ethers.formatEther(SONIC_CONFIG.INITIAL_POOL_FUNDING.TAIL_ORDER_POOL), "MLHG");
            
            // 向BuyKingPool转账MLHG代币
            console.log("💸 向BuyKingPool转账MLHG代币...");
            const transferToBuyKingPoolTx = await mlhgToken.transfer(
                buyKingPoolAddress,
                SONIC_CONFIG.INITIAL_POOL_FUNDING.BUY_KING_POOL
            );
            await transferToBuyKingPoolTx.wait();
            console.log("✅ BuyKingPool初始资金转账成功:", ethers.formatEther(SONIC_CONFIG.INITIAL_POOL_FUNDING.BUY_KING_POOL), "MLHG");
            
        } catch (error) {
            console.error("❌ 奖金池初始化失败:", error.message);
            console.error("🔧 解决方案:");
            console.error("   1. 确认部署者有足够的MLHG代币余额");
            console.error("   2. 检查转账金额是否合理");
            console.error("   3. 验证奖金池合约地址正确");
            // 不抛出错误，允许继续执行
            console.warn("⚠️  奖金池初始化失败，但部署继续进行");
        }
        
        // 6. 验证部署结果
        console.log("\n" + "=".repeat(60));
        console.log("🔍 第6步: 验证部署结果");
        console.log("=".repeat(60));
        
        try {
            // 验证MLHGToken配置
            const tailPoolAddress = await mlhgToken.tailOrderPool();
            const buyKingPoolAddressFromToken = await mlhgToken.buyKingPool();
            const isLaunched = await mlhgToken.launch();
            
            console.log("\n📊 MLHGToken验证结果:");
            console.log("TailOrderPool地址:", tailPoolAddress);
            console.log("BuyKingPool地址:", buyKingPoolAddressFromToken);
            console.log("交易已启动:", isLaunched);
            
            // 验证奖金池余额
            const tailPoolBalance = await mlhgToken.balanceOf(tailOrderPoolAddress);
            const buyKingPoolBalance = await mlhgToken.balanceOf(buyKingPoolAddress);
            
            console.log("\n💰 奖金池余额:");
            console.log("TailOrderPool:", ethers.formatEther(tailPoolBalance), "MLHG");
            console.log("BuyKingPool:", ethers.formatEther(buyKingPoolBalance), "MLHG");
            
        } catch (error) {
            console.error("❌ 部署验证失败:", error.message);
            console.warn("⚠️  验证失败，但合约可能已正确部署");
        }
        
        // 7. 保存部署结果
        console.log("\n" + "=".repeat(60));
        console.log("💾 第7步: 保存部署结果");
        console.log("=".repeat(60));
        
        const deploymentData = {
            network: SONIC_CONFIG.NETWORK_NAME,
            chainId: SONIC_CONFIG.CHAIN_ID,
            timestamp: Date.now(),
            blockNumber: await deployer.provider.getBlockNumber(),
            deployer: deployer.address,
            deploymentVersion: "v1.0.0",
            contracts: deploymentResults,
            transactions: deploymentTxs,
            config: {
                MLH_TOKEN: SONIC_CONFIG.MLH_TOKEN,
                SHADOW_ROUTER: SONIC_CONFIG.SHADOW_ROUTER,
                ADMIN_ADDRESS: SONIC_CONFIG.ADMIN_ADDRESS,
                DEV_ADDRESS: SONIC_CONFIG.DEV_ADDRESS,
                INITIAL_POOL_FUNDING: {
                    TAIL_ORDER_POOL: SONIC_CONFIG.INITIAL_POOL_FUNDING.TAIL_ORDER_POOL.toString(),
                    BUY_KING_POOL: SONIC_CONFIG.INITIAL_POOL_FUNDING.BUY_KING_POOL.toString(),
                    NATIVE: SONIC_CONFIG.INITIAL_POOL_FUNDING.NATIVE.toString()
                }
            },
            constructorArgs: {
                mlhgToken: [SONIC_CONFIG.DEV_ADDRESS],
                tailOrderPool: [mlhgTokenAddress],
                buyKingPool: [mlhgTokenAddress]
            },
            deploymentStatus: {
                completed: true,
                configurationCompleted: true,
                verificationCompleted: false,
                readyForProduction: true
            },
            deploymentStats: {
                totalContracts: 3,
                totalTransactions: Object.keys(deploymentTxs).length,
                estimatedGasUsed: "待计算",
                deploymentDuration: "待计算"
            }
        };
        
        // 保存到文件
        const deploymentFileName = `sonic-mlhg-deployment-${Date.now()}.json`;
        const deploymentFilePath = path.join(__dirname, '..', 'deployments', deploymentFileName);
        
        // 确保deployments目录存在
        const deploymentsDir = path.dirname(deploymentFilePath);
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }
        
        fs.writeFileSync(deploymentFilePath, JSON.stringify(deploymentData, null, 2));
        console.log("✅ 部署结果已保存到:", deploymentFilePath);
        
        // 8. 部署总结
        console.log("\n" + "=".repeat(60));
        console.log("🎉 MLHG系统部署完成!");
        console.log("=".repeat(60));
        
        console.log("\n📋 部署摘要:");
        console.log("网络:", SONIC_CONFIG.NETWORK_NAME);
        console.log("链ID:", SONIC_CONFIG.CHAIN_ID);
        console.log("部署者:", deployer.address);
        console.log("区块浏览器:", SONIC_CONFIG.EXPLORER_URL);
        
        console.log("\n📦 已部署合约:");
        console.log("MLHGToken:", deploymentResults.mlhgToken);
        console.log("TailOrderPool:", deploymentResults.tailOrderPool);
        console.log("BuyKingPool:", deploymentResults.buyKingPool);
        
        console.log("\n🔗 区块浏览器链接:");
        console.log("MLHGToken:", `${SONIC_CONFIG.EXPLORER_URL}/address/${deploymentResults.mlhgToken}`);
        console.log("TailOrderPool:", `${SONIC_CONFIG.EXPLORER_URL}/address/${deploymentResults.tailOrderPool}`);
        console.log("BuyKingPool:", `${SONIC_CONFIG.EXPLORER_URL}/address/${deploymentResults.buyKingPool}`);
        
        console.log("\n💡 下一步操作:");
        console.log("1. 在区块浏览器上验证合约源码");
        console.log("2. 添加流动性到MLH-MLHG交易对");
        console.log("3. 测试买单功能和奖金池机制");
        console.log("4. 配置前端应用连接到新部署的合约");
        console.log("5. 设置监控和自动化服务");
        
        console.log("\n✅ 部署成功完成!");
        
    } catch (error) {
        console.error("\n❌ 部署过程中发生错误:", error.message);
        console.error("\n🔧 故障排除建议:");
        console.error("1. 检查网络连接和RPC节点状态");
        console.error("2. 确认部署者账户有足够的Gas费用");
        console.error("3. 验证所有依赖合约地址正确");
        console.error("4. 检查合约编译是否成功");
        console.error("5. 确认网络配置正确");
        
        // 保存错误信息
        const errorData = {
            timestamp: Date.now(),
            error: error.message,
            stack: error.stack,
            deploymentResults,
            deploymentTxs
        };
        
        const errorFileName = `sonic-mlhg-deployment-error-${Date.now()}.json`;
        const errorFilePath = path.join(__dirname, '..', 'deployments', errorFileName);
        
        try {
            fs.writeFileSync(errorFilePath, JSON.stringify(errorData, null, 2));
            console.error("\n📄 错误信息已保存到:", errorFilePath);
        } catch (saveError) {
            console.error("无法保存错误信息:", saveError.message);
        }
        
        process.exit(1);
    }
}

// 执行部署脚本
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("部署脚本执行失败:", error);
            process.exit(1);
        });
}

module.exports = main;