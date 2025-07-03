<script setup>
import { ref, reactive, computed, onMounted } from 'vue'

// 定义props
const props = defineProps({
  isWalletConnected: Boolean
})

// 挖矿数据状态
const miningData = reactive({
  todayTotalMining: 0, // 今日挖矿总MLHG积分
  myTotalMining: 0, // 我的挖矿总MLHG积分
  myPendingMining: 0, // 我的未领取挖矿MLHG积分
  currentRatio: 1000, // 当前分发比例 (MLHG:投注金额)
  daysSinceStart: 1, // 开始挖矿的天数
  lastUpdateTime: new Date().toLocaleString()
})

// 挖矿历史记录
const miningHistory = ref([])

// 加载状态
const isLoading = ref(false)
const isWithdrawing = ref(false)

// 挖矿规则信息
const miningRules = {
  initialRatio: 1000, // 初始比例 1000:1
  dailyDecrease: 0.5, // 每天减少0.5%
  description: '每完成一笔投注，即可获得相应的挖矿奖励'
}

/**
 * 计算当前挖矿比例
 * @returns {number} 当前比例
 */
const getCurrentRatio = computed(() => {
  const decreaseRate = miningRules.dailyDecrease / 100
  const currentRatio = miningRules.initialRatio * Math.pow(1 - decreaseRate, miningData.daysSinceStart - 1)
  return Math.round(currentRatio * 100) / 100
})

/**
 * 格式化数字显示
 * @param {number} num - 要格式化的数字
 * @returns {string} 格式化后的字符串
 */
const formatNumber = (num) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(2) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(2) + 'K'
  }
  return num.toFixed(2)
}

/**
 * 提取挖矿积分
 */
const withdrawMining = async () => {
  if (!props.isWalletConnected) {
    alert('请先连接钱包')
    return
  }

  if (miningData.myPendingMining <= 0) {
    alert('暂无可提取的积分')
    return
  }

  isWithdrawing.value = true

  try {
    // 这里应该调用智能合约的withdraw函数
    await simulateWithdraw()
    
    alert(`成功提取 ${miningData.myPendingMining.toFixed(2)} MLHG积分！`)
    
    // 更新数据
    miningData.myTotalMining += miningData.myPendingMining
    miningData.myPendingMining = 0
    miningData.lastUpdateTime = new Date().toLocaleString()
    
    // 添加提取记录
    addWithdrawRecord()
    
  } catch (error) {
    console.error('提取失败:', error)
    alert('提取失败，请重试')
  } finally {
    isWithdrawing.value = false
  }
}

/**
 * 模拟提取过程
 */
const simulateWithdraw = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, 2000)
  })
}

/**
 * 添加提取记录
 */
const addWithdrawRecord = () => {
  const record = {
    id: Date.now(),
    type: 'withdraw',
    amount: miningData.myPendingMining,
    timestamp: new Date().toLocaleString(),
    txHash: '0x' + Math.random().toString(16).substr(2, 40) // 模拟交易哈希
  }
  
  miningHistory.value.unshift(record)
  
  // 限制历史记录数量
  if (miningHistory.value.length > 20) {
    miningHistory.value = miningHistory.value.slice(0, 20)
  }
}

/**
 * 刷新挖矿数据
 */
const refreshMiningData = async () => {
  if (!props.isWalletConnected) {
    alert('请先连接钱包')
    return
  }

  isLoading.value = true

  try {
    // 这里应该调用智能合约获取实际数据
    await loadMiningData()
    miningData.lastUpdateTime = new Date().toLocaleString()
    alert('数据刷新成功')
  } catch (error) {
    console.error('刷新失败:', error)
    alert('刷新失败，请重试')
  } finally {
    isLoading.value = false
  }
}

/**
 * 加载挖矿数据
 */
const loadMiningData = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 模拟数据
      miningData.todayTotalMining = 125000 + Math.random() * 50000
      miningData.myTotalMining = 2500 + Math.random() * 1000
      miningData.myPendingMining = 150 + Math.random() * 100
      miningData.currentRatio = getCurrentRatio.value
      resolve()
    }, 1000)
  })
}

/**
 * 加载挖矿历史
 */
const loadMiningHistory = () => {
  // 模拟历史数据
  miningHistory.value = [
    {
      id: 1,
      type: 'mining',
      amount: 50,
      timestamp: new Date(Date.now() - 3600000).toLocaleString(),
      description: '投注奖励'
    },
    {
      id: 2,
      type: 'withdraw',
      amount: 200,
      timestamp: new Date(Date.now() - 7200000).toLocaleString(),
      txHash: '0x1234567890abcdef1234567890abcdef12345678'
    },
    {
      id: 3,
      type: 'mining',
      amount: 100,
      timestamp: new Date(Date.now() - 10800000).toLocaleString(),
      description: '投注奖励'
    }
  ]
}

/**
 * 复制交易哈希
 * @param {string} hash - 交易哈希
 */
const copyTxHash = async (hash) => {
  try {
    await navigator.clipboard.writeText(hash)
    alert('交易哈希已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
  }
}

/**
 * 获取记录类型显示文本
 * @param {string} type - 记录类型
 * @returns {string} 显示文本
 */
const getRecordTypeText = (type) => {
  return type === 'mining' ? '挖矿奖励' : '积分提取'
}

/**
 * 获取记录类型样式类
 * @param {string} type - 记录类型
 * @returns {string} CSS类名
 */
const getRecordTypeClass = (type) => {
  return type === 'mining' ? 'record-mining' : 'record-withdraw'
}

// 组件挂载时加载数据
onMounted(() => {
  if (props.isWalletConnected) {
    loadMiningData()
  }
  loadMiningHistory()
})
</script>

<template>
  <div class="mining-page">
    <div class="page-header">
      <h2 class="page-title">MLHG积分挖矿</h2>
      <p class="page-subtitle">每笔投注都能获得MLHG积分奖励</p>
    </div>

    <!-- 挖矿统计卡片 -->
    <div class="stats-grid">
      <!-- 今日挖矿总积分 -->
      <div class="stat-card">
        <div class="stat-header">
          <h3 class="stat-title">今日挖矿总积分</h3>
          <div class="stat-icon today">📊</div>
        </div>
        <div class="stat-value">{{ formatNumber(miningData.todayTotalMining) }}</div>
        <div class="stat-unit">MLHG</div>
        <div class="stat-desc">全网今日累计挖矿积分</div>
      </div>

      <!-- 我的挖矿总积分 -->
      <div class="stat-card">
        <div class="stat-header">
          <h3 class="stat-title">我的挖矿总积分</h3>
          <div class="stat-icon total">💎</div>
        </div>
        <div class="stat-value">{{ formatNumber(miningData.myTotalMining) }}</div>
        <div class="stat-unit">MLHG</div>
        <div class="stat-desc">历史累计获得积分</div>
      </div>

      <!-- 我的未领取积分 -->
      <div class="stat-card pending">
        <div class="stat-header">
          <h3 class="stat-title">未领取积分</h3>
          <div class="stat-icon pending">🎁</div>
        </div>
        <div class="stat-value">{{ formatNumber(miningData.myPendingMining) }}</div>
        <div class="stat-unit">MLHG</div>
        <div class="stat-desc">可提取的积分余额</div>
      </div>
    </div>

    <!-- 挖矿规则说明 -->
    <div class="rules-section">
      <h3 class="section-title">挖矿规则</h3>
      <div class="rules-card">
        <div class="rule-item">
          <div class="rule-icon">⚡</div>
          <div class="rule-content">
            <h4 class="rule-title">投注即挖矿</h4>
            <p class="rule-desc">{{ miningRules.description }}</p>
          </div>
        </div>
        
        <div class="rule-item">
          <div class="rule-icon">📈</div>
          <div class="rule-content">
            <h4 class="rule-title">动态比例</h4>
            <p class="rule-desc">
              当前比例: 1 {{ getCurrentRatio.toFixed(2) }}:1 MLHG
              <br>
              <small>分发比例每天减少{{ miningRules.dailyDecrease }}%</small>
            </p>
          </div>
        </div>
        
        <div class="rule-item">
          <div class="rule-icon">💰</div>
          <div class="rule-content">
            <h4 class="rule-title">随时提取</h4>
            <p class="rule-desc">积分可随时提取，仅需支付链上手续费</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作按钮区域 -->
    <div class="actions-section">
      <button 
        class="action-btn primary"
        :disabled="!props.isWalletConnected || isWithdrawing || miningData.myPendingMining <= 0"
        @click="withdrawMining"
      >
        <span v-if="isWithdrawing" class="loading-spinner"></span>
        {{ isWithdrawing ? '提取中...' : '提取积分' }}
      </button>
      
      <button 
        class="action-btn secondary"
        :disabled="!props.isWalletConnected || isLoading"
        @click="refreshMiningData"
      >
        <span v-if="isLoading" class="loading-spinner"></span>
        {{ isLoading ? '刷新中...' : '刷新数据' }}
      </button>
    </div>

    <!-- 数据更新时间 -->
    <div class="update-time">
      <span class="update-label">最后更新:</span>
      <span class="update-value">{{ miningData.lastUpdateTime }}</span>
    </div>

    <!-- 挖矿历史记录 -->
    <div class="history-section">
      <h3 class="section-title">挖矿历史</h3>
      <div class="history-list">
        <div v-if="miningHistory.length === 0" class="empty-state">
          <p>暂无历史记录</p>
        </div>
        <div v-else>
          <div v-for="record in miningHistory" :key="record.id" class="history-item">
            <div class="history-header">
              <div class="history-type" :class="getRecordTypeClass(record.type)">
                {{ getRecordTypeText(record.type) }}
              </div>
              <div class="history-amount">
                <span class="amount-value">{{ record.amount.toFixed(2) }}</span>
                <span class="amount-unit">MLHG</span>
              </div>
            </div>
            
            <div class="history-details">
              <div class="detail-time">{{ record.timestamp }}</div>
              <div v-if="record.description" class="detail-desc">{{ record.description }}</div>
              <div v-if="record.txHash" class="detail-hash" @click="copyTxHash(record.txHash)">
                <span class="hash-label">交易哈希:</span>
                <span class="hash-value">{{ record.txHash.slice(0, 10) }}...{{ record.txHash.slice(-8) }}</span>
                <span class="copy-icon">📋</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mining-page {
  max-width: 1000px;
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

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 25px;
  backdrop-filter: blur(10px);
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(255, 215, 0, 0.2);
}

.stat-card.pending {
  border-color: #00FF00;
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.1);
}

.stat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.stat-title {
  color: #FFD700;
  font-size: 14px;
  margin: 0;
  font-weight: 500;
}

.stat-icon {
  font-size: 24px;
  opacity: 0.8;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 5px;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.stat-unit {
  color: #FFD700;
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 10px;
}

.stat-desc {
  color: #cccccc;
  font-size: 12px;
  line-height: 1.4;
}

.rules-section {
  margin-bottom: 30px;
}

.section-title {
  color: #FFD700;
  font-size: 20px;
  margin: 0 0 15px 0;
  text-align: center;
}

.rules-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 25px;
  backdrop-filter: blur(10px);
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 15px;
  margin-bottom: 20px;
}

.rule-item:last-child {
  margin-bottom: 0;
}

.rule-icon {
  font-size: 24px;
  margin-top: 2px;
}

.rule-content {
  flex: 1;
}

.rule-title {
  color: #FFD700;
  font-size: 16px;
  margin: 0 0 8px 0;
  font-weight: bold;
}

.rule-desc {
  color: #cccccc;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.rule-desc small {
  color: #999999;
  font-size: 12px;
}

.actions-section {
  display: flex;
  gap: 15px;
  justify-content: center;
  margin-bottom: 20px;
}

.action-btn {
  padding: 12px 30px;
  border-radius: 25px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 140px;
  justify-content: center;
}

.action-btn.primary {
  background: linear-gradient(45deg, #00FF00, #00CC00);
  color: #000000;
  box-shadow: 0 4px 15px rgba(0, 255, 0, 0.3);
}

.action-btn.primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 255, 0, 0.4);
}

.action-btn.secondary {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid #FFD700;
  color: #FFD700;
}

.action-btn.secondary:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-2px);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.update-time {
  text-align: center;
  margin-bottom: 30px;
  color: #cccccc;
  font-size: 12px;
}

.update-label {
  margin-right: 8px;
}

.update-value {
  color: #FFD700;
}

.history-section {
  margin-bottom: 30px;
}

.history-list {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 20px;
  max-height: 400px;
  overflow-y: auto;
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
  transition: all 0.3s ease;
}

.history-item:hover {
  background: rgba(255, 255, 255, 0.08);
  transform: translateX(5px);
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

.history-type {
  font-weight: bold;
  font-size: 14px;
  padding: 4px 12px;
  border-radius: 12px;
}

.record-mining {
  background: rgba(255, 215, 0, 0.2);
  color: #FFD700;
}

.record-withdraw {
  background: rgba(0, 255, 0, 0.2);
  color: #00FF00;
}

.history-amount {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.amount-value {
  font-size: 18px;
  font-weight: bold;
  color: #ffffff;
}

.amount-unit {
  font-size: 12px;
  color: #FFD700;
}

.history-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.detail-time {
  color: #cccccc;
  font-size: 12px;
}

.detail-desc {
  color: #ffffff;
  font-size: 13px;
}

.detail-hash {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 5px;
  border-radius: 5px;
  transition: all 0.3s ease;
}

.detail-hash:hover {
  background: rgba(255, 215, 0, 0.1);
}

.hash-label {
  color: #cccccc;
  font-size: 12px;
}

.hash-value {
  color: #FFD700;
  font-size: 12px;
  font-family: monospace;
}

.copy-icon {
  font-size: 12px;
  opacity: 0.7;
}

@media (max-width: 768px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .actions-section {
    flex-direction: column;
    align-items: center;
  }
  
  .action-btn {
    width: 100%;
    max-width: 300px;
  }
  
  .history-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .rule-item {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
}

@media (max-width: 480px) {
  .stat-card {
    padding: 20px;
  }
  
  .stat-value {
    font-size: 24px;
  }
  
  .rules-card {
    padding: 20px;
  }
}
</style>