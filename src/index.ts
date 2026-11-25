#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { getSupportedChains, getTokensForChain } from "./tools/tokens.js";
import { getWalletBalances } from "./tools/balances.js";
import { getSwapQuote, planCrossChainSwap } from "./tools/quote.js";
import { buildSwapTransaction } from "./tools/buildTx.js";
import { SUPPORTED_CHAINS } from "./constants/contracts.js";
import { CHAIN_TOKENS } from "./constants/tokens.js";

// Initialize ZipZap MCP Server
const server = new McpServer({
  name: "zipzap-mcp",
  version: "1.0.0",
});

// ==========================================
// 🛠️ MCP TOOLS
// ==========================================

// 1. Get Supported Chains
server.tool(
  "zipzap_get_chains",
  "Get list of all supported EVM and Solana chains, along with their verified ZipZap router contracts, native tokens, and RPC endpoints.",
  {},
  async () => {
    const chains = getSupportedChains();
    return {
      content: [{ type: "text", text: JSON.stringify(chains, null, 2) }],
    };
  }
);

// 2. Get Tokens
server.tool(
  "zipzap_get_tokens",
  "List supported tokens, contract addresses, and decimals on a specific chain.",
  {
    chainId: z.number().describe("Chain ID (e.g. 8453 for Base, 8217 for Kaia, 42161 for Arbitrum, 101 for Solana)"),
    search: z.string().optional().describe("Optional search term (symbol, name, or address)"),
  },
  async ({ chainId, search }) => {
    const tokens = getTokensForChain(chainId, search);
    return {
      content: [{ type: "text", text: JSON.stringify(tokens, null, 2) }],
    };
  }
);

// 3. Get Wallet Balance
server.tool(
  "zipzap_get_wallet_balance",
  "Check native currency and token balances for any target wallet address on EVM or Solana via free public RPCs.",
  {
    chainId: z.number().describe("Chain ID (e.g. 8453 for Base, 8217 for Kaia, 42161 for Arbitrum, 101 for Solana)"),
    walletAddress: z.string().describe("Target wallet address (0x... for EVM, base58 for Solana)"),
    tokenAddresses: z.array(z.string()).optional().describe("Optional specific token addresses to check"),
  },
  async (params) => {
    try {
      const result = await getWalletBalances(params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Error fetching wallet balances: ${err.message}` }],
      };
    }
  }
);

// 4. Get Swap Quote
server.tool(
  "zipzap_get_quote",
  "Fetch the optimal split swap quote across DEXs on EVM (Uniswap V2/V3, DragonSwap) or Solana (Raydium, Orca Whirlpools, Meteora, Phoenix). Features 0.00% protocol fee on quoted amount.",
  {
    chainId: z.number().describe("Chain ID (8453=Base, 8217=Kaia, 42161=Arbitrum, 101=Solana)"),
    tokenIn: z.string().describe("Input token symbol or address/mint (e.g. 'USDC', 'ETH', 'SOL')"),
    tokenOut: z.string().describe("Output token symbol or address/mint"),
    amountIn: z.string().describe("Amount to swap in human format (e.g. '0.5' or '100') or atomic units"),
    slippageToleranceBps: z.number().optional().default(50).describe("Slippage tolerance in basis points (50 = 0.5%)"),
    recipient: z.string().optional().describe("Recipient wallet address (defaults to sender)"),
  },
  async (params) => {
    try {
      const quote = await getSwapQuote(params);
      return {
        content: [{ type: "text", text: JSON.stringify(quote, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Quote error: ${err.message}` }],
      };
    }
  }
);

// 5. Build Swap Transaction
server.tool(
  "zipzap_build_swap_tx",
  "Construct an unsigned EVM transaction calldata for ZipZapRouter.sol or a serialized Solana VersionedTransaction ready to be signed and broadcast by an agent or user wallet.",
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
      const tx = await buildSwapTransaction(params);
      return {
        content: [{ type: "text", text: JSON.stringify(tx, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Build transaction error: ${err.message}` }],
      };
    }
  }
);

// 6. Cross-Chain Swap Plan
server.tool(
  "zipzap_crosschain_quote",
  "Plan cross-chain multi-hop swaps across Kaia, Base, Arbitrum, and Solana with atomic routing and relayer tracking.",
  {
    sourceChainId: z.number().describe("Source Chain ID"),
    destinationChainId: z.number().describe("Destination Chain ID"),
    tokenIn: z.string().describe("Input token symbol or address"),
    tokenOut: z.string().describe("Output token symbol or address"),
    amountIn: z.string().describe("Amount to swap"),
  },
  async (params) => {
    try {
      const plan = planCrossChainSwap(params);
      return {
        content: [{ type: "text", text: JSON.stringify(plan, null, 2) }],
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: "text", text: `Cross-chain quote error: ${err.message}` }],
      };
    }
  }
);

// ==========================================
// 📚 MCP RESOURCES
// ==========================================

// Resource: Verified Contracts Registry
server.resource(
  "zipzap-contracts",
  "zipzap://contracts",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(SUPPORTED_CHAINS, null, 2),
      },
    ],
  })
);

// Resource: Verified Tokens
server.resource(
  "zipzap-tokens",
  "zipzap://tokens",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(CHAIN_TOKENS, null, 2),
      },
    ],
  })
);

// Resource: Surplus Capture Fee Economics
server.resource(
  "zipzap-fee-policy",
  "zipzap://fee-policy",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: `ZipZap implements a Zero-Front-End-Tax Surplus Capture Architecture:
- Upfront Platform Fee: 0.00% (No tax deducted from the quoted swap amount).
- Positive Slippage Surplus: When the executed price yields more tokens than quoted, 100% of the excess is captured by ZipZapFeeManager.sol.
- Guarantees that AI agents receive at least 100% of the quoted target amount minus user-specified slippage.`,
      },
    ],
  })
);

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
2. Call 'zipzap_get_quote' to check the split routes, expected return, and price impact.
3. Verify that the protocol charges 0.00% upfront aggregator tax.
4. Prepare the unsigned swap transaction with 'zipzap_build_swap_tx'.`,
        },
      },
    ],
  })
);

// Start Server over Stdio
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we do not corrupt JSON-RPC stdio
  console.error("ZipZap MCP Server running over stdio (JSON-RPC)");
}

main().catch((err) => {
  console.error("Fatal error starting ZipZap MCP Server:", err);
  process.exit(1);
});
