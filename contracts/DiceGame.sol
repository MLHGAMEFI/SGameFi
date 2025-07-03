// SPDX-License-Identifier: MIT
// 开源许可证标识符，使用MIT许可证
pragma solidity ^0.8.30;
// 指定Solidity编译器版本，要求0.8.30或更高版本

// 导入Paintswap VRF消费者合约，用于获取可验证随机数
import {PaintswapVRFConsumer} from "@paintswap/vrf/contracts/PaintswapVRFConsumer.sol";

/**
 * @title IDiceGameCallback
 * @notice DiceGame回调接口
 */
interface IDiceGameCallback {
    function onDiceRollResult(uint256 requestId, uint8[] calldata results, bool isEven) external;
}

/**
 * @title DiceGame 获取PaintswapVRF协调器随机数合约
 * @notice 一个使用PaintswapVRF协调器获取随机数的简单骰子游戏
 * @dev 使用Paintswap VRF生成1到10之间的随机骰子点数
 */
contract DiceGame is PaintswapVRFConsumer {
  // 自定义错误：无效的骰子数量
  error InvalidDiceCount();
  // 自定义错误：无效的骰子面数
  error InvalidDiceSides();
  // 自定义错误：无效的请求ID
  error InvalidRequestId(uint256 requestId);
  // 自定义错误：请求已经被履行
  error RequestAlreadyFulfilled(uint256 requestId);
  // 自定义错误：玩家历史记录已满
  error PlayerHistoryFull(address player);

  // 游戏参数常量
  uint256 public constant MAX_DICE = 1; // 最大骰子数量限制为1个
  uint256 public constant MIN_SIDES = 10; // 骰子固定面数为10面（最小值）
  uint256 public constant MAX_SIDES = 10; // 骰子固定面数为10面（最大值）
  uint256 public constant CALLBACK_GAS_LIMIT = 500_000; // VRF回调函数的Gas限制

  // 请求跟踪相关数据结构
  struct RollRequest {
    address player; // 发起掷骰子请求的玩家地址
    address callback; // 回调合约地址
    uint256 requestedAt; // 请求发起的时间戳
    uint8 numberSides; // 骰子的面数
    bool fulfilled; // 请求是否已被履行（VRF是否已返回结果）
    uint8[] results; // 掷骰子的结果数组（履行后填充）
  }

  // 玩家历史记录循环缓冲区结构
  struct PlayerHistory {
    uint256[100] requestIds; // 循环缓冲区，存储请求ID
    uint8 head; // 头指针，指向下一个写入位置
    uint8 tail; // 尾指针，指向最旧的记录位置
    uint8 count; // 当前记录数量
  }

  // 从请求ID映射到掷骰子请求的映射表
  mapping(uint256 => RollRequest) public rollRequests;
  
  // 每个玩家的历史记录循环缓冲区
  mapping(address => PlayerHistory) private playerHistories;
  
  // 历史记录最大数量常量
  uint8 public constant MAX_HISTORY_PER_PLAYER = 100;

/**
 * 请求ID（索引）
 * 玩家地址（索引）
 * 骰子面数
 */
  // 事件定义
  // 掷骰子请求事件，当用户发起掷骰子请求时触发
  event DiceRollRequested(
    uint256 indexed requestId, 
    address indexed player, 
    uint8 numberSides
  );

/**
 * 请求ID（索引）
 * 玩家地址（索引）
 * 掷骰子结果数组
 * 单双数结果（true为双数，false为单数）
 * 履行时间戳
 */
  // 掷骰子结果事件，当VRF返回随机数并计算出结果时触发
  event DiceRollResult(
    uint256 indexed requestId, 
    address indexed player, 
    uint8[] results,
    bool isEven, 
    uint256 fulfillmentTime 
  );

  /**
   * @notice 构造函数，初始化合约
   * @param paintswapVRF PaintswapVRF协调器合约的地址
   */
  constructor(address paintswapVRF) PaintswapVRFConsumer(paintswapVRF) {
  }

  /**
   * @notice 请求掷骰子
   * @param numDice 要掷的骰子数量（随机数的数量）
   * @param numberSides 每个骰子的面数
   * @param callback 回调合约地址
   * @return requestId VRF请求的ID
   */
  function rollDice(
    uint8 numDice, // 骰子数量参数
    uint8 numberSides, // 骰子面数参数
    address callback // 回调合约地址
  ) external payable returns (uint256 requestId) {
    // 验证输入参数的有效性
    if (numDice == 0 || numDice > MAX_DICE) {
      revert InvalidDiceCount(); // 骰子数量必须为1
    }
    if (numberSides < MIN_SIDES || numberSides > MAX_SIDES) {
      revert InvalidDiceSides(); // 骰子面数必须在允许范围内
    }

    // 向VRF协调器请求随机数
    requestId = _requestRandomnessPayInNative(
      CALLBACK_GAS_LIMIT, // 回调函数的Gas限制
      numDice, // 请求的随机数数量（每个骰子一个）
      address(0), // 不进行Gas退款
      msg.value // 用于支付请求的原生代币数量
    );

    // 存储掷骰子请求信息
    rollRequests[requestId] = RollRequest({
      player: msg.sender, // 记录请求者地址
      callback: callback, // 记录回调合约地址
      requestedAt: block.timestamp, // 记录请求时间戳
      numberSides: numberSides, // 记录骰子面数
      results: new uint8[](0), // 初始化空结果数组，将在履行时填充
      fulfilled: false // 标记为未履行状态
    });

    // 将请求ID添加到玩家的循环缓冲区历史记录中
    _addToPlayerHistory(msg.sender, requestId);

    // 触发掷骰子请求事件
    emit DiceRollRequested(requestId, msg.sender, numberSides);

    return requestId; // 返回请求ID
  }

  /**
   * @notice 检查掷骰子请求是否存在以及是否已被履行
   * @param requestId VRF请求的ID
   * @return exists 请求是否存在
   * @return fulfilled 请求是否已被履行
   * @return results 掷骰子结果（如果已履行）
   */
  function checkRollStatus(
    uint256 requestId // 要查询的请求ID
  )
    external
    view
    returns (bool exists, bool fulfilled, uint8[] memory results)
  {
    RollRequest memory request = rollRequests[requestId]; // 从映射中获取请求信息
    exists = request.requestedAt != 0; // 通过请求时间戳判断请求是否存在
    fulfilled = request.fulfilled; // 获取履行状态
    results = request.results; // 获取掷骰子结果
  }

  /**
   * @dev 返回正在使用的VRF协调器地址
   * @return VRF协调器合约地址
   * @notice 可用于验证协调器或直接与其交互
   */
  function getVRFCoordinator() external view returns (address) {
    return address(_vrfCoordinator); // 返回父合约中的VRF协调器地址
  }

  /**
   * @notice VRF协调器在随机数准备就绪时调用的回调函数
   * @param requestId VRF请求的ID
   * @param randomWords VRF生成的随机数数组
   */
  function _fulfillRandomWords(
    uint256 requestId, // VRF请求ID
    uint256[] calldata randomWords // VRF返回的随机数数组
  ) internal override {
    // 获取对应的掷骰子请求（使用storage引用以便修改）
    RollRequest storage request = rollRequests[requestId];
    
    // 验证请求ID的有效性
    if (request.requestedAt == 0) {
      revert InvalidRequestId(requestId);
    }
    
    // 验证请求是否已经被履行
    if (request.fulfilled) {
      revert RequestAlreadyFulfilled(requestId);
    }

    // 计算掷骰子结果（优化：由于MAX_DICE=1，避免循环和动态数组分配）
    uint8 diceResult = uint8((randomWords[0] % request.numberSides) + 1);
    
    // 创建结果数组（只包含一个元素）
    uint8[] memory results = new uint8[](1);
    results[0] = diceResult;
    
    // 识别单双数结果
    bool isEven = (diceResult % 2 == 0); // true为双数(2,4,6,8,10)，false为单数(1,3,5,7,9)

    // 更新请求状态
    request.results = results; // 保存掷骰子结果
    request.fulfilled = true; // 标记请求已履行

    // 触发掷骰子结果事件，包含单双数识别结果
    emit DiceRollResult(requestId, request.player, results, isEven, block.timestamp);
    
    // 如果有回调合约，则调用回调函数
    if (request.callback != address(0)) {
        try IDiceGameCallback(request.callback).onDiceRollResult(requestId, results, isEven) {
            // 回调成功
        } catch {
            // 回调失败，但不影响VRF结果的记录
        }
    }
  }

  /**
   * @notice 获取VRF费用
   * @return VRF费用（以wei为单位）
   */
  function getVRFCost() external view returns (uint256) {
    return _calculateRequestPriceNative(CALLBACK_GAS_LIMIT);
  }

  /**
   * @notice 获取玩家的历史记录
   * @param player 玩家地址
   * @return requestIds 玩家的历史请求ID数组（按时间顺序，最新的在前）
   */
  function getPlayerHistory(address player) external view returns (uint256[] memory requestIds) {
    PlayerHistory storage history = playerHistories[player];
    
    if (history.count == 0) {
      return new uint256[](0);
    }
    
    requestIds = new uint256[](history.count);
    
    // 从最新的记录开始返回（最新的在head-1位置）
    // 使用简化的逻辑：从head向后遍历count个位置
    for (uint8 i = 0; i < history.count; i++) {
      // 计算实际索引：从head-1开始向后
      uint8 index = (history.head + MAX_HISTORY_PER_PLAYER - 1 - i) % MAX_HISTORY_PER_PLAYER;
      requestIds[i] = history.requestIds[index];
    }
    
    return requestIds;
  }

  /**
   * @notice 获取玩家历史记录数量
   * @param player 玩家地址
   * @return count 历史记录数量
   */
  function getPlayerHistoryCount(address player) external view returns (uint8 count) {
    return playerHistories[player].count;
  }

  /**
   * @dev 将请求ID添加到玩家的循环缓冲区历史记录中
   * @param player 玩家地址
   * @param requestId 请求ID
   */
  function _addToPlayerHistory(address player, uint256 requestId) internal {
    PlayerHistory storage history = playerHistories[player];
    
    // 如果缓冲区已满，需要清理最旧的已完成请求
    if (history.count == MAX_HISTORY_PER_PLAYER) {
      // 获取最旧的请求ID
      uint256 oldestRequestId = history.requestIds[history.tail];
      
      // 只有当最旧的请求已完成时，才删除它并移动尾指针
      if (rollRequests[oldestRequestId].fulfilled) {
        delete rollRequests[oldestRequestId];
        // 移动尾指针
        history.tail = (history.tail + 1) % MAX_HISTORY_PER_PLAYER;
        // 修复：减少计数，因为我们删除了一个记录
        history.count--;
      } else {
         // 如果最旧的请求未完成，我们不应该覆盖它
         // 抛出错误，提示玩家历史记录已满且无法清理
         revert PlayerHistoryFull(player);
        }
    }
    
    // 在头指针位置添加新的请求ID
    history.requestIds[history.head] = requestId;
    
    // 移动头指针
    history.head = (history.head + 1) % MAX_HISTORY_PER_PLAYER;
    
    // 增加计数（无论是否删除了旧记录，都要为新记录增加计数）
    history.count++;
  }

  /**
   * @notice 手动清理玩家的已完成历史记录
   * @param player 玩家地址
   * @return cleaned 清理的记录数量
   * @dev 任何人都可以调用此函数来帮助清理存储空间
   */
  function cleanupPlayerHistory(address player) external returns (uint8 cleaned) {
    PlayerHistory storage history = playerHistories[player];
    
    if (history.count == 0) {
      return 0;
    }
    
    cleaned = 0;
    uint8 originalCount = history.count;
    
    // 从尾部开始清理已完成的请求
    // 改进逻辑：连续清理从tail开始的已完成请求
    while (history.count > 0 && cleaned < originalCount) {
      uint256 requestId = history.requestIds[history.tail];
      
      // 如果请求已完成且超过一定时间，则清理
      if (rollRequests[requestId].fulfilled && 
          block.timestamp > rollRequests[requestId].requestedAt + 1 hours) {
        
        delete rollRequests[requestId];
        history.tail = (history.tail + 1) % MAX_HISTORY_PER_PLAYER;
        history.count--;
        cleaned++;
      } else {
        // 遇到未完成或时间不够的请求，停止清理
        // 因为我们是从最旧的开始清理，如果当前请求不能清理
        // 那么后面的请求也不应该清理（它们更新）
        break;
      }
    }
    
    return cleaned;
  }

}
