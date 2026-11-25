export interface ChainConfig {
  chainId: number;
  name: string;
  vm: "evm" | "solana";
  routerAddress?: `0x${string}`;
  feeManagerAddress?: `0x${string}`;
  wrappedNative: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrl: string;
  explorerUrl: string;
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // Kaia Mainnet
  8217: {
    chainId: 8217,
    name: "Kaia Mainnet",
    vm: "evm",
    routerAddress: "0x49d20E59Aa31Ba04F1FA6CD9a374A2d01A4228C6",
    feeManagerAddress: "0x18D834334DEd9292d15603d8dbA44c7a89F8eda5",
    wrappedNative: "0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432",
    nativeCurrency: { name: "Kaia", symbol: "KAIA", decimals: 18 },
    rpcUrl: "https://public-en.node.kaia.io",
    explorerUrl: "https://kaiascan.io",
  },
  // Base Mainnet
  8453: {
    chainId: 8453,
    name: "Base Mainnet",
    vm: "evm",
    routerAddress: "0x6A59007DB02466Bb421c5F1C7A9B6bd33ffC1Ad7",
    feeManagerAddress: "0x8D381d45B801A338C4229174ad9B00081b61e9F6",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
  },
  // Arbitrum One
  42161: {
    chainId: 42161,
    name: "Arbitrum One",
    vm: "evm",
    routerAddress: "0x34608F078dfa55bdc87592a970f6B259C8712aE7",
    feeManagerAddress: "0x5A3222FAFcD4704957Ed33Aa6E5372A205Ae0713",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
  },
  // Solana Mainnet
  101: {
    chainId: 101,
    name: "Solana Mainnet",
    vm: "solana",
    wrappedNative: "So11111111111111111111111111111111111111112",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    rpcUrl: "https://api.mainnet-beta.solana.com",
    explorerUrl: "https://solscan.io",
  },
};

export const ZIPZAP_ROUTER_ABI = [
  {
    type: "function",
    name: "swap",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minOutputAmount", type: "uint256" },
          { name: "quotedExpectedOutput", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          {
            name: "routes",
            type: "tuple[]",
            components: [
              { name: "shareBps", type: "uint256" },
              {
                name: "steps",
                type: "tuple[]",
                components: [
                  { name: "protocol", type: "uint8" },
                  { name: "pool", type: "address" },
                  { name: "tokenIn", type: "address" },
                  { name: "tokenOut", type: "address" },
                  { name: "data", type: "bytes" },
                ],
              },
            ],
          },
        ],
      },
    ],
    outputs: [
      { name: "finalUserOutput", type: "uint256" },
      { name: "feeCharged", type: "uint256" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
