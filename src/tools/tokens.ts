import { SUPPORTED_CHAINS } from "../constants/contracts.js";
import { CHAIN_TOKENS, resolveToken, TokenInfo } from "../constants/tokens.js";

export function getSupportedChains() {
  return Object.values(SUPPORTED_CHAINS).map((chain) => ({
    chainId: chain.chainId,
    name: chain.name,
    vm: chain.vm,
    routerAddress: chain.routerAddress || null,
    feeManagerAddress: chain.feeManagerAddress || null,
    wrappedNative: chain.wrappedNative,
    nativeCurrency: chain.nativeCurrency,
    explorerUrl: chain.explorerUrl,
    feePolicy: "0.00% protocol fee on quoted amount (Surplus Capture)",
  }));
}

export function getTokensForChain(chainId: number, search?: string) {
  const tokens = CHAIN_TOKENS[chainId] || [];
  if (!search) {
    return tokens;
  }
  const query = search.trim().toLowerCase();
  return tokens.filter(
    (t) => t.symbol.toLowerCase().includes(query) || t.name.toLowerCase().includes(query) || t.address.toLowerCase() === query
  );
}
