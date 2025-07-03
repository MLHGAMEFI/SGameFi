<script setup>
import { ref, computed, onMounted } from 'vue'

// 定义props
const props = defineProps({
  isWalletConnected: Boolean,
  walletAddress: String,
  balances: Object
})

// 定义emits
const emit = defineEmits(['disconnect-wallet'])

// 邀请相关状态
const inviteCode = ref('')
const inviteLink = ref('')
const inviteStats = ref({
  totalInvites: 0,
  activeInvites: 0,
  totalRewards: 0
})

// 用户统计数据
const userStats = ref({
  totalBets: 0,
  totalWins: 0,
  totalLosses: 0,
  winRate: 0,
  totalVolume: 0
})

// 加载状态
const isLoading = ref(false)

/**
 * 格式化钱包地址显示
 * @param {string} address - 钱包地址
 * @returns {string} 格式化后的地址
 */
const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 8)}...${address.slice(-8)}`
}

/**
 * 计算胜率
 * @returns {string} 胜率百分比
 */
const winRatePercentage = computed(() => {
  if (userStats.value.totalBets === 0) return '0.00'
  return ((userStats.value.totalWins / userStats.value.totalBets) * 100).toFixed(2)
})

/**
 * 生成邀请链接
 */
const generateInviteLink = () => {
  if (!props.isWalletConnected) {
    alert('请先连接钱包')
    return
  }

  // 直接使用当前页面地址作为邀请链接
  const baseUrl = window.location.origin
  inviteLink.value = `${baseUrl}?invite=${props.walletAddress}`
  
  // 生成简化的邀请码用于显示
  inviteCode.value = props.walletAddress.slice(2, 8).toUpperCase()
}

/**
 * 复制文本到剪贴板
 * @param {string} text - 要复制的文本
 * @param {string} type - 复制类型（用于提示）
 */
const copyToClipboard = async (text, type = '内容') => {
  try {
    await navigator.clipboard.writeText(text)
    alert(`${type}已复制到剪贴板`)
  } catch (error) {
    console.error('复制失败:', error)
    alert('复制失败，请手动复制')
  }
}

/**
 * 断开钱包连接
 */
const handleDisconnect = () => {
  if (confirm('确定要断开钱包连接吗？')) {
    emit('disconnect-wallet')
  }
}

/**
 * 刷新用户数据
 */
const refreshUserData = async () => {
  if (!props.isWalletConnected) {
    alert('请先连接钱包')
    return
  }

  isLoading.value = true

  try {
    await loadUserData()
    alert('数据刷新成功')
  } catch (error) {
    console.error('刷新失败:', error)
    alert('刷新失败，请重试')
  } finally {
    isLoading.value = false
  }
}

/**
 * 加载用户数据
 */
const loadUserData = async () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 模拟用户统计数据
      userStats.value = {
        totalBets: 25 + Math.floor(Math.random() * 50),
        totalWins: 12 + Math.floor(Math.random() * 20),
        totalLosses: 13 + Math.floor(Math.random() * 20),
        totalVolume: 1250 + Math.random() * 2000
      }
      
      // 模拟邀请统计数据
      inviteStats.value = {
        totalInvites: Math.floor(Math.random() * 10),
        activeInvites: Math.floor(Math.random() * 5),
        totalRewards: Math.random() * 100
      }
      
      resolve()
    }, 1000)
  })
}

/**
 * 格式化数字显示
 * @param {number} num - 要格式化的数字
 * @param {number} decimals - 小数位数
 * @returns {string} 格式化后的字符串
 */
const formatNumber = (num, decimals = 2) => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M'
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K'
  }
  return num.toFixed(decimals)
}

/**
 * 查看区块链浏览器
 */
const viewOnExplorer = () => {
  if (!props.walletAddress) return
  
  // Sonic测试网区块链浏览器URL
  const explorerUrl = `https://testnet.sonicscan.org/address/${props.walletAddress}`
  window.open(explorerUrl, '_blank')
}

// 组件挂载时加载数据
onMounted(() => {
  if (props.isWalletConnected) {
    loadUserData()
    // 自动生成邀请链接，但不显示提示
    const baseUrl = window.location.origin
    inviteLink.value = `${baseUrl}?invite=${props.walletAddress}`
    inviteCode.value = props.walletAddress.slice(2, 8).toUpperCase()
  }
})
</script>

<template>
  <div class="profile-page">
    <div class="page-header">
      <h2 class="page-title">我的账户</h2>
      <p class="page-subtitle">管理您的钱包和邀请信息</p>
    </div>

    <!-- 钱包信息卡片 -->
    <div class="wallet-section">
      <div class="wallet-card">
        <div class="card-header">
          <h3 class="card-title">钱包信息</h3>
          <div class="wallet-status">
            <span class="status-indicator connected"></span>
            <span class="status-text">已连接</span>
          </div>
        </div>
        
        <div class="wallet-info">
          <div class="address-section">
            <label class="info-label">钱包地址</label>
            <div class="address-display">
              <span class="address-text">{{ formatAddress(walletAddress) }}</span>
              <button class="copy-btn" @click="copyToClipboard(walletAddress, '钱包地址')">
                📋
              </button>
              <button class="explorer-btn" @click="viewOnExplorer">
                🔍
              </button>
            </div>
          </div>
          
          <div class="actions-row">
            <button class="action-btn refresh" @click="refreshUserData" :disabled="isLoading">
              <span v-if="isLoading" class="loading-spinner"></span>
              {{ isLoading ? '刷新中...' : '刷新数据' }}
            </button>
            <button class="action-btn disconnect" @click="handleDisconnect">
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 余额信息 -->
    <div class="balance-section">
      <h3 class="section-title">我的余额</h3>
      <div class="balance-grid">
        <div class="balance-card">
          <div class="balance-header">
            <span class="balance-symbol">S</span>
            <span class="balance-name">Sonic</span>
          </div>
          <div class="balance-amount">{{ balances?.S || '0.00' }}</div>
        </div>
        
        <div class="balance-card">
          <div class="balance-header">
            <span class="balance-symbol">MLH</span>
            <span class="balance-name">MLH Token</span>
          </div>
          <div class="balance-amount">{{ balances?.MLH || '0.00' }}</div>
        </div>
        
        <div class="balance-card">
          <div class="balance-header">
            <span class="balance-symbol">MLHG</span>
            <span class="balance-name">MLHG Token</span>
          </div>
          <div class="balance-amount">{{ balances?.MLHG || '0.00' }}</div>
        </div>
      </div>
    </div>

    <!-- 邀请系统 -->
    <div class="invite-section">
      <h3 class="section-title">邀请系统</h3>
      <div class="invite-card">
        <div class="invite-stats">
          <div class="stat-item">
            <span class="stat-value">{{ inviteStats.totalInvites }}</span>
            <span class="stat-label">总邀请数</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ inviteStats.activeInvites }}</span>
            <span class="stat-label">活跃邀请</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ formatNumber(inviteStats.totalRewards) }}</span>
            <span class="stat-label">邀请奖励</span>
          </div>
        </div>
        
        <div class="invite-link-section">
          <label class="info-label">我的邀请链接</label>
          <div class="link-input-group">
            <input 
              v-model="inviteLink" 
              type="text" 
              class="link-input" 
              readonly 
              placeholder="点击生成邀请链接"
            >
            <button class="generate-btn" @click="generateInviteLink">
              生成
            </button>
            <button 
              class="copy-btn" 
              @click="copyToClipboard(inviteLink, '邀请链接')"
              :disabled="!inviteLink"
            >
              复制
            </button>
          </div>
          

        </div>
      </div>
    </div>

    <!-- 游戏统计 -->
    <div class="stats-section">
      <h3 class="section-title">游戏统计</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">🎲</div>
          <div class="stat-content">
            <div class="stat-number">{{ userStats.totalBets }}</div>
            <div class="stat-text">总投注次数</div>
          </div>
        </div>
        
        <div class="stat-card win">
          <div class="stat-icon">🏆</div>
          <div class="stat-content">
            <div class="stat-number">{{ userStats.totalWins }}</div>
            <div class="stat-text">中奖次数</div>
          </div>
        </div>
        
        <div class="stat-card lose">
          <div class="stat-icon">❌</div>
          <div class="stat-content">
            <div class="stat-number">{{ userStats.totalLosses }}</div>
            <div class="stat-text">失败次数</div>
          </div>
        </div>
        
        <div class="stat-card rate">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <div class="stat-number">{{ winRatePercentage }}%</div>
            <div class="stat-text">胜率</div>
          </div>
        </div>
        
        <div class="stat-card volume">
          <div class="stat-icon">💰</div>
          <div class="stat-content">
            <div class="stat-number">{{ formatNumber(userStats.totalVolume) }}</div>
            <div class="stat-text">总投注额</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  max-width: 900px;
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

.wallet-section,
.balance-section,
.invite-section,
.stats-section {
  margin-bottom: 30px;
}

.section-title {
  color: #FFD700;
  font-size: 20px;
  margin: 0 0 15px 0;
  text-align: center;
}

.wallet-card,
.invite-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 15px;
  padding: 25px;
  backdrop-filter: blur(10px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.card-title {
  color: #FFD700;
  font-size: 18px;
  margin: 0;
  font-weight: bold;
}

.wallet-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #00FF00;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.status-text {
  color: #00FF00;
  font-size: 12px;
  font-weight: bold;
}

.wallet-info {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.address-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-label {
  color: #FFD700;
  font-size: 14px;
  font-weight: bold;
}

.address-display {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.05);
  padding: 12px 15px;
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.address-text {
  flex: 1;
  color: #ffffff;
  font-family: monospace;
  font-size: 14px;
}

.copy-btn,
.explorer-btn {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #FFD700;
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.3s ease;
}

.copy-btn:hover,
.explorer-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-1px);
}

.copy-btn.small {
  padding: 4px 8px;
  font-size: 10px;
}

.actions-row {
  display: flex;
  gap: 15px;
}

.action-btn {
  flex: 1;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.action-btn.refresh {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid #FFD700;
  color: #FFD700;
}

.action-btn.refresh:hover:not(:disabled) {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-2px);
}

.action-btn.disconnect {
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid #ff4444;
  color: #ff4444;
}

.action-btn.disconnect:hover {
  background: rgba(255, 68, 68, 0.2);
  transform: translateY(-2px);
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top: 2px solid transparent;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.balance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.balance-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  transition: all 0.3s ease;
}

.balance-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(255, 215, 0, 0.2);
}

.balance-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 10px;
}

.balance-symbol {
  color: #FFD700;
  font-weight: bold;
  font-size: 16px;
}

.balance-name {
  color: #cccccc;
  font-size: 12px;
}

.balance-amount {
  color: #ffffff;
  font-size: 20px;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
}

.invite-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin-bottom: 25px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(255, 215, 0, 0.2);
}

.stat-value {
  display: block;
  color: #FFD700;
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  color: #cccccc;
  font-size: 12px;
}

.invite-link-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.link-input-group {
  display: flex;
  gap: 10px;
  align-items: center;
}

.link-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  color: #ffffff;
  font-size: 14px;
  outline: none;
}

.generate-btn {
  background: linear-gradient(45deg, #FFD700, #FFA500);
  border: none;
  color: #000000;
  padding: 10px 16px;
  border-radius: 8px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.generate-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}

.invite-code {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 15px;
  background: rgba(255, 215, 0, 0.1);
  border-radius: 8px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.code-label {
  color: #FFD700;
  font-size: 14px;
  font-weight: bold;
}

.code-value {
  color: #ffffff;
  font-family: monospace;
  font-size: 16px;
  font-weight: bold;
  letter-spacing: 2px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 15px;
}

.stat-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 215, 0, 0.3);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 15px;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 25px rgba(255, 215, 0, 0.2);
}

.stat-card.win {
  border-color: #00FF00;
}

.stat-card.lose {
  border-color: #ff4444;
}

.stat-card.rate {
  border-color: #00BFFF;
}

.stat-card.volume {
  border-color: #FFD700;
}

.stat-icon {
  font-size: 24px;
  opacity: 0.8;
}

.stat-content {
  flex: 1;
}

.stat-number {
  color: #ffffff;
  font-size: 20px;
  font-weight: bold;
  margin-bottom: 4px;
}

.stat-text {
  color: #cccccc;
  font-size: 12px;
}

@media (max-width: 768px) {
  .balance-grid {
    grid-template-columns: 1fr;
  }
  
  .invite-stats {
    grid-template-columns: 1fr;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .actions-row {
    flex-direction: column;
  }
  
  .link-input-group {
    flex-direction: column;
  }
  
  .generate-btn,
  .copy-btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .stat-card {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
  
  .address-display {
    flex-direction: column;
    gap: 8px;
  }
  
  .copy-btn,
  .explorer-btn {
    width: 100%;
  }
}
</style>