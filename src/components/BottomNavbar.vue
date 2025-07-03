<script setup>
// 定义props
const props = defineProps({
  currentPage: String
})

// 定义emits
const emit = defineEmits(['switch-page'])

// 导航菜单项
const navItems = [
  {
    id: 'game',
    label: '游戏',
    icon: '🎲',
    activeIcon: '🎯'
  },
  {
    id: 'mining',
    label: '挖矿',
    icon: '⛏️',
    activeIcon: '💎'
  },
  {
    id: 'profile',
    label: '我的',
    icon: '👤',
    activeIcon: '👑'
  }
]

/**
 * 切换页面
 * @param {string} pageId - 页面ID
 */
const switchPage = (pageId) => {
  if (pageId !== props.currentPage) {
    emit('switch-page', pageId)
  }
}

/**
 * 检查是否为当前激活页面
 * @param {string} pageId - 页面ID
 * @returns {boolean} 是否激活
 */
const isActive = (pageId) => {
  return props.currentPage === pageId
}

/**
 * 获取导航项图标
 * @param {object} item - 导航项
 * @returns {string} 图标
 */
const getIcon = (item) => {
  return isActive(item.id) ? item.activeIcon : item.icon
}
</script>

<template>
  <nav class="bottom-navbar">
    <div class="navbar-container">
      <div 
        v-for="item in navItems" 
        :key="item.id"
        class="nav-item"
        :class="{ active: isActive(item.id) }"
        @click="switchPage(item.id)"
      >
        <div class="nav-icon">
          {{ getIcon(item) }}
        </div>
        <span class="nav-label">{{ item.label }}</span>
        
        <!-- 激活指示器 -->
        <div v-if="isActive(item.id)" class="active-indicator"></div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.bottom-navbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.95) 0%, #000000 100%);
  border-top: 2px solid #FFD700;
  backdrop-filter: blur(20px);
  z-index: 1000;
  box-shadow: 0 -4px 20px rgba(255, 215, 0, 0.2);
}

.navbar-container {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 12px 20px 20px 20px;
  max-width: 500px;
  margin: 0 auto;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 8px 12px;
  border-radius: 12px;
  position: relative;
  min-width: 60px;
}

.nav-item:hover {
  background: rgba(255, 215, 0, 0.1);
  transform: translateY(-2px);
}

.nav-item.active {
  background: rgba(255, 215, 0, 0.15);
  transform: translateY(-3px);
}

.nav-icon {
  font-size: 24px;
  transition: all 0.3s ease;
  filter: grayscale(100%);
}

.nav-item.active .nav-icon {
  filter: grayscale(0%);
  transform: scale(1.1);
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
}

.nav-label {
  font-size: 12px;
  font-weight: 500;
  color: #cccccc;
  transition: all 0.3s ease;
  text-align: center;
}

.nav-item.active .nav-label {
  color: #FFD700;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

.active-indicator {
  position: absolute;
  top: -2px;
  left: 50%;
  transform: translateX(-50%);
  width: 30px;
  height: 3px;
  background: linear-gradient(90deg, #FFD700, #FFA500);
  border-radius: 2px;
  box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  animation: glow 2s ease-in-out infinite alternate;
}

@keyframes glow {
  from {
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.8);
  }
  to {
    box-shadow: 0 0 20px rgba(255, 215, 0, 1), 0 0 30px rgba(255, 215, 0, 0.8);
  }
}

/* 添加点击波纹效果 */
.nav-item::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(255, 215, 0, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.3s ease, height 0.3s ease;
}

.nav-item:active::before {
  width: 60px;
  height: 60px;
}

/* 响应式设计 */
@media (max-width: 480px) {
  .navbar-container {
    padding: 10px 15px 18px 15px;
  }
  
  .nav-item {
    padding: 6px 8px;
    min-width: 50px;
  }
  
  .nav-icon {
    font-size: 20px;
  }
  
  .nav-label {
    font-size: 11px;
  }
  
  .active-indicator {
    width: 25px;
    height: 2px;
  }
}

@media (max-width: 360px) {
  .navbar-container {
    padding: 8px 10px 16px 10px;
  }
  
  .nav-item {
    padding: 4px 6px;
    min-width: 45px;
    gap: 4px;
  }
  
  .nav-icon {
    font-size: 18px;
  }
  
  .nav-label {
    font-size: 10px;
  }
}

/* 为不同页面添加特殊效果 */
.nav-item[data-page="game"].active {
  background: rgba(255, 215, 0, 0.15);
}

.nav-item[data-page="mining"].active {
  background: rgba(0, 255, 0, 0.15);
}

.nav-item[data-page="profile"].active {
  background: rgba(0, 191, 255, 0.15);
}

/* 添加底部安全区域适配（适用于有刘海屏的设备） */
@supports (padding-bottom: env(safe-area-inset-bottom)) {
  .bottom-navbar {
    padding-bottom: env(safe-area-inset-bottom);
  }
}

/* 暗色主题优化 */
@media (prefers-color-scheme: dark) {
  .bottom-navbar {
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.98) 0%, #000000 100%);
  }
}

/* 减少动画效果（适用于偏好减少动画的用户） */
@media (prefers-reduced-motion: reduce) {
  .nav-item,
  .nav-icon,
  .nav-label,
  .nav-item::before {
    transition: none;
  }
  
  .active-indicator {
    animation: none;
  }
}
</style>