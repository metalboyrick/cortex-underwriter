import { ethers } from 'ethers';
import { config } from './config.js';
import { CortexClient } from './cortex/client.js';
import { UnderwriterContracts } from './contracts/index.js';
import { PredictorAgent } from './agents/predictor.js';
import { InsurerAgent } from './agents/insurer.js';
import { ValidatorAgent } from './agents/validator.js';
import { createServer } from './server.js';

// Agent card URIs — GitHub-hosted metadata conforming to eip-8004#registration-v1 schema.
// Registered on ERC-8004 IdentityRegistry (Base mainnet, 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432)
const ERC8004_URIS = {
  predictor: 'https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/predictor-agent-card.json',
  insurer: 'https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/insurer-agent-card.json',
  validator: 'https://raw.githubusercontent.com/metalboyrick/cortex-underwriter/main/agent/metadata/validator-agent-card.json',
};

async function main(): Promise<void> {
  console.log('==============================================');
  console.log('  Cortex Underwriter Agent Runtime');
  console.log('==============================================');
  console.log();

  // --- Validate config ---

  if (!config.wallet.predictorKey) {
    console.error('[MAIN] PREDICTOR_PRIVATE_KEY (or PRIVATE_KEY) not set in .env');
    process.exit(1);
  }
  if (!config.wallet.insurerKey) {
    console.error('[MAIN] INSURER_PRIVATE_KEY (or PRIVATE_KEY) not set in .env');
    process.exit(1);
  }
  if (!config.wallet.validatorKey) {
    console.error('[MAIN] VALIDATOR_PRIVATE_KEY (or PRIVATE_KEY) not set in .env');
    process.exit(1);
  }

  const missingContracts = Object.entries(config.contracts)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missingContracts.length > 0) {
    console.error('[MAIN] Missing contract addresses:', missingContracts.join(', '));
    console.error('[MAIN] Fill in .env with deployed contract addresses');
    process.exit(1);
  }

  // --- 1. Initialize provider + per-role signers ---

  console.log('[MAIN] Connecting to', config.rpc.url);
  const provider = new ethers.JsonRpcProvider(config.rpc.url);

  const predictorSigner = new ethers.Wallet(config.wallet.predictorKey, provider);
  const insurerSigner = new ethers.Wallet(config.wallet.insurerKey, provider);
  const validatorSigner = new ethers.Wallet(config.wallet.validatorKey, provider);

  const predictorAddress = await predictorSigner.getAddress();
  const insurerAddress = await insurerSigner.getAddress();
  const validatorAddress = await validatorSigner.getAddress();

  console.log('[MAIN] Predictor wallet:', predictorAddress);
  console.log('[MAIN] Insurer  wallet:', insurerAddress);
  console.log('[MAIN] Validator wallet:', validatorAddress);

  // Verify connection
  try {
    const network = await provider.getNetwork();
    console.log('[MAIN] Connected to chain:', network.chainId.toString(), network.name);
  } catch (err) {
    console.error('[MAIN] Failed to connect to RPC:', err);
    process.exit(1);
  }

  // --- 2. Connect to contracts (one instance per role) ---

  const contractAddresses = {
    predictionMarket: config.contracts.predictionMarket,
    trustScorer: config.contracts.trustScorer,
    agentRegistry: config.contracts.agentRegistry,
    mockUsdc: config.contracts.mockUsdc,
  };

  const predictorContracts = new UnderwriterContracts(provider, predictorSigner, contractAddresses);
  const insurerContracts = new UnderwriterContracts(provider, insurerSigner, contractAddresses);
  const validatorContracts = new UnderwriterContracts(provider, validatorSigner, contractAddresses);

  // --- 3. Register each agent role if not already registered ---

  const registrations: Array<{ name: string; address: string; uri: string; contracts: UnderwriterContracts }> = [
    { name: 'Predictor', address: predictorAddress, uri: ERC8004_URIS.predictor, contracts: predictorContracts },
    { name: 'Insurer', address: insurerAddress, uri: ERC8004_URIS.insurer, contracts: insurerContracts },
    { name: 'Validator', address: validatorAddress, uri: ERC8004_URIS.validator, contracts: validatorContracts },
  ];

  for (const reg of registrations) {
    try {
      const isRegistered = await reg.contracts.isAgentRegistered(reg.address);
      if (!isRegistered) {
        console.log(`[MAIN] ${reg.name} not registered, registering with ERC-8004 metadata...`);
        const tx = await reg.contracts.registerAgent(reg.uri);
        await tx.wait();
        console.log(`[MAIN] ${reg.name} registered successfully`);
      } else {
        console.log(`[MAIN] ${reg.name} already registered`);
      }
    } catch (err) {
      console.warn(`[MAIN] ${reg.name} registration check/attempt failed:`, err);
      console.warn('[MAIN] Continuing anyway — contracts may not be deployed yet');
    }
  }

  console.log('[MAIN] ERC-8004 Agent Card URIs:');
  console.log('  Predictor:', ERC8004_URIS.predictor);
  console.log('  Insurer:  ', ERC8004_URIS.insurer);
  console.log('  Validator:', ERC8004_URIS.validator);

  // --- 4. Initialize Cortex client ---

  const cortex = new CortexClient(config.cortex.url, config.cortex.apiKey);
  console.log('[MAIN] Cortex client initialized:', config.cortex.url);

  // --- 5. Initialize agents ---

  const predictor = new PredictorAgent(
    cortex,
    predictorContracts,
    config.agent.defaultStakeAmount,
    config.agent.predictionIntervalMs,
  );

  const insurer = new InsurerAgent(cortex, insurerContracts);

  const validator = new ValidatorAgent(validatorContracts, config.agent.validationIntervalMs);

  // --- 6. Start API server ---

  const app = createServer(predictorContracts, predictor);
  const server = app.listen(config.server.port, () => {
    console.log('[MAIN] API server running on port', config.server.port);
  });

  // --- 7. Start agents ---

  console.log('[MAIN] Starting agents...');
  await predictor.start();
  await insurer.start();
  await validator.start();
  console.log('[MAIN] All agents running');

  // --- Graceful shutdown ---

  const shutdown = async (signal: string) => {
    console.log(`\n[MAIN] Received ${signal}, shutting down...`);
    predictor.stop();
    insurer.stop();
    validator.stop();
    server.close();
    console.log('[MAIN] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[MAIN] Fatal error:', err);
  process.exit(1);
});
