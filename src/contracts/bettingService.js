/**
 * 投注合约服务类
 * 封装与BettingContract智能合约的交互逻辑
 */

import { ethers } from 'ethers'
import {
  CONTRACT_ADDRESSES,
  TOKEN_CONFIG,
  BETTING_CONFIG,
  BETTING_CONTRACT_ABI,
  ERC20_ABI
} from './config.js'

/**
 * 投注服务类
 */
export class BettingService {
  constructor() {
    this.provider = null
    this.signer = null
    this.bettingContract = null
    this.isInitialized = false
    // 授权状态缓存，避免频繁查询
    this.allowanceCache = new Map()
    this.cacheExpiry = 5 * 60 * 1000 // 缓存5分钟
    
    // 投注状态缓存，减少重复的区块链查询
    this.betStatusCache = new Map()
    this.betCacheExpiry = 30 * 1000 // 投注状态缓存30秒
    this.playerBetsCache = new Map()
    this.playerBetsCacheExpiry = 15 * 1000 // 玩家投注列表缓存15秒
  }

  /**
   * 初始化服务
   * @param {object} ethereum - window.ethereum对象
   * @returns {Promise<boolean>} 初始化是否成功
   */
  async initialize(ethereum) {
    try {
      if (!ethereum) {
        throw new Error('未检测到钱包')
      }

      console.log('开始初始化投注服务...')
      console.log('合约地址:', CONTRACT_ADDRESSES.BETTING_CONTRACT)
      
      // 创建provider
      this.provider = new ethers.BrowserProvider(ethereum)
      console.log('Provider创建成功')
      
      // 获取signer
      this.signer = await this.provider.getSigner()
      const signerAddress = await this.signer.getAddress()
      console.log('Signer获取成功，地址:', signerAddress)
      
      // 检查网络
        const network = await this.provider.getNetwork()
        console.log('当前网络:', network.chainId, network.name)
        
        if (network.chainId !== 57054n) {
          throw new Error(`网络不匹配，当前网络ID: ${network.chainId}，期望: 57054`)
        }
      
      // 创建合约实例
      this.bettingContract = new ethers.Contract(
        CONTRACT_ADDRESSES.BETTING_CONTRACT,
        BETTING_CONTRACT_ABI,
        this.signer
      )
      console.log('合约实例创建成功')
      
      // 测试合约连接
      try {
        const vrfCost = await this.bettingContract.getVRFCost()
      console.log('合约连接测试成功，VRF费用:', ethers.formatEther(vrfCost))
      } catch (contractError) {
        console.error('合约连接测试失败:', contractError)
        throw new Error(`合约连接失败: ${contractError.message}`)
      }

      this.isInitialized = true
      console.log('投注服务初始化完成')
      return true
    } catch (error) {
      console.error('投注服务初始化失败:', error)
      console.error('错误详情:', {
        message: error.message,
        code: error.code,
        data: error.data
      })
      this.isInitialized = false
      return false
    }
  }

  /**
   * 检查服务是否已初始化
   * @throws {Error} 如果未初始化则抛出错误
   */
  _checkInitialized() {
    if (!this.isInitialized) {
      throw new Error('投注服务未初始化，请先调用initialize方法')
    }
  }

  /**
   * 获取缓存的授权额度
   * @private
   * @param {string} tokenAddress - 代币地址
   * @param {string} userAddress - 用户地址
   * @returns {BigInt|null} 缓存的授权额度，如果缓存过期或不存在则返回null
   */
  _getCachedAllowance(tokenAddress, userAddress) {
    const cacheKey = `${tokenAddress}-${userAddress}`
    const cached = this.allowanceCache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      console.log('使用缓存的授权额度:', ethers.formatEther(cached.allowance))
      return cached.allowance
    }
    
    return null
  }

  /**
   * 设置授权额度缓存
   * @private
   * @param {string} tokenAddress - 代币地址
   * @param {string} userAddress - 用户地址
   * @param {BigInt} allowance - 授权额度
   */
  _setCachedAllowance(tokenAddress, userAddress, allowance) {
    const cacheKey = `${tokenAddress}-${userAddress}`
    this.allowanceCache.set(cacheKey, {
      allowance: allowance,
      timestamp: Date.now()
    })
  }

  /**
   * 清除特定代币的授权缓存
   * @private
   * @param {string} tokenAddress - 代币地址
   * @param {string} userAddress - 用户地址
   */
  _clearAllowanceCache(tokenAddress, userAddress) {
    const cacheKey = `${tokenAddress}-${userAddress}`
    this.allowanceCache.delete(cacheKey)
  }

  /**
   * 获取缓存的投注状态
   * @private
   * @param {string} requestId - 投注请求ID
   * @returns {object|null} 缓存的投注状态，如果缓存过期或不存在则返回null
   */
  _getCachedBetStatus(requestId) {
    const cached = this.betStatusCache.get(requestId)
    
    if (cached && Date.now() - cached.timestamp < this.betCacheExpiry) {
      console.log('使用缓存的投注状态:', requestId)
      return cached.data
    }
    
    return null
  }

  /**
   * 设置投注状态缓存
   * @private
   * @param {string} requestId - 投注请求ID
   * @param {object} betData - 投注数据
   */
  _setCachedBetStatus(requestId, betData) {
    this.betStatusCache.set(requestId, {
      data: betData,
      timestamp: Date.now()
    })
  }

  /**
   * 获取缓存的玩家投注列表
   * @private
   * @param {string} playerAddress - 玩家地址
   * @returns {Array|null} 缓存的投注列表，如果缓存过期或不存在则返回null
   */
  _getCachedPlayerBets(playerAddress) {
    const cached = this.playerBetsCache.get(playerAddress)
    
    if (cached && Date.now() - cached.timestamp < this.playerBetsCacheExpiry) {
      console.log('使用缓存的玩家投注列表:', playerAddress)
      return cached.data
    }
    
    return null
  }

  /**
   * 设置玩家投注列表缓存
   * @private
   * @param {string} playerAddress - 玩家地址
   * @param {Array} betsData - 投注列表数据
   */
  _setCachedPlayerBets(playerAddress, betsData) {
    this.playerBetsCache.set(playerAddress, {
      data: betsData,
      timestamp: Date.now()
    })
  }

  /**
   * 清除投注状态缓存
   * @private
   * @param {string} requestId - 投注请求ID（可选，如果不提供则清除所有缓存）
   */
  _clearBetStatusCache(requestId = null) {
    if (requestId) {
      this.betStatusCache.delete(requestId)
    } else {
      this.betStatusCache.clear()
    }
  }

  /**
   * 清除玩家投注列表缓存
   * @private
   * @param {string} playerAddress - 玩家地址（可选，如果不提供则清除所有缓存）
   */
  _clearPlayerBetsCache(playerAddress = null) {
    if (playerAddress) {
      this.playerBetsCache.delete(playerAddress)
    } else {
      this.playerBetsCache.clear()
    }
  }

  /**
   * 获取代币地址
   * @param {string} tokenType - 代币类型 ('native', 'MLH', 'MLHG')
   * @returns {string} 代币地址
   */
  _getTokenAddress(tokenType) {
    switch (tokenType.toLowerCase()) {
      case 'native':
        return ethers.ZeroAddress // 原生代币使用零地址
      case 'mlh':
        return TOKEN_CONFIG.MLH.address
      case 'mlhg':
        return TOKEN_CONFIG.MLHG.address
      default:
        throw new Error(`不支持的代币类型: ${tokenType}`)
    }
  }

  /**
   * 获取VRF费用
   * @returns {Promise<string>} VRF费用（S格式）
   */
  async getVRFCost() {
    this._checkInitialized()
    
    try {
      const vrfCost = await this.bettingContract.getVRFCost()
      const formattedCost = ethers.formatEther(vrfCost)
      console.log('VRF费用:', formattedCost, 'S')
      return formattedCost
    } catch (error) {
      console.error('获取VRF费用失败:', error)
      throw error
    }
  }

  /**
   * 获取VRF费用（wei单位）
   * @returns {Promise<string>} VRF费用（wei）
   */
  async getVRFCostWei() {
    this._checkInitialized()
    
    try {
      const vrfCost = await this.bettingContract.getVRFCost()
      return vrfCost.toString()
    } catch (error) {
      console.error('获取VRF费用失败:', error)
      throw error
    }
  }

  /**
   * 检查并批准ERC20代币
   * @param {string} tokenAddress - 代币地址
   * @param {string} amount - 批准金额（wei）
   * @returns {Promise<boolean>} 是否成功批准
   */
  async approveToken(tokenAddress, amount) {
    this._checkInitialized()
    
    if (tokenAddress === ethers.ZeroAddress) {
      return true // 原生代币不需要批准
    }

    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.signer
      )

      const userAddress = await this.signer.getAddress()
      const currentAllowance = await tokenContract.allowance(
        userAddress,
        CONTRACT_ADDRESSES.BETTING_CONTRACT
      )

      console.log('当前授权额度:', ethers.formatEther(currentAllowance))
      console.log('需要授权额度:', ethers.formatEther(amount))

      // 如果当前授权额度足够，无需重新授权
      if (currentAllowance >= amount) {
        console.log('授权额度足够，无需重新授权')
        return true
      }

      console.log('正在授权代币...')
      
      // 计算授权额度：为了减少频繁授权，授权一个较大的额度
      // 授权额度 = max(所需金额 * 10, 1000 ether)
      const minApprovalAmount = ethers.parseEther('1000') // 最少授权1000个代币
      const calculatedAmount = BigInt(amount) * BigInt(10) // 所需金额的10倍
      const approvalAmount = calculatedAmount > minApprovalAmount ? calculatedAmount : minApprovalAmount
      
      console.log('本次授权额度:', ethers.formatEther(approvalAmount), '(减少后续授权频率)')
      
      // 获取Gas价格用于授权交易
      let gasPrice
      try {
        gasPrice = await this.provider.send('eth_gasPrice', [])
        gasPrice = BigInt(gasPrice)
      } catch (error) {
        gasPrice = ethers.parseUnits('20', 'gwei')
      }
      
      const approveTx = await tokenContract.approve(
        CONTRACT_ADDRESSES.BETTING_CONTRACT,
        approvalAmount,
        {
          gasPrice: gasPrice,
          type: 0 // 明确使用传统交易类型
        }
      )

      console.log('授权交易已提交:', approveTx.hash)
      await approveTx.wait()
      console.log('代币授权成功')
      
      // 更新缓存为新的授权额度
      this._setCachedAllowance(tokenAddress, userAddress, approvalAmount)
      
      return true
    } catch (error) {
      console.error('代币授权失败:', error)
      throw new Error(`代币授权失败: ${error.message}`)
    }
  }

  /**
   * 下注
   * @param {string} tokenType - 代币类型 ('native', 'MLH', 'MLHG')
   * @param {number} betAmount - 投注金额
   * @param {boolean} isEvenChoice - 是否选择双数
   * @returns {Promise<object>} 投注结果
   */
  async placeBet(tokenType, betAmount, isEvenChoice) {
    this._checkInitialized()
    
    try {
      // 获取用户地址（在方法开始时声明一次）
      const userAddress = await this.signer.getAddress()
      
      // 验证投注金额
      if (betAmount < BETTING_CONFIG.MIN_BET_AMOUNT || betAmount > BETTING_CONFIG.MAX_BET_AMOUNT) {
        throw new Error(`投注金额必须在 ${BETTING_CONFIG.MIN_BET_AMOUNT} - ${BETTING_CONFIG.MAX_BET_AMOUNT} 之间`)
      }

      const tokenAddress = this._getTokenAddress(tokenType)
      const betAmountWei = ethers.parseEther(betAmount.toString())
      
      console.log('开始下注...')
      console.log('代币类型:', tokenType)
      console.log('代币地址:', tokenAddress)
      console.log('投注金额:', betAmount)
      console.log('选择:', isEvenChoice ? '双数' : '单数')
      
      // 验证合约状态（可选检查，不影响主要功能）
      try {
        // 检查合约所有者（用于调试信息）
        if (typeof this.bettingContract.owner === 'function') {
          const contractOwner = await this.bettingContract.owner()
          console.log('合约所有者:', contractOwner)
        }
        
        // 检查合约是否暂停
        if (typeof this.bettingContract.paused === 'function') {
          const isPaused = await this.bettingContract.paused()
          if (isPaused) {
            throw new Error('合约当前已暂停，无法进行投注')
          }
          console.log('合约状态正常，未暂停')
        } else {
          console.log('合约暂停状态检查不可用，继续执行投注')
        }
      } catch (stateError) {
        console.warn('合约状态检查失败:', stateError.message)
        // 如果是暂停错误，则阻止投注
        if (stateError.message.includes('暂停')) {
          throw stateError
        }
        // 其他错误不影响投注流程
        console.log('忽略状态检查错误，继续执行投注')
      }

      // 检查用户余额
      if (tokenType.toLowerCase() === 'native') {
        const balance = await this.provider.getBalance(userAddress)
        const totalRequired = BigInt(betAmountWei) + BigInt(await this.getVRFCostWei())
        if (balance < totalRequired) {
          throw new Error(`余额不足。需要 ${ethers.formatEther(totalRequired)} S，当前余额 ${ethers.formatEther(balance)} S`)
        }
      } else {
        // 检查ERC20代币余额
        const tokenContract = new ethers.Contract(tokenAddress, [
          'function balanceOf(address) view returns (uint256)'
        ], this.provider)
        const tokenBalance = await tokenContract.balanceOf(userAddress)
        if (tokenBalance < betAmountWei) {
          throw new Error(`${tokenType}代币余额不足。需要 ${betAmount}，当前余额 ${ethers.formatEther(tokenBalance)}`)
        }
        
        // 检查原生代币余额（用于支付VRF费用）
        const nativeBalance = await this.provider.getBalance(userAddress)
        const vrfCostWei = await this.getVRFCostWei()
        if (nativeBalance < BigInt(vrfCostWei)) {
          throw new Error(`原生代币余额不足支付VRF费用。需要 ${ethers.formatEther(vrfCostWei)} S，当前余额 ${ethers.formatEther(nativeBalance)} S`)
        }
      }

      // 检查网络连接状态
      try {
        const network = await this.provider.getNetwork()
        console.log('当前网络:', network.name, 'ChainId:', network.chainId.toString())
        
        const blockNumber = await this.provider.getBlockNumber()
        console.log('当前区块高度:', blockNumber)
      } catch (networkError) {
        console.error('网络连接检查失败:', networkError)
        throw new Error('网络连接异常，请检查网络设置或稍后重试')
      }

      // 获取VRF费用
      const vrfCost = await this.getVRFCostWei()
      console.log('VRF费用:', ethers.formatEther(vrfCost), 'S')

      // 动态估算gas费用
       let estimatedGas
       try {
         console.log('开始Gas估算...')
         console.log('代币类型:', tokenType)
         console.log('投注金额:', betAmountWei.toString())
         console.log('VRF费用:', vrfCost.toString())
         
         // 先进行gas估算
         if (tokenType.toLowerCase() === 'native') {
           const totalValue = BigInt(betAmountWei) + BigInt(vrfCost)
           console.log('原生代币投注，总价值:', totalValue.toString())
           
           // 检查用户余额是否足够
           const userBalance = await this.provider.getBalance(userAddress)
           console.log('用户余额:', userBalance.toString())
           console.log('需要金额:', totalValue.toString())
           
           if (userBalance < totalValue) {
             throw new Error(`余额不足。需要 ${ethers.formatEther(totalValue)} S，当前余额 ${ethers.formatEther(userBalance)} S`)
           }
           
           estimatedGas = await this.bettingContract.placeBet.estimateGas(
             tokenAddress,
             betAmountWei,
             isEvenChoice,
             { value: totalValue }
           )
         } else {
           // ERC20代币投注：先检查授权状态，但不执行授权
           const tokenContract = new ethers.Contract(tokenAddress, [
             'function allowance(address,address) view returns (uint256)'
           ], this.provider)
           const currentAllowance = await tokenContract.allowance(
             userAddress,
             CONTRACT_ADDRESSES.BETTING_CONTRACT
           )
           
           console.log('当前授权额度:', currentAllowance.toString())
           console.log('需要授权额度:', betAmountWei.toString())
           
           if (currentAllowance < betAmountWei) {
             console.log('需要先授权代币才能进行gas估算，使用默认Gas限制')
             // 使用默认gas限制，避免在估算阶段执行授权
             estimatedGas = BigInt(500000)
           } else {
             console.log('授权充足，进行精确Gas估算')
             estimatedGas = await this.bettingContract.placeBet.estimateGas(
               tokenAddress,
               betAmountWei,
               isEvenChoice,
               { value: vrfCost }
             )
           }
         }
         console.log('Gas估算成功:', estimatedGas.toString())
       } catch (gasError) {
         console.error('Gas估算失败，详细错误:', gasError)
         console.error('错误类型:', gasError.constructor.name)
         console.error('错误代码:', gasError.code)
         console.error('错误原因:', gasError.reason)
         console.error('错误数据:', gasError.data)
         
         // 检查是否是合约执行错误
         if (gasError.message && gasError.message.includes('execution reverted')) {
           throw new Error('合约执行失败，可能是余额不足、授权不足或合约状态异常')
         }
         
         // 使用默认gas限制
         console.log('使用默认Gas限制: 800000')
         estimatedGas = BigInt(800000)
       }

      // 获取当前Gas价格 (Sonic网络不支持EIP-1559，使用传统gasPrice)
      let gasPrice
      try {
        // 直接获取gasPrice，避免使用getFeeData()中的EIP-1559方法
        gasPrice = await this.provider.send('eth_gasPrice', [])
        gasPrice = BigInt(gasPrice)
        console.log('当前Gas价格:', gasPrice.toString())
      } catch (gasPriceError) {
        console.error('获取Gas价格失败:', gasPriceError)
        gasPrice = ethers.parseUnits('20', 'gwei') // 使用默认Gas价格
        console.log('使用默认Gas价格:', gasPrice.toString())
      }

      let txOptions = {
        gasLimit: estimatedGas + BigInt(100000), // 在估算基础上增加缓冲
        gasPrice: gasPrice,
        type: 0 // 明确使用传统交易类型，避免EIP-1559
      }
      
      console.log('交易选项:', {
        gasLimit: txOptions.gasLimit.toString(),
        gasPrice: txOptions.gasPrice ? txOptions.gasPrice.toString() : 'null'
      })

      // 处理不同代币类型的投注
      if (tokenType.toLowerCase() === 'native') {
        // 原生代币投注：需要发送代币金额 + VRF费用
        const totalValue = BigInt(betAmountWei) + BigInt(vrfCost)
        txOptions.value = totalValue
        console.log('原生代币投注，总发送金额:', ethers.formatEther(totalValue), 'S')
      } else {
        // ERC20代币投注：智能检查授权额度，优先使用缓存
        console.log('检查ERC20代币授权额度...')
        
        // 首先尝试从缓存获取授权额度
        let currentAllowance = this._getCachedAllowance(tokenAddress, userAddress)
        
        // 如果缓存中没有或已过期，则查询链上数据
        if (currentAllowance === null) {
          console.log('查询链上授权额度...')
          const tokenContract = new ethers.Contract(
            tokenAddress,
            ERC20_ABI,
            this.signer
          )
          
          currentAllowance = await tokenContract.allowance(
            userAddress,
            CONTRACT_ADDRESSES.BETTING_CONTRACT
          )
          
          // 更新缓存
          this._setCachedAllowance(tokenAddress, userAddress, currentAllowance)
        }
        
        console.log('当前授权额度:', ethers.formatEther(currentAllowance))
        console.log('本次投注需要:', ethers.formatEther(betAmountWei))
        
        // 只有在授权额度不足时才执行授权
        if (currentAllowance < betAmountWei) {
          console.log('授权额度不足，执行代币授权...')
          await this.approveToken(tokenAddress, betAmountWei)
          // 清除缓存，因为授权额度已更改
          this._clearAllowanceCache(tokenAddress, userAddress)
        } else {
          console.log('授权额度充足，跳过授权步骤')
        }
        
        txOptions.value = vrfCost
        console.log('ERC20代币投注，VRF费用:', ethers.formatEther(vrfCost), 'S')
      }

      // 调用合约下注函数
      console.log('调用合约下注函数...')
      console.log('调用参数:')
      
      const tx = await this.bettingContract.placeBet(
        tokenAddress,
        betAmountWei,
        isEvenChoice,
        txOptions
      )

      console.log('投注交易已提交:', tx.hash)
      
      // 等待交易确认
      const receipt = await tx.wait()
      console.log('投注交易已确认:', receipt.hash)

      // 解析事件获取requestId
      const betConfirmedEvent = receipt.logs.find(log => {
        try {
          const parsed = this.bettingContract.interface.parseLog(log)
          return parsed.name === 'BetConfirmed'
        } catch {
          return false
        }
      })

      let requestId = null
      if (betConfirmedEvent) {
        const parsed = this.bettingContract.interface.parseLog(betConfirmedEvent)
        requestId = parsed.args.requestId.toString()
        console.log('投注请求ID:', requestId)
      }

      // 清除玩家投注列表缓存，因为有新的投注
      this._clearPlayerBetsCache(userAddress)
      
      return {
        success: true,
        txHash: tx.hash,
        requestId,
        message: '投注成功！等待开奖结果...'
      }
    } catch (error) {
      console.error('投注失败:', error)
      
      let errorMessage = '投注失败'
      if (error.message) {
        if (error.message.includes('余额不足')) {
          errorMessage = error.message // 使用我们自定义的余额检查错误信息
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = '余额不足，请检查您的钱包余额'
        } else if (error.message.includes('user rejected') || error.message.includes('User denied')) {
          errorMessage = '用户取消了交易'
        } else if (error.message.includes('gas') || error.message.includes('Gas')) {
          errorMessage = 'Gas费用不足或估算失败，请尝试增加Gas限制'
        } else if (error.message.includes('execution reverted')) {
          errorMessage = '合约执行失败，可能是余额不足或合约状态异常'
        } else if (error.message.includes('network')) {
          errorMessage = '网络连接问题，请检查网络设置'
        } else {
          errorMessage = error.message
        }
      } else if (error.reason) {
        errorMessage = error.reason
      }
      
      return {
        success: false,
        message: errorMessage,
        error: error.message // 保留原始错误信息用于调试
      }
    }
  }

  /**
   * 当投注状态发生变化时清除相关缓存
   * @param {string} requestId - 投注请求ID
   * @param {string} playerAddress - 玩家地址
   */
  invalidateBetCache(requestId, playerAddress) {
    this._clearBetStatusCache(requestId)
    this._clearPlayerBetsCache(playerAddress)
    console.log('已清除投注缓存:', { requestId, playerAddress })
  }

  /**
   * 获取玩家投注历史
   * @param {string} playerAddress - 玩家地址
   * @param {boolean} forceRefresh - 是否强制刷新缓存
   * @returns {Promise<Array>} 投注历史
   */
  async getPlayerBets(playerAddress, forceRefresh = false) {
    this._checkInitialized()
    
    try {
      // 检查缓存（除非强制刷新）
      if (!forceRefresh) {
        const cachedBets = this._getCachedPlayerBets(playerAddress)
        if (cachedBets) {
          return cachedBets
        }
      }

      const requestIds = await this.bettingContract.getPlayerBets(playerAddress)
      console.log('玩家投注请求IDs总数:', requestIds.length)
      
      // 只处理最近的10条投注记录，提高性能
      const recentRequestIds = requestIds.slice(-10) // 获取最后10条（最新的）
      console.log('处理最近10条投注记录:', recentRequestIds.length)

      if (recentRequestIds.length === 0) {
        const emptyResult = []
        this._setCachedPlayerBets(playerAddress, emptyResult)
        return emptyResult
      }

      const bets = []
      for (const requestId of recentRequestIds) {
        try {
          // 检查单个投注的缓存
          let betInfo = this._getCachedBetStatus(requestId.toString())
          
          if (!betInfo) {
            // 从区块链获取投注信息
            betInfo = await this.bettingContract.getBetInfo(requestId)
            
            // 缓存投注信息
            this._setCachedBetStatus(requestId.toString(), betInfo)
          }
          
          // 转换投注状态
          const statusMap = {
            0: '等待确认',
            1: '已确认',
            2: '中奖',
            3: '未中奖',
            4: '已取消'
          }

          // 正确的中奖判断逻辑：用户选择与开奖结果一致
          const shouldWin = betInfo.isEvenChoice === betInfo.diceResult
          
          // 确保status是数字类型
          const statusNumber = Number(betInfo.status)
          
          // 判断投注是否已结算（状态为2或3表示已结算）
          const isSettled = statusNumber === 2 || statusNumber === 3
          // 判断是否中奖（状态为2表示中奖）
          const isWinner = statusNumber === 2
          
          const bet = {
            requestId: requestId.toString(),
            player: betInfo.player,
            betAmount: ethers.formatEther(betInfo.betAmount),
            amount: ethers.formatEther(betInfo.betAmount), // 添加amount字段供前端使用
            tokenAddress: betInfo.tokenAddress,
            tokenSymbol: this.getTokenSymbol(betInfo.tokenAddress), // 添加代币符号
            payoutAmount: ethers.formatEther(betInfo.payoutAmount),
            createdAt: new Date(Number(betInfo.createdAt) * 1000),
            settledAt: betInfo.settledAt > 0 ? new Date(Number(betInfo.settledAt) * 1000) : null,
            timestamp: new Date(Number(betInfo.createdAt) * 1000).toLocaleString(), // 添加格式化时间戳
            status: statusMap[betInfo.status] || '未知',
            isEvenChoice: betInfo.isEvenChoice,
            diceResult: betInfo.diceResult,
            shouldWin: shouldWin, // 添加游戏结果字段
            isSettled: isSettled, // 添加结算状态字段
            isWinner: isWinner, // 添加中奖状态字段
          }

          bets.push(bet)
        } catch (error) {
          console.error(`获取投注信息失败 (requestId: ${requestId}):`, error)
        }
      }

      const sortedBets = bets.sort((a, b) => b.createdAt - a.createdAt) // 按时间倒序
      
      // 只返回最近10条记录以提高性能
      const recentBets = sortedBets.slice(0, 10)
      
      // 缓存结果
      this._setCachedPlayerBets(playerAddress, recentBets)
      
      return recentBets
    } catch (error) {
      console.error('获取玩家投注历史失败:', error)
      return []
    }
  }

  /**
   * 监听投注结算事件
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消监听的函数
   */
  listenToBetSettled(callback) {
    this._checkInitialized()
    
    const filter = this.bettingContract.filters.BetSettled()
    
    const handleEvent = (requestId, player, betAmount, payoutAmount, playerChoice, diceResult, isWinner, event) => {
      console.log('收到投注结算事件:', {
        requestId: requestId.toString(),
        player,
        betAmount: ethers.formatEther(betAmount),
        payoutAmount: ethers.formatEther(payoutAmount),
        playerChoice,
        diceResult,
        isWinner
      })

      callback({
        requestId: requestId.toString(),
        player,
        betAmount: ethers.formatEther(betAmount),
        payoutAmount: ethers.formatEther(payoutAmount),
        playerChoice,
        diceResult,
        isWinner,
        txHash: event.transactionHash
      })
    }

    this.bettingContract.on(filter, handleEvent)

    // 返回取消监听的函数
    return () => {
      this.bettingContract.off(filter, handleEvent)
    }
  }

  /**
   * 获取代币符号
   * @param {string} tokenAddress - 代币地址
   * @returns {string} 代币符号
   */
  getTokenSymbol(tokenAddress) {
    if (tokenAddress === ethers.ZeroAddress) {
      return 'S'
    }
    
    for (const [key, config] of Object.entries(TOKEN_CONFIG)) {
      if (config.address.toLowerCase() === tokenAddress.toLowerCase()) {
        return config.symbol
      }
    }
    
    return 'Unknown'
  }
}

// 创建单例实例
export const bettingService = new BettingService()