/**
 * generate-demo-events.ts
 *
 * Generates a full lifecycle of on-chain events on Base Sepolia for hackathon judging.
 * Creates predictions, buys insurance, resolves outcomes, and claims payouts.
 *
 * Usage: npx tsx scripts/generate-demo-events.ts
 */

import { ethers } from 'ethers';
import * as fs from 'fs';
import {
  PREDICTION_MARKET_ABI,
  AGENT_REGISTRY_ABI,
  ERC20_ABI,
} from '../src/contracts/abis';

// ── Contract addresses on Base Sepolia ──────────────────────────────────────
const MOCK_USDC = '0xa249AdcB0f5E9E7224A97b6BfCBb6F44B99EF63c';
const AGENT_REGISTRY = '0xDF9c853dEed46E2e5c053313434F3C42fC4f320A';
const TRUST_SCORER = '0x2ED590A785Ea73d180277063FD6aE53594Ed9fA2';
const PREDICTION_MARKET = '0x083D22A05BD191aA1Ee09b9c5375Ed8f85255550';
const RPC_URL = 'https://sepolia.base.org';

// ── USDC has 6 decimals ────────────────────────────────────────────────────
const USDC_DECIMALS = 6;
function usdc(amount: number): bigint {
  return BigInt(amount) * 10n ** BigInt(USDC_DECIMALS);
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TxRecord {
  step: number;
  description: string;
  hash: string;
  block: number;
}

const txLog: TxRecord[] = [];

async function logTx(step: number, description: string, tx: ethers.ContractTransactionResponse): Promise<ethers.ContractTransactionReceipt> {
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`Step ${step}: transaction receipt is null`);
  const block = receipt.blockNumber;
  const hash = receipt.hash;
  console.log(`[TX] Step ${step}: ${description} -- hash: ${hash} (confirmed block ${block})`);
  txLog.push({ step, description, hash, block });
  return receipt;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(80));
  console.log('  Cortex Underwriter -- Demo Event Generator (Base Sepolia)');
  console.log('='.repeat(80));
  console.log();

  // Load private key
  const keyPath = '/home/rick_quantum3labs_com/.secrets/base-sepolia-deployer-key';
  const privateKey = fs.readFileSync(keyPath, 'utf-8').trim();

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(privateKey, provider);
  console.log(`Deployer wallet: ${deployer.address}`);

  // Create a second wallet for insurance buying (can't insure own prediction)
  const insurerWallet = ethers.Wallet.createRandom().connect(provider);
  console.log(`Insurer wallet:  ${insurerWallet.address} (ephemeral)`);
  console.log();

  // Contract instances
  const usdc_contract = new ethers.Contract(MOCK_USDC, ERC20_ABI, deployer);
  const registry = new ethers.Contract(AGENT_REGISTRY, AGENT_REGISTRY_ABI, deployer);
  const market = new ethers.Contract(PREDICTION_MARKET, PREDICTION_MARKET_ABI, deployer);
  const marketAsInsurer = new ethers.Contract(PREDICTION_MARKET, PREDICTION_MARKET_ABI, insurerWallet);
  const usdcAsInsurer = new ethers.Contract(MOCK_USDC, ERC20_ABI, insurerWallet);

  // ── Pre-flight: fund insurer wallet with ETH for gas ──────────────────
  console.log('--- Pre-flight: funding insurer wallet with ETH for gas ---');
  const insurerBalance = await provider.getBalance(insurerWallet.address);
  if (insurerBalance < ethers.parseEther('0.001')) {
    const fundTx = await deployer.sendTransaction({
      to: insurerWallet.address,
      value: ethers.parseEther('0.005'),
    });
    await fundTx.wait();
    console.log(`Funded insurer with 0.005 ETH -- tx: ${fundTx.hash}`);
    await sleep(3000);
  }

  // ── Pre-flight: ensure deployer is registered as an agent ─────────────
  const isRegistered = await registry.isRegistered(deployer.address);
  if (!isRegistered) {
    console.log('--- Pre-flight: registering deployer as agent ---');
    const regTx = await registry.registerAgent('https://cortex.solder.build/agent/deployer');
    await regTx.wait();
    console.log(`Registered deployer agent -- tx: ${regTx.hash}`);
    await sleep(3000);
  } else {
    console.log('Deployer already registered as agent.');
  }

  // ── Pre-flight: ensure insurer is registered as an agent ──────────────
  const insurerRegistry = new ethers.Contract(AGENT_REGISTRY, AGENT_REGISTRY_ABI, insurerWallet);
  const insurerRegistered = await registry.isRegistered(insurerWallet.address);
  if (!insurerRegistered) {
    console.log('--- Pre-flight: registering insurer as agent ---');
    const regTx = await insurerRegistry.registerAgent('https://cortex.solder.build/agent/insurer');
    await regTx.wait();
    console.log(`Registered insurer agent -- tx: ${regTx.hash}`);
    await sleep(3000);
  }

  // Get current prediction count to know IDs
  const currentCount = await market.predictionCount();
  console.log(`Current prediction count: ${currentCount}`);
  console.log();

  // ════════════════════════════════════════════════════════════════════════
  // Step 1: Mint 50,000 MockUSDC to deployer
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 1: Mint MockUSDC ---');
  const mintTx = await usdc_contract.mint(deployer.address, usdc(50_000));
  await logTx(1, 'Mint 50,000 USDC to deployer', mintTx);
  await sleep(3000);

  // Also mint USDC to insurer for buying insurance
  console.log('--- Minting USDC to insurer wallet ---');
  const mintInsurerTx = await usdc_contract.mint(insurerWallet.address, usdc(10_000));
  await mintInsurerTx.wait();
  console.log(`Minted 10,000 USDC to insurer -- tx: ${mintInsurerTx.hash}`);
  await sleep(3000);

  // ── Approve PredictionMarket to spend deployer USDC ───────────────────
  console.log('--- Approving PredictionMarket to spend deployer USDC ---');
  const approveTx = await usdc_contract.approve(PREDICTION_MARKET, usdc(100_000));
  await approveTx.wait();
  console.log(`Approved -- tx: ${approveTx.hash}`);
  await sleep(3000);

  // Approve for insurer too
  console.log('--- Approving PredictionMarket to spend insurer USDC ---');
  const approveInsurerTx = await usdcAsInsurer.approve(PREDICTION_MARKET, usdc(100_000));
  await approveInsurerTx.wait();
  console.log(`Approved -- tx: ${approveInsurerTx.hash}`);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 2: Create Prediction #2 - "ETH will be above $4000 in 24h"
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 2: Create Prediction -- ETH > $4000 in 24h ---');
  const hash2 = ethers.keccak256(ethers.toUtf8Bytes('ETH-UP-4000-24h'));
  const now = Math.floor(Date.now() / 1000);
  const expires2 = now + 86400;
  const createTx2 = await market.createPrediction(hash2, usdc(200), expires2);
  const receipt2 = await logTx(2, 'Create Prediction: ETH > $4000 in 24h (200 USDC stake)', createTx2);
  await sleep(3000);

  // Parse prediction ID from event
  const predictionCreatedIface = new ethers.Interface(PREDICTION_MARKET_ABI);
  let predictionId2: bigint | undefined;
  for (const log of receipt2.logs) {
    try {
      const parsed = predictionCreatedIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed && parsed.name === 'PredictionCreated') {
        predictionId2 = parsed.args.predictionId;
        break;
      }
    } catch { /* skip non-matching logs */ }
  }
  if (predictionId2 === undefined) throw new Error('Failed to parse predictionId for step 2');
  console.log(`  -> Prediction ID: ${predictionId2}`);

  // ════════════════════════════════════════════════════════════════════════
  // Step 3: Create Prediction #3 - "BTC will drop below $80,000 in 12h"
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 3: Create Prediction -- BTC < $80,000 in 12h ---');
  const hash3 = ethers.keccak256(ethers.toUtf8Bytes('BTC-DOWN-80000-12h'));
  const expires3 = now + 43200;
  const createTx3 = await market.createPrediction(hash3, usdc(500), expires3);
  const receipt3 = await logTx(3, 'Create Prediction: BTC < $80,000 in 12h (500 USDC stake)', createTx3);
  await sleep(3000);

  let predictionId3: bigint | undefined;
  for (const log of receipt3.logs) {
    try {
      const parsed = predictionCreatedIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed && parsed.name === 'PredictionCreated') {
        predictionId3 = parsed.args.predictionId;
        break;
      }
    } catch { /* skip */ }
  }
  if (predictionId3 === undefined) throw new Error('Failed to parse predictionId for step 3');
  console.log(`  -> Prediction ID: ${predictionId3}`);

  // ════════════════════════════════════════════════════════════════════════
  // Step 4: Create Prediction #4 - "SOL will be above $200 in 48h"
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 4: Create Prediction -- SOL > $200 in 48h ---');
  const hash4 = ethers.keccak256(ethers.toUtf8Bytes('SOL-UP-200-48h'));
  const expires4 = now + 172800;
  const createTx4 = await market.createPrediction(hash4, usdc(150), expires4);
  const receipt4 = await logTx(4, 'Create Prediction: SOL > $200 in 48h (150 USDC stake)', createTx4);
  await sleep(3000);

  let predictionId4: bigint | undefined;
  for (const log of receipt4.logs) {
    try {
      const parsed = predictionCreatedIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed && parsed.name === 'PredictionCreated') {
        predictionId4 = parsed.args.predictionId;
        break;
      }
    } catch { /* skip */ }
  }
  if (predictionId4 === undefined) throw new Error('Failed to parse predictionId for step 4');
  console.log(`  -> Prediction ID: ${predictionId4}`);

  // ════════════════════════════════════════════════════════════════════════
  // Step 5: Buy Insurance on Prediction #2 (100 USDC coverage)
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 5: Buy Insurance on Prediction #2 (100 USDC) ---');
  const insureTx2 = await marketAsInsurer.buyInsurance(predictionId2, usdc(100));
  await logTx(5, `Buy Insurance on Prediction #${predictionId2} (100 USDC coverage)`, insureTx2);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 6: Buy Insurance on Prediction #3 (250 USDC coverage)
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 6: Buy Insurance on Prediction #3 (250 USDC) ---');
  const insureTx3 = await marketAsInsurer.buyInsurance(predictionId3, usdc(250));
  await logTx(6, `Buy Insurance on Prediction #${predictionId3} (250 USDC coverage)`, insureTx3);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 7: Resolve Prediction #2 as CORRECT
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 7: Resolve Prediction #2 as CORRECT ---');
  const resolveTx2 = await market.resolvePrediction(predictionId2, true);
  await logTx(7, `Resolve Prediction #${predictionId2} as CORRECT`, resolveTx2);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 8: Resolve Prediction #3 as WRONG
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 8: Resolve Prediction #3 as WRONG ---');
  const resolveTx3 = await market.resolvePrediction(predictionId3, false);
  await logTx(8, `Resolve Prediction #${predictionId3} as WRONG`, resolveTx3);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 9: Claim stake on Prediction #2 (predictor claims back)
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 9: Claim stake on Prediction #2 ---');
  const claimStakeTx = await market.claimStake(predictionId2);
  await logTx(9, `Claim stake on Prediction #${predictionId2} (correct prediction)`, claimStakeTx);
  await sleep(3000);

  // ════════════════════════════════════════════════════════════════════════
  // Step 10: Claim insurance on Prediction #3 (insurer claims payout)
  // ════════════════════════════════════════════════════════════════════════
  console.log('--- Step 10: Claim insurance on Prediction #3 ---');
  const claimInsuranceTx = await marketAsInsurer.claimInsurance(predictionId3);
  await logTx(10, `Claim insurance on Prediction #${predictionId3} (wrong prediction payout)`, claimInsuranceTx);

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════
  console.log();
  console.log('='.repeat(80));
  console.log('  TRANSACTION SUMMARY');
  console.log('='.repeat(80));
  console.log();
  console.log(
    'Step'.padEnd(6) +
    'Block'.padEnd(10) +
    'Description'.padEnd(55) +
    'Hash'
  );
  console.log('-'.repeat(140));
  for (const tx of txLog) {
    console.log(
      String(tx.step).padEnd(6) +
      String(tx.block).padEnd(10) +
      tx.description.substring(0, 53).padEnd(55) +
      tx.hash
    );
  }
  console.log();
  console.log(`Total transactions: ${txLog.length}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Insurer:  ${insurerWallet.address}`);
  console.log();
  console.log('All events confirmed on Base Sepolia. Ready for hackathon judging.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
