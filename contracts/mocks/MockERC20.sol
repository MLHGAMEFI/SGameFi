// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockERC20
 * @notice 用于测试的模拟ERC20代币合约
 */
contract MockERC20 is ERC20, Ownable {
    uint8 private _decimals;

    /**
     * @notice 构造函数
     * @param name 代币名称
     * @param symbol 代币符号
     */
    constructor(
        string memory name,
        string memory symbol
    ) ERC20(name, symbol) Ownable(msg.sender) {
        _decimals = 18;
    }

    /**
     * @notice 设置小数位数
     * @param decimals_ 小数位数
     */
    function setDecimals(uint8 decimals_) external onlyOwner {
        _decimals = decimals_;
    }

    /**
     * @notice 获取小数位数
     * @return 小数位数
     */
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice 铸造代币
     * @param to 接收地址
     * @param amount 铸造数量
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice 销毁代币
     * @param from 销毁地址
     * @param amount 销毁数量
     */
    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    /**
     * @notice 批量转账
     * @param recipients 接收地址数组
     * @param amounts 转账数量数组
     */
    function batchTransfer(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            transfer(recipients[i], amounts[i]);
        }
    }

    /**
     * @notice 批量铸造
     * @param recipients 接收地址数组
     * @param amounts 铸造数量数组
     */
    function batchMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    ) external onlyOwner {
        require(recipients.length == amounts.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], amounts[i]);
        }
    }
}