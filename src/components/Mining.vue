<template>
  <div class="mining-container">
    <!-- 页面标题 -->
    <div class="page-header">
      <h1 class="page-title">挖矿中心</h1>
      <p class="page-subtitle">通过未中奖的投注获得MLHG代币奖励</p>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon">⛏️</div>
        <div class="stat-content">
          <div class="stat-value">{{ playerStats.totalMined }}</div>
          <div class="stat-label">总挖矿次数</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">💰</div>
        <div class="stat-content">
          <div class="stat-value">{{ formatToken(playerStats.totalRewards) }}</div>
          <div class="stat-label">总奖励 MLHG</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">✅</div>
        <div class="stat-content">
          <div class="stat-value">{{ formatToken(playerStats.claimedRewards) }}</div>
          <div class="stat-label">已领取 MLHG</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">⏳</div>
        <div class="stat-content">
          <div class="stat-value">{{ formatToken(playerStats.pendingRewards) }}</div>
          <div class="stat-label">待领取 MLHG</div>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="action-buttons">
      <button 
        class="btn btn-primary"
        @click="claimAllRewards"
        :disabled="!canClaimRewards || isLoading"
      >
        <span v-if="isLoading">处理中...</span>
        <span v-else>领取所有奖励 ({{ formatToken(playerStats.pendingRewards) }} MLHG)</span>
      </button>
      <button 
        class="btn btn-secondary"
        @click="refreshData"
        :disabled="isLoading"
      >
        刷新数据
      </button>
    </div>

    <!-- 挖矿记录列表 -->
    <div class="mining-records">
      <div class="section-header">
        <h2>挖矿记录</h2>
        <div class="filter-tabs">
          <button 
            v-for="status in statusFilters"
            :key="status.value"
            class="filter-tab"
            :class="{ active: currentFilter === status.value }"
            @click="currentFilter = status.value"
          >
            {{ status.label }}
          </button>
        </div>
      </div>

      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载挖矿记录中...</p>
      </div>

      <div v-else-if="filteredRecords.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>暂无挖矿记录</h3>
        <p>开始投注游戏，未中奖的投注将自动生成挖矿记录</p>
      </div>

      <div v-else class="records-list">
        <div 
          v-for="record in filteredRecords"
          :key="record.requestId"
          class="record-card"
        >
          <div class="record-header">
            <div class="record-id">
              <span class="label">投注ID:</span>
              <span class="value">{{ record.requestId }}</span>
            </div>
            <div class="record-status">
              <span class="status-badge" :class="getStatusClass(record.status)">
                {{ getStatusText(record.status) }}
              </span>
            </div>
          </div>

          <div class="record-content">
            <div class="record-info">
              <div class="info-item">
                <span class="label">投注金额:</span>
                <span class="value">{{ formatToken(record.betAmount) }} {{ getTokenSymbol(record.tokenAddress) }}</span>
              </div>
              <div class="info-item">
                <span class="label">奖励金额:</span>
                <span class="value reward-amount">{{ formatToken(record.rewardAmount) }} MLHG</span>
              </div>
              <div class="info-item">
                <span class="label">创建时间:</span>
                <span class="value">{{ formatDate(record.createdAt) }}</span>
              </div>
              <div v-if="record.minedAt > 0" class="info-item">
                <span class="label">挖矿时间:</span>
                <span class="value">{{ formatDate(record.minedAt) }}</span>
              </div>
              <div v-if="record.claimedAt > 0" class="info-item">
                <span class="label">领取时间:</span>
                <span class="value">{{ formatDate(record.claimedAt) }}</span>
              </div>
            </div>

            <div class="record-actions">
              <button 
                v-if="record.status === 2" 
                class="btn btn-sm btn-primary"
                @click="claimSingleReward(record.requestId)"
                :disabled="isLoading"
              >
                领取奖励
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 合约统计信息 -->
    <div class="contract-stats">
      <h2>合约统计</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="label">总挖矿记录:</span>
          <span class="value">{{ contractStats.totalMiningRecords }}</span>
        </div>
        <div class="stat-item">
          <span class="label">总奖励分发:</span>
          <span class="value">{{ formatToken(contractStats.totalRewardsDistributed) }} MLHG</span>
        </div>
        <div class="stat-item">
          <span class="label">参与玩家数:</span>
          <span class="value">{{ contractStats.totalPlayerCount }}</span>
        </div>
        <div class="stat-item">
          <span class="label">当前挖矿比例:</span>
          <span class="value">{{ (contractStats.currentMiningRatio / 100).toFixed(2) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { useWallet } from '../composables/useWallet'
import miningService from '../contracts/miningService'
import { CONTRACT_ADDRESSES, TOKEN_CONFIG } from '../contracts/config'
import { formatEther } from 'ethers'

export default {
  name: 'Mining',
  setup() {
    const { account, isConnected } = useWallet()
    
    // 响应式数据
    const isLoading = ref(false)
    const playerStats = ref({
      totalMined: 0,
      totalRewards: '0',
      claimedRewards: '0',
      pendingRewards: '0'
    })
    const miningRecords = ref([])
    const contractStats = ref({
      totalMiningRecords: 0,
      totalRewardsDistributed: '0',
      totalPlayerCount: 0,
      currentMiningRatio: 0
    })
    
    // 过滤器
    const currentFilter = ref('all')
    const statusFilters = [
      { value: 'all', label: '全部' },
      { value: '0', label: '待挖矿' },
      { value: '1', label: '已挖矿' },
      { value: '2', label: '待领取' },
      { value: '3', label: '已领取' }
    ]
    
    // 计算属性
    const canClaimRewards = computed(() => {
      return parseFloat(playerStats.value.pendingRewards) > 0
    })
    
    const filteredRecords = computed(() => {
      if (currentFilter.value === 'all') {
        return miningRecords.value
      }
      return miningRecords.value.filter(record => 
        record.status.toString() === currentFilter.value
      )
    })
    
    // 方法
    const formatToken = (amount) => {
      try {
        return parseFloat(formatEther(amount.toString())).toFixed(4)
      } catch {
        return '0.0000'
      }
    }
    
    const formatDate = (timestamp) => {
      if (!timestamp || timestamp === 0) return '-'
      return new Date(timestamp * 1000).toLocaleString('zh-CN')
    }
    
    const getTokenSymbol = (tokenAddress) => {
      if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return TOKEN_CONFIG.NATIVE.symbol
      }
      if (tokenAddress === CONTRACT_ADDRESSES.MLH_TOKEN) {
        return TOKEN_CONFIG.MLH.symbol
      }
      return 'Unknown'
    }
    
    const getStatusText = (status) => {
      const statusMap = {
        0: '待挖矿',
        1: '已挖矿',
        2: '待领取',
        3: '已领取'
      }
      return statusMap[status] || '未知'
    }
    
    const getStatusClass = (status) => {
      const classMap = {
        0: 'pending',
        1: 'mined',
        2: 'claimable',
        3: 'claimed'
      }
      return classMap[status] || 'unknown'
    }
    
    const loadPlayerData = async () => {
      if (!account.value) return
      
      try {
        isLoading.value = true
        
        // 加载玩家统计
        const stats = await miningService.getPlayerMiningStats(account.value)
        playerStats.value = stats
        
        // 加载挖矿历史
        const history = await miningService.getPlayerMiningHistory(account.value)
        miningRecords.value = history
        
      } catch (error) {
        console.error('加载玩家数据失败:', error)
      } finally {
        isLoading.value = false
      }
    }
    
    const loadContractStats = async () => {
      try {
        const stats = await miningService.getContractStats()
        contractStats.value = stats
      } catch (error) {
        console.error('加载合约统计失败:', error)
      }
    }
    
    const claimAllRewards = async () => {
      if (!canClaimRewards.value) return
      
      try {
        isLoading.value = true
        
        // 获取所有可领取的记录ID
        const claimableIds = miningRecords.value
          .filter(record => record.status === 2)
          .map(record => record.requestId)
        
        if (claimableIds.length === 0) {
          alert('没有可领取的奖励')
          return
        }
        
        await miningService.claimRewards(claimableIds)
        alert('奖励领取成功！')
        
        // 刷新数据
        await loadPlayerData()
        
      } catch (error) {
        console.error('领取奖励失败:', error)
        alert('领取奖励失败: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }
    
    const claimSingleReward = async (requestId) => {
      try {
        isLoading.value = true
        
        await miningService.claimRewards([requestId])
        alert('奖励领取成功！')
        
        // 刷新数据
        await loadPlayerData()
        
      } catch (error) {
        console.error('领取奖励失败:', error)
        alert('领取奖励失败: ' + error.message)
      } finally {
        isLoading.value = false
      }
    }
    
    const refreshData = async () => {
      await Promise.all([
        loadPlayerData(),
        loadContractStats()
      ])
    }
    
    // 监听账户变化
    watch([account, isConnected], () => {
      if (isConnected.value && account.value) {
        refreshData()
      }
    })
    
    // 组件挂载
    onMounted(() => {
      if (isConnected.value && account.value) {
        refreshData()
      }
    })
    
    return {
      // 数据
      isLoading,
      playerStats,
      miningRecords,
      contractStats,
      currentFilter,
      statusFilters,
      
      // 计算属性
      canClaimRewards,
      filteredRecords,
      
      // 方法
      formatToken,
      formatDate,
      getTokenSymbol,
      getStatusText,
      getStatusClass,
      claimAllRewards,
      claimSingleReward,
      refreshData
    }
  }
}
</script>

<style scoped>
.mining-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.page-header {
  text-align: center;
  margin-bottom: 30px;
}

.page-title {
  font-size: 2.5rem;
  font-weight: bold;
  color: #1a1a1a;
  margin-bottom: 10px;
}

.page-subtitle {
  font-size: 1.1rem;
  color: #666;
  margin: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 15px;
  padding: 25px;
  color: white;
  display: flex;
  align-items: center;
  gap: 15px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-icon {
  font-size: 2.5rem;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 1.8rem;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 0.9rem;
  opacity: 0.9;
}

.action-buttons {
  display: flex;
  gap: 15px;
  margin-bottom: 30px;
  justify-content: center;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #f8f9fa;
  color: #495057;
  border: 2px solid #dee2e6;
}

.btn-secondary:hover:not(:disabled) {
  background: #e9ecef;
  border-color: #adb5bd;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.mining-records {
  margin-bottom: 30px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 15px;
}

.section-header h2 {
  font-size: 1.8rem;
  color: #1a1a1a;
  margin: 0;
}

.filter-tabs {
  display: flex;
  gap: 5px;
  background: #f8f9fa;
  border-radius: 8px;
  padding: 5px;
}

.filter-tab {
  padding: 8px 16px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.filter-tab.active {
  background: white;
  color: #667eea;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #666;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 20px;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.record-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  border: 1px solid #e9ecef;
  transition: all 0.3s ease;
}

.record-card:hover {
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.record-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e9ecef;
}

.record-id .label {
  color: #666;
  font-size: 0.9rem;
}

.record-id .value {
  font-weight: 600;
  color: #1a1a1a;
  margin-left: 5px;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.pending {
  background: #fff3cd;
  color: #856404;
}

.status-badge.mined {
  background: #d1ecf1;
  color: #0c5460;
}

.status-badge.claimable {
  background: #d4edda;
  color: #155724;
}

.status-badge.claimed {
  background: #f8d7da;
  color: #721c24;
}

.record-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
}

.record-info {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-item .label {
  color: #666;
  font-size: 0.9rem;
}

.info-item .value {
  font-weight: 600;
  color: #1a1a1a;
}

.reward-amount {
  color: #28a745 !important;
}

.record-actions {
  display: flex;
  gap: 10px;
}

.btn-sm {
  padding: 8px 16px;
  font-size: 0.9rem;
}

.contract-stats {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  border: 1px solid #e9ecef;
}

.contract-stats h2 {
  font-size: 1.5rem;
  color: #1a1a1a;
  margin-bottom: 20px;
}

.contract-stats .stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
  margin: 0;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-item .label {
  color: #666;
  font-weight: 500;
}

.stat-item .value {
  font-weight: 600;
  color: #1a1a1a;
}

@media (max-width: 768px) {
  .mining-container {
    padding: 15px;
  }
  
  .page-title {
    font-size: 2rem;
  }
  
  .stats-grid {
    grid-template-columns: 1fr;
  }
  
  .action-buttons {
    flex-direction: column;
    align-items: center;
  }
  
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-tabs {
    justify-content: center;
  }
  
  .record-content {
    flex-direction: column;
    align-items: stretch;
  }
  
  .record-info {
    grid-template-columns: 1fr;
  }
}
</style>