// SPDX-License-Identifier: MIT
// 开源许可证标识，使用MIT许可证
pragma solidity ^0.8.17;
// 指定Solidity编译器版本，要求0.8.17或更高版本

// 导入OpenZeppelin的ERC20Permit扩展，支持离线签名授权
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
// 导入ERC165接口标准，用于接口检测
import "@openzeppelin/contracts/interfaces/IERC165.sol";
// 导入重入攻击防护合约
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// 导入Shadow工厂接口
import "../interfaces/IShadowFactory.sol";
// 导入ShadowV2路由器接口
import "../interfaces/IShadowV2Router.sol";
// 导入WETH接口
import "../interfaces/IWETH.sol";
// 导入尾单奖金池接口
import "../interfaces/ITailOrderPool.sol";
// 导入买单王奖金池接口
import "../interfaces/IBuyKingPool.sol";
// 注意：IUniswapV2Pair接口在IShadowV2Router.sol中定义

/**
 * @title MLHGToken
 * @dev MLHG代币合约，继承ERC20Permit和重入防护
 * 主要功能包括：代币销毁、流动性自动销毁、手续费管理、奖金池分配等
 */
contract MLHGToken is ERC20Permit, ReentrancyGuard {
    // 合约所有者地址，不可变
    address public immutable owner;
    
    // 开发者地址，用于接收手续费
    address public devAddr;
    
    // Uniswap V2路由器实例
    IShadowV2Router public uniswapRouter;
    
    // Uniswap路由器地址（Sonic网络）
    address public uniswapRouterAddress =
        0x1D368773735ee1E678950B7A97bcA2CafB330CDc;

    // Uniswap交易对地址
    address public uniswapPair;

    // 交换进行中标志，防止重入
    bool swapIng;

    // 代币是否已启动交易 
    bool public launch = false;
    
    // 流动性自动销毁功能是否启用
    bool public lpBurnEnabled = true;

    // 交易手续费率（当前为3%）
    uint256 public constant txFee = 3;
    
    // 紧急暂停标志
    bool public emergencyPaused = false;
    
    // 外部调用暂停标志（用于重入攻击防护）
    bool public externalCallsPaused = false;
    
    // 尾单奖金池合约地址
    address public tailOrderPool;
    
    // 买单王奖金池合约地址
    address public buyKingPool;

    // 流动性销毁频率（秒），默认1800秒（30分钟）
    uint256 public lpBurnFrequency = 1800 seconds;

    // 上次流动性销毁时间戳
    uint256 public lastLpBurnTime;

    // 流动性销毁百分比（基点制，12表示0.12%）
    uint256 public percentForLPBurn = 12;
    
    // 百分比基点常量（10000 = 100%）
    uint256 constant PERCENT_BPS = 100_00;

    // MLHG代币总供应量（21亿枚）
    uint256 public constant MLHG_TOTAL_SUPPLY = 2100000000 ether;

    // 自动做市商交易对映射
    mapping(address => bool) public automatedMarketMakerPairs;

    // 免手续费地址映射
    mapping(address => bool) _excludedFees;

    // 管理员地址映射
    mapping(address => bool) public isAdmin;
    
    // 买单检测相关状态变量
    mapping(address => uint256) private _lastTransactionBlock;
    uint256 public minBuyAmount = 10 * 10**18; // 最小买入量（10个代币）
    uint256 public maxBuyAmountPercent = 1000; // 最大买入量占总供应量的百分比（基点制，100 = 10%）

    /**
     * @dev 管理员权限修饰符
     * 限制函数只能由合约所有者或授权管理员调用
     */
    modifier onlyAdmin() {
        require(msg.sender == owner || isAdmin[msg.sender], "not admin");
        _;
    }

    /**
     * @dev 所有者权限修饰符
     * 限制函数只能由合约所有者调用
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    // 设置自动做市商交易对事件
    event SetAutomatedMarketMakerPair(address indexed pair, bool indexed value);
    
    // 自动销毁流动性事件
    event AutoNukeLP();
    
    // 买单交易事件（用于子合约监听）
    event BuyOrder(address indexed buyer, uint256 amount, uint256 timestamp);
    
    // 手续费分配事件
    event FeeDistributed(address indexed tailPool, address indexed buyKingPool, uint256 tailAmount, uint256 buyKingAmount);
    
    // 外部调用失败事件
    event ExternalCallsFailed(address indexed from, address indexed to, uint256 amount);
    
    // 合约维护事件
    event ContractMaintenance(string action, uint256 timestamp);
    
    // 新增事件：关键状态变更
    event LaunchStatusChanged(bool indexed newStatus, address indexed changedBy, uint256 timestamp);
    event AdminStatusChanged(address indexed account, bool indexed isAdmin, address indexed changedBy, uint256 timestamp);
    event PoolAddressChanged(string indexed poolType, address indexed oldAddress, address indexed newAddress, uint256 timestamp);
    event FeeExclusionChanged(address indexed account, bool indexed excluded, address indexed changedBy, uint256 timestamp);
    event BuyOrderParamsChanged(uint256 indexed oldMinAmount, uint256 indexed newMinAmount, uint256 indexed oldMaxPercent, uint256 newMaxPercent, uint256 timestamp);
    event LiquidityBurnConfigChanged(bool indexed enabled, uint256 indexed frequency, uint256 indexed percent, uint256 timestamp);
    
    // 新增事件：错误处理和安全
    event SecurityAlert(string indexed alertType, address indexed account, uint256 indexed value, string details, uint256 timestamp);
    event InvalidBuyOrderDetected(address indexed buyer, uint256 indexed amount, string indexed reason, uint256 timestamp);
    event ExternalCallsStatusChanged(bool indexed paused, address indexed changedBy, string reason, uint256 timestamp);
    event EmergencyAction(string indexed actionType, address indexed executor, uint256 indexed value, string details, uint256 timestamp);

    /**
     * @dev 构造函数
     * @param _devAddr 开发者地址
     * 初始化MLHG代币，设置基本参数和初始分配
     */
    constructor(
        address _devAddr
    ) ERC20("MLHG Token", "MLHG") ERC20Permit("MLHG Token") {
        // 设置合约所有者为部署者
        owner = msg.sender;
        
        // 设置开发者地址
        devAddr = _devAddr;
        
        // 将开发者设置为管理员
        setAdmin(_devAddr, true);

        // 将部署者、合约地址、开发者地址设为免手续费
        _excludedFees[msg.sender] = true;
        _excludedFees[address(this)] = true;
        _excludedFees[_devAddr] = true;

        // 向部署者铸造2090000000枚代币
        _mint(msg.sender, MLHG_TOTAL_SUPPLY - 10000000 ether);

        // 向开发者铸造10000000枚代币
        _mint(devAddr, 10000000 ether);
        
        // 初始化上次流动性销毁时间
        lastLpBurnTime = block.timestamp;
    }

    /**
     * @dev 设置Uniswap交易对
     * @param _mlhAddress 配对代币地址
     * 只有管理员可以调用，创建与指定代币的交易对
     */
    function setUniswapPair(address _mlhAddress) external onlyAdmin {
        // 初始化Uniswap V2路由器（Sonic网络地址）
        IShadowV2Router _uniswapV2Router = IShadowV2Router(
            0x1D368773735ee1E678950B7A97bcA2CafB330CDc //sonic network
        );
        
        // 通过工厂合约创建交易对
        uniswapPair = IShadowFactory(_uniswapV2Router.factory()).createPair(
            address(this),  // 当前合约地址
            _mlhAddress,    // 配对代币地址
            false           // 不是稳定币对
        );
        
        // 将新创建的交易对设置为自动做市商
        _setAutomatedMarketMakerPair(address(uniswapPair), true);

        // 保存路由器实例
        uniswapRouter = _uniswapV2Router;
    }

    /**
     * @dev 简单销毁函数
     * @param amount 要销毁的代币数量
     * 用户可以直接销毁自己的代币，无奖励
     */
    function onlyBurn(uint256 amount) external {
        // 检查销毁数量必须大于0
        require(amount > 0, "Amount must be greater than 0");
        
        // 检查用户余额是否足够
        require(balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        // 执行代币销毁
        _burn(msg.sender, amount);
    }

    // 存储待处理的外部调用信息
    struct PendingExternalCall {
        address target;
        bytes4 selector;
        address buyer;
        uint256 amount;
        uint256 tokenAmount;
    }
    
    // 待处理的外部调用队列
    PendingExternalCall[] private pendingCalls;

    /**
     * @dev 重写transfer函数以使用自定义转账逻辑
     */
    function transfer(address to, uint256 amount) public override returns (bool) {
        _transferWithFees(_msgSender(), to, amount);
        return true;
    }

    /**
     * @dev 重写transferFrom函数以使用自定义转账逻辑
     */
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transferWithFees(from, to, amount);
        return true;
    }

    /**
     * @dev 重写的转账函数
     * @param from 发送方地址
     * @param to 接收方地址
     * @param amount 转账数量
     * 处理手续费收取和流动性自动销毁逻辑
     * @notice 修复：将外部合约调用移到状态变更完成之后，避免重入攻击
     * @notice 修复：添加状态一致性检查，确保原子性操作
     */
    function _transferWithFees(
        address from,
        address to,
        uint256 amount
    ) internal nonReentrant {
        // 存储需要在转账后执行的外部调用
        delete pendingCalls;
        
        // 如果发送方和接收方都不在免手续费列表中
        if (!_excludedFees[from] && !_excludedFees[to]) {
            // 检查代币是否已启动交易
            require(launch, "unlaunch");

            // 手续费变量
            uint256 fees;

            // 只在涉及交易对的买卖交易时收取手续费
            // 买入：from是交易对，to是用户
            // 卖出：from是用户，to是交易对
            bool isTradingPairTransaction = (from == uniswapPair || to == uniswapPair || 
                                           automatedMarketMakerPairs[from] || automatedMarketMakerPairs[to]);
            
            // 如果是交易对交易且交易手续费大于0（当前为3%）
            if (isTradingPairTransaction && txFee > 0) {
                // 计算总手续费
                uint256 totalFee = (amount * txFee) / 100;
                fees += totalFee;
                
                // 从总手续费中分配：2/3给尾单奖金池，1/3给买单王奖金池
                uint256 tailPoolFee = (totalFee * 2) / 3;  // 总手续费的2/3
                uint256 buyKingPoolFee = totalFee - tailPoolFee; // 剩余部分
                
                // 转账到各自的奖金池（如果地址已设置）
                if (tailOrderPool != address(0)) {
                    super._transfer(from, tailOrderPool, tailPoolFee);
                    // 将外部调用添加到待处理队列
                    pendingCalls.push(PendingExternalCall({
                        target: tailOrderPool,
                        selector: ITailOrderPool.receiveTokens.selector,
                        buyer: address(0),
                        amount: 0,
                        tokenAmount: tailPoolFee
                    }));
                }
                if (buyKingPool != address(0)) {
                    super._transfer(from, buyKingPool, buyKingPoolFee);
                    // 将外部调用添加到待处理队列
                    pendingCalls.push(PendingExternalCall({
                        target: buyKingPool,
                        selector: IBuyKingPool.receiveTokens.selector,
                        buyer: address(0),
                        amount: 0,
                        tokenAmount: buyKingPoolFee
                    }));
                }
                
                // 发布手续费分配事件
                emit FeeDistributed(tailOrderPool, buyKingPool, tailPoolFee, buyKingPoolFee);
            }
            
            // 如果是买单交易（从交易对买入MLHG代币），记录买单信息
            if (from == uniswapPair && to != address(0) && _isValidBuyOrder(to, amount)) {
                emit BuyOrder(to, amount, block.timestamp);
                
                // 将买单处理调用添加到待处理队列
                if (tailOrderPool != address(0)) {
                    pendingCalls.push(PendingExternalCall({
                        target: tailOrderPool,
                        selector: ITailOrderPool.processBuyOrder.selector,
                        buyer: to,
                        amount: amount,
                        tokenAmount: 0
                    }));
                }
                
                if (buyKingPool != address(0)) {
                    pendingCalls.push(PendingExternalCall({
                        target: buyKingPool,
                        selector: IBuyKingPool.processBuyOrder.selector,
                        buyer: to,
                        amount: amount,
                        tokenAmount: 0
                    }));
                }
            }

            // 如果接收方是Uniswap交易对（卖出操作）
            if (to == uniswapPair) {
                // 如果当前没有在交换过程中
                if (!swapIng) {
                    // 设置交换标志，防止重入
                    swapIng = true;

                    // 检查是否满足自动销毁流动性的条件
                    if (
                        automatedMarketMakerPairs[to] &&                    // 是自动做市商交易对
                        lpBurnEnabled &&                                   // 流动性销毁功能已启用
                        block.timestamp >= lastLpBurnTime + lpBurnFrequency && // 距离上次销毁时间已超过频率
                        !_excludedFees[from]                              // 发送方不在免手续费列表中
                    ) {
                        // 执行自动销毁流动性
                        autoBurnLiquidityPairTokens();
                    }

                    // 重置交换标志
                    swapIng = false;
                }
            }

            // 如果有手续费，从转账金额中扣除
            if (fees > 0) {
                amount -= fees;
            }
        }

        // 执行实际的转账（所有状态变更在此完成）
        super._transfer(from, to, amount);
        
        // 在所有状态变更完成后，安全地执行外部调用（带状态一致性检查）
        try this._executePendingExternalCalls() {
            // 外部调用执行成功
        } catch {
            // 如果外部调用失败，记录事件但不回滚主要转账
            // 这确保了代币转账的原子性，即使奖金池调用失败
            emit ExternalCallsFailed(from, to, amount);
        }
    }
    
    // 买单处理结果结构体
    struct BuyOrderResult {
        address buyer;
        bool tailPoolSuccess;
        bool buyKingPoolSuccess;
        bool shouldUpdateState;
    }
    
    /**
     * @dev 安全执行待处理的外部调用
     * @notice 在所有状态变更完成后执行，避免重入攻击
     * @notice 修复：添加更严格的状态检查和回滚机制，确保原子性操作
     * @notice 只能由合约自身调用
     */
    function _executePendingExternalCalls() external {
        require(msg.sender == address(this), "MLHGToken: Only self-call allowed");
        require(!externalCallsPaused, "MLHGToken: External calls paused");
        
        // 记录买单处理结果
        BuyOrderResult[] memory buyOrderResults = new BuyOrderResult[](pendingCalls.length);
        uint256 buyOrderCount = 0;
        bool hasAnySuccess = false;
        
        // 第一阶段：执行所有外部调用并记录结果
        for (uint256 i = 0; i < pendingCalls.length; i++) {
            PendingExternalCall memory call = pendingCalls[i];
            
            if (call.selector == ITailOrderPool.receiveTokens.selector) {
                // 调用 receiveTokens - 这些调用失败不影响状态
                try ITailOrderPool(call.target).receiveTokens(call.tokenAmount) {
                    hasAnySuccess = true;
                } catch {
                    // 忽略错误，继续执行
                }
            } else if (call.selector == IBuyKingPool.receiveTokens.selector) {
                // 调用 receiveTokens - 这些调用失败不影响状态
                try IBuyKingPool(call.target).receiveTokens(call.tokenAmount) {
                    hasAnySuccess = true;
                } catch {
                    // 忽略错误，继续执行
                }
            } else if (call.selector == ITailOrderPool.processBuyOrder.selector || 
                      call.selector == IBuyKingPool.processBuyOrder.selector) {
                // 处理买单调用 - 需要记录结果用于状态更新
                
                // 验证买家状态的一致性
                 require(
                     _validateBuyerState(call.buyer),
                     "MLHGToken: Buyer state inconsistent"
                 );
                
                // 查找是否已有该买家的记录
                uint256 existingIndex = buyOrderCount;
                for (uint256 j = 0; j < buyOrderCount; j++) {
                    if (buyOrderResults[j].buyer == call.buyer) {
                        existingIndex = j;
                        break;
                    }
                }
                
                // 如果是新买家，创建新记录
                if (existingIndex == buyOrderCount) {
                    buyOrderResults[buyOrderCount] = BuyOrderResult({
                        buyer: call.buyer,
                        tailPoolSuccess: false,
                        buyKingPoolSuccess: false,
                        shouldUpdateState: false
                    });
                    buyOrderCount++;
                }
                
                // 执行对应的买单处理调用
                if (call.selector == ITailOrderPool.processBuyOrder.selector) {
                    try ITailOrderPool(call.target).processBuyOrder(call.buyer, call.amount) {
                        buyOrderResults[existingIndex].tailPoolSuccess = true;
                        hasAnySuccess = true;
                    } catch {
                        // 处理失败，保持 tailPoolSuccess 为 false
                    }
                } else if (call.selector == IBuyKingPool.processBuyOrder.selector) {
                    try IBuyKingPool(call.target).processBuyOrder(call.buyer, call.amount) {
                        buyOrderResults[existingIndex].buyKingPoolSuccess = true;
                        hasAnySuccess = true;
                    } catch {
                        // 处理失败，保持 buyKingPoolSuccess 为 false
                    }
                }
            }
        }
        
        // 第二阶段：原子性状态更新
        if (hasAnySuccess) {
            // 只有当至少有一个外部调用成功时，才进行状态更新
            for (uint256 i = 0; i < buyOrderCount; i++) {
                BuyOrderResult memory result = buyOrderResults[i];
                
                // 如果至少有一个奖金池成功处理了买单，则更新状态
                if (result.tailPoolSuccess || result.buyKingPoolSuccess) {
                    // 再次验证状态一致性
                     require(
                         _validateBuyerState(result.buyer),
                         "MLHGToken: State corruption detected"
                     );
                    _updateLastTransactionBlock(result.buyer);
                }
                // 如果两个奖金池都失败了，则不更新状态，保持数据一致性
            }
        }
        
        // 清空待处理调用队列
        delete pendingCalls;
    }

    /**
     * @dev 自动销毁流动性池代币函数
     * @return bool 返回执行结果
     * 从流动性池中销毁一定比例的代币，减少流通供应量
     */
    function autoBurnLiquidityPairTokens() internal returns (bool) {
        // 更新上次销毁时间为当前时间戳
        lastLpBurnTime = block.timestamp;

        // 获取流动性池中的代币余额
        uint256 liquidityPairBalance = this.balanceOf(uniswapPair);

        // 计算要销毁的数量（基于设定的百分比）
        uint256 amountToBurn = (liquidityPairBalance * percentForLPBurn) /
            10000;

        // 如果销毁数量大于0，执行销毁
        if (amountToBurn > 0) {
            // 将代币从流动性池转移到死亡地址
            super._transfer(uniswapPair, address(0xdEaD), amountToBurn);
        }

        // 获取交易对实例并同步储备量
        IUniswapV2Pair pair = IUniswapV2Pair(uniswapPair);
        pair.sync();

        // 触发自动销毁流动性事件
        emit AutoNukeLP();

        return true;
    }

    /**
     * @dev 手动调用自动销毁流动性函数
     * 任何人都可以调用，但需要满足时间和启用条件
     */
    function callAutoBurnLiquidityPairTokens() external {
        // 检查流动性销毁是否启用且已到达下次销毁时间
        if (
            lpBurnEnabled && block.timestamp >= lastLpBurnTime + lpBurnFrequency
        ) {
            // 执行自动销毁流动性
            autoBurnLiquidityPairTokens();
        }
    }

    /**
     * @dev 设置自动流动性销毁参数
     * @param _frequencyInSeconds 销毁频率（秒）
     * @param _percent 销毁百分比（基点制）
     * @param _Enabled 是否启用自动销毁
     * 只有管理员可以调用
     */
    function setAutoLPBurnSettings(
        uint256 _frequencyInSeconds,
        uint256 _percent,
        bool _Enabled
    ) external onlyAdmin {
        // 设置流动性销毁频率
        lpBurnFrequency = _frequencyInSeconds;
        
        // 设置流动性销毁百分比
        percentForLPBurn = _percent;
        
        // 设置流动性销毁启用状态
        lpBurnEnabled = _Enabled;
        
        // 记录流动性销毁配置变更事件
        emit LiquidityBurnConfigChanged(_Enabled, _frequencyInSeconds, _percent, block.timestamp);
        emit ContractMaintenance("Liquidity burn settings updated", block.timestamp);
    }

    /**
     * @dev 设置自动做市商交易对
     * @param pair 交易对地址
     * @param value 是否设为自动做市商
     * 只有管理员可以调用，不能移除主交易对
     */
    function setAutomatedMarketMakerPair(
        address pair,
        bool value
    ) public onlyAdmin {
        // 不能移除主要的Uniswap交易对
        require(
            pair != uniswapPair,
            "The pair cannot be removed from automatedMarketMakerPairs"
        );
        
        // 调用内部函数设置交易对
        _setAutomatedMarketMakerPair(pair, value);
    }

    /**
     * @dev 内部函数：设置自动做市商交易对
     * @param pair 交易对地址
     * @param value 是否设为自动做市商
     */
    function _setAutomatedMarketMakerPair(address pair, bool value) private {
        // 更新交易对映射
        automatedMarketMakerPairs[pair] = value;
        
        // 触发设置事件
        emit SetAutomatedMarketMakerPair(pair, value);
    }

    /**
     * @dev 设置地址的手续费豁免状态
     * @param account 要设置的地址
     * @param excluded 是否豁免手续费
     * 只有管理员可以调用
     */
    function excludedFromFees(
        address account,
        bool excluded
    ) external onlyAdmin {
        bool oldStatus = _excludedFees[account];
        // 设置地址的手续费豁免状态
        _excludedFees[account] = excluded;
        
        // 记录手续费豁免状态变更事件
        emit FeeExclusionChanged(account, excluded, msg.sender, block.timestamp);
        
        // 如果状态发生变化，记录维护事件
        if (oldStatus != excluded) {
            emit ContractMaintenance(
                excluded ? "Fee exclusion granted" : "Fee exclusion revoked", 
                block.timestamp
            );
        }
    }

    /**
     * @dev 设置代币交易启动状态
     * @param flag 是否启动交易
     * 只有管理员可以调用
     */
    function setLaunch(bool flag) public onlyAdmin {
        bool oldStatus = launch;
        // 设置交易启动标志
        launch = flag;
        
        // 记录启动状态变更事件
        emit LaunchStatusChanged(flag, msg.sender, block.timestamp);
        
        // 记录重要的状态变更
        if (oldStatus != flag) {
            emit ContractMaintenance(
                flag ? "Trading launched" : "Trading paused", 
                block.timestamp
            );
            
            // 如果是首次启动，记录安全事件
            if (flag && !oldStatus) {
                emit SecurityAlert(
                    "LAUNCH", 
                    msg.sender, 
                    0, 
                    "Token trading has been launched", 
                    block.timestamp
                );
            }
        }
    }

    /**
     * @dev 查询地址是否豁免手续费
     * @param account 要查询的地址
     * @return bool 是否豁免手续费
     */
    function isExcludedFromFees(address account) external view returns (bool) {
        return _excludedFees[account];
    }

    /**
     * @dev 设置管理员权限
     * @param _addr 要设置的地址
     * @param _bool 是否授予管理员权限
     * 只有管理员可以调用
     */
    function setAdmin(address _addr, bool _bool) public onlyAdmin {
        bool oldStatus = isAdmin[_addr];
        // 设置地址的管理员状态
        isAdmin[_addr] = _bool;
        
        // 记录管理员状态变更事件
        emit AdminStatusChanged(_addr, _bool, msg.sender, block.timestamp);
        
        // 如果状态发生变化，记录安全事件
        if (oldStatus != _bool) {
            emit SecurityAlert(
                "ADMIN_CHANGE", 
                _addr, 
                _bool ? 1 : 0, 
                _bool ? "Admin privileges granted" : "Admin privileges revoked", 
                block.timestamp
            );
        }
    }
    
    /**
     * @dev 设置尾单奖金池合约地址
     * @param _tailOrderPool 尾单奖金池合约地址
     * 只有管理员可以调用
     */
    function setTailOrderPool(address _tailOrderPool) external onlyAdmin {
        address oldAddress = tailOrderPool;
        tailOrderPool = _tailOrderPool;
        
        // 记录奖金池地址变更事件
        emit PoolAddressChanged("TAIL_ORDER", oldAddress, _tailOrderPool, block.timestamp);
        emit ContractMaintenance("Tail order pool address updated", block.timestamp);
    }
    
    /**
     * @dev 设置买单王奖金池合约地址
     * @param _buyKingPool 买单王奖金池合约地址
     * @notice 只有所有者可以调用
     */
    function setBuyKingPool(address _buyKingPool) external {
        require(msg.sender == owner, "Only owner can call this function");
        address oldAddress = buyKingPool;
        buyKingPool = _buyKingPool;
        
        // 记录奖金池地址变更事件
        emit PoolAddressChanged("BUY_KING", oldAddress, _buyKingPool, block.timestamp);
        emit ContractMaintenance("Buy king pool address updated", block.timestamp);
    }
    
    /**
     * @dev 设置外部调用暂停状态
     * @param _paused 是否暂停外部调用
     * @notice 只有所有者可以调用，用于紧急情况下防止重入攻击
     */
    function setExternalCallsPaused(bool _paused) external {
        require(msg.sender == owner, "Only owner can call this function");
        bool oldStatus = externalCallsPaused;
        externalCallsPaused = _paused;
        
        // 记录外部调用状态变更事件
        emit ExternalCallsStatusChanged(_paused, msg.sender, _paused ? "Emergency pause activated" : "Normal operations resumed", block.timestamp);
        emit ContractMaintenance(_paused ? "External calls paused" : "External calls resumed", block.timestamp);
        
        // 如果是紧急暂停，记录安全事件
        if (_paused && !oldStatus) {
            emit SecurityAlert(
                "EMERGENCY_PAUSE", 
                msg.sender, 
                1, 
                "External calls emergency pause activated", 
                block.timestamp
            );
        }
    }
    
    /**
     * @dev 紧急清理待处理的外部调用队列
     * @notice 只有所有者可以调用，用于紧急情况下清理可能损坏的调用队列
     */
    function emergencyCleanPendingCalls() external onlyOwner {
        uint256 clearedCount = pendingCalls.length;
        delete pendingCalls;
        
        // 记录紧急操作事件
        emit EmergencyAction(
            "PENDING_CALLS_CLEANUP", 
            msg.sender, 
            clearedCount, 
            "Emergency cleanup of pending external calls", 
            block.timestamp
        );
        
        emit ContractMaintenance("Emergency pending calls cleanup", block.timestamp);
        emit ExternalCallsFailed(address(0), address(0), clearedCount);
        
        // 记录安全警报
        emit SecurityAlert(
            "EMERGENCY_CLEANUP", 
            msg.sender, 
            clearedCount, 
            "Pending calls queue emergency cleanup executed", 
            block.timestamp
        );
    }

    /**
     * @dev 获取交易对储备量
     * @return uint256, uint256 返回交易对的两个代币储备量
     * 用于查询当前流动性池状态
     */
    function getPairReserves() public view returns (uint256, uint256) {
        // 获取交易对实例
        IUniswapV2Pair pair = IUniswapV2Pair(uniswapPair);
        
        // 获取储备量（忽略时间戳）
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        
        // 返回两个代币的储备量
        return (reserve0, reserve1);
    }

    /**
     * @dev 验证是否为有效的买单交易（只验证，不修改状态）
     * @param buyer 买家地址
     * @param amount 交易金额
     * @return bool 是否为有效买单
     * @notice 修复：分离验证和状态更新，避免状态不一致问题
     */
    function _isValidBuyOrder(address buyer, uint256 amount) private returns (bool) {
        // 排除零地址
        if (buyer == address(0)) {
            emit InvalidBuyOrderDetected(buyer, amount, "ZERO_ADDRESS", block.timestamp);
            return false;
        }
        
        // 排除合约地址（大多数套利和复杂操作）
        if (_isContract(buyer)) {
            emit InvalidBuyOrderDetected(buyer, amount, "CONTRACT_ADDRESS", block.timestamp);
            return false;
        }
        
        // 排除路由器和交易对地址
        if (buyer == address(uniswapRouter) || automatedMarketMakerPairs[buyer]) {
            emit InvalidBuyOrderDetected(buyer, amount, "ROUTER_OR_PAIR", block.timestamp);
            return false;
        }
        
        // 检查交易金额是否在合理范围内
        if (amount < minBuyAmount) {
            emit InvalidBuyOrderDetected(buyer, amount, "AMOUNT_TOO_SMALL", block.timestamp);
            return false;
        }
        
        // 检查是否超过最大买入量限制
        uint256 maxBuyAmount = (totalSupply() * maxBuyAmountPercent) / 10000;
        if (amount > maxBuyAmount) {
            emit InvalidBuyOrderDetected(buyer, amount, "AMOUNT_TOO_LARGE", block.timestamp);
            emit SecurityAlert(
                "LARGE_BUY_ATTEMPT", 
                buyer, 
                amount, 
                "Buy order exceeds maximum allowed amount", 
                block.timestamp
            );
            return false;
        }
        
        // 防止同一区块内的重复交易（可能是套利或闪电贷）
        if (_lastTransactionBlock[buyer] == block.number) {
            emit InvalidBuyOrderDetected(buyer, amount, "SAME_BLOCK_TRANSACTION", block.timestamp);
            emit SecurityAlert(
                "POTENTIAL_MEV", 
                buyer, 
                amount, 
                "Multiple transactions in same block detected", 
                block.timestamp
            );
            return false;
        }
        
        return true;
    }
    
    /**
     * @dev 更新买家的最后交易区块
     * @param buyer 买家地址
     * @notice 只有在确认买单处理成功后才调用此函数
     */
    function _updateLastTransactionBlock(address buyer) private {
        _lastTransactionBlock[buyer] = block.number;
    }
    
    /**
     * @dev 验证买家状态一致性
     * @param buyer 买家地址
     * @return 状态是否一致
     */
    function _validateBuyerState(address buyer) internal view returns (bool) {
        return _lastTransactionBlock[buyer] < block.number;
    }
    
    /**
     * @dev 检查地址是否为合约
     * @param account 要检查的地址
     * @return bool 是否为合约地址
     * @notice 修复：增强合约检测，防止构造函数中的合约调用绕过检测
     */
    function _isContract(address account) private view returns (bool) {
        // 检查1：使用 extcodesize 检测已部署的合约
        uint256 size;
        assembly {
            size := extcodesize(account)
        }
        
        // 检查2：防止构造函数中的合约调用绕过检测
        // 如果 tx.origin != msg.sender，说明调用链中存在合约
        // 同时 extcodesize 为 0，可能是构造函数中的调用
        if (size == 0 && tx.origin != account) {
            // 进一步检查：如果账户不是 tx.origin，且没有代码，
            // 但调用来自合约环境，则可能是构造函数中的调用
            return tx.origin != msg.sender;
        }
        
        // 检查3：检查代码哈希（更严格的检测）
        bytes32 codehash;
        assembly {
            codehash := extcodehash(account)
        }
        
        // 如果代码哈希不为空且不是空账户哈希，则为合约
        // 空账户的哈希值为 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
        return (size > 0 || 
                (codehash != 0x0 && 
                 codehash != 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470));
    }
    
    /**
     * @dev 设置买单检测参数
     * @param _minBuyAmount 最小买入量
     * @param _maxBuyAmountPercent 最大买入量占总供应量的百分比（基点制）
     * 只有管理员可以调用
     */
    function setBuyOrderDetectionParams(
        uint256 _minBuyAmount,
        uint256 _maxBuyAmountPercent
    ) external onlyAdmin {
        require(_maxBuyAmountPercent <= 1000, "Max buy amount too high"); // 最大不超过10%
        
        uint256 oldMinAmount = minBuyAmount;
        uint256 oldMaxPercent = maxBuyAmountPercent;
        
        minBuyAmount = _minBuyAmount;
        maxBuyAmountPercent = _maxBuyAmountPercent;
        
        // 记录买单参数变更事件
        emit BuyOrderParamsChanged(oldMinAmount, _minBuyAmount, oldMaxPercent, _maxBuyAmountPercent, block.timestamp);
        emit ContractMaintenance("Buy order detection parameters updated", block.timestamp);
    }
    
    /**
     * @dev 获取买单检测参数
     * @return uint256, uint256 返回最小买入量和最大买入量百分比
     */
    function getBuyOrderDetectionParams() external view returns (uint256, uint256) {
        return (minBuyAmount, maxBuyAmountPercent);
    }

}
