import { ethers } from 'ethers';
import {
  PREDICTION_MARKET_ABI,
  TRUST_SCORER_ABI,
  AGENT_REGISTRY_ABI,
  ERC20_ABI,
} from './abis.js';

export interface ContractAddresses {
  predictionMarket: string;
  trustScorer: string;
  agentRegistry: string;
  mockUsdc: string;
}

export class UnderwriterContracts {
  public readonly predictionMarket: ethers.Contract;
  public readonly trustScorer: ethers.Contract;
  public readonly agentRegistry: ethers.Contract;
  public readonly usdc: ethers.Contract;

  private readonly signer: ethers.Signer;
  private readonly provider: ethers.Provider;

  constructor(
    provider: ethers.Provider,
    signer: ethers.Signer,
    addresses: ContractAddresses,
  ) {
    this.provider = provider;
    this.signer = signer;

    this.predictionMarket = new ethers.Contract(
      addresses.predictionMarket,
      PREDICTION_MARKET_ABI,
      signer,
    );
    this.trustScorer = new ethers.Contract(
      addresses.trustScorer,
      TRUST_SCORER_ABI,
      signer,
    );
    this.agentRegistry = new ethers.Contract(
      addresses.agentRegistry,
      AGENT_REGISTRY_ABI,
      signer,
    );
    this.usdc = new ethers.Contract(
      addresses.mockUsdc,
      ERC20_ABI,
      signer,
    );
  }

  // --- Agent Registry ---

  async registerAgent(erc8004Uri: string): Promise<ethers.TransactionResponse> {
    console.log('[CONTRACTS] Registering agent with ERC-8004 URI:', erc8004Uri);
    const tx = await this.agentRegistry.registerAgent(erc8004Uri);
    console.log('[CONTRACTS] Registration tx:', tx.hash);
    return tx;
  }

  async isAgentRegistered(agent: string): Promise<boolean> {
    return this.agentRegistry.isRegistered(agent);
  }

  async getAgentInfo(agent: string): Promise<{
    wallet: string;
    erc8004Uri: string;
    registeredAt: bigint;
    active: boolean;
  }> {
    const result = await this.agentRegistry.getAgent(agent);
    return {
      wallet: result.wallet,
      erc8004Uri: result.erc8004Uri,
      registeredAt: result.registeredAt,
      active: result.active,
    };
  }

  // --- Predictions ---

  async createPrediction(
    hash: string,
    stake: bigint,
    expiresAt: number,
  ): Promise<ethers.TransactionResponse> {
    console.log('[CONTRACTS] Creating prediction, stake:', ethers.formatUnits(stake, 6), 'USDC');

    // Approve USDC spend first and wait for confirmation
    const marketAddr = await this.predictionMarket.getAddress();
    const approveTx = await this.usdc.approve(marketAddr, stake);
    await approveTx.wait(1);
    console.log('[CONTRACTS] USDC approved');

    // Small delay to let nonce propagate on public RPC
    await new Promise(r => setTimeout(r, 2000));

    const tx = await this.predictionMarket.createPrediction(hash, stake, expiresAt);
    console.log('[CONTRACTS] Prediction tx:', tx.hash);
    return tx;
  }

  async getPredictionCount(): Promise<number> {
    const count = await this.predictionMarket.predictionCount();
    return Number(count);
  }

  async getPredictionOnChain(predictionId: number): Promise<{
    agent: string;
    predictionHash: string;
    stakeAmount: bigint;
    expiresAt: number;
    insurancePool: bigint;
    premiumsCollected: bigint;
    status: number;
    stakeClaimed: boolean;
  }> {
    const result = await this.predictionMarket.predictions(predictionId);
    return {
      agent: result.agent,
      predictionHash: result.predictionHash,
      stakeAmount: result.stakeAmount,
      expiresAt: Number(result.expiresAt),
      insurancePool: result.insurancePool,
      premiumsCollected: result.premiumsCollected,
      status: Number(result.status),
      stakeClaimed: result.stakeClaimed,
    };
  }

  // --- Insurance ---

  async buyInsurance(
    predictionId: number,
    amount: bigint,
  ): Promise<ethers.TransactionResponse> {
    console.log(
      '[CONTRACTS] Buying insurance for prediction',
      predictionId,
      'amount:',
      ethers.formatUnits(amount, 6),
      'USDC',
    );

    // Approve USDC spend and wait for confirmation
    const marketAddr = await this.predictionMarket.getAddress();
    const approveTx = await this.usdc.approve(marketAddr, amount);
    await approveTx.wait(1);
    await new Promise(r => setTimeout(r, 2000));

    const tx = await this.predictionMarket.buyInsurance(predictionId, amount);
    console.log('[CONTRACTS] Insurance tx:', tx.hash);
    return tx;
  }

  async getInsurancePosition(predictionId: number, insurer: string): Promise<{
    amount: bigint;
    premiumPaid: bigint;
    claimed: boolean;
  }> {
    const result = await this.predictionMarket.insurancePositions(predictionId, insurer);
    return {
      amount: result.amount,
      premiumPaid: result.premiumPaid,
      claimed: result.claimed,
    };
  }

  // --- Resolution ---

  async resolvePrediction(
    predictionId: number,
    correct: boolean,
  ): Promise<ethers.TransactionResponse> {
    console.log('[CONTRACTS] Resolving prediction', predictionId, 'correct:', correct);
    const tx = await this.predictionMarket.resolvePrediction(predictionId, correct);
    console.log('[CONTRACTS] Resolution tx:', tx.hash);
    return tx;
  }

  async claimStake(predictionId: number): Promise<ethers.TransactionResponse> {
    console.log('[CONTRACTS] Claiming stake for prediction', predictionId);
    const tx = await this.predictionMarket.claimStake(predictionId);
    console.log('[CONTRACTS] Claim stake tx:', tx.hash);
    return tx;
  }

  async claimInsurance(predictionId: number): Promise<ethers.TransactionResponse> {
    console.log('[CONTRACTS] Claiming insurance for prediction', predictionId);
    const tx = await this.predictionMarket.claimInsurance(predictionId);
    console.log('[CONTRACTS] Claim insurance tx:', tx.hash);
    return tx;
  }

  // --- Trust Score ---

  async getTrustScore(agent: string): Promise<number> {
    const score = await this.trustScorer.getTrustScore(agent);
    return Number(score);
  }

  async getTrustScoreDetails(agent: string): Promise<{
    totalPredictions: number;
    correctPredictions: number;
    totalStaked: bigint;
    totalInsurancePaid: bigint;
    lastUpdated: number;
  }> {
    const result = await this.trustScorer.scores(agent);
    return {
      totalPredictions: Number(result.totalPredictions),
      correctPredictions: Number(result.correctPredictions),
      totalStaked: result.totalStaked,
      totalInsurancePaid: result.totalInsurancePaid,
      lastUpdated: Number(result.lastUpdated),
    };
  }

  async hasValidTrustScore(agent: string): Promise<boolean> {
    return this.trustScorer.hasValidScore(agent);
  }

  // --- Utilities ---

  async getUsdcBalance(address: string): Promise<bigint> {
    return this.usdc.balanceOf(address);
  }

  async getSignerAddress(): Promise<string> {
    return this.signer.getAddress();
  }

  getProvider(): ethers.Provider {
    return this.provider;
  }
}
