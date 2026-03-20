# Cortex Underwriter — Agent Runtime

Off-chain TypeScript service that powers the on-chain prediction insurance protocol on Base Sepolia. Three autonomous agents make predictions, buy insurance, and resolve outcomes using Cortex intelligence.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  Agent Runtime                    │
│                                                   │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐         │
│  │Predictor│  │ Insurer │  │Validator │         │
│  │  Agent  │  │  Agent  │  │  Agent   │         │
│  └────┬────┘  └────┬────┘  └────┬─────┘         │
│       │            │            │                 │
│  ┌────▼────────────▼────────────▼─────┐          │
│  │         Contract Wrappers          │          │
│  │  (PredictionMarket, TrustScorer,   │          │
│  │   AgentRegistry, MockUSDC)         │          │
│  └────────────────┬───────────────────┘          │
│                   │                               │
│  ┌────────────────▼───────────────────┐          │
│  │         Cortex Client              │          │
│  │  (Market trend, anomaly, volume)   │          │
│  └────────────────────────────────────┘          │
│                                                   │
│  ┌────────────────────────────────────┐          │
│  │         Express API Server         │          │
│  │  (REST endpoints, health check)    │          │
│  └────────────────────────────────────┘          │
└──────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
   Base Sepolia               Cortex MCP
   (on-chain)            (cortex.solder.build)
```

## Agents

**Predictor** — Queries Cortex for market analysis, generates a prediction with a confidence score, stakes USDC behind it on-chain, and stores the full prediction data locally (only the hash goes on-chain). Runs on a configurable interval (default 5 min).

**Insurer** — Listens for `PredictionCreated` events. Fetches the predictor's trust score, runs its own Cortex analysis, and buys insurance if it disagrees with the prediction AND the predictor has a low trust score. Event-driven.

**Validator** — Polls for expired predictions, fetches actual market price data, compares to the prediction, and calls `resolvePrediction()` on-chain. Runs on a configurable interval (default 1 min).

## Setup

```bash
npm install
cp .env.example .env
# Fill in PRIVATE_KEY and contract addresses
```

## Running

```bash
# Full runtime (all agents + API server)
npm start

# Dev mode with hot reload
npm run dev

# API server only (no agents)
npm run server
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check with agent status |
| GET | `/agents` | List registered agents with trust scores |
| GET | `/agents/:address/score` | Trust score and history for an agent |
| GET | `/predictions` | List predictions (query: `?status=active\|expired`) |
| GET | `/predictions/:id` | Single prediction details |
| GET | `/predictions/:id/insurance` | Insurance policies for a prediction |
| POST | `/predict` | Trigger manual prediction (body: `{ "asset": "ETH" }`) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `RPC_URL` | Base Sepolia RPC endpoint | `https://sepolia.base.org` |
| `PRIVATE_KEY` | Agent wallet private key | required |
| `PREDICTION_MARKET_ADDRESS` | Deployed PredictionMarket contract | required |
| `TRUST_SCORER_ADDRESS` | Deployed TrustScorer contract | required |
| `AGENT_REGISTRY_ADDRESS` | Deployed AgentRegistry contract | required |
| `MOCK_USDC_ADDRESS` | Deployed MockUSDC contract | required |
| `CORTEX_URL` | Cortex MCP API base URL | `https://cortex.solder.build` |
| `CORTEX_API_KEY` | Cortex API key (optional) | empty |
| `PORT` | API server port | `3001` |
| `PREDICTION_INTERVAL_MS` | Predictor loop interval | `300000` (5 min) |
| `VALIDATION_INTERVAL_MS` | Validator loop interval | `60000` (1 min) |
| `DEFAULT_STAKE_AMOUNT` | USDC stake per prediction | `100` |

## Cortex Integration

The agent uses Cortex MCP at `cortex.solder.build` for market intelligence. If Cortex is unreachable or returns 401/403, the client automatically falls back to mock data so the demo works regardless of Cortex availability.

Mock data generates realistic but randomized market signals — enough to demonstrate the agent decision-making flow end to end.

## Build

```bash
npm run build    # Compiles to ./dist
```
