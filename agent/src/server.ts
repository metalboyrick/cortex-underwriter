import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { store } from './store.js';
import { config } from './config.js';
import type { UnderwriterContracts } from './contracts/index.js';
import type { PredictorAgent } from './agents/predictor.js';

// Resolve metadata directory relative to this file (src/ -> metadata/)
const __dirname_resolved = dirname(fileURLToPath(import.meta.url));
const METADATA_DIR = join(__dirname_resolved, '..', 'metadata');

// x402 payment configuration
const X402_PAY_TO = '0x8618416B7803dFaE42641Cf56C3f97F21Bf1F253';
const X402_MOCK_USDC = '0xa249AdcB0f5E9E7224A97b6BfCBb6F44B99EF63c';
const X402_NETWORK = 'base-sepolia';

function buildX402Response(resource: string, amountRequired: string, description: string) {
  return {
    version: '1',
    accepts: [
      {
        scheme: 'exact',
        network: X402_NETWORK,
        maxAmountRequired: amountRequired,
        resource,
        description,
        mimeType: 'application/json',
        payTo: X402_PAY_TO,
        maxTimeoutSeconds: 300,
        asset: X402_MOCK_USDC,
      },
    ],
  };
}

function hasPaymentHeader(req: express.Request): boolean {
  return !!(req.headers['x-payment'] || req.headers['x-402-payment']);
}

export function createServer(
  contracts: UnderwriterContracts | null,
  predictor: PredictorAgent | null,
): express.Express {
  const app = express();
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
  app.use(express.json());

  // Rate limiting
  app.use('/predict', rateLimit({ windowMs: 60_000, max: 5, message: { error: 'Rate limit exceeded' } }));
  app.use('/api/', rateLimit({ windowMs: 60_000, max: 10, message: { error: 'Rate limit exceeded' } }));

  // --- Health ---

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      agents: {
        predictor: predictor ? 'running' : 'not started',
        insurer: 'event-driven',
        validator: 'running',
      },
      predictions: {
        total: store.getAllPredictions().length,
        active: store.getActivePredictions().length,
        expired: store.getExpiredUnresolved().length,
      },
      x402: {
        description: 'x402 HTTP payment protocol enabled on /api/* endpoints',
        network: X402_NETWORK,
        asset: X402_MOCK_USDC,
        payTo: X402_PAY_TO,
        paidEndpoints: [
          { path: '/api/trust-score/:address', method: 'GET', price: '1000000', unit: 'USDC (6 decimals)' },
          { path: '/api/predict', method: 'POST', price: '10000000', unit: 'USDC (6 decimals)' },
        ],
      },
    });
  });

  // --- ERC-8004 Agent Card Metadata ---

  const agentCards: Record<string, string> = {
    predictor: 'predictor-agent-card.json',
    insurer: 'insurer-agent-card.json',
    validator: 'validator-agent-card.json',
  };

  // Serve individual agent cards: /metadata/predictor, /metadata/insurer, /metadata/validator
  app.get('/metadata/:agent', (req, res) => {
    const agent = req.params.agent;
    const file = agentCards[agent];
    if (!file) {
      return res.status(404).json({ error: `Unknown agent: ${agent}` });
    }
    try {
      const card = JSON.parse(readFileSync(join(METADATA_DIR, file), 'utf-8'));
      res.json(card);
    } catch (err) {
      console.error(`[SERVER] Failed to read agent card for ${agent}:`, err);
      res.status(500).json({ error: 'Failed to read agent card' });
    }
  });

  // Serve all agent cards at once
  app.get('/metadata', (_req, res) => {
    try {
      const cards = Object.entries(agentCards).reduce(
        (acc, [name, file]) => {
          acc[name] = JSON.parse(readFileSync(join(METADATA_DIR, file), 'utf-8'));
          return acc;
        },
        {} as Record<string, unknown>,
      );
      res.json(cards);
    } catch (err) {
      console.error('[SERVER] Failed to read agent cards:', err);
      res.status(500).json({ error: 'Failed to read agent cards' });
    }
  });

  // ERC-8004 well-known endpoint
  app.get('/.well-known/agent-card', (_req, res) => {
    try {
      const card = JSON.parse(readFileSync(join(METADATA_DIR, 'predictor-agent-card.json'), 'utf-8'));
      res.json(card);
    } catch (err) {
      console.error('[SERVER] Failed to read default agent card:', err);
      res.status(500).json({ error: 'Failed to read agent card' });
    }
  });

  // --- Agents ---

  app.get('/agents', async (_req, res) => {
    try {
      if (!contracts) {
        return res.json({ agents: [], note: 'Contracts not connected' });
      }

      const signerAddress = await contracts.getSignerAddress();
      let trustScore = 0;
      let agentInfo = null;

      try {
        trustScore = await contracts.getTrustScore(signerAddress);
      } catch {
        // Contract may not be deployed yet
      }

      try {
        agentInfo = await contracts.getAgentInfo(signerAddress);
      } catch {
        // Not registered yet
      }

      res.json({
        agents: [
          {
            address: signerAddress,
            trustScore,
            registered: agentInfo?.active ?? false,
            erc8004Uri: agentInfo?.erc8004Uri ?? '',
            role: 'underwriter',
          },
        ],
      });
    } catch (err) {
      console.error('[SERVER] Error fetching agents:', err);
      res.status(500).json({ error: 'Failed to fetch agents' });
    }
  });

  app.get('/agents/:address/score', async (req, res) => {
    try {
      if (!contracts) {
        return res.json({ address: req.params.address, score: 0, note: 'Contracts not connected' });
      }

      const score = await contracts.getTrustScore(req.params.address);
      const details = await contracts.getTrustScoreDetails(req.params.address);

      res.json({
        address: req.params.address,
        score,
        details,
      });
    } catch (err) {
      console.error('[SERVER] Error fetching score:', err);
      res.status(500).json({ error: 'Failed to fetch trust score' });
    }
  });

  // --- Predictions ---

  app.get('/predictions', (req, res) => {
    const status = req.query.status as string | undefined;

    let predictions;
    if (status === 'active') {
      predictions = store.getActivePredictions();
    } else if (status === 'expired') {
      predictions = store.getExpiredUnresolved();
    } else {
      predictions = store.getAllPredictions();
    }

    res.json({
      count: predictions.length,
      predictions: predictions.map(serializePrediction),
    });
  });

  app.get('/predictions/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const prediction = store.getPrediction(id);

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    res.json(serializePrediction(prediction));
  });

  app.get('/predictions/:id/insurance', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const prediction = store.getPrediction(id);

    if (!prediction) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    const insurance = store.getInsurance(id);

    res.json({
      predictionId: id,
      insured: insurance.length > 0,
      policies: insurance.map((ins) => ({
        insurer: ins.insurer,
        amount: ins.amount.toString(),
        txHash: ins.txHash,
        timestamp: ins.timestamp,
      })),
    });
  });

  // --- x402 Paid Endpoints ---

  app.get('/api/trust-score/:address', async (req, res) => {
    if (!hasPaymentHeader(req)) {
      return res.status(402).json({
        status: 402,
        message: 'Payment Required',
        x402: buildX402Response(
          req.originalUrl,
          '1000000', // 1 USDC (6 decimals)
          'Cortex Underwriter trust score analysis',
        ),
      });
    }

    // Payment header present — serve the trust score
    // In production, verify the payment on-chain before serving
    const address = req.params.address;

    try {
      if (!contracts) {
        return res.json({
          address,
          score: 0,
          details: null,
          note: 'Contracts not connected',
          x402: { paid: true },
        });
      }

      const score = await contracts.getTrustScore(address);
      const details = await contracts.getTrustScoreDetails(address);

      res.json({
        address,
        score,
        details,
        x402: { paid: true },
      });
    } catch (err) {
      console.error('[SERVER] x402 trust-score error:', err);
      res.status(500).json({ error: 'Failed to fetch trust score' });
    }
  });

  app.post('/api/predict', async (req, res) => {
    if (!hasPaymentHeader(req)) {
      return res.status(402).json({
        status: 402,
        message: 'Payment Required',
        x402: buildX402Response(
          req.originalUrl,
          '10000000', // 10 USDC (6 decimals)
          'Cortex Underwriter on-chain prediction',
        ),
      });
    }

    // Payment header present — trigger prediction
    if (!predictor) {
      return res.status(503).json({ error: 'Predictor agent not running' });
    }

    const ALLOWED_ASSETS = ['ETH', 'WETH', 'USDC', 'cbBTC', 'BTC', 'SOL'];
    const asset = (req.body?.asset as string) || 'ETH';
    if (!ALLOWED_ASSETS.includes(asset.toUpperCase())) {
      return res.status(400).json({ error: `Invalid asset. Allowed: ${ALLOWED_ASSETS.join(', ')}` });
    }

    try {
      console.log('[SERVER] Prediction triggered for', asset);
      const prediction = await predictor.predictAsset(asset);

      if (!prediction) {
        return res.json({
          message: 'Prediction skipped (low confidence)',
          asset,
          x402: { paid: true },
        });
      }

      res.json({
        message: 'Prediction created',
        prediction: serializePrediction(prediction),
        x402: { paid: true },
      });
    } catch (err) {
      console.error('[SERVER] x402 predict error:', err);
      res.status(500).json({ error: 'Prediction failed' });
    }
  });

  // --- Manual Trigger (free, no x402) ---

  app.post('/predict', async (req, res) => {
    if (!predictor) {
      return res.status(503).json({ error: 'Predictor agent not running' });
    }

    const asset = (req.body?.asset as string) || 'ETH';

    try {
      console.log('[SERVER] Manual prediction triggered for', asset);
      const prediction = await predictor.predictAsset(asset);

      if (!prediction) {
        return res.json({ message: 'Prediction skipped (low confidence)', asset });
      }

      res.json({
        message: 'Prediction created',
        prediction: serializePrediction(prediction),
      });
    } catch (err) {
      console.error('[SERVER] Manual prediction error:', err);
      res.status(500).json({ error: 'Prediction failed' });
    }
  });

  return app;
}

function serializePrediction(p: import('./types.js').Prediction) {
  return {
    id: p.id,
    asset: p.asset,
    direction: p.direction,
    targetPrice: p.targetPrice,
    confidence: p.confidence,
    reasoning: p.reasoning,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    txHash: p.txHash,
    resolved: p.resolved ?? false,
    correct: p.correct ?? null,
    cortexData: p.cortexData,
  };
}

/** Standalone server mode (for testing without agents) */
export function startStandaloneServer(): void {
  const app = createServer(null, null);
  app.listen(config.server.port, () => {
    console.log('[SERVER] Standalone server running on port', config.server.port);
  });
}

// Allow running directly: tsx src/server.ts
const isMain = process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js');
if (isMain) {
  startStandaloneServer();
}
