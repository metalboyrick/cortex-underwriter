import { ethers } from 'ethers';
import { UnderwriterContracts } from '../contracts/index.js';
import { store } from '../store.js';

// ---------------------------------------------------------------------------
// Pyth Network Oracle — Base Sepolia
// ---------------------------------------------------------------------------

const PYTH_ADDRESS = '0xA2aa501b19aff244D90cc15a4Cf739D2725B5729';

// We use getPriceUnsafe because getPrice reverts if the on-chain price is
// older than the staleness threshold. For resolution we just need the most
// recent on-chain value and we check publishTime ourselves.
const PYTH_ABI = [
  'function getPriceUnsafe(bytes32 id) view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime)',
];

const PRICE_FEEDS: Record<string, string> = {
  ETH:   '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  WETH:  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // same as ETH
  BTC:   '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  cbBTC: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC feed for cbBTC
  SOL:   '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
};

// Prices older than 10 minutes trigger a staleness warning but are still used.
const STALENESS_THRESHOLD_SECS = 600;

// Fallback simulated prices — only used when Pyth call fails entirely.
const FALLBACK_PRICES: Record<string, () => number> = {
  ETH:   () => 3500 + (Math.random() - 0.5) * 400,
  WETH:  () => 3500 + (Math.random() - 0.5) * 400,
  USDC:  () => 1 + (Math.random() - 0.5) * 0.01,
  cbBTC: () => 85000 + (Math.random() - 0.5) * 8000,
  BTC:   () => 85000 + (Math.random() - 0.5) * 8000,
  SOL:   () => 180 + (Math.random() - 0.5) * 30,
};

// ---------------------------------------------------------------------------
// Pyth price reader
// ---------------------------------------------------------------------------

interface PythPriceResult {
  price: number;
  confidence: number;
  publishTime: number;
  source: 'pyth';
}

async function getPythPrice(
  provider: ethers.Provider,
  asset: string,
): Promise<PythPriceResult | null> {
  const key = asset.toUpperCase();
  const feedId = PRICE_FEEDS[key];
  if (!feedId) return null;

  const pyth = new ethers.Contract(PYTH_ADDRESS, PYTH_ABI, provider);
  try {
    const [rawPrice, conf, expo, publishTime] = await pyth.getPriceUnsafe(feedId);

    const exponent = Number(expo);
    const realPrice = Number(rawPrice) * Math.pow(10, exponent);
    const realConf = Number(conf) * Math.pow(10, exponent);
    const pubTimeSecs = Number(publishTime);

    // Staleness check — warn but do not reject
    const age = Math.floor(Date.now() / 1000) - pubTimeSecs;
    if (age > STALENESS_THRESHOLD_SECS) {
      console.warn(
        '[VALIDATOR] WARNING: Pyth price for %s is %d seconds old (published %s)',
        asset,
        age,
        new Date(pubTimeSecs * 1000).toISOString(),
      );
    }

    return {
      price: Math.round(realPrice * 100) / 100,
      confidence: Math.round(realConf * 100) / 100,
      publishTime: pubTimeSecs,
      source: 'pyth',
    };
  } catch (err) {
    console.error('[VALIDATOR] Pyth oracle call failed for %s:', asset, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validator Agent
// ---------------------------------------------------------------------------

export class ValidatorAgent {
  private contracts: UnderwriterContracts;
  private provider: ethers.Provider;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(contracts: UnderwriterContracts, intervalMs: number = 60_000) {
    this.contracts = contracts;
    this.provider = contracts.getProvider();
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    console.log('[VALIDATOR] Starting validator agent, interval:', this.intervalMs, 'ms');
    console.log('[VALIDATOR] Pyth oracle at %s on Base Sepolia', PYTH_ADDRESS);
    console.log('[VALIDATOR] Supported feeds:', Object.keys(PRICE_FEEDS).join(', '));

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

    // 1. Get actual price from Pyth oracle
    const pythResult = await getPythPrice(this.provider, prediction.asset);

    let actualPrice: number;
    let priceSource: string;

    if (pythResult) {
      actualPrice = pythResult.price;
      priceSource = `Pyth (conf: ±$${pythResult.confidence}, published: ${new Date(pythResult.publishTime * 1000).toISOString()})`;
    } else {
      // Fallback — no Pyth feed available for this asset
      const fallbackFn = FALLBACK_PRICES[prediction.asset.toUpperCase()];
      if (fallbackFn) {
        actualPrice = Math.round(fallbackFn() * 100) / 100;
        priceSource = 'SIMULATED (no Pyth feed)';
        console.warn(
          '[VALIDATOR] WARNING: Using simulated price for %s — Pyth feed unavailable. ' +
          'This will not be accepted in production.',
          prediction.asset,
        );
      } else {
        console.error(
          '[VALIDATOR] No price source available for %s, skipping resolution',
          prediction.asset,
        );
        return;
      }
    }

    console.log(
      '[VALIDATOR] Resolving prediction #%d: %s target $%s (%s), actual %s price $%s',
      predictionId,
      prediction.asset,
      prediction.targetPrice,
      prediction.direction,
      priceSource,
      actualPrice,
    );

    // 2. Determine if prediction was correct
    let correct: boolean;
    if (prediction.direction === 'up') {
      correct = actualPrice >= prediction.targetPrice;
    } else {
      correct = actualPrice <= prediction.targetPrice;
    }

    const verdict = correct ? 'CORRECT' : 'WRONG';
    console.log(
      '[VALIDATOR] Prediction #%d: %s target $%s, actual Pyth price $%s → %s',
      predictionId,
      prediction.asset,
      prediction.targetPrice,
      actualPrice,
      verdict,
    );

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
}
