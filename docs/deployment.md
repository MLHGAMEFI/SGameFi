# 部署指南

## 环境准备

### 1. 安装依赖

```bash
npm install
```

### 2. 环境变量配置

复制 `.env.example` 到 `.env` 并配置以下变量：

```bash
# 私钥 (不要提交到版本控制)
PRIVATE_KEY=your_private_key_here

# RPC 节点
SONIC_TESTNET_RPC=https://rpc.testnet.soniclabs.com
SONIC_MAINNET_RPC=https://rpc.soniclabs.com

# 区块浏览器 API
SONIC_API_KEY=your_api_key_here

# 其他配置
GAS_PRICE=20000000000
GAS_LIMIT=8000000
```

## 部署脚本

### 部署脚本位置

所有部署脚本位于 `scripts/deploy/` 目录：

- `deploy-all-contracts-sonic.cjs`: 部署所有合约到 Sonic 网络
- `deploy-mlhg-contracts-sonic.cjs`: 部署 MLHG 代币系统

### 工具脚本位置

工具和服务脚本位于 `scripts/utils/` 目录：

- `auto-payout-service.cjs`: 自动支付服务
- `mining-service.cjs`: 挖矿服务
- `monitor-auto-payout.cjs`: 支付监控
- `check-payout-status.cjs`: 检查支付状态
- `check-player-balance.cjs`: 检查玩家余额
- `manual-payout.cjs`: 手动支付
- `payout-monitor.cjs`: 支付监控器
- `restart-auto-payout.cjs`: 重启自动支付
- `start-auto-payout-service.cjs`: 启动自动支付服务

## 部署步骤

### 1. 部署前安全检查

```bash
# 运行安全性检查
node scripts/utils/security-check.cjs

# 运行部署前检查
node scripts/deploy/pre-deploy-check.cjs
```

### 2. 测试网部署

```bash
# 编译合约
npx hardhat compile

# 运行测试
npx hardhat test

# 部署到 Sonic 测试网
npx hardhat run scripts/deploy/deploy-all-contracts-sonic.cjs --network sonicTestnet
```

### 3. 主网部署

```bash
# 部署到 Sonic 主网（谨慎操作）
npx hardhat run scripts/deploy/deploy-all-contracts-sonic.cjs --network sonicMainnet
```

### 4. MLHG 代币系统部署

```bash
# 部署 MLHG 代币和相关池合约
npx hardhat run scripts/deploy/deploy-mlhg-system.cjs --network sonicTestnet
```

## 部署后配置

### 1. 验证合约

```bash
# 验证合约代码
npx hardhat verify --network sonic-testnet CONTRACT_ADDRESS "Constructor Arg 1" "Constructor Arg 2"
```

### 2. 配置权限

```bash
# 设置合约权限
node scripts/utils/setup-permissions.cjs
```

### 3. 启动服务

```bash
# 启动自动支付服务
node scripts/utils/start-auto-payout-service.cjs

# 启动挖矿服务
node scripts/utils/mining-service.cjs
```

## 网络配置

### Sonic 测试网

```javascript
{
  name: "sonic-testnet",
  chainId: 64165,
  rpc: "https://rpc.testnet.soniclabs.com",
  explorer: "https://testnet.sonicscan.org"
}
```

### Sonic 主网

```javascript
{
  name: "sonic-mainnet",
  chainId: 146,
  rpc: "https://rpc.soniclabs.com",
  explorer: "https://sonicscan.org"
}
```

## 监控和维护

### 1. 监控服务状态

```bash
# 检查自动支付状态
node scripts/utils/check-payout-status.cjs

# 监控自动支付
node scripts/utils/monitor-auto-payout.cjs
```

### 2. 手动操作

```bash
# 手动支付
node scripts/utils/manual-payout.cjs --player 0x... --amount 100

# 检查玩家余额
node scripts/utils/check-player-balance.cjs --player 0x...
```

### 3. 重启服务

```bash
# 重启自动支付服务
node scripts/utils/restart-auto-payout.cjs
```

## 故障排除

### 常见问题

1. **Gas 费用不足**
   - 检查账户余额
   - 调整 gas price 和 gas limit

2. **RPC 连接失败**
   - 检查网络配置
   - 验证 RPC 节点状态

3. **合约验证失败**
   - 确保构造函数参数正确
   - 检查编译器版本匹配

### 日志查看

```bash
# 查看部署日志
tail -f logs/deployment.log

# 查看服务日志
tail -f logs/auto-payout.log
```

## 安全检查清单

- [ ] 私钥安全存储
- [ ] 多重签名配置
- [ ] 权限正确设置
- [ ] 合约代码审计
- [ ] 测试网充分测试
- [ ] 监控系统就绪
- [ ] 备份和恢复计划