import { ethers } from 'ethers';
import { UnderwriterContracts } from '../contracts/index.js';
import { store } from '../store.js';

// Simulated price oracle — in production, use Chainlink or Pyth
const SIMULATED_PRICES: Record<string, () => number> = {
  ETH: () => 3500 + (Math.random() - 0.5) * 400,
  WETH: () => 3500 + (Math.random() - 0.5) * 400,
  USDC: () => 1 + (Math.random() - 0.5) * 0.01,
  cbBTC: () => 85000 + (Math.random() - 0.5) * 8000,
};

export class ValidatorAgent {
  private contracts: UnderwriterContracts;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(contracts: UnderwriterContracts, intervalMs: number = 60_000) {
    this.contracts = contracts;
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[VALIDATOR] Starting validator agent, interval:', this.intervalMs, 'ms');

    // Check immediately, then on interval
    await this.tick();
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[VALIDATOR] Tick error:', err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    console.log('[VALIDATOR] Stopped');
  }

  private async tick(): Promise<void> {
    const expired = store.getExpiredUnresolved();

    if (expired.length === 0) {
      return; // Nothing to resolve
    }

    console.log('[VALIDATOR] --- Validation cycle: %d expired predictions ---', expired.length);

    for (const prediction of expired) {
      await this.resolvePrediction(prediction.id).catch((err) => {
        console.error('[VALIDATOR] Failed to resolve #%d:', prediction.id, err);
      });
    }

    console.log('[VALIDATOR] --- Validation cycle end ---');
  }

  private async resolvePrediction(predictionId: number): Promise<void> {
    const prediction = store.getPrediction(predictionId);
    if (!prediction) {
      console.warn('[VALIDATOR] Prediction #%d not found in store', predictionId);
      return;
    }

    if (prediction.resolved) {
      return;
    }

    // 1. Get actual price at expiry
    const actualPrice = this.getActualPrice(prediction.asset);
    console.log(
      '[VALIDATOR] Resolving #%d: %s predicted %s to %s, actual price: %s',
      predictionId,
      prediction.asset,
      prediction.direction,
      prediction.targetPrice,
      actualPrice,
    );

    // 2. Determine if prediction was correct
    let correct: boolean;
    if (prediction.direction === 'up') {
      correct = actualPrice >= prediction.targetPrice;
    } else {
      correct = actualPrice <= prediction.targetPrice;
    }

    console.log('[VALIDATOR] Prediction #%d was %s', predictionId, correct ? 'CORRECT' : 'INCORRECT');

    // 3. Submit resolution on-chain
    try {
      const tx = await this.contracts.resolvePrediction(predictionId, correct);
      await tx.wait();
      console.log('[VALIDATOR] Resolution tx confirmed:', tx.hash);

      // 4. Update local store
      store.resolvePrediction(predictionId, correct);
    } catch (err) {
      console.error('[VALIDATOR] On-chain resolution failed for #%d:', predictionId, err);
      // Still mark locally so we don't retry forever
      store.resolvePrediction(predictionId, correct);
    }
  }

  private getActualPrice(asset: string): number {
    const priceFn = SIMULATED_PRICES[asset];
    if (priceFn) {
      return Math.round(priceFn() * 100) / 100;
    }
    // Fallback: unknown asset
    console.warn('[VALIDATOR] No price source for', asset, ', using 0');
    return 0;
  }
}
