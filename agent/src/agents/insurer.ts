import { ethers } from 'ethers';
import { CortexClient } from '../cortex/client.js';
import { UnderwriterContracts } from '../contracts/index.js';
import { store } from '../store.js';
import type { InsuranceInfo } from '../types.js';

const TRUST_SCORE_THRESHOLD = 60; // Buy insurance if predictor score is below this
const CONFIDENCE_DISAGREEMENT_THRESHOLD = 30; // Cortex must disagree by at least this much
const INSURANCE_AMOUNT_USDC = 50n * 1_000_000n; // 50 USDC premium

export class InsurerAgent {
  private cortex: CortexClient;
  private contracts: UnderwriterContracts;
  private listening = false;

  constructor(cortex: CortexClient, contracts: UnderwriterContracts) {
    this.cortex = cortex;
    this.contracts = contracts;
  }

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastProcessedBlock = 0;

  async start(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    console.log('[INSURER] Starting insurer agent, polling for PredictionCreated events...');

    // Get current block as starting point
    const provider = this.contracts.getProvider();
    this.lastProcessedBlock = await provider.getBlockNumber();

    // Poll every 15 seconds instead of using eth_newFilter (not supported on public RPCs)
    this.pollInterval = setInterval(async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        if (currentBlock <= this.lastProcessedBlock) return;

        const events = await this.contracts.predictionMarket.queryFilter(
          this.contracts.predictionMarket.filters.PredictionCreated(),
          this.lastProcessedBlock + 1,
          currentBlock,
        );

        for (const event of events) {
          if (!('args' in event)) continue;
          const { args } = event as ethers.EventLog;
          const [predictionId, predictor, , stake] = args;
          console.log(
            '[INSURER] New prediction #%d from %s, stake: %s USDC',
            Number(predictionId),
            predictor,
            ethers.formatUnits(stake, 6),
          );
          await this.evaluateAndInsure(Number(predictionId), predictor).catch((err) => {
            console.error('[INSURER] Error evaluating prediction', Number(predictionId), ':', err);
          });
        }

        this.lastProcessedBlock = currentBlock;
      } catch (err) {
        console.error('[INSURER] Poll error:', (err as Error).message);
      }
    }, 15000);
  }

  stop(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.listening = false;
    console.log('[INSURER] Stopped');
  }

  /** Evaluate a prediction and decide whether to buy insurance */
  async evaluateAndInsure(predictionId: number, predictor: string): Promise<boolean> {
    try {
      // 1. Get predictor's trust score
      let trustScore: number;
      try {
        trustScore = await this.contracts.getTrustScore(predictor);
      } catch {
        console.log('[INSURER] Could not fetch trust score, assuming 50');
        trustScore = 50;
      }
      console.log('[INSURER] Predictor %s trust score: %d', predictor, trustScore);

      // 2. Get the prediction from our local store
      const prediction = store.getPrediction(predictionId);
      if (!prediction) {
        console.log('[INSURER] Prediction #%d not in local store, skipping', predictionId);
        return false;
      }

      // 3. Run our own Cortex analysis
      console.log('[INSURER] Running independent analysis for', prediction.asset);
      const analysis = await this.cortex.getFullAnalysis(prediction.asset, 'base');

      // 4. Compare our analysis to the prediction
      let disagreement = false;
      let disagreementReason = '';

      if (analysis.trend) {
        const ourDirection =
          analysis.trend.direction === 'bullish'
            ? 'up'
            : analysis.trend.direction === 'bearish'
              ? 'down'
              : null;

        if (ourDirection && ourDirection !== prediction.direction) {
          disagreement = true;
          disagreementReason = `Cortex says ${analysis.trend.direction} but prediction says ${prediction.direction}`;
        }

        // Even if same direction, check strength disagreement
        if (
          ourDirection === prediction.direction &&
          analysis.trend.strength < CONFIDENCE_DISAGREEMENT_THRESHOLD
        ) {
          disagreement = true;
          disagreementReason = `Cortex trend strength (${analysis.trend.strength}) too low to support ${prediction.confidence}% confidence`;
        }
      }

      // High anomaly detection is a red flag
      if (analysis.anomalies?.detected && analysis.anomalies.severity === 'high') {
        disagreement = true;
        disagreementReason += ' + High anomaly risk detected';
      }

      // 5. Decision: buy insurance if trust score is low AND we disagree
      const shouldInsure = trustScore < TRUST_SCORE_THRESHOLD && disagreement;

      console.log(
        '[INSURER] Decision for #%d: trust=%d, disagree=%s → %s',
        predictionId,
        trustScore,
        disagreement,
        shouldInsure ? 'BUY INSURANCE' : 'SKIP',
      );

      if (disagreementReason) {
        console.log('[INSURER] Reason:', disagreementReason);
      }

      if (!shouldInsure) {
        return false;
      }

      // 6. Buy insurance on-chain
      const tx = await this.contracts.buyInsurance(predictionId, INSURANCE_AMOUNT_USDC);
      const receipt = await tx.wait();

      const insuranceInfo: InsuranceInfo = {
        predictionId,
        insurer: await this.contracts.getSignerAddress(),
        amount: INSURANCE_AMOUNT_USDC,
        txHash: tx.hash,
        timestamp: Math.floor(Date.now() / 1000),
      };

      store.addInsurance(insuranceInfo);
      console.log('[INSURER] Insurance purchased for prediction #%d, tx: %s', predictionId, tx.hash);

      return true;
    } catch (err) {
      console.error('[INSURER] Failed to evaluate/insure prediction #%d:', predictionId, err);
      return false;
    }
  }
}
