import type { MarketTrend, AnomalyReport, VolumeProfile, CortexAnalysis } from '../types.js';

interface CortexRequestParams {
  platform: string;
  token: string;
  timeframe?: string;
}

interface CortexSearchParams {
  query: string;
}

export class CortexClient {
  private baseUrl: string;
  private apiKey: string;
  private useMock: boolean = false;

  constructor(baseUrl: string = 'https://cortex.solder.build', apiKey: string = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, body: object): Promise<T | null> {
    if (this.useMock) {
      return null; // Caller will use mock fallback
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
        console.warn('[CORTEX] Auth required, falling back to mock data');
        this.useMock = true;
        return null;
      }

      if (!res.ok) {
        console.warn(`[CORTEX] API returned ${res.status}, falling back to mock`);
        return null;
      }

      return (await res.json()) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[CORTEX] Request failed:', msg, '- using mock data');
      this.useMock = true;
      return null;
    }
  }

  async getMarketTrend(params: CortexRequestParams): Promise<MarketTrend> {
    const result = await this.request<MarketTrend>('/api/market-trend', params);
    return result ?? CortexMock.getMarketTrend(params.token);
  }

  async detectAnomalies(params: CortexRequestParams & { timeframe: string }): Promise<AnomalyReport> {
    const result = await this.request<AnomalyReport>('/api/detect-anomalies', params);
    return result ?? CortexMock.detectAnomalies(params.token);
  }

  async getVolumeProfile(params: CortexRequestParams): Promise<VolumeProfile> {
    const result = await this.request<VolumeProfile>('/api/volume-profile', params);
    return result ?? CortexMock.getVolumeProfile(params.token);
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
}

// Mock data generator for when Cortex is unreachable
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
