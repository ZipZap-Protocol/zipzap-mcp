# ZipZap AI Agent Instruction Manual

## 1. Protocol Overview
ZipZap is an institutional-grade decentralized exchange aggregator and multi-hop routing protocol across EVM (Kaia, Base, Arbitrum) and Solana (SVM).

- **Protocol Fee on Quoted Amount:** `0.00%` (Zero front-end aggregator tax).
- **Fee Model:** Surplus Capture. ZipZap charges nothing from quoted output. 100% of positive slippage (actual execution output > quoted expected output) is routed to the fee manager.
- **AI Agent Friendly:** All operations can be performed non-custodially without loading a browser or frontend web application.

---

## 2. Supported Networks & Deployed Contracts

| Network | Chain ID | VM | ZipZapRouter | Canonical Wrapped Native | Default Public RPC |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Kaia Mainnet** | `8217` | EVM | `0x49d20E59Aa31Ba04F1FA6CD9a374A2d01A4228C6` | `0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432` (WKAIA) | `https://public-en.node.kaia.io` |
| **Base Mainnet** | `8453` | EVM | `0x6A59007DB02466Bb421c5F1C7A9B6bd33ffC1Ad7` | `0x4200000000000000000000000000000000000006` (WETH) | `https://mainnet.base.org` |
| **Arbitrum One** | `42161` | EVM | `0x34608F078dfa55bdc87592a970f6B259C8712aE7` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` (WETH) | `https://arb1.arbitrum.io/rpc` |
| **Solana Mainnet** | `101` | SVM | Native Atomic Multi-DEX Aggregator | `So11111111111111111111111111111111111111112` (SOL) | `https://api.mainnet-beta.solana.com` |

---

## 3. Standard Execution Workflow for AI Agents

When an agent needs to execute or suggest a swap for a user:

### Step 1: Check Balances & Tokens
- Call `zipzap_get_tokens(chainId)` to resolve standard token symbols to contracts/mints.
- Call `zipzap_get_wallet_balance(chainId, walletAddress)` to ensure sufficient balance for the trade and gas.

### Step 2: Fetch Optimal Split Route Quote
- Call `zipzap_get_quote(chainId, tokenIn, tokenOut, amountIn, slippageToleranceBps)`.
- On EVM: Evaluates split shares across V2 / V3 pools.
- On Solana: Evaluates atomic routes across Raydium, Orca, Meteora, and Phoenix with zero aggregator markup.
- Check `priceImpactPct` and ensure it is acceptable (e.g. < 1.0%).

### Step 3: Build Unsigned Transaction
- Call `zipzap_build_swap_tx(...)`:
  - **EVM:** Returns `to`, `data`, `value`, and checks if an ERC20 `approval` transaction is required before `swap`.
  - **Solana:** Returns a base64 `serializedTransaction` (`VersionedTransaction`).

### Step 4: Pre-Flight Simulation & Execution
- Call `zipzap_simulate_swap(...)` to dry-run the built transaction (`eth_call` + gas estimate on EVM, `simulateTransaction` on Solana) before signing or broadcasting.
- **Autonomous Agent:** Signs the transaction using an encrypted agent keypair / session wallet and broadcasts to the network RPC.
- **Human-in-the-Loop:** Presents the exact calldata, expected output, and gas estimate to the user to sign via wallet.

### Step 5: Verify On-Chain Settlement
- Call `zipzap_get_tx_status(chainId, txHash)` to confirm execution and decode `SwapExecuted` logs (actual user output, fee charged, surplus captured).
