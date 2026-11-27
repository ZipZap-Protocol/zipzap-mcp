import { createPublicClient, http, formatUnits, isAddress } from "viem";
import { base, arbitrum } from "viem/chains";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SUPPORTED_CHAINS, ERC20_ABI } from "../constants/contracts.js";
import { CHAIN_TOKENS, resolveToken } from "../constants/tokens.js";

// Viem clients for EVM chains
function getEvmClient(chainId: number) {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config || config.vm !== "evm") {
    throw new Error(`Unsupported EVM chain: ${chainId}`);
  }

  let viemChain: any = base;
  if (chainId === 8217) {
    viemChain = {
      id: 8217,
      name: "Kaia Mainnet",
      nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    };
  } else if (chainId === 42161) {
    viemChain = arbitrum;
  }

  return createPublicClient({
    chain: viemChain,
    transport: http(config.rpcUrl),
  });
}

export async function getWalletBalances(params: {
  chainId: number;
  walletAddress: string;
  tokenAddresses?: string[];
}) {
  const { chainId, walletAddress, tokenAddresses } = params;
  const chain = SUPPORTED_CHAINS[chainId];
  if (!chain) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  // Solana Balance Check
  if (chain.vm === "solana") {
    try {
      const connection = new Connection(chain.rpcUrl, "confirmed");
      const pubkey = new PublicKey(walletAddress);
      const lamports = await connection.getBalance(pubkey);

      const balances: Array<{ symbol: string; address: string; balance: string; decimals: number }> = [
        {
          symbol: "SOL",
          address: chain.wrappedNative,
          balance: (lamports / LAMPORTS_PER_SOL).toString(),
          decimals: 9,
        },
      ];

      // Query classic SPL and Token-2022 accounts
      const splPrograms = [
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"),
      ];

      for (const programId of splPrograms) {
        try {
          const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
            programId,
          });

          for (const account of tokenAccounts.value) {
            const parsedInfo = account.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const tokenAmount = parsedInfo.tokenAmount;
            const knownToken = resolveToken(chainId, mint);

            if (Number(tokenAmount.uiAmount || 0) > 0) {
              balances.push({
                symbol: knownToken?.symbol || "SPL",
                address: mint,
                balance: tokenAmount.uiAmountString,
                decimals: tokenAmount.decimals,
              });
            }
          }
        } catch {
          // Continue if one program query fails
        }
      }

      return { chainId, walletAddress, balances };
    } catch (err: any) {
      throw new Error(`Failed to query Solana balance: ${err.message}`);
    }
  }

  // EVM Balance Check
  if (!isAddress(walletAddress)) {
    throw new Error(`Invalid EVM address: ${walletAddress}`);
  }

  const client = getEvmClient(chainId);
  const nativeBalance = await client.getBalance({ address: walletAddress as `0x${string}` });

  const balances: Array<{ symbol: string; address: string; balance: string; decimals: number }> = [
    {
      symbol: chain.nativeCurrency.symbol,
      address: "0x0000000000000000000000000000000000000000",
      balance: formatUnits(nativeBalance, chain.nativeCurrency.decimals),
      decimals: chain.nativeCurrency.decimals,
    },
  ];

  // Tokens to inspect
  const tokensToCheck = tokenAddresses
    ? tokenAddresses.map((addr) => resolveToken(chainId, addr) || { address: addr, symbol: "ERC20", decimals: 18, name: "Token" })
    : CHAIN_TOKENS[chainId] || [];

  for (const token of tokensToCheck) {
    if (!isAddress(token.address) || token.address === "0x0000000000000000000000000000000000000000") continue;
    try {
      const balance = await client.readContract({
        address: token.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [walletAddress as `0x${string}`],
      });

      balances.push({
        symbol: token.symbol,
        address: token.address,
        balance: formatUnits(balance, token.decimals),
        decimals: token.decimals,
      });
    } catch {
      // Ignore failures on individual token balance reads
    }
  }

  return { chainId, walletAddress, balances };
}
