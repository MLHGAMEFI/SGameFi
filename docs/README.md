# SGameFi 项目文档

## 项目概述

SGameFi 是一个基于区块链的游戏金融平台，集成了智能合约、前端应用和自动化服务。

## 目录结构

```
├── contracts/          # 智能合约
├── src/               # 前端源码
├── scripts/           # 脚本文件
│   ├── deploy/        # 部署脚本
│   └── utils/         # 工具脚本
├── types/             # TypeScript 类型定义
├── docs/              # 项目文档
├── test/              # 测试文件
└── config/            # 配置文件
```

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm 或 yarn
- Hardhat

### 安装依赖

```bash
npm install
```

### 编译合约

```bash
npx hardhat compile
```

### 运行测试

```bash
npx hardhat test
```

### 部署合约

```bash
# 部署到测试网
npx hardhat run scripts/deploy/deploy-all-contracts-sonic.cjs --network sonic-testnet
```

## 更多文档

- [智能合约详细文档](./contracts.md)
- [部署指南](./deployment.md)
- [API 文档](./API.md)
- [安全性指南](../SECURITY.md)
- [贡献指南](../CONTRIBUTING.md)
- [项目主页](../README.md)