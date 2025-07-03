// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// 导入OpenZeppelin合约库
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
// 导入PaintswapVRF接口
import "@paintswap/vrf/contracts/interfaces/IPaintswapVRFCoordinator.sol";

// 导入DiceGame合约接口
import "./DiceGame.sol";

import "./PayoutContract.sol";
import "./MiningContract.sol";


/**
 * @title BettingContract
 * @notice 游戏下注合约，支持单双数投注游戏
 * @dev 与DiceGame.sol合约交互，支持多种代币投注
 */
contract BettingContract is Ownable, ReentrancyGuard, Pausable, IDiceGameCallback {
    using SafeERC20 for IERC20;

    // 自定义错误
    error InvalidBetAmount();
    error InvalidTokenAddress();
    error InvalidBetChoice();
    error BetNotFound();
    error BetAlreadySettled();
    error InsufficientContractBalance();
    error WithdrawFailed();
    error InvalidAddress();

    // 常量定义 - Gas优化：使用constant减少存储读取成本
    uint256 public constant MIN_BET_AMOUNT = 1 ether; // 最小投注金额: 1
    uint256 public constant MAX_BET_AMOUNT = 1000 ether; // 最大投注金额: 1000
    uint256 public constant PAYOUT_RATIO = 190; // 赔率: 1:1.9 (190/100)
    uint256 public constant RATIO_DENOMINATOR = 100;
    
    // VRF回调函数的Gas限制
    uint256 public constant CALLBACK_GAS_LIMIT = 500_000;

    // 支持的代币地址
    address public constant NATIVE_TOKEN = address(0); // 原生代币S
    address public immutable MLH_TOKEN; // MLH代币地址
    address public immutable MLHG_TOKEN; // MLHG代币地址

    // DiceGame合约地址 - Gas优化：使用immutable减少存储读取成本
    DiceGame public immutable diceGame;
    
    // PayoutContract合约地址 - 用于自动派奖
    PayoutContract public payoutContract;
    
    // 自动派奖开关
    bool public autoPayoutEnabled;
    
    // MiningContract合约地址 - 用于自动挖矿
    MiningContract public miningContract;
    
    // 自动挖矿开关
    bool public autoMiningEnabled;

    // 投注状态枚举
    enum BetStatus {
        Pending,    // 等待确认
        Confirmed,  // 已确认，等待结果
        Won,        // 中奖
        Lost,       // 未中奖
        Cancelled   // 已取消
    }

    // 投注信息结构体 - 存储优化：合理打包字段减少存储槽使用
    struct BetInfo {
        uint256 requestId;      // VRF请求ID (slot 0)
        address player;         // 玩家地址 (slot 1: 20 bytes)
        uint96 betAmount;       // 投注金额 (slot 1: 12 bytes) - 优化：使用uint96足够大额投注
        address tokenAddress;   // 投注代币地址 (slot 2: 20 bytes)
        uint96 payoutAmount;    // 派奖金额 (slot 2: 12 bytes) - 优化：使用uint96
        uint64 createdAt;       // 创建时间戳 (slot 3: 8 bytes) - 优化：uint64足够到2554年
        uint64 settledAt;       // 结算时间戳 (slot 3: 8 bytes)
        BetStatus status;       // 投注状态 (slot 3: 1 byte)
        bool isEvenChoice;      // 玩家选择的单双数结果 (slot 3: 1 byte)
        bool diceResult;        // 骰子结果的单双数 (slot 3: 1 byte)
        // 总共使用4个存储槽而不是原来的7个槽
    }

    // 常量定义 - 循环缓冲区配置
    uint256 public constant MAX_PLAYER_HISTORY = 100; // 每个玩家最大历史记录数

    // 循环缓冲区结构体
    struct CircularBuffer {
        uint256[MAX_PLAYER_HISTORY] requestIds; // 固定大小的请求ID数组
        uint256 head;                          // 头指针（下一个写入位置）
        uint256 tail;                          // 尾指针（最旧记录位置）
        uint256 count;                         // 当前记录数量
    }

    // 存储映射
    mapping(uint256 => BetInfo) public bets; // requestId => BetInfo
    mapping(address => CircularBuffer) private playerBetsBuffer; // player => CircularBuffer
    mapping(address => uint256) public tokenBalances; // token => balance

    // 计数器
    uint256 public totalBets;
    uint256 public totalWonBets;
    uint256 public totalLostBets;

    // 事件定义
    /**
     * @notice 投注确认事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param tokenAddress 玩家支付的代币类型
     * @param betAmount 玩家支付的代币金额
     * @param isEvenChoice 玩家选择的单双数结果（true为双数，false为单数）
     * @param createdAt 履行时间戳
     */
    event BetConfirmed(
        uint256 indexed requestId,
        address indexed player,
        address tokenAddress,
        uint256 betAmount,
        bool isEvenChoice,
        uint256 createdAt
    );

    /**
     * @notice 投注中奖事件
     * @param requestId 请求ID（索引）
     * @param player 用户地址
     * @param betAmount 用户下注金额
     * @param payoutAmount 中奖返还金额
     * @param playerChoice 用户投注单双数结果
     * @param diceResult 下注合约掷骰子单双数结果
     * @param isWinner 游戏判定结果
     */
    event BetSettled(
        uint256 indexed requestId,
        address indexed player,
        uint256 betAmount,
        uint256 payoutAmount,
        bool playerChoice,
        bool diceResult,
        bool isWinner
    );

    /**
     * @notice 资金提取事件
     * @param token 代币地址
     * @param amount 提取金额
     * @param to 接收地址
     */
    event FundsWithdrawn(
        address indexed token,
        uint256 amount,
        address indexed to
    );

    /**
     * @notice 投注记录清理事件
     * @param requestId 请求ID
     * @param player 玩家地址
     */
    event BetCleaned(
        uint256 indexed requestId,
        address indexed player
    );

    /**
     * @notice 自动派奖执行事件
     * @param requestId 请求ID
     * @param player 玩家地址
     * @param payoutAmount 派奖金额
     * @param success 是否成功
     */
    event AutoPayoutExecuted(
        uint256 indexed requestId,
        address indexed player,
        uint256 payoutAmount,
        bool success
    );

    /**
     * @notice PayoutContract地址更新事件
     * @param oldContract 旧合约地址
     * @param newContract 新合约地址
     */
    event PayoutContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );

    /**
     * @notice 自动派奖状态更新事件
     * @param enabled 是否启用
     */
    event AutoPayoutStatusUpdated(
        bool enabled
    );

    /**
     * @notice MiningContract地址更新事件
     * @param oldContract 旧合约地址
     * @param newContract 新合约地址
     */
    event MiningContractUpdated(
        address indexed oldContract,
        address indexed newContract
    );

    /**
     * @notice 自动挖矿执行事件
     * @param requestId 请求ID
     * @param player 玩家地址
     * @param miningAmount 挖矿奖励金额
     * @param success 是否成功
     */
    event AutoMiningExecuted(
        uint256 indexed requestId,
        address indexed player,
        uint256 miningAmount,
        bool success
    );

    /**
     * @notice 自动挖矿状态更新事件
     * @param enabled 是否启用
     */
    event AutoMiningStatusUpdated(
        bool enabled
    );

    /**
     * @notice 构造函数
     * @param _diceGame DiceGame合约地址
     * @param _mlhToken MLH代币地址
     * @param _mlhgToken MLHG代币地址
     */
    constructor(
        address _diceGame,
        address _mlhToken,
        address _mlhgToken
    ) Ownable(msg.sender) {
        if (_diceGame == address(0) || _mlhToken == address(0) || _mlhgToken == address(0)) {
            revert InvalidAddress();
        }
        
        diceGame = DiceGame(_diceGame);
        MLH_TOKEN = _mlhToken;
        MLHG_TOKEN = _mlhgToken;
        

    }

    /**
     * @notice 下注函数
     * @param tokenAddress 投注代币地址（address(0)为原生代币）
     * @param betAmount 投注金额
     * @param isEvenChoice 选择的单双数（true为双数，false为单数）
     */
    function placeBet(
        address tokenAddress,
        uint256 betAmount,
        bool isEvenChoice
    ) external payable nonReentrant whenNotPaused {
        // 验证投注金额
        if (betAmount < MIN_BET_AMOUNT || betAmount > MAX_BET_AMOUNT) {
            revert InvalidBetAmount();
        }

        // 验证代币地址
        if (tokenAddress != NATIVE_TOKEN && 
            tokenAddress != MLH_TOKEN && 
            tokenAddress != MLHG_TOKEN) {
            revert InvalidTokenAddress();
        }

        // 处理代币转账
        uint256 vrfFee;
        if (tokenAddress == NATIVE_TOKEN) {
            // 原生代币投注：msg.value = betAmount + vrfFee
            if (msg.value <= betAmount) {
                revert InvalidBetAmount();
            }
            vrfFee = msg.value - betAmount;
            tokenBalances[NATIVE_TOKEN] += betAmount;
        } else {
            // ERC20代币投注：msg.value = vrfFee
            vrfFee = msg.value;
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), betAmount);
            tokenBalances[tokenAddress] += betAmount;
        }

        // 调用DiceGame合约进行掷骰子
        // VRF费用由调用者通过msg.value提供
        uint256 requestId;
        try diceGame.rollDice{value: vrfFee}(1, 10, address(this)) returns (uint256 _requestId) {
            requestId = _requestId;
        } catch {
            // 如果调用失败，退还用户资金
            if (tokenAddress == NATIVE_TOKEN) {
                tokenBalances[NATIVE_TOKEN] -= betAmount;
                // 使用call替代transfer以避免重入攻击风险
                (bool success, ) = payable(msg.sender).call{value: betAmount}("");
                require(success, "Native token refund failed");
            } else {
                tokenBalances[tokenAddress] -= betAmount;
                IERC20(tokenAddress).safeTransfer(msg.sender, betAmount);
            }
            revert("DiceGame call failed");
        }

        // 创建投注记录 - 存储优化：使用优化后的数据类型
        bets[requestId] = BetInfo({
            requestId: requestId,
            player: msg.sender,
            betAmount: uint96(betAmount), // 类型转换为uint96
            tokenAddress: tokenAddress,
            payoutAmount: 0,
            createdAt: uint64(block.timestamp), // 类型转换为uint64
            settledAt: 0,
            status: BetStatus.Confirmed,
            isEvenChoice: isEvenChoice,
            diceResult: false
        });

        // 记录玩家投注历史 - 使用循环缓冲区
        _addPlayerBet(msg.sender, requestId);
        totalBets++;

        // 触发投注确认事件
        emit BetConfirmed(
            requestId,
            msg.sender,
            tokenAddress,
            betAmount,
            isEvenChoice,
            block.timestamp
        );
    }

    /**
     * @notice DiceGame回调函数，处理掷骰子结果
     * @param requestId VRF请求ID
     * @param isEven 骰子结果的单双数
     */
    function onDiceRollResult(
        uint256 requestId,
        uint8[] calldata /* results */,
        bool isEven
    ) external override nonReentrant {
        // 只允许DiceGame合约调用
        require(msg.sender == address(diceGame), "Only DiceGame can call");

        BetInfo storage bet = bets[requestId];
        
        // 验证投注存在且未结算
        if (bet.player == address(0)) {
            revert BetNotFound();
        }
        if (bet.status != BetStatus.Confirmed) {
            revert BetAlreadySettled();
        }

        // 更新投注结果 - 存储优化：使用优化后的数据类型
        bet.diceResult = isEven;
        bet.settledAt = uint64(block.timestamp); // 类型转换为uint64

        // 判断是否中奖 - Gas优化：使用位运算比较布尔值
        bool isWinner = (bet.isEvenChoice == isEven);
        
        if (isWinner) {
            // 中奖处理 - 存储优化：使用uint96类型
            bet.status = BetStatus.Won;
            
            // 计算派奖金额并检查溢出
            uint256 calculatedPayout = (uint256(bet.betAmount) * PAYOUT_RATIO) / RATIO_DENOMINATOR;
            require(calculatedPayout <= type(uint96).max, "Payout amount exceeds uint96 range");
            bet.payoutAmount = uint96(calculatedPayout);
            
            totalWonBets++;
            
            // 自动派奖处理
            if (autoPayoutEnabled && address(payoutContract) != address(0)) {
                _executeAutoPayout(requestId, bet);
            }
        } else {
            // 未中奖处理
            bet.status = BetStatus.Lost;
            bet.payoutAmount = 0;
            totalLostBets++;
            
            // 自动挖矿处理
            if (autoMiningEnabled && address(miningContract) != address(0)) {
                _executeAutoMining(requestId, bet);
            }
        }

        // 触发投注结算事件
        emit BetSettled(
            requestId,
            bet.player,
            bet.betAmount,
            bet.payoutAmount,
            bet.isEvenChoice,
            bet.diceResult,
            isWinner
        );
    }

    /**
     * @notice 获取VRF协调器地址
     * @return VRF协调器合约地址
     */
    function getVRFCoordinator() external view returns (address) {
        return diceGame.getVRFCoordinator();
    }

    /**
     * @notice 获取VRF费用
     * @return VRF费用（以wei为单位）
     */
    function getVRFCost() external view returns (uint256) {
        return diceGame.getVRFCost();
    }

    /**
     * @notice 获取玩家投注历史
     * @param player 玩家地址
     * @return 投注请求ID数组（按时间倒序，最新的在前）
     */
    function getPlayerBets(address player) external view returns (uint256[] memory) {
        return _getPlayerBets(player);
    }

    /**
     * @notice 获取玩家投注历史（分页）
     * @param player 玩家地址
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 投注请求ID数组
     */
    function getPlayerBetsPaginated(
        address player,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory) {
        return _getPlayerBetsPaginated(player, offset, limit);
    }

    /**
     * @notice 获取玩家投注历史数量
     * @param player 玩家地址
     * @return 投注历史数量
     */
    function getPlayerBetsCount(address player) external view returns (uint256) {
        return playerBetsBuffer[player].count;
    }

    /**
     * @notice 获取投注详情
     * @param requestId 请求ID
     * @return 投注信息
     */
    function getBetInfo(uint256 requestId) external view returns (BetInfo memory) {
        return bets[requestId];
    }

    /**
     * @notice 获取合约代币余额
     * @param tokenAddress 代币地址
     * @return 余额
     */
    function getContractBalance(address tokenAddress) external view returns (uint256) {
        if (tokenAddress == NATIVE_TOKEN) {
            return address(this).balance;
        } else {
            return IERC20(tokenAddress).balanceOf(address(this));
        }
    }

    /**
     * @notice 提取合约中的资金（仅限管理员）
     * @param tokenAddress 代币地址（address(0)表示原生代币）
     * @param amount 提取金额
     */
    function withdrawFunds(address tokenAddress, uint256 amount) external onlyOwner {
        if (tokenAddress == address(0)) {
            // 提取原生代币
            require(address(this).balance >= amount, "Insufficient native token balance");
            // 使用call替代transfer以避免重入攻击风险
            (bool success, ) = payable(owner()).call{value: amount}("");
            require(success, "Native token withdrawal failed");
        } else {
            // 提取ERC20代币
            IERC20 token = IERC20(tokenAddress);
            require(token.balanceOf(address(this)) >= amount, "Insufficient token balance");
            // 使用safeTransfer替代transfer以提高安全性
            token.safeTransfer(owner(), amount);
        }
        
        emit FundsWithdrawn(tokenAddress, amount, owner());
    }

    /**
     * @notice 批量清理已结算的旧投注记录 - 存储优化：实现数据清理机制
     * @param requestIds 要清理的请求ID数组
     * @dev 只能清理已结算且超过7天的投注记录
     */
    function cleanupOldBets(uint256[] calldata requestIds) external onlyOwner {
        uint256 cutoffTime = block.timestamp - 7 days;
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            BetInfo storage bet = bets[requestId];
            
            // 检查投注是否存在且已结算且超过清理时间
            if (bet.player != address(0) && 
                (bet.status == BetStatus.Won || bet.status == BetStatus.Lost) &&
                bet.settledAt > 0 && 
                bet.settledAt < cutoffTime) {
                
                address player = bet.player;
                
                // 清理投注记录
                delete bets[requestId];
                
                // 清理玩家循环缓冲区中的对应记录
                _removeFromPlayerHistory(player, requestId);
                
                // 发出清理事件
                emit BetCleaned(requestId, player);
            }
        }
    }

    /**
     * @notice 添加玩家投注记录到循环缓冲区
     * @param player 玩家地址
     * @param requestId 请求ID
     */
    function _addPlayerBet(address player, uint256 requestId) internal {
        CircularBuffer storage buffer = playerBetsBuffer[player];
        
        // 将新记录添加到头指针位置
        buffer.requestIds[buffer.head] = requestId;
        
        // 更新头指针
        buffer.head = (buffer.head + 1) % MAX_PLAYER_HISTORY;
        
        // 如果缓冲区已满，移动尾指针（覆盖最旧记录）
        if (buffer.count == MAX_PLAYER_HISTORY) {
            buffer.tail = (buffer.tail + 1) % MAX_PLAYER_HISTORY;
        } else {
            buffer.count++;
        }
    }

    /**
     * @notice 从玩家循环缓冲区中移除指定的投注记录
     * @param player 玩家地址
     * @param requestId 要移除的请求ID
     */
    function _removeFromPlayerHistory(address player, uint256 requestId) internal {
        CircularBuffer storage buffer = playerBetsBuffer[player];
        
        if (buffer.count == 0) {
            return;
        }
        
        // 查找并移除指定的requestId
        bool found = false;
        uint256 foundIndex = 0;
        
        // 从尾指针开始搜索（最旧的记录）
        for (uint256 i = 0; i < buffer.count; i++) {
            uint256 searchIndex = (buffer.tail + i) % MAX_PLAYER_HISTORY;
            if (buffer.requestIds[searchIndex] == requestId) {
                found = true;
                foundIndex = searchIndex;
                break;
            }
        }
        
        if (!found) {
            return;
        }
        
        // 将找到的记录后面的所有记录向前移动一位
        uint256 currentIndex = foundIndex;
        for (uint256 i = 0; i < buffer.count - 1; i++) {
            uint256 nextIndex = (currentIndex + 1) % MAX_PLAYER_HISTORY;
            buffer.requestIds[currentIndex] = buffer.requestIds[nextIndex];
            currentIndex = nextIndex;
            
            // 如果到达头指针前一位，停止移动
            if (nextIndex == buffer.head) {
                break;
            }
        }
        
        // 更新头指针和计数
        buffer.head = (buffer.head + MAX_PLAYER_HISTORY - 1) % MAX_PLAYER_HISTORY;
        buffer.count--;
        
        // 如果缓冲区变空，重置指针
        if (buffer.count == 0) {
            buffer.head = 0;
            buffer.tail = 0;
        }
    }

    /**
     * @notice 获取玩家投注历史（内部函数）
     * @param player 玩家地址
     * @return 投注请求ID数组（按时间倒序）
     */
    function _getPlayerBets(address player) internal view returns (uint256[] memory) {
        CircularBuffer storage buffer = playerBetsBuffer[player];
        uint256[] memory result = new uint256[](buffer.count);
        
        if (buffer.count == 0) {
            return result;
        }
        
        // 从最新记录开始读取（头指针前一位置）
        uint256 currentPos = buffer.head;
        for (uint256 i = 0; i < buffer.count; i++) {
            // 向前移动指针（循环）
            currentPos = (currentPos + MAX_PLAYER_HISTORY - 1) % MAX_PLAYER_HISTORY;
            result[i] = buffer.requestIds[currentPos];
        }
        
        return result;
    }

    /**
     * @notice 获取玩家投注历史（分页，内部函数）
     * @param player 玩家地址
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 投注请求ID数组
     */
    function _getPlayerBetsPaginated(
        address player,
        uint256 offset,
        uint256 limit
    ) internal view returns (uint256[] memory) {
        CircularBuffer storage buffer = playerBetsBuffer[player];
        
        // 检查偏移量是否有效
        if (offset >= buffer.count) {
            return new uint256[](0);
        }
        
        // 计算实际返回数量
        uint256 remaining = buffer.count - offset;
        uint256 actualLimit = remaining < limit ? remaining : limit;
        uint256[] memory result = new uint256[](actualLimit);
        
        // 从指定偏移量开始读取
        uint256 currentPos = buffer.head;
        
        // 先跳过offset个记录
        for (uint256 i = 0; i < offset; i++) {
            currentPos = (currentPos + MAX_PLAYER_HISTORY - 1) % MAX_PLAYER_HISTORY;
        }
        
        // 读取limit个记录
        for (uint256 i = 0; i < actualLimit; i++) {
            currentPos = (currentPos + MAX_PLAYER_HISTORY - 1) % MAX_PLAYER_HISTORY;
            result[i] = buffer.requestIds[currentPos];
        }
        
        return result;
    }

    /**
     * @notice 获取可清理的投注记录数量 - 存储优化：查询优化
     * @return 可清理的记录数量
     */
    function getCleanableBetsCount() external pure returns (uint256) {
        // 注意：这个函数在实际使用中需要链下辅助来获取所有requestId
        // 这里只是提供接口，实际实现需要事件日志支持
        return 0; // 占位符实现
    }

    /**
     * @notice 批量查询投注信息 - Gas优化：减少多次调用成本
     * @param requestIds 请求ID数组
     * @return 投注信息数组
     */
    function getBatchBetInfo(uint256[] calldata requestIds) 
        external 
        view 
        returns (BetInfo[] memory) 
    {
        BetInfo[] memory results = new BetInfo[](requestIds.length);
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            results[i] = bets[requestIds[i]];
        }
        
        return results;
    }

    /**
     * @notice 检查投注是否可以结算 - Gas优化：优化状态检查
     * @param requestId 请求ID
     * @return 是否可以结算
     */
    function isBetSettleable(uint256 requestId) external view returns (bool) {
        BetInfo storage bet = bets[requestId];
        return bet.player != address(0) && bet.status == BetStatus.Confirmed;
    }

    /**
     * @notice 获取合约统计信息 - Gas优化：单次调用获取多个状态
     * @return _totalBets 总投注数
     * @return _wonBets 中奖投注数
     * @return _lostBets 失败投注数
     * @return _nativeBalance 原生代币余额
     */
    function getContractStats() 
        external 
        view 
        returns (
            uint256 _totalBets,
            uint256 _wonBets,
            uint256 _lostBets,
            uint256 _nativeBalance
        ) 
    {
        return (
            totalWonBets + totalLostBets,
            totalWonBets,
            totalLostBets,
            address(this).balance
        );
    }

    /**
     * @notice 充值原生代币到合约（用于支付VRF费用）
     */
    function depositNativeToken() external payable {
        // 允许任何人向合约充值原生代币用于支付VRF费用
        // 这些资金不计入投注余额
    }

    /**
     * @notice 设置PayoutContract地址（仅限管理员）
     * @param _payoutContract PayoutContract合约地址
     */
    function setPayoutContract(address payable _payoutContract) external onlyOwner {
        if (_payoutContract == address(0)) {
            revert InvalidAddress();
        }
        
        address oldContract = address(payoutContract);
        payoutContract = PayoutContract(_payoutContract);
        
        emit PayoutContractUpdated(oldContract, _payoutContract);
    }

    /**
     * @notice 设置自动派奖状态（仅限管理员）
     * @param _enabled 是否启用自动派奖
     */
    function setAutoPayoutEnabled(bool _enabled) external onlyOwner {
        autoPayoutEnabled = _enabled;
        emit AutoPayoutStatusUpdated(_enabled);
    }

    /**
     * @notice 设置MiningContract地址（仅限管理员）
     * @param _miningContract MiningContract合约地址
     */
    function setMiningContract(address payable _miningContract) external onlyOwner {
        if (_miningContract == address(0)) {
            revert InvalidAddress();
        }
        
        address oldContract = address(miningContract);
        miningContract = MiningContract(_miningContract);
        
        emit MiningContractUpdated(oldContract, _miningContract);
    }

    /**
     * @notice 设置自动挖矿状态（仅限管理员）
     * @param _enabled 是否启用自动挖矿
     */
    function setAutoMiningEnabled(bool _enabled) external onlyOwner {
        autoMiningEnabled = _enabled;
        emit AutoMiningStatusUpdated(_enabled);
    }

    /**
     * @notice 执行自动派奖（内部函数）
     * @param requestId VRF请求ID
     * @param bet 投注信息
     */
    function _executeAutoPayout(uint256 requestId, BetInfo memory bet) internal {
        bool success = false;
        
        try payoutContract.submitPayoutRequest(
            requestId,
            bet.player,
            bet.tokenAddress,
            bet.payoutAmount,
            bet.betAmount,
            bet.createdAt,
            bet.settledAt,
            bet.isEvenChoice,
            bet.diceResult,
            true // isWinner
        ) {
            // 提交派奖请求成功，立即执行派奖
            try payoutContract.executePayout(requestId) {
                success = true;
            } catch {
                // 执行派奖失败，但请求已提交
                success = false;
            }
        } catch {
            // 提交派奖请求失败
            success = false;
        }
        
        // 触发自动派奖执行事件
        emit AutoPayoutExecuted(
            requestId,
            bet.player,
            bet.payoutAmount,
            success
        );
    }

    /**
     * @notice 执行自动挖矿（内部函数）
     * @param requestId VRF请求ID
     * @param bet 投注信息
     */
    function _executeAutoMining(uint256 requestId, BetInfo memory bet) internal {
        bool success = false;
        uint256 miningAmount = 0;
        
        try miningContract.submitMiningRequest(
            requestId,
            bet.player,
            bet.tokenAddress,
            bet.betAmount,
            bet.createdAt,
            bet.settledAt,
            bet.isEvenChoice,
            bet.diceResult,
            false // isWinner - 未中奖才能挖矿
        ) {
            // 提交挖矿请求成功，立即执行挖矿
            try miningContract.executeMining(requestId) {
                success = true;
                // 获取挖矿奖励金额（从MiningContract查询）
                try miningContract.getMiningInfo(requestId) returns (MiningContract.MiningInfo memory miningInfo) {
                    miningAmount = miningInfo.miningAmount;
                } catch {
                    // 如果获取失败，使用默认计算方式
                    miningAmount = bet.betAmount; // 简化处理
                }
            } catch {
                // 执行挖矿失败，但请求已提交
                success = false;
            }
        } catch {
            // 提交挖矿请求失败
            success = false;
        }
        
        // 触发自动挖矿执行事件
        emit AutoMiningExecuted(
            requestId,
            bet.player,
            miningAmount,
            success
        );
    }

    /**
     * @notice 手动重试派奖（仅限管理员）
     * @param requestId VRF请求ID
     * @dev 用于处理自动派奖失败的情况
     */
    function retryPayout(uint256 requestId) external onlyOwner {
        BetInfo storage bet = bets[requestId];
        
        // 验证投注存在且已中奖
        if (bet.player == address(0)) {
            revert BetNotFound();
        }
        if (bet.status != BetStatus.Won) {
            revert InvalidBetChoice();
        }
        
        // 检查PayoutContract是否已设置
        if (address(payoutContract) == address(0)) {
            revert InvalidAddress();
        }
        
        // 执行派奖重试
        _executeAutoPayout(requestId, bet);
    }

    /**
     * @notice 获取自动派奖配置信息
     * @return payoutContractAddr PayoutContract地址
     * @return enabled 是否启用自动派奖
     */
    function getAutoPayoutConfig() external view returns (
        address payoutContractAddr,
        bool enabled
    ) {
        return (address(payoutContract), autoPayoutEnabled);
    }

    /**
     * @notice 获取自动挖矿配置信息
     * @return miningContractAddr MiningContract地址
     * @return enabled 是否启用自动挖矿
     */
    function getAutoMiningConfig() external view returns (
        address miningContractAddr,
        bool enabled
    ) {
        return (address(miningContract), autoMiningEnabled);
    }

    /**
     * @notice 手动重试挖矿（仅限管理员）
     * @param requestId VRF请求ID
     * @dev 用于处理自动挖矿失败的情况
     */
    function retryMining(uint256 requestId) external onlyOwner {
        BetInfo storage bet = bets[requestId];
        
        // 验证投注存在且未中奖
        if (bet.player == address(0)) {
            revert BetNotFound();
        }
        if (bet.status != BetStatus.Lost) {
            revert InvalidBetChoice();
        }
        
        // 检查MiningContract是否已设置
        if (address(miningContract) == address(0)) {
            revert InvalidAddress();
        }
        
        // 执行挖矿重试
        _executeAutoMining(requestId, bet);
    }

    /**
     * @notice 暂停合约（仅限所有者）
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice 恢复合约（仅限所有者）
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice 获取合约统计信息
     * @return _totalBets 总投注数
     * @return _totalWonBets 总中奖数
     * @return _totalLostBets 总失败数
     */
    function getStats() external view returns (
        uint256 _totalBets,
        uint256 _totalWonBets,
        uint256 _totalLostBets
    ) {
        return (totalBets, totalWonBets, totalLostBets);
    }

    /**
     * @notice 接收原生代币
     */
    receive() external payable {
        // 允许接收原生代币
    }

    /**
     * @notice 回退函数
     */
    fallback() external payable {
        // 允许接收原生代币
    }

}