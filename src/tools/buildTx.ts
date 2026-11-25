import { encodeFunctionData, isAddress } from "viem";
import { SUPPORTED_CHAINS, ZIPZAP_ROUTER_ABI, ERC20_ABI } from "../constants/contracts.js";
import { resolveToken } from "../constants/tokens.js";

const JUPITER_API_BASE = "https://lite-api.jup.ag/swap/v1";

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

    const swapRes = await fetch(`${JUPITER_API_BASE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  const tokenInInfo = resolveToken(chainId, params.tokenIn);
  const tokenOutInfo = resolveToken(chainId, params.tokenOut);

  const tokenInAddr = (tokenInInfo?.address || params.tokenIn) as `0x${string}`;
  const tokenOutAddr = (tokenOutInfo?.address || params.tokenOut) as `0x${string}`;
  const recipientAddr = (params.recipient || userAddress) as `0x${string}`;

  const isNativeIn =
    tokenInAddr === "0x0000000000000000000000000000000000000000" ||
    tokenInAddr.toLowerCase() === chain.wrappedNative.toLowerCase();

  const deadline = BigInt(
    Math.floor(Date.now() / 1000) + (params.deadlineSeconds || 1200) // 20 mins default
  );

  const atomicAmountIn = BigInt(params.amountIn);
  const quotedExpectedOutput = BigInt(params.quotedExpectedOutput || params.amountIn);
  const minOutputAmount = BigInt(
    params.minOutputAmount || (quotedExpectedOutput * 9950n) / 10000n
  );

  const routes = params.routes && params.routes.length > 0
    ? params.routes.map((r) => ({
        shareBps: BigInt(r.shareBps || 10000),
        steps: (r.steps || []).map((s: any) => ({
          protocol: Number(s.protocol ?? 1),
          pool: (s.pool || "0x0000000000000000000000000000000000000001") as `0x${string}`,
          tokenIn: (s.tokenIn || tokenInAddr) as `0x${string}`,
          tokenOut: (s.tokenOut || tokenOutAddr) as `0x${string}`,
          data: (s.data || "0x") as `0x${string}`,
        })),
      }))
    : [
        {
          shareBps: 10000n,
          steps: [
            {
              protocol: 1, // V3
              pool: "0x0000000000000000000000000000000000000001" as `0x${string}`,
              tokenIn: tokenInAddr,
              tokenOut: tokenOutAddr,
              data: "0x0001f4" as `0x${string}`,
            },
          ],
        },
      ];

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

  // Build approval tx if ERC-20
  let approvalTx = null;
  if (!isNativeIn) {
    const approvalData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [chain.routerAddress, atomicAmountIn],
    });

    approvalTx = {
      to: tokenInAddr,
      data: approvalData,
      value: "0x0",
      description: `Approve ZipZapRouter (${chain.routerAddress}) to spend ${tokenInInfo?.symbol || "tokens"}`,
    };
  }

  return {
    success: true,
    vm: "evm",
    chainId,
    chainName: chain.name,
    routerAddress: chain.routerAddress,
    transaction: {
      to: chain.routerAddress,
      data: calldata,
      value: isNativeIn ? `0x${atomicAmountIn.toString(16)}` : "0x0",
      chainId,
    },
    approvalRequired: !isNativeIn,
    approvalTransaction: approvalTx,
    summary: {
      swap: `Swap ${params.amountIn} of ${tokenInInfo?.symbol || tokenInAddr} for min ${minOutputAmount.toString()} of ${tokenOutInfo?.symbol || tokenOutAddr}`,
      feeModel: "0.00% protocol fee upfront. Surplus capture fee on positive slippage.",
    },
  };
}
