export interface ChainDexConfig {
  v3Router: `0x${string}`;
  v2Router: `0x${string}`;
  quoterV3: `0x${string}`;
  v3Style: "swapRouterV1" | "swapRouter02";
  v3DexName: string;
  v2DexName: string;
}

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
  dex?: ChainDexConfig;
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
    rpcUrl: process.env.KAIA_RPC || "https://public-en.node.kaia.io",
    explorerUrl: "https://kaiascan.io",
    dex: {
      v3Router: "0xA324880f884036E3d21a09B90269E1aC57c7EC8a",
      v2Router: "0x8203cBc504CE43c3Cad07Be0e057f25B1d4DB578",
      quoterV3: "0x673d88960D320909af24db6eE7665aF223fec060",
      v3Style: "swapRouterV1",
      v3DexName: "DragonSwap V3",
      v2DexName: "DragonSwap V2",
    },
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
    rpcUrl: process.env.BASE_RPC || "https://mainnet.base.org",
    explorerUrl: "https://basescan.org",
    dex: {
      v3Router: "0x2626664c2603336E57B271c5C0b26F421741e481",
      v2Router: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24",
      quoterV3: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
      v3Style: "swapRouter02",
      v3DexName: "Uniswap V3 (Base)",
      v2DexName: "BaseSwap V2",
    },
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
    rpcUrl: process.env.ARBITRUM_RPC || "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    dex: {
      v3Router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      v2Router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
      quoterV3: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      v3Style: "swapRouter02",
      v3DexName: "Uniswap V3 (Arbitrum)",
      v2DexName: "SushiSwap V2",
    },
  },
  // Solana Mainnet
  101: {
    chainId: 101,
    name: "Solana Mainnet",
    vm: "solana",
    wrappedNative: "So11111111111111111111111111111111111111112",
    nativeCurrency: { name: "Solana", symbol: "SOL", decimals: 9 },
    rpcUrl: process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com",
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
  {
    type: "event",
    name: "SwapExecuted",
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "recipient", type: "address" },
      { indexed: false, name: "tokenIn", type: "address" },
      { indexed: false, name: "tokenOut", type: "address" },
      { indexed: false, name: "amountIn", type: "uint256" },
      { indexed: false, name: "finalUserOutput", type: "uint256" },
      { indexed: false, name: "feeCharged", type: "uint256" },
      { indexed: false, name: "isSurplus", type: "bool" },
    ],
  },
] as const;

export const QUOTER_V2_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const V2_ROUTER_ABI = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

export const V3_ROUTER_V1_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

export const SWAPROUTER02_ABI = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
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
