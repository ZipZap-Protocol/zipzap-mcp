#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ZipZapClient, SUPPORTED_CHAINS, CHAIN_TOKENS } from "@zipzap-protocol/sdk";

const rpcUrls: Record<number, string> = {};
if (process.env.KAIA_RPC) rpcUrls[8217] = process.env.KAIA_RPC;
if (process.env.BASE_RPC) rpcUrls[8453] = process.env.BASE_RPC;
if (process.env.ARBITRUM_RPC) rpcUrls[42161] = process.env.ARBITRUM_RPC;
if (process.env.ETH_RPC) rpcUrls[1] = process.env.ETH_RPC;
if (process.env.BSC_RPC) rpcUrls[56] = process.env.BSC_RPC;
if (process.env.POLYGON_RPC) rpcUrls[137] = process.env.POLYGON_RPC;
if (process.env.OPTIMISM_RPC) rpcUrls[10] = process.env.OPTIMISM_RPC;
if (process.env.SOLANA_RPC) rpcUrls[101] = process.env.SOLANA_RPC;

const zipzap = new ZipZapClient({
  rpcUrls,
  jupiterApiKey: process.env.JUPITER_API_KEY,
});

// Initialize ZipZap MCP Server
const server = new McpServer({
  name: "@zipzap-protocol/mcp",
  version: "1.3.0",
});

// ==========================================
// 🛠️ MCP TOOLS
// ==========================================

// 1. Get Supported Chains
server.tool(
  "zipzap_get_chains",
  "Get list of all supported EVM and Solana chains, along with their verified ZipZap router contracts, DEX venues, native tokens, and RPC endpoints.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(zipzap.getChains(), null, 2) }],
  })
);

// 2. Get Tokens
server.tool(
  "zipzap_get_tokens",
  "List supported tokens, contract addresses, and decimals on a specific chain.",
  {
    chainId: z.number().describe("Chain ID (e.g. 8453 for Base, 8217 for Kaia, 42161 for Arbitrum, 101 for Solana)"),
    search: z.string().optional().describe("Optional search term (symbol, name, or address)"),
  },
  async ({ chainId, search }) => ({
    content: [{ type: "text", text: JSON.stringify(zipzap.getTokens(chainId, search), null, 2) }],
  })
);

// 3. Get Wallet Balance
server.tool(
  "zipzap_get_wallet_balance",
  "Check native currency and ERC20 / SPL / Token-2022 balances for any target wallet address via public RPCs.",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 101=Solana)"),
    walletAddress: z.string().describe("Target wallet address (0x... for EVM, base58 for Solana)"),
    tokenAddresses: z.array(z.string()).optional().describe("Optional specific token addresses to check"),
  },
  async (params) => {
    try {
      const result = await zipzap.getBalances(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error fetching wallet balances: ${err.message}` }] };
    }
  }
);

// 4. Get Swap Quote (Multi-DEX + 2-Hop + Split Routing)
server.tool(
  "zipzap_get_quote",
  "Fetch the optimal multi-DEX & multi-hop split swap quote across 8 chains & 25+ DEXs (Uniswap V2/V3, PancakeSwap V2/V3, Aerodrome, Velodrome, Camelot V2, SushiSwap, QuickSwap, BiSwap, DragonSwap V2/V3, and Solana Jupiter v1). 0.00% upfront protocol fee.",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 1=Ethereum, 56=BSC, 137=Polygon, 10=Optimism, 101=Solana)"),
    tokenIn: z.string().describe("Input token symbol or address/mint (e.g. 'ETH', 'KAIA', 'USDC', 'AERO', 'ARB', 'SOL')"),
    tokenOut: z.string().describe("Output token symbol or address/mint"),
    amountIn: z.string().describe("Amount to swap in human format (e.g. '0.1' or '100') or atomic units"),
    slippageToleranceBps: z.number().optional().default(50).describe("Slippage tolerance in basis points (50 = 0.5%)"),
    recipient: z.string().optional().describe("Recipient wallet address (defaults to sender)"),
  },
  async (params) => {
    try {
      const quote = await zipzap.getQuote(params);
      return { content: [{ type: "text", text: JSON.stringify(quote, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Quote error: ${err.message}` }] };
    }
  }
);

// 5. Build Swap Transaction
server.tool(
  "zipzap_build_swap_tx",
  "Construct unsigned executable calldata for ZipZapRouter.sol (with live ERC-20 allowance check) or a serialized Solana VersionedTransaction.",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 101=Solana)"),
    userAddress: z.string().describe("User or agent wallet address"),
    tokenIn: z.string().describe("Input token symbol or contract address"),
    tokenOut: z.string().describe("Output token symbol or contract address"),
    amountIn: z.string().describe("Input amount in atomic units (wei / lamports)"),
    minOutputAmount: z.string().optional().describe("Minimum output amount accepted (slippage guard)"),
    quotedExpectedOutput: z.string().optional().describe("Quoted target output for surplus capture calculation"),
    recipient: z.string().optional().describe("Recipient wallet address"),
    deadlineSeconds: z.number().optional().default(1200).describe("Transaction deadline in seconds (default 20 mins)"),
    routes: z.any().optional().describe("Routes returned from zipzap_get_quote"),
    rawJupiterQuote: z.any().optional().describe("rawJupiterQuote returned from zipzap_get_quote for Solana"),
  },
  async (params) => {
    try {
      const tx = await zipzap.buildSwapTx(params);
      return { content: [{ type: "text", text: JSON.stringify(tx, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Build transaction error: ${err.message}` }] };
    }
  }
);

// 6. Cross-Chain Swap Quote (4-Bridge Meta-Aggregator: Across, Relay, deBridge DLN, LI.FI)
server.tool(
  "zipzap_crosschain_quote",
  "Aggregate live cross-chain bridge quotes in parallel across Across Direct, Relay, deBridge DLN, and LI.FI (Layerswap, Stargate V2, Mayan Swift) with live fill-time ETAs, 2-way Kaia bridging, and EVM <-> Solana support.",
  {
    sourceChainId: z.number().describe("Source Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 1=Ethereum, 56=BSC, 137=Polygon, 10=Optimism, 101=Solana)"),
    destinationChainId: z.number().describe("Destination Chain ID"),
    tokenIn: z.string().describe("Input token symbol or address (e.g. 'USDC', 'ETH', 'USDt', 'SOL')"),
    tokenOut: z.string().describe("Output token symbol or address"),
    amountIn: z.string().describe("Amount to swap (human format e.g. '10' or atomic units)"),
    fromAddress: z.string().optional().describe("Optional sender wallet address for executable bridge tx"),
    toAddress: z.string().optional().describe("Optional destination recipient wallet address (e.g. Solana base58 address for EVM -> Solana)"),
    priority: z.enum(["best_return", "fastest"]).optional().default("best_return").describe("Choose 'best_return' (highest output) or 'fastest' (shortest ETA)"),
  },
  async (params) => {
    try {
      const plan = await zipzap.getCrossChainQuote(params);
      return { content: [{ type: "text", text: JSON.stringify(plan, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Cross-chain quote error: ${err.message}` }] };
    }
  }
);

// 7. Simulate Swap Transaction (Pre-flight Dry Run)
server.tool(
  "zipzap_simulate_swap",
  "Dry-run a built EVM swap transaction (eth_call + gas estimation) or Solana VersionedTransaction before signing and broadcasting.",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 101=Solana)"),
    from: z.string().optional().describe("EVM sender wallet address"),
    to: z.string().optional().describe("EVM ZipZapRouter address"),
    data: z.string().optional().describe("EVM hex calldata from zipzap_build_swap_tx"),
    value: z.string().optional().describe("EVM hex or decimal msg.value in wei"),
    serializedSolanaTx: z.string().optional().describe("Base64 serialized Solana VersionedTransaction"),
  },
  async (params) => {
    try {
      const result = await zipzap.simulateSwap(params);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Simulation error: ${err.message}` }] };
    }
  }
);

// 8. Check Transaction Status & Decode SwapExecuted
server.tool(
  "zipzap_get_tx_status",
  "Check on-chain confirmation status for an EVM or Solana swap transaction and decode ZipZapRouter SwapExecuted logs (actual output, fee charged, surplus captured).",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 101=Solana)"),
    txHash: z.string().describe("Transaction hash (0x... for EVM) or signature (base58 for Solana)"),
  },
  async (params) => {
    try {
      const status = await zipzap.getTxStatus(params);
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Transaction status error: ${err.message}` }] };
    }
  }
);

// ==========================================
// 📚 MCP RESOURCES
// ==========================================

server.resource("zipzap-contracts", "zipzap://contracts", async (uri) => ({
  contents: [{ uri: uri.href, text: JSON.stringify(SUPPORTED_CHAINS, null, 2) }],
}));

server.resource("zipzap-tokens", "zipzap://tokens", async (uri) => ({
  contents: [{ uri: uri.href, text: JSON.stringify(CHAIN_TOKENS, null, 2) }],
}));

server.resource("zipzap-fee-policy", "zipzap://fee-policy", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: `ZipZap implements a Zero-Front-End-Tax Surplus Capture Architecture:
- Upfront Platform Fee: 0.00% (No tax deducted from the quoted swap amount).
- Positive Slippage Surplus: When the executed price yields more tokens than quoted, 100% of the excess is captured by ZipZapFeeManager.sol.
- Guarantees that AI agents receive at least 100% of the quoted target amount minus user-specified slippage.`,
    },
  ],
}));

// ==========================================
// 💡 MCP PROMPTS
// ==========================================

server.prompt(
  "plan_swap",
  {
    tokenIn: z.string().describe("Input token"),
    tokenOut: z.string().describe("Output token"),
    chain: z.string().describe("Chain name (e.g. Base, Kaia, Arbitrum, Solana)"),
  },
  ({ tokenIn, tokenOut, chain }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please analyze a swap from ${tokenIn} to ${tokenOut} on ${chain} using ZipZap:
1. Call 'zipzap_get_tokens' to verify the contract/mint addresses.
2. Call 'zipzap_get_quote' to compare multi-DEX and 2-hop split routes.
3. Prepare the unsigned swap transaction with 'zipzap_build_swap_tx'.
4. Dry-run with 'zipzap_simulate_swap' before execution.`,
        },
      },
    ],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("@zipzap-protocol/mcp v1.2.0 running over stdio (JSON-RPC)");
}

main().catch((err) => {
  console.error("Fatal error starting ZipZap MCP Server:", err);
  process.exit(1);
});
