import { ethers } from 'ethers';
import { CortexClient } from '../cortex/client.js';
import { UnderwriterContracts } from '../contracts/index.js';
import { store } from '../store.js';
import type { Prediction, CortexAnalysis } from '../types.js';

const TRACKED_ASSETS = ['ETH', 'WETH', 'USDC', 'cbBTC'];
const PREDICTION_DURATION_SECS = 24 * 60 * 60; // 24 hours

export class PredictorAgent {
  private cortex: CortexClient;
  private contracts: UnderwriterContracts;
  private stakeAmount: bigint;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    cortex: CortexClient,
    contracts: UnderwriterContracts,
    stakeAmount: number = 100,
    intervalMs: number = 300_000,
  ) {
    this.cortex = cortex;
    this.contracts = contracts;
    // USDC has 6 decimals
    this.stakeAmount = BigInt(stakeAmount) * 1_000_000n;
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[PREDICTOR] Starting predictor agent, interval:', this.intervalMs, 'ms');

    // Run immediately, then on interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[PREDICTOR] Tick error:', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[PREDICTOR] Stopped');
  }

  /** Run a single prediction cycle for a specific asset (used by API) */
  async predictAsset(asset: string): Promise<Prediction | null> {
    return this.generateAndSubmitPrediction(asset);
  }

  private async tick(): Promise<void> {
    console.log('[PREDICTOR] --- Prediction cycle start ---');

    // Pick a random asset to predict on each cycle
    const asset = TRACKED_ASSETS[Math.floor(Math.random() * TRACKED_ASSETS.length)];
    const prediction = await this.generateAndSubmitPrediction(asset);

    if (prediction) {
      console.log(
        '[PREDICTOR] Created prediction #%d: %s %s to %s (confidence: %d%%)',
        prediction.id,
        prediction.asset,
        prediction.direction,
        prediction.targetPrice,
        prediction.confidence,
      );
    }

    console.log('[PREDICTOR] --- Prediction cycle end ---');
  }

  private async generateAndSubmitPrediction(asset: string): Promise<Prediction | null> {
    try {
      // 1. Query Cortex for market analysis
      console.log('[PREDICTOR] Analyzing', asset, 'via Cortex...');
      const analysis = await this.cortex.getFullAnalysis(asset, 'base');

      // 2. Get real price and derive prediction from analysis
      const realPrice = await this.cortex.getRealPrice(asset);
      const { direction, targetPrice, confidence, reasoning } =
        await this.derivePrediction(asset, analysis, realPrice);

      if (confidence < 30) {
        console.log('[PREDICTOR] Confidence too low (%d%%), skipping', confidence);
        return null;
      }

      // 3. Build prediction data and hash it
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + PREDICTION_DURATION_SECS;

      const predictionData = {
        asset,
        direction,
        targetPrice,
        confidence,
        reasoning,
        createdAt: now,
        expiresAt,
      };

      const dataString = JSON.stringify(predictionData);
      const dataHash = ethers.keccak256(ethers.toUtf8Bytes(dataString));

      // 4. Submit on-chain
      console.log('[PREDICTOR] Submitting prediction on-chain...');
      const tx = await this.contracts.createPrediction(dataHash, this.stakeAmount, expiresAt);
      const receipt = await tx.wait();

      // 5. Parse prediction ID from event
      const predictionId = this.parsePredictionId(receipt);

      const prediction: Prediction = {
        id: predictionId,
        asset,
        direction,
        targetPrice,
        confidence,
        reasoning,
        cortexData: analysis,
        createdAt: now,
        expiresAt,
        txHash: tx.hash,
      };

      // 6. Store locally
      store.addPrediction(prediction);

      return prediction;
    } catch (err) {
      console.error('[PREDICTOR] Failed to create prediction for', asset, ':', err);
      return null;
    }
  }

  private async derivePrediction(
    asset: string,
    analysis: CortexAnalysis,
    realPrice: number | null,
  ): Promise<{
    direction: 'up' | 'down';
    targetPrice: number;
    confidence: number;
    reasoning: string;
  }> {
    const trend = analysis.trend;
    const anomalies = analysis.anomalies;
    const volume = analysis.volume;

    // Use real price from CoinGecko when available, fall back to hardcoded estimates
    const fallbackPrices: Record<string, number> = {
      ETH: 3500,
      WETH: 3500,
      USDC: 1,
      cbBTC: 85000,
    };
    const basePrice = realPrice ?? fallbackPrices[asset] ?? 1000;
    if (realPrice) {
      console.log(`[PREDICTOR] Using real price for ${asset}: $${realPrice.toLocaleString()}`);
    } else {
      console.log(`[PREDICTOR] Using fallback price for ${asset}: $${basePrice}`);
    }

    let direction: 'up' | 'down' = 'up';
    let confidence = 50;
    let reasons: string[] = [];

    // Factor in trend
    if (trend) {
      if (trend.direction === 'bullish') {
        direction = 'up';
        confidence += Math.round(trend.strength * 0.3);
        reasons.push(`Bullish trend (strength ${trend.strength})`);
      } else if (trend.direction === 'bearish') {
        direction = 'down';
        confidence += Math.round(trend.strength * 0.3);
        reasons.push(`Bearish trend (strength ${trend.strength})`);
      } else {
        confidence -= 15;
        reasons.push('Neutral trend, low conviction');
      }
    }

    // Factor in anomalies
    if (anomalies?.detected) {
      if (anomalies.severity === 'high') {
        confidence -= 20;
        reasons.push('High anomaly risk detected');
      } else {
        confidence += 5;
        reasons.push(`${anomalies.severity} anomaly detected`);
      }
    }

    // Factor in volume
    if (volume) {
      if (volume.trend === 'increasing' && volume.change > 20) {
        confidence += 10;
        reasons.push(`Strong volume increase (+${volume.change}%)`);
      } else if (volume.trend === 'decreasing') {
        confidence -= 5;
        reasons.push('Declining volume');
      }
    }

    confidence = Math.max(10, Math.min(95, confidence));

    // Calculate target price
    const movePct = (confidence / 100) * 0.05; // up to 5% move
    const targetPrice =
      direction === 'up'
        ? Math.round(basePrice * (1 + movePct) * 100) / 100
        : Math.round(basePrice * (1 - movePct) * 100) / 100;

    return {
      direction,
      targetPrice,
      confidence,
      reasoning: reasons.join('; '),
    };
  }

  private parsePredictionId(receipt: ethers.TransactionReceipt | null): number {
    if (!receipt || !receipt.logs) {
      console.warn('[PREDICTOR] No receipt/logs, assigning local ID');
      return store.getAllPredictions().length + 1;
    }

    // Try to decode PredictionCreated event
    try {
      const iface = new ethers.Interface([
        'event PredictionCreated(uint256 indexed predictionId, address indexed predictor, bytes32 dataHash, uint256 stake, uint256 expiresAt)',
      ]);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed && parsed.name === 'PredictionCreated') {
            return Number(parsed.args[0]);
          }
        } catch {
          // Not our event, skip
        }
      }
    } catch {
      // Fallback
    }

    return store.getAllPredictions().length + 1;
  }
}
