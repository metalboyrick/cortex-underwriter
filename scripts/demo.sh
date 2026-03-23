#!/usr/bin/env bash
# demo.sh — Run a complete Cortex Underwriter demo on Base Sepolia
# Usage: ./scripts/demo.sh <PRIVATE_KEY>
# Requires: Node.js 18+, Foundry (forge/cast)
#
# This script deploys contracts, funds wallets, registers agents,
# runs 3 prediction rounds, and starts the agent runtime.

set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"

# ── Constants ────────────────────────────────────────────────────────────────

RPC_URL="https://sepolia.base.org"
CHAIN_ID=84532
BASESCAN="https://sepolia.basescan.org/tx"
USDC_DECIMALS=6
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Helpers ──────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
RESET='\033[0m'

step() {
  echo ""
  echo -e "${CYAN}${BOLD}[DEMO] Step $1: $2${RESET}"
}

info() {
  echo -e "  $1"
}

ok() {
  echo -e "  ${GREEN}$1 ✓${RESET}"
}

warn() {
  echo -e "  ${YELLOW}WARNING: $1${RESET}"
}

fail() {
  echo -e "  ${RED}ERROR: $1${RESET}"
}

tx_link() {
  echo -e "  ${CYAN}$BASESCAN/$1${RESET}"
}

# Wait between on-chain txs to avoid nonce issues
tx_wait() {
  sleep 3
}

# Send a transaction via cast and extract the tx hash. Prints the hash.
# Usage: hash=$(send_tx <from_key> <to> <sig> [args...])
send_tx() {
  local key="$1"; shift
  local to="$1"; shift
  local sig="$1"; shift
  local result
  result=$(cast send --rpc-url "$RPC_URL" --private-key "$key" "$to" "$sig" "$@" --json 2>&1) || {
    fail "Transaction failed: cast send $to $sig $*"
    echo "$result" | head -5 >&2
    echo ""
    return 1
  }
  local hash
  hash=$(echo "$result" | jq -r '.transactionHash // empty' 2>/dev/null)
  if [[ -z "$hash" ]]; then
    fail "Could not parse tx hash from: $result"
    echo ""
    return 1
  fi
  echo "$hash"
}

# ── Parse args ───────────────────────────────────────────────────────────────

if [[ $# -lt 1 ]]; then
  echo "Usage: ./scripts/demo.sh <PRIVATE_KEY>"
  echo ""
  echo "  PRIVATE_KEY  A Base Sepolia private key with ETH for gas"
  echo ""
  echo "Example:"
  echo "  ./scripts/demo.sh 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  exit 1
fi

DEPLOYER_KEY="$1"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║        Cortex Underwriter — Full Demo on Base Sepolia   ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""

# ── Step 1: Check prerequisites ─────────────────────────────────────────────

step "1/11" "Checking prerequisites..."

# Node.js
if ! command -v node &>/dev/null; then
  fail "Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_VER" -lt 18 ]]; then
  fail "Node.js 18+ required (found v$NODE_VER)"
  exit 1
fi
ok "Node.js $(node -v)"

# Foundry
if ! command -v forge &>/dev/null; then
  fail "Foundry not found. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup"
  exit 1
fi
ok "Foundry $(forge --version | head -1 | awk '{print $2}')"

if ! command -v cast &>/dev/null; then
  fail "cast not found (part of Foundry)"
  exit 1
fi
ok "cast available"

if ! command -v jq &>/dev/null; then
  fail "jq not found. Install: sudo apt install jq"
  exit 1
fi
ok "jq available"

# Validate private key format
if [[ ! "$DEPLOYER_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  fail "Invalid private key format. Must be 0x followed by 64 hex characters."
  exit 1
fi

DEPLOYER_ADDR=$(cast wallet address "$DEPLOYER_KEY" 2>/dev/null)
ok "Deployer wallet: $DEPLOYER_ADDR"

# Check ETH balance
ETH_BAL=$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER_ADDR" --ether 2>/dev/null)
info "ETH balance: $ETH_BAL ETH"
# Rough check — need at least 0.01 ETH
ETH_WEI=$(cast balance --rpc-url "$RPC_URL" "$DEPLOYER_ADDR" 2>/dev/null)
if [[ "$ETH_WEI" == "0" ]]; then
  fail "Deployer has 0 ETH. Fund this wallet on Base Sepolia first."
  fail "Faucet: https://www.alchemy.com/faucets/base-sepolia"
  exit 1
fi

# ── Step 2: Generate additional wallets ──────────────────────────────────────

step "2/11" "Generating agent wallets (deterministic from deployer key)..."

# Derive insurer and validator keys deterministically by hashing the deployer key with a salt
INSURER_KEY=$(cast keccak "$(echo -n "${DEPLOYER_KEY}insurer-salt-v1")" 2>/dev/null)
VALIDATOR_KEY=$(cast keccak "$(echo -n "${DEPLOYER_KEY}validator-salt-v1")" 2>/dev/null)

PREDICTOR_ADDR="$DEPLOYER_ADDR"
INSURER_ADDR=$(cast wallet address "$INSURER_KEY" 2>/dev/null)
VALIDATOR_ADDR=$(cast wallet address "$VALIDATOR_KEY" 2>/dev/null)

ok "Predictor: $PREDICTOR_ADDR (deployer)"
ok "Insurer:   $INSURER_ADDR (derived)"
ok "Validator: $VALIDATOR_ADDR (derived)"

# ── Step 3: Deploy contracts ─────────────────────────────────────────────────

step "3/11" "Deploying contracts..."

cd "$PROJECT_ROOT/contracts"

# Check if contracts are already deployed by looking for broadcast artifacts
DEPLOY_LOG=""
MOCK_USDC=""
AGENT_REGISTRY=""
TRUST_SCORER=""
PREDICTION_MARKET=""

# Always deploy fresh for the demo
DEPLOY_OUTPUT=$(PRIVATE_KEY="$DEPLOYER_KEY" forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --private-key "$DEPLOYER_KEY" \
  --skip-simulation 2>&1) || {
  fail "Contract deployment failed"
  echo "$DEPLOY_OUTPUT"
  exit 1
}

# Parse deployed addresses from forge output
MOCK_USDC=$(echo "$DEPLOY_OUTPUT" | grep "MockUSDC deployed to:" | awk '{print $NF}')
AGENT_REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "AgentRegistry deployed to:" | awk '{print $NF}')
TRUST_SCORER=$(echo "$DEPLOY_OUTPUT" | grep "TrustScorer deployed to:" | awk '{print $NF}')
PREDICTION_MARKET=$(echo "$DEPLOY_OUTPUT" | grep "PredictionMarket deployed to:" | awk '{print $NF}')

if [[ -z "$MOCK_USDC" || -z "$AGENT_REGISTRY" || -z "$TRUST_SCORER" || -z "$PREDICTION_MARKET" ]]; then
  fail "Could not parse contract addresses from deploy output."
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

info "MockUSDC:         $MOCK_USDC"
info "AgentRegistry:    $AGENT_REGISTRY"
info "TrustScorer:      $TRUST_SCORER"
info "PredictionMarket: $PREDICTION_MARKET"
ok "All contracts deployed"

cd "$PROJECT_ROOT"

# ── Step 4: Fund wallets ─────────────────────────────────────────────────────

step "4/11" "Funding wallets with ETH and MockUSDC..."

# Fund insurer with 0.05 ETH
info "Sending 0.05 ETH to Insurer..."
hash=$(send_tx "$DEPLOYER_KEY" "$INSURER_ADDR" "" --value 0.05ether 2>/dev/null) || true
if [[ -n "$hash" ]]; then
  tx_link "$hash"
else
  # Fallback: use cast send without sig for plain ETH transfer
  hash=$(cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" "$INSURER_ADDR" --value 0.05ether --json 2>/dev/null | jq -r '.transactionHash // empty') || true
  if [[ -n "$hash" ]]; then tx_link "$hash"; else warn "ETH transfer to Insurer may have failed"; fi
fi
tx_wait

# Fund validator with 0.05 ETH
info "Sending 0.05 ETH to Validator..."
hash=$(cast send --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" "$VALIDATOR_ADDR" --value 0.05ether --json 2>/dev/null | jq -r '.transactionHash // empty') || true
if [[ -n "$hash" ]]; then tx_link "$hash"; else warn "ETH transfer to Validator may have failed"; fi
tx_wait

# Mint MockUSDC to all 3 wallets (6 decimals: 10000 USDC = 10000000000)
info "Minting 10,000 USDC to Predictor..."
hash=$(send_tx "$DEPLOYER_KEY" "$MOCK_USDC" "mint(address,uint256)" "$PREDICTOR_ADDR" 10000000000) || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Minting 5,000 USDC to Insurer..."
hash=$(send_tx "$DEPLOYER_KEY" "$MOCK_USDC" "mint(address,uint256)" "$INSURER_ADDR" 5000000000) || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Minting 5,000 USDC to Validator..."
hash=$(send_tx "$DEPLOYER_KEY" "$MOCK_USDC" "mint(address,uint256)" "$VALIDATOR_ADDR" 5000000000) || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

ok "Predictor ($PREDICTOR_ADDR): 0.1 ETH + 10,000 USDC"
ok "Insurer   ($INSURER_ADDR): 0.05 ETH + 5,000 USDC"
ok "Validator ($VALIDATOR_ADDR): 0.05 ETH + 5,000 USDC"

# ── Step 5: Register agents in AgentRegistry ────────────────────────────────

step "5/11" "Registering agents in AgentRegistry..."

PREDICTOR_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/predictor-agent-card.json"
INSURER_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/insurer-agent-card.json"
VALIDATOR_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/validator-agent-card.json"

info "Registering Predictor agent..."
hash=$(send_tx "$DEPLOYER_KEY" "$AGENT_REGISTRY" "registerAgent(string)" "$PREDICTOR_URI") || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Registering Insurer agent..."
hash=$(send_tx "$INSURER_KEY" "$AGENT_REGISTRY" "registerAgent(string)" "$INSURER_URI") || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Registering Validator agent..."
hash=$(send_tx "$VALIDATOR_KEY" "$AGENT_REGISTRY" "registerAgent(string)" "$VALIDATOR_URI") || true
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

ok "All 3 agents registered"

# ── Step 6: Install agent dependencies ───────────────────────────────────────

step "6/11" "Installing agent dependencies..."

cd "$PROJECT_ROOT/agent"
npm install --silent 2>&1 | tail -3
ok "Dependencies installed"
cd "$PROJECT_ROOT"

# ── Step 7: Create .env for agent runtime ────────────────────────────────────

step "7/11" "Creating agent .env configuration..."

cat > "$PROJECT_ROOT/agent/.env" <<ENVEOF
# Cortex Underwriter Agent Runtime — Generated by demo.sh
RPC_URL=$RPC_URL

# Agent private keys
PREDICTOR_PRIVATE_KEY=$DEPLOYER_KEY
INSURER_PRIVATE_KEY=$INSURER_KEY
VALIDATOR_PRIVATE_KEY=$VALIDATOR_KEY

# Deployed contract addresses (Base Sepolia)
PREDICTION_MARKET_ADDRESS=$PREDICTION_MARKET
TRUST_SCORER_ADDRESS=$TRUST_SCORER
AGENT_REGISTRY_ADDRESS=$AGENT_REGISTRY
MOCK_USDC_ADDRESS=$MOCK_USDC

# Cortex integration
CORTEX_URL=https://cortex.solder.build
CORTEX_API_KEY=

# Server config
PORT=3001
AGENT_BASE_URL=http://localhost:3001

# Agent behavior
PREDICTION_INTERVAL_MS=300000
VALIDATION_INTERVAL_MS=60000
DEFAULT_STAKE_AMOUNT=100
ENVEOF

ok ".env written to agent/.env"

# ── Step 8: Run 3 prediction rounds ─────────────────────────────────────────

step "8/11" "Running 3 prediction rounds..."

# Helper: approve USDC spending
approve_usdc() {
  local key="$1"
  local amount="$2"
  send_tx "$key" "$MOCK_USDC" "approve(address,uint256)" "$PREDICTION_MARKET" "$amount" >/dev/null 2>&1 || true
  tx_wait
}

# Expiry: 2 hours from now
EXPIRY=$(( $(date +%s) + 7200 ))

# Collect all tx hashes for summary
declare -a TX_HASHES=()
declare -a TX_LABELS=()

record_tx() {
  if [[ -n "$1" ]]; then
    TX_HASHES+=("$1")
    TX_LABELS+=("$2")
  fi
}

echo ""
echo -e "  ${BOLD}--- Round 1: Predictor stakes 150 USDC, correct prediction ---${RESET}"

# Approve predictor spending
info "Approving USDC for Predictor..."
approve_usdc "$DEPLOYER_KEY" 500000000  # approve 500 USDC for all rounds

PRED_HASH_1=$(cast keccak "$(echo -n 'BTC will reach $100k by end of Q2 2026')")

info "Creating prediction (150 USDC stake)..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "createPrediction(bytes32,uint256,uint256)" "$PRED_HASH_1" 150000000 "$EXPIRY") || true
record_tx "$hash" "Round 1: Create prediction (150 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Insurer buys 75 USDC insurance
info "Approving USDC for Insurer..."
approve_usdc "$INSURER_KEY" 500000000  # approve 500 USDC for all rounds

info "Insurer buying 75 USDC insurance on prediction 0..."
hash=$(send_tx "$INSURER_KEY" "$PREDICTION_MARKET" "buyInsurance(uint256,uint256)" 0 75000000) || true
record_tx "$hash" "Round 1: Buy insurance (75 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Resolve as CORRECT (deployer is owner/oracle)
info "Validator resolving prediction 0 as CORRECT..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "resolvePrediction(uint256,bool)" 0 true) || true
record_tx "$hash" "Round 1: Resolve CORRECT"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Predictor claims stake + premiums
info "Predictor claiming stake + premiums..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "claimStake(uint256)" 0) || true
record_tx "$hash" "Round 1: Claim stake"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

ok "Round 1 complete: Predictor was RIGHT, claimed stake + premiums"

echo ""
echo -e "  ${BOLD}--- Round 2: Predictor stakes 200 USDC, wrong prediction ---${RESET}"

PRED_HASH_2=$(cast keccak "$(echo -n 'ETH will flip BTC market cap by March 2026')")

info "Creating prediction (200 USDC stake)..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "createPrediction(bytes32,uint256,uint256)" "$PRED_HASH_2" 200000000 "$EXPIRY") || true
record_tx "$hash" "Round 2: Create prediction (200 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Insurer buying 100 USDC insurance on prediction 1..."
hash=$(send_tx "$INSURER_KEY" "$PREDICTION_MARKET" "buyInsurance(uint256,uint256)" 1 100000000) || true
record_tx "$hash" "Round 2: Buy insurance (100 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Resolve as WRONG
info "Validator resolving prediction 1 as WRONG..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "resolvePrediction(uint256,bool)" 1 false) || true
record_tx "$hash" "Round 2: Resolve WRONG"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Insurer claims insurance payout
info "Insurer claiming insurance payout..."
hash=$(send_tx "$INSURER_KEY" "$PREDICTION_MARKET" "claimInsurance(uint256)" 1) || true
record_tx "$hash" "Round 2: Claim insurance"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

ok "Round 2 complete: Predictor was WRONG, insurer claimed payout"

echo ""
echo -e "  ${BOLD}--- Round 3: Predictor stakes 100 USDC, correct prediction ---${RESET}"

PRED_HASH_3=$(cast keccak "$(echo -n 'SOL will surpass $300 by June 2026')")

info "Creating prediction (100 USDC stake)..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "createPrediction(bytes32,uint256,uint256)" "$PRED_HASH_3" 100000000 "$EXPIRY") || true
record_tx "$hash" "Round 3: Create prediction (100 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

info "Insurer buying 50 USDC insurance on prediction 2..."
hash=$(send_tx "$INSURER_KEY" "$PREDICTION_MARKET" "buyInsurance(uint256,uint256)" 2 50000000) || true
record_tx "$hash" "Round 3: Buy insurance (50 USDC)"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Resolve as CORRECT
info "Validator resolving prediction 2 as CORRECT..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "resolvePrediction(uint256,bool)" 2 true) || true
record_tx "$hash" "Round 3: Resolve CORRECT"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

# Predictor claims
info "Predictor claiming stake + premiums..."
hash=$(send_tx "$DEPLOYER_KEY" "$PREDICTION_MARKET" "claimStake(uint256)" 2) || true
record_tx "$hash" "Round 3: Claim stake"
if [[ -n "$hash" ]]; then tx_link "$hash"; fi
tx_wait

ok "Round 3 complete: Predictor was RIGHT, claimed stake + premiums"

# ── Step 9: Print summary ───────────────────────────────────────────────────

step "9/11" "Transaction summary"

echo ""
echo -e "  ${BOLD}Deployed Contracts${RESET}"
echo -e "  ─────────────────────────────────────────────────────────"
echo -e "  MockUSDC:         $MOCK_USDC"
echo -e "  AgentRegistry:    $AGENT_REGISTRY"
echo -e "  TrustScorer:      $TRUST_SCORER"
echo -e "  PredictionMarket: $PREDICTION_MARKET"
echo ""
echo -e "  ${BOLD}Agent Wallets${RESET}"
echo -e "  ─────────────────────────────────────────────────────────"
echo -e "  Predictor: $PREDICTOR_ADDR"
echo -e "  Insurer:   $INSURER_ADDR"
echo -e "  Validator: $VALIDATOR_ADDR"
echo ""
echo -e "  ${BOLD}Prediction Rounds${RESET}"
echo -e "  ─────────────────────────────────────────────────────────"
echo -e "  Round 1: 150 USDC stake, 75 USDC insured  → CORRECT → Predictor claimed"
echo -e "  Round 2: 200 USDC stake, 100 USDC insured → WRONG   → Insurer claimed"
echo -e "  Round 3: 100 USDC stake, 50 USDC insured  → CORRECT → Predictor claimed"
echo ""
echo -e "  ${BOLD}All Transactions${RESET}"
echo -e "  ─────────────────────────────────────────────────────────"
for i in "${!TX_HASHES[@]}"; do
  echo -e "  ${TX_LABELS[$i]}"
  echo -e "    ${CYAN}$BASESCAN/${TX_HASHES[$i]}${RESET}"
done

# Query final trust score
TRUST_SCORE=$(cast call --rpc-url "$RPC_URL" "$TRUST_SCORER" "getTrustScore(address)(uint256)" "$PREDICTOR_ADDR" 2>/dev/null) || true
if [[ -n "$TRUST_SCORE" ]]; then
  echo ""
  echo -e "  ${BOLD}Trust Score${RESET}"
  echo -e "  ─────────────────────────────────────────────────────────"
  echo -e "  Predictor trust score: ${TRUST_SCORE} bps (out of 10000)"
fi

# ── Step 10: Start agent runtime ─────────────────────────────────────────────

step "10/11" "Starting agent runtime..."

cd "$PROJECT_ROOT/agent"
info "Launching agent runtime in background (PID will be printed)..."
nohup npx tsx src/index.ts > "$PROJECT_ROOT/agent-runtime.log" 2>&1 &
AGENT_PID=$!
info "Agent PID: $AGENT_PID"
info "Logs: tail -f $PROJECT_ROOT/agent-runtime.log"
ok "Agent runtime started"

cd "$PROJECT_ROOT"

# ── Step 11: Print dashboard info ────────────────────────────────────────────

step "11/11" "Done!"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║                    Demo Complete!                       ║${RESET}"
echo -e "${BOLD}╠══════════════════════════════════════════════════════════╣${RESET}"
echo -e "${BOLD}║                                                        ║${RESET}"
echo -e "${BOLD}║  Agent Runtime: http://localhost:3001                   ║${RESET}"
echo -e "${BOLD}║  Dashboard:     http://localhost:3004/underwriter       ║${RESET}"
echo -e "${BOLD}║                                                        ║${RESET}"
echo -e "${BOLD}║  Stop agent:  kill $AGENT_PID                          ║${RESET}"
echo -e "${BOLD}║  View logs:   tail -f agent-runtime.log                ║${RESET}"
echo -e "${BOLD}║                                                        ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
