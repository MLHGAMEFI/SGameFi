// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// 导入OpenZeppelin合约库
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";



/**
 * @title PayoutContract
 * @notice 专门负责处理游戏中奖奖金发放的独立合约
 * @dev 与BettingContract分离，确保资金安全和职责分离，针对Sonic测试网优化gas费用
 */
contract PayoutContract is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // 自定义错误 - Gas优化：使用自定义错误减少gas消耗
    error InvalidAddress();
    error InvalidAmount();
    error PayoutNotFound();
    error PayoutAlreadyExecuted();
    error InsufficientBalance();
    error InvalidPayoutData();
    error PayoutNotPending();
    error UnauthorizedCaller();

    // 角色定义
    bytes32 public constant ADMIN_ROLE = DEFAULT_ADMIN_ROLE;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    // 支持的代币地址
    address public constant NATIVE_TOKEN = address(0); // 原生代币S
    address public immutable MLH_TOKEN; // MLH代币地址
    address public immutable MLHG_TOKEN; // MLHG代币地址

    // 派奖状态枚举
    enum PayoutStatus {
        Pending,    // 等待执行
        Completed,  // 已完成
        Failed,     // 执行失败
        Cancelled   // 已取消
    }

    // 派奖信息结构体 - 存储优化：合理打包字段减少存储槽使用
    struct PayoutInfo {
        uint256 requestId;        // VRF请求ID (slot 0)
        address player;           // 中奖玩家地址 (slot 1: 20 bytes)
        uint96 payoutAmount;      // 奖金金额 (slot 1: 12 bytes) - 优化：使用uint96
        address tokenAddress;     // 奖金代币类型 (slot 2: 20 bytes)
        uint96 betAmount;         // 原始投注金额 (slot 2: 12 bytes) - 优化：使用uint96
        uint64 createdAt;         // 投注创建时间 (slot 3: 8 bytes) - 优化：uint64
        uint64 settledAt;         // 结算时间 (slot 3: 8 bytes)
        uint64 payoutAt;          // 派奖时间 (slot 3: 8 bytes)
        PayoutStatus status;      // 派奖状态 (slot 3: 1 byte)
        bool playerChoice;        // 玩家选择（单/双） (slot 3: 1 byte)
        bool diceResult;          // 骰子结果（单/双） (slot 3: 1 byte)
        bool isWinner;            // 游戏判定结果（是否中奖） (slot 3: 1 byte)
        // 总共使用4个存储槽
    }

    // 常量定义 - 循环缓冲区配置
    uint256 public constant MAX_PAYOUT_HISTORY = 200; // 最大派奖历史记录数
    uint256 public constant CLEANUP_THRESHOLD = 7 days; // 清理阈值：7天

    // 循环缓冲区结构体
    struct CircularBuffer {
        uint256[MAX_PAYOUT_HISTORY] requestIds; // 固定大小的请求ID数组
        uint256 head;                          // 头指针（下一个写入位置）
        uint256 tail;                          // 尾指针（最旧记录位置）
        uint256 count;                         // 当前记录数量
    }

    // 存储映射
    mapping(uint256 => PayoutInfo) public payouts; // requestId => PayoutInfo
    CircularBuffer private payoutHistory; // 派奖历史循环缓冲区

    // 统计数据
    uint256 public totalPayouts;
    uint256 public totalCompletedPayouts;
    uint256 public totalFailedPayouts;
    uint256 public totalPayoutAmount;

    // 事件定义
    /**
     * @notice 派奖请求提交事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param tokenAddress 代币地址
     * @param payoutAmount 派奖金额
     * @param betAmount 投注金额
     * @param createdAt 创建时间
     */
    event PayoutRequestSubmitted(
        uint256 indexed requestId,
        address indexed player,
        address tokenAddress,
        uint256 payoutAmount,
        uint256 betAmount,
        uint256 createdAt
    );

    /**
     * @notice 派奖完成事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param tokenAddress 代币地址
     * @param payoutAmount 派奖金额
     * @param payoutAt 派奖时间
     */
    event PayoutCompleted(
        uint256 indexed requestId,
        address indexed player,
        address tokenAddress,
        uint256 payoutAmount,
        uint256 payoutAt
    );

    /**
     * @notice 派奖失败事件
     * @param requestId 请求ID（索引）
     * @param player 玩家地址（索引）
     * @param reason 失败原因
     */
    event PayoutFailed(
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
     * @notice 派奖记录清理事件
     * @param requestId 请求ID
     * @param player 玩家地址
     */
    event PayoutCleaned(
        uint256 indexed requestId,
        address indexed player
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
        
        // 设置角色
        _grantRole(ADMIN_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
    }

    /**
     * @notice 提交派奖请求
     * @param requestId VRF请求ID
     * @param player 中奖玩家地址
     * @param tokenAddress 奖金代币类型
     * @param payoutAmount 奖金金额
     * @param betAmount 原始投注金额
     * @param createdAt 投注创建时间
     * @param settledAt 结算时间
     * @param playerChoice 玩家选择（单/双）
     * @param diceResult 骰子结果（单/双）
     * @param isWinner 游戏判定结果（是否中奖）
     */
    function submitPayoutRequest(
        uint256 requestId,
        address player,
        address tokenAddress,
        uint256 payoutAmount,
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
        if (payoutAmount == 0) {
            revert InvalidAmount();
        }
        if (!isWinner) {
            revert InvalidPayoutData();
        }
        
        // 验证代币地址
        if (tokenAddress != NATIVE_TOKEN && 
            tokenAddress != MLH_TOKEN && 
            tokenAddress != MLHG_TOKEN) {
            revert InvalidAddress();
        }
        
        // 检查是否已存在派奖请求
        if (payouts[requestId].player != address(0)) {
            revert PayoutAlreadyExecuted();
        }
        
        // 验证金额范围
        if (payoutAmount > type(uint96).max || betAmount > type(uint96).max) {
            revert InvalidAmount();
        }
        if (createdAt > type(uint64).max || settledAt > type(uint64).max) {
            revert InvalidAmount();
        }
        
        // 创建派奖记录
        payouts[requestId] = PayoutInfo({
            requestId: requestId,
            player: player,
            payoutAmount: uint96(payoutAmount),
            tokenAddress: tokenAddress,
            betAmount: uint96(betAmount),
            createdAt: uint64(createdAt),
            settledAt: uint64(settledAt),
            payoutAt: 0,
            status: PayoutStatus.Pending,
            playerChoice: playerChoice,
            diceResult: diceResult,
            isWinner: isWinner
        });
        
        // 添加到历史记录
        _addPayoutHistory(requestId);
        totalPayouts++;
        
        // 触发事件
        emit PayoutRequestSubmitted(
            requestId,
            player,
            tokenAddress,
            payoutAmount,
            betAmount,
            createdAt
        );
    }

    /**
     * @notice 执行派奖
     * @param requestId VRF请求ID
     */
    function executePayout(uint256 requestId) external onlyRole(OPERATOR_ROLE) nonReentrant whenNotPaused {
        PayoutInfo storage payout = payouts[requestId];
        
        // 验证派奖请求存在
        if (payout.player == address(0)) {
            revert PayoutNotFound();
        }
        
        // 验证派奖状态
        if (payout.status != PayoutStatus.Pending) {
            revert PayoutNotPending();
        }
        
        // 检查合约余额
        uint256 contractBalance = _getContractBalance(payout.tokenAddress);
        if (contractBalance < payout.payoutAmount) {
            payout.status = PayoutStatus.Failed;
            totalFailedPayouts++;
            emit PayoutFailed(requestId, payout.player, "Insufficient contract balance");
            return;
        }
        
        // CEI模式：先更新状态（Effects），再执行外部调用（Interactions）
        // 缓存必要的数据用于转账和事件
        address player = payout.player;
        address tokenAddress = payout.tokenAddress;
        uint256 payoutAmount = payout.payoutAmount;
        
        // 立即更新状态以防止重入攻击
        payout.status = PayoutStatus.Completed;
        payout.payoutAt = uint64(block.timestamp);
        totalCompletedPayouts++;
        totalPayoutAmount += payoutAmount;
        
        // 执行转账（外部调用）
        bool success = _transferPayout(player, tokenAddress, payoutAmount);
        
        if (success) {
            // 派奖成功 - 发出成功事件
            emit PayoutCompleted(
                requestId,
                player,
                tokenAddress,
                payoutAmount,
                block.timestamp
            );
        } else {
            // 转账失败 - 回滚状态更新
            payout.status = PayoutStatus.Failed;
            payout.payoutAt = 0;
            totalCompletedPayouts--;
            totalPayoutAmount -= payoutAmount;
            totalFailedPayouts++;
            
            emit PayoutFailed(requestId, player, "Transfer failed");
        }
    }

    /**
     * @notice 充值资金到合约
     * @param tokenAddress 代币地址（address(0)为原生代币）
     * @param amount 充值金额（原生代币时忽略此参数，使用msg.value）
     */
    function depositFunds(address tokenAddress, uint256 amount) external payable onlyRole(ADMIN_ROLE) {
        if (tokenAddress == NATIVE_TOKEN) {
            // 充值原生代币
            if (msg.value == 0) {
                revert InvalidAmount();
            }
            emit FundsDeposited(NATIVE_TOKEN, msg.value, msg.sender);
        } else {
            // 充值ERC20代币
            if (amount == 0) {
                revert InvalidAmount();
            }
            
            // 验证代币地址
            if (tokenAddress != MLH_TOKEN && tokenAddress != MLHG_TOKEN) {
                revert InvalidAddress();
            }
            
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
            emit FundsDeposited(tokenAddress, amount, msg.sender);
        }
    }

    /**
     * @notice 提取合约中的资金（仅限管理员）
     * @param tokenAddress 代币地址（address(0)表示原生代币）
     * @param amount 提取金额
     * @param to 接收地址
     */
    function withdrawFunds(
        address tokenAddress,
        uint256 amount,
        address to
    ) external onlyRole(ADMIN_ROLE) {
        if (to == address(0)) {
            revert InvalidAddress();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }
        
        uint256 contractBalance = _getContractBalance(tokenAddress);
        if (contractBalance < amount) {
            revert InsufficientBalance();
        }
        
        if (tokenAddress == NATIVE_TOKEN) {
            // 提取原生代币
            (bool success, ) = payable(to).call{value: amount}("");
            require(success, "Native token withdrawal failed");
        } else {
            // 提取ERC20代币
            IERC20(tokenAddress).safeTransfer(to, amount);
        }
        
        emit FundsWithdrawn(tokenAddress, amount, to);
    }

    /**
     * @notice 批量清理已完成的旧派奖记录
     * @param requestIds 要清理的请求ID数组
     * @dev 只能清理已完成且超过7天的派奖记录
     */
    function cleanupOldPayouts(uint256[] calldata requestIds) external onlyRole(ADMIN_ROLE) {
        uint256 cutoffTime = block.timestamp - CLEANUP_THRESHOLD;
        
        for (uint256 i = 0; i < requestIds.length; i++) {
            uint256 requestId = requestIds[i];
            PayoutInfo storage payout = payouts[requestId];
            
            // 检查派奖是否存在且已完成且超过清理时间
            if (payout.player != address(0) && 
                (payout.status == PayoutStatus.Completed || payout.status == PayoutStatus.Failed) &&
                ((payout.status == PayoutStatus.Completed && payout.payoutAt > 0 && payout.payoutAt < cutoffTime) ||
                 (payout.status == PayoutStatus.Failed && payout.settledAt < cutoffTime))) {
                
                address player = payout.player;
                
                // 清理派奖记录
                delete payouts[requestId];
                
                // 清理历史记录中的对应记录
                _removeFromPayoutHistory(requestId);
                
                // 发出清理事件
                emit PayoutCleaned(requestId, player);
            }
        }
    }

    /**
     * @notice 获取派奖信息
     * @param requestId 请求ID
     * @return 派奖信息
     */
    function getPayoutInfo(uint256 requestId) external view returns (PayoutInfo memory) {
        return payouts[requestId];
    }

    /**
     * @notice 获取合约代币余额
     * @param tokenAddress 代币地址
     * @return 余额
     */
    function getContractBalance(address tokenAddress) external view returns (uint256) {
        return _getContractBalance(tokenAddress);
    }

    /**
     * @notice 获取合约统计信息
     * @return totalPayouts_ 总派奖数
     * @return totalCompleted 已完成派奖数
     * @return totalFailed 失败派奖数
     * @return totalAmount 总派奖金额
     */
    function getContractStats() external view returns (
        uint256 totalPayouts_,
        uint256 totalCompleted,
        uint256 totalFailed,
        uint256 totalAmount
    ) {
        return (totalPayouts, totalCompletedPayouts, totalFailedPayouts, totalPayoutAmount);
    }

    /**
     * @notice 获取派奖历史记录
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 派奖请求ID数组
     */
    function getPayoutHistory(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        return _getPayoutHistoryPaginated(offset, limit);
    }

    /**
     * @notice 获取派奖历史记录数量
     * @return 派奖历史数量
     */
    function getPayoutHistoryCount() external view returns (uint256) {
        return payoutHistory.count;
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
        if (tokenAddress == NATIVE_TOKEN) {
            return address(this).balance;
        } else {
            return IERC20(tokenAddress).balanceOf(address(this));
        }
    }

    /**
     * @notice 执行派奖转账（内部函数）
     * @param to 接收地址
     * @param tokenAddress 代币地址
     * @param amount 转账金额
     * @return 是否成功
     */
    function _transferPayout(address to, address tokenAddress, uint256 amount) internal returns (bool) {
        // 额外的重入保护检查
        if (to == address(this)) {
            return false;
        }
        
        if (tokenAddress == NATIVE_TOKEN) {
            // 转账原生代币 - 使用call替代transfer以避免gas限制问题
            // call提供更多gas，但需要手动检查返回值
            try this._transferNativeToken(to, amount) {
                return true;
            } catch {
                return false;
            }
        } else {
            // 转账ERC20代币 - 使用SafeERC20的safeTransfer
            try IERC20(tokenAddress).transfer(to, amount) returns (bool success) {
                return success;
            } catch {
                return false;
            }
        }
    }

    /**
     * @notice 内部函数：转账原生代币
     * @param to 接收地址
     * @param amount 转账金额
     */
    function _transferNativeToken(address to, uint256 amount) external {
        require(msg.sender == address(this), "Only self call");
        (bool success, ) = payable(to).call{value: amount}("");
        require(success, "Native token transfer failed");
    }

    /**
     * @notice 添加派奖历史记录到循环缓冲区
     * @param requestId 请求ID
     */
    function _addPayoutHistory(uint256 requestId) internal {
        CircularBuffer storage buffer = payoutHistory;
        
        // 将新记录添加到头指针位置
        buffer.requestIds[buffer.head] = requestId;
        
        // 更新头指针
        buffer.head = (buffer.head + 1) % MAX_PAYOUT_HISTORY;
        
        // 如果缓冲区已满，移动尾指针（覆盖最旧记录）
        if (buffer.count == MAX_PAYOUT_HISTORY) {
            buffer.tail = (buffer.tail + 1) % MAX_PAYOUT_HISTORY;
        } else {
            buffer.count++;
        }
    }

    /**
     * @notice 从派奖历史循环缓冲区中移除指定的记录
     * @param requestId 要移除的请求ID
     */
    function _removeFromPayoutHistory(uint256 requestId) internal {
        CircularBuffer storage buffer = payoutHistory;
        
        if (buffer.count == 0) {
            return;
        }
        
        // 查找并移除指定的requestId
        bool found = false;
        uint256 foundIndex = 0;
        
        // 从尾指针开始搜索（最旧的记录）
        for (uint256 i = 0; i < buffer.count; i++) {
            uint256 searchIndex = (buffer.tail + i) % MAX_PAYOUT_HISTORY;
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
        uint256 lastIndex = (buffer.head + MAX_PAYOUT_HISTORY - 1) % MAX_PAYOUT_HISTORY;
        if (foundIndex == lastIndex) {
            buffer.head = (buffer.head + MAX_PAYOUT_HISTORY - 1) % MAX_PAYOUT_HISTORY;
            buffer.count--;
        } else {
            // 将找到的记录后面的所有记录向前移动一位
            uint256 currentIndex = foundIndex;
            uint256 elementsToMove = 0;
            
            // 计算需要移动的元素数量
            if (foundIndex < buffer.head) {
                elementsToMove = buffer.head - foundIndex - 1;
            } else {
                elementsToMove = (MAX_PAYOUT_HISTORY - foundIndex - 1) + buffer.head;
            }
            
            // 移动元素
            for (uint256 i = 0; i < elementsToMove; i++) {
                uint256 nextIndex = (currentIndex + 1) % MAX_PAYOUT_HISTORY;
                buffer.requestIds[currentIndex] = buffer.requestIds[nextIndex];
                currentIndex = nextIndex;
            }
            
            // 更新头指针和计数
            buffer.head = (buffer.head + MAX_PAYOUT_HISTORY - 1) % MAX_PAYOUT_HISTORY;
            buffer.count--;
        }
        
        // 如果缓冲区变空，重置指针
        if (buffer.count == 0) {
            buffer.head = 0;
            buffer.tail = 0;
        }
    }

    /**
     * @notice 获取派奖历史记录（分页，内部函数）
     * @param offset 偏移量
     * @param limit 限制数量
     * @return 派奖请求ID数组
     */
    function _getPayoutHistoryPaginated(uint256 offset, uint256 limit) internal view returns (uint256[] memory) {
        CircularBuffer storage buffer = payoutHistory;
        
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
        uint256 startPos = (buffer.head + MAX_PAYOUT_HISTORY - 1 - offset) % MAX_PAYOUT_HISTORY;
        
        // 读取limit个记录
        for (uint256 i = 0; i < actualLimit; i++) {
            uint256 currentPos = (startPos + MAX_PAYOUT_HISTORY - i) % MAX_PAYOUT_HISTORY;
            result[i] = buffer.requestIds[currentPos];
        }
        
        return result;
    }

    /**
     * @notice 接收原生代币
     */
    receive() external payable {
        emit FundsDeposited(NATIVE_TOKEN, msg.value, msg.sender);
    }

    /**
     * @notice 回退函数
     */
    fallback() external payable {
        emit FundsDeposited(NATIVE_TOKEN, msg.value, msg.sender);
    }

}