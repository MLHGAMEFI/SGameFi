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


