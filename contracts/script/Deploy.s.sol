// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrustScorer} from "../src/TrustScorer.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

/// @title Deploy
/// @notice Deploys the full Cortex Underwriter protocol to Base Sepolia
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        vm.startBroadcast(deployerKey);

        // 1. Deploy MockUSDC (testnet only — on mainnet you'd use real USDC)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed to:", address(usdc));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry();
        console.log("AgentRegistry deployed to:", address(registry));

        // 3. Deploy TrustScorer
        TrustScorer scorer = new TrustScorer();
        console.log("TrustScorer deployed to:", address(scorer));

        // 4. Deploy PredictionMarket
        PredictionMarket market = new PredictionMarket(
            address(usdc),
            address(scorer),
            address(registry)
        );
        console.log("PredictionMarket deployed to:", address(market));

        // 5. Wire up: set PredictionMarket as the authorized caller on TrustScorer
        scorer.setPredictionMarket(address(market));
        console.log("TrustScorer linked to PredictionMarket");

        vm.stopBroadcast();

        console.log("--- Deployment Complete ---");
    }
}
