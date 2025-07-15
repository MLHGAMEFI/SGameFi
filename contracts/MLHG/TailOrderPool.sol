// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title TailOrderPool
 * @dev 尾单奖金池合约
 * 监听MLHGToken合约的买单事件，实现60分钟倒计时奖金池机制
