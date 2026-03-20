export interface Prediction {
  id: number;
  asset: string;
  direction: 'up' | 'down';
  targetPrice: number;
  confidence: number;
  reasoning: string;
  cortexData: CortexAnalysis | null;
  createdAt: number;
  expiresAt: number;
  txHash: string;
  resolved?: boolean;
  correct?: boolean;
}

export interface CortexAnalysis {
  trend: MarketTrend | null;
  anomalies: AnomalyReport | null;
  volume: VolumeProfile | null;
}

export interface MarketTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  timeframe: string;
  summary: string;
}

export interface AnomalyReport {
  detected: boolean;
  severity: 'low' | 'medium' | 'high';
  description: string;
  indicators: string[];
}

export interface VolumeProfile {
  current: number;
  average: number;
  change: number; // percentage
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface InsuranceInfo {
  predictionId: number;
  insurer: string;
  amount: bigint;
  txHash: string;
  timestamp: number;
}

export interface AgentInfo {
  address: string;
  erc8004Uri: string;
  trustScore: number;
  totalPredictions: number;
  correctPredictions: number;
  registered: boolean;
}

export interface PredictionStore {
  predictions: Map<number, Prediction>;
  insurance: Map<number, InsuranceInfo[]>;
}
