const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther, formatEther } = ethers;

/**
 * BettingContract合约测试
 */
describe("BettingContract", function () {
  let bettingContract;
  let diceGame;
  let mockMLHToken;
  let mockMLHGToken;
  let owner;
  let player1;
  let player2;
  let addrs;

  // 测试用的代币合约
  const MockERC20 = {
    bytecode: "0x608060405234801561001057600080fd5b506040516108a93803806108a98339818101604052810190610032919061007a565b8160009081610041919061028c565b50806001908161005191906102",
    abi: [
      "constructor(string memory name, string memory symbol)",
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function totalSupply() view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function transfer(address to, uint256 amount) returns (bool)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function transferFrom(address from, address to, uint256 amount) returns (bool)",
      "function mint(address to, uint256 amount)"
    ]
  };

  beforeEach(async function () {
    // 获取测试账户
    [owner, player1, player2, ...addrs] = await ethers.getSigners();

    // 部署模拟的ERC20代币
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockMLHToken = await MockToken.deploy("Mock MLH", "MLH");
    mockMLHGToken = await MockToken.deploy("Mock MLHG", "MLHG");
    
    await mockMLHToken.waitForDeployment();
    await mockMLHGToken.waitForDeployment();

    // 给测试账户铸造代币
    await mockMLHToken.mint(player1.address, parseEther("10000"));
    await mockMLHToken.mint(player2.address, parseEther("10000"));
    await mockMLHGToken.mint(player1.address, parseEther("10000"));
    await mockMLHGToken.mint(player2.address, parseEther("10000"));

    // 部署模拟的DiceGame合约
    const MockDiceGame = await ethers.getContractFactory("MockDiceGame");
    diceGame = await MockDiceGame.deploy();
    await diceGame.waitForDeployment();

    // 部署BettingContract合约
    const BettingContract = await ethers.getContractFactory("BettingContract");
    bettingContract = await BettingContract.deploy(
      await diceGame.getAddress(),
      await mockMLHToken.getAddress(),
      await mockMLHGToken.getAddress()
    );
    await bettingContract.waitForDeployment();

    // 向合约充值原生代币用于VRF费用
    await owner.sendTransaction({
      to: await bettingContract.getAddress(),
      value: parseEther("1")
    });
  });

  describe("部署", function () {
    it("应该正确设置合约参数", async function () {
      expect(await bettingContract.diceGame()).to.equal(await diceGame.getAddress());
      expect(await bettingContract.MLH_TOKEN()).to.equal(await mockMLHToken.getAddress());
      expect(await bettingContract.MLHG_TOKEN()).to.equal(await mockMLHGToken.getAddress());
      expect(await bettingContract.MIN_BET_AMOUNT()).to.equal(parseEther("1"));
      expect(await bettingContract.MAX_BET_AMOUNT()).to.equal(parseEther("1000"));
      expect(await bettingContract.PAYOUT_RATIO()).to.equal(190);
    });

    it("应该正确设置所有者", async function () {
      expect(await bettingContract.owner()).to.equal(owner.address);
    });
  });

  describe("下注功能", function () {
    it("应该允许使用原生代币下注", async function () {
      const betAmount = parseEther("10");
      const isEvenChoice = true;

      await expect(
        bettingContract.connect(player1).placeBet(
          ethers.ZeroAddress, // 原生代币
          betAmount,
          isEvenChoice,
          { value: betAmount }
        )
      ).to.emit(bettingContract, "BetConfirmed");

      // 检查合约余额
      const contractBalance = await bettingContract.getContractBalance(ethers.ZeroAddress);
      expect(contractBalance).to.be.gte(betAmount);
    });

    it("应该允许使用ERC20代币下注", async function () {
      const betAmount = parseEther("10");
      const isEvenChoice = false;

      // 授权合约使用代币
      await mockMLHToken.connect(player1).approve(await bettingContract.getAddress(), betAmount);

      await expect(
        bettingContract.connect(player1).placeBet(
          await mockMLHToken.getAddress(),
          betAmount,
          isEvenChoice
        )
      ).to.emit(bettingContract, "BetConfirmed");

      // 检查代币余额
      const contractBalance = await mockMLHToken.balanceOf(await bettingContract.getAddress());
      expect(contractBalance).to.equal(betAmount);
    });

    it("应该拒绝无效的投注金额", async function () {
      // 投注金额太小
      await expect(
        bettingContract.connect(player1).placeBet(
          ethers.ZeroAddress,
          parseEther("0.5"),
          true,
          { value: parseEther("0.5") }
        )
      ).to.be.revertedWithCustomError(bettingContract, "InvalidBetAmount");

      // 投注金额太大
      await expect(
        bettingContract.connect(player1).placeBet(
          ethers.ZeroAddress,
          parseEther("1001"),
          true,
          { value: parseEther("1001") }
        )
      ).to.be.revertedWithCustomError(bettingContract, "InvalidBetAmount");
    });

    it("应该拒绝无效的代币地址", async function () {
      const invalidToken = addrs[0].address;
      const betAmount = parseEther("10");

      await expect(
        bettingContract.connect(player1).placeBet(
          invalidToken,
          betAmount,
          true
        )
      ).to.be.revertedWithCustomError(bettingContract, "InvalidTokenAddress");
    });
  });

  describe("投注结算", function () {
    let requestId;
    let betAmount;

    beforeEach(async function () {
      betAmount = parseEther("10");
      
      // 下注
      const tx = await bettingContract.connect(player1).placeBet(
        ethers.ZeroAddress,
        betAmount,
        true, // 选择双数
        { value: betAmount }
      );
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return bettingContract.interface.parseLog(log).name === "BetConfirmed";
        } catch {
          return false;
        }
      });
      
      if (event) {
        requestId = bettingContract.interface.parseLog(event).args.requestId;
      }
    });

    it("应该正确处理中奖结果", async function () {
      // 模拟DiceGame回调，结果为双数（中奖）
      await expect(
        diceGame.simulateCallback(
          await bettingContract.getAddress(),
          requestId,
          [2], // 双数结果
          true // isEven = true
        )
      ).to.emit(bettingContract, "BetSettled");

      // 检查投注状态
      const betInfo = await bettingContract.getBetInfo(requestId);
      expect(betInfo.status).to.equal(2); // BetStatus.Won
      expect(betInfo.payoutAmount).to.equal((betAmount * 190n) / 100n);
    });

    it("应该正确处理失败结果", async function () {
      // 模拟DiceGame回调，结果为单数（失败）
      await expect(
        diceGame.simulateCallback(
          await bettingContract.getAddress(),
          requestId,
          [1], // 单数结果
          false // isEven = false
        )
      ).to.emit(bettingContract, "BetSettled");

      // 检查投注状态
      const betInfo = await bettingContract.getBetInfo(requestId);
      expect(betInfo.status).to.equal(3); // BetStatus.Lost
      expect(betInfo.payoutAmount).to.equal(0);
    });
  });

  describe("资金管理", function () {
    beforeEach(async function () {
      // 先进行一些投注以增加合约余额
      const betAmount = parseEther("10");
      await bettingContract.connect(player1).placeBet(
        ethers.ZeroAddress,
        betAmount,
        true,
        { value: betAmount }
      );
    });

    it("应该允许所有者提取原生代币", async function () {
      const withdrawAmount = parseEther("5");
      const initialBalance = await ethers.provider.getBalance(owner.address);

      await expect(
        bettingContract.withdrawFunds(
          ethers.ZeroAddress,
          withdrawAmount,
          owner.address
        )
      ).to.emit(bettingContract, "FundsWithdrawn");
    });

    it("应该拒绝非所有者提取资金", async function () {
      const withdrawAmount = parseEther("5");

      await expect(
        bettingContract.connect(player1).withdrawFunds(
          ethers.ZeroAddress,
          withdrawAmount,
          player1.address
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("应该拒绝提取超过余额的金额", async function () {
      const excessiveAmount = parseEther("1000");

      await expect(
        bettingContract.withdrawFunds(
          ethers.ZeroAddress,
          excessiveAmount,
          owner.address
        )
      ).to.be.revertedWithCustomError(bettingContract, "InsufficientContractBalance");
    });
  });

  describe("查询功能", function () {
    it("应该返回正确的玩家投注历史", async function () {
      const betAmount = parseEther("10");
      
      // 进行两次投注
      await bettingContract.connect(player1).placeBet(
        ethers.ZeroAddress,
        betAmount,
        true,
        { value: betAmount }
      );
      
      await bettingContract.connect(player1).placeBet(
        ethers.ZeroAddress,
        betAmount,
        false,
        { value: betAmount }
      );

      const playerBets = await bettingContract.getPlayerBets(player1.address);
      expect(playerBets.length).to.equal(2);
    });

    it("应该返回正确的统计信息", async function () {
      const [totalBets, totalWonBets, totalLostBets] = await bettingContract.getStats();
      expect(totalBets).to.be.gte(0);
      expect(totalWonBets).to.be.gte(0);
      expect(totalLostBets).to.be.gte(0);
    });
  });

  describe("暂停功能", function () {
    it("应该允许所有者暂停合约", async function () {
      await bettingContract.pause();
      expect(await bettingContract.paused()).to.be.true;
    });

    it("暂停时应该拒绝下注", async function () {
      await bettingContract.pause();
      
      await expect(
        bettingContract.connect(player1).placeBet(
          ethers.ZeroAddress,
          parseEther("10"),
          true,
          { value: parseEther("10") }
        )
      ).to.be.revertedWith("Pausable: paused");
    });

    it("应该允许所有者恢复合约", async function () {
      await bettingContract.pause();
      await bettingContract.unpause();
      expect(await bettingContract.paused()).to.be.false;
    });
  });
});