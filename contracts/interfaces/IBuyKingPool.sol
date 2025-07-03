// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

/**
 * @title IBuyKingPool
 * @dev 买单王奖金池合约接口
 */
interface IBuyKingPool {
    /**
     * @dev 处理买单
     * @param buyer 买家地址
     * @param amount 购买金额
     */
    function processBuyOrder(address buyer, uint256 amount) external;
    
    /**
     * @dev 接收代币转账
     * @param amount 转账金额
     */
    function receiveTokens(uint256 amount) external;
    
    /**
     * @dev 手动结束当前轮次
     */
    function finishRound() external;
    
    /**
     * @dev 获取当前轮次剩余时间
     */
    function getTimeLeft() external view returns (uint256);
    
    /**
     * @dev 获取买家在当前轮次的购买量
     */
    function getCurrentRoundBuyerAmount(address buyer) external view returns (uint256);
    
    /**
     * @dev 获取当前轮次排行榜
     */
    function getCurrentRoundLeaderboard(uint256 topN) external view returns (address[] memory, uint256[] memory);
    
    /**
     * @dev 获取当前轮次信息
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
    );
    
    /**
     * @dev 获取当前轮次基本信息（向后兼容）
     */
    function getCurrentRoundInfo() external view returns (
        uint256 roundId,
        uint256 startTime,
        uint256 endTime,
        uint256 totalPrize,
        address topBuyer,
        uint256 topBuyAmount,
        bool isFinished,
        bool isPrizeDistributed
    );
    
    /**
     * @dev 获取当前轮次买家数量
     */
    function getCurrentRoundBuyerCount() external view returns (uint256);
    
    /**
     * @dev 获取当前轮次买家列表（分页）
     */
    function getCurrentRoundBuyers(uint256 offset, uint256 limit) external view returns (address[] memory);
    
    /**
     * @dev 获取买家在指定轮次的购买量
     */
    function getRoundBuyerAmount(uint256 roundId, address buyer) external view returns (uint256);
    
    /**
     * @dev 获取指定轮次买家列表（分页）
     */
    function getRoundBuyers(uint256 roundId, uint256 offset, uint256 limit) external view returns (address[] memory);
    
    /**
     * @dev 获取合约状态信息
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
    );
}