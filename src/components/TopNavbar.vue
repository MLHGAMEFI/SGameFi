<script setup>
import { ref } from 'vue'

// 定义props
const props = defineProps({
  isWalletConnected: Boolean,
  walletAddress: String,
  balances: Object,
  currentNetwork: String
})

// 定义emits
const emit = defineEmits(['connect-wallet', 'disconnect-wallet', 'switch-network', 'refresh-balances'])

// 显示用户信息下拉菜单
const showUserMenu = ref(false)

/**
 * 格式化钱包地址显示
 * @param {string} address - 钱包地址
 * @returns {string} 格式化后的地址
 */
const formatAddress = (address) => {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

/**
 * 复制地址到剪贴板
 * @param {string} address - 要复制的地址
 */
const copyAddress = async (address) => {
  try {
    await navigator.clipboard.writeText(address)
    alert('地址已复制到剪贴板')
  } catch (error) {
    console.error('复制失败:', error)
  }
}

/**
 * 连接钱包
 */
const handleConnectWallet = () => {
  emit('connect-wallet')
}

/**
 * 断开钱包连接
 */
const handleDisconnectWallet = () => {
  showUserMenu.value = false
  emit('disconnect-wallet')
}

/**
 * 切换网络
 */
const handleSwitchNetwork = () => {
  emit('switch-network')
}

/**
 * 切换用户菜单显示状态
 */
const toggleUserMenu = () => {
  showUserMenu.value = !showUserMenu.value
}

/**
 * 刷新余额
 */
const handleRefreshBalances = () => {
  emit('refresh-balances')
}
</script>

<template>
  <nav class="top-navbar">
    <div class="navbar-container">
      <!-- 左侧Logo和标题 -->
      <div class="navbar-left">
        <div class="logo">
          <h1 class="logo-text">SGameFi</h1>
        </div>
      </div>

      <!-- 右侧功能区 -->
      <div class="navbar-right">
        <!-- 网络切换按钮 -->
        <button class="network-btn" @click="handleSwitchNetwork">
          <span class="network-indicator"></span>
          {{ currentNetwork }}
        </button>

        <!-- 钱包连接状态 -->
        <div v-if="!isWalletConnected" class="wallet-section">
          <button class="connect-btn" @click="handleConnectWallet">
            连接钱包
          </button>
        </div>

        <!-- 已连接钱包显示 -->
        <div v-else class="wallet-connected">
          <!-- 余额显示 -->
          <div class="balance-display">
            <div class="balance-item">
              <span class="balance-label">MLH:</span>
              <span class="balance-value">{{ balances.MLH }}</span>
            </div>
            <div class="balance-item">
              <span class="balance-label">S:</span>
              <span class="balance-value">{{ balances.S }}</span>
            </div>
            <div class="balance-item">
              <span class="balance-label">MLHG:</span>
              <span class="balance-value">{{ balances.MLHG }}</span>
            </div>
            <button class="refresh-btn" @click="handleRefreshBalances" title="刷新余额">
              ↻
            </button>
          </div>

          <!-- 用户信息 -->
          <div class="user-info" @click="toggleUserMenu">
            <div class="user-address">{{ formatAddress(walletAddress) }}</div>
            <div class="user-avatar"></div>
            
            <!-- 用户下拉菜单 -->
            <div v-if="showUserMenu" class="user-menu">
              <div class="menu-item" @click="copyAddress(walletAddress)">
                <span>复制地址</span>
              </div>
              <div class="menu-item disconnect" @click="handleDisconnectWallet">
                <span>断开连接</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.top-navbar {
  background: #000000;
  border-bottom: 2px solid #FFD700;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 10px rgba(255, 215, 0, 0.2);
}

.navbar-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
}

.navbar-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
}

.logo-text {
  font-size: 24px;
  font-weight: bold;
  color: #FFD700;
  margin: 0;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.5);
}

.navbar-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.network-btn {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid #FFD700;
  color: #FFD700;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: all 0.3s ease;
}

.network-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  transform: translateY(-1px);
}

.network-indicator {
  width: 8px;
  height: 8px;
  background: #00FF00;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.connect-btn {
  background: linear-gradient(45deg, #FFD700, #FFA500);
  border: none;
  color: #000000;
  padding: 12px 24px;
  border-radius: 25px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3);
}

.connect-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(255, 215, 0, 0.4);
}

.wallet-connected {
  display: flex;
  align-items: center;
  gap: 15px;
}

.balance-display {
  display: flex;
  gap: 15px;
}

.balance-item {
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 215, 0, 0.1);
  padding: 6px 12px;
  border-radius: 15px;
  border: 1px solid rgba(255, 215, 0, 0.3);
}

.balance-label {
  color: #FFD700;
  font-size: 12px;
  font-weight: bold;
}

.balance-value {
  color: #ffffff;
  font-size: 12px;
  font-weight: bold;
}

.refresh-btn {
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  color: #FFD700;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  transition: all 0.3s ease;
  margin-left: 8px;
}

.refresh-btn:hover {
  background: rgba(255, 215, 0, 0.2);
  transform: rotate(180deg);
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
}

.user-info {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 20px;
  background: rgba(255, 215, 0, 0.1);
  border: 1px solid rgba(255, 215, 0, 0.3);
  transition: all 0.3s ease;
}

.user-info:hover {
  background: rgba(255, 215, 0, 0.2);
}

.user-address {
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
}

.user-avatar {
  width: 24px;
  height: 24px;
  background: linear-gradient(45deg, #FFD700, #FFA500);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-menu {
  position: absolute;
  top: 100%;
  right: 0;
  background: #1a1a1a;
  border: 1px solid #FFD700;
  border-radius: 10px;
  padding: 8px 0;
  min-width: 150px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 1001;
}

.menu-item {
  padding: 10px 16px;
  cursor: pointer;
  color: #ffffff;
  font-size: 14px;
  transition: all 0.3s ease;
}

.menu-item:hover {
  background: rgba(255, 215, 0, 0.1);
  color: #FFD700;
}

.menu-item.disconnect {
  color: #ff4444;
  border-top: 1px solid rgba(255, 215, 0, 0.2);
}

.menu-item.disconnect:hover {
  background: rgba(255, 68, 68, 0.1);
  color: #ff6666;
}

@media (max-width: 768px) {
  .navbar-container {
    padding: 12px 15px;
  }
  
  .logo-text {
    font-size: 20px;
  }
  
  .balance-display {
    gap: 10px;
  }
  
  .balance-item {
    padding: 4px 8px;
  }
  
  .balance-label,
  .balance-value {
    font-size: 11px;
  }
  
  .connect-btn {
    padding: 10px 20px;
    font-size: 13px;
  }
}

@media (max-width: 480px) {
  .navbar-right {
    gap: 10px;
  }
  
  .balance-display {
    flex-direction: column;
    gap: 5px;
  }
  
  .network-btn {
    padding: 6px 12px;
    font-size: 12px;
  }
}
</style>