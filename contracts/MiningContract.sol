// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// 导入OpenZeppelin合约库
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";


/**
 * @title MiningContract
 * @notice 专门负责处理游戏未中奖玩家MLHG积分挖矿奖励发放的独立合约
 * @dev 与BettingContract分离，确保资金安全和职责分离，针对Sonic测试网优化gas费用
 *      实现动态减产机制：初始比例1:100，每天减产1%
 */
contract MiningContract is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // 自定义错误 - Gas优化：使用自定义错误减少gas消耗
    error InvalidAddress();
    error InvalidAmount();
    error MiningNotFound();
    error MiningAlreadyExecuted();
    error InsufficientBalance();
    error InvalidMiningData();
    error MiningNotPending();
    error UnauthorizedCaller();

    // 角色定义
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // 支持的代币地址
    address public constant NATIVE_TOKEN = address(0); // 原生代币S
    address public immutable MLH_TOKEN; // MLH代币地址
    address public immutable MLHG_TOKEN; // MLHG代币地址（挖矿奖励代币）

    // 挖矿状态枚举
    enum MiningStatus {
        Pending,    // 等待执行
        Completed,  // 已完成
        Failed,     // 执行失败
        Cancelled   // 已取消
    }

    // 挖矿信息结构体 - 存储优化：合理打包字段减少存储槽使用
    struct MiningInfo {
        uint256 requestId;        // VRF请求ID (slot 0)
        address player;           // 未中奖玩家地址 (slot 1: 20 bytes)
        uint96 miningAmount;      // 挖矿奖励金额 (slot 1: 12 bytes) - 优化：使用uint96
        address betTokenAddress;  // 投注代币类型 (slot 2: 20 bytes)
        uint96 betAmount;         // 原始投注金额 (slot 2: 12 bytes) - 优化：使用uint96
        uint64 createdAt;         // 投注创建时间 (slot 3: 8 bytes) - 优化：uint64
        uint64 settledAt;         // 结算时间 (slot 3: 8 bytes)
        uint64 minedAt;           // 挖矿时间 (slot 3: 8 bytes)
        MiningStatus status;      // 挖矿状态 (slot 3: 1 byte)
        bool playerChoice;        // 玩家选择（单/双） (slot 3: 1 byte)
        bool diceResult;          // 骰子结果（单/双） (slot 3: 1 byte)
        bool isWinner;            // 游戏判定结果（是否中奖） (slot 3: 1 byte)
        // 总共使用4个存储槽
    }

    // 常量定义 - 循环缓冲区配置
    uint256 public constant MAX_MINING_HISTORY = 200; // 最大挖矿历史记录数
    uint256 public constant CLEANUP_THRESHOLD = 7 days; // 清理阈值：7天
    
    // 挖矿比例相关常量
    uint256 public constant INITIAL_MINING_RATIO = 100; // 初始挖矿比例 1:100
    uint256 public constant DAILY_REDUCTION_RATE = 1; // 每日减产率 1%
    uint256 public constant SECONDS_PER_DAY = 86400; // 每天秒数
    uint256 public immutable CONTRACT_START_TIME; // 合约启动时间

    // 循环缓冲区结构体
    struct CircularBuffer {
        uint256[MAX_MINING_HISTORY] requestIds; // 固定大小的请求ID数组
        uint256 head;                          // 头指针（下一个写入位置）
        uint256 tail;                          // 尾指针（最旧记录位置）
        uint256 count;                         // 当前记录数量
    }

    // 存储映射
    mapping(uint256 => MiningInfo) public minings; // requestId => MiningInfo
    CircularBuffer private miningHistory; // 挖矿历史循环缓冲区

    // 统计数据
    uint256 public totalMinings;
    uint256 public totalCompletedMinings;
    uint256 public totalFailedMinings;
    uint256 public totalMiningAmount;

    // 事件定义
    /**
     * @notice 挖矿请求提交事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param betTokenAddress 投注代币地址
     * @param miningAmount 挖矿奖励金额
     * @param betAmount 投注金额
     * @param createdAt 创建时间
     * @param currentRatio 当前挖矿比例
     */
    event MiningRequestSubmitted(
        uint256 indexed requestId,
        address indexed player,
        address betTokenAddress,
        uint256 miningAmount,
        uint256 betAmount,
        uint256 createdAt,
        uint256 currentRatio
    );

    /**
     * @notice 挖矿完成事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param miningAmount 挖矿奖励金额
     * @param minedAt 挖矿时间
     */
    event MiningCompleted(
        uint256 indexed requestId,
        address indexed player,
        uint256 miningAmount,
        uint256 minedAt
    );

    /**
     * @notice 挖矿失败事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param reason 失败原因
     */
    event MiningFailed(
        uint256 indexed requestId,
        address indexed player,
        string reason
    );

    /**
     * @notice 资金充值事件
     * @param token 代币地址
     * @param amount 充值金额
     * @param from 充值地址
     */
    event FundsDeposited(
        address indexed token,
        uint256 amount,
        address indexed from
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
     * @notice 挖矿记录清理事件
     * @param requestId 请求ID
     * @param player 玩家地址
     */
    event MiningCleaned(
        uint256 indexed requestId,
        address indexed player
    );

    /**
     * @notice 挖矿比例更新事件
     * @param oldRatio 旧比例
     * @param newRatio 新比例
     * @param daysPassed 经过天数
     */
    event MiningRatioUpdated(
        uint256 oldRatio,
        uint256 newRatio,
        uint256 daysPassed
    );

    /**
     * @notice 构造函数
     * @param _mlhToken MLH代币地址
     * @param _mlhgToken MLHG代币地址
     * @param _admin 管理员地址
     */
    constructor(
        address _mlhToken,
        address _mlhgToken,
        address _admin
    ) {
        if (_mlhToken == address(0) || _mlhgToken == address(0) || _admin == address(0)) {
            revert InvalidAddress();
        }
        
        MLH_TOKEN = _mlhToken;
        MLHG_TOKEN = _mlhgToken;
        CONTRACT_START_TIME = block.timestamp;
        
        // 设置角色
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
    }

    /**
     * @notice 接收原生代币的回退函数
     * @dev 允许合约接收原生代币转账，但只有管理员可以提取
     */
    receive() external payable {
        // 发出充值事件，记录接收到的原生代币
        emit FundsDeposited(NATIVE_TOKEN, msg.value, msg.sender);
    }

    /**
     * @notice 提交挖矿请求
     * @param requestId VRF请求ID
     * @param player 未中奖玩家地址
     * @param betTokenAddress 投注代币类型
     * @param betAmount 原始投注金额
     * @param createdAt 投注创建时间
     * @param settledAt 结算时间
     * @param playerChoice 玩家选择（单/双）
     * @param diceResult 骰子结果（单/双）
     * @param isWinner 游戏判定结果（是否中奖）
     */
    function submitMiningRequest(
        uint256 requestId,
        address player,
        address betTokenAddress,
        uint256 betAmount,
        uint256 createdAt,
        uint256 settledAt,
        bool playerChoice,
        bool diceResult,
        bool isWinner
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        // 验证输入参数
        if (player == address(0)) {
            revert InvalidAddress();
        }
        if (betAmount == 0) {
            revert InvalidAmount();
        }
        if (isWinner) {
            revert InvalidMiningData(); // 只有未中奖玩家才能挖矿
        }
        
        // 验证投注代币地址
        if (betTokenAddress != NATIVE_TOKEN && 
            betTokenAddress != MLH_TOKEN && 
            betTokenAddress != MLHG_TOKEN) {
            revert InvalidAddress();
        }
        
        // 检查是否已存在挖矿请求
        if (minings[requestId].player != address(0)) {
            revert MiningAlreadyExecuted();
        }
        
        // 计算当前挖矿奖励金额
        uint256 currentRatio = getCurrentMiningRatio();
        uint256 miningAmount = (betAmount * currentRatio) / 100; // betAmount * currentRatio / 100 (1:100比例)
        
        // 验证金额范围
        if (miningAmount > type(uint96).max || betAmount > type(uint96).max) {
            revert InvalidAmount();
        }
        if (createdAt > type(uint64).max || settledAt > type(uint64).max) {
            revert InvalidAmount();
        }
        
        // 创建挖矿记录
        minings[requestId] = MiningInfo({
            requestId: requestId,
            player: player,
            miningAmount: uint96(miningAmount),
            betTokenAddress: betTokenAddress,
            betAmount: uint96(betAmount),
            createdAt: uint64(createdAt),
            settledAt: uint64(settledAt),
            minedAt: 0,
            status: MiningStatus.Pending,
            playerChoice: playerChoice,
            diceResult: diceResult,
            isWinner: isWinner
        });
        
        // 添加到历史记录
        _addMiningHistory(requestId);
        totalMinings++;
        
        // 触发事件
        emit MiningRequestSubmitted(
            requestId,
            player,
            betTokenAddress,
            miningAmount,
            betAmount,
            createdAt,
            currentRatio
        );
    }

    /**
     * @notice 执行挖矿
     * @param requestId VRF请求ID
     */
    function executeMining(uint256 requestId) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        MiningInfo storage mining = minings[requestId];
        
        // 验证挖矿请求存在
        if (mining.player == address(0)) {
            revert MiningNotFound();
        }
        
        // 验证挖矿状态
        if (mining.status != MiningStatus.Pending) {
            revert MiningNotPending();
        }
        
        // 检查合约MLHG余额
        uint256 contractBalance = _getContractBalance(MLHG_TOKEN);
        if (contractBalance < mining.miningAmount) {
            mining.status = MiningStatus.Failed;
            totalFailedMinings++;
            emit MiningFailed(requestId, mining.player, "Insufficient MLHG balance");
            return;
        }
        
        // CEI模式：先更新状态（Effects），再执行外部调用（Interactions）
        // 缓存必要的数据用于转账和事件
        address player = mining.player;
        uint256 miningAmount = mining.miningAmount;
        
        // 立即更新状态以防止重入攻击
        mining.status = MiningStatus.Completed;
        mining.minedAt = uint64(block.timestamp);
        totalCompletedMinings++;
        totalMiningAmount += miningAmount;
        
        // 执行MLHG代币转账（外部调用）
        bool success = _transferMining(player, miningAmount);
        
        if (success) {
            // 挖矿成功 - 发出成功事件
            emit MiningCompleted(
                requestId,
                player,
                miningAmount,
                block.timestamp
            );
        } else {
            // 转账失败 - 回滚状态更新
            mining.status = MiningStatus.Failed;
            mining.minedAt = 0;
            totalCompletedMinings--;
            totalMiningAmount -= miningAmount;
            totalFailedMinings++;
            
            emit MiningFailed(requestId, player, "MLHG transfer failed");
        }
    }

    /**
     * @notice 充值MLHG代币到合约
     * @param amount 充值金额
     */
    function depositMLHG(uint256 amount) external onlyRole(ADMIN_ROLE) {
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        IERC20(MLHG_TOKEN).safeTransferFrom(msg.sender, address(this), amount);
        emit FundsDeposited(MLHG_TOKEN, amount, msg.sender);
    }

    /**
     * @notice 提取合约中的MLHG代币（仅限管理员）
     * @param amount 提取金额
     * @param to 接收地址
     */
    function withdrawMLHG(
        uint256 amount,
        address to
    ) external onlyRole(ADMIN_ROLE) {
        if (to == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        uint256 contractBalance = _getContractBalance(MLHG_TOKEN);
        if (contractBalance < amount) {
            revert InsufficientBalance();
        }
        
        IERC20(MLHG_TOKEN).safeTransfer(to, amount);
        emit FundsWithdrawn(MLHG_TOKEN, amount, to);
    }

    /**
     * @notice 充值原生代币S到合约
     * @dev 使用payable接收原生代币
     */
    function depositNative() external payable onlyRole(ADMIN_ROLE) {
        if (msg.value == 0) {
            revert InvalidAmount();
        }
        
        emit FundsDeposited(NATIVE_TOKEN, msg.value, msg.sender);
    }

    /**
     * @notice 提取合约中的原生代币S（仅限管理员）
     * @param amount 提取金额
     * @param to 接收地址
     */
    function withdrawNative(
        uint256 amount,
        address payable to
    ) external onlyRole(ADMIN_ROLE) nonReentrant {
        if (to == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        uint256 contractBalance = address(this).balance;
        if (contractBalance < amount) {
            revert InsufficientBalance();
        }
        
        // 使用call方法发送原生代币，更安全
        (bool success, ) = to.call{value: amount}("");
        if (!success) {
            revert("Native token transfer failed");
        }
        
        emit FundsWithdrawn(NATIVE_TOKEN, amount, to);
    }

    /**
     * @notice 批量清理已完成的旧挖矿记录
     * @param requestIds 要清理的请求ID数组
     * @dev 只能清理已完成且超过7天的挖矿记录
     */
    function cleanupOldMinings(uint256[] calldata requestIds) external onlyRole(ADMIN_ROLE) {
        uint256 cutoffTime = block.timestamp - CLEANUP_THRESHOLD;
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            MiningInfo storage mining = minings[requestId];
            
            // 检查挖矿是否存在且已完成且超过清理时间
            // 统一使用settledAt作为清理判断的时间基准，确保逻辑一致性
            if (mining.player != address(0) && 
                (mining.status == MiningStatus.Completed || mining.status == MiningStatus.Failed) &&
                mining.settledAt > 0 && mining.settledAt < cutoffTime) {
                
                address player = mining.player;
                
                // 清理挖矿记录
                delete minings[requestId];
                
                // 清理历史记录中的对应记录
                _removeFromMiningHistory(requestId);
                
                // 发出清理事件
                emit MiningCleaned(requestId, player);
            }
        }
    }

    /**
     * @notice 获取当前挖矿比例
     * @return 当前挖矿比例
     * @dev 初始比例1:100，每天相对于前一天减产1%，使用复合减产公式
     */
    function getCurrentMiningRatio() public view returns (uint256) {
        uint256 daysPassed = (block.timestamp - CONTRACT_START_TIME) / SECONDS_PER_DAY;
        
        // 如果天数过多导致比例接近0，直接返回0
        if (daysPassed >= 460) { // ln(0.01)/ln(0.99) ≈ 460天后比例降至1%以下
            return 0;
        }
        
        // 使用复合减产公式：当前比例 = 初始比例 × (0.99)^天数
        // 为了避免浮点运算，使用整数运算：(99/100)^daysPassed
        // 使用二进制快速幂算法计算 99^daysPassed / 100^daysPassed
        uint256 currentRatio = (INITIAL_MINING_RATIO * _power(99, daysPassed)) / _power(100, daysPassed);
        
        return currentRatio;
    }
    
    /**
     * @notice 计算整数幂运算（内部函数）
     * @param base 底数
     * @param exponent 指数
     * @return 结果
     * @dev 使用二进制快速幂算法，避免溢出
     */
    function _power(uint256 base, uint256 exponent) internal pure returns (uint256) {
        if (exponent == 0) {
            return 1;
        }
        
        uint256 result = 1;
        uint256 currentBase = base;
        
        while (exponent > 0) {
            if (exponent & 1 == 1) {
                // 检查溢出
                if (result > type(uint256).max / currentBase) {
                    return 0; // 溢出时返回0
                }
                result = result * currentBase;
            }
            
            if (exponent > 1) {
                // 检查溢出
                if (currentBase > type(uint256).max / currentBase) {
                    return type(uint256).max; // 溢出时返回最大值
                }
                currentBase = currentBase * currentBase;
            }
            
            exponent = exponent >> 1;
        }
        
        return result;
    }

    /**
     * @notice 获取挖矿信息
     * @param requestId 请求ID
     * @return 挖矿信息
     */
    function getMiningInfo(uint256 requestId) external view returns (MiningInfo memory) {
        return minings[requestId];
    }

    /**
     * @notice 获取合约MLHG余额
     * @return 余额
     */
    function getContractMLHGBalance() external view returns (uint256) {
        return _getContractBalance(MLHG_TOKEN);
    }

    /**
     * @notice 获取合约原生代币S余额
     * @return 余额
     */
    function getContractNativeBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice 获取合约指定代币余额（支持原生代币和ERC20代币）
     * @param tokenAddress 代币地址，address(0)表示原生代币
     * @return 余额
     */
    function getContractBalance(address tokenAddress) external view returns (uint256) {
        if (tokenAddress == NATIVE_TOKEN) {
            return address(this).balance;
        } else {
            return _getContractBalance(tokenAddress);
        }
    }

    /**
     * @notice 获取合约统计信息
     * @return totalMinings_ 总挖矿数
     * @return totalCompleted 已完成挖矿数
     * @return totalFailed 失败挖矿数
     * @return totalAmount 总挖矿金额
     */
    function getContractStats() external view returns (
        uint256 totalMinings_,
        uint256 totalCompleted,
        uint256 totalFailed,
        uint256 totalAmount
    ) {
        return (totalMinings, totalCompletedMinings, totalFailedMinings, totalMiningAmount);
    }

    /**
     * @notice 获取挖矿历史记录
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 挖矿请求ID数组
     */
    function getMiningHistory(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _getMiningHistoryPaginated(offset, limit);
    }

    /**
     * @notice 获取挖矿历史记录数量
     * @return 挖矿历史数量
     */
    function getMiningHistoryCount() external view returns (uint256) {
        return miningHistory.count;
    }

    /**
     * @notice 获取挖矿比例信息
     * @return daysPassed 已过天数
     * @return currentRatio 当前比例
     * @return reductionPercentage 相对于初始比例的减产百分比
     */
    function getMiningRatioInfo() external view returns (
        uint256 daysPassed,
        uint256 currentRatio,
        uint256 reductionPercentage
    ) {
        daysPassed = (block.timestamp - CONTRACT_START_TIME) / SECONDS_PER_DAY;
        currentRatio = getCurrentMiningRatio();
        
        // 计算相对于初始比例的减产百分比
        if (currentRatio == 0) {
            reductionPercentage = 100;
        } else {
            // 减产百分比 = (1 - 当前比例/初始比例) × 100
            reductionPercentage = ((INITIAL_MINING_RATIO - currentRatio) * 100) / INITIAL_MINING_RATIO;
        }
    }

    /**
     * @notice 暂停合约（仅限管理员）
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice 恢复合约（仅限管理员）
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice 获取合约代币余额（内部函数）
     * @param tokenAddress 代币地址
     * @return 余额
     */
    function _getContractBalance(address tokenAddress) internal view returns (uint256) {
        return IERC20(tokenAddress).balanceOf(address(this));
    }

    /**
     * @notice 执行挖矿转账（内部函数）
     * @param to 接收地址
     * @param amount 转账金额
     * @return 是否成功
     */
    function _transferMining(address to, uint256 amount) internal returns (bool) {
        // 额外的重入保护检查
        if (to == address(this)) {
            return false;
        }
        
        // 转账MLHG代币 - 使用SafeERC20的safeTransfer
        try IERC20(MLHG_TOKEN).transfer(to, amount) returns (bool success) {
            return success;
        } catch {
            return false;
        }
    }

    /**
     * @notice 添加挖矿历史记录到循环缓冲区
     * @param requestId 请求ID
     */
    function _addMiningHistory(uint256 requestId) internal {
        CircularBuffer storage buffer = miningHistory;
        
        // 将新记录添加到头指针位置
        buffer.requestIds[buffer.head] = requestId;
        
        // 更新头指针
        buffer.head = (buffer.head + 1) % MAX_MINING_HISTORY;
        
        // 如果缓冲区已满，移动尾指针（覆盖最旧记录）
        if (buffer.count == MAX_MINING_HISTORY) {
            buffer.tail = (buffer.tail + 1) % MAX_MINING_HISTORY;
        } else {
            buffer.count++;
        }
    }

    /**
     * @notice 从挖矿历史循环缓冲区中移除指定的记录
     * @param requestId 要移除的请求ID
     */
    function _removeFromMiningHistory(uint256 requestId) internal {
        CircularBuffer storage buffer = miningHistory;
        
        if (buffer.count == 0) {
            return;
        }
        
        // 查找并移除指定的requestId
        bool found = false;
        uint256 foundIndex = 0;
        
        // 从尾指针开始搜索（最旧的记录）
        for (uint256 i = 0; i < buffer.count; i++) {
            uint256 searchIndex = (buffer.tail + i) % MAX_MINING_HISTORY;
            if (buffer.requestIds[searchIndex] == requestId) {
                found = true;
                foundIndex = searchIndex;
                break;
            }
        }
        
        if (!found) {
            return;
        }
        
        // 如果找到的是最后一个元素（头指针前一位），直接减少计数
        uint256 lastIndex = (buffer.head + MAX_MINING_HISTORY - 1) % MAX_MINING_HISTORY;
        if (foundIndex == lastIndex) {
            buffer.head = (buffer.head + MAX_MINING_HISTORY - 1) % MAX_MINING_HISTORY;
            buffer.count--;
        } else {
            // 将找到的记录后面的所有记录向前移动一位
            uint256 currentIndex = foundIndex;
            uint256 elementsToMove = 0;
            
            // 计算需要移动的元素数量
            if (foundIndex < buffer.head) {
                elementsToMove = buffer.head - foundIndex - 1;
            } else {
                elementsToMove = (MAX_MINING_HISTORY - foundIndex - 1) + buffer.head;
            }
            
            // 移动元素
            for (uint256 i = 0; i < elementsToMove; i++) {
                uint256 nextIndex = (currentIndex + 1) % MAX_MINING_HISTORY;
                buffer.requestIds[currentIndex] = buffer.requestIds[nextIndex];
                currentIndex = nextIndex;
            }
            
            // 更新头指针和计数
            buffer.head = (buffer.head + MAX_MINING_HISTORY - 1) % MAX_MINING_HISTORY;
            buffer.count--;
        }
        
        // 如果缓冲区变空，重置指针
        if (buffer.count == 0) {
            buffer.head = 0;
            buffer.tail = 0;
        }
    }

    /**
     * @notice 获取挖矿历史记录（分页，内部函数）
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 挖矿请求ID数组
     */
    function _getMiningHistoryPaginated(uint256 offset, uint256 limit) internal view returns (uint256[] memory) {
        CircularBuffer storage buffer = miningHistory;
        
        if (buffer.count == 0 || offset >= buffer.count) {
            return new uint256[](0);
        }
        
        uint256 actualLimit = limit;
        if (offset + limit > buffer.count) {
            actualLimit = buffer.count - offset;
        }
        
        uint256[] memory result = new uint256[](actualLimit);
        
        // 从最新记录开始读取（头指针前一位置）
        // 直接计算起始位置，避免循环
        uint256 startPos = (buffer.head + MAX_MINING_HISTORY - 1 - offset) % MAX_MINING_HISTORY;
        
        // 读取limit个记录
        for (uint256 i = 0; i < actualLimit; i++) {
            uint256 currentPos = (startPos + MAX_MINING_HISTORY - i) % MAX_MINING_HISTORY;
            result[i] = buffer.requestIds[currentPos];
        }
        
        return result;
    }

}