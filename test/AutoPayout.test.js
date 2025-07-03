const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * @title 自动派奖系统测试
 * @notice 测试自动派奖服务的核心功能
 */
describe("AutoPayout System", function () {
    let bettingContract;
    let payoutContract;
    let mlhToken;
    let mlhgToken;
    let vrfCoordinator;
    let owner;
    let player1;
    let player2;
    let operator;
    
    const INITIAL_SUPPLY = ethers.parseEther("1000000");
    const FUND_AMOUNT = ethers.parseEther("1000");
    const BET_AMOUNT = ethers.parseEther("10");
    
    beforeEach(async function () {
        [owner, player1, player2, operator] = await ethers.getSigners();
        
        // 部署 MLH Token
        const MLHToken = await ethers.getContractFactory("MLHToken");
        mlhToken = await MLHToken.deploy(INITIAL_SUPPLY);
        await mlhToken.waitForDeployment();
        
        // 部署 MLHG Token
        const MLHGToken = await ethers.getContractFactory("MLHGToken");
        mlhgToken = await MLHGToken.deploy(INITIAL_SUPPLY);
        await mlhgToken.waitForDeployment();
        
        // 部署 Mock VRF Coordinator
        const MockVRFCoordinator = await ethers.getContractFactory("MockVRFCoordinator");
        vrfCoordinator = await MockVRFCoordinator.deploy();
        await vrfCoordinator.waitForDeployment();
        
        // 部署 BettingContract
        const BettingContract = await ethers.getContractFactory("BettingContract");
        bettingContract = await BettingContract.deploy(
            await vrfCoordinator.getAddress(),
            "0x1234567890123456789012345678901234567890123456789012345678901234", // keyHash
            1, // subscriptionId
            await mlhToken.getAddress(),
            await mlhgToken.getAddress()
        );
        await bettingContract.waitForDeployment();
        
        // 部署 PayoutContract
        const PayoutContract = await ethers.getContractFactory("PayoutContract");
        payoutContract = await PayoutContract.deploy(
            await bettingContract.getAddress(),
            await mlhToken.getAddress(),
            await mlhgToken.getAddress(),
            owner.address
        );
        await payoutContract.waitForDeployment();
        
        // 授予操作员权限
        const OPERATOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("OPERATOR_ROLE"));
        await payoutContract.grantRole(OPERATOR_ROLE, operator.address);
        
        // 为 PayoutContract 充值
        await owner.sendTransaction({
            to: await payoutContract.getAddress(),
            value: FUND_AMOUNT
        });
        
        await mlhToken.transfer(await payoutContract.getAddress(), FUND_AMOUNT);
        await mlhgToken.transfer(await payoutContract.getAddress(), FUND_AMOUNT);
        
        // 为玩家分发代币
        await mlhToken.transfer(player1.address, ethers.parseEther("100"));
        await mlhgToken.transfer(player1.address, ethers.parseEther("100"));
        await mlhToken.transfer(player2.address, ethers.parseEther("100"));
        await mlhgToken.transfer(player2.address, ethers.parseEther("100"));
        
        // 玩家授权
        await mlhToken.connect(player1).approve(await bettingContract.getAddress(), ethers.parseEther("100"));
        await mlhgToken.connect(player1).approve(await bettingContract.getAddress(), ethers.parseEther("100"));
        await mlhToken.connect(player2).approve(await bettingContract.getAddress(), ethers.parseEther("100"));
        await mlhgToken.connect(player2).approve(await bettingContract.getAddress(), ethers.parseEther("100"));
    });
    
    describe("自动派奖流程测试", function () {
        it("应该能够监听BetSettled事件并自动派奖", async function () {
            // 模拟自动派奖服务的事件监听
            let betSettledEvent = null;
            
            // 监听BetSettled事件
            bettingContract.on("BetSettled", async (
                requestId,
                player,
                betAmount,
                payoutAmount,
                playerChoice,
                diceResult,
                isWinner
            ) => {
                betSettledEvent = {
                    requestId,
                    player,
                    betAmount,
                    payoutAmount,
                    playerChoice,
                    diceResult,
                    isWinner
                };
            });
            
            // 玩家下注（原生代币）
            const betTx = await bettingContract.connect(player1).placeBet(
                ethers.ZeroAddress, // 原生代币
                true, // 选择双数
                { value: BET_AMOUNT }
            );
            const betReceipt = await betTx.wait();
            
            // 获取请求ID
            const betPlacedEvent = betReceipt.logs.find(
                log => log.fragment && log.fragment.name === "BetPlaced"
            );
            const requestId = betPlacedEvent.args.requestId;
            
            // 模拟VRF回调（设置为中奖）
            await vrfCoordinator.fulfillRandomWords(
                requestId,
                await bettingContract.getAddress(),
                [2] // 偶数，玩家中奖
            );
            
            // 等待事件处理
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 验证事件被触发
            expect(betSettledEvent).to.not.be.null;
            expect(betSettledEvent.isWinner).to.be.true;
            expect(betSettledEvent.player).to.equal(player1.address);
            
            // 模拟自动派奖服务的处理逻辑
            if (betSettledEvent.isWinner) {
                // 获取投注详情
                const betInfo = await bettingContract.getBetInfo(requestId);
                
                // 步骤1: 提交派奖请求
                await payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    betInfo.player,
                    betInfo.tokenAddress,
                    betInfo.payoutAmount,
                    betInfo.betAmount,
                    betInfo.createdAt,
                    betInfo.settledAt,
                    betInfo.playerChoice,
                    betInfo.diceResult,
                    betInfo.isWinner
                );
                
                // 等待最小结算时间
                await time.increase(61); // 61秒
                
                // 步骤2: 执行派奖
                const playerBalanceBefore = await ethers.provider.getBalance(player1.address);
                
                await payoutContract.connect(operator).executePayout(requestId);
                
                const playerBalanceAfter = await ethers.provider.getBalance(player1.address);
                
                // 验证派奖成功
                expect(playerBalanceAfter - playerBalanceBefore).to.equal(betInfo.payoutAmount);
                
                // 验证派奖状态
                const payoutInfo = await payoutContract.getPayoutInfo(requestId);
                expect(payoutInfo.status).to.equal(1); // Completed
            }
            
            // 清理事件监听器
            bettingContract.removeAllListeners("BetSettled");
        });
        
        it("应该能够处理ERC20代币的自动派奖", async function () {
            let betSettledEvent = null;
            
            // 监听BetSettled事件
            bettingContract.on("BetSettled", async (
                requestId,
                player,
                betAmount,
                payoutAmount,
                playerChoice,
                diceResult,
                isWinner
            ) => {
                betSettledEvent = {
                    requestId,
                    player,
                    betAmount,
                    payoutAmount,
                    playerChoice,
                    diceResult,
                    isWinner
                };
            });
            
            // 玩家下注（MLH代币）
            const betTx = await bettingContract.connect(player1).placeBet(
                await mlhToken.getAddress(),
                false, // 选择单数
                BET_AMOUNT
            );
            const betReceipt = await betTx.wait();
            
            // 获取请求ID
            const betPlacedEvent = betReceipt.logs.find(
                log => log.fragment && log.fragment.name === "BetPlaced"
            );
            const requestId = betPlacedEvent.args.requestId;
            
            // 模拟VRF回调（设置为中奖）
            await vrfCoordinator.fulfillRandomWords(
                requestId,
                await bettingContract.getAddress(),
                [1] // 奇数，玩家中奖
            );
            
            // 等待事件处理
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 验证事件
            expect(betSettledEvent).to.not.be.null;
            expect(betSettledEvent.isWinner).to.be.true;
            
            // 自动派奖处理
            if (betSettledEvent.isWinner) {
                const betInfo = await bettingContract.getBetInfo(requestId);
                
                // 提交派奖请求
                await payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    betInfo.player,
                    betInfo.tokenAddress,
                    betInfo.payoutAmount,
                    betInfo.betAmount,
                    betInfo.createdAt,
                    betInfo.settledAt,
                    betInfo.playerChoice,
                    betInfo.diceResult,
                    betInfo.isWinner
                );
                
                // 等待最小结算时间
                await time.increase(61);
                
                // 执行派奖
                const playerBalanceBefore = await mlhToken.balanceOf(player1.address);
                
                await payoutContract.connect(operator).executePayout(requestId);
                
                const playerBalanceAfter = await mlhToken.balanceOf(player1.address);
                
                // 验证派奖成功
                expect(playerBalanceAfter - playerBalanceBefore).to.equal(betInfo.payoutAmount);
            }
            
            bettingContract.removeAllListeners("BetSettled");
        });
        
        it("应该能够处理未中奖的情况", async function () {
            let betSettledEvent = null;
            
            bettingContract.on("BetSettled", async (
                requestId,
                player,
                betAmount,
                payoutAmount,
                playerChoice,
                diceResult,
                isWinner
            ) => {
                betSettledEvent = {
                    requestId,
                    player,
                    betAmount,
                    payoutAmount,
                    playerChoice,
                    diceResult,
                    isWinner
                };
            });
            
            // 玩家下注
            const betTx = await bettingContract.connect(player1).placeBet(
                ethers.ZeroAddress,
                true, // 选择双数
                { value: BET_AMOUNT }
            );
            const betReceipt = await betTx.wait();
            
            const betPlacedEvent = betReceipt.logs.find(
                log => log.fragment && log.fragment.name === "BetPlaced"
            );
            const requestId = betPlacedEvent.args.requestId;
            
            // 模拟VRF回调（设置为未中奖）
            await vrfCoordinator.fulfillRandomWords(
                requestId,
                await bettingContract.getAddress(),
                [1] // 奇数，玩家未中奖
            );
            
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // 验证事件
            expect(betSettledEvent).to.not.be.null;
            expect(betSettledEvent.isWinner).to.be.false;
            
            // 自动派奖服务应该跳过未中奖的投注
            if (!betSettledEvent.isWinner) {
                // 验证没有派奖请求被提交
                await expect(
                    payoutContract.getPayoutInfo(requestId)
                ).to.be.revertedWith("派奖请求不存在");
            }
            
            bettingContract.removeAllListeners("BetSettled");
        });
    });
    
    describe("批量派奖测试", function () {
        it("应该能够批量处理多个派奖请求", async function () {
            const requestIds = [];
            const players = [player1, player2];
            
            // 创建多个中奖投注
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                
                const betTx = await bettingContract.connect(player).placeBet(
                    ethers.ZeroAddress,
                    true,
                    { value: BET_AMOUNT }
                );
                const betReceipt = await betTx.wait();
                
                const betPlacedEvent = betReceipt.logs.find(
                    log => log.fragment && log.fragment.name === "BetPlaced"
                );
                const requestId = betPlacedEvent.args.requestId;
                requestIds.push(requestId);
                
                // 模拟中奖
                await vrfCoordinator.fulfillRandomWords(
                    requestId,
                    await bettingContract.getAddress(),
                    [2] // 偶数，中奖
                );
                
                // 提交派奖请求
                const betInfo = await bettingContract.getBetInfo(requestId);
                await payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    betInfo.player,
                    betInfo.tokenAddress,
                    betInfo.payoutAmount,
                    betInfo.betAmount,
                    betInfo.createdAt,
                    betInfo.settledAt,
                    betInfo.playerChoice,
                    betInfo.diceResult,
                    betInfo.isWinner
                );
            }
            
            // 等待最小结算时间
            await time.increase(61);
            
            // 记录玩家余额
            const balancesBefore = [];
            for (const player of players) {
                balancesBefore.push(await ethers.provider.getBalance(player.address));
            }
            
            // 批量执行派奖
            await payoutContract.connect(operator).batchExecutePayout(requestIds);
            
            // 验证所有派奖都成功
            for (let i = 0; i < requestIds.length; i++) {
                const requestId = requestIds[i];
                const player = players[i];
                
                const payoutInfo = await payoutContract.getPayoutInfo(requestId);
                expect(payoutInfo.status).to.equal(1); // Completed
                
                const balanceAfter = await ethers.provider.getBalance(player.address);
                expect(balanceAfter).to.be.gt(balancesBefore[i]);
            }
        });
    });
    
    describe("错误处理测试", function () {
        it("应该能够处理余额不足的情况", async function () {
            // 清空合约余额
            const contractBalance = await ethers.provider.getBalance(await payoutContract.getAddress());
            await payoutContract.connect(owner).withdrawFunds(
                ethers.ZeroAddress,
                contractBalance,
                owner.address
            );
            
            // 玩家下注并中奖
            const betTx = await bettingContract.connect(player1).placeBet(
                ethers.ZeroAddress,
                true,
                { value: BET_AMOUNT }
            );
            const betReceipt = await betTx.wait();
            
            const betPlacedEvent = betReceipt.logs.find(
                log => log.fragment && log.fragment.name === "BetPlaced"
            );
            const requestId = betPlacedEvent.args.requestId;
            
            await vrfCoordinator.fulfillRandomWords(
                requestId,
                await bettingContract.getAddress(),
                [2]
            );
            
            // 提交派奖请求
            const betInfo = await bettingContract.getBetInfo(requestId);
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                betInfo.player,
                betInfo.tokenAddress,
                betInfo.payoutAmount,
                betInfo.betAmount,
                betInfo.createdAt,
                betInfo.settledAt,
                betInfo.playerChoice,
                betInfo.diceResult,
                betInfo.isWinner
            );
            
            await time.increase(61);
            
            // 执行派奖应该失败
            await payoutContract.connect(operator).executePayout(requestId);
            
            // 验证派奖状态为失败
            const payoutInfo = await payoutContract.getPayoutInfo(requestId);
            expect(payoutInfo.status).to.equal(2); // Failed
        });
        
        it("应该能够处理重复请求", async function () {
            // 玩家下注并中奖
            const betTx = await bettingContract.connect(player1).placeBet(
                ethers.ZeroAddress,
                true,
                { value: BET_AMOUNT }
            );
            const betReceipt = await betTx.wait();
            
            const betPlacedEvent = betReceipt.logs.find(
                log => log.fragment && log.fragment.name === "BetPlaced"
            );
            const requestId = betPlacedEvent.args.requestId;
            
            await vrfCoordinator.fulfillRandomWords(
                requestId,
                await bettingContract.getAddress(),
                [2]
            );
            
            // 第一次提交派奖请求
            const betInfo = await bettingContract.getBetInfo(requestId);
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                betInfo.player,
                betInfo.tokenAddress,
                betInfo.payoutAmount,
                betInfo.betAmount,
                betInfo.createdAt,
                betInfo.settledAt,
                betInfo.playerChoice,
                betInfo.diceResult,
                betInfo.isWinner
            );
            
            // 第二次提交应该失败
            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    betInfo.player,
                    betInfo.tokenAddress,
                    betInfo.payoutAmount,
                    betInfo.betAmount,
                    betInfo.createdAt,
                    betInfo.settledAt,
                    betInfo.playerChoice,
                    betInfo.diceResult,
                    betInfo.isWinner
                )
            ).to.be.revertedWith("派奖请求已存在");
        });
    });
    
    describe("权限测试", function () {
        it("应该只允许操作员执行派奖操作", async function () {
            // 非操作员尝试提交派奖请求
            await expect(
                payoutContract.connect(player1).submitPayoutRequest(
                    1,
                    player1.address,
                    ethers.ZeroAddress,
                    BET_AMOUNT,
                    BET_AMOUNT,
                    Math.floor(Date.now() / 1000),
                    Math.floor(Date.now() / 1000),
                    true,
                    true,
                    true
                )
            ).to.be.reverted;
            
            // 非操作员尝试执行派奖
            await expect(
                payoutContract.connect(player1).executePayout(1)
            ).to.be.reverted;
        });
    });
});