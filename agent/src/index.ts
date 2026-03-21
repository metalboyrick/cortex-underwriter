import { ethers } from 'ethers';
import { config } from './config.js';
import { CortexClient } from './cortex/client.js';
import { UnderwriterContracts } from './contracts/index.js';
import { PredictorAgent } from './agents/predictor.js';
import { InsurerAgent } from './agents/insurer.js';
import { ValidatorAgent } from './agents/validator.js';
import { createServer } from './server.js';

// ERC-8004 IdentityRegistry on Base mainnet
// Contract: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (AgentIdentity, symbol: AGENT)
// Interface: register(string uri) → uint256 tokenId (permissionless ERC-721)
// Run: agent/scripts/register-erc8004-mainnet.sh --send  (after funding wallet with Base ETH)
const ERC8004_MAINNET_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

// Agent card URIs — GitHub-hosted metadata conforming to eip-8004#registration-v1 schema.
// These are the URIs passed to register() on the mainnet IdentityRegistry.
// IPFS CIDs (for reference, content-addressable):
//   predictor: bafkreid5dearl5xktnctzgocww2b2hknzlbrsiz63br7heyb7k6qebprme
//   insurer:   bafkreigm6pfalg4qtcrgz6c6pgudwyqtz7hwgi7fxny5bmeyekdsdch5nm
//   validator: bafkreickcvw6t3m5b3ni655p7xiktsshsmfbrc2pty634yamuhkx6iu7am
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

  if (!config.wallet.privateKey) {
    console.error('[MAIN] PRIVATE_KEY not set in .env');
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

  // --- 1. Initialize provider + signer ---

  console.log('[MAIN] Connecting to', config.rpc.url);
  const provider = new ethers.JsonRpcProvider(config.rpc.url);
  const signer = new ethers.Wallet(config.wallet.privateKey, provider);
  const signerAddress = await signer.getAddress();
  console.log('[MAIN] Agent wallet:', signerAddress);

  // Verify connection
  try {
    const network = await provider.getNetwork();
    console.log('[MAIN] Connected to chain:', network.chainId.toString(), network.name);
  } catch (err) {
    console.error('[MAIN] Failed to connect to RPC:', err);
    process.exit(1);
  }

  // --- 2. Connect to contracts ---

  const contracts = new UnderwriterContracts(provider, signer, {
    predictionMarket: config.contracts.predictionMarket,
    trustScorer: config.contracts.trustScorer,
    agentRegistry: config.contracts.agentRegistry,
    mockUsdc: config.contracts.mockUsdc,
  });

  // --- 3. Register agent if not already registered ---

  try {
    const isRegistered = await contracts.isAgentRegistered(signerAddress);
    if (!isRegistered) {
      console.log('[MAIN] Agent not registered, registering with ERC-8004 metadata...');
      console.log('[MAIN] Predictor URI:', ERC8004_URIS.predictor);
      const tx = await contracts.registerAgent(ERC8004_URIS.predictor);
      await tx.wait();
      console.log('[MAIN] Agent registered successfully');
    } else {
      console.log('[MAIN] Agent already registered');
    }
  } catch (err) {
    console.warn('[MAIN] Registration check/attempt failed:', err);
    console.warn('[MAIN] Continuing anyway — contracts may not be deployed yet');
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
    contracts,
    config.agent.defaultStakeAmount,
    config.agent.predictionIntervalMs,
  );

  const insurer = new InsurerAgent(cortex, contracts);

  const validator = new ValidatorAgent(contracts, config.agent.validationIntervalMs);

  // --- 6. Start API server ---

  const app = createServer(contracts, predictor);
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
