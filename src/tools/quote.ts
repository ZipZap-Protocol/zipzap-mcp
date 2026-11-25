import { SUPPORTED_CHAINS } from "../constants/contracts.js";
import { CHAIN_TOKENS, resolveToken } from "../constants/tokens.js";

export interface QuoteParams {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // formatted or atomic
  slippageToleranceBps?: number;
  recipient?: string;
}

const JUPITER_API_BASE = "https://lite-api.jup.ag/swap/v1";

function parseAtomicAmount(amountStr: string, decimals: number): string {
  const trimmed = amountStr.trim();
  if (trimmed.includes(".")) {
    const [whole, dec = ""] = trimmed.split(".");
    const paddedDec = (dec + "0".repeat(decimals)).slice(0, decimals);
    const atomic = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedDec || "0");
    return atomic.toString();
  }
  // If it's a small integer like "1" or "100", treat as human amount unless it has many digits
  if (BigInt(trimmed) <= 100_000n && decimals >= 6) {
    return (BigInt(trimmed) * 10n ** BigInt(decimals)).toString();
  }
  return trimmed;
}

export async function getSwapQuote(params: QuoteParams) {
  const { chainId, slippageToleranceBps = 50, recipient } = params;
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  const tokenInInfo = resolveToken(chainId, params.tokenIn);
  const tokenOutInfo = resolveToken(chainId, params.tokenOut);

  const inputTokenAddress = tokenInInfo?.address || params.tokenIn;
  const outputTokenAddress = tokenOutInfo?.address || params.tokenOut;

  // 1. Solana Mainnet (101) — Live Jupiter Multi-DEX Aggregation
  if (chain.vm === "solana") {
    const inDecimals = tokenInInfo?.decimals ?? 9;
    const rawAmount = parseAtomicAmount(params.amountIn, inDecimals);

    const queryUrl = `${JUPITER_API_BASE}/quote?inputMint=${inputTokenAddress}&outputMint=${outputTokenAddress}&amount=${rawAmount}&slippageBps=${slippageToleranceBps}`;
    const res = await fetch(queryUrl);
    const data: any = await res.json();

    if (!res.ok || data.error) {
      throw new Error(`Solana quote failed: ${data.error || res.statusText}`);
    }

    const routePlan = Array.isArray(data.routePlan) ? data.routePlan : [];
    const dexLabels = routePlan
      .map((r: any) => r?.swapInfo?.label)
      .filter((l: unknown): l is string => typeof l === "string" && l.length > 0);

    return {
      success: true,
      chainId: 101,
      chainName: chain.name,
      vm: "solana",
      aggregator: "ZipZap Multi-DEX SVM Router",
      tokenIn: {
        address: inputTokenAddress,
        symbol: tokenInInfo?.symbol || "SPL",
        decimals: tokenInInfo?.decimals ?? 9,
      },
      tokenOut: {
        address: outputTokenAddress,
        symbol: tokenOutInfo?.symbol || "SPL",
        decimals: tokenOutInfo?.decimals ?? 6,
      },
      amountIn: String(rawAmount),
      quotedExpectedOutput: String(data.outAmount),
      minOutputAmount: String(data.otherAmountThreshold),
      priceImpactPct: data.priceImpactPct ?? "0",
      dexLabels,
      routePlan,
      rawJupiterQuote: data,
      feePolicy: {
        platformFeeBps: 0,
        description: "0.00% upfront aggregator fee on Solana swaps",
      },
    };
  }

  // 2. EVM Chains (Kaia, Base, Arbitrum)
  const inDecimals = tokenInInfo?.decimals ?? 18;
  const outDecimals = tokenOutInfo?.decimals ?? 18;
  const atomicAmountIn = BigInt(parseAtomicAmount(params.amountIn, inDecimals));

  // Default optimal split: 70% V3 Concentrated Pool + 30% V2 Pool
  const shareV3 = (atomicAmountIn * 7000n) / 10000n;
  const shareV2 = atomicAmountIn - shareV3;

  // Approximate exchange calculation
  const mockRate = 1n; // 1:1 baseline scaled to output decimals
  const scaledOutput = (atomicAmountIn * 10n ** BigInt(outDecimals)) / 10n ** BigInt(inDecimals);
  const estimatedOutput = scaledOutput > 0n ? scaledOutput : atomicAmountIn;
  const minOutput = (estimatedOutput * BigInt(10000 - slippageToleranceBps)) / 10000n;

  return {
    success: true,
    chainId,
    chainName: chain.name,
    vm: "evm",
    routerAddress: chain.routerAddress,
    tokenIn: {
      address: inputTokenAddress,
      symbol: tokenInInfo?.symbol || "TOKEN",
      decimals: inDecimals,
    },
    tokenOut: {
      address: outputTokenAddress,
      symbol: tokenOutInfo?.symbol || "TOKEN",
      decimals: outDecimals,
    },
    amountIn: atomicAmountIn.toString(),
    quotedExpectedOutput: estimatedOutput.toString(),
    minOutputAmount: minOutput.toString(),
    slippageToleranceBps,
    recipient: recipient || "0x0000000000000000000000000000000000000000",
    routes: [
      {
        shareBps: 7000,
        label: "70% Concentrated Liquidity (V3)",
        steps: [
          {
            protocol: 1, // V3
            pool: "0x0000000000000000000000000000000000000001",
            tokenIn: inputTokenAddress,
            tokenOut: outputTokenAddress,
            data: "0x0001f4", // 500 bps (0.05%)
          },
        ],
      },
      {
        shareBps: 3000,
        label: "30% Constant Product (V2)",
        steps: [
          {
            protocol: 0, // V2
            pool: "0x0000000000000000000000000000000000000002",
            tokenIn: inputTokenAddress,
            tokenOut: outputTokenAddress,
            data: "0x",
          },
        ],
      },
    ],
    feePolicy: {
      platformFeeOnQuote: "0.00%",
      surplusCapture: "100% of positive slippage (actual output - quoted output) retained as protocol fee",
    },
  };
}

export function planCrossChainSwap(params: {
  sourceChainId: number;
  destinationChainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}) {
  const { sourceChainId, destinationChainId, tokenIn, tokenOut, amountIn } = params;
  const srcChain = SUPPORTED_CHAINS[sourceChainId];
  const dstChain = SUPPORTED_CHAINS[destinationChainId];

  if (!srcChain || !dstChain) {
    throw new Error(`Unsupported cross-chain route: ${sourceChainId} -> ${destinationChainId}`);
  }

  return {
    success: true,
    sourceChain: { chainId: sourceChainId, name: srcChain.name },
    destinationChain: { chainId: destinationChainId, name: dstChain.name },
    tokenIn,
    tokenOut,
    amountIn,
    bridgeProvider: "LayerZero OFT / Stargate Bridge Adapter",
    hops: [
      { step: 1, action: "Swap input token to bridge collateral (USDC/WETH) on source chain" },
      { step: 2, action: "Lock & burn / mint across bridge messaging relay" },
      { step: 3, action: "Deliver output token to user on destination chain via ZipZapCrossChainReceiver" },
    ],
    estimatedRelayTimeMinutes: 2,
    feePolicy: "0.00% ZipZap protocol fee",
  };
}
