import { decodeEventLog, formatEther, isAddress, isHex } from "viem";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { SUPPORTED_CHAINS, ZIPZAP_ROUTER_ABI } from "../constants/contracts.js";
import { createEvmPublicClient } from "./quote.js";

/**
 * Dry-run a built EVM or Solana swap transaction before signing/broadcasting.
 */
export async function simulateSwapTransaction(params: {
  chainId: number;
  from?: string;
  to?: string;
  data?: string;
  value?: string;
  serializedSolanaTx?: string;
}) {
  const chain = SUPPORTED_CHAINS[params.chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${params.chainId}`);
  }

  // Solana simulation
  if (chain.vm === "solana") {
    if (!params.serializedSolanaTx) {
      throw new Error("Missing 'serializedSolanaTx' (base64 VersionedTransaction) for Solana simulation.");
    }
    const connection = new Connection(chain.rpcUrl, "confirmed");
    const txBuf = Buffer.from(params.serializedSolanaTx, "base64");
    const tx = VersionedTransaction.deserialize(txBuf);
    const sim = await connection.simulateTransaction(tx, { sigVerify: false });

    return {
      success: sim.value.err === null,
      vm: "solana",
      chainId: 101,
      error: sim.value.err,
      unitsConsumed: sim.value.unitsConsumed ?? null,
      logs: (sim.value.logs || []).slice(-15),
    };
  }

  // EVM simulation via eth_call + estimateGas
  if (!params.from || !isAddress(params.from)) {
    throw new Error("Valid EVM 'from' address is required for simulation.");
  }
  if (!params.to || !isAddress(params.to)) {
    throw new Error("Valid EVM 'to' router address is required for simulation.");
  }
  if (!params.data || !isHex(params.data)) {
    throw new Error("Valid hex 'data' calldata is required for simulation.");
  }

  const client = createEvmPublicClient(chain);
  const txValue = params.value ? BigInt(params.value) : 0n;

  try {
    const [callResult, gasEstimate, gasPrice] = await Promise.all([
      client.call({
        account: params.from as `0x${string}`,
        to: params.to as `0x${string}`,
        data: params.data as `0x${string}`,
        value: txValue,
      }),
      client.estimateGas({
        account: params.from as `0x${string}`,
        to: params.to as `0x${string}`,
        data: params.data as `0x${string}`,
        value: txValue,
      }),
      client.getGasPrice().catch(() => 0n),
    ]);

    const estimatedGasCostWei = gasEstimate * gasPrice;

    return {
      success: true,
      vm: "evm",
      chainId: chain.chainId,
      chainName: chain.name,
      willRevert: false,
      returnData: callResult.data || "0x",
      gasEstimate: gasEstimate.toString(),
      gasPriceWei: gasPrice.toString(),
      estimatedGasCostNative: formatEther(estimatedGasCostWei),
      nativeSymbol: chain.nativeCurrency.symbol,
    };
  } catch (err: any) {
    return {
      success: false,
      vm: "evm",
      chainId: chain.chainId,
      chainName: chain.name,
      willRevert: true,
      revertReason: err?.shortMessage || err?.message || "Execution reverted",
      hint: "Ensure the wallet has sufficient token/native balance and ERC-20 approval to ZipZapRouter before executing.",
    };
  }
}

/**
 * Inspect transaction confirmation status and decode ZipZap SwapExecuted logs.
 */
export async function getTransactionStatus(params: {
  chainId: number;
  txHash: string;
}) {
  const chain = SUPPORTED_CHAINS[params.chainId];
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${params.chainId}`);
  }

  // Solana status
  if (chain.vm === "solana") {
    const connection = new Connection(chain.rpcUrl, "confirmed");
    const statusRes = await connection.getSignatureStatuses([params.txHash], {
      searchTransactionHistory: true,
    });
    const status = statusRes.value[0];

    if (!status) {
      return {
        found: false,
        vm: "solana",
        chainId: 101,
        txHash: params.txHash,
        status: "not_found_or_pending",
        explorerUrl: `${chain.explorerUrl}/tx/${params.txHash}`,
      };
    }

    return {
      found: true,
      vm: "solana",
      chainId: 101,
      txHash: params.txHash,
      status: status.err ? "failed" : status.confirmationStatus || "confirmed",
      slot: status.slot,
      confirmations: status.confirmations,
      error: status.err,
      explorerUrl: `${chain.explorerUrl}/tx/${params.txHash}`,
    };
  }

  // EVM status + SwapExecuted decoding
  if (!isHex(params.txHash)) {
    throw new Error(`Invalid EVM transaction hash: ${params.txHash}`);
  }

  const client = createEvmPublicClient(chain);
  try {
    const receipt = await client.getTransactionReceipt({
      hash: params.txHash as `0x${string}`,
    });

    let swapEvent: Record<string, any> | null = null;
    for (const log of receipt.logs) {
      if (chain.routerAddress && log.address.toLowerCase() === chain.routerAddress.toLowerCase()) {
        try {
          const decoded: any = decodeEventLog({
            abi: ZIPZAP_ROUTER_ABI,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "SwapExecuted") {
            swapEvent = {
              sender: decoded.args.sender,
              recipient: decoded.args.recipient,
              tokenIn: decoded.args.tokenIn,
              tokenOut: decoded.args.tokenOut,
              amountIn: decoded.args.amountIn.toString(),
              finalUserOutput: decoded.args.finalUserOutput.toString(),
              feeCharged: decoded.args.feeCharged.toString(),
              isSurplus: decoded.args.isSurplus,
            };
            break;
          }
        } catch {
          // Not SwapExecuted
        }
      }
    }

    return {
      found: true,
      vm: "evm",
      chainId: chain.chainId,
      chainName: chain.name,
      txHash: params.txHash,
      status: receipt.status,
      blockNumber: receipt.blockNumber.toString(),
      gasUsed: receipt.gasUsed.toString(),
      swapExecuted: swapEvent,
      explorerUrl: `${chain.explorerUrl}/tx/${params.txHash}`,
    };
  } catch {
    return {
      found: false,
      vm: "evm",
      chainId: chain.chainId,
      chainName: chain.name,
      txHash: params.txHash,
      status: "pending_or_not_found",
      explorerUrl: `${chain.explorerUrl}/tx/${params.txHash}`,
    };
  }
}
