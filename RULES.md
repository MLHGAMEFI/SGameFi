# 游戏下注合约 规则文档


## 游戏规则
### 游戏赔率
- 赔率：1:1.9

## 投注状态流转流程

投注创建 → 等待确认 → 生成可以调用的结果事件 → 链下储存 → 调用DiceGame → 等待结果 → 生成可以调用的结果事件 → 链下存储

### 开始投注

#### 选择游戏类型
- 单双

#### 选择你的猜测
- 双数 (2,4,6,8,10)
- 单数 (1,3,5,7,9)

#### 选择投注代币
- S 原生代币
- MLH代币
- MLHG代币

#### 投注金额
- 最小: 1
- 最大: 1000


## 下注合约确认投注事件

用户支付代币，并将代币转账到合约地址，合约收到转账成功后，获取用户地址下注的事件记录内容：

- 请求ID（索引）
- 玩家地址（索引）
- 玩家支付的代币类型
- 玩家支付的代币金额
- 玩家选择的掷骰子结果数组
- 玩家选择的单双数结果（true为双数，false为单数）
- 履行时间戳

## 链下储存事件日志
将下注历史记录移至链下存储

## 下注合约 与 DiceGame.sol 合约交互

- 链下触发调用函数, 下注合约会发起一笔与 `DiceGame.sol` 合约的交易
- 拿到 `DiceGame.sol` 给出的这笔交易的 `DiceRollResult` 事件记录

### DiceGame.sol 合约事件

#### DiceRollResult 事件记录内容

根据 `DiceGame.sol` 中的 `DiceRollResult` 事件定义，现在的记录包括以下内容：

**事件参数详情：**

```solidity
event DiceRollResult(
  uint256 indexed requestId,    // 请求ID（索引）
  address indexed player,       // 玩家地址（索引）
  uint8[] results,             // 掷骰子结果数组
  bool isEven,                 // 单双数结果（true为双数，false为单数）
  uint256 fulfillmentTime      // 履行时间戳
);
```

**参数说明：**

- **requestId**: 请求ID（索引）
- **player**: 玩家地址（索引）
- **results**: 掷骰子的具体点数结果数组
- **isEven**: 单双数结果（true为双数，false为单数）
- **fulfillmentTime**: 履行时间戳

## 确认下注结果

下注合约确认的投注事件与 `DiceGame.sol` 中的 `DiceRollResult` 事件，决定用户是否中奖。

### 中奖判定规则

根据 `DiceGame.sol` 给出的这笔交易 `DiceRollResult` 事件记录中 `isEven` 的值，和用户地址下注的事件记录中 `isEven` 的值，判断下注用户是否中奖。

**单双数结果规则：**
- `true` = 双数
- `false` = 单数

**玩家选择规则：**
- 玩家选择的掷骰子结果数组中，如果是双数，则 `isEven` 的值为 `true`
- 玩家选择的掷骰子结果数组中，如果是单数，则 `isEven` 的值为 `false`

**中奖条件：**
- ✅ **中奖**：用户下注的单双数结果与掷骰子结果的单双数结果相同（同为 `true` 或者同为 `false`）
- ❌ **未中奖**：用户下注的单双数结果与掷骰子结果的单双数结果不同（一个为 `true` 一个为 `false`）

### 投注中奖事件记录

根据下注金额和赔率，计算用户中奖金额，并将用户地址和中奖金额记录到合约中给出新的投注中奖事件：

- **用户地址**：
- **用户下注金额**：
- **中奖返还金额**：
- **用户投注单双数结果**：
- **下注合约掷骰子单双数结果**：
- **游戏判定结果**：

## 链下储存事件日志
将中奖判定结果移至链下存储



## Sonic测试网关键信部署配置

### 代币合约地址

- **MLHG合约地址**: `0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb`
- **MLH测试币合约地址**: `0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF`
- **USDC测试币合约地址**: `0x44BAE34265D58238c8B3959740E07964f589ce01`


## Sonic测试网配置

### 网络参数

- **Network**: Blaze Testnet
- **Chain ID**: 57054
- **Symbol**: S
- **RPC URL**: `https://rpc.blaze.soniclabs.com`
- **Block Explorer**: `https://testnet.sonicscan.org/`



现在我需要创建一个完整的部署脚本来部署所有四个合约。基于现有的脚本，我将创建一个新的部署脚本来按正确的顺序部署所有合约。
scripts\deploy-all-contracts-sonic.js
现在运行部署脚本来部署所有四个合约到Sonic测试网。


🚀 开始在Sonic测试网部署完整的SGameFi系统...
============================================================
部署账户: 0x3F42974C17247ea6991052108Fa01A00aB369250
账户余额: 46.645880444793475253 ETH

📋 使用的配置:
MLH Token: 0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF
MLHG Token: 0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb
VRF Coordinator: 0x6E3efcB244e74Cb898A7961061fAA43C3cf79691

📋 验证合约地址...
DiceGame: 0xfc9D49702FfB690d39f268F4Fb96DFfA4f3aF3ac
BettingContract: 0x4A763ed78e2b840c21Fe02e050CC961fC10B852F
PayoutContract: 0x91D5c382fEd5B9415D0B43Ae21E70f0531092A5F
MiningContract: 0xF77935Db465081E06169907580EaC9a123059a8B



BettingContract余额: 2.0 ETH
PayoutContract余额: 10.0 S
PayoutContract MLH余额: 1000000.0 MLH
PayoutContract MLHG余额: 1000000.0 MLHG
MiningContract MLHG余额: 1000000.0 MLHG


部署信息已保存到: C:\Users\admin\Desktop\SGameFi\deployments\sonic-testnet-complete-1751281033428.json
前端配置已保存到: C:\Users\admin\Desktop\SGameFi\frontend-config.json

🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉
🎉 SGameFi系统完整部署成功! 🎉
🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉

🚀 部署摘要:
✅ 所有4个核心合约部署成功
✅ 合约间关联配置完成
✅ 自动派奖功能已启用
✅ VRF费用充值完成
✅ PayoutContract S原生代币充值完成
✅ PayoutContract MLH代币充值完成
✅ PayoutContract MLHG代币充值完成
✅ MiningContract MLHG代币充值完成
✅ MiningContract独立运行，支持自动挖矿
✅ 部署验证通过
✅ 系统已准备就绪

📋 部署总结:
网络: Sonic测试网 (Chain ID: 57054)
部署者: 0x3F42974C17247ea6991052108Fa01A00aB369250
区块号: 49446604

📦 合约地址:
├── DiceGame: 0xfc9D49702FfB690d39f268F4Fb96DFfA4f3aF3ac
├── BettingContract: 0x4A763ed78e2b840c21Fe02e050CC961fC10B852F
├── PayoutContract: 0x91D5c382fEd5B9415D0B43Ae21E70f0531092A5F
└── MiningContract: 0xF77935Db465081E06169907580EaC9a123059a8B

🔗 有用的链接:
├── 区块浏览器: https://sonicscan.org
├── RPC URL: https://rpc.blaze.soniclabs.com
└── 部署记录: C:\Users\admin\Desktop\SGameFi\deployments\sonic-testnet-complete-1751281033428.json



🔧 相关脚本:
- 资金充值: npm run fund-contracts
- 自动派奖服务: npm run auto-payout
- 挖矿服务: npm run mining-service
- 派奖监控: npm run payout-monitor

### 📊 派奖监控
npm run payout:monitor


### ⛏️ 挖矿服务
npm run mining:service




🔧 相关脚本:
- 资金充值: npm run fund-contracts
- 自动派奖服务: # 启动自动派奖服务
npm run auto-payout:service

### 工作流程
```
用户投注 → BettingContract结算 → 触发
BetSettled事件 
    ↓
自动派奖服务监听到事件 → 检查是否中奖 
    ↓
如果中奖 → 调用PayoutContract.
submitPayoutRequest() 
    ↓
等待最小结算时间 → 调用PayoutContract.
executePayout()
    ↓
派奖完成
```
## 如何启动自动派奖服务？
```

# 启动自动派奖服务
npm run auto-payout:service
```



- 挖矿服务: npm run mining:service


- 派奖监控: npm run payout:monitor
## 派奖监控服务状态
✅ 派奖监控服务已成功启动并运行完成

### 🔍 服务详情
- 服务名称 : npm run payout:monitor
- 状态 : ✅ 正常运行并完成初始化
- 网络 : Sonic 测试网络
- 退出码 : 0 (成功)
### 📋 可用功能
派奖监控工具提供以下命令：

1. 查看完整状态 :
   
   ```
   npx hardhat run scripts/
   payout-monitor.js --network 
   sonic-testnet -- status
   ```
2. 手动处理指定派奖 :
   
   ```
   npx hardhat run scripts/
   payout-monitor.js --network 
   sonic-testnet -- manual <requestId>
   ```
3. 批量处理待处理派奖 :
   
   ```
   npx hardhat run scripts/
   payout-monitor.js --network 
   sonic-testnet -- batch
   ```
### 💡 说明
派奖监控服务是一个 命令行工具 ，不是持续运行的后台服务。它会：

- 初始化监控器
- 显示使用说明
- 等待用户输入具体的监控命令








## PayoutContract和MiningContract操作员角色配置完成！
setup-auto-payout.cjs
运行setup-auto-payout.cjs的配置脚本，两个合约的操作员角色配置状态如下：

### ✅ PayoutContract操作员角色 - 配置成功
从脚本执行日志可以看到：
- ✅ OPERATOR_ROLE权限授予完成
- ✅ BettingContract是否有OPERATOR_ROLE: true
- ✅ 自动派奖启用状态: true
- ✅ PayoutContract地址: 0x91D5c382fEd5B9415D0B43Ae21E70f0531092A5F

### ✅ MiningContract操作员角色 - 之前已配置成功
在主部署脚本中已经完成：
- ✅ BettingContract操作员权限 ：已授予OPERATOR_ROLE
- ✅ 部署者挖矿权限 ：已授予MINING_ROLE

### 📋 配置总结
合约 角色配置 状态 PayoutContract BettingContract → OPERATOR_ROLE ✅ 已完成
MiningContract BettingContract → OPERATOR_ROLE ✅ 已完成 
MiningContract 部署者 → MINING_ROLE ✅ 已完成

### 🎉 系统状态
所有必要的操作员角色配置已经完成！ 现在系统具备以下能力：

1. 自动派奖功能 ：BettingContract可以调用PayoutContract执行自动派奖
2. 挖矿记录创建 ：BettingContract可以在MiningContract中创建挖矿记录
3. 挖矿奖励发放 ：部署者可以运行挖矿服务发放MLHG奖励










### 向BettingContract充值VRF费用
BettingContract需要原生代币(S)来支付VRF随机数请求费用：

```
# 向BettingContract发送原生代币
# 可以通过MetaMask或脚本发送，建议充值 1-10 
S
```
### 3. 向PayoutContract和MiningContract充值代币
项目中已有专门的充值脚本 `fund-payout-contract.js` ：

```
# 运行充值脚本
node scripts/fund-payout-contract.js
```
或者手动充值：

```
// 向PayoutContract充值MLH和MLHG代币
// 向MiningContract充值MLHG代币用于挖矿奖励
```
### 4. 配置必要的角色和权限
需要配置以下权限：

- PayoutContract : 确保部署者有ADMIN_ROLE
- MiningContract : 配置OPERATOR_ROLE和MINING_ROLE
- BettingContract : 设置PayoutContract为授权的派奖合约


我需要创建一个权限配置脚本来设置各个合约的必要角色和权限。
scripts\configure-permissions.js












node scripts/check-contract-status.cjs --network sonicTestnet








## BettingContract.sol 中奖判定逻辑和事件分析
### 中奖判定逻辑
在 `BettingContract.sol` 合约中，中奖判定发生在 `onDiceRollResult` 回调函数中：

判定规则：

```
// 判断是否中奖 - Gas优化：使用位运算比较布尔
值
bool isWinner = (bet.isEvenChoice == 
isEven);
```
- 玩家选择 ： bet.isEvenChoice （true为双数，false为单数）
- 骰子结果 ： isEven （true为双数，false为单数）
- 中奖条件 ：玩家选择与骰子结果一致时中奖
派奖计算：

```
if (isWinner) {
    bet.status = BetStatus.Won;
    bet.payoutAmount = uint96((uint256
    (bet.betAmount) * PAYOUT_RATIO) / 
    RATIO_DENOMINATOR);
    totalWonBets++;
} else {
    bet.status = BetStatus.Lost;
    bet.payoutAmount = 0;
    totalLostBets++;
}
```
- 赔率 ： PAYOUT_RATIO = 190 ， RATIO_DENOMINATOR = 100
- 实际赔率 ：1:1.9（即投注1个代币，中奖可获得1.9个代币）
- 中奖时 ： payoutAmount = betAmount * 190 / 100
- 未中奖时 ： payoutAmount = 0

### 输出的事件
合约中定义了以下主要事件：
 1. BetConfirmed 事件（投注确认）

```
event BetConfirmed(
    uint256 indexed requestId,    // 请求ID（索引）
    address indexed player,       // 玩家地址（索引）
    address tokenAddress,         // 玩家支付的代币类型
    uint256 betAmount,           // 玩家支付的代币金额
    bool isEvenChoice,           // 玩家选择的单双数结果
    uint256 createdAt            // 履行时间戳
);
```

 2. BetSettled 事件（投注结算）
```
event BetSettled(
    uint256 indexed requestId,    // 请求ID（索引）
    address indexed player,       // 用户地址
    uint256 betAmount,           // 用户下注金额
    uint256 payoutAmount,        // 中奖返还金额
    bool playerChoice,           // 用户投注单双数结果
    bool diceResult,             // 下注合约掷骰子单双数结果
    bool isWinner                // 游戏判定结果
);
``` 

3. FundsWithdrawn 事件（资金提取）
```
event FundsWithdrawn(
    address indexed token,        // 代币地址
    uint256 amount,              // 提取金额
    address indexed to           // 接收地址
);
``` 

4. BetCleaned 事件（投注清理）
```
event BetCleaned(
    uint256 indexed requestId,    // 请求ID（索引）
    address indexed player        // 玩家地址（索引）
);
```

### 事件触发时机
1. BetConfirmed ：在 placeBet 函数成功创建投注时触发
2. BetSettled ：在 onDiceRollResult 回调函数中完成中奖判定后触发
3. FundsWithdrawn ：在管理员调用 withdrawFunds 提取资金时触发
4. BetCleaned ：在管理员调用 cleanupOldBets 清理旧投注记录时触发








## 用户下注后合约自动调取骰子结果的流程分析
在 `BettingContract.sol` 合约中，用户下注后会自动触发一系列操作，最终自动获取骰子结果。整个流程是完全自动化的，无需用户额外操作。下面是详细的流程：

### 1. 用户下注流程
当用户调用 `placeBet` 函数时：

```
// 调用DiceGame合约，获取VRF费用
uint256 vrfFee = getVRFCost();

// 确保合约有足够的原生代币支付VRF费用
if (address(this).balance < vrfFee) {
    revert InsufficientContractBalance
    ();
}

// 调用DiceGame合约进行掷骰子
uint256 requestId;
try diceGame.rollDice{value: vrfFee}(1, 
10, address(this)) returns (uint256 
_requestId) {
    requestId = _requestId;
} catch {
    // 如果调用失败，退还用户资金
    // ...
    revert("DiceGame call failed");
}
```

这段代码中，BettingContract 自动：

1. 计算所需的 VRF 费用
2. 调用 DiceGame 合约的 rollDice 函数请求随机数
3. 传入回调地址 address(this) ，表示结果应该回调给 BettingContract 自身


### 2. DiceGame 合约处理流程
在 `DiceGame.sol` 合约中，rollDice 函数：

```
function rollDice(
  uint8 numDice,
  uint8 numberSides,
  address callback
) external payable returns (uint256 
requestId) {
  // 验证参数...
  
  // 向VRF协调器请求随机数
  requestId = 
  _requestRandomnessPayInNative(
    CALLBACK_GAS_LIMIT,
    numDice,
    address(0),
    msg.value
  );
  
  // 存储请求信息...
  rollRequests[requestId] = RollRequest
  ({
    player: msg.sender,
    callback: callback,  // 保存回调地址
    // ...
  });
  
  // 触发事件...
  
  return requestId;
}
```
DiceGame 合约：

1. 向 Paintswap VRF 协调器请求随机数
2. 记录回调地址（BettingContract 的地址）
3. 返回请求 ID

### 3. VRF 回调自动处理
当 Paintswap VRF 协调器生成随机数后，会自动调用 DiceGame 合约的 _fulfillRandomWords 函数：

```
function _fulfillRandomWords(
  uint256 requestId,
  uint256[] calldata randomWords
) internal override {
  // 验证请求...
  
  // 计算掷骰子结果...
  uint8[] memory results = new uint8[]
  (randomWords.length);
  for (uint256 i = 0; i < randomWords.
  length; i++) {
    results[i] = uint8((randomWords[i] 
    % request.numberSides) + 1);
  }
  
  // 识别单双数结果
  bool isEven = (results[0] % 2 == 0);
  
  // 更新请求状态...
  
  // 触发事件...
  
  // 自动调用回调函数
  if (request.callback != address(0)) {
    try IDiceGameCallback(request.
    callback).onDiceRollResult
    (requestId, results, isEven) {
      // 回调成功
    } catch {
      // 回调失败，但不影响VRF结果的记录
    }
  }
}
```
DiceGame 合约在收到随机数后：

1. 计算骰子结果和单双数
2. 自动调用之前保存的回调地址（BettingContract）的 onDiceRollResult 函数
3. 传递请求 ID、骰子结果和单双数结果

### 4. BettingContract 回调处理
最后，BettingContract 的 onDiceRollResult 函数被自动调用：

```
function onDiceRollResult(
  uint256 requestId,
  uint8[] calldata results,
  bool isEven
) external override nonReentrant {
  // 验证调用者..{"toolcall":{"thought":
```







### 完整开奖信息的获取方式 1. 事件监听方式
- DiceGame合约 : 监听 DiceRollResult 事件获取骰子点数和单双数结果
- BettingContract合约 : 监听 BetSettled 事件获取投注结算信息

### 事件生成时序
1. 用户投注 → BetConfirmed 事件 (BettingContract)
2. VRF请求 → DiceRollRequested 事件 (DiceGame)
3. VRF回调 → DiceRollResult 事件 (DiceGame)
4. 投注结算 → BetSettled 事件 (BettingContract)
### 📋 总结
开奖结果事件的完整信息分布 :

- 骰子原始结果 : 在 DiceGame.sol 中生成和查询
- 投注结算结果 : 在 BettingContract.sol 中生成和查询
- 完整开奖信息 : 需要同时监听两个合约的事件或分别查询两个合约的状态
通过 requestId 作为唯一标识符，可以关联两个合约中的相关事件和数据，获取一次投注的完整开奖结果信息。











BettingContract.sol - 投注结算事件
生成位置 : `BetSettled` 事件
event BetSettled(
    uint256 indexed requestId,
    address indexed player,
    uint256 betAmount,        // 用户投注金额
    uint256 payoutAmount,     // 中奖返还金额
    bool playerChoice,        // 用户选择的单双数结果
    bool diceResult,          // 骰子结果的单双数
    bool isWinner            // 游戏判定结果
);
触发时机 : 在 `onDiceRollResult` 回调函数中，处理完中奖逻辑后触发
### 投注结算阶段
- 回调 : `onDiceRollResult`
- 权限验证 : msg.sender == address(diceGame)
- 状态验证 : bet.status == BetStatus.Confirmed
- 结果判定:
bool isWinner = (bet.isEvenChoice == isEven);
if (isWinner) {
    bet.status = BetStatus.Won;
    bet.payoutAmount = uint96((uint256(bet.betAmount) * 190) / 100);
    totalWonBets++;
} else {
    bet.status = BetStatus.Lost;
    bet.payoutAmount = 0;
    totalLostBets++;
}
事件 : BetSettled




## 完整的服务启动命令列表
根据 package.json 文件，以下是所有可用的服务命令：

### 🚀 自动派奖服务
```
npm run auto-payout:service  # 持续运行的
自动派奖服务
npm run auto-payout:start    # 一次性自动
派奖启动
```
### ⛏️ 挖矿服务
```
npm run mining:service       # 挖矿服务
npm run mining:stats         # 挖矿统计
```
### 📊 派奖监控
```
npm run payout:monitor       # 派奖监控服
务
npm run payout:status        # 派奖状态查
询
npm run payout:batch         # 批量派奖处
理
```
### 💰 资金管理
```
npm run fund:payout          # 为派奖合约
充值
```
现在您可以使用正确的命令启动各项服务了！