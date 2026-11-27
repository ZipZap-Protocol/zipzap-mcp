import { encodeFunctionData, isAddress } from "viem";
import { SUPPORTED_CHAINS, ZIPZAP_ROUTER_ABI, ERC20_ABI } from "../constants/contracts.js";
import { ZERO_ADDRESS, resolveToken } from "../constants/tokens.js";
import { createEvmPublicClient, getSwapQuote } from "./quote.js";

const JUPITER_API_BASE = process.env.JUPITER_API_KEY
  ? "https://api.jup.ag/swap/v1"
  : "https://lite-api.jup.ag/swap/v1";

export async function buildSwapTransaction(params: {
  chainId: number;
  userAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minOutputAmount?: string;
  quotedExpectedOutput?: string;
  recipient?: string;
  deadlineSeconds?: number;
  routes?: any[];
  rawJupiterQuote?: any;
}) {
  const { chainId, userAddress } = params;
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }

  // 1. Solana Mainnet (SVM)
  if (chain.vm === "solana") {
    if (!params.rawJupiterQuote) {
      throw new Error("Missing 'rawJupiterQuote' for Solana swap transaction. Call 'zipzap_get_quote' first.");
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.JUPITER_API_KEY) {
      headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    const swapRes = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        quoteResponse: params.rawJupiterQuote,
        userPublicKey: userAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
    });

    const swapData: any = await swapRes.json();
    if (!swapRes.ok || swapData.error) {
      throw new Error(`Failed to build Solana swap transaction: ${swapData.error || swapRes.statusText}`);
    }

    return {
      success: true,
      vm: "solana",
      chainId: 101,
      userPublicKey: userAddress,
      serializedTransaction: swapData.swapTransaction,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
      prioritizationFeeLamports: swapData.prioritizationFeeLamports,
      instruction: "Sign and broadcast this base64 serialized VersionedTransaction via sendRawTransaction.",
    };
  }

  // 2. EVM Chains (Kaia, Base, Arbitrum)
  if (!chain.routerAddress) {
    throw new Error(`No ZipZapRouter deployed on chain ${chainId}`);
  }
  if (!isAddress(userAddress)) {
    throw new Error(`Invalid EVM userAddress: ${userAddress}`);
  }

  const tokenInInfo = resolveToken(chainId, params.tokenIn);
  const tokenOutInfo = resolveToken(chainId, params.tokenOut);

  const isNativeIn =
    tokenInInfo?.isNative === true ||
    params.tokenIn.trim().toLowerCase() === ZERO_ADDRESS ||
    params.tokenIn.trim().toLowerCase() === "native";
  const isNativeOut =
    tokenOutInfo?.isNative === true ||
    params.tokenOut.trim().toLowerCase() === ZERO_ADDRESS ||
    params.tokenOut.trim().toLowerCase() === "native";

  const tokenInAddr = (isNativeIn ? ZERO_ADDRESS : tokenInInfo?.address || params.tokenIn) as `0x${string}`;
  const tokenOutAddr = (isNativeOut ? ZERO_ADDRESS : tokenOutInfo?.address || params.tokenOut) as `0x${string}`;
  const recipientAddr = (params.recipient || userAddress) as `0x${string}`;

  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + (params.deadlineSeconds || 1200)
  );

  // If caller did not pass routes from zipzap_get_quote, fetch a live on-chain quote automatically
  let atomicAmountIn = BigInt(params.amountIn);
  let quotedExpectedOutput = params.quotedExpectedOutput ? BigInt(params.quotedExpectedOutput) : 0n;
  let minOutputAmount = params.minOutputAmount ? BigInt(params.minOutputAmount) : 0n;
  let resolvedRoutes = params.routes;

  if (!resolvedRoutes || resolvedRoutes.length === 0 || quotedExpectedOutput === 0n) {
    const liveQuote: any = await getSwapQuote({
      chainId,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      recipient: recipientAddr,
    });
    atomicAmountIn = BigInt(liveQuote.amountIn);
    quotedExpectedOutput = params.quotedExpectedOutput
      ? BigInt(params.quotedExpectedOutput)
      : BigInt(liveQuote.quotedExpectedOutput);
    minOutputAmount = params.minOutputAmount
      ? BigInt(params.minOutputAmount)
      : BigInt(liveQuote.minOutputAmount);
    resolvedRoutes = liveQuote.routes;
  } else if (minOutputAmount === 0n) {
    minOutputAmount = (quotedExpectedOutput * 9950n) / 10000n;
    if (minOutputAmount === 0n && quotedExpectedOutput > 0n) minOutputAmount = 1n;
  }

  const routes = (resolvedRoutes || []).map((r: any) => ({
    shareBps: BigInt(r.shareBps || 10000),
    steps: (r.steps || []).map((s: any) => ({
      protocol: Number(s.protocol ?? 2),
      pool: s.pool as `0x${string}`,
      tokenIn: s.tokenIn as `0x${string}`,
      tokenOut: s.tokenOut as `0x${string}`,
      data: (s.data || "0x") as `0x${string}`,
    })),
  }));

  const calldata = encodeFunctionData({
    abi: ZIPZAP_ROUTER_ABI,
    functionName: "swap",
    args: [
      {
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        amountIn: atomicAmountIn,
        minOutputAmount,
        quotedExpectedOutput,
        recipient: recipientAddr,
        deadline,
        routes,
      },
    ],
  });

  // Live ERC-20 allowance check: only require approval when current allowance < amountIn
  let approvalRequired = false;
  let currentAllowance = "0";
  let approvalTx = null;

  if (!isNativeIn) {
    try {
      const client = createEvmPublicClient(chain);
      const allowance = (await client.readContract({
        address: tokenInAddr,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [userAddress as `0x${string}`, chain.routerAddress],
      })) as bigint;
      currentAllowance = allowance.toString();
      approvalRequired = allowance < atomicAmountIn;
    } catch {
      approvalRequired = true;
    }

    if (approvalRequired) {
      const approvalData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [chain.routerAddress, atomicAmountIn],
      });

      approvalTx = {
        to: tokenInAddr,
        data: approvalData,
        value: "0x0",
        chainId,
        description: `Approve ZipZapRouter (${chain.routerAddress}) to spend ${atomicAmountIn.toString()} of ${tokenInInfo?.symbol || tokenInAddr}`,
      };
    }
  }

  return {
    success: true,
    vm: "evm",
    chainId,
    chainName: chain.name,
    routerAddress: chain.routerAddress,
    transaction: {
      from: userAddress,
      to: chain.routerAddress,
      data: calldata,
      value: isNativeIn ? `0x${atomicAmountIn.toString(16)}` : "0x0",
      chainId,
    },
    currentAllowance,
    approvalRequired,
    approvalTransaction: approvalTx,
    summary: {
      swap: `Swap ${atomicAmountIn.toString()} of ${tokenInInfo?.symbol || tokenInAddr} for expected ${quotedExpectedOutput.toString()} (min ${minOutputAmount.toString()}) of ${tokenOutInfo?.symbol || tokenOutAddr}`,
      feeModel: "0.00% protocol fee upfront. Surplus capture fee on positive slippage.",
    },
  };
}
