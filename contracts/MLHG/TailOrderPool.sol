// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TailOrderPool
 * @dev 尾单奖金池合约
 * 监听MLHGToken合约的买单事件，实现60分钟倒计时奖金池机制
 */
contract TailOrderPool is ReentrancyGuard {
    using SafeERC20 for IERC20;
    // MLHGToken合约地址
    address public immutable mlhgToken;
    
    // 合约所有者
    address public immutable owner;
    
    // 轮次结束锁，防止竞态条件
    bool private _roundEndingInProgress;
    
    // 当前轮次信息
    struct Round {
        uint256 roundId;           // 轮次ID
        uint256 startTime;         // 轮次开始时间
        uint256 endTime;           // 轮次结束时间
        uint256 totalPrize;        // 总奖金
        address lastBuyer;         // 最后一个买家
        uint256 lastBuyAmount;     // 最后一笔买单金额
        uint256 lastBuyTime;       // 最后一笔买单时间
        bool isFinished;           // 轮次是否结束
        bool isPrizeDistributed;   // 奖金是否已分配
    }
    
    // 当前轮次
    Round public currentRound;
    
    // 轮次历史记录
    mapping(uint256 => Round) public rounds;
    
    // 轮次持续时间（60分钟）
    uint256 public constant ROUND_DURATION = 60 minutes;
    
    // 刷新倒计时的阈值（3分钟）
    uint256 public constant REFRESH_THRESHOLD = 3 minutes;
    
    // 最小买单金额（10 MLH，假设18位小数）
    uint256 public constant MIN_BUY_AMOUNT = 10 ether;
    
    // 奖金分配比例（1/3给获奖者，2/3留给下一轮）
    // 使用精确的分数计算避免精度损失
    uint256 public constant WINNER_NUMERATOR = 1;   // 获奖者分子
    uint256 public constant TOTAL_DENOMINATOR = 3;  // 总分母
    
    // 事件定义
    event ContractDeployed(address indexed mlhgToken, address indexed owner, uint256 timestamp);
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 endTime);
    event BuyOrderProcessed(uint256 indexed roundId, address indexed buyer, uint256 amount, bool isQualified);
    event CountdownRefreshed(uint256 indexed roundId, uint256 originalEndTime, uint256 newEndTime);
    event PrizePoolIncreased(uint256 indexed roundId, uint256 amount, uint256 newTotalPrize, string source);
    event RoundFinished(uint256 indexed roundId, address indexed winner, uint256 prizeAmount);
    event PrizeDistributed(uint256 indexed roundId, address indexed winner, uint256 winnerAmount, uint256 nextRoundAmount);
    event EmergencyWithdraw(address indexed owner, uint256 amount, uint256 timestamp);
    event HistoryRoundsCleanup(uint256[] roundIds, uint256 timestamp);
    event ContractMaintenance(string action, uint256 timestamp);
    
    // 新增事件：错误处理和安全
    event BuyOrderRejected(address indexed buyer, uint256 indexed amount, uint256 indexed roundId, string reason, uint256 timestamp);
    event RoundTransitionFailed(uint256 indexed roundId, string reason, uint256 timestamp);
    event SecurityAlert(string indexed alertType, address indexed account, uint256 indexed value, string details, uint256 timestamp);
    event BalanceValidationFailed(uint256 expectedBalance, uint256 actualBalance, uint256 timestamp);
    event RoundStateError(uint256 indexed roundId, string expectedState, string actualState, uint256 timestamp);
    
    /**
     * @dev 构造函数
     * @param _mlhgToken MLHGToken合约地址
     */
    constructor(address _mlhgToken) {
        mlhgToken = _mlhgToken;
        owner = msg.sender;
        
        // 发出合约部署事件
        emit ContractDeployed(_mlhgToken, msg.sender, block.timestamp);
        
        // 启动第一轮
        _startNewRound();
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
     * @dev 轮次结束互斥锁修饰符
     */
    modifier whenNotEndingRound() {
        require(!_roundEndingInProgress, "Round ending in progress");
        _;
    }
    
    /**
     * @dev 处理买单事件（由MLHGToken合约调用）
     * @param buyer 买家地址
     * @param amount 买单金额
     * @notice 修复：通过原子性检查和状态更新避免竞态条件
     */
    function processBuyOrder(address buyer, uint256 amount) external onlyMLHGToken whenNotEndingRound {
        // 输入验证
        if (buyer == address(0)) {
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Invalid buyer address", block.timestamp);
            revert("Invalid buyer");
        }
        
        if (amount == 0) {
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Invalid amount", block.timestamp);
            revert("Invalid amount");
        }
        
        // 原子性检查和处理轮次结束
        _handleRoundExpiration();
        
        // 验证轮次状态
        if (currentRound.isFinished) {
            emit RoundStateError(currentRound.roundId, "ACTIVE", "FINISHED", block.timestamp);
            emit BuyOrderRejected(buyer, amount, currentRound.roundId, "Round already finished", block.timestamp);
            revert("Round already finished");
        }
        
        // 检查买单金额是否符合要求
        bool isQualified = amount >= MIN_BUY_AMOUNT;
        
        // 发布买单处理事件
        emit BuyOrderProcessed(currentRound.roundId, buyer, amount, isQualified);
        
        // 如果买单符合要求
        if (isQualified) {
            // 更新最后买家信息（统一使用block.timestamp确保时间一致性）
            currentRound.lastBuyer = buyer;
            currentRound.lastBuyAmount = amount;
            currentRound.lastBuyTime = block.timestamp;  // 使用block.timestamp而非传入的timestamp
            
            // 检查是否需要刷新倒计时（安全的时间计算，避免下溢）
            if (block.timestamp < currentRound.endTime) {
                uint256 timeLeft = currentRound.endTime - block.timestamp;
                if (timeLeft <= REFRESH_THRESHOLD) {
                    // 记录原始结束时间
                    uint256 originalEndTime = currentRound.endTime;
                    // 刷新倒计时为3分钟
                    currentRound.endTime = block.timestamp + REFRESH_THRESHOLD;
                    emit CountdownRefreshed(currentRound.roundId, originalEndTime, currentRound.endTime);
                }
            }
        }
        
        // 记录大额交易安全警报
        if (amount > 1000000 * 10**18) {
            emit SecurityAlert(
                "LARGE_BUY_ORDER",
                buyer,
                amount,
                "Large buy order detected in tail order pool",
                block.timestamp
            );
        }
    }
    
    /**
     * @dev 手动结束当前轮次（任何人都可以调用）
     * @notice 修复：通过原子性检查避免竞态条件
     */
    function finishRound() external whenNotEndingRound {
        // 原子性检查和处理轮次结束
        _handleRoundExpiration();
    }
    
    /**
     * @dev 内部函数：原子性处理轮次过期
     * @notice 修复竞态条件：确保轮次结束的检查和操作是原子的
     */
    function _handleRoundExpiration() internal {
        // 使用原子性的检查和状态更新
        if (!_roundEndingInProgress && _isRoundExpired() && !currentRound.isFinished) {
            // 立即设置锁，防止其他交易进入
            _roundEndingInProgress = true;
            
            // 双重检查：确保在获得锁后轮次仍然需要结束
            if (_isRoundExpired() && !currentRound.isFinished) {
                try this._finishCurrentRoundExternal() {
                    try this._startNewRoundExternal() {
                        // 轮次切换成功
                    } catch {
                        emit RoundTransitionFailed(currentRound.roundId, "Failed to start new round", block.timestamp);
                        revert("Failed to start new round");
                    }
                } catch {
                    emit RoundTransitionFailed(currentRound.roundId, "Failed to finish current round", block.timestamp);
                    revert("Failed to finish current round");
                }
            }
            
            // 释放锁
            _roundEndingInProgress = false;
        }
    }
    
    /**
     * @dev 内部函数：结束当前轮次
     */
    function _finishCurrentRound() internal {
        currentRound.isFinished = true;
        
        // 如果有符合条件的获奖者
        if (currentRound.lastBuyer != address(0) && currentRound.lastBuyAmount >= MIN_BUY_AMOUNT) {
            // 计算实际分配给获奖者的奖金金额（1/3）
            uint256 actualWinnerPrize = (currentRound.totalPrize * WINNER_NUMERATOR) / TOTAL_DENOMINATOR;
            emit RoundFinished(currentRound.roundId, currentRound.lastBuyer, actualWinnerPrize);
            
            // 保存原始奖金数据到历史记录（在分配奖金前保存，确保历史数据完整性）
            rounds[currentRound.roundId] = currentRound;
            
            // 分配奖金（这会修改currentRound.totalPrize为剩余奖金）
            _distributePrize();
        } else {
            emit RoundFinished(currentRound.roundId, address(0), 0);
            // 保存历史记录（无获奖者情况）
            rounds[currentRound.roundId] = currentRound;
        }
    }
    
    /**
     * @dev 内部函数：分配奖金
     */
    function _distributePrize() internal nonReentrant {
        require(!currentRound.isPrizeDistributed, "Prize already distributed");
        require(currentRound.lastBuyer != address(0), "No winner");
        
        uint256 totalPrize = currentRound.totalPrize;
        if (totalPrize > 0) {
            // 计算获奖者奖金（1/3），使用精确分数避免精度损失
            uint256 winnerAmount = (totalPrize * WINNER_NUMERATOR) / TOTAL_DENOMINATOR;
            
            // 计算留给下一轮的奖金，使用减法确保没有代币丢失
            uint256 nextRoundAmount = totalPrize - winnerAmount;
            
            // 验证合约余额
             uint256 contractBalance = IERC20(mlhgToken).balanceOf(address(this));
             if (contractBalance < winnerAmount) {
                emit BalanceValidationFailed(
                    winnerAmount,
                    contractBalance,
                    block.timestamp
                );
                emit SecurityAlert(
                    "INSUFFICIENT_BALANCE",
                    address(this),
                    winnerAmount,
                    "Contract balance insufficient for prize distribution",
                    block.timestamp
                );
                revert("Insufficient balance for prize distribution");
            }
            
            // 安全转账给获奖者，使用SafeERC20确保转账成功
            IERC20(mlhgToken).safeTransfer(currentRound.lastBuyer, winnerAmount);
            
            // 发布奖金分配事件
            emit PrizeDistributed(currentRound.roundId, currentRound.lastBuyer, winnerAmount, nextRoundAmount);
            
            // 记录大额奖金分配安全警报
            if (winnerAmount > 1000000 * 10**18) {
                emit SecurityAlert(
                    "LARGE_PRIZE_DISTRIBUTION",
                    currentRound.lastBuyer,
                    winnerAmount,
                    "Large prize distribution detected",
                    block.timestamp
                );
            }
            
            // 标记奖金已分配
            currentRound.isPrizeDistributed = true;
            
            // 更新历史记录中的奖金分配状态，保持数据完整性
            rounds[currentRound.roundId].isPrizeDistributed = true;
            
            // 保存下一轮的初始奖金到当前轮次数据中
            currentRound.totalPrize = nextRoundAmount;
        }
    }
    
    /**
     * @dev 内部函数：开始新轮次
     */
    function _startNewRound() internal {
        // 验证轮次状态
        if (!currentRound.isFinished && currentRound.roundId > 0) {
            emit RoundStateError(currentRound.roundId, "FINISHED", "ACTIVE", block.timestamp);
            revert("Cannot start new round: current round not finished");
        }
        
        uint256 newRoundId = currentRound.roundId + 1;
        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + ROUND_DURATION;
        
        // 保留上一轮的奖金
        uint256 carryOverPrize = 0;
        if (currentRound.roundId > 0) {
            if (currentRound.isPrizeDistributed) {
                // 如果奖金已分配，继承剩余的奖金（已在_distributePrize中更新）
                carryOverPrize = currentRound.totalPrize;
            } else {
                // 如果奖金未分配，全部奖金继承到下一轮
                carryOverPrize = currentRound.totalPrize;
            }
        }
        
        // 完全重置当前轮次数据，确保数据清洁
        // 清理上一轮的所有玩家数据
        currentRound.roundId = newRoundId;
        currentRound.startTime = startTime;
        currentRound.endTime = endTime;
        currentRound.totalPrize = carryOverPrize;
        currentRound.lastBuyer = address(0);  // 清除上一轮最后买家
        currentRound.lastBuyAmount = 0;       // 清除上一轮最后买单金额
        currentRound.lastBuyTime = 0;         // 清除上一轮最后买单时间
        currentRound.isFinished = false;      // 重置轮次状态
        currentRound.isPrizeDistributed = false; // 重置奖金分配状态
        
        emit RoundStarted(newRoundId, startTime, endTime);
        
        // 如果有奖金继承，记录奖金池增加事件
        if (carryOverPrize > 0) {
            emit PrizePoolIncreased(newRoundId, carryOverPrize, carryOverPrize, "Prize carryover");
        }
        
        // 发布合约维护事件
        emit ContractMaintenance("New round started", block.timestamp);
    }
    
    
    /**
     * @dev 接收ETH转账（如果需要）
     */
    receive() external payable {
        // 可以接收ETH转账，但本合约主要处理MLHG代币
    }
    
    /**
     * @dev 接收ERC20代币转账（由MLHGToken合约调用）
     * @param amount 接收的代币数量
     * @notice 这是唯一的代币接收入口，防止重复计算奖金池
     */
    function receiveTokens(uint256 amount) external onlyMLHGToken {
        if (amount == 0) {
            emit SecurityAlert(
                "ZERO_AMOUNT_TRANSFER",
                msg.sender,
                0,
                "Attempted to receive zero amount tokens",
                block.timestamp
            );
            revert("Amount must be greater than 0");
        }
        
        // 检查溢出
        uint256 oldPrize = currentRound.totalPrize;
        uint256 newPrize = oldPrize + amount;
        if (newPrize < oldPrize) {
            emit SecurityAlert(
                "PRIZE_OVERFLOW",
                msg.sender,
                amount,
                "Prize pool overflow detected",
                block.timestamp
            );
            revert("Prize overflow detected");
        }
        
        // 验证金额合理性
        uint256 maxReasonableAmount = IERC20(mlhgToken).totalSupply() / 100; // 不超过总供应量的1%
        if (amount > maxReasonableAmount) {
            emit SecurityAlert(
                "EXCESSIVE_TRANSFER",
                msg.sender,
                amount,
                "Transfer amount exceeds reasonable limit",
                block.timestamp
            );
            revert("Amount exceeds reasonable limit");
        }
        
        // 增加当前轮次奖金池
        currentRound.totalPrize = newPrize;
        
        // 发布详细的奖金池增加事件
        emit PrizePoolIncreased(currentRound.roundId, amount, currentRound.totalPrize, "Token transfer");
        
        // 发布代币接收事件（用于监控）
        emit ContractMaintenance("Tokens received", block.timestamp);
    }
    
    /**
     * @dev 获取当前轮次信息
     */
    function getCurrentRound() external view returns (Round memory) {
        return currentRound;
    }
    
    /**
     * @dev 获取当前轮次基本信息（与BuyKingPool接口统一）
     */
    function getCurrentRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPrize,
        address lastBuyer,
        uint256 lastBuyAmount,
        bool isFinished,
        bool isPrizeDistributed
    ) {
        return (
            currentRound.roundId,
            currentRound.startTime,
            currentRound.endTime,
            currentRound.totalPrize,
            currentRound.lastBuyer,
            currentRound.lastBuyAmount,
            currentRound.isFinished,
            currentRound.isPrizeDistributed
        );
    }
    
    /**
     * @dev 获取历史轮次信息
     */
    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }
    
    /**
     * @dev 内部函数：检查轮次是否已结束
     */
    function _isRoundExpired() internal view returns (bool) {
        return block.timestamp >= currentRound.endTime;
    }
    
    /**
     * @dev 内部函数：获取剩余时间
     */
    function _getTimeLeft() internal view returns (uint256) {
        if (_isRoundExpired()) {
            return 0;
        }
        return currentRound.endTime - block.timestamp;
    }
    
    /**
     * @dev 获取当前轮次剩余时间
     */
    function getTimeLeft() external view returns (uint256) {
        return _getTimeLeft();
    }
    
    /**
     * @dev 获取当前轮次买家数量（与BuyKingPool接口统一）
     * @notice 尾单池只有一个最后买家，所以返回1或0
     */
    function getCurrentRoundBuyerCount() external view returns (uint256) {
        return currentRound.lastBuyer != address(0) ? 1 : 0;
    }
    
    /**
     * @dev 获取当前轮次买家列表（与BuyKingPool接口统一）
     * @param offset 起始位置
     * @param limit 返回数量限制
     * @notice 尾单池只有一个最后买家
     */
    function getCurrentRoundBuyers(uint256 offset, uint256 limit) external view returns (address[] memory) {
        if (offset > 0 || limit == 0 || currentRound.lastBuyer == address(0)) {
            return new address[](0);
        }
        
        address[] memory buyers = new address[](1);
        buyers[0] = currentRound.lastBuyer;
        return buyers;
    }
    
    /**
     * @dev 获取买家在当前轮次的购买量（与BuyKingPool接口统一）
     * @param buyer 买家地址
     */
    function getCurrentRoundBuyerAmount(address buyer) external view returns (uint256) {
        if (buyer == currentRound.lastBuyer) {
            return currentRound.lastBuyAmount;
        }
        return 0;
    }
    
    /**
     * @dev 获取买家在指定轮次的购买量（与BuyKingPool接口统一）
     * @param roundId 轮次ID
     * @param buyer 买家地址
     */
    function getRoundBuyerAmount(uint256 roundId, address buyer) external view returns (uint256) {
        Round memory round = rounds[roundId];
        if (buyer == round.lastBuyer) {
            return round.lastBuyAmount;
        }
        return 0;
    }
    
    /**
     * @dev 获取指定轮次买家列表（与BuyKingPool接口统一）
     * @param roundId 轮次ID
     * @param offset 起始位置
     * @param limit 返回数量限制
     */
    function getRoundBuyers(uint256 roundId, uint256 offset, uint256 limit) external view returns (address[] memory) {
        if (offset > 0 || limit == 0) {
            return new address[](0);
        }
        
        Round memory round = rounds[roundId];
        if (round.lastBuyer == address(0)) {
            return new address[](0);
        }
        
        address[] memory buyers = new address[](1);
        buyers[0] = round.lastBuyer;
        return buyers;
    }
    
    /**
     * @dev 获取当前轮次排行榜（与BuyKingPool接口统一）
     * @param topN 要获取的排行榜数量
     * @notice 尾单池只有一个最后买家
     */
    function getCurrentRoundLeaderboard(uint256 topN) external view returns (address[] memory, uint256[] memory) {
        if (topN == 0 || currentRound.lastBuyer == address(0)) {
            return (new address[](0), new uint256[](0));
        }
        
        address[] memory buyers = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        buyers[0] = currentRound.lastBuyer;
        amounts[0] = currentRound.lastBuyAmount;
        
        return (buyers, amounts);
    }
    
    /**
     * @dev 清理历史轮次数据（仅所有者，用于合约维护）
     * @param roundIds 要清理的轮次ID数组
     */
    function cleanupHistoryRounds(uint256[] calldata roundIds) external onlyOwner {
        // 第一次遍历：计算可清理的轮次数量
        uint256 cleanableCount = 0;
        for (uint256 i = 0; i < roundIds.length; i++) {
            uint256 roundId = roundIds[i];
            if (rounds[roundId].isFinished && rounds[roundId].isPrizeDistributed && roundId < currentRound.roundId) {
                cleanableCount++;
            }
        }
        
        // 创建正确大小的数组
        uint256[] memory cleanedRounds = new uint256[](cleanableCount);
        uint256 cleanedIndex = 0;
        
        // 第二次遍历：执行清理并记录
        for (uint256 i = 0; i < roundIds.length; i++) {
            uint256 roundId = roundIds[i];
            if (rounds[roundId].isFinished && rounds[roundId].isPrizeDistributed && roundId < currentRound.roundId) {
                delete rounds[roundId];
                cleanedRounds[cleanedIndex] = roundId;
                cleanedIndex++;
            }
        }
        
        emit HistoryRoundsCleanup(cleanedRounds, block.timestamp);
        emit ContractMaintenance("History rounds cleanup", block.timestamp);
    }
    
    /**
     * @dev 获取合约状态信息（用于监控和维护）
     */
    function getContractStatus() external view returns (
        uint256 currentRoundId,
        uint256 timeLeft,
        uint256 totalPrize,
        address lastBuyer,
        uint256 contractBalance,
        bool isRoundActive
    ) {
        uint256 timeLeftValue = _getTimeLeft();
        bool isActive = !currentRound.isFinished && !_isRoundExpired();
        
        return (
            currentRound.roundId,
            timeLeftValue,
            currentRound.totalPrize,
            currentRound.lastBuyer,
            IERC20(mlhgToken).balanceOf(address(this)),
            isActive
        );
    }
    
    /**
     * @dev 紧急提取函数（仅所有者）
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = IERC20(mlhgToken).balanceOf(address(this));
        if (balance > 0) {
            // 记录紧急提取安全警报
            emit SecurityAlert(
                "EMERGENCY_WITHDRAW",
                msg.sender,
                balance,
                "Emergency withdrawal executed by owner",
                block.timestamp
            );
            
            // 使用SafeERC20确保转账成功
            IERC20(mlhgToken).safeTransfer(owner, balance);
            emit EmergencyWithdraw(owner, balance, block.timestamp);
            emit ContractMaintenance("Emergency withdrawal completed", block.timestamp);
        } else {
            emit ContractMaintenance("Emergency withdrawal attempted with zero balance", block.timestamp);
        }
    }

    /**
     * @dev External包装函数：结束当前轮次（用于try-catch调用）
     */
    function _finishCurrentRoundExternal() external {
        _finishCurrentRound();
    }

    /**
     * @dev External包装函数：开始新轮次（用于try-catch调用）
     */
    function _startNewRoundExternal() external {
        _startNewRound();
    }
}