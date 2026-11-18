// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only stand-in for the Binance Agent ID registry (ERC-721).
/// @dev Lets tests grant/revoke Agent IDs without touching mainnet.
contract MockAgentIDRegistry {
    mapping(address => uint256) private _balances;

    function setBalance(address owner, uint256 amount) external {
        _balances[owner] = amount;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return _balances[owner];
    }
}
