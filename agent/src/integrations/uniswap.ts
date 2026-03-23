/**
 * Uniswap V3 Swap Integration for Cortex Underwriter
 *
 * Demonstrates DeFi composability by swapping collected premiums (USDC) to WETH
 * via the Uniswap V3 SwapRouter02 exactInputSingle function.
 *
 * --- Deployment Notes ---
 *
 * Uniswap V3 is NOT officially deployed on Base Sepolia testnet.
 * This module operates in MOCK mode on Base Sepolia (chain 84532) and logs
 * the full swap intent with parameters that would execute on Base mainnet.
 *
 * Base Mainnet addresses (chain 8453):
 *   SwapRouter02:  0x2626664c2603336E57B271c5C0b26F421741e481
 *   USDC:          0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *   WETH:          0x4200000000000000000000000000000000000006
 *   Factory:       0x33128a8fC17869897dcE68Ed026d694621f6FDfD
 *
 * To go live on Base mainnet, set UNISWAP_LIVE=true and deploy with a
 * mainnet RPC + funded wallet.
 */

import { ethers } from 'ethers';

// --- Constants ---

const SWAP_ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
];

const ERC20_APPROVE_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
];

/** Known Uniswap V3 SwapRouter02 addresses by chain ID */
const ROUTER_BY_CHAIN: Record<number, string> = {
  8453: '0x2626664c2603336E57B271c5C0b26F421741e481',  // Base mainnet
  1: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',      // Ethereum mainnet
  42161: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',  // Arbitrum One
};

/** Known WETH addresses by chain ID */
const WETH_BY_CHAIN: Record<number, string> = {
  8453: '0x4200000000000000000000000000000000000006',    // Base mainnet
  84532: '0x4200000000000000000000000000000000000006',   // Base Sepolia
  1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',     // Ethereum mainnet
};

/** Default fee tier: 0.3% (3000) -- most common for major pairs */
const DEFAULT_FEE_TIER = 3000;

// --- Types ---

export interface SwapResult {
  success: boolean;
  mock: boolean;
  txHash: string | null;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountInFormatted: string;
  amountOut: string | null;
  feeTier: number;
  recipient: string;
  chainId: number;
  timestamp: number;
  mainnetPath: string;
}

export interface SwapConfig {
  routerAddress?: string;
  wethAddress?: string;
  feeTier?: number;
  slippageBps?: number; // basis points, e.g. 50 = 0.5%
  forceLive?: boolean;
}

// --- UniswapSwapper ---

export class UniswapSwapper {
  private router: ethers.Contract;
  private signer: ethers.Signer;
  private routerAddress: string;
  private feeTier: number;
  private slippageBps: number;
  private isLive: boolean;
  private chainId: number | null = null;
  private wethAddress: string;

  constructor(
    routerAddress: string,
    signer: ethers.Signer,
    swapConfig: SwapConfig = {},
  ) {
    this.routerAddress = routerAddress;
    this.signer = signer;
    this.router = new ethers.Contract(routerAddress, SWAP_ROUTER_ABI, signer);
    this.feeTier = swapConfig.feeTier ?? DEFAULT_FEE_TIER;
    this.slippageBps = swapConfig.slippageBps ?? 50; // 0.5% default
    this.wethAddress = swapConfig.wethAddress ?? ethers.ZeroAddress;

    // Determine if we run live swaps or mock
    // Live only if explicitly enabled AND router exists on-chain
    this.isLive = swapConfig.forceLive ?? (process.env.UNISWAP_LIVE === 'true');
  }

  /** Resolve chain ID from the signer's provider (cached after first call) */
  private async getChainId(): Promise<number> {
    if (this.chainId !== null) return this.chainId;
    const provider = this.signer.provider;
    if (!provider) {
      this.chainId = 0;
      return 0;
    }
    const network = await provider.getNetwork();
    this.chainId = Number(network.chainId);
    return this.chainId;
  }

  /** Resolve WETH address for current chain */
  private async resolveWethAddress(overrideWeth?: string): Promise<string> {
    if (overrideWeth && overrideWeth !== ethers.ZeroAddress) return overrideWeth;
    if (this.wethAddress !== ethers.ZeroAddress) return this.wethAddress;
    const chainId = await this.getChainId();
    const weth = WETH_BY_CHAIN[chainId];
    if (!weth) {
      throw new Error(`No known WETH address for chain ${chainId}`);
    }
    return weth;
  }

  /** Check whether the router contract exists at the target address */
  private async routerExists(): Promise<boolean> {
    const provider = this.signer.provider;
    if (!provider) return false;
    try {
      const code = await provider.getCode(this.routerAddress);
      return code !== '0x' && code !== '0x0';
    } catch {
      return false;
    }
  }

  /**
   * Swap USDC to WETH via Uniswap V3 exactInputSingle.
   *
   * On chains without a Uniswap deployment (e.g. Base Sepolia), this runs
   * in mock mode: it logs the full swap intent and returns a simulated result
   * that documents exactly what the mainnet transaction would look like.
   */
  async swapUSDCToWETH(
    amountIn: bigint,
    usdcAddress: string,
    wethAddressOverride?: string,
  ): Promise<SwapResult> {
    const chainId = await this.getChainId();
    const wethAddress = await this.resolveWethAddress(wethAddressOverride);
    const recipient = await this.signer.getAddress();

    const mainnetPath = [
      'Base Mainnet Swap Path (chain 8453):',
      `  1. Approve SwapRouter02 (0x2626664c2603336E57B271c5C0b26F421741e481) to spend ${ethers.formatUnits(amountIn, 6)} USDC`,
      `  2. Call exactInputSingle({`,
      `       tokenIn:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 (USDC)`,
      `       tokenOut: 0x4200000000000000000000000000000000000006 (WETH)`,
      `       fee:      ${this.feeTier} (${this.feeTier / 10000}%)`,
      `       recipient: ${recipient}`,
      `       amountIn: ${amountIn.toString()} (${ethers.formatUnits(amountIn, 6)} USDC)`,
      `       amountOutMinimum: 0 (set via oracle price - slippage in production)`,
      `       sqrtPriceLimitX96: 0`,
      `     })`,
      `  3. Receive WETH at ${recipient}`,
    ].join('\n');

    // Determine if we should execute live
    const hasRouter = this.isLive && (await this.routerExists());

    if (!hasRouter) {
      // --- MOCK MODE ---
      console.log('[UNISWAP] Mock swap mode (Uniswap V3 not available on chain %d)', chainId);
      console.log('[UNISWAP] Swap intent:');
      console.log('[UNISWAP]   tokenIn:   %s (USDC)', usdcAddress);
      console.log('[UNISWAP]   tokenOut:  %s (WETH)', wethAddress);
      console.log('[UNISWAP]   amountIn:  %s USDC', ethers.formatUnits(amountIn, 6));
      console.log('[UNISWAP]   fee tier:  %d (%s%%)', this.feeTier, (this.feeTier / 10000).toFixed(2));
      console.log('[UNISWAP]   recipient: %s', recipient);
      console.log('[UNISWAP]   slippage:  %d bps (%s%%)', this.slippageBps, (this.slippageBps / 100).toFixed(2));
      console.log('[UNISWAP] Mainnet path documented below:');
      console.log(mainnetPath);

      // Generate a deterministic mock tx hash from the swap params
      const mockHash = ethers.keccak256(
        ethers.toUtf8Bytes(`mock-swap-${usdcAddress}-${wethAddress}-${amountIn}-${Date.now()}`),
      );

      return {
        success: true,
        mock: true,
        txHash: mockHash,
        tokenIn: usdcAddress,
        tokenOut: wethAddress,
        amountIn: amountIn.toString(),
        amountInFormatted: ethers.formatUnits(amountIn, 6),
        amountOut: null,
        feeTier: this.feeTier,
        recipient,
        chainId,
        timestamp: Math.floor(Date.now() / 1000),
        mainnetPath,
      };
    }

    // --- LIVE MODE ---
    console.log('[UNISWAP] Executing LIVE swap on chain %d', chainId);

    try {
      // Step 1: Approve router to spend USDC
      const usdcContract = new ethers.Contract(usdcAddress, ERC20_APPROVE_ABI, this.signer);
      const currentAllowance = await usdcContract.allowance(recipient, this.routerAddress);

      if (currentAllowance < amountIn) {
        console.log('[UNISWAP] Approving router to spend %s USDC...', ethers.formatUnits(amountIn, 6));
        const approveTx = await usdcContract.approve(this.routerAddress, amountIn);
        await approveTx.wait();
        console.log('[UNISWAP] Approval confirmed');
      }

      // Step 2: Execute swap
      const swapParams = {
        tokenIn: usdcAddress,
        tokenOut: wethAddress,
        fee: this.feeTier,
        recipient,
        amountIn,
        amountOutMinimum: 0n, // In production, compute from oracle price - slippage
        sqrtPriceLimitX96: 0n,
      };

      console.log('[UNISWAP] Sending swap tx...');
      const tx = await this.router.exactInputSingle(swapParams);
      const receipt = await tx.wait();
      console.log('[UNISWAP] Swap confirmed in tx %s', tx.hash);

      return {
        success: true,
        mock: false,
        txHash: tx.hash,
        tokenIn: usdcAddress,
        tokenOut: wethAddress,
        amountIn: amountIn.toString(),
        amountInFormatted: ethers.formatUnits(amountIn, 6),
        amountOut: receipt ? receipt.logs?.[0]?.data ?? null : null,
        feeTier: this.feeTier,
        recipient,
        chainId,
        timestamp: Math.floor(Date.now() / 1000),
        mainnetPath,
      };
    } catch (err) {
      console.error('[UNISWAP] Swap failed:', err);
      return {
        success: false,
        mock: false,
        txHash: null,
        tokenIn: usdcAddress,
        tokenOut: wethAddress,
        amountIn: amountIn.toString(),
        amountInFormatted: ethers.formatUnits(amountIn, 6),
        amountOut: null,
        feeTier: this.feeTier,
        recipient,
        chainId,
        timestamp: Math.floor(Date.now() / 1000),
        mainnetPath,
      };
    }
  }
}

/**
 * Factory: create a UniswapSwapper from a signer, auto-detecting the best
 * router address for the connected chain.
 */
export async function createUniswapSwapper(
  signer: ethers.Signer,
  config: SwapConfig = {},
): Promise<UniswapSwapper> {
  let routerAddress = config.routerAddress;

  if (!routerAddress) {
    const provider = signer.provider;
    if (provider) {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      routerAddress = ROUTER_BY_CHAIN[chainId];
      if (!routerAddress) {
        // Use Base mainnet address as reference (mock mode will handle it)
        console.log('[UNISWAP] No known router for chain %d, using Base mainnet address as reference', chainId);
        routerAddress = ROUTER_BY_CHAIN[8453];
      }
    } else {
      routerAddress = ROUTER_BY_CHAIN[8453];
    }
  }

  return new UniswapSwapper(routerAddress!, signer, config);
}
