const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * @notice MiningContract 合约测试
 * @dev 测试挖矿合约的所有核心功能
 */
describe("MiningContract", function () {
    // 测试用的常量
    const INITIAL_MINING_RATIO = 100;
    const DAILY_DECAY_RATE = 99;
    const MAX_SINGLE_REWARD = ethers.parseEther("10000");
    const TEST_BET_AMOUNT = ethers.parseEther("100");
    const TEST_MLHG_SUPPLY = ethers.parseEther("1000000");

    /**
     * @notice 部署测试夹具
     */
    async function deployMiningContractFixture() {
        // 获取测试账户
        const [owner, operator, miner, player1, player2, bettingContract] = await ethers.getSigners();

        // 部署Mock MLHG代币
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mlhgToken = await MockERC20.deploy("Mock MLHG", "MLHG", TEST_MLHG_SUPPLY);
        await mlhgToken.waitForDeployment();

        // 部署挖矿合约
        const MiningContract = await ethers.getContractFactory("MiningContract");
        const miningContract = await MiningContract.deploy(
            bettingContract.address,
            await mlhgToken.getAddress()
        );
        await miningContract.waitForDeployment();

        // 向挖矿合约转入MLHG代币
        const contractAddress = await miningContract.getAddress();
        await mlhgToken.transfer(contractAddress, ethers.parseEther("100000"));

        // 设置角色权限
        await miningContract.addOperator(operator.address);
        await miningContract.addMiner(miner.address);

        return {
            miningContract,
            mlhgToken,
            owner,
            operator,
            miner,
            player1,
            player2,
            bettingContract
        };
    }

    describe("部署和初始化", function () {
        it("应该正确部署合约", async function () {
            const { miningContract, mlhgToken, owner, bettingContract } = await loadFixture(deployMiningContractFixture);

            expect(await miningContract.BETTING_CONTRACT()).to.equal(bettingContract.address);
            expect(await miningContract.MLHG_TOKEN()).to.equal(await mlhgToken.getAddress());
            expect(await miningContract.owner()).to.equal(owner.address);
        });

        it("应该正确设置初始状态", async function () {
            const { miningContract } = await loadFixture(deployMiningContractFixture);

            const stats = await miningContract.getContractStats();
            expect(stats[0]).to.equal(0); // totalMiningRecords
            expect(stats[1]).to.equal(0); // totalCompletedMining
            expect(stats[2]).to.equal(0); // totalRewardsDistributed
            expect(stats[3]).to.be.gt(0); // contractBalance
        });

        it("应该正确设置角色权限", async function () {
            const { miningContract, owner, operator, miner } = await loadFixture(deployMiningContractFixture);

            const adminRole = await miningContract.DEFAULT_ADMIN_ROLE();
            const operatorRole = await miningContract.OPERATOR_ROLE();
            const miningRole = await miningContract.MINING_ROLE();

            expect(await miningContract.hasRole(adminRole, owner.address)).to.be.true;
            expect(await miningContract.hasRole(operatorRole, operator.address)).to.be.true;
            expect(await miningContract.hasRole(miningRole, miner.address)).to.be.true;
        });

        it("应该拒绝零地址参数", async function () {
            const MiningContract = await ethers.getContractFactory("MiningContract");
            
            await expect(
                MiningContract.deploy(ethers.ZeroAddress, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(MiningContract, "InvalidAddress");
        });
    });

    describe("挖矿记录创建", function () {
        it("应该成功创建挖矿记录", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            const currentTime = await time.latest();
            const betCreatedAt = currentTime - 3600; // 1小时前
            const betSettledAt = currentTime - 1800; // 30分钟前

            await expect(
                miningContract.connect(operator).createMiningRecord(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress, // 原生代币
                    TEST_BET_AMOUNT,
                    betCreatedAt,
                    betSettledAt,
                    true, // playerChoice
                    false, // diceResult
                    false // gameResult (未中奖)
                )
            ).to.emit(miningContract, "MiningRecordCreated")
             .withArgs(
                 requestId,
                 player1.address,
                 ethers.ZeroAddress,
                 TEST_BET_AMOUNT,
                 betCreatedAt,
                 betSettledAt,
                 true,
                 false,
                 false
             );

            // 验证记录创建
            const miningInfo = await miningContract.getMiningInfo(requestId);
            expect(miningInfo.requestId).to.equal(requestId);
            expect(miningInfo.player).to.equal(player1.address);
            expect(miningInfo.originalBetAmount).to.equal(TEST_BET_AMOUNT);
            expect(miningInfo.status).to.equal(0); // Pending
        });

        it("应该拒绝中奖的投注记录", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            const currentTime = await time.latest();

            await expect(
                miningContract.connect(operator).createMiningRecord(
                    1,
                    player1.address,
                    ethers.ZeroAddress,
                    TEST_BET_AMOUNT,
                    currentTime - 3600,
                    currentTime - 1800,
                    true,
                    true,
                    true // gameResult = true (中奖)
                )
            ).to.be.revertedWithCustomError(miningContract, "InvalidGameResult");
        });

        it("应该拒绝重复的请求ID", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            const currentTime = await time.latest();
            const betCreatedAt = currentTime - 3600;
            const betSettledAt = currentTime - 1800;

            // 第一次创建
            await miningContract.connect(operator).createMiningRecord(
                requestId,
                player1.address,
                ethers.ZeroAddress,
                TEST_BET_AMOUNT,
                betCreatedAt,
                betSettledAt,
                true,
                false,
                false
            );

            // 第二次创建应该失败
            await expect(
                miningContract.connect(operator).createMiningRecord(
                    requestId,
                    player1.address,
                    ethers.ZeroAddress,
                    TEST_BET_AMOUNT,
                    betCreatedAt,
                    betSettledAt,
                    true,
                    false,
                    false
                )
            ).to.be.revertedWithCustomError(miningContract, "BetAlreadyMined");
        });

        it("应该拒绝无效的投注数据", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            const currentTime = await time.latest();

            // 测试零请求ID
            await expect(
                miningContract.connect(operator).createMiningRecord(
                    0, // 无效的requestId
                    player1.address,
                    ethers.ZeroAddress,
                    TEST_BET_AMOUNT,
                    currentTime - 3600,
                    currentTime - 1800,
                    true,
                    false,
                    false
                )
            ).to.be.revertedWithCustomError(miningContract, "InvalidBetData");

            // 测试零地址
            await expect(
                miningContract.connect(operator).createMiningRecord(
                    1,
                    ethers.ZeroAddress, // 无效的player地址
                    ethers.ZeroAddress,
                    TEST_BET_AMOUNT,
                    currentTime - 3600,
                    currentTime - 1800,
                    true,
                    false,
                    false
                )
            ).to.be.revertedWithCustomError(miningContract, "InvalidBetData");
        });

        it("应该拒绝非操作员调用", async function () {
            const { miningContract, player1 } = await loadFixture(deployMiningContractFixture);

            const currentTime = await time.latest();

            await expect(
                miningContract.connect(player1).createMiningRecord(
                    1,
                    player1.address,
                    ethers.ZeroAddress,
                    TEST_BET_AMOUNT,
                    currentTime - 3600,
                    currentTime - 1800,
                    true,
                    false,
                    false
                )
            ).to.be.reverted; // AccessControl会抛出错误
        });
    });

    describe("挖矿执行", function () {
        async function createTestMiningRecord(miningContract, operator, player, requestId = 1) {
            const currentTime = await time.latest();
            await miningContract.connect(operator).createMiningRecord(
                requestId,
                player.address,
                ethers.ZeroAddress,
                TEST_BET_AMOUNT,
                currentTime - 3600,
                currentTime - 1800,
                true,
                false,
                false
            );
        }

        it("应该成功执行挖矿", async function () {
            const { miningContract, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            await createTestMiningRecord(miningContract, operator, player1, requestId);

            await expect(
                miningContract.connect(miner).executeMining(requestId)
            ).to.emit(miningContract, "MiningCompleted");

            // 验证挖矿状态更新
            const miningInfo = await miningContract.getMiningInfo(requestId);
            expect(miningInfo.status).to.equal(1); // Completed
            expect(miningInfo.miningReward).to.be.gt(0);
            expect(miningInfo.minedAt).to.be.gt(0);
        });

        it("应该正确计算奖励金额", async function () {
            const { miningContract, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            await createTestMiningRecord(miningContract, operator, player1, requestId);

            // 计算预期奖励
            const currentTime = await time.latest();
            const expectedReward = await miningContract.calculateMiningReward(
                TEST_BET_AMOUNT,
                currentTime - 1800
            );

            await miningContract.connect(miner).executeMining(requestId);

            const miningInfo = await miningContract.getMiningInfo(requestId);
            expect(miningInfo.miningReward).to.equal(expectedReward);
        });

        it("应该更新玩家统计信息", async function () {
            const { miningContract, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            await createTestMiningRecord(miningContract, operator, player1, requestId);

            const statsBefore = await miningContract.getPlayerMiningStats(player1.address);
            expect(statsBefore[0]).to.equal(0); // totalMined
            expect(statsBefore[1]).to.equal(0); // totalRewards
            expect(statsBefore[2]).to.equal(0); // pendingRewards

            await miningContract.connect(miner).executeMining(requestId);

            const statsAfter = await miningContract.getPlayerMiningStats(player1.address);
            expect(statsAfter[0]).to.equal(1); // totalMined
            expect(statsAfter[1]).to.be.gt(0); // totalRewards
            expect(statsAfter[2]).to.be.gt(0); // pendingRewards
        });

        it("应该拒绝重复执行挖矿", async function () {
            const { miningContract, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            await createTestMiningRecord(miningContract, operator, player1, requestId);

            // 第一次执行
            await miningContract.connect(miner).executeMining(requestId);

            // 第二次执行应该失败
            await expect(
                miningContract.connect(miner).executeMining(requestId)
            ).to.be.revertedWithCustomError(miningContract, "BetAlreadyMined");
        });

        it("应该拒绝不存在的请求ID", async function () {
            const { miningContract, miner } = await loadFixture(deployMiningContractFixture);

            await expect(
                miningContract.connect(miner).executeMining(999)
            ).to.be.revertedWithCustomError(miningContract, "InvalidRequestId");
        });

        it("应该拒绝非挖矿角色调用", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            const requestId = 1;
            await createTestMiningRecord(miningContract, operator, player1, requestId);

            await expect(
                miningContract.connect(player1).executeMining(requestId)
            ).to.be.reverted; // AccessControl会抛出错误
        });
    });

    describe("奖励领取", function () {
        async function setupMiningReward(miningContract, operator, miner, player, requestId = 1) {
            await createTestMiningRecord(miningContract, operator, player, requestId);
            await miningContract.connect(miner).executeMining(requestId);
        }

        async function createTestMiningRecord(miningContract, operator, player, requestId = 1) {
            const currentTime = await time.latest();
            await miningContract.connect(operator).createMiningRecord(
                requestId,
                player.address,
                ethers.ZeroAddress,
                TEST_BET_AMOUNT,
                currentTime - 3600,
                currentTime - 1800,
                true,
                false,
                false
            );
        }

        it("应该成功领取奖励", async function () {
            const { miningContract, mlhgToken, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            await setupMiningReward(miningContract, operator, miner, player1);

            const statsBefore = await miningContract.getPlayerMiningStats(player1.address);
            const pendingRewards = statsBefore[2];
            expect(pendingRewards).to.be.gt(0);

            const balanceBefore = await mlhgToken.balanceOf(player1.address);

            await expect(
                miningContract.connect(player1).claimRewards()
            ).to.emit(miningContract, "RewardsClaimed")
             .withArgs(player1.address, pendingRewards, await time.latest() + 1);

            const balanceAfter = await mlhgToken.balanceOf(player1.address);
            expect(balanceAfter - balanceBefore).to.equal(pendingRewards);

            const statsAfter = await miningContract.getPlayerMiningStats(player1.address);
            expect(statsAfter[2]).to.equal(0); // pendingRewards应该清零
        });

        it("应该拒绝没有待领取奖励的领取", async function () {
            const { miningContract, player1 } = await loadFixture(deployMiningContractFixture);

            await expect(
                miningContract.connect(player1).claimRewards()
            ).to.be.revertedWithCustomError(miningContract, "InvalidRewardAmount");
        });
    });

    describe("奖励计算", function () {
        it("应该正确计算初始奖励", async function () {
            const { miningContract } = await loadFixture(deployMiningContractFixture);

            const currentTime = await time.latest();
            const reward = await miningContract.calculateMiningReward(TEST_BET_AMOUNT, currentTime);

            // 初始比例是1:100，所以100 ETH应该得到100 MLHG
            const expectedReward = TEST_BET_AMOUNT * BigInt(INITIAL_MINING_RATIO) / BigInt(100);
            expect(reward).to.equal(expectedReward);
        });

        it("应该正确应用时间衰减", async function () {
            const { miningContract } = await loadFixture(deployMiningContractFixture);

            const contractStartTime = await miningContract.contractStartTime();
            const oneDayLater = contractStartTime + BigInt(86400); // 1天后

            const reward = await miningContract.calculateMiningReward(TEST_BET_AMOUNT, oneDayLater);

            // 1天后比例应该是99
            const expectedReward = TEST_BET_AMOUNT * BigInt(DAILY_DECAY_RATE) / BigInt(100);
            expect(reward).to.equal(expectedReward);
        });

        it("应该应用最大奖励限制", async function () {
            const { miningContract } = await loadFixture(deployMiningContractFixture);

            const currentTime = await time.latest();
            const largeBetAmount = ethers.parseEther("100000"); // 很大的投注金额

            const reward = await miningContract.calculateMiningReward(largeBetAmount, currentTime);

            expect(reward).to.equal(MAX_SINGLE_REWARD);
        });
    });

    describe("管理功能", function () {
        it("应该允许所有者充值MLHG", async function () {
            const { miningContract, mlhgToken, owner } = await loadFixture(deployMiningContractFixture);

            const depositAmount = ethers.parseEther("1000");
            await mlhgToken.approve(await miningContract.getAddress(), depositAmount);

            const balanceBefore = await mlhgToken.balanceOf(await miningContract.getAddress());
            await miningContract.connect(owner).depositMLHG(depositAmount);
            const balanceAfter = await mlhgToken.balanceOf(await miningContract.getAddress());

            expect(balanceAfter - balanceBefore).to.equal(depositAmount);
        });

        it("应该允许所有者提取MLHG", async function () {
            const { miningContract, mlhgToken, owner } = await loadFixture(deployMiningContractFixture);

            const withdrawAmount = ethers.parseEther("1000");
            const ownerBalanceBefore = await mlhgToken.balanceOf(owner.address);

            await expect(
                miningContract.connect(owner).withdrawMLHG(withdrawAmount)
            ).to.emit(miningContract, "FundsWithdrawn")
             .withArgs(await mlhgToken.getAddress(), withdrawAmount, owner.address);

            const ownerBalanceAfter = await mlhgToken.balanceOf(owner.address);
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(withdrawAmount);
        });

        it("应该允许所有者添加和移除操作员", async function () {
            const { miningContract, owner, player1 } = await loadFixture(deployMiningContractFixture);

            const operatorRole = await miningContract.OPERATOR_ROLE();

            // 添加操作员
            await miningContract.connect(owner).addOperator(player1.address);
            expect(await miningContract.hasRole(operatorRole, player1.address)).to.be.true;

            // 移除操作员
            await miningContract.connect(owner).removeOperator(player1.address);
            expect(await miningContract.hasRole(operatorRole, player1.address)).to.be.false;
        });

        it("应该允许所有者暂停和恢复合约", async function () {
            const { miningContract, owner } = await loadFixture(deployMiningContractFixture);

            // 暂停合约
            await miningContract.connect(owner).pause();
            expect(await miningContract.paused()).to.be.true;

            // 恢复合约
            await miningContract.connect(owner).unpause();
            expect(await miningContract.paused()).to.be.false;
        });
    });

    describe("查询功能", function () {
        it("应该正确返回合约统计信息", async function () {
            const { miningContract, operator, miner, player1 } = await loadFixture(deployMiningContractFixture);

            // 创建并执行一个挖矿记录
            await createTestMiningRecord(miningContract, operator, player1, 1);
            await miningContract.connect(miner).executeMining(1);

            const stats = await miningContract.getContractStats();
            expect(stats[0]).to.equal(1); // totalMiningRecords
            expect(stats[1]).to.equal(1); // totalCompletedMining
            expect(stats[2]).to.be.gt(0); // totalRewardsDistributed
            expect(stats[3]).to.be.gt(0); // contractBalance
        });

        it("应该正确返回玩家挖矿历史", async function () {
            const { miningContract, operator, player1 } = await loadFixture(deployMiningContractFixture);

            await createTestMiningRecord(miningContract, operator, player1, 1);
            await createTestMiningRecord(miningContract, operator, player1, 2);

            const history = await miningContract.getPlayerMiningHistory(player1.address);
            expect(history.length).to.equal(2);
            expect(history[0]).to.equal(1);
            expect(history[1]).to.equal(2);
        });

        it("应该正确返回当前挖矿比例", async function () {
            const { miningContract } = await loadFixture(deployMiningContractFixture);

            const currentRatio = await miningContract.getCurrentMiningRatio();
            expect(currentRatio).to.equal(INITIAL_MINING_RATIO);
        });

        async function createTestMiningRecord(miningContract, operator, player, requestId = 1) {
            const currentTime = await time.latest();
            await miningContract.connect(operator).createMiningRecord(
                requestId,
                player.address,
                ethers.ZeroAddress,
                TEST_BET_AMOUNT,
                currentTime - 3600,
                currentTime - 1800,
                true,
                false,
                false
            );
        }
    });
});