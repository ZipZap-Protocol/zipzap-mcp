# ZipZap MCP Server ⚡

> **Zero-Hosting Model Context Protocol (MCP)** server for the **ZipZap DEX Aggregator** across **Kaia, Base, Arbitrum, and Solana**.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-1.6.0-emerald.svg)](https://modelcontextprotocol.io)
[![Zero VPS](https://img.shields.io/badge/Hosting-Zero%20VPS%20Needed-brightgreen.svg)](#-zero-hosting-architecture)
[![Protocol Fee](https://img.shields.io/badge/Protocol%20Fee-0.00%25%20(Surplus%20Capture)-blue.svg)](#-fee-economics)

---

## 🚀 Overview

ZipZap MCP allows **any AI agent** (Claude Desktop, Cursor, Antigravity, Eliza/ai16z, LangChain, AutoGPT) to discover routes, check balances, get split swap quotes, and build execution calldata for ZipZap's on-chain contracts **without ever visiting the frontend**.

- **Zero-Hosting Architecture:** Runs via stdio JSON-RPC locally on the agent's machine (`npx zipzap-mcp`). You do **not** need a VPS or cloud server.
- **Direct RPC Connectivity:** Connects directly to decentralized public RPCs (Kaia, Base, Arbitrum, Solana).
- **0.00% Platform Fee on Quoted Amount:** Surplus-capture fee economics ensure agents receive 100% of the quoted target return.

---

## 🛠️ Quick Setup for AI Agents

### 1. Claude Desktop
Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zipzap": {
      "command": "npx",
      "args": ["-y", "zipzap-mcp"]
    }
  }
}
```

### 2. Cursor / Windsurf
Add a new MCP server in Settings:
- **Name:** `zipzap`
- **Type:** `command`
- **Command:** `npx -y zipzap-mcp`

### 3. Local Run / Direct Execution
```bash
git clone https://github.com/your-username/zipzap-mcp.git
cd zipzap-mcp
npm install
npm run build
npm start
```

---

## 📋 Available MCP Tools

| Tool | Description |
| :--- | :--- |
| `zipzap_get_chains` | List all supported chains (Kaia, Base, Arbitrum, Solana), router addresses, and RPCs. |
| `zipzap_get_tokens` | List verified tokens, symbols, decimals, and contract addresses for a chain. |
| `zipzap_get_wallet_balance` | Check native and ERC20 / SPL token balances for any target wallet via public RPCs. |
| `zipzap_get_quote` | Fetch optimal multi-DEX split routes and quoted return with 0.00% upfront fee. |
| `zipzap_build_swap_tx` | Construct unsigned calldata for `ZipZapRouter.sol` or serialized Solana transaction. |
| `zipzap_crosschain_quote` | Plan multi-hop cross-chain bridge + DEX routing between supported networks. |

---

## ⛓️ Smart Contracts Registry

| Network | Chain ID | ZipZapRouter | Wrapped Native | Explorer |
| :--- | :---: | :--- | :--- | :--- |
| **Kaia Mainnet** | `8217` | `0x49d20E59Aa31Ba04F1FA6CD9a374A2d01A4228C6` | `0x19Aac5f612f524B754CA7e7c41cbFa2E981A4432` | [Kaiascan](https://kaiascan.io) |
| **Base Mainnet** | `8453` | `0x6A59007DB02466Bb421c5F1C7A9B6bd33ffC1Ad7` | `0x4200000000000000000000000000000000000006` | [Basescan](https://basescan.org) |
| **Arbitrum One** | `42161` | `0x34608F078dfa55bdc87592a970f6B259C8712aE7` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | [Arbiscan](https://arbiscan.io) |
| **Solana Mainnet** | `101` | Atomic Multi-DEX Engine | `So11111111111111111111111111111111111111112` | [Solscan](https://solscan.io) |

---

## 🤖 Direct Agent Prompts & Reference

- **Agent Instruction Guide:** [`instructions.md`](./instructions.md)
- **Machine-Readable LLM Specifications:** [`llms.txt`](./llms.txt)
- **Static GitHub Pages Site:** [`docs/index.html`](./docs/index.html)

---

## 📄 License
MIT License
