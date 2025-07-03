<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { bettingService } from '../contracts/bettingService.js'
import { BETTING_CONFIG } from '../contracts/config.js'

// 定义props
const props = defineProps({
  isWalletConnected: Boolean,
  walletAddress: String
})

// 游戏状态管理
const gameHistory = ref([])        // 历史投注记录
const currentBets = ref([])        // 当前进行中的投注
const isServiceInitialized = ref(false)  // 服务初始化状态
let betSettledListener = null      // 事件监听器引用

// 其他相关状态
const isLoading = ref(false)       // 加载状态
const vrfCost = ref('0')          // VRF费用

// 自动重试相关状态
const autoRetryCount = ref(0)      // 自动重试次数
const maxAutoRetries = 5           // 最大自动重试次数
const retryInterval = ref(null)    // 重试定时器
const isAutoRetrying = ref(false)  // 是否正在自动重试

// 自动刷新相关状态
const refreshInterval = ref(null)  // 自动刷新定时器
const isAutoRefreshing = ref(false) // 是否正在自动刷新
const refreshIntervalTime = 5000   // 刷新间隔时间（5秒）
const lastRefreshTime = ref(Date.now()) // 上次刷新时间
const shouldStopRefresh = ref(false) // 是否应该停止刷新（投注结算后设置为true）

// 防抖相关状态
const isManualRefreshing = ref(false) // 是否正在手动刷新
const manualRefreshDebounceTime = 30000 // 手动刷新防抖时间（30秒）
let manualRefreshTimeout = null // 手动刷新防抖定时器

// 投注表单状态
const betForm = reactive({
  tokenAddress: 'native',          // 代币类型
  betAmount: '',                   // 投注金额
  isEvenChoice: true              // 单双选择
})

// 代币选项
const tokenOptions = [
  { value: 'native', label: 'S (Sonic)', symbol: 'S' },
  { value: 'MLH', label: 'MLH Token', symbol: 'MLH' },
  { value: 'MLHG', label: 'MLHG Token', symbol: 'MLHG' }
]

// 投注金额预设选项
const amountPresets = [10, 100, 500,1000]

/**
 * 设置预设投注金额
 * @param {number} amount - 预设金额
 */
const setPresetAmount = (amount) => {
  betForm.betAmount = amount.toString()
}

/**
 * 设置单双选择
 * @param {boolean} isEven - 是否选择双数
 */
const setChoice = (isEven) => {
  betForm.isEvenChoice = isEven
}

/**
 * 格式化请求ID显示（只显示前4位和后4位）
 * @param {string} requestId - 完整的请求ID
 * @returns {string} 格式化后的请求ID
 */
const formatRequestId = (requestId) => {
  if (!requestId || requestId.length <= 8) {
    return requestId || '生成中...'
  }
  return `${requestId.slice(0, 4)}...${requestId.slice(-4)}`
}

// 复制功能防抖相关状态
const isCopying = ref(false) // 是否正在复制
const copyDebounceTime = 30000 // 复制防抖时间（30秒）
let copyTimeout = null // 复制防抖定时器

/**
 * 复制请求ID到剪贴板（带防抖机制）
 * @param {string} requestId - 要复制的请求ID
 */
const copyRequestId = async (requestId) => {
  // 防抖检查
  if (isCopying.value) {
    showNotification('复制操作进行中，请稍候...', 'warning')
    return
  }
  
  if (!requestId) {
    showNotification('请求ID不存在', 'warning')
    return
  }
  
  // 设置复制状态
  isCopying.value = true
  
  try {
    await navigator.clipboard.writeText(requestId)
    showNotification('请求ID已复制到剪贴板', 'success')
  } catch (error) {
    console.error('复制失败:', error)
    showNotification('复制失败，请手动复制', 'error')
  } finally {
    // 清除之前的定时器
    if (copyTimeout) {
      clearTimeout(copyTimeout)
    }
    
    // 设置防抖定时器
    copyTimeout = setTimeout(() => {
      isCopying.value = false
    }, copyDebounceTime)
  }
}

/**
 * 启动自动刷新机制
 * 定期检查当前投注状态并更新
 */
const startAutoRefresh = () => {
  // 防止重复启动
  if (refreshInterval.value) {
    console.log('自动刷新已在运行，跳过重复启动')
    return
  }
  
  // 检查是否应该停止刷新
  if (shouldStopRefresh.value) {
    console.log('检测到停止刷新标志，跳过启动自动刷新')
    return
  }
  
  // 检查基本条件
  if (!isServiceInitialized.value || !props.walletAddress) {
    console.log('服务未初始化或钱包未连接，跳过启动自动刷新')
    return
  }
  
  // 检查是否有需要刷新的投注
  if (currentBets.value.length === 0) {
    console.log('无当前投注，跳过启动自动刷新')
    return
  }
  
  console.log('启动自动刷新机制，间隔:', refreshIntervalTime / 1000, '秒，当前投注数:', currentBets.value.length)
  
  // 设置刷新计数器和超时机制，防止无限循环
  let refreshCount = 0
  const maxRefreshCount = 5 // 减少最大刷新次数
  const startTime = Date.now()
  const maxDuration = 3 * 60 * 1000 // 最多运行3分钟
  
  refreshInterval.value = setInterval(async () => {
    // 检查是否应该停止刷新
    if (shouldStopRefresh.value) {
      console.log('检测到停止刷新标志，停止自动刷新')
      stopAutoRefresh()
      return
    }
    
    // 检查运行时间限制
    if (Date.now() - startTime > maxDuration) {
      console.log('达到最大运行时间限制，停止自动刷新')
      shouldStopRefresh.value = true
      stopAutoRefresh()
      return
    }
    
    // 检查刷新次数限制
    if (refreshCount >= maxRefreshCount) {
      console.log('达到最大刷新次数限制，停止自动刷新')
      shouldStopRefresh.value = true
      stopAutoRefresh()
      return
    }
    
    // 检查基本条件
    if (!isServiceInitialized.value || !props.walletAddress) {
      console.log('服务状态或钱包连接发生变化，停止自动刷新')
      stopAutoRefresh()
      return
    }
    
    // 双重检查：只有在有当前投注且未在刷新时才执行
    if (currentBets.value.length > 0 && !isAutoRefreshing.value && !shouldStopRefresh.value) {
      refreshCount++
      console.log(`执行第 ${refreshCount}/${maxRefreshCount} 次自动刷新`)
      await refreshCurrentBets()
    } else if (currentBets.value.length === 0) {
      // 没有当前投注时停止自动刷新
      console.log('检测到无当前投注，自动停止刷新')
      shouldStopRefresh.value = true
      stopAutoRefresh()
    }
  }, refreshIntervalTime)
}

/**
 * 停止自动刷新机制
 */
const stopAutoRefresh = () => {
  if (refreshInterval.value) {
    clearInterval(refreshInterval.value)
    refreshInterval.value = null
    console.log('停止自动刷新机制')
  }
}

/**
 * 手动刷新投注状态（带防抖功能）
 */
const manualRefresh = () => {
  // 防抖处理：如果正在手动刷新或自动刷新，则忽略
  if (isManualRefreshing.value || isAutoRefreshing.value) {
    console.log('刷新操作进行中，忽略重复请求')
    showNotification('刷新操作进行中，请稍候...', 'warning')
    return
  }
  
  // 清除之前的防抖定时器
  if (manualRefreshTimeout) {
    clearTimeout(manualRefreshTimeout)
  }
  
  // 设置防抖定时器
  manualRefreshTimeout = setTimeout(async () => {
    await performManualRefresh()
  }, manualRefreshDebounceTime)
  
  // 立即显示防抖提示
  showNotification('刷新请求已接收，正在处理...', 'info')
}

/**
 * 执行手动刷新操作
 */
const performManualRefresh = async () => {
  if (isAutoRefreshing.value) {
    console.log('正在自动刷新中，跳过手动刷新')
    return
  }
  
  isManualRefreshing.value = true
  console.log('用户触发手动刷新')
  showNotification('正在刷新投注状态...', 'info')
  
  try {
    // 强制刷新，不使用缓存
    await refreshCurrentBets(true)
    showNotification('刷新完成', 'success')
  } catch (error) {
    console.error('手动刷新失败:', error)
    showNotification('刷新失败，请重试', 'error')
  } finally {
    isManualRefreshing.value = false
  }
}

/**
 * 刷新当前投注状态
 * 检查是否有投注已经结算
 * @param {boolean} forceRefresh - 是否强制刷新缓存
 */
const refreshCurrentBets = async (forceRefresh = false) => {
  if ((isAutoRefreshing.value && !forceRefresh) || !isServiceInitialized.value || !props.walletAddress) {
    return
  }
  
  // 检查是否应该停止刷新（仅对自动刷新有效）
  if (shouldStopRefresh.value && !forceRefresh) {
    console.log('检测到停止刷新标志，跳过本次刷新')
    stopAutoRefresh()
    return
  }
  
  if (!forceRefresh) {
    isAutoRefreshing.value = true
  }
  lastRefreshTime.value = Date.now()
  
  try {
    console.log('自动刷新当前投注状态...')
    
    // 获取最新的投注历史
    const latestHistory = await bettingService.getPlayerBets(props.walletAddress, forceRefresh)
    
    // 检查当前投注中是否有已结算的
    const updatedCurrentBets = []
    const newHistoryItems = []
    let hasSettledBets = false // 标记是否有投注已结算
    
    console.log('开始检查当前投注状态，当前投注数:', currentBets.value.length)
    console.log('获取到的最新历史记录数:', latestHistory.length)
    
    for (const currentBet of currentBets.value) {
      console.log('检查投注:', currentBet.requestId, '状态:', currentBet.status)
      
      // 在最新历史中查找对应的投注
      const settledBet = latestHistory.find(historyBet => 
        historyBet.requestId === currentBet.requestId
      )
      
      if (settledBet) {
        console.log('找到对应的历史记录:', {
          requestId: settledBet.requestId,
          isSettled: settledBet.isSettled,
          isWinner: settledBet.isWinner,
          status: settledBet.status
        })
      } else {
        console.log('未找到对应的历史记录，投注ID:', currentBet.requestId)
      }
      
      if (settledBet && settledBet.isSettled) {
        hasSettledBets = true // 标记有投注已结算
        
        // 投注已结算，移动到历史记录
        const settledResult = {
          id: settledBet.requestId || Date.now(),
          requestId: settledBet.requestId,
          tokenSymbol: settledBet.tokenSymbol || currentBet.tokenSymbol,
          amount: parseFloat(settledBet.amount || currentBet.amount),
          choice: settledBet.isEvenChoice ? '双数' : '单数',
          diceResult: settledBet.diceResult,
          resultType: settledBet.diceResult ? '双数' : '单数',
          shouldWin: settledBet.shouldWin,
          isWinner: settledBet.isWinner,
          status: settledBet.isWinner ? '中奖' : '再接再励',
          gameResult: settledBet.isWinner ? '中奖' : '再接再励',
          payout: parseFloat(settledBet.payoutAmount || '0'),
          timestamp: settledBet.timestamp || currentBet.timestamp,
          settledAt: settledBet.settledAt ? settledBet.settledAt.toLocaleString() : new Date().toLocaleString(),
          txHash: settledBet.txHash || currentBet.txHash
        }
        
        newHistoryItems.push(settledResult)
        
        // 显示结算通知
        const message = settledBet.isWinner 
          ? `🎉 恭喜中奖！获得 ${settledBet.payoutAmount} ${settledResult.tokenSymbol}` 
          : '😔 很遗憾，本次未中奖，再接再励！'
        
        // 使用更友好的通知方式
        showNotification(message, settledBet.isWinner ? 'success' : 'info')
        
      } else {
        // 投注仍在等待中
        updatedCurrentBets.push(currentBet)
      }
    }
    
    // 更新状态
    currentBets.value = updatedCurrentBets
    
    // 将新结算的投注添加到历史记录开头
    if (newHistoryItems.length > 0) {
      gameHistory.value = [...newHistoryItems, ...gameHistory.value].slice(0, 10)
      console.log(`发现 ${newHistoryItems.length} 个新结算的投注，已更新历史记录`)
    }
    
    console.log('自动刷新完成，当前投注数:', currentBets.value.length)
    
    // 关键修复：如果有投注已结算，立即停止自动刷新
    if (hasSettledBets) {
      console.log('检测到投注已结算，立即停止自动刷新并设置停止标志')
      shouldStopRefresh.value = true // 设置停止刷新标志
      stopAutoRefresh() // 立即停止自动刷新
      
      // 延迟重新加载完整历史记录，确保数据同步
      setTimeout(async () => {
        try {
          console.log('重新加载完整历史记录以确保数据同步')
          await loadBettingHistory()
          console.log('历史记录同步完成，投注结算流程结束')
        } catch (error) {
          console.error('重新加载历史记录失败:', error)
        }
      }, 1000) // 增加延迟时间，确保状态稳定
    }
    
    // 如果没有当前投注了，也要停止刷新
    if (currentBets.value.length === 0) {
      console.log('所有投注已结算，停止自动刷新')
      shouldStopRefresh.value = true
      stopAutoRefresh()
    }
    
  } catch (error) {
    console.error('自动刷新失败:', error)
  } finally {
    isAutoRefreshing.value = false
  }
}

/**
 * 显示通知消息
 * @param {string} message - 通知消息
 * @param {string} type - 通知类型 ('success', 'info', 'warning', 'error')
 */
const showNotification = (message, type = 'info') => {
  // 创建通知元素
  const notification = document.createElement('div')
  notification.className = `notification notification-${type}`
  notification.textContent = message
  
  // 添加样式
  Object.assign(notification.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '15px 20px',
    borderRadius: '8px',
    color: 'white',
    fontWeight: 'bold',
    zIndex: '9999',
    maxWidth: '300px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    transform: 'translateX(100%)',
    transition: 'transform 0.3s ease-in-out',
    backgroundColor: type === 'success' ? '#4CAF50' : 
                    type === 'warning' ? '#FF9800' : 
                    type === 'error' ? '#F44336' : '#2196F3'
  })
  
  document.body.appendChild(notification)
  
  // 动画显示
  setTimeout(() => {
    notification.style.transform = 'translateX(0)'
  }, 100)
  
  // 3秒后自动移除
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)'
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 300)
  }, 3000)
}

/**
 * 自动重试初始化服务
 * 在后台自动尝试重新初始化，不打扰用户
 */
const autoRetryInitialization = async () => {
  if (isAutoRetrying.value || autoRetryCount.value >= maxAutoRetries) {
    return
  }

  isAutoRetrying.value = true
  autoRetryCount.value++
  
  console.log(`自动重试初始化服务 (第${autoRetryCount.value}次)...`)
  
  try {
    const success = await initializeBettingService(0, true) // 静默模式
    if (success) {
      console.log('自动重试初始化成功')
      autoRetryCount.value = 0 // 重置重试计数
      clearInterval(retryInterval.value)
      retryInterval.value = null
      await loadBettingHistory()
    } else {
      // 如果还没达到最大重试次数，继续重试
      if (autoRetryCount.value < maxAutoRetries) {
        console.log(`自动重试失败，将在10秒后进行第${autoRetryCount.value + 1}次重试`)
      } else {
        console.log('已达到最大自动重试次数，停止自动重试')
        clearInterval(retryInterval.value)
        retryInterval.value = null
      }
    }
  } catch (error) {
    console.error('自动重试过程中发生错误:', error)
  } finally {
    isAutoRetrying.value = false
  }
}

/**
 * 启动自动重试机制
 */
const startAutoRetry = () => {
  if (retryInterval.value) {
    clearInterval(retryInterval.value)
  }
  
  // 立即尝试一次
  autoRetryInitialization()
  
  // 设置定时重试（每10秒一次）
  retryInterval.value = setInterval(() => {
    if (!isServiceInitialized.value && props.isWalletConnected && autoRetryCount.value < maxAutoRetries) {
      autoRetryInitialization()
    } else if (isServiceInitialized.value || autoRetryCount.value >= maxAutoRetries) {
      clearInterval(retryInterval.value)
      retryInterval.value = null
    }
  }, 10000) // 10秒间隔
}

/**
 * 初始化投注服务
 * @param {number} retryCount - 重试次数
 * @param {boolean} silent - 是否静默模式（不显示错误提示）
 * @returns {Promise<boolean>} 初始化是否成功
 */
const initializeBettingService = async (retryCount = 0, silent = false) => {
  const maxRetries = 3
  
  if (!window.ethereum) {
    if (!silent) {
      console.error('未检测到钱包')
      alert('请安装并连接MetaMask钱包')
    }
    return false
  }

  try {
    console.log(`正在初始化投注服务... (尝试 ${retryCount + 1}/${maxRetries + 1})${silent ? ' [静默模式]' : ''}`)
    
    // 检查网络连接
    const network = await window.ethereum.request({ method: 'eth_chainId' })
    const expectedChainId = '0xdede' // Sonic Testnet (57054)
    
    if (network.toLowerCase() !== expectedChainId.toLowerCase()) {
      console.warn('网络不匹配，当前网络:', network, '期望网络:', expectedChainId)
      if (!silent) {
        alert('请切换到Sonic Blaze测试网络')
      }
      return false
    }
    
    const success = await bettingService.initialize(window.ethereum)
    if (success) {
      isServiceInitialized.value = true
      await loadVRFCost()        // 加载VRF费用
      setupEventListeners()      // 设置事件监听
      await loadBettingHistory() // 加载投注历史并同步当前投注状态
      console.log('投注服务初始化成功')
      
      // 重置自动重试计数
      autoRetryCount.value = 0
      if (retryInterval.value) {
        clearInterval(retryInterval.value)
        retryInterval.value = null
      }
      
      return true
    } else {
      throw new Error('服务初始化返回失败')
    }
  } catch (error) {
    console.error(`初始化投注服务失败 (尝试 ${retryCount + 1}):`, error)
    
    // 重试逻辑
    if (retryCount < maxRetries) {
      console.log(`将在2秒后重试...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      return await initializeBettingService(retryCount + 1, silent)
    } else {
      if (!silent) {
        const errorMessage = error.message || '未知错误'
        alert(`投注服务初始化失败: ${errorMessage}\n\n请尝试以下解决方案:\n1. 刷新页面重试\n2. 检查网络连接\n3. 确认已连接到Sonic Blaze测试网\n4. 重新连接钱包`)
      }
      return false
    }
  }
}

/**
 * 加载VRF费用
 */
const loadVRFCost = async () => {
  try {
    const cost = await bettingService.getVRFCost()
    vrfCost.value = cost
  } catch (error) {
    console.error('获取VRF费用失败:', error)
  }
}

/**
 * 设置事件监听器
 */
const setupEventListeners = () => {
  // 清理现有的事件监听器
  if (betSettledListener) {
    console.log('清理现有的投注结算事件监听器')
    betSettledListener()
    betSettledListener = null
  }
  
  // 设置新的事件监听器
  console.log('设置投注结算事件监听器')
  betSettledListener = bettingService.listenToBetSettled((eventData) => {
    console.log('事件监听器触发，处理投注结算事件')
    handleBetSettled(eventData)
  })
  
  console.log('投注结算事件监听器设置完成')
}

/**
 * 处理投注结算事件
 * @param {object} eventData - 事件数据
 */
const handleBetSettled = (eventData) => {
  console.log('收到投注结算事件:', eventData)
  
  // 确保事件数据完整
  if (!eventData || !eventData.requestId) {
    console.error('投注结算事件数据不完整:', eventData)
    return
  }
  
  // 1. 查找对应的当前投注
  const betIndex = currentBets.value.findIndex(bet => 
    bet.requestId === eventData.requestId
  )
  
  if (betIndex !== -1) {
    const bet = currentBets.value[betIndex]
    console.log('找到对应投注，开始处理结算:', bet)
    
    // 2. 直接更新当前投注的状态，而不是移动到历史记录
    currentBets.value[betIndex] = {
      ...bet,
      diceResult: eventData.diceResult,
      resultType: eventData.diceResult ? '双数' : '单数',
      shouldWin: eventData.isWinner,
      isWinner: eventData.isWinner,
      status: eventData.isWinner ? '中奖' : '再接再励',
      gameResult: eventData.isWinner ? '中奖' : '再接再励',
      payout: parseFloat(eventData.payoutAmount || '0'),
      settledAt: new Date().toLocaleString(),
      txHash: eventData.txHash || bet.txHash,
      isSettled: true
    }
    
    console.log('投注状态更新完成:', currentBets.value[betIndex])
    
    // 3. 同时添加到历史记录
    const historyResult = {
      id: bet.id || eventData.requestId,
      requestId: eventData.requestId,
      tokenSymbol: bet.tokenSymbol,
      amount: bet.amount,
      choice: bet.choice,
      diceResult: eventData.diceResult,
      resultType: eventData.diceResult ? '双数' : '单数',
      shouldWin: eventData.isWinner,
      isWinner: eventData.isWinner,
      status: eventData.isWinner ? '中奖' : '再接再励',
      gameResult: eventData.isWinner ? '中奖' : '再接再励',
      payout: parseFloat(eventData.payoutAmount || '0'),
      timestamp: bet.timestamp,
      settledAt: new Date().toLocaleString(),
      txHash: eventData.txHash || bet.txHash
    }
    
    gameHistory.value.unshift(historyResult)
    
    // 4. 限制历史记录数量
    if (gameHistory.value.length > 10) {
      gameHistory.value = gameHistory.value.slice(0, 10)
    }
    
    console.log('历史记录更新完成 - 当前投注数:', currentBets.value.length, '历史记录数:', gameHistory.value.length)
    
    // 5. 用户通知
    const message = eventData.isWinner 
      ? `🎉 恭喜中奖！获得 ${eventData.payoutAmount} ${bet.tokenSymbol}` 
      : '😔 很遗憾，本次未中奖，再接再励！'
    
    showNotification(message, eventData.isWinner ? 'success' : 'info')
    
    // 6. 强制触发界面更新
    nextTick(() => {
      console.log('强制触发界面更新完成')
    })
    
    // 7. 延迟移除已结算的投注（让用户有时间查看结果）
    setTimeout(() => {
      const currentIndex = currentBets.value.findIndex(b => b.requestId === eventData.requestId)
      if (currentIndex !== -1) {
        console.log('延迟移除已结算的投注:', eventData.requestId)
        currentBets.value.splice(currentIndex, 1)
        
        // 如果没有当前投注了，停止自动刷新
        if (currentBets.value.length === 0) {
          console.log('所有投注已结算，设置停止刷新标志')
          shouldStopRefresh.value = true
          stopAutoRefresh()
        }
      }
    }, 10000) // 10秒后移除
    
  } else {
    console.warn('未找到对应的当前投注，requestId:', eventData.requestId)
    console.log('当前投注列表:', currentBets.value.map(bet => ({ id: bet.id, requestId: bet.requestId })))
    
    // 即使没找到对应投注，也尝试重新加载历史记录
    setTimeout(async () => {
      try {
        console.log('未找到对应投注，重新加载历史记录')
        await loadBettingHistory()
      } catch (error) {
        console.error('重新加载历史记录失败:', error)
      }
    }, 1000)
  }
}

/**
 * 提交投注
 */
const submitBet = async () => {
  if (!props.isWalletConnected) {
    alert('请先连接钱包')
    return
  }

  if (!isServiceInitialized.value) {
    const shouldRetry = confirm('投注服务未初始化，是否尝试重新初始化？')
    if (shouldRetry) {
      const success = await initializeBettingService()
      if (!success) {
        return
      }
    } else {
      return
    }
  }

  if (!betForm.betAmount || parseFloat(betForm.betAmount) <= 0) {
    alert('请输入有效的投注金额')
    return
  }

  const amount = parseFloat(betForm.betAmount)
  if (amount < BETTING_CONFIG.MIN_BET_AMOUNT) {
    alert(`最小投注金额为 ${BETTING_CONFIG.MIN_BET_AMOUNT}`)
    return
  }

  if (amount > BETTING_CONFIG.MAX_BET_AMOUNT) {
    alert(`最大投注金额为 ${BETTING_CONFIG.MAX_BET_AMOUNT}`)
    return
  }

  isLoading.value = true

  try {
    console.log('开始提交投注...')
    
    // 1. 调用智能合约
    const result = await bettingService.placeBet(
      betForm.tokenAddress,
      amount,
      betForm.isEvenChoice
    )

    if (result.success) {
      // 重置停止刷新标志，允许新投注启动刷新
      shouldStopRefresh.value = false
      console.log('新投注提交，重置停止刷新标志')
      
      // 清除投注缓存，确保获取最新数据
      if (bettingService.invalidateBetCache) {
        bettingService.invalidateBetCache(result.requestId, props.walletAddress)
      }
      
      // 2. 创建投注记录并添加到当前投注
      const newBet = {
        id: Date.now(),
        requestId: result.requestId,
        tokenSymbol: getTokenSymbol(betForm.tokenAddress),
        amount: amount,
        choice: betForm.isEvenChoice ? '双数' : '单数',
        status: '等待开奖',
        timestamp: new Date().toLocaleString(),
        txHash: result.txHash
      }
      
      currentBets.value.unshift(newBet)  // 添加到当前投注列表
      
      // 启动自动刷新（如果还没启动）
      if (!refreshInterval.value) {
        startAutoRefresh()
      }
      
      // 重置表单
      betForm.betAmount = ''
      
      showNotification('投注提交成功！等待开奖中...', 'success')
    } else {
      alert(result.message || '投注失败，请重试')
    }
  } catch (error) {
    console.error('投注失败:', error)
    alert('投注失败：' + (error.message || '未知错误'))
  } finally {
    isLoading.value = false
  }
}

/**
 * 加载玩家投注历史
 */
const loadBettingHistory = async () => {
  if (!props.walletAddress || !isServiceInitialized.value) {
    return
  }

  try {
    console.log('加载投注历史...')
    // 调用 bettingService 获取玩家投注历史
    const history = await bettingService.getPlayerBets(props.walletAddress)
    
    // 转换历史数据格式
    const formattedHistory = history.map(bet => ({
      id: bet.requestId || Date.now(),
      requestId: bet.requestId,
      tokenSymbol: bet.tokenSymbol || 'Unknown',
      amount: parseFloat(bet.amount || '0'),
      choice: bet.isEvenChoice ? '双数' : '单数',
      diceResult: bet.diceResult,
      resultType: bet.diceResult ? '双数' : '单数', // 修复：diceResult是布尔值，true=双数，false=单数
      shouldWin: bet.shouldWin, // 添加游戏结果字段
      isWinner: bet.isWinner,
      status: bet.shouldWin ? '中奖' : '再接再励',
      gameResult: bet.shouldWin ? '中奖' : '再接再励', // 添加游戏逻辑结果显示
      payout: parseFloat(bet.payoutAmount || '0'),
      timestamp: bet.timestamp || new Date().toLocaleString(),
      settledAt: bet.settledAt || bet.timestamp,
      txHash: bet.txHash,
      isSettled: bet.isSettled || true // 历史记录中的投注都应该是已结算的
    }))
    
    // 同步当前投注状态：检查当前投注中是否有已结算的
    if (currentBets.value.length > 0) {
      console.log('检查当前投注中是否有已结算的投注...')
      const updatedCurrentBets = []
      let hasSettledBets = false
      
      for (const currentBet of currentBets.value) {
        // 在历史记录中查找对应的已结算投注
        const settledBet = history.find(historyBet => 
          historyBet.requestId === currentBet.requestId && historyBet.isSettled
        )
        
        if (settledBet) {
          hasSettledBets = true
          console.log('发现已结算的投注:', currentBet.requestId)
          
          // 显示结算通知
          const message = settledBet.shouldWin 
            ? `🎉 恭喜中奖！获得 ${settledBet.payoutAmount} ${settledBet.tokenSymbol}` 
            : '😔 很遗憾，本次未中奖，再接再励！'
          
          showNotification(message, settledBet.shouldWin ? 'success' : 'info')
        } else {
          // 投注仍在等待中
          updatedCurrentBets.push(currentBet)
        }
      }
      
      // 更新当前投注列表
      if (hasSettledBets) {
        currentBets.value = updatedCurrentBets
        console.log('同步完成，当前投注数:', currentBets.value.length)
        
        // 如果没有当前投注了，停止自动刷新
        if (currentBets.value.length === 0) {
          console.log('所有投注已结算，停止自动刷新')
          shouldStopRefresh.value = true
          stopAutoRefresh()
        }
      }
    }
    
    gameHistory.value = formattedHistory.slice(0, 10) // 只显示最近10条记录
    console.log('投注历史加载完成:', formattedHistory.length, '条记录')
  } catch (error) {
    console.error('加载投注历史失败:', error)
  }
}

/**
 * 获取代币符号
 * @param {string} tokenAddress - 代币地址标识
 * @returns {string} 代币符号
 */
const getTokenSymbol = (tokenAddress) => {
  const token = tokenOptions.find(t => t.value === tokenAddress)
  return token ? token.symbol : 'Unknown'
}

/**
 * 获取结果颜色类
 * @param {boolean} isWinner - 是否中奖
 * @returns {string} CSS类名
 */
const getResultClass = (isWinner) => {
  return isWinner ? 'result-win' : 'result-lose'
}

// 组件挂载时初始化
onMounted(async () => {
  console.log('GamePage 组件已挂载')
  
  if (props.isWalletConnected) {
    // 1. 初始化投注服务
    const success = await initializeBettingService()
    if (success) {
      // 2. 加载历史投注记录
      await loadBettingHistory()
      
      // 3. 如果有当前投注，启动自动刷新
      if (currentBets.value.length > 0) {
        startAutoRefresh()
      }
    } else {
      // 初始化失败时启动自动重试机制
      console.log('初始化失败，启动自动重试机制')
      startAutoRetry()
    }
  }
})

// 组件卸载时清理
onUnmounted(() => {
  // 清理自动刷新定时器
  stopAutoRefresh()
  
  // 清理自动重试定时器
  if (retryInterval.value) {
    clearInterval(retryInterval.value)
    retryInterval.value = null
  }
  
  // 清理手动刷新防抖定时器
  if (manualRefreshTimeout) {
    clearTimeout(manualRefreshTimeout)
    manualRefreshTimeout = null
  }
  
  // 清理事件监听器，防止内存泄漏
  if (betSettledListener) {
    betSettledListener() // 调用取消监听的函数
    betSettledListener = null
  }
  console.log('GamePage 组件已卸载')
})

/**
 * 手动重新初始化服务
 */
const retryInitialization = async () => {
  isLoading.value = true
  
  // 停止自动重试，进行手动重试
  if (retryInterval.value) {
    clearInterval(retryInterval.value)
    retryInterval.value = null
  }
  autoRetryCount.value = 0
  
  try {
    const success = await initializeBettingService()
    if (success) {
      await loadBettingHistory()
      alert('投注服务初始化成功！')
    } else {
      // 手动重试失败后，重新启动自动重试
      startAutoRetry()
    }
  } catch (error) {
    console.error('重新初始化失败:', error)
    // 手动重试失败后，重新启动自动重试
    startAutoRetry()
  } finally {
    isLoading.value = false
  }
}

// 监听钱包连接状态变化
const handleWalletConnectionChange = async () => {
  if (props.isWalletConnected && !isServiceInitialized.value) {
    // 钱包连接时重新初始化
    const success = await initializeBettingService()
    if (success) {
      await loadBettingHistory()
    } else {
      // 初始化失败时启动自动重试
      startAutoRetry()
    }
  } else if (!props.isWalletConnected) {
    // 钱包断开时清理所有状态
    isServiceInitialized.value = false
    currentBets.value = []
    gameHistory.value = []
    autoRetryCount.value = 0
    
    // 清理定时器
    if (retryInterval.value) {
      clearInterval(retryInterval.value)
      retryInterval.value = null
    }
    
    if (betSettledListener) {
      betSettledListener.removeAllListeners()
      betSettledListener = null
    }
  }
}

// 监听当前投注数量变化 - 修复无限刷新问题
watch(() => currentBets.value.length, (newLength, oldLength) => {
  console.log(`当前投注数量变化: ${oldLength} -> ${newLength}`)
  
  // 防止在初始化时触发
  if (oldLength === undefined) {
    return
  }
  
  // 只有在服务已初始化且钱包已连接时才处理
  if (!isServiceInitialized.value || !props.walletAddress) {
    console.log('服务未初始化或钱包未连接，跳过投注数量变化处理')
    return
  }
  
  if (newLength > 0 && oldLength === 0) {
    // 从无投注变为有投注，重置停止标志并启动自动刷新
    console.log('启动自动刷新：有新投注')
    shouldStopRefresh.value = false // 重置停止刷新标志
    nextTick(() => {
      // 再次检查条件，确保启动时机正确
      if (currentBets.value.length > 0 && !refreshInterval.value && !shouldStopRefresh.value) {
        startAutoRefresh()
      }
    })
  } else if (newLength === 0 && oldLength > 0) {
    // 从有投注变为无投注，设置停止标志并停止自动刷新
    console.log('停止自动刷新：无当前投注')
    shouldStopRefresh.value = true
    stopAutoRefresh()
  }
}, { flush: 'post' }) // 确保在DOM更新后执行

// 监听钱包连接状态变化
watch(() => props.isWalletConnected, (newValue, oldValue) => {
  if (newValue && !oldValue) {
    // 钱包刚连接，启动初始化
    handleWalletConnectionChange()
  } else if (!newValue && oldValue) {
    // 钱包断开连接，停止自动刷新
    stopAutoRefresh()
    handleWalletConnectionChange()
  }
})

// 监听服务初始化状态，如果未初始化且钱包已连接，启动自动重试
watch([() => isServiceInitialized.value, () => props.isWalletConnected], ([initialized, connected]) => {
  if (!initialized && connected && !retryInterval.value && !isAutoRetrying.value) {
    console.log('检测到服务未初始化，启动自动重试机制')
    startAutoRetry()
  }
})

// 暴露方法给父组件
defineExpose({
  initializeBettingService,
  loadBettingHistory,
  handleWalletConnectionChange,
  retryInitialization,
  startAutoRefresh,
  stopAutoRefresh
})


</script>

<template>
  <div class="game-page">
    <div class="page-header">
      <h2 class="page-title">单双投注游戏</h2>
      <p class="page-subtitle">选择单数或双数，赔率 1:1.9</p>
    </div>

    <!-- 投注区域 -->
    <div class="betting-section">
      <div class="betting-card">
        <h3 class="card-title">投注设置</h3>
        
        <!-- 代币选择 -->
        <div class="form-group">
          <label class="form-label">选择代币</label>
          <div class="token-selector">
            <div 
              v-for="token in tokenOptions" 
              :key="token.value"
              class="token-option"
              :class="{ active: betForm.tokenAddress === token.value }"
              @click="betForm.tokenAddress = token.value"
            >
              <span class="token-symbol">{{ token.symbol }}</span>
              <span class="token-label">{{ token.label }}</span>
            </div>
          </div>
        </div>

        <!-- 投注金额 -->
        <div class="form-group">
          <label class="form-label">投注金额 (限额1-1000)</label>
          <div class="amount-input-group">
            <input 
              v-model="betForm.betAmount"
              type="number" 
              class="amount-input"
              placeholder="输入投注金额"
              min="1"
              max="1000"
              step="0.01"
            >
            <span class="input-suffix">{{ getTokenSymbol(betForm.tokenAddress) }}</span>
          </div>
          
          <!-- 预设金额按钮 -->
          <div class="amount-presets">
            <button 
              v-for="amount in amountPresets"
              :key="amount"
              class="preset-btn"
              @click="setPresetAmount(amount)"
            >
              {{ amount }}
            </button>
          </div>
        </div>

        <!-- 单双选择 -->
        <div class="form-group">
          <label class="form-label">选择单双</label>
          <div class="choice-selector">
            <button 
              class="choice-btn"
              :class="{ active: !betForm.isEvenChoice }"
              @click="setChoice(false)"
            >
              <span class="choice-text">单数</span>
              <span class="choice-desc">1, 3, 5, 7, 9</span>
            </button>
            <button 
              class="choice-btn"
              :class="{ active: betForm.isEvenChoice }"
              @click="setChoice(true)"
            >
              <span class="choice-text">双数</span>
              <span class="choice-desc">2, 4, 6, 8, 10</span>
            </button>
          </div>
        </div>

        <!-- 投注按钮 -->
        <button 
          class="submit-btn"
          :disabled="!props.isWalletConnected || isLoading"
          @click="submitBet"
        >
          <span v-if="isLoading" class="loading-spinner"></span>
          {{ isLoading ? '投注中...' : '确认投注' }}
        </button>
        
        <!-- 游戏信息 -->
        <div class="game-info">
          <div class="info-item">
            <span class="label">当前投注:</span>
            <span class="value">{{ currentBets.length }}</span>
          </div>
          <div class="info-item">
            <span class="label">历史记录:</span>
            <span class="value">{{ gameHistory.length }}</span>
          </div>
          <div class="info-item">
            <span class="label">VRF费用:</span>
            <span class="value">{{ vrfCost }} S</span>
          </div>
          <div class="info-item">
            <span class="label">服务状态:</span>
            <span class="value" :class="{ 
              'status-ready': isServiceInitialized, 
              'status-error': !isServiceInitialized,
              'status-retrying': isAutoRetrying
            }">
              {{ isServiceInitialized ? '已就绪' : (isAutoRetrying ? '自动重试中...' : '未初始化') }}
            </span>
          </div>
          <!-- 显示自动重试信息 -->
          <div v-if="!isServiceInitialized && props.isWalletConnected" class="info-item">
            <span class="label">自动重试:</span>
            <span class="value">{{ autoRetryCount }}/{{ maxAutoRetries }}</span>
          </div>
          <!-- 显示自动刷新状态 -->
          <div v-if="currentBets.length > 0" class="info-item">
            <span class="label">自动刷新:</span>
            <span class="value" :class="{ 'status-refreshing': isAutoRefreshing }">
              {{ isAutoRefreshing ? '刷新中...' : '已启用' }}
            </span>
          </div>
        </div>
        
        <!-- 服务未初始化时显示重试按钮和自动重试状态 -->
        <div v-if="!isServiceInitialized && props.isWalletConnected" class="retry-section">
          <div v-if="isAutoRetrying" class="auto-retry-info">
            <div class="retry-spinner"></div>
            <p class="retry-message">正在自动重试初始化服务... ({{ autoRetryCount }}/{{ maxAutoRetries }})</p>
          </div>
          <div v-else>
            <p class="retry-message">
              投注服务未初始化
              <span v-if="autoRetryCount > 0">，已自动重试 {{ autoRetryCount }} 次</span>
              ，您也可以手动重试
            </p>
            <button 
              class="retry-btn"
              :disabled="isLoading"
              @click="retryInitialization"
            >
              <span v-if="isLoading" class="loading-spinner"></span>
              {{ isLoading ? '初始化中...' : '手动重新初始化' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 当前投注状态 -->
    <div v-if="currentBets.length > 0" class="current-bets">
      <div class="section-header">
        <h3 class="section-title">当前投注</h3>
        <div class="refresh-info">
          <span class="refresh-status" :class="{ 'refreshing': isAutoRefreshing }">
            {{ isAutoRefreshing ? '刷新中...' : '自动刷新已启用' }}
          </span>
          <span class="refresh-time">
            上次刷新: {{ new Date(lastRefreshTime).toLocaleTimeString() }}
          </span>
          <button 
            class="manual-refresh-btn"
            :disabled="isAutoRefreshing || isManualRefreshing"
            @click="manualRefresh"
            :title="isManualRefreshing ? '正在刷新中...' : '手动刷新投注状态'"
          >
            <span v-if="isManualRefreshing">⏳ 刷新中...</span>
            <span v-else>🔄 手动刷新</span>
          </button>
        </div>
      </div>
      <div class="bets-list">
        <div v-for="bet in currentBets" :key="bet.id" class="bet-item" :class="{ 'pending': bet.status === '等待开奖', 'settled': bet.status !== '等待开奖' }">
          <div class="bet-header">
            <div class="bet-info">
              <span class="bet-amount">{{ bet.amount }} {{ bet.tokenSymbol }}</span>
              <span class="bet-choice">{{ bet.choice }}</span>
            </div>
            <div class="bet-status">
              <span class="status-text" :class="{
                'status-pending': bet.status === '等待开奖',
                'status-win': bet.status === '中奖',
                'status-lose': bet.status === '再接再励'
              }">{{ bet.status }}</span>
              <div v-if="bet.status === '等待开奖'" class="loading-dots"></div>
            </div>
          </div>
          
          <!-- 开奖结果详情 (已结算) -->
          <div v-if="bet.status !== '等待开奖'" class="bet-result-details">
            <div class="result-row">
              <span class="result-label">开奖结果:</span>
              <span class="result-value dice-result">{{ bet.diceResult ? '双数' : '单数' }}</span>
            </div>
            <div class="result-row">
              <span class="result-label">游戏结果:</span>
              <span class="result-value" :class="bet.isWinner ? 'win-text' : 'lose-text'">
                {{ bet.isWinner ? '🎉 中奖' : '😔 未中奖' }}
              </span>
            </div>
            <div v-if="bet.isWinner && bet.payout" class="result-row">
              <span class="result-label">奖金:</span>
              <span class="result-value payout-amount">{{ bet.payout }} {{ bet.tokenSymbol }}</span>
            </div>
            <div class="result-row">
              <span class="result-label">结算时间:</span>
              <span class="result-value">{{ bet.settledAt || '刚刚' }}</span>
            </div>
          </div>
          
          <!-- 等待开奖信息 -->
          <div v-else class="bet-waiting-info">
            <div class="result-row">
              <span class="result-label">状态:</span>
              <span class="result-value">正在等待开奖结果...</span>
            </div>
            <div class="loading-indicator">
              <div class="loading-dots"></div>
              <span>开奖中，请稍候</span>
            </div>
          </div>
          
          <div class="bet-time">
            <span class="time-label">投注时间:</span>
            <span class="time-value">{{ bet.timestamp }}</span>
          </div>
          
          <!-- 请求ID信息 -->
          <div class="bet-meta">
            <span class="meta-label">请求ID:</span>
            <span class="meta-value">{{ bet.requestId || '生成中...' }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏历史记录 -->
    <div class="history-section">
      <h3 class="section-title">开奖历史记录</h3>
      <div class="history-list">
        <div v-if="gameHistory.length === 0" class="empty-state">
          <p>暂无历史记录</p>
        </div>
        <div v-else>
          <div v-for="record in gameHistory" :key="record.id" class="history-item">
            <div class="history-header">
              <span class="history-time">{{ record.timestamp }}</span>
              <span class="history-result" :class="getResultClass(record.isWinner)">
                {{ record.status }}
              </span>
            </div>
            <div class="history-details">
              <div class="detail-row">
                <span class="detail-label">用户投注金额:</span>
                <span class="detail-value">{{ record.betAmount }} {{ record.tokenSymbol }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">用户选择:</span>
                <span class="detail-value">{{ record.choice }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">开奖结果:</span>
                <span class="detail-value">{{ record.diceResult ? '双数' : '单数' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">游戏结果:</span>
                <span class="detail-value" :class="record.shouldWin ? 'should-win' : 'should-lose'">
                  {{ record.shouldWin ? '中奖' : '再接再励' }}
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">随机数请求ID:</span>
                <div class="request-id-container">
                  <span class="detail-value request-id">{{ formatRequestId(record.requestId) }}</span>
                  <button 
                    class="copy-btn" 
                    :class="{ 'copying': isCopying }"
                    @click="copyRequestId(record.requestId)"
                    :disabled="isCopying"
                    :title="isCopying ? '复制中...' : '复制完整请求ID'"
                  >
                    {{ isCopying ? '⏳' : '📋' }}
                  </button>
                </div>
              </div>
              <div class="detail-row">
                <span class="detail-label">创建时间戳:</span>
                <span class="detail-value">{{ record.timestamp }}</span>
              </div>
              <div v-if="record.isWinner" class="detail-row">
                <span class="detail-label">奖金:</span>
                <span class="detail-value win">{{ record.payout }} {{ record.tokenSymbol }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-page {
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-title {
  font-size: 28px;
  color: #FFD700;
  margin: 0 0 10px 0;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.page-subtitle {
  color: #cccccc;
  margin: 0;
  font-size: 16px;
}

.betting-section {
  margin-bottom: 30px;
}

.betting-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 25px;
  backdrop-filter: blur(10px);
}

.card-title {
  color: #FFD700;
  font-size: 20px;
  margin: 0 0 20px 0;
  text-align: center;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  color: #FFD700;
  font-weight: bold;
  margin-bottom: 10px;
  font-size: 14px;
}

.token-selector {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.token-option {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.token-option:hover {
  background: rgba(255, 215, 0, 0.1);
  transform: translateY(-2px);
}

.token-option.active {
  background: rgba(255, 215, 0, 0.2);
  border-color: #FFD700;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.token-symbol {
  display: block;
  color: #FFD700;
  font-weight: bold;
  font-size: 16px;
}

.token-label {
  display: block;
  color: #cccccc;
  font-size: 12px;
  margin-top: 4px;
}

.amount-input-group {
  position: relative;
  display: flex;
  align-items: center;
}

.amount-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
  padding: 12px 60px 12px 15px;
  color: #ffffff;
  font-size: 16px;
  outline: none;
  transition: all 0.3s ease;
}

.amount-input:focus {
  border-color: #FFD700;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}

.input-suffix {
  position: absolute;
  right: 15px;
  color: #FFD700;
  font-weight: bold;
  pointer-events: none;
}

.amount-presets {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.preset-btn {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #FFD700;
  padding: 6px 12px;
  border-radius: 15px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.preset-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-1px);
}

.choice-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.choice-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
  padding: 15px;
  cursor: pointer;
  transition: all 0.3s ease;
  text-align: center;
}

.choice-btn:hover {
  background: rgba(255, 215, 0, 0.1);
  transform: translateY(-2px);
}

.choice-btn.active {
  background: rgba(255, 215, 0, 0.2);
  border-color: #FFD700;
  box-shadow: 0 0 15px rgba(255, 215, 0, 0.3);
}

.choice-text {
  display: block;
  color: #FFD700;
  font-weight: bold;
  font-size: 18px;
  margin-bottom: 5px;
}

.choice-desc {
  display: block;
  color: #cccccc;
  font-size: 12px;
}

.submit-btn {
  width: 100%;
  background: linear-gradient(45deg, #FFD700, #FFA500);
  border: none;
  color: #000000;
  padding: 15px;
  border-radius: 10px;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #000000;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.current-bets,
.history-section {
  margin-bottom: 30px;
}

.section-title {
  color: #FFD700;
  font-size: 20px;
  margin: 0 0 15px 0;
  text-align: center;
}

.bets-list,
.history-list {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 20px;
}

.bet-item {
  background: rgba(255, 215, 0, 0.1);
  border-radius: 10px;
  margin-bottom: 15px;
  padding: 15px;
  border: 1px solid rgba(255, 215, 0, 0.2);
  transition: all 0.3s ease;
}

.bet-item.pending {
  border-color: rgba(255, 165, 0, 0.4);
  background: rgba(255, 165, 0, 0.1);
}

.bet-item.settled {
  border-color: rgba(0, 255, 136, 0.4);
  background: rgba(0, 255, 136, 0.05);
}

.bet-item:last-child {
  margin-bottom: 0;
}

.bet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.bet-info {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.bet-amount {
  color: #FFD700;
  font-weight: bold;
  font-size: 16px;
}

.bet-choice {
  color: #cccccc;
  font-size: 14px;
}

.bet-status {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 开奖结果详情样式 */
.bet-result-details {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  padding: 12px;
  margin: 10px 0;
  border: 1px solid rgba(255, 215, 0, 0.1);
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
}

.result-row:last-child {
  border-bottom: none;
}

.result-label {
  color: #cccccc;
  font-size: 13px;
  font-weight: 500;
}

.result-value {
  color: #ffffff;
  font-size: 13px;
  font-weight: bold;
}

.dice-result {
  color: #FFD700;
  background: rgba(255, 215, 0, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.win-text {
  color: #00ff88;
}

.lose-text {
  color: #ff6b6b;
}

.payout-amount {
  color: #00ff88;
  font-weight: bold;
  background: rgba(0, 255, 136, 0.1);
  padding: 2px 8px;
  border-radius: 12px;
}

/* 投注元信息样式 */
.bet-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 215, 0, 0.1);
}

.meta-label {
  color: #999999;
  font-size: 11px;
}

.meta-value {
  color: #cccccc;
  font-size: 11px;
  font-family: monospace;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 等待开奖信息样式 */
.bet-waiting-info {
  margin-top: 12px;
  padding: 12px;
  background: rgba(255, 165, 0, 0.1);
  border-radius: 8px;
  border-left: 3px solid #FFA500;
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #FFA500;
  font-size: 14px;
}

.loading-indicator .loading-dots {
  width: 16px;
  height: 16px;
}

/* 手动刷新按钮样式 */
.manual-refresh-btn {
  background: linear-gradient(135deg, #FFD700, #FFA500);
  color: #000;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-left: 10px;
}

.manual-refresh-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #FFA500, #FF8C00);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 215, 0, 0.3);
}

.manual-refresh-btn:disabled {
  background: #666;
  color: #999;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  opacity: 0.6;
}

.manual-refresh-btn:disabled:hover {
  background: #666;
  transform: none;
  box-shadow: none;
}

/* 刷新中状态的动画效果 */
.manual-refresh-btn span {
  display: inline-block;
  transition: all 0.3s ease;
}

.manual-refresh-btn:disabled span {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

.status-text {
  color: #ffffff;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 12px;
  font-weight: bold;
}

.status-pending {
  background: rgba(255, 165, 0, 0.2);
  color: #FFA500;
}

.status-win {
  background: rgba(0, 255, 136, 0.2);
  color: #00ff88;
}

.status-lose {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
}

.loading-dots {
  width: 20px;
  height: 20px;
  position: relative;
}

.loading-dots::before {
  content: '';
  position: absolute;
  width: 4px;
  height: 4px;
  background: #FFD700;
  border-radius: 50%;
  animation: dots 1.4s infinite ease-in-out both;
}

.loading-dots::after {
  content: '';
  position: absolute;
  width: 4px;
  height: 4px;
  background: #FFD700;
  border-radius: 50%;
  left: 8px;
  animation: dots 1.4s infinite ease-in-out both;
  animation-delay: 0.2s;
}

@keyframes dots {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.empty-state {
  text-align: center;
  color: #666666;
  padding: 40px 20px;
}

.history-item {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 15px;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.history-item:last-child {
  margin-bottom: 0;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-time {
  color: #cccccc;
  font-size: 12px;
}

.history-result {
  font-weight: bold;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 12px;
}

.result-win {
  background: rgba(0, 255, 0, 0.2);
  color: #00ff00;
}

.result-lose {
  background: rgba(255, 0, 0, 0.2);
  color: #ff4444;
}

.history-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  color: #cccccc;
  font-size: 14px;
}

.detail-value {
  color: #ffffff;
  font-size: 14px;
}

.detail-value.win {
  color: #00ff00;
  font-weight: bold;
}

.detail-value.should-win {
  color: #00ff88;
  font-weight: bold;
}

.detail-value.should-lose {
  color: #ff6b6b;
  font-weight: bold;
}

.request-id-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.request-id {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #a0a0a0;
  word-break: break-all;
  background: rgba(255, 255, 255, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 215, 0, 0.2);
  flex: 1;
}

.copy-btn {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 12px;
  color: #FFD700;
  transition: all 0.2s ease;
  min-width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.copy-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  border-color: rgba(255, 215, 0, 0.5);
  transform: scale(1.05);
}

.copy-btn:active {
  transform: scale(0.95);
}

.copy-btn:disabled,
.copy-btn.copying {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.copy-btn:disabled:hover,
.copy-btn.copying:hover {
  background: rgba(255, 215, 0, 0.1);
  border-color: rgba(255, 215, 0, 0.3);
  transform: none;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 215, 0, 0.1);
}

.info-item:last-child {
  border-bottom: none;
}

.label {
  color: #cccccc;
  font-size: 14px;
}

.value {
  color: #FFD700;
  font-weight: bold;
  font-size: 14px;
}

.status-ready {
  color: #00ff88 !important;
}

.status-error {
  color: #ff4444 !important;
}

/* 新增样式 */
.status-retrying {
  color: #FFA500 !important;
  animation: pulse 1.5s infinite;
}

.auto-retry-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding: 15px;
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 10px;
}

.retry-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 165, 0, 0.3);
  border-top: 2px solid #FFA500;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.game-info {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 215, 0, 0.2);
  border-radius: 10px;
  padding: 15px;
  margin-top: 20px;
}

.retry-section {
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid rgba(255, 68, 68, 0.3);
  border-radius: 10px;
  padding: 20px;
  margin-top: 20px;
  text-align: center;
}

.retry-message {
  color: #cccccc;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
}

.retry-btn {
  background: linear-gradient(135deg, #FFA500, #FF8C00);
  border: none;
  border-radius: 10px;
  padding: 12px 20px;
  color: white;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.retry-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #FF8C00, #FF7F00);
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(255, 165, 0, 0.3);
}

.retry-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* 新增自动刷新相关样式 */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.refresh-info {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 12px;
  color: #cccccc;
}

.refresh-status {
  color: #4CAF50;
  font-weight: bold;
  margin-bottom: 2px;
}

.refresh-status.refreshing {
  color: #FFA500;
  animation: pulse 1.5s infinite;
}

.refresh-time {
  color: #999999;
}

.status-refreshing {
  color: #FFA500 !important;
  animation: pulse 1.5s infinite;
}

.bet-item {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 10px;
  padding: 15px;
  margin-bottom: 10px;
  transition: all 0.3s ease;
}

.bet-item.pending {
  border-color: rgba(255, 165, 0, 0.5);
  background: rgba(255, 165, 0, 0.05);
}

.bet-time {
  margin-top: 8px;
  font-size: 12px;
  color: #999999;
}

.time-label {
  margin-right: 5px;
}

.time-value {
  color: #cccccc;
}

.loading-dots {
  display: inline-block;
  width: 20px;
  height: 4px;
  background: linear-gradient(90deg, 
    transparent 0%, 
    #FFA500 25%, 
    #FFA500 75%, 
    transparent 100%);
  background-size: 200% 100%;
  animation: loading-slide 1.5s infinite;
  border-radius: 2px;
  margin-left: 8px;
}

@keyframes loading-slide {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* 通知样式 */
.notification {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

@media (max-width: 768px) {
  .choice-selector {
    grid-template-columns: 1fr;
  }
  
  .token-selector {
    grid-template-columns: 1fr;
  }
  
  .amount-presets {
    justify-content: center;
  }
  
  .history-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }
  
  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .refresh-info {
    align-items: flex-start;
  }
}
</style>