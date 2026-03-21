// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TrustScorer
/// @notice Computes on-chain trust scores for agents based on prediction history
/// @dev Scores are in basis points (0-10000). Only the PredictionMarket contract can update scores.
contract TrustScorer is Ownable {
    struct AgentScore {
        uint256 totalPredictions;
        uint256 correctPredictions;
        uint256 totalStaked;
        uint256 totalInsurancePaid;
        uint256 lastUpdated;
    }

    /// @notice Score data per agent address
    mapping(address => AgentScore) public scores;

    /// @notice Address authorized to call updateScore (the PredictionMarket contract)
    address public predictionMarket;

    /// @notice Minimum predictions before a trust score is considered valid
    uint256 public constant MIN_PREDICTIONS = 5;

    /// @notice Default trust score for agents without enough history (50% = 5000 bps)
    uint256 public constant DEFAULT_SCORE = 5000;

    /// @notice Maximum trust score in basis points
    uint256 public constant MAX_SCORE = 10000;

    event TrustScoreUpdated(
        address indexed agent,
        uint256 newScore,
        uint256 totalPredictions,
        uint256 correctPredictions
    );
    event PredictionMarketSet(address indexed market);

    error Unauthorized();
    error ZeroAddress();

    constructor() Ownable(msg.sender) {}

    /// @notice Set the PredictionMarket contract address (one-time only)
    /// @param market The PredictionMarket contract address
    function setPredictionMarket(address market) external onlyOwner {
        if (market == address(0)) revert ZeroAddress();
        if (predictionMarket != address(0)) revert Unauthorized();
        predictionMarket = market;
        emit PredictionMarketSet(market);
    }

    /// @notice Update an agent's score after a prediction is resolved
    /// @dev Only callable by the PredictionMarket contract
    /// @param agent The agent whose score to update
    /// @param correct Whether the prediction was correct
    /// @param stakeAmount The USDC amount that was staked
    /// @param insuranceAmount Total insurance purchased against this prediction
    function updateScore(
        address agent,
        bool correct,
        uint256 stakeAmount,
        uint256 insuranceAmount
    ) external {
        if (msg.sender != predictionMarket) revert Unauthorized();

        AgentScore storage s = scores[agent];

        unchecked { ++s.totalPredictions; }
        if (correct) {
            unchecked { ++s.correctPredictions; }
        }
        s.totalStaked += stakeAmount;
        s.totalInsurancePaid += insuranceAmount;
        s.lastUpdated = block.timestamp;

        emit TrustScoreUpdated(
            agent,
            getTrustScore(agent),
            s.totalPredictions,
            s.correctPredictions
        );
    }

    /// @notice Get the trust score for an agent
    /// @param agent The agent address
    /// @return Trust score in basis points (0-10000)
    function getTrustScore(address agent) public view returns (uint256) {
        AgentScore storage s = scores[agent];

        // Not enough history — return default score
        if (s.totalPredictions < MIN_PREDICTIONS) {
            return DEFAULT_SCORE;
        }

        // Base accuracy score: correctPredictions / totalPredictions * 10000
        uint256 accuracyScore = (s.correctPredictions * MAX_SCORE) / s.totalPredictions;

        // Stake weight: logarithmic bonus for cumulative stake
        // Each 1000 USDC (1000e6) of cumulative stake adds 2% (200 bps) up to 20% (2000 bps)
        uint256 stakeBonus = _calculateStakeBonus(s.totalStaked);

        // Weighted score: 80% accuracy + 20% stake bonus
        uint256 weightedScore = (accuracyScore * 8000 + stakeBonus * 2000) / MAX_SCORE;

        // Cap at MAX_SCORE
        return weightedScore > MAX_SCORE ? MAX_SCORE : weightedScore;
    }

    /// @notice Check if an agent has enough history for a valid score
    /// @param agent The agent address
    /// @return True if agent has >= MIN_PREDICTIONS resolved predictions
    function hasValidScore(address agent) external view returns (bool) {
        return scores[agent].totalPredictions >= MIN_PREDICTIONS;
    }

    /// @dev Calculate stake bonus in basis points based on cumulative stake
    /// @param totalStaked Cumulative USDC staked (6 decimals)
    /// @return Bonus in basis points (0-10000)
    function _calculateStakeBonus(uint256 totalStaked) internal pure returns (uint256) {
        // Each 1000 USDC adds 1000 bps, capped at 10000
        // 1000 USDC = 1000e6 = 1_000_000_000
        uint256 bonus = (totalStaked * MAX_SCORE) / (10_000e6);
        return bonus > MAX_SCORE ? MAX_SCORE : bonus;
    }
}
