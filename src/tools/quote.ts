import { createPublicClient, encodeFunctionData, formatUnits, http, type PublicClient } from "viem";
import { arbitrum, base } from "viem/chains";
import {
  ChainConfig,
  QUOTER_V2_ABI,
  SUPPORTED_CHAINS,
  SWAPROUTER02_ABI,
  V2_ROUTER_ABI,
  V3_ROUTER_V1_ABI,
} from "../constants/contracts.js";
import { ZERO_ADDRESS, resolveToken } from "../constants/tokens.js";

export interface QuoteParams {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string; // human format (e.g. "0.5") or atomic units
  slippageToleranceBps?: number;
  recipient?: string;
}

const JUPITER_API_BASE = process.env.JUPITER_API_KEY
  ? "https://api.jup.ag/swap/v1"
  : "https://lite-api.jup.ag/swap/v1";

const V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

export function createEvmPublicClient(chain: ChainConfig): PublicClient {
  let viemChain: any = base;
  if (chain.chainId === 8217) {
    viemChain = {
      id: 8217,
      name: "Kaia Mainnet",
      nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
      rpcUrls: { default: { http: [chain.rpcUrl] } },
    };
  } else if (chain.chainId === 42161) {
    viemChain = arbitrum;
  }

  return createPublicClient({
    chain: viemChain,
    transport: http(chain.rpcUrl),
  }) as PublicClient;
}

function parseAtomicAmount(amountStr: string, decimals: number): string {
  const trimmed = amountStr.trim();
  if (trimmed.includes(".")) {
    const [whole, dec = ""] = trimmed.split(".");
    const paddedDec = (dec + "0".repeat(decimals)).slice(0, decimals);
    const atomic = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedDec || "0");
    return atomic.toString();
  }
  // Treat small integers (<= 100,000) as human amounts when token has >= 6 decimals
  if (BigInt(trimmed) <= 100_000n && decimals >= 6) {
    return (BigInt(trimmed) * 10n ** BigInt(decimals)).toString();
  }
  return trimmed;
}

function encodeV3StepCalldata(
  chain: ChainConfig,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  fee: number,
  amountIn: bigint,
  deadline: bigint
): `0x${string}` {
  const dex = chain.dex!;
  const router = chain.routerAddress!;
  if (dex.v3Style === "swapRouterV1") {
    return encodeFunctionData({
      abi: V3_ROUTER_V1_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee,
          recipient: router,
          deadline,
          amountIn,
          amountOutMinimum: 0n,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
  }
  return encodeFunctionData({
    abi: SWAPROUTER02_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee,
        recipient: router,
        amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
}

function encodeV2StepCalldata(
  chain: ChainConfig,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
  deadline: bigint
): `0x${string}` {
  return encodeFunctionData({
    abi: V2_ROUTER_ABI,
    functionName: "swapExactTokensForTokens",
    args: [amountIn, 0n, [tokenIn, tokenOut], chain.routerAddress!, deadline],
  });
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
    const outDecimals = tokenOutInfo?.decimals ?? 6;
    const rawAmount = parseAtomicAmount(params.amountIn, inDecimals);

    const headers: Record<string, string> = {};
    if (process.env.JUPITER_API_KEY) {
      headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    const queryUrl = `${JUPITER_API_BASE}/quote?inputMint=${inputTokenAddress}&outputMint=${outputTokenAddress}&amount=${rawAmount}&slippageBps=${slippageToleranceBps}`;
    const res = await fetch(queryUrl, { headers });
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
        decimals: inDecimals,
      },
      tokenOut: {
        address: outputTokenAddress,
        symbol: tokenOutInfo?.symbol || "SPL",
        decimals: outDecimals,
      },
      amountIn: String(rawAmount),
      formattedAmountIn: formatUnits(BigInt(rawAmount), inDecimals),
      quotedExpectedOutput: String(data.outAmount),
      formattedExpectedOutput: formatUnits(BigInt(data.outAmount), outDecimals),
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

  // 2. Live On-Chain EVM Quoting (Kaia, Base, Arbitrum)
  if (!chain.dex || !chain.routerAddress) {
    throw new Error(`DEX quoter configuration unavailable for chain ${chainId}`);
  }

  const inDecimals = tokenInInfo?.decimals ?? 18;
  const outDecimals = tokenOutInfo?.decimals ?? 18;
  const atomicAmountIn = BigInt(parseAtomicAmount(params.amountIn, inDecimals));

  const isNativeIn =
    tokenInInfo?.isNative === true ||
    inputTokenAddress.toLowerCase() === ZERO_ADDRESS ||
    params.tokenIn.trim().toLowerCase() === "native";
  const isNativeOut =
    tokenOutInfo?.isNative === true ||
    outputTokenAddress.toLowerCase() === ZERO_ADDRESS ||
    params.tokenOut.trim().toLowerCase() === "native";

  const poolTokenIn = (isNativeIn ? chain.wrappedNative : inputTokenAddress) as `0x${string}`;
  const poolTokenOut = (isNativeOut ? chain.wrappedNative : outputTokenAddress) as `0x${string}`;

  if (poolTokenIn.toLowerCase() === poolTokenOut.toLowerCase()) {
    throw new Error("Input and output tokens cannot be the same asset");
  }

  const client = createEvmPublicClient(chain);
  const dex = chain.dex;

  const quoteV3Tier = async (fee: number, amt: bigint) => {
    try {
      const res = await client.readContract({
        address: dex.quoterV3,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: poolTokenIn,
            tokenOut: poolTokenOut,
            amountIn: amt,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const out = (res as readonly [bigint, bigint, number, bigint])[0];
      if (out <= 0n) return null;
      return {
        dex: `${dex.v3DexName} (${fee / 10000}%)`,
        protocol: "v3" as const,
        feeTier: fee,
        amountOut: out,
      };
    } catch {
      return null;
    }
  };

  const quoteV2 = async (amt: bigint) => {
    try {
      const amounts = (await client.readContract({
        address: dex.v2Router,
        abi: V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amt, [poolTokenIn, poolTokenOut]],
      })) as readonly bigint[];
      const out = amounts[amounts.length - 1];
      if (!out || out <= 0n) return null;
      return {
        dex: dex.v2DexName,
        protocol: "v2" as const,
        feeTier: undefined,
        amountOut: out,
      };
    } catch {
      return null;
    }
  };

  const rawResults = await Promise.all([
    ...V3_FEE_TIERS.map((fee) => quoteV3Tier(fee, atomicAmountIn)),
    quoteV2(atomicAmountIn),
  ]);

  const candidates = rawResults
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => (b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0));

  if (candidates.length === 0) {
    throw new Error(
      `No on-chain liquidity found on ${chain.name} for ${tokenInInfo?.symbol || poolTokenIn} -> ${tokenOutInfo?.symbol || poolTokenOut}`
    );
  }

  const bestSingle = candidates[0];
  const bestV3 = candidates.find((c) => c.protocol === "v3");
  const bestV2 = candidates.find((c) => c.protocol === "v2");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

  let estimatedOutput = bestSingle.amountOut;
  let isSplitRoute = false;
  let bestDex = bestSingle.dex;
  let routes = [
    {
      shareBps: 10000,
      label: `100% ${bestSingle.dex}`,
      expectedOutput: bestSingle.amountOut.toString(),
      steps: [
        {
          protocol: 2, // ProtocolType.CUSTOM -> audited DEX router via ZipZapRouter
          pool: bestSingle.protocol === "v3" ? dex.v3Router : dex.v2Router,
          tokenIn: poolTokenIn,
          tokenOut: poolTokenOut,
          data:
            bestSingle.protocol === "v3"
              ? encodeV3StepCalldata(chain, poolTokenIn, poolTokenOut, bestSingle.feeTier!, atomicAmountIn, deadline)
              : encodeV2StepCalldata(chain, poolTokenIn, poolTokenOut, atomicAmountIn, deadline),
        },
      ],
    },
  ];

  // Test 60/40 split between best V3 and V2 pools
  if (bestV3 && bestV2 && atomicAmountIn >= 10000n) {
    const amtV3 = (atomicAmountIn * 6000n) / 10000n;
    const amtV2 = atomicAmountIn - amtV3;
    const [splitV3, splitV2] = await Promise.all([
      quoteV3Tier(bestV3.feeTier!, amtV3),
      quoteV2(amtV2),
    ]);
    if (splitV3 && splitV2 && splitV3.amountOut + splitV2.amountOut > estimatedOutput) {
      estimatedOutput = splitV3.amountOut + splitV2.amountOut;
      isSplitRoute = true;
      bestDex = `Split: 60% ${bestV3.dex} + 40% ${bestV2.dex}`;
      routes = [
        {
          shareBps: 6000,
          label: `60% ${bestV3.dex}`,
          expectedOutput: splitV3.amountOut.toString(),
          steps: [
            {
              protocol: 2,
              pool: dex.v3Router,
              tokenIn: poolTokenIn,
              tokenOut: poolTokenOut,
              data: encodeV3StepCalldata(chain, poolTokenIn, poolTokenOut, bestV3.feeTier!, amtV3, deadline),
            },
          ],
        },
        {
          shareBps: 4000,
          label: `40% ${bestV2.dex}`,
          expectedOutput: splitV2.amountOut.toString(),
          steps: [
            {
              protocol: 2,
              pool: dex.v2Router,
              tokenIn: poolTokenIn,
              tokenOut: poolTokenOut,
              data: encodeV2StepCalldata(chain, poolTokenIn, poolTokenOut, amtV2, deadline),
            },
          ],
        },
      ];
    }
  }

  let minOutput = (estimatedOutput * BigInt(10000 - slippageToleranceBps)) / 10000n;
  if (minOutput === 0n && estimatedOutput > 0n) minOutput = 1n;

  return {
    success: true,
    chainId,
    chainName: chain.name,
    vm: "evm",
    source: "on-chain-rpc",
    routerAddress: chain.routerAddress,
    bestDex,
    isSplitRoute,
    tokenIn: {
      address: isNativeIn ? ZERO_ADDRESS : poolTokenIn,
      symbol: tokenInInfo?.symbol || (isNativeIn ? chain.nativeCurrency.symbol : "ERC20"),
      decimals: inDecimals,
      isNative: isNativeIn,
    },
    tokenOut: {
      address: isNativeOut ? ZERO_ADDRESS : poolTokenOut,
      symbol: tokenOutInfo?.symbol || (isNativeOut ? chain.nativeCurrency.symbol : "ERC20"),
      decimals: outDecimals,
      isNative: isNativeOut,
    },
    amountIn: atomicAmountIn.toString(),
    formattedAmountIn: formatUnits(atomicAmountIn, inDecimals),
    quotedExpectedOutput: estimatedOutput.toString(),
    formattedExpectedOutput: formatUnits(estimatedOutput, outDecimals),
    minOutputAmount: minOutput.toString(),
    formattedMinOutput: formatUnits(minOutput, outDecimals),
    slippageToleranceBps,
    recipient: recipient || ZERO_ADDRESS,
    candidates: candidates.map((c) => ({
      dex: c.dex,
      protocol: c.protocol,
      feeTier: c.feeTier,
      amountOut: c.amountOut.toString(),
      formattedOut: formatUnits(c.amountOut, outDecimals),
    })),
    routes,
    feePolicy: {
      platformFeeOnQuote: "0.00%",
      surplusCapture: "100% of positive slippage (actual output - quoted output) retained as protocol fee",
    },
  };
}

export async function planCrossChainSwap(params: {
  sourceChainId: number;
  destinationChainId: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  fromAddress?: string;
}) {
  const { sourceChainId, destinationChainId, tokenIn, tokenOut, amountIn } = params;
  const srcChain = SUPPORTED_CHAINS[sourceChainId];
  const dstChain = SUPPORTED_CHAINS[destinationChainId];

  if (!srcChain || !dstChain) {
    throw new Error(`Unsupported cross-chain route: ${sourceChainId} -> ${destinationChainId}`);
  }

  const tokenInInfo = resolveToken(sourceChainId, tokenIn);
  const tokenOutInfo = resolveToken(destinationChainId, tokenOut);
  const fromTokenAddr = tokenInInfo?.address || tokenIn;
  const toTokenAddr = tokenOutInfo?.address || tokenOut;
  const fromDecimals = tokenInInfo?.decimals ?? (srcChain.vm === "solana" ? 9 : 18);
  const toDecimals = tokenOutInfo?.decimals ?? (dstChain.vm === "solana" ? 9 : 18);
  const rawAmount = parseAtomicAmount(amountIn, fromDecimals);

  // Attempt live cross-chain route via LI.FI (Across / Stargate / CCTP)
  try {
    const query = new URLSearchParams({
      fromChain: String(sourceChainId),
      toChain: String(destinationChainId),
      fromToken: fromTokenAddr,
      toToken: toTokenAddr,
      fromAmount: rawAmount,
      fromAddress: params.fromAddress || "0x6Bc5569f6cfa6c6F947B72a39818f8CE5900158F",
    });

    const res = await fetch(`https://li.quest/v1/quote?${query.toString()}`);
    const data: any = await res.json();

    if (res.ok && data?.estimate) {
      const toAmount = String(data.estimate.toAmount);
      const toAmountMin = String(data.estimate.toAmountMin || toAmount);
      return {
        success: true,
        liveQuote: true,
        sourceChain: { chainId: sourceChainId, name: srcChain.name },
        destinationChain: { chainId: destinationChainId, name: dstChain.name },
        tokenIn: { address: fromTokenAddr, symbol: tokenInInfo?.symbol || tokenIn, decimals: fromDecimals },
        tokenOut: { address: toTokenAddr, symbol: tokenOutInfo?.symbol || tokenOut, decimals: toDecimals },
        amountIn: rawAmount,
        estimatedOutput: toAmount,
        formattedEstimatedOutput: formatUnits(BigInt(toAmount), toDecimals),
        minOutputAmount: toAmountMin,
        bridgeProvider: data.toolDetails?.name || data.tool || "Across / Stargate",
        estimatedDurationSeconds: data.estimate.executionDuration ?? 30,
        approvalAddress: data.estimate.approvalAddress,
        transactionRequest: data.transactionRequest || null,
        feePolicy: "0.00% ZipZap protocol fee",
      };
    }
  } catch {
    // Fall back to architectural plan if bridge aggregator is unreachable
  }

  return {
    success: true,
    liveQuote: false,
    sourceChain: { chainId: sourceChainId, name: srcChain.name },
    destinationChain: { chainId: destinationChainId, name: dstChain.name },
    tokenIn: { address: fromTokenAddr, symbol: tokenInInfo?.symbol || tokenIn },
    tokenOut: { address: toTokenAddr, symbol: tokenOutInfo?.symbol || tokenOut },
    amountIn: rawAmount,
    bridgeProvider: "Across / Stargate Bridge Adapter",
    hops: [
      { step: 1, action: "Swap input token to bridge collateral (USDC/WETH) on source chain" },
      { step: 2, action: "Relay bridge intent across chains" },
      { step: 3, action: "Deliver output token to user on destination chain via ZipZapCrossChainReceiver" },
    ],
    estimatedDurationSeconds: 60,
    feePolicy: "0.00% ZipZap protocol fee",
  };
}
