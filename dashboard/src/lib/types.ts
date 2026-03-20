export interface Agent {
  address: string;
  trustScore: number;
  totalPredictions: number;
  correctPredictions: number;
  totalStaked: number;
  insuranceBought: number;
  insuranceSold: number;
  lastActive: string;
}

export interface Prediction {
  id: number;
  agent: string;
  asset: string;
  direction: "up" | "down";
  stake: number;
  expiry: string;
  insurancePool: number;
  premiumRate: number;
  status: "active" | "correct" | "wrong" | "expired";
  createdAt: string;
  resolvedAt?: string;
  result?: number;
}

export interface FeedEvent {
  id: string;
  type: "PredictionCreated" | "InsurancePurchased" | "PredictionResolved";
  timestamp: string;
  data: {
    agent?: string;
    predictionId?: number;
    asset?: string;
    direction?: "up" | "down";
    stake?: number;
    amount?: number;
    result?: "correct" | "wrong";
  };
}
