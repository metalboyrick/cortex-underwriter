import dotenv from 'dotenv';
dotenv.config();

export const config = {
  rpc: {
    url: process.env.RPC_URL || 'https://sepolia.base.org',
  },
  wallet: {
    predictorKey: process.env.PREDICTOR_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
    insurerKey: process.env.INSURER_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
    validatorKey: process.env.VALIDATOR_PRIVATE_KEY || process.env.PRIVATE_KEY || '',
  },
  contracts: {
    predictionMarket: process.env.PREDICTION_MARKET_ADDRESS || '',
    trustScorer: process.env.TRUST_SCORER_ADDRESS || '',
    agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || '',
    mockUsdc: process.env.MOCK_USDC_ADDRESS || '',
  },
  cortex: {
    url: process.env.CORTEX_URL || 'https://cortex.solder.build',
    apiKey: process.env.CORTEX_API_KEY || '',
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    baseUrl: process.env.AGENT_BASE_URL || `http://localhost:${process.env.PORT || '3001'}`,
  },
  agent: {
    predictionIntervalMs: parseInt(process.env.PREDICTION_INTERVAL_MS || '300000', 10),
    validationIntervalMs: parseInt(process.env.VALIDATION_INTERVAL_MS || '60000', 10),
    defaultStakeAmount: parseInt(process.env.DEFAULT_STAKE_AMOUNT || '100', 10),
  },
} as const;
