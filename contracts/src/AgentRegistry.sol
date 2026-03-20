// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice Lightweight companion registry for ERC-8004 agents participating in Cortex Underwriter
/// @dev Not a replacement for ERC-8004 — tracks Underwriter-specific registration data
contract AgentRegistry is Ownable {
    struct Agent {
        address wallet;
        string erc8004Uri;
        uint256 registeredAt;
        bool active;
    }

    /// @notice Registered agents by wallet address
    mapping(address => Agent) private _agents;

    /// @notice Total number of registered agents
    uint256 public agentCount;

    event AgentRegistered(address indexed wallet, string erc8004Uri, uint256 registeredAt);
    event AgentDeactivated(address indexed wallet);
    event AgentReactivated(address indexed wallet);

    error AlreadyRegistered(address wallet);
    error NotRegistered(address wallet);
    error EmptyUri();

    constructor() Ownable(msg.sender) {}

    /// @notice Register the caller as an Underwriter protocol agent
    /// @param erc8004Uri Link to their ERC-8004 agent card metadata
    function registerAgent(string calldata erc8004Uri) external {
        if (bytes(erc8004Uri).length == 0) revert EmptyUri();
        if (_agents[msg.sender].registeredAt != 0) revert AlreadyRegistered(msg.sender);

        _agents[msg.sender] = Agent({
            wallet: msg.sender,
            erc8004Uri: erc8004Uri,
            registeredAt: block.timestamp,
            active: true
        });

        unchecked { ++agentCount; }

        emit AgentRegistered(msg.sender, erc8004Uri, block.timestamp);
    }

    /// @notice Look up agent info by wallet address
    /// @param wallet The agent's wallet address
    /// @return Agent struct
    function getAgent(address wallet) external view returns (Agent memory) {
        if (_agents[wallet].registeredAt == 0) revert NotRegistered(wallet);
        return _agents[wallet];
    }

    /// @notice Check if a wallet is registered and active
    /// @param wallet The address to check
    /// @return True if registered and active
    function isRegistered(address wallet) external view returns (bool) {
        return _agents[wallet].active;
    }

    /// @notice Owner can deactivate a malicious agent
    /// @param wallet The agent to deactivate
    function deactivateAgent(address wallet) external onlyOwner {
        if (_agents[wallet].registeredAt == 0) revert NotRegistered(wallet);
        _agents[wallet].active = false;
        emit AgentDeactivated(wallet);
    }

    /// @notice Owner can reactivate a previously deactivated agent
    /// @param wallet The agent to reactivate
    function reactivateAgent(address wallet) external onlyOwner {
        if (_agents[wallet].registeredAt == 0) revert NotRegistered(wallet);
        _agents[wallet].active = true;
        emit AgentReactivated(wallet);
    }
}
