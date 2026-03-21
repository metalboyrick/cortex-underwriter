import type { MarketTrend, AnomalyReport, VolumeProfile, CortexAnalysis } from '../types.js';

interface CortexRequestParams {
  platform: string;
  token: string;
  timeframe?: string;
}

interface CortexSearchParams {
  query: string;
}

// ---------------------------------------------------------------------------
// CoinGecko free API — real market data fallback
// ---------------------------------------------------------------------------
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const COIN_ID_MAP: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'ethereum',
  BTC: 'bitcoin',
  CBBTC: 'bitcoin',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  LINK: 'chainlink',
  UNI: 'uniswap',
  AAVE: 'aave',
  ARB: 'arbitrum',
  OP: 'optimism',
};

interface CoinGeckoPrice {
  price: number;
  change24h: number;
  volume24h: number;
}

async function getCoinGeckoPrice(asset: string): Promise<CoinGeckoPrice | null> {
  const coinId = COIN_ID_MAP[asset.toUpperCase()];
  if (!coinId) return null;

  try {
    const url = `${COINGECKO_BASE}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      console.warn(`[CORTEX] CoinGecko returned ${resp.status} for ${coinId}`);
      return null;
    }
    const data = await resp.json();
    const entry = data[coinId];
    if (!entry?.usd) return null;

    return {
      price: entry.usd,
      change24h: entry.usd_24h_change ?? 0,
      volume24h: entry.usd_24h_vol ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[CORTEX] CoinGecko request failed:', msg);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Derive Cortex-compatible types from CoinGecko data
// ---------------------------------------------------------------------------

function trendFromCoinGecko(asset: string, cg: CoinGeckoPrice): MarketTrend {
  let direction: MarketTrend['direction'];
  let strength: number;

  if (cg.change24h > 2) {
    direction = 'bullish';
    strength = Math.min(Math.round(Math.abs(cg.change24h) * 10), 100);
  } else if (cg.change24h < -2) {
    direction = 'bearish';
    strength = Math.min(Math.round(Math.abs(cg.change24h) * 10), 100);
  } else {
    direction = 'neutral';
    strength = 20;
  }

  const sign = cg.change24h >= 0 ? '+' : '';
  return {
    direction,
    strength,
    timeframe: '24h',
    summary: `${asset} at $${cg.price.toLocaleString()} (${sign}${cg.change24h.toFixed(2)}% 24h). Real data via CoinGecko.`,
  };
}

function anomalyFromCoinGecko(asset: string, cg: CoinGeckoPrice): AnomalyReport {
  const absChange = Math.abs(cg.change24h);

  if (absChange > 10) {
    return {
      detected: true,
      severity: 'high',
      description: `${asset} moved ${cg.change24h > 0 ? '+' : ''}${cg.change24h.toFixed(2)}% in 24h — significant volatility. Real data via CoinGecko.`,
      indicators: ['extreme_price_move', 'volatility_spike'],
    };
  }

  if (absChange > 5) {
    return {
      detected: true,
      severity: 'medium',
      description: `${asset} moved ${cg.change24h > 0 ? '+' : ''}${cg.change24h.toFixed(2)}% in 24h — elevated volatility. Real data via CoinGecko.`,
      indicators: ['large_price_move'],
    };
  }

  return {
    detected: false,
    severity: 'low',
    description: `No anomalies detected for ${asset}. 24h change within normal range (${cg.change24h.toFixed(2)}%). Real data via CoinGecko.`,
    indicators: [],
  };
}

function volumeFromCoinGecko(asset: string, cg: CoinGeckoPrice): VolumeProfile {
  // CoinGecko gives us 24h volume; we estimate average as current (best we can do with free API)
  const current = Math.round(cg.volume24h);
  // Use change24h as a rough proxy for volume trend direction
  const changePct = cg.change24h;
  const trend: VolumeProfile['trend'] =
    Math.abs(changePct) > 5 ? (changePct > 0 ? 'increasing' : 'decreasing') : 'stable';

  return {
    current,
    average: current, // free API doesn't give historical average
    change: Math.round(changePct * 100) / 100,
    trend,
  };
}

// ---------------------------------------------------------------------------
// CortexClient
// ---------------------------------------------------------------------------

export class CortexClient {
  private baseUrl: string;
  private apiKey: string;
  private useMock: boolean = false;

  // Cache CoinGecko responses for 60s to avoid rate limits (free tier: 10-30 req/min)
  private cgCache: Map<string, { data: CoinGeckoPrice; ts: number }> = new Map();
  private static CG_CACHE_TTL = 60_000;

  constructor(baseUrl: string = 'https://cortex.solder.build', apiKey: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  // ---- Cortex API layer ----

  private async request<T>(endpoint: string, body: object): Promise<T | null> {
    if (this.useMock) {
      return null; // Caller will try CoinGecko next
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 403 || res.status === 401) {
        console.warn('[CORTEX] Auth required, will try CoinGecko fallback');
        this.useMock = true;
        return null;
      }

      if (!res.ok) {
        console.warn(`[CORTEX] API returned ${res.status}, will try CoinGecko fallback`);
        return null;
      }

      return (await res.json()) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[CORTEX] Request failed:', msg, '- will try CoinGecko fallback');
      this.useMock = true;
      return null;
    }
  }

  // ---- CoinGecko layer (cached) ----

  private async getCachedCoinGeckoPrice(asset: string): Promise<CoinGeckoPrice | null> {
    const key = asset.toUpperCase();
    const cached = this.cgCache.get(key);
    if (cached && Date.now() - cached.ts < CortexClient.CG_CACHE_TTL) {
      return cached.data;
    }

    const data = await getCoinGeckoPrice(asset);
    if (data) {
      this.cgCache.set(key, { data, ts: Date.now() });
    }
    return data;
  }

  // ---- Public API: 3-tier fallback (Cortex -> CoinGecko -> Mock) ----

  async getMarketTrend(params: CortexRequestParams): Promise<MarketTrend> {
    // Tier 1: Cortex API
    const result = await this.request<MarketTrend>('/api/market-trend', params);
    if (result) {
      console.log(`[CORTEX] Using Cortex API data for ${params.token} trend`);
      return result;
    }

    // Tier 2: CoinGecko
    const cg = await this.getCachedCoinGeckoPrice(params.token);
    if (cg) {
      const sign = cg.change24h >= 0 ? '+' : '';
      console.log(`[CORTEX] Using CoinGecko data for ${params.token}: $${cg.price.toLocaleString()} (24h: ${sign}${cg.change24h.toFixed(2)}%)`);
      return trendFromCoinGecko(params.token, cg);
    }

    // Tier 3: Mock
    console.log(`[CORTEX] Using mock data for ${params.token} (no data source available)`);
    return CortexMock.getMarketTrend(params.token);
  }

  async detectAnomalies(params: CortexRequestParams & { timeframe: string }): Promise<AnomalyReport> {
    const result = await this.request<AnomalyReport>('/api/detect-anomalies', params);
    if (result) {
      console.log(`[CORTEX] Using Cortex API data for ${params.token} anomalies`);
      return result;
    }

    const cg = await this.getCachedCoinGeckoPrice(params.token);
    if (cg) {
      console.log(`[CORTEX] Using CoinGecko data for ${params.token} anomaly detection`);
      return anomalyFromCoinGecko(params.token, cg);
    }

    console.log(`[CORTEX] Using mock data for ${params.token} anomalies (no data source available)`);
    return CortexMock.detectAnomalies(params.token);
  }

  async getVolumeProfile(params: CortexRequestParams): Promise<VolumeProfile> {
    const result = await this.request<VolumeProfile>('/api/volume-profile', params);
    if (result) {
      console.log(`[CORTEX] Using Cortex API data for ${params.token} volume`);
      return result;
    }

    const cg = await this.getCachedCoinGeckoPrice(params.token);
    if (cg) {
      console.log(`[CORTEX] Using CoinGecko data for ${params.token} volume profile`);
      return volumeFromCoinGecko(params.token, cg);
    }

    console.log(`[CORTEX] Using mock data for ${params.token} volume (no data source available)`);
    return CortexMock.getVolumeProfile(params.token);
  }

  async searchMemory(params: CortexSearchParams): Promise<string[]> {
    const result = await this.request<string[]>('/api/search-memory', params);
    return result ?? CortexMock.searchMemory(params.query);
  }

  async getFullAnalysis(token: string, platform: string = 'base'): Promise<CortexAnalysis> {
    const [trend, anomalies, volume] = await Promise.all([
      this.getMarketTrend({ platform, token }),
      this.detectAnomalies({ platform, token, timeframe: '24h' }),
      this.getVolumeProfile({ platform, token }),
    ]);

    return { trend, anomalies, volume };
  }

  /**
   * Get the real current price for an asset (CoinGecko).
   * Returns null if the asset isn't mapped or the API is unreachable.
   */
  async getRealPrice(asset: string): Promise<number | null> {
    const cg = await this.getCachedCoinGeckoPrice(asset);
    return cg?.price ?? null;
  }
}

// ---------------------------------------------------------------------------
// Mock data generator — last resort when both Cortex and CoinGecko are down
// ---------------------------------------------------------------------------
class CortexMock {
  private static rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  static getMarketTrend(token: string): MarketTrend {
    const directions: MarketTrend['direction'][] = ['bullish', 'bearish', 'neutral'];
    const direction = directions[Math.floor(Math.random() * 3)];
    return {
      direction,
      strength: Math.round(this.rand(20, 90)),
      timeframe: '24h',
      summary: `[MOCK] ${token} showing ${direction} momentum with moderate volume. Simulated analysis for demo.`,
    };
  }

  static detectAnomalies(token: string): AnomalyReport {
    const detected = Math.random() > 0.6;
    const severities: AnomalyReport['severity'][] = ['low', 'medium', 'high'];
    return {
      detected,
      severity: detected ? severities[Math.floor(Math.random() * 3)] : 'low',
      description: detected
        ? `[MOCK] Unusual ${token} activity detected — possible whale movement or liquidity shift.`
        : `[MOCK] No anomalies detected for ${token} in the current timeframe.`,
      indicators: detected
        ? ['volume_spike', 'price_deviation', 'order_imbalance']
        : [],
    };
  }

  static getVolumeProfile(token: string): VolumeProfile {
    const current = this.rand(1_000_000, 50_000_000);
    const average = this.rand(5_000_000, 30_000_000);
    const change = ((current - average) / average) * 100;
    return {
      current: Math.round(current),
      average: Math.round(average),
      change: Math.round(change * 100) / 100,
      trend: change > 10 ? 'increasing' : change < -10 ? 'decreasing' : 'stable',
    };
  }

  static searchMemory(query: string): string[] {
    return [
      `[MOCK] Previous analysis for "${query}" showed mixed signals.`,
      `[MOCK] Historical data suggests caution for related assets.`,
    ];
  }
}
