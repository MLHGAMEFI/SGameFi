// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title MockDiceGame
 * @notice 用于测试的模拟DiceGame合约
 */
contract MockDiceGame {
    // 事件定义
    event DiceRollRequested(
        uint256 indexed requestId,
        address indexed player,
        uint8 numberSides,
        uint8 numDice
    );

    event DiceRollResult(
        uint256 indexed requestId,
        address indexed player,
        uint8[] results,
        bool isEven,
        uint256 fulfillmentTime
    );

    // 请求计数器
    uint256 private requestCounter = 1;

    // 存储请求信息
    mapping(uint256 => address) public requestToPlayer;
    mapping(uint256 => address) public requestToCallback;

    /**
     * @notice 模拟掷骰子请求
     * @param numDice 骰子数量
     * @param numberSides 骰子面数
     * @param callback 回调合约地址
     * @return requestId 请求ID
     */
    function rollDice(
        uint8 numDice,
        uint8 numberSides,
        address callback
    ) external payable returns (uint256 requestId) {
        requestId = requestCounter++;
        
        requestToPlayer[requestId] = msg.sender;
        requestToCallback[requestId] = callback;

        emit DiceRollRequested(requestId, msg.sender, numberSides, numDice);
        
        return requestId;
    }

    /**
     * @notice 模拟VRF回调，用于测试
     * @param callbackContract 回调合约地址
     * @param requestId 请求ID
     * @param results 骰子结果
     * @param isEven 是否为双数
     */
    function simulateCallback(
        address callbackContract,
        uint256 requestId,
        uint8[] calldata results,
        bool isEven
    ) external {
        // 调用回调合约
        (bool success, ) = callbackContract.call(
            abi.encodeWithSignature(
                "onDiceRollResult(uint256,uint8[],bool)",
                requestId,
                results,
                isEven
            )
        );
        require(success, "Callback failed");

        // 触发结果事件
        emit DiceRollResult(
            requestId,
            requestToPlayer[requestId],
            results,
            isEven,
            block.timestamp
        );
    }

    /**
     * @notice 检查请求状态
     * @param requestId 请求ID
     * @return exists 是否存在
     * @return fulfilled 是否已履行
     * @return results 结果
     */
    function checkRollStatus(
        uint256 requestId
    ) external view returns (
        bool exists,
        bool fulfilled,
        uint8[] memory results
    ) {
        exists = requestToPlayer[requestId] != address(0);
        fulfilled = false; // 在模拟中，我们不跟踪履行状态
        results = new uint8[](0);
    }

    /**
     * @notice 获取VRF协调器地址（模拟）
     * @return 模拟的协调器地址
     */
    function getVRFCoordinator() external view returns (address) {
        return address(this);
    }

    /**
     * @notice 接收原生代币
     */
    receive() external payable {}

    /**
     * @notice 回退函数
     */
    fallback() external payable {}
}