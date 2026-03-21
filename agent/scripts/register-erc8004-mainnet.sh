#!/usr/bin/env bash
# register-erc8004-mainnet.sh
#
# Register Cortex Underwriter agents on the ERC-8004 IdentityRegistry
# on Base mainnet (0x8004A169FB4a3325136EB29fA0ceB6D2e539a432).
#
# Prerequisites:
#   - Foundry (cast) installed at $HOME/.foundry/bin
#   - Private key file at $HOME/.secrets/base-sepolia-deployer-key
#   - Wallet 0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253 must have ETH on Base mainnet
#     (approx 0.00001 ETH needed for all 3 registrations at current gas prices)
#
# Usage:
#   ./register-erc8004-mainnet.sh           # dry run (default)
#   ./register-erc8004-mainnet.sh --send    # broadcast transactions

set -euo pipefail

export PATH="$HOME/.foundry/bin:$PATH"

REGISTRY="0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
RPC_URL="https://mainnet.base.org"
WALLET="0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253"
KEY_FILE="$HOME/.secrets/base-sepolia-deployer-key"

# GitHub-hosted agent card URIs
PREDICTOR_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/predictor-agent-card.json"
INSURER_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/insurer-agent-card.json"
VALIDATOR_URI="https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/validator-agent-card.json"

DRY_RUN=true
if [[ "${1:-}" == "--send" ]]; then
  DRY_RUN=false
fi

echo "=============================================="
echo "  ERC-8004 Agent Registration — Base Mainnet"
echo "=============================================="
echo ""
echo "Registry:  $REGISTRY"
echo "Wallet:    $WALLET"
echo "RPC:       $RPC_URL"
echo "Mode:      $(if $DRY_RUN; then echo 'DRY RUN (use --send to broadcast)'; else echo 'LIVE — transactions will be sent'; fi)"
echo ""

# --- Pre-flight checks ---

echo "[CHECK] Wallet balance on Base mainnet..."
BALANCE=$(cast balance "$WALLET" --rpc-url "$RPC_URL" --ether)
echo "  Balance: $BALANCE ETH"

if [[ "$BALANCE" == "0.000000000000000000" ]]; then
  echo ""
  echo "[ERROR] Wallet has 0 ETH on Base mainnet."
  echo "  Send at least 0.0001 ETH to $WALLET on Base (chain 8453) before running with --send."
  echo "  Estimated cost for all 3 registrations: ~0.00001 ETH (~\$0.04 at current gas)."
  echo ""
  if $DRY_RUN; then
    echo "[DRY RUN] Continuing to show simulated registration results..."
    echo ""
  else
    echo "Aborting."
    exit 1
  fi
fi

echo "[CHECK] Contract name..."
NAME=$(cast call "$REGISTRY" "name()(string)" --rpc-url "$RPC_URL")
echo "  Contract name: $NAME"

echo "[CHECK] Contract owner..."
OWNER=$(cast call "$REGISTRY" "owner()(address)" --rpc-url "$RPC_URL")
echo "  Owner: $OWNER"
echo "  Note: register() is permissionless — any wallet can register."
echo ""

# --- Registration function ---

register_agent() {
  local agent_name="$1"
  local uri="$2"

  echo "-------------------------------------------"
  echo "[REGISTER] $agent_name"
  echo "  URI: $uri"

  if $DRY_RUN; then
    # Simulate the call
    echo "  [DRY RUN] Simulating..."
    TOKEN_ID=$(cast call "$REGISTRY" "register(string)(uint256)" "$uri" \
      --from "$WALLET" --rpc-url "$RPC_URL" 2>&1) || true
    echo "  [DRY RUN] Would mint token ID: $TOKEN_ID"

    GAS=$(cast estimate "$REGISTRY" "register(string)" "$uri" \
      --from "$WALLET" --rpc-url "$RPC_URL" 2>&1) || true
    echo "  [DRY RUN] Estimated gas: $GAS"
  else
    # Read private key
    if [[ ! -f "$KEY_FILE" ]]; then
      echo "  [ERROR] Private key file not found: $KEY_FILE"
      exit 1
    fi
    PRIVATE_KEY=$(cat "$KEY_FILE" | tr -d '[:space:]')

    echo "  Sending transaction..."
    TX_HASH=$(cast send "$REGISTRY" "register(string)" "$uri" \
      --private-key "$PRIVATE_KEY" \
      --rpc-url "$RPC_URL" \
      --json 2>&1)

    echo "  TX result: $TX_HASH"

    # Extract token ID from logs
    TX_HASH_CLEAN=$(echo "$TX_HASH" | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])" 2>/dev/null || echo "unknown")
    echo "  TX hash: $TX_HASH_CLEAN"
    echo "  Basescan: https://basescan.org/tx/$TX_HASH_CLEAN"
  fi
  echo ""
}

# --- Register all 3 agents ---

register_agent "Predictor" "$PREDICTOR_URI"
register_agent "Insurer"   "$INSURER_URI"
register_agent "Validator"  "$VALIDATOR_URI"

echo "=============================================="
echo "  Registration complete."
echo ""
echo "  After registration, update the agent card JSON files"
echo "  with the assigned token IDs in the 'registrations' field:"
echo ""
echo '  "registrations": ['
echo '    {'
echo '      "agentId": <TOKEN_ID>,'
echo '      "agentRegistry": "eip155:8453:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"'
echo '    }'
echo '  ]'
echo ""
echo "  Verify registration:"
echo "  cast call $REGISTRY \"tokenURI(uint256)(string)\" <TOKEN_ID> --rpc-url $RPC_URL"
echo "=============================================="
