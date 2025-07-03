# 贡献指南

感谢您对 SGameFi 项目的关注！我们欢迎所有形式的贡献，包括但不限于代码、文档、测试、问题报告和功能建议。

## 🤝 如何贡献

### 报告问题

如果您发现了 bug 或有功能建议，请：

1. 检查 [Issues](../../issues) 确保问题尚未被报告
2. 使用相应的 Issue 模板创建新问题
3. 提供详细的描述和重现步骤
4. 包含相关的环境信息

### 提交代码

#### 开发环境设置

```bash
# 1. Fork 项目到您的 GitHub 账户
# 2. 克隆您的 fork
git clone https://github.com/YOUR_USERNAME/SGameFi.git
cd SGameFi

# 3. 添加上游仓库
git remote add upstream https://github.com/ORIGINAL_OWNER/SGameFi.git

# 4. 安装依赖
npm install

# 5. 复制环境配置
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

#### 开发流程

1. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/your-bug-fix
   ```

2. **进行开发**
   - 遵循项目的代码规范
   - 添加必要的测试
   - 更新相关文档

3. **运行测试和检查**
   ```bash
   # 运行安全检查
   npm run security:check
   
   # 编译合约
   npx hardhat compile
   
   # 运行测试
   npm run test:all
   
   # 检查代码格式（如果配置了）
   npm run lint
   ```

4. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   # 或
   git commit -m "fix: 修复问题描述"
   ```

5. **推送并创建 Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```
   然后在 GitHub 上创建 Pull Request

## 📝 代码规范

### Solidity 合约

- 使用 Solidity 0.8.x 版本
- 遵循 [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- 添加详细的 NatSpec 注释
- 使用有意义的变量和函数名

```solidity
/**
 * @title 合约标题
 * @dev 合约描述
 * @author 作者名称
 */
contract ExampleContract {
    /**
     * @dev 函数描述
     * @param _param 参数描述
     * @return 返回值描述
     */
    function exampleFunction(uint256 _param) external pure returns (uint256) {
        // 函数实现
        return _param * 2;
    }
}
```

### JavaScript/Node.js

- 使用 ES6+ 语法
- 添加函数级注释
- 使用有意义的变量名
- 遵循项目的错误处理模式

```javascript
/**
 * 函数描述
 * @param {string} param1 - 参数1描述
 * @param {number} param2 - 参数2描述
 * @returns {Promise<boolean>} 返回值描述
 */
async function exampleFunction(param1, param2) {
    try {
        // 函数实现
        return true;
    } catch (error) {
        console.error('错误信息:', error.message);
        throw error;
    }
}
```

### Vue.js 组件

- 使用 Composition API
- 添加 TypeScript 类型（如果适用）
- 遵循 Vue.js 最佳实践

```vue
<template>
  <div class="component-name">
    <!-- 模板内容 -->
  </div>
</template>

<script setup>
/**
 * 组件描述
 */
import { ref, computed } from 'vue'

// 响应式数据
const data = ref('')

// 计算属性
const computedValue = computed(() => {
  return data.value.toUpperCase()
})

/**
 * 函数描述
 */
function handleClick() {
  // 处理逻辑
}
</script>

<style scoped>
.component-name {
  /* 样式 */
}
</style>
```

## 🧪 测试指南

### 合约测试

- 为每个合约编写全面的测试
- 测试正常情况和边界情况
- 测试权限控制和安全性

```javascript
const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ContractName', function () {
    let contract;
    let owner;
    let user;

    beforeEach(async function () {
        [owner, user] = await ethers.getSigners();
        
        const ContractFactory = await ethers.getContractFactory('ContractName');
        contract = await ContractFactory.deploy();
        await contract.deployed();
    });

    describe('功能测试', function () {
        it('应该正确执行基本功能', async function () {
            // 测试逻辑
            expect(await contract.someFunction()).to.equal(expectedValue);
        });

        it('应该在无效输入时回滚', async function () {
            // 测试错误情况
            await expect(contract.someFunction(invalidInput))
                .to.be.revertedWith('错误信息');
        });
    });
});
```

### 前端测试

- 为组件编写单元测试
- 测试用户交互和状态变化
- 使用适当的测试工具

## 📚 文档贡献

### 文档类型

- **API 文档**：详细的接口说明
- **教程**：分步指导
- **示例**：实际使用案例
- **故障排除**：常见问题解决方案

### 文档规范

- 使用清晰的标题结构
- 提供代码示例
- 包含必要的截图或图表
- 保持内容的时效性

## 🔍 代码审查

### Pull Request 要求

- **标题**：简洁明了地描述更改
- **描述**：详细说明更改内容和原因
- **测试**：包含相关测试并确保通过
- **文档**：更新相关文档
- **安全**：通过安全检查

### 审查清单

- [ ] 代码符合项目规范
- [ ] 包含适当的测试
- [ ] 文档已更新
- [ ] 安全检查通过
- [ ] 没有引入破坏性更改
- [ ] 性能影响可接受

## 🏷️ 提交信息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<类型>[可选范围]: <描述>

[可选正文]

[可选脚注]
```

### 类型

- `feat`: 新功能
- `fix`: 错误修复
- `docs`: 文档更改
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改bug的代码变动）
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动

### 示例

```
feat(contracts): 添加新的挖矿奖励机制

- 实现基于时间的奖励计算
- 添加奖励池管理功能
- 更新相关测试用例

Closes #123
```

## 🚀 发布流程

### 版本号规范

遵循 [Semantic Versioning](https://semver.org/)：

- `MAJOR.MINOR.PATCH`
- `MAJOR`: 不兼容的 API 修改
- `MINOR`: 向下兼容的功能性新增
- `PATCH`: 向下兼容的问题修正

### 发布检查清单

- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] 变更日志已更新
- [ ] 安全审计完成
- [ ] 性能测试通过

## 🛡️ 安全考虑

### 安全最佳实践

- 永远不要提交私钥或敏感信息
- 使用 `.env` 文件管理环境变量
- 定期更新依赖包
- 遵循智能合约安全最佳实践

### 漏洞报告

如果您发现安全漏洞，请：

1. **不要**公开披露
2. 发送邮件至 [security@example.com]
3. 提供详细的漏洞描述
4. 等待我们的回复和修复

## 📞 获取帮助

如果您需要帮助：

- 查看 [文档](./docs/)
- 搜索现有的 [Issues](../../issues)
- 在 [Discussions](../../discussions) 中提问
- 联系维护者

## 📄 许可证

通过贡献代码，您同意您的贡献将在与项目相同的 [MIT 许可证](./LICENSE) 下发布。

## 🙏 致谢

感谢所有为 SGameFi 项目做出贡献的开发者！您的贡献让这个项目变得更好。

---

**记住**：好的贡献不仅仅是代码，还包括文档改进、问题报告、功能建议和社区支持。每一个贡献都很重要！