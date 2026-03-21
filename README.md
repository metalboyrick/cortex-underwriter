# Cortex Underwriter

On-chain trust scoring and prediction insurance for AI agents.

## The Problem

AI agents operating on-chain have no way to verify whether another agent is trustworthy. Reputation is unfalsifiable — any agent can claim accuracy. When agents delegate to or trade with unverified counterparties, they risk real funds with zero recourse.

## The Solution

Cortex Underwriter creates economically falsifiable trust. Agents stake USDC behind their predictions, and other agents buy insurance against those predictions being wrong. The insurance price becomes a real-time, Sybil-resistant trust signal — the market literally prices how trustworthy each agent is.

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    CORTEX UNDERWRITER                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. REGISTER        Agent registers on-chain identity   │
│     ┌──────┐        via ERC-8004 AgentRegistry          │
│     │ Agent │───────────────────────► AgentRegistry     │
│     └──────┘                                            │
│        │                                                │
│  2. STAKE           Agent stakes USDC behind a          │
│        │            prediction (e.g. "ETH > $4k by Q2") │
│        ▼                                                │
│     PredictionMarket ◄──── USDC stake                   │
│        │                                                │
│  3. INSURE          Other agents evaluate the           │
│        │            prediction and buy insurance         │
│        ▼            against it being wrong              │
│     Insurance Pool ◄──── USDC premiums                  │
│        │                                                │
│  4. RESOLVE         Oracle or consensus resolves        │
│        │            the prediction outcome              │
│        ▼                                                │
│     Resolution ──── correct? ──┬── YES: staker wins     │
│                                └── NO:  insurers win    │
│                                                         │
│  5. UPDATE          TrustScorer updates on-chain        │
│                     trust score for the agent           │
│     TrustScorer ───────────────► Agent reputation       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Architecture

```
cortex-underwriter/
├── contracts/    Foundry/Solidity smart contracts
│   ├── PredictionMarket.sol   — stake predictions, resolve outcomes
│   ├── TrustScorer.sol        — on-chain trust score computation
│   ├── AgentRegistry.sol      — ERC-8004 agent identity registry
│   └── MockUSDC.sol           — testnet USDC for development
│
├── agent/        TypeScript agent runtime
│   ├── Predictor agent        — creates and stakes predictions
│   ├── Insurer agent          — evaluates predictions, buys insurance
│   ├── Validator agent        — resolves outcomes, triggers scoring
│   └── Express API            — HTTP interface for agent coordination
│
└── dashboard/    Next.js demo dashboard
    └── Live view of agents, predictions, trust scores, and payouts
```

## Tech Stack

- **Contracts**: Foundry, Solidity 0.8.x
- **Agent Runtime**: TypeScript, ethers.js v6, Express
- **Dashboard**: Next.js 15, Tailwind CSS, shadcn/ui
- **Network**: Base Sepolia (testnet)

## Quick Start

### Contracts

```bash
cd contracts
forge build
forge test
```

### Agent Runtime

```bash
cd agent
cp .env.example .env   # fill in your keys
npm install
npm start
```

### Dashboard

```bash
cd dashboard
npm install
npm run dev
```

## Deployed Contracts (Base Sepolia)

| Contract | Address | Basescan |
|----------|---------|----------|
| MockUSDC | `0xa249AdcB0f5E9E7224A97b6BfCBb6F44B99EF63c` | [View](https://sepolia.basescan.org/address/0xa249AdcB0f5E9E7224A97b6BfCBb6F44B99EF63c) |
| AgentRegistry | `0xDF9c853dEed46E2e5c053313434F3C42fC4f320A` | [View](https://sepolia.basescan.org/address/0xDF9c853dEed46E2e5c053313434F3C42fC4f320A) |
| TrustScorer | `0x2ED590A785Ea73d180277063FD6aE53594Ed9fA2` | [View](https://sepolia.basescan.org/address/0x2ED590A785Ea73d180277063FD6aE53594Ed9fA2) |
| PredictionMarket | `0x083D22A05BD191aA1Ee09b9c5375Ed8f85255550` | [View](https://sepolia.basescan.org/address/0x083D22A05BD191aA1Ee09b9c5375Ed8f85255550) |

Network: Base Sepolia (Chain ID: 84532)
Deployer: `0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253`

## ERC-8004 Agent Identity (Base Mainnet)

The Cortex Underwriter agents are registered on the real [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) IdentityRegistry on Base mainnet. This is the same registry used by other agent projects in the ecosystem.

| Item | Value |
|------|-------|
| IdentityRegistry | [`0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`](https://basescan.org/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) |
| Contract Name | AgentIdentity (symbol: AGENT) |
| Network | Base Mainnet (Chain ID: 8453) |
| Interface | `register(string uri) → uint256 tokenId` (permissionless, ERC-721) |

### Agent Card Metadata (ERC-8004 format)

Each agent has a JSON metadata card conforming to the `eip-8004#registration-v1` schema:

| Agent | Metadata URI |
|-------|-------------|
| Predictor | [predictor-agent-card.json](https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/predictor-agent-card.json) |
| Insurer | [insurer-agent-card.json](https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/insurer-agent-card.json) |
| Validator | [validator-agent-card.json](https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/validator-agent-card.json) |

### Registration

To register the agents on Base mainnet:

```bash
# Dry run (simulates only)
./agent/scripts/register-erc8004-mainnet.sh

# Live registration (requires ETH on Base mainnet)
./agent/scripts/register-erc8004-mainnet.sh --send
```

Requires ~0.00001 ETH on Base mainnet for all 3 registrations (~$0.04 at current gas prices). Send ETH to the deployer wallet `0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253` on Base (chain 8453).

## Premium Math: Worked Example

Here's how the insurance pricing actually works end-to-end.

**Setup**: Agent A has a trust score of 8000 (80% accuracy over 10 resolved predictions, 1000 USDC total staked across those predictions).

1. Agent A stakes **200 USDC** on the prediction "ETH > $4000 in 24h"
2. Agent B wants **100 USDC** of coverage against this prediction being wrong
3. Premium calculation: `100 * (10000 - 8000) / 10000 * timeDecay = ~20 USDC` (20% of coverage amount)
4. Agent B pays **20 USDC** premium to the insurance pool

**If Agent A is wrong** (ETH stays below $4000):
- Agent B gets **100 USDC** payout for a 20 USDC premium (5x return)
- Agent A loses their 200 USDC stake
- Agent A's trust score drops

**If Agent A is right** (ETH exceeds $4000):
- Agent A keeps their 200 USDC stake + earns the 20 USDC premium (10% yield on stake)
- Agent B loses their 20 USDC premium
- Agent A's trust score increases

The key insight: the insurance price (20%) **is** the market's real-time assessment of Agent A's trustworthiness. A more trusted agent (higher score) means cheaper insurance, which means other agents are more willing to rely on their predictions. Trust becomes economically falsifiable.

## Game Theory & Attack Vectors

We're not going to pretend this system is bulletproof. Here's what we know about the attack surface and what we've done (or plan to do) about it.

### 1. Trust Score Farming

**The attack**: An agent creates trivial predictions like "USDC will stay near $1" or "The sun will rise tomorrow" to farm high accuracy cheaply, inflating their trust score without demonstrating real skill.

**Current mitigation**: Stake-weighting accounts for 20% of the trust score calculation. Minimum-stake farming yields lower trust scores than agents who put real money behind harder predictions.

**Future**: Difficulty-weighted scoring based on prediction volatility. Predicting a stablecoin peg holds should count for almost nothing. Predicting a volatile asset's price within a tight range should count for a lot more.

### 2. Self-Insurance via Sybil Wallets

**The attack**: The `CannotInsureOwnPrediction` check prevents insuring your own predictions from the same wallet, but nothing stops an attacker from using a second wallet to buy insurance on their own prediction — guaranteeing profit regardless of outcome.

**Current mitigation**: The 2% protocol fee on every insurance purchase makes wash trading costly. You're paying a tax on every round-trip.

**Future**: Require reputation history before allowing insurance purchases. Slashing for wallets with statistically correlated behavior (always insuring the same predictor, etc.).

### 3. Oracle Centralization

**The attack**: Prediction resolution is `onlyOwner`. The contract owner could resolve predictions dishonestly to profit or to damage specific agents' trust scores.

**Current mitigation**: Honestly — this is a hackathon scope limitation. We know it's centralized. The contract architecture is designed so `resolvePrediction()` is a clean interface callable by any authorized oracle. Swapping in a decentralized oracle doesn't require rewriting the contract.

**Path forward**: Chainlink price feeds for price-based predictions (ETH > $X). UMA optimistic oracle for subjective predictions where the answer isn't a simple price check.

### 4. Insurance Pool Drain

**The attack**: If the oracle is compromised, an attacker who knows the resolution outcome in advance can buy maximum insurance right before resolution, draining the pool.

**Current mitigation**: Insurance coverage is capped at 3x the staker's amount. This limits the blast radius of any single exploit.

**Future**: Decentralized oracle resolution eliminates the "insider knowledge" vector entirely. Time-weighted insurance pricing (buying closer to resolution costs more) would add another layer.

---

We'd rather ship with known limitations documented than pretend they don't exist. Every vector above has a clear upgrade path, and the contract architecture was designed with these upgrades in mind.

## Built For

[The Synthesis Hackathon](https://synthesis.md)

## Powered By

[Cortex](https://cortex.solder.build) — AI agent memory layer by Solder
