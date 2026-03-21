# ERC-8004 Agent Card Metadata

## Base Mainnet IdentityRegistry

Contract: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (AgentIdentity / AGENT)
Network: Base Mainnet (Chain ID: 8453)
Interface: `register(string uri) → uint256 tokenId` (permissionless ERC-721)

### Registration Script

```bash
# Dry run
./scripts/register-erc8004-mainnet.sh

# Live (requires ETH on Base mainnet in wallet 0x8618416B...)
./scripts/register-erc8004-mainnet.sh --send
```

### GitHub-Hosted Agent Cards (registration URIs)

| Agent     | URI |
|-----------|-----|
| Predictor | https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/predictor-agent-card.json |
| Insurer   | https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/insurer-agent-card.json |
| Validator | https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/validator-agent-card.json |

## Live API Endpoints

When running locally (port 3001):
- All cards: http://localhost:3001/metadata
- Predictor: http://localhost:3001/metadata/predictor
- Insurer: http://localhost:3001/metadata/insurer
- Validator: http://localhost:3001/metadata/validator
- Well-known: http://localhost:3001/.well-known/agent-card

When deployed (set AGENT_BASE_URL env var):
- Predictor: ${AGENT_BASE_URL}/metadata/predictor
- Insurer: ${AGENT_BASE_URL}/metadata/insurer
- Validator: ${AGENT_BASE_URL}/metadata/validator

## IPFS CIDs (content-addressable, CIDv1 raw/sha-256)

Note: These CIDs are from the previous metadata format. They will not match the updated ERC-8004 v1 schema files.

| Agent     | CID                                                              |
|-----------|------------------------------------------------------------------|
| Predictor | bafkreid5dearl5xktnctzgocww2b2hknzlbrsiz63br7heyb7k6qebprme   |
| Insurer   | bafkreigm6pfalg4qtcrgz6c6pgudwyqtz7hwgi7fxny5bmeyekdsdch5nm   |
| Validator | bafkreickcvw6t3m5b3ni655p7xiktsshsmfbrc2pty634yamuhkx6iu7am   |

## Notes

- Agent cards now conform to `eip-8004#registration-v1` schema (matching the format used by other registered agents like ClawNews).
- The `register(string)` function is permissionless — any wallet can register. It mints an ERC-721 token to msg.sender.
- The tokenURI stores the URI string and returns it as a base64-encoded data URI.
- After registration, update each agent card's `registrations` array with the assigned token ID.
- Cost: ~0.00001 ETH total for all 3 registrations on Base mainnet.
