export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative?: boolean;
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const CHAIN_TOKENS: Record<number, TokenInfo[]> = {
  // Kaia Mainnet (8217)
  8217: [
    { address: ZERO_ADDRESS, symbol: "KAIA", name: "Kaia Native", decimals: 18, isNative: true },
    { address: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432", symbol: "WKAIA", name: "Wrapped KAIA", decimals: 18 },
    { address: "0x5C13E303a62Fc5DEdf5B52D66873f2E59fEdADC2", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0x754288077D0ab68af294d1739504ea46e21b539e", symbol: "USDC", name: "USD Coin", decimals: 6 },
  ],
  // Base Mainnet (8453)
  8453: [
    { address: ZERO_ADDRESS, symbol: "ETH", name: "Ether Native", decimals: 18, isNative: true },
    { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", symbol: "AERO", name: "Aerodrome", decimals: 18 },
  ],
  // Arbitrum One (42161)
  42161: [
    { address: ZERO_ADDRESS, symbol: "ETH", name: "Ether Native", decimals: 18, isNative: true },
    { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", symbol: "ARB", name: "Arbitrum", decimals: 18 },
  ],
  // Solana Mainnet (101)
  101: [
    { address: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana", decimals: 9, isNative: true },
    { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", name: "USD Coin", decimals: 6 },
    { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", name: "Jupiter", decimals: 6 },
    { address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", name: "Bonk", decimals: 5 },
    { address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", symbol: "WIF", name: "dogwifhat", decimals: 6 },
    { address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", symbol: "RAY", name: "Raydium", decimals: 6 },
    { address: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", symbol: "JitoSOL", name: "Jito Staked SOL", decimals: 9 },
  ],
};

export function resolveToken(chainId: number, symbolOrAddress: string): TokenInfo | undefined {
  const tokens = CHAIN_TOKENS[chainId] || [];
  const normalized = symbolOrAddress.trim().toLowerCase();
  if (normalized === "native") {
    return tokens.find((t) => t.isNative);
  }
  return tokens.find(
    (t) => t.symbol.toLowerCase() === normalized || t.address.toLowerCase() === normalized
  );
}
