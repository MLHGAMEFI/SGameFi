const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("PayoutContract", function () {
    // 部署fixture
    async function deployPayoutContractFixture() {
        const [owner, player1, player2, operator, auditor] = await ethers.getSigners();

        // 部署Mock代币
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mlhToken = await MockERC20.deploy("MLH Token", "MLH");
        const mlhgToken = await MockERC20.deploy("MLHG Token", "MLHG");

        // 部署Mock BettingContract（用于测试）
        const mockBettingContract = owner.address; // 简化测试，使用owner地址作为mock

        // 部署PayoutContract
        const PayoutContract = await ethers.getContractFactory("PayoutContract");
        const payoutContract = await PayoutContract.deploy(
            mockBettingContract,
            await mlhToken.getAddress(),
            await mlhgToken.getAddress(),
            owner.address
        );

        // 设置角色
        const OPERATOR_ROLE = await payoutContract.OPERATOR_ROLE();
        const AUDITOR_ROLE = await payoutContract.AUDITOR_ROLE();
        
        await payoutContract.grantRole(OPERATOR_ROLE, operator.address);
        await payoutContract.grantRole(AUDITOR_ROLE, auditor.address);

        // 铸造代币给owner用于充值
        await mlhToken.mint(owner.address, ethers.parseEther("10000"));
        await mlhgToken.mint(owner.address, ethers.parseEther("10000"));

        return {
            payoutContract,
            mlhToken,
            mlhgToken,
            owner,
            player1,
            player2,
            operator,
            auditor,
            mockBettingContract
        };
    }

    describe("部署和初始化", function () {
        it("应该正确设置初始参数", async function () {
            const { payoutContract, mlhToken, mlhgToken, owner, mockBettingContract } = await loadFixture(deployPayoutContractFixture);

            expect(await payoutContract.bettingContract()).to.equal(mockBettingContract);
            expect(await payoutContract.MLH_TOKEN()).to.equal(await mlhToken.getAddress());
            expect(await payoutContract.MLHG_TOKEN()).to.equal(await mlhgToken.getAddress());

            // 检查角色设置
            const ADMIN_ROLE = await payoutContract.ADMIN_ROLE();
            expect(await payoutContract.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("应该拒绝零地址参数", async function () {
            const PayoutContract = await ethers.getContractFactory("PayoutContract");
            
            await expect(
                PayoutContract.deploy(
                    ethers.ZeroAddress, // 无效的betting contract地址
                    ethers.ZeroAddress,
                    ethers.ZeroAddress,
                    ethers.ZeroAddress
                )
            ).to.be.revertedWith("Invalid betting contract address");
        });
    });

    describe("资金管理", function () {
        it("应该允许管理员充值原生代币", async function () {
            const { payoutContract, owner } = await loadFixture(deployPayoutContractFixture);

            const depositAmount = ethers.parseEther("10");
            
            await expect(
                payoutContract.depositFunds(ethers.ZeroAddress, depositAmount, { value: depositAmount })
            ).to.emit(payoutContract, "FundsDeposited")
             .withArgs(ethers.ZeroAddress, depositAmount, owner.address);

            const balance = await payoutContract.getContractBalance(ethers.ZeroAddress);
            expect(balance).to.equal(depositAmount);
        });

        it("应该允许管理员充值ERC20代币", async function () {
            const { payoutContract, mlhToken, owner } = await loadFixture(deployPayoutContractFixture);

            const depositAmount = ethers.parseEther("1000");
            
            // 授权
            await mlhToken.approve(await payoutContract.getAddress(), depositAmount);
            
            await expect(
                payoutContract.depositFunds(await mlhToken.getAddress(), depositAmount)
            ).to.emit(payoutContract, "FundsDeposited")
             .withArgs(await mlhToken.getAddress(), depositAmount, owner.address);

            const balance = await payoutContract.getContractBalance(await mlhToken.getAddress());
            expect(balance).to.equal(depositAmount);
        });

        it("应该允许管理员提取资金", async function () {
            const { payoutContract, owner } = await loadFixture(deployPayoutContractFixture);

            const depositAmount = ethers.parseEther("10");
            const withdrawAmount = ethers.parseEther("5");
            
            // 先充值
            await payoutContract.depositFunds(ethers.ZeroAddress, depositAmount, { value: depositAmount });
            
            // 提取
            await expect(
                payoutContract.withdrawFunds(ethers.ZeroAddress, withdrawAmount, owner.address)
            ).to.emit(payoutContract, "FundsWithdrawn")
             .withArgs(ethers.ZeroAddress, withdrawAmount, owner.address);

            const balance = await payoutContract.getContractBalance(ethers.ZeroAddress);
            expect(balance).to.equal(depositAmount - withdrawAmount);
        });

        it("应该拒绝非管理员充值", async function () {
            const { payoutContract, player1 } = await loadFixture(deployPayoutContractFixture);

            const depositAmount = ethers.parseEther("10");
            
            await expect(
                payoutContract.connect(player1).depositFunds(ethers.ZeroAddress, depositAmount, { value: depositAmount })
            ).to.be.reverted;
        });
    });

    describe("派奖请求管理", function () {
        it("应该允许操作员提交有效的派奖请求", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19"); // 1.9倍赔率
            const createdAt = await time.latest();
            const settledAt = createdAt + 60; // 1分钟后结算
            
            // 设置时间到结算后
            await time.increaseTo(settledAt + 120); // 结算后2分钟

            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress, // 原生代币
                    payoutAmount,
                    betAmount,
                    createdAt,
                    settledAt,
                    true,  // playerChoice
                    true,  // diceResult
                    true   // isWinner
                )
            ).to.emit(payoutContract, "PayoutRequested")
             .withArgs(requestId, player1.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt);

            const payoutInfo = await payoutContract.getPayoutInfo(requestId);
            expect(payoutInfo.requestId).to.equal(requestId);
            expect(payoutInfo.player).to.equal(player1.address);
            expect(payoutInfo.payoutAmount).to.equal(payoutAmount);
            expect(payoutInfo.status).to.equal(0); // Pending
        });

        it("应该拒绝无效的派奖请求", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 测试非中奖投注
            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress,
                    payoutAmount,
                    betAmount,
                    createdAt,
                    settledAt,
                    true,  // playerChoice
                    false, // diceResult
                    false  // isWinner - 非中奖
                )
            ).to.be.revertedWithCustomError(payoutContract, "NotWinningBet");

            // 测试错误的派奖金额
            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress,
                    ethers.parseEther("20"), // 错误的金额
                    betAmount,
                    createdAt,
                    settledAt,
                    true,
                    true,
                    true
                )
            ).to.be.revertedWithCustomError(payoutContract, "PayoutAmountMismatch");
        });

        it("应该拒绝重复的请求ID", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 第一次提交
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                player1.address,
                ethers.ZeroAddress,
                payoutAmount,
                betAmount,
                createdAt,
                settledAt,
                true, true, true
            );

            // 第二次提交相同的requestId
            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress,
                    payoutAmount,
                    betAmount,
                    createdAt,
                    settledAt,
                    true, true, true
                )
            ).to.be.revertedWithCustomError(payoutContract, "PayoutAlreadyProcessed");
        });
    });

    describe("派奖执行", function () {
        it("应该成功执行派奖", async function () {
            const { payoutContract, player1, operator, owner } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            // 充值合约
            await payoutContract.depositFunds(ethers.ZeroAddress, ethers.parseEther("100"), { value: ethers.parseEther("100") });
            
            await time.increaseTo(settledAt + 120);

            // 提交派奖请求
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                player1.address,
                ethers.ZeroAddress,
                payoutAmount,
                betAmount,
                createdAt,
                settledAt,
                true, true, true
            );

            // 记录玩家初始余额
            const initialBalance = await ethers.provider.getBalance(player1.address);

            // 执行派奖
            await expect(
                payoutContract.connect(operator).executePayout(requestId)
            ).to.emit(payoutContract, "PayoutCompleted")
             .withArgs(requestId, player1.address, ethers.ZeroAddress, payoutAmount, await time.latest() + 1);

            // 检查玩家余额增加
            const finalBalance = await ethers.provider.getBalance(player1.address);
            expect(finalBalance - initialBalance).to.equal(payoutAmount);

            // 检查派奖状态
            const payoutInfo = await payoutContract.getPayoutInfo(requestId);
            expect(payoutInfo.status).to.equal(1); // Completed
        });

        it("应该处理余额不足的情况", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 提交派奖请求（不充值合约）
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                player1.address,
                ethers.ZeroAddress,
                payoutAmount,
                betAmount,
                createdAt,
                settledAt,
                true, true, true
            );

            // 执行派奖应该失败
            await expect(
                payoutContract.connect(operator).executePayout(requestId)
            ).to.emit(payoutContract, "PayoutFailed")
             .withArgs(requestId, player1.address, "Insufficient contract balance");

            // 检查派奖状态
            const payoutInfo = await payoutContract.getPayoutInfo(requestId);
            expect(payoutInfo.status).to.equal(2); // Failed
        });

        it("应该处理过期的派奖请求", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 提交派奖请求
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId,
                player1.address,
                ethers.ZeroAddress,
                payoutAmount,
                betAmount,
                createdAt,
                settledAt,
                true, true, true
            );

            // 等待超过派奖时间窗口（30天）
            await time.increase(31 * 24 * 60 * 60); // 31天

            // 执行派奖应该标记为过期
            await expect(
                payoutContract.connect(operator).executePayout(requestId)
            ).to.emit(payoutContract, "PayoutFailed")
             .withArgs(requestId, player1.address, "Payout window expired");

            // 检查派奖状态
            const payoutInfo = await payoutContract.getPayoutInfo(requestId);
            expect(payoutInfo.status).to.equal(3); // Expired
        });
    });

    describe("批量操作", function () {
        it("应该支持批量执行派奖", async function () {
            const { payoutContract, player1, player2, operator } = await loadFixture(deployPayoutContractFixture);

            // 充值合约
            await payoutContract.depositFunds(ethers.ZeroAddress, ethers.parseEther("100"), { value: ethers.parseEther("100") });

            const requestIds = [12345, 12346];
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 提交多个派奖请求
            await payoutContract.connect(operator).submitPayoutRequest(
                requestIds[0], player1.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt, true, true, true
            );
            await payoutContract.connect(operator).submitPayoutRequest(
                requestIds[1], player2.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt, true, true, true
            );

            // 批量执行派奖
            await payoutContract.connect(operator).batchExecutePayout(requestIds);

            // 检查两个派奖都成功
            const payout1 = await payoutContract.getPayoutInfo(requestIds[0]);
            const payout2 = await payoutContract.getPayoutInfo(requestIds[1]);
            
            expect(payout1.status).to.equal(1); // Completed
            expect(payout2.status).to.equal(1); // Completed
        });

        it("应该支持批量查询派奖信息", async function () {
            const { payoutContract, player1, player2, operator } = await loadFixture(deployPayoutContractFixture);

            const requestIds = [12345, 12346];
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 提交派奖请求
            await payoutContract.connect(operator).submitPayoutRequest(
                requestIds[0], player1.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt, true, true, true
            );
            await payoutContract.connect(operator).submitPayoutRequest(
                requestIds[1], player2.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt, true, true, true
            );

            // 批量查询
            const payoutInfos = await payoutContract.getBatchPayoutInfo(requestIds);
            
            expect(payoutInfos.length).to.equal(2);
            expect(payoutInfos[0].requestId).to.equal(requestIds[0]);
            expect(payoutInfos[1].requestId).to.equal(requestIds[1]);
            expect(payoutInfos[0].player).to.equal(player1.address);
            expect(payoutInfos[1].player).to.equal(player2.address);
        });
    });

    describe("权限控制", function () {
        it("应该拒绝非操作员提交派奖请求", async function () {
            const { payoutContract, player1 } = await loadFixture(deployPayoutContractFixture);

            await expect(
                payoutContract.connect(player1).submitPayoutRequest(
                    12345, player1.address, ethers.ZeroAddress, ethers.parseEther("19"), ethers.parseEther("10"),
                    await time.latest(), await time.latest() + 60, true, true, true
                )
            ).to.be.reverted;
        });

        it("应该拒绝非操作员执行派奖", async function () {
            const { payoutContract, player1 } = await loadFixture(deployPayoutContractFixture);

            await expect(
                payoutContract.connect(player1).executePayout(12345)
            ).to.be.reverted;
        });
    });

    describe("暂停功能", function () {
        it("应该允许管理员暂停和恢复合约", async function () {
            const { payoutContract, owner } = await loadFixture(deployPayoutContractFixture);

            // 暂停合约
            await payoutContract.pause();
            expect(await payoutContract.paused()).to.be.true;

            // 恢复合约
            await payoutContract.unpause();
            expect(await payoutContract.paused()).to.be.false;
        });

        it("暂停时应该拒绝派奖操作", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            // 暂停合约
            await payoutContract.pause();

            // 尝试提交派奖请求应该失败
            await expect(
                payoutContract.connect(operator).submitPayoutRequest(
                    12345, player1.address, ethers.ZeroAddress, ethers.parseEther("19"), ethers.parseEther("10"),
                    await time.latest(), await time.latest() + 60, true, true, true
                )
            ).to.be.revertedWith("Pausable: paused");
        });
    });

    describe("统计信息", function () {
        it("应该正确跟踪统计信息", async function () {
            const { payoutContract, player1, operator } = await loadFixture(deployPayoutContractFixture);

            // 充值合约
            await payoutContract.depositFunds(ethers.ZeroAddress, ethers.parseEther("100"), { value: ethers.parseEther("100") });

            const requestId = 12345;
            const betAmount = ethers.parseEther("10");
            const payoutAmount = ethers.parseEther("19");
            const createdAt = await time.latest();
            const settledAt = createdAt + 60;
            
            await time.increaseTo(settledAt + 120);

            // 提交并执行派奖
            await payoutContract.connect(operator).submitPayoutRequest(
                requestId, player1.address, ethers.ZeroAddress, payoutAmount, betAmount, createdAt, settledAt, true, true, true
            );
            await payoutContract.connect(operator).executePayout(requestId);

            // 检查统计信息
            const stats = await payoutContract.getContractStats();
            expect(stats[0]).to.equal(1); // totalPayouts
            expect(stats[1]).to.equal(1); // successfulPayouts
            expect(stats[2]).to.equal(0); // failedPayouts
            expect(stats[3]).to.equal(payoutAmount); // totalPayoutAmount
        });
    });
});