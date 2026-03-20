// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mintable ERC-20 for testnet use — anyone can mint
/// @dev 6 decimals to match real USDC
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint tokens to any address — testnet only
    /// @param to Recipient
    /// @param amount Amount in smallest unit (6 decimals)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
