<script setup>
import { ref, onMounted, nextTick } from 'vue'
import TopNavbar from './components/TopNavbar.vue'
import GamePage from './components/GamePage.vue'
import Mining from './components/Mining.vue'
import ProfilePage from './components/ProfilePage.vue'
import BottomNavbar from './components/BottomNavbar.vue'

// 当前激活的页面
const currentPage = ref('game')

// 组件引用
const gamePageRef = ref(null)

// 切换页面函数
const switchPage = (page) => {
  currentPage.value = page
}

// 钱包连接状态
const isWalletConnected = ref(false)
const walletAddress = ref('')
const balances = ref({
  MLH: '0',
  S: '0',
  MLHG: '0'
})

// 网络信息
const currentNetwork = ref('Sonic Testnet')

/**
 * 钱包连接函数
 * 连接钱包并检查网络
 */
const connectWallet = async () => {
  try {
    if (typeof window.ethereum !== 'undefined') {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts.length > 0) {
        isWalletConnected.value = true
        walletAddress.value = accounts[0]
        
        // 检查网络
        const isCorrectNetwork = await checkNetwork()
        if (isCorrectNetwork) {
          await loadBalances()
        } else {
          // 如果不是正确网络，提示用户切换
          const shouldSwitch = confirm('检测到您当前不在Sonic测试网，是否切换到Sonic测试网？')
          if (shouldSwitch) {
            await switchNetwork()
          }
        }
        
        // 通知GamePage组件钱包连接状态变化
        await nextTick()
        if (gamePageRef.value && gamePageRef.value.handleWalletConnectionChange) {
          await gamePageRef.value.handleWalletConnectionChange()
        }
      }
    } else {
      alert('请安装MetaMask钱包')
    }
  } catch (error) {
    console.error('钱包连接失败:', error)
    alert('钱包连接失败，请重试')
  }
}

// 断开钱包连接
const disconnectWallet = async () => {
  isWalletConnected.value = false
  walletAddress.value = ''
  balances.value = { MLH: '0', S: '0', MLHG: '0' }
  
  // 通知GamePage组件钱包连接状态变化
  await nextTick()
  if (gamePageRef.value && gamePageRef.value.handleWalletConnectionChange) {
    await gamePageRef.value.handleWalletConnectionChange()
  }
}

/**
 * 加载钱包代币余额
 * 获取Sonic测试网上的MLH、S、MLHG代币余额
 */
const loadBalances = async () => {
  if (!walletAddress.value || typeof window.ethereum === 'undefined') {
    return
  }

  try {
    // Sonic测试网代币合约地址
    const tokenContracts = {
      MLH: '0x0A27117Af64E4585d899cC4aAD96A982f3Fa85FF',
      MLHG: '0xbca3aEC27772B6dD9aB68cF0a3F3d084f39e8dfb'
    }

    // ERC20 ABI (只需要balanceOf函数)
    const erc20ABI = [
      {
        "constant": true,
        "inputs": [{"name": "_owner", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"name": "balance", "type": "uint256"}],
        "type": "function"
      },
      {
        "constant": true,
        "inputs": [],
        "name": "decimals",
        "outputs": [{"name": "", "type": "uint8"}],
        "type": "function"
      }
    ]

    // 创建Web3实例
    const { ethers } = await import('ethers')
    const provider = new ethers.BrowserProvider(window.ethereum)
    
    // 获取S代币余额（原生代币）
    const sBalance = await provider.getBalance(walletAddress.value)
    const sBalanceFormatted = ethers.formatEther(sBalance)

    // 获取MLH代币余额
    const mlhContract = new ethers.Contract(tokenContracts.MLH, erc20ABI, provider)
    const mlhBalance = await mlhContract.balanceOf(walletAddress.value)
    const mlhDecimals = await mlhContract.decimals()
    const mlhBalanceFormatted = ethers.formatUnits(mlhBalance, mlhDecimals)

    // 获取MLHG代币余额
    const mlhgContract = new ethers.Contract(tokenContracts.MLHG, erc20ABI, provider)
    const mlhgBalance = await mlhgContract.balanceOf(walletAddress.value)
    const mlhgDecimals = await mlhgContract.decimals()
    const mlhgBalanceFormatted = ethers.formatUnits(mlhgBalance, mlhgDecimals)

    // 更新余额显示（保留4位小数）
    balances.value = {
      MLH: parseFloat(mlhBalanceFormatted).toFixed(4),
      S: parseFloat(sBalanceFormatted).toFixed(4),
      MLHG: parseFloat(mlhgBalanceFormatted).toFixed(4)
    }

    console.log('余额加载成功:', balances.value)
  } catch (error) {
    console.error('加载余额失败:', error)
    // 如果获取失败，显示默认值
    balances.value = {
      MLH: '0.0000',
      S: '0.0000',
      MLHG: '0.0000'
    }
  }
}

/**
 * 切换到Sonic测试网
 * 如果网络不存在则自动添加
 */
const switchNetwork = async () => {
  try {
    // Sonic Blaze Testnet 链ID: 57054 (0xDEDE)
    const chainIdDecimal = 57054
    const sonicTestnetChainId = '0x' + chainIdDecimal.toString(16) // 动态转换确保准确性
    
    console.log('尝试切换到Sonic测试网，链ID:', sonicTestnetChainId, '(十进制:', chainIdDecimal, ')')
    
    // 尝试切换到Sonic测试网
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: sonicTestnetChainId }],
    })
    
    console.log('网络切换成功')
    
    // 切换成功后重新加载余额
    if (isWalletConnected.value) {
      await loadBalances()
    }
  } catch (switchError) {
    console.log('切换网络错误:', switchError)
    
    // 如果网络不存在，尝试添加网络
    if (switchError.code === 4902) {
      try {
        console.log('网络不存在，尝试添加Sonic测试网')
        
        // 确保链ID转换正确: 57054 = 0xDEDE
    const chainIdDecimal = 57054
    const chainIdHex = '0x' + chainIdDecimal.toString(16) // 动态转换确保准确性
        
        const networkConfig = {
          chainId: chainIdHex, // 使用动态转换的十六进制
          chainName: 'Blaze Testnet', // 使用官方名称
          nativeCurrency: {
            name: 'Sonic',
            symbol: 'S',
            decimals: 18
          },
          rpcUrls: ['https://rpc.blaze.soniclabs.com'],
          blockExplorerUrls: ['https://testnet.sonicscan.org']
        }
        
        console.log('计算的链ID:', chainIdDecimal, '->', chainIdHex)
        
        console.log('添加网络配置:', networkConfig)
        
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [networkConfig]
        })
        
        console.log('网络添加成功')
        
        // 添加成功后重新加载余额
        if (isWalletConnected.value) {
          await loadBalances()
        }
        
        alert('Sonic测试网添加成功！')
      } catch (addError) {
        console.error('添加网络失败:', addError)
        alert(`添加Sonic测试网失败: ${addError.message || '未知错误'}\n请手动添加网络配置`)
      }
    } else {
      console.error('网络切换失败:', switchError)
      alert(`网络切换失败: ${switchError.message || '未知错误'}\n请检查钱包设置`)
    }
  }
}

/**
 * 检查当前网络是否为Sonic测试网
 */
const checkNetwork = async () => {
  if (typeof window.ethereum !== 'undefined') {
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' })
      const chainIdDecimal = 57054
    const sonicTestnetChainId = '0x' + chainIdDecimal.toString(16) // 动态转换确保准确性
      
      console.log('当前网络链ID:', chainId, '目标链ID:', sonicTestnetChainId, '(十进制:', chainIdDecimal, ')')
      
      // 比较时转换为小写，确保兼容性
      if (chainId.toLowerCase() === sonicTestnetChainId.toLowerCase()) {
        currentNetwork.value = 'Sonic Testnet'
        console.log('当前网络正确: Sonic测试网')
        return true
      } else {
        currentNetwork.value = `错误网络 (${chainId})`
        console.log('当前网络错误:', chainId)
        return false
      }
    } catch (error) {
      console.error('检查网络失败:', error)
      currentNetwork.value = '网络检查失败'
      return false
    }
  }
  return false
}

// 组件挂载时检查钱包连接状态
onMounted(async () => {
  if (typeof window.ethereum !== 'undefined') {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' })
    if (accounts.length > 0) {
      isWalletConnected.value = true
      walletAddress.value = accounts[0]
      
      // 检查网络
      const isCorrectNetwork = await checkNetwork()
      if (isCorrectNetwork) {
        await loadBalances()
      }
    }
    
    // 监听网络变化
    window.ethereum.on('chainChanged', async (chainId) => {
      await checkNetwork()
      if (isWalletConnected.value) {
        await loadBalances()
      }
    })
    
    // 监听账户变化
    window.ethereum.on('accountsChanged', async (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet()
      } else {
        walletAddress.value = accounts[0]
        await loadBalances()
      }
    })
  }
})
</script>

<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <TopNavbar 
      :isWalletConnected="isWalletConnected"
      :walletAddress="walletAddress"
      :balances="balances"
      :currentNetwork="currentNetwork"
      @connect-wallet="connectWallet"
      @disconnect-wallet="disconnectWallet"
      @switch-network="switchNetwork"
      @refresh-balances="loadBalances"
    />

    <!-- 主要内容区域 -->
    <main class="main-content">
      <GamePage 
        v-if="currentPage === 'game'" 
        ref="gamePageRef"
        :isWalletConnected="isWalletConnected" 
        :walletAddress="walletAddress"
      />
      <Mining v-else-if="currentPage === 'mining'" />
      <ProfilePage v-else-if="currentPage === 'profile'" 
        :isWalletConnected="isWalletConnected"
        :walletAddress="walletAddress"
        :balances="balances"
        @disconnect-wallet="disconnectWallet"
      />
    </main>

    <!-- 底部导航栏 -->
    <BottomNavbar 
      :currentPage="currentPage"
      @switch-page="switchPage"
    />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%);
  color: #ffffff;
  display: flex;
  flex-direction: column;
}

.main-content {
  flex: 1;
  padding: 20px;
  padding-bottom: 80px; /* 为底部导航栏留出空间 */
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}

@media (max-width: 768px) {
  .main-content {
    padding: 15px;
    padding-bottom: 80px;
  }
}
</style>
