# 智能合约文档

## 合约概述

SGameFi 平台包含以下主要智能合约：

### 核心合约

#### BettingContract.sol
- **功能**: 处理游戏投注逻辑
- **主要方法**:
  - `placeBet(uint256 amount)`: 下注
  - `resolveBet(address player, bool won)`: 结算投注
  - `withdrawWinnings()`: 提取奖金

#### DiceGame.sol
- **功能**: 骰子游戏实现
- **主要方法**:
  - `rollDice(uint256 betAmount, uint256 prediction)`: 掷骰子
  - `getGameResult(uint256 gameId)`: 获取游戏结果

#### MiningContract.sol
- **功能**: 代币挖矿和质押
- **主要方法**:
  - `stake(uint256 amount)`: 质押代币
  - `unstake(uint256 amount)`: 取消质押
  - `claimRewards()`: 领取奖励

#### PayoutContract.sol
- **功能**: 自动支付系统
- **主要方法**:
  - `requestPayout(address player, uint256 amount)`: 请求支付
  - `processPayout(uint256 payoutId)`: 处理支付

### MLHG 代币系统

#### MLHGToken.sol
- **功能**: 平台代币合约
- **标准**: ERC-20
- **特性**: 可铸造、可销毁、权限控制

#### BuyKingPool.sol
- **功能**: 代币购买池
- **主要方法**:
  - `buyTokens()`: 购买代币
  - `sellTokens(uint256 amount)`: 出售代币

#### TailOrderPool.sol
- **功能**: 尾单池管理
- **主要方法**:
  - `addLiquidity(uint256 amount)`: 添加流动性
  - `removeLiquidity(uint256 amount)`: 移除流动性

## 接口合约

### IBuyKingPool.sol
- BuyKingPool 合约接口定义

### ITailOrderPool.sol
- TailOrderPool 合约接口定义

### IShadowFactory.sol
- Shadow DEX 工厂合约接口

### IShadowV2Router.sol
- Shadow DEX 路由合约接口

### IWETH.sol
- 包装以太坊接口

## 测试合约

### MockDiceGame.sol
- 骰子游戏模拟合约，用于测试

### MockERC20.sol
- ERC-20 代币模拟合约，用于测试

## 部署配置

合约部署配置文件位于 `config/` 目录：

- `sonic-testnet-config.json`: Sonic 测试网配置
- `sonic-mlhg-config.json`: MLHG 代币配置
- `auto-payout-config.json`: 自动支付配置

## 安全考虑

1. **权限控制**: 所有关键操作都有适当的权限检查
2. **重入攻击防护**: 使用 ReentrancyGuard 防止重入攻击
3. **溢出保护**: 使用 SafeMath 库防止整数溢出
4. **随机数安全**: 使用 VRF (可验证随机函数) 确保随机数安全

## 升级策略

合约采用代理模式设计，支持安全升级：

1. 使用 OpenZeppelin 的升级框架
2. 多重签名控制升级权限
3. 时间锁延迟执行关键操作