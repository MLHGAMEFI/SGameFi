# 安全性指南

本文档描述了 SGameFi 项目的安全性最佳实践和工具。

## 🔒 安全性功能

### 1. 环境变量验证

项目在 `hardhat.config.js` 中集成了环境变量验证：

- **私钥验证**：确保 `PRIVATE_KEY` 已设置且格式正确
- **网络配置验证**：验证 RPC URL 格式
- **启动时检查**：在任何操作前进行验证

### 2. 安全检查工具

#### 基础安全检查
```bash
# 运行基础安全检查
npm run security:check
# 或
node scripts/utils/security-check.cjs
```

检查内容：
- ✅ 私钥格式和安全性
- ✅ 网络配置
- ✅ Gas 配置
- ✅ 账户余额
- ✅ 合约地址格式

#### 部署前检查
```bash
# 运行部署前检查
npm run deploy:check
# 或
node scripts/deploy/pre-deploy-check.cjs
```

检查内容：
- ✅ 合约编译状态
- ✅ 网络连接
- ✅ Gas 估算
- ✅ 现有合约状态
- ✅ 部署配置

## 🛡️ 安全最佳实践

### 1. 私钥管理

**✅ 正确做法：**
```bash
# 使用 .env 文件
PRIVATE_KEY=0x1234567890abcdef...

# 确保 .env 在 .gitignore 中
echo ".env" >> .gitignore
```

**❌ 错误做法：**
- 不要在代码中硬编码私钥
- 不要提交 `.env` 文件到版本控制
- 不要在公共场所分享私钥

### 2. 网络配置

**测试网优先：**
```bash
# 先在测试网测试
npm run deploy:all:testnet

# 确认无误后再部署主网
npm run deploy:all:mainnet
```

**网络验证：**
```bash
# 检查当前网络
npx hardhat console --network sonicTestnet
> await ethers.provider.getNetwork()
```

### 3. Gas 管理

**配置 Gas 限制：**
```env
# .env 文件
GAS_PRICE=1000000000  # 1 gwei
GAS_LIMIT=5000000     # 5M gas
```

**监控 Gas 价格：**
```bash
# 检查当前 Gas 价格
npx hardhat console --network sonicTestnet
> await ethers.provider.getGasPrice()
```

### 4. 合约验证

**部署后验证：**
```bash
# 验证合约源码
npx hardhat verify --network sonicTestnet CONTRACT_ADDRESS "constructor_arg1" "constructor_arg2"
```

## 🚨 安全检查清单

### 部署前检查
- [ ] 运行 `npm run security:check`
- [ ] 运行 `npm run deploy:check`
- [ ] 确认网络配置正确
- [ ] 检查账户余额充足
- [ ] 验证合约编译成功
- [ ] 确认 Gas 配置合理

### 部署后检查
- [ ] 验证合约地址
- [ ] 检查合约代码
- [ ] 测试基本功能
- [ ] 配置权限和角色
- [ ] 启动监控服务

### 定期检查
- [ ] 监控账户余额
- [ ] 检查服务状态
- [ ] 审查交易记录
- [ ] 更新依赖包
- [ ] 备份重要数据

## 🔧 故障排除

### 常见错误

**1. 私钥格式错误**
```
错误：Invalid private key format
解决：确保私钥以 0x 开头，长度为 66 字符
```

**2. 网络连接失败**
```
错误：Network connection failed
解决：检查 RPC URL 和网络状态
```

**3. Gas 不足**
```
错误：Insufficient gas
解决：增加 Gas 限制或检查账户余额
```

**4. 合约地址无效**
```
错误：Invalid contract address
解决：检查地址格式和合约部署状态
```

### 调试工具

```bash
# 检查账户信息
npm run player:balance

# 监控支付状态
npm run payout:monitor

# 查看服务日志
npm run auto-payout:service-logs
```

## 📞 支持

如果遇到安全相关问题：

1. 首先运行安全检查工具
2. 查看本文档的故障排除部分
3. 检查项目日志文件
4. 联系开发团队

## 🔄 更新

定期更新安全工具和依赖：

```bash
# 更新依赖
npm update

# 检查安全漏洞
npm audit

# 修复安全漏洞
npm audit fix
```

---

**⚠️ 重要提醒：**
- 永远不要在生产环境中使用测试私钥
- 定期备份重要数据和配置
- 保持依赖包的最新版本
- 遵循最小权限原则