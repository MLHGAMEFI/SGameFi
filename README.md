# SGameFi - Sonic GameFi Platform

🎮 基于 Sonic 区块链的去中心化游戏金融平台

## 📋 项目概述

SGameFi 是一个运行在 Sonic 区块链上的创新 GameFi 平台，集成了骰子游戏、挖矿系统、自动支付和 MLHG 代币经济系统。

### 🌟 核心功能

- **🎲 骰子游戏**：公平透明的链上博彩游戏
- **⛏️ 挖矿系统**：基于游戏活动的代币挖矿
- **💰 自动支付**：智能化的奖励分发系统
- **🪙 MLHG 代币**：平台原生代币和经济系统
- **🔒 安全保障**：多重安全检查和验证机制

## 🚀 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0
- Git

### 安装依赖

```bash
# 克隆项目
git clone <repository-url>
cd SGameFi

# 安装依赖
npm install
```

### 环境配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入必要的配置
# 重要：请确保设置正确的 PRIVATE_KEY
```

### 安全检查

```bash
# 运行安全检查（推荐在任何操作前执行）
npm run security:check

# 运行部署前检查
npm run deploy:check
```

### 编译和测试

```bash
# 编译合约
npx hardhat compile

# 运行测试
npm run test:all
```

### 部署合约

```bash
# 部署到测试网
npm run deploy:all:testnet

# 部署 MLHG 代币系统
npm run deploy:mlhg:testnet
```

## 📁 项目结构

```
SGameFi/
├── contracts/           # 智能合约
│   ├── core/           # 核心游戏合约
│   ├── mlhg/           # MLHG 代币系统
│   ├── interfaces/     # 合约接口
│   └── test/           # 测试合约
├── scripts/            # 部署和工具脚本
│   ├── deploy/         # 部署脚本
│   └── utils/          # 工具脚本
├── test/               # 测试文件
├── docs/               # 项目文档
├── types/              # TypeScript 类型定义
├── src/                # 前端源码
└── public/             # 静态资源
```

## 🛠️ 开发工具

### 常用命令

```bash
# 开发服务器
npm run dev

# 构建项目
npm run build

# 安全检查
npm run security:check

# 部署检查
npm run deploy:check

# 查看玩家余额
npm run player:balance

# 手动支付
npm run payout:manual

# 监控支付
npm run payout:monitor
```

### 服务管理

```bash
# 启动自动支付服务
npm run auto-payout:service-start

# 停止服务
npm run auto-payout:service-stop

# 查看服务状态
npm run auto-payout:service-status

# 查看服务日志
npm run auto-payout:service-logs
```

## 🔒 安全性

项目集成了多重安全保障机制：

- **环境变量验证**：启动时自动检查关键配置
- **私钥安全检查**：验证私钥格式和安全性
- **网络配置验证**：确保连接到正确的网络
- **Gas 管理**：智能 Gas 价格估算和限制
- **合约验证**：部署后自动验证合约状态

详细信息请参考 [安全性指南](./SECURITY.md)

## 📚 文档

- [项目概述](./docs/README.md)
- [智能合约文档](./docs/contracts.md)
- [部署指南](./docs/deployment.md)
- [API 文档](./docs/API.md)
- [安全性指南](./SECURITY.md)
- [贡献指南](./CONTRIBUTING.md)

## 🌐 网络配置

### Sonic Testnet
- **Chain ID**: 57054
- **RPC URL**: https://rpc.blaze.soniclabs.com/
- **Explorer**: https://testnet.soniclabs.com/

### Sonic Mainnet
- **Chain ID**: 146
- **RPC URL**: https://rpc.soniclabs.com/
- **Explorer**: https://soniclabs.com/

## 🧪 测试

```bash
# 运行所有测试
npm run test:all

# 运行特定测试
npm run test:auto-payout
npm run test:mining

# 集成测试示例
npm run integration:example
```

## 🚀 部署

### 测试网部署

```bash
# 1. 安全检查
npm run security:check
npm run deploy:check

# 2. 部署核心合约
npm run deploy:all:testnet

# 3. 部署 MLHG 系统
npm run deploy:mlhg:testnet

# 4. 启动服务
npm run auto-payout:service-start
```

### 主网部署

```bash
# ⚠️ 主网部署需要特别谨慎
# 1. 确保在测试网充分测试
# 2. 运行完整的安全检查
# 3. 准备充足的 Gas 费用

npm run deploy:all:mainnet
```

## 🤝 贡献

欢迎贡献代码！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 支持

如果您遇到问题或需要帮助：

1. 查看 [文档](./docs/)
2. 检查 [安全指南](./SECURITY.md)
3. 提交 [Issue](../../issues)
4. 联系开发团队

## 🔄 更新日志

### v1.0.0
- ✅ 核心游戏合约
- ✅ MLHG 代币系统
- ✅ 自动支付机制
- ✅ 安全检查工具
- ✅ 完整文档

---

**⚠️ 免责声明**：本项目仅供学习和研究目的。请在使用前充分了解相关风险，并遵守当地法律法规。