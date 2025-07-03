/**
 * 钱包连接和管理的组合式函数
 * 提供钱包连接状态、账户信息和相关操作
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ethers } from 'ethers'
import { NETWORK_CONFIG } from '../contracts/config'

// 全局状态
const isConnected = ref(false)
const account = ref('')
const provider = ref(null)
const signer = ref(null)
const chainId = ref(null)

export function useWallet() {
  // 计算属性
  const isCorrectNetwork = computed(() => {
    return chainId.value === NETWORK_CONFIG.chainId
  })

  const shortAddress = computed(() => {
    if (!account.value) return ''
    return `${account.value.slice(0, 6)}...${account.value.slice(-4)}`
  })

  // 检查钱包是否已连接
  const checkConnection = async () => {
    if (typeof window.ethereum === 'undefined') {
      console.log('MetaMask not installed')
      return false
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      if (accounts.length > 0) {
        account.value = accounts[0]
        isConnected.value = true
        await updateProvider()
        await checkNetwork()
        return true
      }
    } catch (error) {
      console.error('检查钱包连接失败:', error)
    }
    return false
  }

  // 连接钱包
  const connect = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('请安装MetaMask钱包')
      return false
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      if (accounts.length > 0) {
        account.value = accounts[0]
        isConnected.value = true
        await updateProvider()
        await checkNetwork()
        return true
      }
    } catch (error) {
      console.error('钱包连接失败:', error)
      alert('钱包连接失败: ' + error.message)
    }
    return false
  }

  // 断开连接
  const disconnect = () => {
    isConnected.value = false
    account.value = ''
    provider.value = null
    signer.value = null
    chainId.value = null
  }

  // 更新Provider和Signer
  const updateProvider = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        provider.value = new ethers.BrowserProvider(window.ethereum)
        signer.value = await provider.value.getSigner()
        
        // 获取当前网络
        const network = await provider.value.getNetwork()
        chainId.value = Number(network.chainId)
      } catch (error) {
        console.error('更新Provider失败:', error)
      }
    }
  }

  // 检查网络
  const checkNetwork = async () => {
    try {
      const network = await provider.value.getNetwork()
      chainId.value = Number(network.chainId)
      
      if (chainId.value !== NETWORK_CONFIG.chainId) {
        console.log('当前网络不正确，需要切换到Sonic测试网')
        return false
      }
      return true
    } catch (error) {
      console.error('检查网络失败:', error)
      return false
    }
  }

  // 切换到正确的网络
  const switchToCorrectNetwork = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('请安装MetaMask钱包')
      return false
    }

    try {
      // 尝试切换网络
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK_CONFIG.chainIdHex }],
      })
      
      // 更新网络信息
      await updateProvider()
      return true
    } catch (switchError) {
      // 如果网络不存在，尝试添加
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: NETWORK_CONFIG.chainIdHex,
              chainName: NETWORK_CONFIG.name,
              nativeCurrency: NETWORK_CONFIG.nativeCurrency,
              rpcUrls: [NETWORK_CONFIG.rpcUrl],
              blockExplorerUrls: [NETWORK_CONFIG.explorer]
            }]
          })
          
          // 添加成功后更新Provider
          await updateProvider()
          return true
        } catch (addError) {
          console.error('添加网络失败:', addError)
          alert('添加网络失败: ' + addError.message)
        }
      } else {
        console.error('切换网络失败:', switchError)
        alert('切换网络失败: ' + switchError.message)
      }
    }
    return false
  }

  // 获取余额
  const getBalance = async (tokenAddress = null) => {
    if (!provider.value || !account.value) {
      return '0'
    }

    try {
      if (!tokenAddress || tokenAddress === '0x0000000000000000000000000000000000000000') {
        // 获取原生代币余额
        const balance = await provider.value.getBalance(account.value)
        return ethers.formatEther(balance)
      } else {
        // 获取ERC20代币余额
        const tokenContract = new ethers.Contract(
          tokenAddress,
          [
            'function balanceOf(address owner) view returns (uint256)',
            'function decimals() view returns (uint8)'
          ],
          provider.value
        )
        
        const balance = await tokenContract.balanceOf(account.value)
        const decimals = await tokenContract.decimals()
        return ethers.formatUnits(balance, decimals)
      }
    } catch (error) {
      console.error('获取余额失败:', error)
      return '0'
    }
  }

  // 监听账户变化
  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      disconnect()
    } else if (accounts[0] !== account.value) {
      account.value = accounts[0]
      updateProvider()
    }
  }

  // 监听网络变化
  const handleChainChanged = (newChainId) => {
    chainId.value = parseInt(newChainId, 16)
    updateProvider()
  }

  // 设置事件监听器
  const setupEventListeners = () => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', handleAccountsChanged)
      window.ethereum.on('chainChanged', handleChainChanged)
    }
  }

  // 移除事件监听器
  const removeEventListeners = () => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged)
      window.ethereum.removeListener('chainChanged', handleChainChanged)
    }
  }

  // 组件挂载时检查连接状态
  onMounted(() => {
    checkConnection()
    setupEventListeners()
  })

  // 组件卸载时清理
  onUnmounted(() => {
    removeEventListeners()
  })

  return {
    // 状态
    isConnected,
    account,
    provider,
    signer,
    chainId,
    
    // 计算属性
    isCorrectNetwork,
    shortAddress,
    
    // 方法
    connect,
    disconnect,
    checkConnection,
    checkNetwork,
    switchToCorrectNetwork,
    getBalance,
    updateProvider
  }
}

// 导出单例实例供全局使用
export const walletStore = {
  isConnected,
  account,
  provider,
  signer,
  chainId
}