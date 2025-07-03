# API 文档

SGameFi 平台提供了丰富的 API 接口，包括智能合约接口、前端服务接口和管理工具接口。

## 📋 目录

- [智能合约 API](#智能合约-api)
- [前端服务 API](#前端服务-api)
- [管理工具 API](#管理工具-api)
- [错误代码](#错误代码)
- [示例代码](#示例代码)

## 🔗 智能合约 API

### BettingContract

游戏投注核心合约，处理用户投注和结果验证。

#### 方法

##### `placeBet(uint256 betAmount, uint256 prediction)`

下注功能

**参数：**
- `betAmount` (uint256): 投注金额（wei）
- `prediction` (uint256): 预测数字（1-6）

**返回值：**
- `betId` (uint256): 投注ID

**事件：**
```solidity
event BetPlaced(uint256 indexed betId, address indexed player, uint256 amount, uint256 prediction);
```

**示例：**
```javascript
const tx = await bettingContract.placeBet(
    ethers.utils.parseEther("0.1"), // 0.1 ETH
    3 // 预测数字 3
);
const receipt = await tx.wait();
const betId = receipt.events[0].args.betId;
```

##### `getBetInfo(uint256 betId)`

获取投注信息

**参数：**
- `betId` (uint256): 投注ID

**返回值：**
```solidity
struct BetInfo {
    address player;      // 玩家地址
    uint256 amount;      // 投注金额
    uint256 prediction;  // 预测数字
    uint256 result;      // 游戏结果
    bool isSettled;      // 是否已结算
    uint256 timestamp;   // 投注时间
}
```

##### `getPlayerStats(address player)`

获取玩家统计信息

**参数：**
- `player` (address): 玩家地址

**返回值：**
```solidity
struct PlayerStats {
    uint256 totalBets;     // 总投注次数
    uint256 totalWagered;  // 总投注金额
    uint256 totalWon;      // 总赢得金额
    uint256 winRate;       // 胜率（百分比）
}
```

### DiceGame

骰子游戏逻辑合约，使用 VRF 生成随机数。

#### 方法

##### `rollDice(uint256 betId)`

掷骰子生成随机结果

**参数：**
- `betId` (uint256): 投注ID

**返回值：**
- `requestId` (bytes32): VRF 请求ID

**事件：**
```solidity
event DiceRolled(uint256 indexed betId, bytes32 indexed requestId);
event DiceResult(uint256 indexed betId, uint256 result, bool isWin);
```

##### `getGameResult(uint256 betId)`

获取游戏结果

**参数：**
- `betId` (uint256): 投注ID

**返回值：**
- `result` (uint256): 骰子结果（1-6）
- `isWin` (bool): 是否获胜

### MiningContract

挖矿合约，管理用户挖矿活动和奖励分发。

#### 方法

##### `startMining()`

开始挖矿

**要求：**
- 用户必须有足够的质押代币
- 当前未在挖矿状态

**事件：**
```solidity
event MiningStarted(address indexed miner, uint256 timestamp);
```

##### `claimRewards()`

领取挖矿奖励

**返回值：**
- `rewards` (uint256): 领取的奖励数量

**事件：**
```solidity
event RewardsClaimed(address indexed miner, uint256 amount);
```

##### `getMinerInfo(address miner)`

获取矿工信息

**参数：**
- `miner` (address): 矿工地址

**返回值：**
```solidity
struct MinerInfo {
    uint256 stakedAmount;    // 质押数量
    uint256 lastClaimTime;   // 上次领取时间
    uint256 totalRewards;    // 总奖励
    bool isActive;           // 是否活跃
}
```

### PayoutContract

支付合约，处理自动支付和奖励分发。

#### 方法

##### `processPayout(address[] calldata recipients, uint256[] calldata amounts)`

批量处理支付

**参数：**
- `recipients` (address[]): 接收者地址数组
- `amounts` (uint256[]): 支付金额数组

**要求：**
- 只有授权地址可以调用
- 数组长度必须匹配
- 合约余额充足

**事件：**
```solidity
event BatchPayout(uint256 totalAmount, uint256 recipientCount);
event PayoutProcessed(address indexed recipient, uint256 amount);
```

##### `getPayoutHistory(address recipient, uint256 limit)`

获取支付历史

**参数：**
- `recipient` (address): 接收者地址
- `limit` (uint256): 返回记录数量限制

**返回值：**
```solidity
struct PayoutRecord {
    uint256 amount;      // 支付金额
    uint256 timestamp;   // 支付时间
    bytes32 txHash;      // 交易哈希
}
```

### MLHGToken

MLHG 代币合约，ERC20 标准代币。

#### 方法

##### `mint(address to, uint256 amount)`

铸造代币

**参数：**
- `to` (address): 接收地址
- `amount` (uint256): 铸造数量

**要求：**
- 只有具有 MINTER_ROLE 的地址可以调用

##### `burn(uint256 amount)`

销毁代币

**参数：**
- `amount` (uint256): 销毁数量

**要求：**
- 调用者必须有足够的代币余额

## 🌐 前端服务 API

### 钱包连接服务

#### `connectWallet()`

连接用户钱包

**返回值：**
```javascript
{
    address: string,     // 用户地址
    chainId: number,     // 链ID
    balance: string      // 余额
}
```

**示例：**
```javascript
import { useWallet } from '@/composables/useWallet';

const { connectWallet, account, isConnected } = useWallet();

async function connect() {
    try {
        const result = await connectWallet();
        console.log('连接成功:', result);
    } catch (error) {
        console.error('连接失败:', error);
    }
}
```

### 投注服务

#### `placeBet(amount, prediction)`

下注

**参数：**
- `amount` (string): 投注金额（ETH）
- `prediction` (number): 预测数字（1-6）

**返回值：**
```javascript
{
    success: boolean,
    betId: string,
    txHash: string
}
```

**示例：**
```javascript
import { bettingService } from '@/contracts/bettingService';

async function bet() {
    try {
        const result = await bettingService.placeBet('0.1', 3);
        console.log('投注成功:', result);
    } catch (error) {
        console.error('投注失败:', error);
    }
}
```

#### `getBetHistory(address, limit)`

获取投注历史

**参数：**
- `address` (string): 用户地址
- `limit` (number): 记录数量限制

**返回值：**
```javascript
[
    {
        betId: string,
        amount: string,
        prediction: number,
        result: number,
        isWin: boolean,
        timestamp: number
    }
]
```

### 挖矿服务

#### `startMining()`

开始挖矿

**返回值：**
```javascript
{
    success: boolean,
    txHash: string,
    startTime: number
}
```

#### `claimRewards()`

领取奖励

**返回值：**
```javascript
{
    success: boolean,
    amount: string,
    txHash: string
}
```

#### `getMiningStats(address)`

获取挖矿统计

**参数：**
- `address` (string): 矿工地址

**返回值：**
```javascript
{
    stakedAmount: string,
    pendingRewards: string,
    totalRewards: string,
    isActive: boolean,
    nextClaimTime: number
}
```

## 🛠️ 管理工具 API

### 安全检查工具

#### `security-check.cjs`

运行安全检查

**命令：**
```bash
node scripts/utils/security-check.cjs
```

**检查项目：**
- 私钥验证
- 网络配置
- Gas 配置
- 账户余额
- 合约地址

### 部署前检查工具

#### `pre-deploy-check.cjs`

运行部署前检查

**命令：**
```bash
node scripts/deploy/pre-deploy-check.cjs
```

**检查项目：**
- 合约编译状态
- 网络连接
- Gas 估算
- 现有合约状态

### 支付监控工具

#### `payout-monitor.cjs`

监控支付状态

**命令：**
```bash
node scripts/utils/payout-monitor.cjs
```

**功能：**
- 实时监控支付队列
- 检查支付状态
- 生成支付报告

### 余额检查工具

#### `check-player-balance.cjs`

检查玩家余额

**命令：**
```bash
node scripts/utils/check-player-balance.cjs [address]
```

**参数：**
- `address` (可选): 特定玩家地址

**输出：**
```
玩家地址: 0x...
ETH 余额: 1.234 ETH
MLHG 余额: 5678.90 MLHG
质押金额: 1000.00 MLHG
待领取奖励: 123.45 MLHG
```

## ❌ 错误代码

### 合约错误

| 错误代码 | 描述 | 解决方案 |
|---------|------|----------|
| `BET_001` | 投注金额不足 | 增加投注金额 |
| `BET_002` | 预测数字无效 | 使用 1-6 范围内的数字 |
| `BET_003` | 投注已结算 | 检查投注状态 |
| `MINE_001` | 质押金额不足 | 增加质押代币 |
| `MINE_002` | 挖矿未开始 | 先调用 startMining |
| `PAY_001` | 余额不足 | 检查合约余额 |
| `PAY_002` | 未授权操作 | 检查调用者权限 |

### 前端错误

| 错误代码 | 描述 | 解决方案 |
|---------|------|----------|
| `WALLET_001` | 钱包未连接 | 连接钱包 |
| `WALLET_002` | 网络不匹配 | 切换到正确网络 |
| `WALLET_003` | 用户拒绝交易 | 重新发起交易 |
| `CONTRACT_001` | 合约地址无效 | 检查合约配置 |
| `CONTRACT_002` | 合约调用失败 | 检查参数和权限 |

## 📝 示例代码

### 完整投注流程

```javascript
import { ethers } from 'ethers';
import { bettingService } from '@/contracts/bettingService';
import { useWallet } from '@/composables/useWallet';

/**
 * 完整的投注流程示例
 */
async function completeBettingFlow() {
    try {
        // 1. 连接钱包
        const { connectWallet, account } = useWallet();
        await connectWallet();
        
        // 2. 检查余额
        const balance = await ethers.provider.getBalance(account.value);
        const balanceEth = ethers.utils.formatEther(balance);
        
        if (parseFloat(balanceEth) < 0.1) {
            throw new Error('余额不足');
        }
        
        // 3. 下注
        const betAmount = '0.1'; // 0.1 ETH
        const prediction = 3;    // 预测数字 3
        
        const betResult = await bettingService.placeBet(betAmount, prediction);
        console.log('投注成功:', betResult);
        
        // 4. 等待游戏结果
        const gameResult = await bettingService.waitForResult(betResult.betId);
        console.log('游戏结果:', gameResult);
        
        // 5. 检查是否获胜
        if (gameResult.isWin) {
            console.log('恭喜获胜！奖励:', gameResult.winAmount);
        } else {
            console.log('很遗憾，下次再来！');
        }
        
    } catch (error) {
        console.error('投注流程失败:', error);
        throw error;
    }
}
```

### 挖矿操作示例

```javascript
import { miningService } from '@/contracts/miningService';

/**
 * 挖矿操作示例
 */
async function miningExample() {
    try {
        // 1. 获取挖矿状态
        const stats = await miningService.getMiningStats(account.value);
        console.log('挖矿统计:', stats);
        
        // 2. 开始挖矿（如果未开始）
        if (!stats.isActive) {
            const startResult = await miningService.startMining();
            console.log('开始挖矿:', startResult);
        }
        
        // 3. 检查待领取奖励
        if (parseFloat(stats.pendingRewards) > 0) {
            const claimResult = await miningService.claimRewards();
            console.log('领取奖励:', claimResult);
        }
        
    } catch (error) {
        console.error('挖矿操作失败:', error);
    }
}
```

### 批量支付示例

```javascript
/**
 * 批量支付示例（管理员功能）
 */
async function batchPayoutExample() {
    try {
        // 准备支付数据
        const recipients = [
            '0x1234567890123456789012345678901234567890',
            '0x2345678901234567890123456789012345678901',
            '0x3456789012345678901234567890123456789012'
        ];
        
        const amounts = [
            ethers.utils.parseEther('1.0'),   // 1 ETH
            ethers.utils.parseEther('0.5'),   // 0.5 ETH
            ethers.utils.parseEther('0.25')   // 0.25 ETH
        ];
        
        // 执行批量支付
        const payoutContract = await ethers.getContract('PayoutContract');
        const tx = await payoutContract.processPayout(recipients, amounts);
        const receipt = await tx.wait();
        
        console.log('批量支付成功:', receipt.transactionHash);
        
    } catch (error) {
        console.error('批量支付失败:', error);
    }
}
```

## 🔗 相关链接

- [智能合约文档](./contracts.md)
- [部署指南](./deployment.md)
- [安全指南](../SECURITY.md)
- [贡献指南](../CONTRIBUTING.md)

---

**注意**：本文档会随着项目的发展而更新。请定期查看最新版本以获取准确信息。