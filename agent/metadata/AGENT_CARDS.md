# ERC-8004 Agent Card Metadata

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

| Agent     | CID                                                              |
|-----------|------------------------------------------------------------------|
| Predictor | bafkreid5dearl5xktnctzgocww2b2hknzlbrsiz63br7heyb7k6qebprme   |
| Insurer   | bafkreigm6pfalg4qtcrgz6c6pgudwyqtz7hwgi7fxny5bmeyekdsdch5nm   |
| Validator | bafkreickcvw6t3m5b3ni655p7xiktsshsmfbrc2pty634yamuhkx6iu7am   |

## Notes

- The IPFS CIDs are computed locally from the exact file contents using CIDv1 (raw codec, sha-256 hash).
- To pin to IPFS, upload the JSON files to Pinata, web3.storage, or any IPFS pinning service. The CIDs will match.
- The agent runtime registers with the live HTTP URL by default, which is immediately resolvable by judges.
- Set `AGENT_BASE_URL` to the public URL when deploying (e.g., `https://underwriter.solder.build`).
