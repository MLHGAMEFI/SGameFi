//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// /** @notice Burn stake and creates Proof-Of-Burn record to be used by connected DeFi and fee is paid to specified address
//  * @param user user address
//  * @param id stake id
//  * @param userRebatePercentage percentage for user rebate in liquid titan (0 - 8)
//  * @param rewardPaybackPercentage percentage for builder fee in liquid titan (0 - 8)
//  * @param rewardPaybackAddress builder can opt to receive fee in another address
//  */
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}
