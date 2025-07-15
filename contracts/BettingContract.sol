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
