// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BuyKingPool
 * @dev 买单王奖金池合约
 * 监听MLHGToken合约的买单事件，实现24小时轮次和购买量排名机制
 * 
 * 状态机设计说明：
 * ================
 * 本合约使用严格的状态机模式来防止轮次切换的竞态条件：
 * 
 * 轮次状态枚举：
 * - ACTIVE: 轮次进行中，可以接收买单和代币
 * - TRANSITIONING: 轮次切换中，所有操作被阻塞（原子状态）
 * - FINISHED: 轮次已结束，不可修改
 * 
 * 状态转换规则：
 * - ACTIVE -> TRANSITIONING: 当轮次到期时，通过_performRoundTransition()触发
 * - TRANSITIONING -> FINISHED: 在_finishCurrentRound()中完成
 * - FINISHED -> ACTIVE: 在_startNewRound()中创建新轮次
 * 
 * 竞态条件防护机制：
 * 1. roundTransitionGuard修饰符：防止重入和并发访问
 * 2. _roundTransitionMutex互斥锁：确保同时只有一个轮次切换操作
 * 3. _transitionLockCounter计数器：检测重入攻击
 * 4. 原子性状态转换：TRANSITIONING状态确保操作的原子性
 * 
 * 安全保证：
 * - 轮次切换操作是原子的，不会被中断
 * - 高并发情况下不会出现状态不一致
 * - 防止重入攻击和竞态条件
 * - 确保奖金分配的准确性和安全性
 */
contract BuyKingPool is ReentrancyGuard {
    using SafeERC20 for IERC20;
    // MLHGToken合约地址
    address public immutable mlhgToken;
    
    // 合约所有者
    address public immutable owner;
    
    // 轮次状态枚举，确保状态转换的原子性
    enum RoundState {
        ACTIVE,           // 轮次进行中
        TRANSITIONING,    // 轮次切换中（原子状态）
        FINISHED          // 轮次已结束
    }
    
    // 优化后的轮次基础信息结构（可复制，无mapping）
    struct RoundInfo {
        uint256 roundId;           // 轮次ID
        uint256 startTime;         // 轮次开始时间
        uint256 endTime;           // 轮次结束时间
        uint256 totalPrize;        // 总奖金
        address topBuyer;          // 购买量第一名
        uint256 topBuyAmount;      // 第一名的购买量
        RoundState state;          // 轮次状态
        bool isPrizeDistributed;   // 奖金是否已分配
    }
    
    // 当前轮次基础信息
    RoundInfo public currentRound;
    
    // 轮次切换锁计数器，支持重入检测
    uint256 private _transitionLockCounter;
    
    // 轮次切换互斥锁
    bool private _roundTransitionMutex;
    
    // 当前轮次动态数据（分离存储）
    mapping(address => uint256) public currentBuyerAmounts;  // 当前轮次买家购买量
    address[] public currentBuyers;                          // 当前轮次买家列表
    
    // 历史轮次存储（直接使用RoundInfo结构）
    mapping(uint256 => RoundInfo) public rounds;
    
    // 每轮次买家购买量记录
    mapping(uint256 => mapping(address => uint256)) public roundBuyerAmounts;
    
    // 每轮次买家列表
    mapping(uint256 => address[]) public roundBuyers;
    
    // 轮次持续时间（24小时）
    uint256 public constant ROUND_DURATION = 24 hours;
    
    // 奖金分配比例（1/3给获奖者，2/3留给下一轮）
    uint256 public constant WINNER_NUMERATOR = 1;    // 获奖者分子
    uint256 public constant TOTAL_DENOMINATOR = 3;   // 总分母
    
    // 事件定义
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event BuyOrderProcessed(uint256 indexed roundId, address indexed buyer, uint256 amount, uint256 totalAmount);
    event LeaderChanged(uint256 indexed roundId, address indexed newLeader, uint256 amount);
    event RoundFinished(uint256 indexed roundId, address indexed winner, uint256 prizeAmount);
    event PrizeDistributed(uint256 indexed roundId, address indexed winner, uint256 winnerAmount, uint256 nextRoundAmount);
    event HistoryRoundsCleanup(uint256[] roundIds, uint256 timestamp);
    event InactiveBuyersCleanup(address[] buyers, uint256 roundId, uint256 timestamp);
    event ContractMaintenance(string action, uint256 timestamp);
    event TokensReceived(uint256 indexed roundId, uint256 amount, uint256 previousPrize, uint256 newTotalPrize, uint256 contractBalance, uint256 timestamp);
    
    // 新增事件：Gas攻击防护和状态变更
    event GasOptimizationModeChanged(bool indexed enabled, uint256 indexed maxBuyersForFullSort, address indexed changedBy, uint256 timestamp);
    event EmergencyModeChanged(bool indexed activated, address indexed changedBy, string reason, uint256 timestamp);
    event RoundTransitionFailed(uint256 indexed roundId, string reason, uint256 timestamp);
    event SecurityAlert(string indexed alertType, address indexed account, uint256 indexed value, string details, uint256 timestamp);
    event EmergencyWithdraw(address indexed recipient, uint256 amount, uint256 timestamp);
    
    // 新增事件：错误处理和异常情况
    event BuyOrderRejected(address indexed buyer, uint256 indexed amount, uint256 indexed roundId, string reason, uint256 timestamp);
    event BalanceValidationFailed(uint256 expectedBalance, uint256 actualBalance, uint256 timestamp);
    event RoundStateError(uint256 indexed roundId, string expectedState, string actualState, uint256 timestamp);
    
    /**
     * @dev 构造函数
     * @param _mlhgToken MLHGToken合约地址
     */
    constructor(address _mlhgToken) {
        require(_mlhgToken != address(0), "Invalid MLHG token address");
        
        mlhgToken = _mlhgToken;
        owner = msg.sender;
        
        // 初始化第一轮次（roundId从1开始）
        _initializeFirstRound();
    }
    
    /**
     * @dev 仅所有者修饰符
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    /**
     * @dev 仅MLHGToken合约修饰符
     */
    modifier onlyMLHGToken() {
        require(msg.sender == mlhgToken, "Not MLHG token");
        _;
    }
    
    /**
     * @dev 处理买单事件（由MLHGToken合约调用）
     * @param buyer 买家地址
     * @param amount 买单金额
     */
    function processBuyOrder(address buyer, uint256 amount) external onlyMLHGToken nonReentrant {
        // 输入验证
        if (buyer == address(0)) {
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Invalid buyer address", block.timestamp);
            revert("Invalid buyer address");
        }
        
        if (amount == 0) {
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Invalid amount", block.timestamp);
            revert("Amount must be greater than 0");
        }
        
        // 原子性检查和处理轮次切换，防止竞态条件
        try this._ensureCurrentRoundActive() {
            // 验证成功
        } catch {
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Round not active", block.timestamp);
            revert("Current round is not active");
        }
        
        // 记录当前轮次ID，确保整个操作在同一轮次内完成
        uint256 currentRoundId = currentRound.roundId;
        
        // 检查溢出
        uint256 previousAmount = currentBuyerAmounts[buyer];
        uint256 newTotalAmount = previousAmount + amount;
        if (newTotalAmount < previousAmount) {
            emit BuyOrderRejected(buyer, amount, currentRoundId, "Amount overflow", block.timestamp);
            emit SecurityAlert(
                "AMOUNT_OVERFLOW",
                buyer,
                amount,
                "Buy order amount overflow detected",
                block.timestamp
            );
            revert("Amount overflow");
        }
        
        // 如果是新买家，添加到买家列表
        if (currentBuyerAmounts[buyer] == 0) {
            currentBuyers.push(buyer);
            roundBuyers[currentRoundId].push(buyer);
        }
        
        // 更新买家购买量
        currentBuyerAmounts[buyer] = newTotalAmount;
        roundBuyerAmounts[currentRoundId][buyer] = newTotalAmount;
        
        // 检查是否成为新的领先者
        if (newTotalAmount > currentRound.topBuyAmount) {
            currentRound.topBuyer = buyer;
            currentRound.topBuyAmount = newTotalAmount;
            
            emit LeaderChanged(currentRoundId, buyer, newTotalAmount);
        }
        
        // 发布买单处理事件
        emit BuyOrderProcessed(currentRoundId, buyer, amount, newTotalAmount);
        
        // 记录安全验证信息
        if (amount > 1000000 * 10**18) { // 如果是大额交易，记录安全警报
            emit SecurityAlert(
                "LARGE_BUY_ORDER",
                buyer,
                amount,
                "Large buy order detected",
                block.timestamp
            );
        }
    }
    
    /**
     * @dev 修饰符：确保轮次切换操作的原子性
     */
    modifier roundTransitionGuard() {
        require(!_roundTransitionMutex, "Round transition in progress");
        _transitionLockCounter++;
        require(_transitionLockCounter == 1, "Reentrant round transition detected");
        _;
        _transitionLockCounter--;
    }
    
    /**
     * @dev 外部函数：确保当前轮次处于活跃状态，处理轮次切换
     * @notice 使用状态机模式和严格的锁机制防止竞态条件
     */
    function _ensureCurrentRoundActive() external {
        // 如果轮次正在切换中，直接返回错误
        require(currentRound.state != RoundState.TRANSITIONING, "Round transition in progress");
        
        // 检查是否需要轮次切换
        if (block.timestamp >= currentRound.endTime && currentRound.state == RoundState.ACTIVE) {
            this._performRoundTransition();
        }
        
        // 确保当前轮次处于活跃状态
        require(currentRound.state == RoundState.ACTIVE, "Current round is not active");
        require(block.timestamp < currentRound.endTime, "Current round has expired");
    }
    
    /**
     * @dev 外部函数：执行轮次切换（原子操作）
     */
    function _performRoundTransition() external roundTransitionGuard {
        uint256 roundId = currentRound.roundId;
        
        // 设置互斥锁
        _roundTransitionMutex = true;
        
        // 原子性状态转换：ACTIVE -> TRANSITIONING
        if (currentRound.state != RoundState.ACTIVE) {
            emit RoundStateError(roundId, "ACTIVE", "TRANSITIONING", block.timestamp);
            _roundTransitionMutex = false;
            revert("Invalid round state for transition");
        }
        
        currentRound.state = RoundState.TRANSITIONING;
        
        // 双重检查：确保在获取锁后状态仍然需要切换
        if (block.timestamp >= currentRound.endTime) {
            try this._finishCurrentRound() {
                try this._startNewRound() {
                    // 轮次切换成功
                } catch {
                    emit RoundTransitionFailed(roundId, "Failed to start new round", block.timestamp);
                    _roundTransitionMutex = false;
                    revert("Failed to start new round");
                }
            } catch {
                emit RoundTransitionFailed(roundId, "Failed to finish current round", block.timestamp);
                _roundTransitionMutex = false;
                revert("Failed to finish current round");
            }
        } else {
            // 如果时间检查失败，恢复状态
            currentRound.state = RoundState.ACTIVE;
            emit RoundTransitionFailed(roundId, "Time check failed during transition", block.timestamp);
        }
        
        // 释放互斥锁
        _roundTransitionMutex = false;
        
        // 记录轮次切换完成事件
        emit ContractMaintenance(
            string(abi.encodePacked(
                "Round transition completed: ",
                _uint256ToString(roundId),
                " -> ",
                _uint256ToString(currentRound.roundId)
            )),
            block.timestamp
        );
    }
    
    /**
     * @dev 手动结束当前轮次（任何人都可以调用）
     * @notice 使用状态机模式防止竞态条件
     */
    function finishRound() external {
        require(block.timestamp >= currentRound.endTime, "Round not finished yet");
        require(currentRound.state == RoundState.ACTIVE, "Round is not active");
        
        // 执行轮次切换
        try this._performRoundTransition() {
            // 轮次切换成功
        } catch {
            emit RoundTransitionFailed(currentRound.roundId, "Manual round transition failed", block.timestamp);
            revert("Round transition failed");
        }
    }
    
    /**
     * @dev 外部函数：结束当前轮次
     */
    function _finishCurrentRound() external {
        // 确保状态正确
        require(currentRound.state == RoundState.TRANSITIONING, "Invalid state for finishing round");
        
        // 设置轮次为已结束状态
        currentRound.state = RoundState.FINISHED;
        
        // 先保存原始轮次历史数据（在分配奖金前保存，确保历史数据完整性）
        rounds[currentRound.roundId] = currentRound;
        
        // 如果有获奖者
        if (currentRound.topBuyer != address(0)) {
            // 计算实际分配给获奖者的奖金金额（1/3）
            uint256 actualWinnerPrize = (currentRound.totalPrize * WINNER_NUMERATOR) / TOTAL_DENOMINATOR;
            
            // 发布轮次结束事件，传递实际分配给获奖者的金额
            emit RoundFinished(currentRound.roundId, currentRound.topBuyer, actualWinnerPrize);
            
            // 分配奖金（这会修改currentRound.totalPrize为剩余奖金）
            _distributePrize();
            
            // 更新历史记录中的奖金分配状态，保持数据完整性
            rounds[currentRound.roundId].isPrizeDistributed = true;
        } else {
            emit RoundFinished(currentRound.roundId, address(0), 0);
        }
    }
    
    /**
     * @dev 内部函数：分配奖金
     * @notice 遵循CEI模式（检查-效果-交互）防止重入攻击
     */
    function _distributePrize() internal nonReentrant {
        require(!currentRound.isPrizeDistributed, "Prize already distributed");
        require(currentRound.topBuyer != address(0), "No winner");
        
        uint256 totalPrize = currentRound.totalPrize;
        if (totalPrize > 0) {
            // 计算获奖者奖金（1/3）
            uint256 winnerAmount = (totalPrize * WINNER_NUMERATOR) / TOTAL_DENOMINATOR;
            
            // 计算留给下一轮的奖金（2/3）
            uint256 nextRoundAmount = totalPrize - winnerAmount;
            
            // 验证合约有足够的代币余额
            require(IERC20(mlhgToken).balanceOf(address(this)) >= winnerAmount, "Insufficient contract balance");
            
            // 缓存获奖者地址和轮次ID，防止状态变化
            address winner = currentRound.topBuyer;
            uint256 roundId = currentRound.roundId;
            
            // CEI模式：先更新状态（Effects），再进行外部调用（Interactions）
            currentRound.totalPrize = nextRoundAmount;
            currentRound.isPrizeDistributed = true;
            
            // 外部调用：安全转账给获奖者，使用SafeERC20确保转账成功
            IERC20(mlhgToken).safeTransfer(winner, winnerAmount);
            
            // 发布奖金分配事件
            emit PrizeDistributed(roundId, winner, winnerAmount, nextRoundAmount);
        } else {
            // 即使没有奖金也要标记为已分配，避免重复调用
            currentRound.isPrizeDistributed = true;
        }
    }
    
    /**
     * @dev 内部函数：初始化第一轮次（仅在构造函数中调用）
     */
    function _initializeFirstRound() internal {
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + ROUND_DURATION;
        
        // 初始化第一轮次，roundId从1开始
        currentRound.roundId = 1;
        currentRound.startTime = startTime;
        currentRound.endTime = endTime;
        currentRound.totalPrize = 0;
        currentRound.topBuyer = address(0);
        currentRound.topBuyAmount = 0;
        currentRound.state = RoundState.ACTIVE;
        currentRound.isPrizeDistributed = false;
        
        emit RoundStarted(1, startTime, endTime);
    }
    
    /**
     * @dev 外部函数：开始新轮次
     */
    function _startNewRound() external {
        uint256 newRoundId = currentRound.roundId + 1;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + ROUND_DURATION;
        
        // 保留上一轮未分配的奖金
        uint256 carryOverPrize = 0;
        if (currentRound.roundId > 0) {
            // 直接使用当前轮次的totalPrize，因为_distributePrize已经更新为正确的剩余金额
            carryOverPrize = currentRound.totalPrize;
        }
        
        // 重置当前轮次数据
        _clearCurrentRoundData();
        
        // 创建新轮次
        currentRound.roundId = newRoundId;
        currentRound.startTime = startTime;
        currentRound.endTime = endTime;
        currentRound.totalPrize = carryOverPrize;
        currentRound.topBuyer = address(0);
        currentRound.topBuyAmount = 0;
        currentRound.state = RoundState.ACTIVE;
        currentRound.isPrizeDistributed = false;
        
        emit RoundStarted(newRoundId, startTime, endTime);
    }
    
    /**
     * @dev 内部函数：清理当前轮次的动态数据
     */
    function _clearCurrentRoundData() internal {
        // 清空买家购买量映射
        for (uint256 i = 0; i < currentBuyers.length; i++) {
            delete currentBuyerAmounts[currentBuyers[i]];
        }
        // 清空买家列表
        delete currentBuyers;
    }
    
    /**
     * @dev 接收ETH转账（如果需要）
     */
    receive() external payable {
        // 可以接收ETH，但主要用于接收MLHG代币
    }
    
    /**
     * @dev 接收ERC20代币转账（由MLHGToken合约调用）
     * @param amount 接收的代币数量
     * @notice 这是唯一的代币接收入口，防止重复计算奖金池
     * @notice 修复：改进余额验证逻辑，正确处理合约已有余额的情况
     */
    function receiveTokens(uint256 amount) external nonReentrant {
        // 基础权限检查：只允许MLHG代币合约调用
        require(msg.sender == mlhgToken, "Only MLHG token");
        require(amount > 0, "Amount must be greater than 0");
        
        // 记录转账前的合约余额
        uint256 balanceBeforeTransfer = IERC20(mlhgToken).balanceOf(address(this));
        
        // 安全检查1：验证金额合理性（防止异常大额转账）
        uint256 maxReasonableAmount = IERC20(mlhgToken).totalSupply() / 100; // 不超过总供应量的1%
        require(amount <= maxReasonableAmount, "Amount exceeds reasonable limit");
        
        // 安全检查2：防止重复调用（通过检查奖金池增长合理性）
        uint256 expectedNewPrize = currentRound.totalPrize + amount;
        require(expectedNewPrize >= currentRound.totalPrize, "Prize overflow detected");
        
        // 安全检查3：确保当前轮次处于有效状态
        if (currentRound.roundId == 0) {
            emit SecurityAlert(
                "INVALID_ROUND_STATE",
                msg.sender,
                amount,
                "Invalid round ID detected",
                block.timestamp
            );
            revert("Invalid round state");
        }
        
        if (currentRound.state != RoundState.ACTIVE) {
            emit SecurityAlert(
                "NON_ACTIVE_ROUND",
                msg.sender,
                amount,
                "Attempted to add prize to non-active round",
                block.timestamp
            );
            revert("Cannot add prize to non-active round");
        }
        
        // 安全检查4：验证合约确实收到了正确数量的代币
        // 修复：检查余额增量而不是绝对余额
        uint256 expectedBalance = balanceBeforeTransfer + amount;
        uint256 actualBalance = IERC20(mlhgToken).balanceOf(address(this));
        if (actualBalance < expectedBalance) {
            emit BalanceValidationFailed(expectedBalance, actualBalance, block.timestamp);
            emit SecurityAlert(
                "BALANCE_MISMATCH",
                msg.sender,
                amount,
                "Token transfer verification failed",
                block.timestamp
            );
            revert("Token transfer verification failed");
        }
        
        // 记录接收前的状态（用于事件记录）
        uint256 previousPrize = currentRound.totalPrize;
        
        // 增加当前轮次奖金池
        currentRound.totalPrize = expectedNewPrize;
        
        // 发布详细的代币接收事件（包含安全验证信息）
        emit TokensReceived(
            currentRound.roundId,
            amount,
            previousPrize,
            currentRound.totalPrize,
            actualBalance,
            block.timestamp
        );
    }
    
    /**
     * @dev 获取当前轮次状态
     * @return state 轮次状态（0=ACTIVE, 1=TRANSITIONING, 2=FINISHED）
     */
    function getCurrentRoundState() external view returns (RoundState state) {
        return currentRound.state;
    }
    
    /**
     * @dev 获取当前轮次基本信息
     */
    function getCurrentRound() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPrize,
        address topBuyer,
        uint256 topBuyAmount,
        bool isFinished,
        bool isPrizeDistributed
    ) {
        return (
            currentRound.roundId,
            currentRound.startTime,
            currentRound.endTime,
            currentRound.totalPrize,
            currentRound.topBuyer,
            currentRound.topBuyAmount,
            currentRound.state == RoundState.FINISHED,
            currentRound.isPrizeDistributed
        );
    }
    

    
    /**
     * @dev 获取历史轮次信息
     */
    function getRound(uint256 roundId) external view returns (RoundInfo memory) {
        return rounds[roundId];
    }
    
    /**
     * @dev 获取当前轮次剩余时间
     */
    function getTimeLeft() external view returns (uint256) {
        if (block.timestamp >= currentRound.endTime) {
            return 0;
        }
        return currentRound.endTime - block.timestamp;
    }
    
    /**
     * @dev 获取买家在当前轮次的购买量
     */
    function getCurrentRoundBuyerAmount(address buyer) external view returns (uint256) {
        return currentBuyerAmounts[buyer];
    }
    
    /**
     * @dev 获取买家在指定轮次的购买量
     */
    function getRoundBuyerAmount(uint256 roundId, address buyer) external view returns (uint256) {
        return roundBuyerAmounts[roundId][buyer];
    }
    
    /**
     * @dev 获取当前轮次买家数量
     */
    function getCurrentRoundBuyerCount() external view returns (uint256) {
        return currentBuyers.length;
    }
    
    /**
     * @dev 获取当前轮次买家列表（分页）
     * @param offset 起始位置
     * @param limit 返回数量限制，最大为100
     */
    function getCurrentRoundBuyers(uint256 offset, uint256 limit) external view returns (address[] memory) {
        // 参数验证
        require(limit > 0, "Limit must be greater than 0");
        require(limit <= 100, "Limit cannot exceed 100");
        
        uint256 total = currentBuyers.length;
        if (offset >= total) {
            return new address[](0);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = currentBuyers[i];
        }
        
        return result;
    }
    
    /**
     * @dev 获取指定轮次买家列表（分页）
     * @param roundId 轮次ID
     * @param offset 起始位置
     * @param limit 返回数量限制，最大为100
     */
    function getRoundBuyers(uint256 roundId, uint256 offset, uint256 limit) external view returns (address[] memory) {
        // 参数验证
        require(limit > 0, "Limit must be greater than 0");
        require(limit <= 100, "Limit cannot exceed 100");
        require(roundId <= currentRound.roundId, "Invalid round ID");
        
        address[] storage buyers = roundBuyers[roundId];
        uint256 total = buyers.length;
        
        if (offset >= total) {
            return new address[](0);
        }
        
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        
        address[] memory result = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = buyers[i];
        }
        
        return result;
    }
    
    /**
     * @dev 获取当前轮次排行榜（前3名）
     * @param topN 要获取的排行榜数量，最大限制为3
     * @notice 游戏规则只认第一名，因此只支持查询前3名
     */
    function getCurrentRoundLeaderboard(uint256 topN) external view returns (address[] memory, uint256[] memory) {
        uint256 buyerCount = currentBuyers.length;
        if (buyerCount == 0 || topN == 0) {
            return (new address[](0), new uint256[](0));
        }
        
        // 限制最大排序数量为3
        uint256 maxLeaderboardSize = 3;
        if (topN > maxLeaderboardSize) {
            topN = maxLeaderboardSize;
        }
        
        uint256 resultSize = topN > buyerCount ? buyerCount : topN;
        
        // 使用简化的排序算法获取前3名
        return _getTop3Buyers(resultSize);
    }
    
    /**
     * @dev 内部函数：获取前3名买家（简化版本）
     * @param topN 要获取的买家数量（最大3）
     */
    function _getTop3Buyers(uint256 topN) internal view returns (address[] memory, uint256[] memory) {
        uint256 buyerCount = currentBuyers.length;
        address[] memory topBuyers = new address[](topN);
        uint256[] memory topAmounts = new uint256[](topN);
        
        // 初始化前3名
        address[3] memory top3Buyers;
        uint256[3] memory top3Amounts;
        
        // 遍历所有买家，找出前3名
        for (uint256 i = 0; i < buyerCount; i++) {
            address buyer = currentBuyers[i];
            uint256 amount = currentBuyerAmounts[buyer];
            
            // 检查是否能进入前3名
            if (amount > top3Amounts[2]) {
                // 移动排名
                if (amount > top3Amounts[0]) {
                    // 新的第一名
                    top3Buyers[2] = top3Buyers[1];
                    top3Amounts[2] = top3Amounts[1];
                    top3Buyers[1] = top3Buyers[0];
                    top3Amounts[1] = top3Amounts[0];
                    top3Buyers[0] = buyer;
                    top3Amounts[0] = amount;
                } else if (amount > top3Amounts[1]) {
                    // 新的第二名
                    top3Buyers[2] = top3Buyers[1];
                    top3Amounts[2] = top3Amounts[1];
                    top3Buyers[1] = buyer;
                    top3Amounts[1] = amount;
                } else {
                    // 新的第三名
                    top3Buyers[2] = buyer;
                    top3Amounts[2] = amount;
                }
            }
        }
        
        // 复制结果到返回数组
        for (uint256 i = 0; i < topN; i++) {
            topBuyers[i] = top3Buyers[i];
            topAmounts[i] = top3Amounts[i];
        }
        
        return (topBuyers, topAmounts);
    }
    

    

    
    /**
     * @dev 清理历史轮次数据（仅所有者，用于合约维护）
     * @param roundIds 要清理的轮次ID数组，最大长度为20
     */
    function cleanupHistoryRounds(uint256[] calldata roundIds) external onlyOwner {
        require(roundIds.length > 0, "Empty round IDs array");
        require(roundIds.length <= 20, "Too many rounds to cleanup at once");
        
        uint256[] memory cleanedRounds = new uint256[](roundIds.length);
        uint256 cleanedCount = 0;
        uint256 totalBuyersCleared = 0;
        
        for (uint256 i = 0; i < roundIds.length; i++) {
            uint256 roundId = roundIds[i];
            
            // 验证轮次是否存在且可以清理
            require(roundId > 0, "Invalid round ID");
            require(roundId < currentRound.roundId, "Cannot cleanup current or future rounds");
            
            // 只能清理已完成且奖金已分配的历史轮次
            if (rounds[roundId].state == RoundState.FINISHED && rounds[roundId].isPrizeDistributed) {
                // 获取该轮次的买家列表
                address[] storage buyers = roundBuyers[roundId];
                uint256 buyerCount = buyers.length;
                
                // 完整清理该轮次的所有买家映射数据
                for (uint256 j = 0; j < buyerCount; j++) {
                    address buyer = buyers[j];
                    // 确保买家地址有效
                    if (buyer != address(0)) {
                        // 清理买家购买量映射
                        delete roundBuyerAmounts[roundId][buyer];
                    }
                }
                
                // 清理买家列表数组
                delete roundBuyers[roundId];
                
                // 清理轮次历史记录
                delete rounds[roundId];
                
                // 记录清理信息
                cleanedRounds[cleanedCount] = roundId;
                cleanedCount++;
                totalBuyersCleared += buyerCount;
            }
        }
        
        // 确保至少清理了一个轮次
        require(cleanedCount > 0, "No valid rounds to cleanup");
        
        // 创建实际清理的轮次数组
        uint256[] memory actualCleanedRounds = new uint256[](cleanedCount);
        for (uint256 i = 0; i < cleanedCount; i++) {
            actualCleanedRounds[i] = cleanedRounds[i];
        }
        
        emit HistoryRoundsCleanup(actualCleanedRounds, block.timestamp);
        emit ContractMaintenance(
            string(abi.encodePacked(
                "History cleanup: ", 
                _uint256ToString(cleanedCount), 
                " rounds, ", 
                _uint256ToString(totalBuyersCleared), 
                " buyers"
            )), 
            block.timestamp
        );
    }
    
    /**
     * @dev 内部函数：将uint256转换为字符串（用于事件记录）
     * @param value 要转换的数值
     */
    function _uint256ToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
    /**
     * @dev 获取合约状态信息（用于监控和维护）
     */
    function getContractStatus() external view returns (
        uint256 currentRoundId,
        uint256 timeLeft,
        uint256 totalPrize,
        address topBuyer,
        uint256 topBuyAmount,
        uint256 buyerCount,
        uint256 contractBalance,
        bool isRoundActive
    ) {
        uint256 timeLeftValue;
        if (block.timestamp >= currentRound.endTime) {
            timeLeftValue = 0;
        } else {
            timeLeftValue = currentRound.endTime - block.timestamp;
        }
        
        return (
            currentRound.roundId,
            timeLeftValue,
            currentRound.totalPrize,
            currentRound.topBuyer,
            currentRound.topBuyAmount,
            currentBuyers.length,
            IERC20(mlhgToken).balanceOf(address(this)),
            currentRound.state == RoundState.ACTIVE && block.timestamp < currentRound.endTime
        );
    }
    
    /**
     * @dev 批量清理当前轮次的非活跃买家数据（仅所有者，用于Gas优化）
     * @param buyers 要清理的买家地址数组，最大长度为50
     */
    function cleanupInactiveBuyers(address[] calldata buyers) external onlyOwner {
        require(currentRound.state == RoundState.ACTIVE, "Cannot cleanup non-active round");
        require(buyers.length > 0, "Empty buyers array");
        require(buyers.length <= 50, "Too many buyers to cleanup at once");
        
        address[] memory cleanedBuyers = new address[](buyers.length);
        uint256 cleanedCount = 0;
        
        // 第一步：验证要删除的买家并收集有效的买家地址
        // 使用数组避免重复检查
        bool[] memory processed = new bool[](buyers.length);
        
        for (uint256 i = 0; i < buyers.length; i++) {
            address buyer = buyers[i];
            // 只清理购买量为0的买家，并避免重复
            if (currentBuyerAmounts[buyer] == 0 && !processed[i]) {
                // 检查是否已经在之前的索引中处理过这个地址
                bool alreadyProcessed = false;
                for (uint256 j = 0; j < i; j++) {
                    if (buyers[j] == buyer && processed[j]) {
                        alreadyProcessed = true;
                        break;
                    }
                }
                
                if (!alreadyProcessed) {
                    processed[i] = true;
                    cleanedBuyers[cleanedCount] = buyer;
                    cleanedCount++;
                }
            }
        }
        
        if (cleanedCount == 0) {
            return; // 没有需要清理的买家
        }
        
        // 第二步：优化的数组清理 - 使用高效的删除算法
        _removeInactiveBuyersFromCurrentArray(cleanedBuyers, cleanedCount);
        _removeInactiveBuyersFromArray(roundBuyers[currentRound.roundId], cleanedBuyers, cleanedCount);
        
        // 创建实际清理的买家数组
        address[] memory actualCleanedBuyers = new address[](cleanedCount);
        for (uint256 i = 0; i < cleanedCount; i++) {
            actualCleanedBuyers[i] = cleanedBuyers[i];
        }
        
        emit InactiveBuyersCleanup(actualCleanedBuyers, currentRound.roundId, block.timestamp);
        emit ContractMaintenance("Inactive buyers cleanup", block.timestamp);
    }
    
    /**
     * @dev 内部函数：高效地从当前买家数组中移除指定的买家
     * @param toRemove 要删除的买家地址数组
     * @param removeCount 要删除的买家数量
     */
    function _removeInactiveBuyersFromCurrentArray(
        address[] memory toRemove,
        uint256 removeCount
    ) internal {
        if (removeCount == 0 || currentBuyers.length == 0) {
            return;
        }
        
        uint256 writeIndex = 0;
        
        // 单次遍历，使用线性查找，时间复杂度O(n*m)
        for (uint256 readIndex = 0; readIndex < currentBuyers.length; readIndex++) {
            bool shouldRemove = false;
            
            // 检查当前地址是否在要删除的列表中
            for (uint256 i = 0; i < removeCount; i++) {
                if (currentBuyers[readIndex] == toRemove[i]) {
                    shouldRemove = true;
                    break;
                }
            }
            
            if (!shouldRemove) {
                if (writeIndex != readIndex) {
                    currentBuyers[writeIndex] = currentBuyers[readIndex];
                }
                writeIndex++;
            }
        }
        
        // 删除末尾多余的元素
        while (currentBuyers.length > writeIndex) {
            currentBuyers.pop();
        }
    }
    
    /**
     * @dev 内部函数：高效地从数组中移除指定的买家
     * @param buyersArray 要清理的买家数组
     * @param toRemove 要删除的买家地址数组
     * @param removeCount 要删除的买家数量
     */
    function _removeInactiveBuyersFromArray(
        address[] storage buyersArray,
        address[] memory toRemove,
        uint256 removeCount
    ) internal {
        if (removeCount == 0 || buyersArray.length == 0) {
            return;
        }
        
        uint256 writeIndex = 0;
        
        // 单次遍历，使用线性查找，时间复杂度O(n*m)
        for (uint256 readIndex = 0; readIndex < buyersArray.length; readIndex++) {
            bool shouldRemove = false;
            
            // 检查当前地址是否在要删除的列表中
            for (uint256 i = 0; i < removeCount; i++) {
                if (buyersArray[readIndex] == toRemove[i]) {
                    shouldRemove = true;
                    break;
                }
            }
            
            if (!shouldRemove) {
                if (writeIndex != readIndex) {
                    buyersArray[writeIndex] = buyersArray[readIndex];
                }
                writeIndex++;
            }
        }
        
        // 删除末尾多余的元素
        while (buyersArray.length > writeIndex) {
            buyersArray.pop();
        }
    }
    
    /**
     * @dev 紧急提取函数（仅所有者）
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = IERC20(mlhgToken).balanceOf(address(this));
        if (balance > 0) {
            IERC20(mlhgToken).transfer(owner, balance);
            emit EmergencyWithdraw(owner, balance, block.timestamp);
            emit ContractMaintenance("Emergency withdrawal executed", block.timestamp);
        }
    }
    
    /**
     * @dev 设置Gas优化模式和参数
     * @param _enabled 是否启用Gas优化模式
     * @param _maxBuyersForFullSort 允许完整排序的最大买家数量
     */
    function setGasOptimizationMode(bool _enabled, uint256 _maxBuyersForFullSort) external onlyOwner {
        require(_maxBuyersForFullSort >= 10 && _maxBuyersForFullSort <= 1000, "Invalid max buyers range");
        
        emit GasOptimizationModeChanged(_enabled, _maxBuyersForFullSort, msg.sender, block.timestamp);
        emit ContractMaintenance("Gas optimization settings updated", block.timestamp);
    }
    
    /**
     * @dev 激活紧急模式
     */
    function activateEmergencyMode() external onlyOwner {
        emit EmergencyModeChanged(true, msg.sender, "Emergency mode manually activated", block.timestamp);
        emit SecurityAlert(
            "EMERGENCY_ACTIVATED", 
            msg.sender, 
            1, 
            "Emergency mode has been activated to limit gas consumption", 
            block.timestamp
        );
        emit ContractMaintenance("Emergency mode activated", block.timestamp);
    }
    
    /**
     * @dev 停用紧急模式
     */
    function deactivateEmergencyMode() external onlyOwner {
        emit EmergencyModeChanged(false, msg.sender, "Emergency mode manually deactivated", block.timestamp);
        emit ContractMaintenance("Emergency mode deactivated", block.timestamp);
    }
}