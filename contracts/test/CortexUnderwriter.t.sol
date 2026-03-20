// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TrustScorer} from "../src/TrustScorer.sol";
import {PredictionMarket} from "../src/PredictionMarket.sol";

contract CortexUnderwriterTest is Test {
    MockUSDC public usdc;
    AgentRegistry public registry;
    TrustScorer public scorer;
    PredictionMarket public market;

    address public owner = makeAddr("owner");
    address public agent1 = makeAddr("agent1");
    address public agent2 = makeAddr("agent2");
    address public agent3 = makeAddr("agent3");

    uint256 constant STAKE = 500e6; // 500 USDC
    uint256 constant INSURANCE_AMOUNT = 200e6; // 200 USDC
    bytes32 constant PRED_HASH = keccak256("BTC will hit 100k by end of March");

    function setUp() public {
        vm.startPrank(owner);

        usdc = new MockUSDC();
        registry = new AgentRegistry();
        scorer = new TrustScorer();
        market = new PredictionMarket(
            address(usdc),
            address(scorer),
            address(registry)
        );
        scorer.setPredictionMarket(address(market));

        vm.stopPrank();

        // Fund agents with USDC
        usdc.mint(agent1, 10_000e6);
        usdc.mint(agent2, 10_000e6);
        usdc.mint(agent3, 10_000e6);

        // Register agents
        vm.prank(agent1);
        registry.registerAgent("ipfs://agent1-card");

        vm.prank(agent2);
        registry.registerAgent("ipfs://agent2-card");

        vm.prank(agent3);
        registry.registerAgent("ipfs://agent3-card");

        // Approve USDC spending
        vm.prank(agent1);
        usdc.approve(address(market), type(uint256).max);

        vm.prank(agent2);
        usdc.approve(address(market), type(uint256).max);

        vm.prank(agent3);
        usdc.approve(address(market), type(uint256).max);
    }

    // =========================================================================
    // AgentRegistry Tests
    // =========================================================================

    function test_registerAgent() public {
        address newAgent = makeAddr("newAgent");
        vm.prank(newAgent);
        registry.registerAgent("ipfs://new-agent");

        assertTrue(registry.isRegistered(newAgent));
        AgentRegistry.Agent memory agent = registry.getAgent(newAgent);
        assertEq(agent.wallet, newAgent);
        assertEq(agent.active, true);
    }

    function test_registerAgent_revertsDuplicate() public {
        vm.prank(agent1);
        vm.expectRevert(abi.encodeWithSelector(AgentRegistry.AlreadyRegistered.selector, agent1));
        registry.registerAgent("ipfs://duplicate");
    }

    function test_registerAgent_revertsEmptyUri() public {
        address newAgent = makeAddr("emptyUri");
        vm.prank(newAgent);
        vm.expectRevert(AgentRegistry.EmptyUri.selector);
        registry.registerAgent("");
    }

    function test_deactivateAgent() public {
        vm.prank(owner);
        registry.deactivateAgent(agent1);
        assertFalse(registry.isRegistered(agent1));
    }

    // =========================================================================
    // PredictionMarket — Create Prediction
    // =========================================================================

    function test_createPrediction() public {
        uint256 expiresAt = block.timestamp + 7 days;

        vm.prank(agent1);
        uint256 predId = market.createPrediction(PRED_HASH, STAKE, expiresAt);

        assertEq(predId, 0);
        assertEq(market.predictionCount(), 1);

        (
            address agent,
            bytes32 hash,
            uint256 stakeAmount,
            uint256 expires,
            uint256 pool,
            uint256 premiums,
            PredictionMarket.PredictionStatus status,
            bool claimed
        ) = market.predictions(0);

        assertEq(agent, agent1);
        assertEq(hash, PRED_HASH);
        assertEq(stakeAmount, STAKE);
        assertEq(expires, expiresAt);
        assertEq(pool, 0);
        assertEq(premiums, 0);
        assertEq(uint8(status), uint8(PredictionMarket.PredictionStatus.Active));
        assertFalse(claimed);

        // USDC transferred
        assertEq(usdc.balanceOf(agent1), 10_000e6 - STAKE);
        assertEq(usdc.balanceOf(address(market)), STAKE);
    }

    function test_createPrediction_revertsUnregistered() public {
        address unregistered = makeAddr("unregistered");
        usdc.mint(unregistered, 1000e6);
        vm.startPrank(unregistered);
        usdc.approve(address(market), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(PredictionMarket.NotRegistered.selector, unregistered));
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);
        vm.stopPrank();
    }

    function test_createPrediction_revertsLowStake() public {
        vm.prank(agent1);
        vm.expectRevert(
            abi.encodeWithSelector(PredictionMarket.StakeTooLow.selector, 50e6, 100e6)
        );
        market.createPrediction(PRED_HASH, 50e6, block.timestamp + 7 days);
    }

    // =========================================================================
    // PredictionMarket — Buy Insurance
    // =========================================================================

    function test_buyInsurance() public {
        uint256 expiresAt = block.timestamp + 7 days;

        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, expiresAt);

        uint256 premium = market.calculatePremium(0, INSURANCE_AMOUNT);
        assertTrue(premium > 0, "Premium should be > 0");

        uint256 balBefore = usdc.balanceOf(agent2);

        vm.prank(agent2);
        market.buyInsurance(0, INSURANCE_AMOUNT);

        // Check insurance position
        (uint256 amount, uint256 premPaid, bool claimed) = market.insurancePositions(0, agent2);
        assertEq(amount, INSURANCE_AMOUNT);
        assertEq(premPaid, premium);
        assertFalse(claimed);

        // USDC transferred
        assertEq(usdc.balanceOf(agent2), balBefore - premium);
    }

    function test_buyInsurance_revertsOwnPrediction() public {
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        vm.prank(agent1);
        vm.expectRevert(PredictionMarket.CannotInsureOwnPrediction.selector);
        market.buyInsurance(0, INSURANCE_AMOUNT);
    }

    function test_buyInsurance_revertsExceedsMax() public {
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        // Max insurance = 3 * 500 USDC = 1500 USDC
        vm.prank(agent2);
        vm.expectRevert(); // InsuranceExceedsMax
        market.buyInsurance(0, 1501e6);
    }

    // =========================================================================
    // Full Flow — Prediction Correct (predictor wins)
    // =========================================================================

    function test_fullFlow_predictionCorrect() public {
        uint256 expiresAt = block.timestamp + 7 days;

        // Agent1 creates prediction
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, expiresAt);

        // Agent2 buys insurance
        uint256 premium = market.calculatePremium(0, INSURANCE_AMOUNT);
        vm.prank(agent2);
        market.buyInsurance(0, INSURANCE_AMOUNT);

        uint256 agent1BalBefore = usdc.balanceOf(agent1);

        // Owner resolves as correct
        vm.prank(owner);
        market.resolvePrediction(0, true);

        // Agent1 claims stake + premiums
        vm.prank(agent1);
        market.claimStake(0);

        uint256 protocolFee = (premium * 200) / 10000; // 2% of premiums
        uint256 expectedPayout = STAKE + premium - protocolFee;

        assertEq(usdc.balanceOf(agent1), agent1BalBefore + expectedPayout);

        // Insurance buyer cannot claim
        vm.prank(agent2);
        vm.expectRevert(
            abi.encodeWithSelector(PredictionMarket.PredictionNotWrong.selector, 0)
        );
        market.claimInsurance(0);
    }

    // =========================================================================
    // Full Flow — Prediction Wrong (insurance buyers win)
    // =========================================================================

    function test_fullFlow_predictionWrong() public {
        uint256 expiresAt = block.timestamp + 7 days;

        // Agent1 creates prediction
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, expiresAt);

        // Agent2 buys insurance for 200 USDC coverage
        vm.prank(agent2);
        market.buyInsurance(0, INSURANCE_AMOUNT);

        // Agent3 buys insurance for 300 USDC coverage
        vm.prank(agent3);
        market.buyInsurance(0, 300e6);

        uint256 agent2BalBefore = usdc.balanceOf(agent2);
        uint256 agent3BalBefore = usdc.balanceOf(agent3);

        // Owner resolves as wrong
        vm.prank(owner);
        market.resolvePrediction(0, false);

        // Agent2 claims insurance — gets proportional share of stake
        vm.prank(agent2);
        market.claimInsurance(0);

        // Agent2 gets: (200 / 500) * 500 USDC = 200 USDC (minus 2% fee)
        uint256 agent2Payout = (INSURANCE_AMOUNT * STAKE) / (INSURANCE_AMOUNT + 300e6);
        uint256 agent2Fee = (agent2Payout * 200) / 10000;
        assertEq(usdc.balanceOf(agent2), agent2BalBefore + agent2Payout - agent2Fee);

        // Agent3 claims insurance
        vm.prank(agent3);
        market.claimInsurance(0);

        uint256 agent3Payout = (300e6 * STAKE) / (INSURANCE_AMOUNT + 300e6);
        uint256 agent3Fee = (agent3Payout * 200) / 10000;
        assertEq(usdc.balanceOf(agent3), agent3BalBefore + agent3Payout - agent3Fee);

        // Agent1 cannot claim stake
        vm.prank(agent1);
        vm.expectRevert(
            abi.encodeWithSelector(PredictionMarket.PredictionNotCorrect.selector, 0)
        );
        market.claimStake(0);
    }

    // =========================================================================
    // Full Flow — Double claim prevention
    // =========================================================================

    function test_claimStake_revertsDoubleClaim() public {
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        vm.prank(owner);
        market.resolvePrediction(0, true);

        vm.prank(agent1);
        market.claimStake(0);

        vm.prank(agent1);
        vm.expectRevert(PredictionMarket.AlreadyClaimed.selector);
        market.claimStake(0);
    }

    function test_claimInsurance_revertsDoubleClaim() public {
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        vm.prank(agent2);
        market.buyInsurance(0, INSURANCE_AMOUNT);

        vm.prank(owner);
        market.resolvePrediction(0, false);

        vm.prank(agent2);
        market.claimInsurance(0);

        vm.prank(agent2);
        vm.expectRevert(PredictionMarket.AlreadyClaimed.selector);
        market.claimInsurance(0);
    }

    // =========================================================================
    // TrustScorer Tests
    // =========================================================================

    function test_trustScore_defaultForNewAgent() public view {
        uint256 score = scorer.getTrustScore(agent1);
        assertEq(score, 5000); // DEFAULT_SCORE = 50%
    }

    function test_trustScore_updatesAfterResolution() public {
        // Create and resolve 5 predictions to get past MIN_PREDICTIONS
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent1);
            market.createPrediction(
                keccak256(abi.encodePacked("prediction", i)),
                STAKE,
                block.timestamp + 7 days
            );

            vm.prank(owner);
            market.resolvePrediction(i, true); // All correct
        }

        (uint256 total, uint256 correct,,,) = scorer.scores(agent1);
        assertEq(total, 5);
        assertEq(correct, 5);

        uint256 score = scorer.getTrustScore(agent1);
        assertTrue(score > 5000, "Score should be above default after 5 correct predictions");
        assertTrue(scorer.hasValidScore(agent1));
    }

    function test_trustScore_decreasesWithWrongPredictions() public {
        // 3 correct, 2 wrong
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(agent1);
            market.createPrediction(
                keccak256(abi.encodePacked("pred", i)),
                STAKE,
                block.timestamp + 7 days
            );

            vm.prank(owner);
            market.resolvePrediction(i, i < 3); // First 3 correct, last 2 wrong
        }

        uint256 mixedScore = scorer.getTrustScore(agent1);

        // Now test agent2 with all correct
        for (uint256 i = 5; i < 10; i++) {
            vm.prank(agent2);
            market.createPrediction(
                keccak256(abi.encodePacked("pred", i)),
                STAKE,
                block.timestamp + 7 days
            );

            vm.prank(owner);
            market.resolvePrediction(i, true);
        }

        uint256 perfectScore = scorer.getTrustScore(agent2);
        assertTrue(
            perfectScore > mixedScore,
            "Perfect record should score higher than mixed"
        );
    }

    // =========================================================================
    // Expiry Tests
    // =========================================================================

    function test_expirePrediction() public {
        uint256 expiresAt = block.timestamp + 7 days;

        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, expiresAt);

        // Cannot expire before time
        vm.expectRevert(abi.encodeWithSelector(PredictionMarket.NotExpired.selector, 0));
        market.expirePrediction(0);

        // Warp past expiry
        vm.warp(expiresAt + 1);
        market.expirePrediction(0);

        // Agent claims stake back
        uint256 balBefore = usdc.balanceOf(agent1);
        vm.prank(agent1);
        market.claimExpiredStake(0);
        assertEq(usdc.balanceOf(agent1), balBefore + STAKE);
    }

    // =========================================================================
    // Pause Tests
    // =========================================================================

    function test_pause_blocksPredictionCreation() public {
        vm.prank(owner);
        market.pause();

        vm.prank(agent1);
        vm.expectRevert(); // EnforcedPause
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        vm.prank(owner);
        market.unpause();

        // Works after unpause
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);
    }

    // =========================================================================
    // Protocol Fees
    // =========================================================================

    function test_withdrawFees() public {
        vm.prank(agent1);
        market.createPrediction(PRED_HASH, STAKE, block.timestamp + 7 days);

        vm.prank(agent2);
        market.buyInsurance(0, INSURANCE_AMOUNT);

        vm.prank(owner);
        market.resolvePrediction(0, true);

        vm.prank(agent1);
        market.claimStake(0);

        uint256 fees = market.protocolFees();
        assertTrue(fees > 0, "Should have accumulated fees");

        address treasury = makeAddr("treasury");
        vm.prank(owner);
        market.withdrawFees(treasury);

        assertEq(usdc.balanceOf(treasury), fees);
        assertEq(market.protocolFees(), 0);
    }
}
