// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {TrustScorer} from "./TrustScorer.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title PredictionMarket
/// @notice Core contract for Cortex Underwriter — agents stake USDC on predictions,
///         others buy insurance against those predictions, oracle resolves outcomes
/// @dev Owner acts as oracle/validator for prediction resolution (hackathon scope)
contract PredictionMarket is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // -- Enums --

    enum PredictionStatus {
        Active,
        Resolved_Correct,
        Resolved_Wrong,
        Expired
    }

    // -- Structs --

    struct Prediction {
        address agent;
        bytes32 predictionHash;
        uint256 stakeAmount;
        uint256 expiresAt;
        uint256 insurancePool;
        uint256 premiumsCollected;
        PredictionStatus status;
        bool stakeClaimed;
    }

    struct InsurancePosition {
        uint256 amount;
        uint256 premiumPaid;
        bool claimed;
    }

    // -- State --

    IERC20 public immutable USDC;
    TrustScorer public immutable TRUST_SCORER;
    AgentRegistry public immutable AGENT_REGISTRY;

    /// @notice All predictions indexed by ID
    Prediction[] public predictions;

    /// @notice Insurance positions: predictionId => buyer => position
    mapping(uint256 => mapping(address => InsurancePosition)) public insurancePositions;

    /// @notice Insurance buyers per prediction for iteration
    mapping(uint256 => address[]) private _insuranceBuyers;

    /// @notice Minimum stake to create a prediction (100 USDC)
    uint256 public constant MIN_STAKE = 100e6;

    /// @notice Maximum insurance amount relative to stake (3x)
    uint256 public constant MAX_INSURANCE_MULTIPLIER = 3;

    /// @notice Protocol fee in basis points (2%)
    uint256 public constant PROTOCOL_FEE_BPS = 200;

    /// @notice Accumulated protocol fees available for withdrawal
    uint256 public protocolFees;

    // -- Events --

    event PredictionCreated(
        uint256 indexed predictionId,
        address indexed agent,
        bytes32 predictionHash,
        uint256 stakeAmount,
        uint256 expiresAt
    );

    event InsurancePurchased(
        uint256 indexed predictionId,
        address indexed buyer,
        uint256 insuranceAmount,
        uint256 premiumPaid
    );

    event PredictionResolved(
        uint256 indexed predictionId,
        address indexed agent,
        bool correct,
        PredictionStatus status
    );

    event InsuranceClaimed(
        uint256 indexed predictionId,
        address indexed buyer,
        uint256 payout
    );

    event StakeClaimed(
        uint256 indexed predictionId,
        address indexed agent,
        uint256 payout
    );

    event PredictionExpired(uint256 indexed predictionId);

    // -- Errors --

    error NotRegistered(address agent);
    error StakeTooLow(uint256 provided, uint256 minimum);
    error ExpiryTooSoon(uint256 expiresAt, uint256 minimum);
    error PredictionNotActive(uint256 predictionId);
    error PredictionNotResolved(uint256 predictionId);
    error InsuranceExceedsMax(uint256 requested, uint256 maximum);
    error ZeroAmount();
    error NotPredictionAgent(address caller, address agent);
    error AlreadyClaimed();
    error NoInsurancePosition();
    error PredictionNotWrong(uint256 predictionId);
    error PredictionNotCorrect(uint256 predictionId);
    error NotExpired(uint256 predictionId);
    error CannotInsureOwnPrediction();

    // -- Constructor --

    constructor(
        address usdc_,
        address trustScorer_,
        address agentRegistry_
    ) Ownable(msg.sender) {
        USDC = IERC20(usdc_);
        TRUST_SCORER = TrustScorer(trustScorer_);
        AGENT_REGISTRY = AgentRegistry(agentRegistry_);
    }

    // -- Core Functions --

    /// @notice Create a prediction with a USDC stake
    /// @param predictionHash keccak256 of prediction data (stored off-chain)
    /// @param stakeAmount USDC to stake behind this prediction
    /// @param expiresAt Unix timestamp when the prediction expires
    /// @return predictionId The ID of the created prediction
    function createPrediction(
        bytes32 predictionHash,
        uint256 stakeAmount,
        uint256 expiresAt
    ) external nonReentrant whenNotPaused returns (uint256 predictionId) {
        if (!AGENT_REGISTRY.isRegistered(msg.sender)) revert NotRegistered(msg.sender);
        if (stakeAmount < MIN_STAKE) revert StakeTooLow(stakeAmount, MIN_STAKE);
        if (expiresAt <= block.timestamp + 1 hours) {
            revert ExpiryTooSoon(expiresAt, block.timestamp + 1 hours);
        }

        predictionId = predictions.length;

        predictions.push(Prediction({
            agent: msg.sender,
            predictionHash: predictionHash,
            stakeAmount: stakeAmount,
            expiresAt: expiresAt,
            insurancePool: 0,
            premiumsCollected: 0,
            status: PredictionStatus.Active,
            stakeClaimed: false
        }));

        emit PredictionCreated(predictionId, msg.sender, predictionHash, stakeAmount, expiresAt);

        // Transfer stake from agent
        USDC.safeTransferFrom(msg.sender, address(this), stakeAmount);
    }

    /// @notice Buy insurance against a prediction
    /// @dev Premium = insuranceAmount * (10000 - trustScore) / 10000 * timeDecayFactor / 10000
    /// @param predictionId The prediction to insure against
    /// @param insuranceAmount The insurance coverage amount desired
    function buyInsurance(
        uint256 predictionId,
        uint256 insuranceAmount
    ) external nonReentrant whenNotPaused {
        if (insuranceAmount == 0) revert ZeroAmount();

        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Active) revert PredictionNotActive(predictionId);
        if (block.timestamp >= pred.expiresAt) revert PredictionNotActive(predictionId);
        if (msg.sender == pred.agent) revert CannotInsureOwnPrediction();

        // Cap total insurance at MAX_INSURANCE_MULTIPLIER * stakeAmount
        uint256 maxInsurance = pred.stakeAmount * MAX_INSURANCE_MULTIPLIER;
        if (pred.insurancePool + insuranceAmount > maxInsurance) {
            revert InsuranceExceedsMax(insuranceAmount, maxInsurance - pred.insurancePool);
        }

        // Calculate premium
        uint256 premium = calculatePremium(predictionId, insuranceAmount);

        // Effects
        pred.insurancePool += insuranceAmount;
        pred.premiumsCollected += premium;

        InsurancePosition storage pos = insurancePositions[predictionId][msg.sender];
        if (pos.amount == 0) {
            _insuranceBuyers[predictionId].push(msg.sender);
        }
        pos.amount += insuranceAmount;
        pos.premiumPaid += premium;

        emit InsurancePurchased(predictionId, msg.sender, insuranceAmount, premium);

        // Transfer premium from buyer
        USDC.safeTransferFrom(msg.sender, address(this), premium);
    }

    /// @notice Resolve a prediction outcome — only callable by owner (oracle)
    /// @param predictionId The prediction to resolve
    /// @param correct Whether the prediction was correct
    function resolvePrediction(
        uint256 predictionId,
        bool correct
    ) external onlyOwner {
        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Active) revert PredictionNotActive(predictionId);

        pred.status = correct ? PredictionStatus.Resolved_Correct : PredictionStatus.Resolved_Wrong;

        // Update trust score
        TRUST_SCORER.updateScore(pred.agent, correct, pred.stakeAmount, pred.insurancePool);

        emit PredictionResolved(predictionId, pred.agent, correct, pred.status);
    }

    /// @notice Claim insurance payout after a prediction was resolved wrong
    /// @param predictionId The prediction ID
    function claimInsurance(uint256 predictionId) external nonReentrant {
        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Resolved_Wrong) {
            revert PredictionNotWrong(predictionId);
        }

        InsurancePosition storage pos = insurancePositions[predictionId][msg.sender];
        if (pos.amount == 0) revert NoInsurancePosition();
        if (pos.claimed) revert AlreadyClaimed();

        pos.claimed = true;

        // Payout: proportional share of the stake + their premium back
        // Each insurance buyer gets (their insurance amount / total insurance pool) * stakeAmount
        uint256 payout = (pos.amount * pred.stakeAmount) / pred.insurancePool;

        // Protocol fee on the payout
        uint256 fee = (payout * PROTOCOL_FEE_BPS) / 10000;
        protocolFees += fee;
        uint256 netPayout = payout - fee;

        emit InsuranceClaimed(predictionId, msg.sender, netPayout);

        USDC.safeTransfer(msg.sender, netPayout);
    }

    /// @notice Claim stake + premiums after a correct prediction
    /// @param predictionId The prediction ID
    function claimStake(uint256 predictionId) external nonReentrant {
        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Resolved_Correct) {
            revert PredictionNotCorrect(predictionId);
        }
        if (msg.sender != pred.agent) revert NotPredictionAgent(msg.sender, pred.agent);
        if (pred.stakeClaimed) revert AlreadyClaimed();

        pred.stakeClaimed = true;

        // Payout: original stake + all premiums collected
        uint256 totalPayout = pred.stakeAmount + pred.premiumsCollected;

        // Protocol fee on the premiums only
        uint256 fee = (pred.premiumsCollected * PROTOCOL_FEE_BPS) / 10000;
        protocolFees += fee;
        uint256 netPayout = totalPayout - fee;

        emit StakeClaimed(predictionId, msg.sender, netPayout);

        USDC.safeTransfer(msg.sender, netPayout);
    }

    /// @notice Mark an expired prediction and return stake to agent
    /// @param predictionId The prediction to expire
    function expirePrediction(uint256 predictionId) external {
        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Active) revert PredictionNotActive(predictionId);
        if (block.timestamp < pred.expiresAt) revert NotExpired(predictionId);

        pred.status = PredictionStatus.Expired;

        emit PredictionExpired(predictionId);
    }

    /// @notice Claim stake back from an expired prediction
    /// @param predictionId The prediction ID
    function claimExpiredStake(uint256 predictionId) external nonReentrant {
        Prediction storage pred = predictions[predictionId];
        if (pred.status != PredictionStatus.Expired) revert PredictionNotActive(predictionId);
        if (msg.sender != pred.agent) revert NotPredictionAgent(msg.sender, pred.agent);
        if (pred.stakeClaimed) revert AlreadyClaimed();

        pred.stakeClaimed = true;

        // Return stake only — premiums are kept by protocol since no resolution
        uint256 payout = pred.stakeAmount;

        emit StakeClaimed(predictionId, msg.sender, payout);

        USDC.safeTransfer(msg.sender, payout);
    }

    // -- View Functions --

    /// @notice Calculate the premium for an insurance purchase
    /// @param predictionId The prediction ID
    /// @param insuranceAmount The desired insurance coverage
    /// @return premium The premium cost in USDC
    function calculatePremium(
        uint256 predictionId,
        uint256 insuranceAmount
    ) public view returns (uint256 premium) {
        Prediction storage pred = predictions[predictionId];

        // Get agent trust score (0-10000 bps)
        uint256 trustScore = TRUST_SCORER.getTrustScore(pred.agent);

        // Risk factor: (10000 - trustScore) / 10000
        // Higher trust = lower risk = lower premium
        uint256 riskFactor = 10000 - trustScore;

        // Base premium = insuranceAmount * riskFactor / 10000
        uint256 basePremium = (insuranceAmount * riskFactor) / 10000;

        // Time decay: premium increases as expiry approaches
        // If more than 1 day remains, 1x multiplier. Less time = higher premium.
        uint256 timeRemaining = pred.expiresAt > block.timestamp
            ? pred.expiresAt - block.timestamp
            : 0;

        uint256 timeFactor;
        if (timeRemaining == 0) {
            timeFactor = 50000; // Max 5x
        } else if (timeRemaining >= 1 days) {
            timeFactor = 10000; // 1x
        } else {
            timeFactor = (10000 * 1 days) / timeRemaining;
            if (timeFactor > 50000) timeFactor = 50000;
        }

        premium = (basePremium * timeFactor) / 10000;

        // Minimum premium of 1% of insurance amount
        uint256 minPremium = insuranceAmount / 100;
        if (premium < minPremium) premium = minPremium;
    }

    /// @notice Get the total number of predictions
    /// @return The prediction count
    function predictionCount() external view returns (uint256) {
        return predictions.length;
    }

    /// @notice Get insurance buyers for a prediction
    /// @param predictionId The prediction ID
    /// @return Array of buyer addresses
    function getInsuranceBuyers(uint256 predictionId) external view returns (address[] memory) {
        return _insuranceBuyers[predictionId];
    }

    // -- Admin Functions --

    /// @notice Withdraw accumulated protocol fees
    /// @param to Recipient address
    function withdrawFees(address to) external onlyOwner {
        uint256 amount = protocolFees;
        protocolFees = 0;
        USDC.safeTransfer(to, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
