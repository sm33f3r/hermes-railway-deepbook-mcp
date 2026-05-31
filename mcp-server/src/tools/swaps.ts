/**
 * DeepBook swap tools.
 * Execute immediate token swaps using wallet coins directly.
 */

import { Transaction } from '@mysten/sui/transactions';
import { executeTransaction } from '../utils/tx-executor.js';
import type { AppState } from '../client.js';

// Handler signature
export type SwapHandler = (
  args: Record<string, unknown>,
  state: AppState
) => Promise<{ content: { type: string; text: string }[] }>;

// Tool 1: swap_base_for_quote handler
async function swapBaseForQuoteHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite check
    if (!state.keypair) {
      throw new Error('Cannot execute swap: MCP server is in read-only mode.');
    }

    // Extract parameters
    const pool = args.pool as string;
    const base_amount = args.base_amount as number;
    const min_quote_out = (args.min_quote_out as number) ?? 0;
    const deep_amount = (args.deep_amount as number) ?? 0;

    // Get sender address
    const senderAddress = state.keypair.toSuiAddress();

    // Build transaction
    const tx = new Transaction();
    const dbContract = state.client.deepbook.deepBook as any;
    const [baseCoinResult, quoteCoinResult, deepCoinResult] =
      dbContract.swapExactBaseForQuote({
        poolKey: pool,
        amount: base_amount,
        deepAmount: deep_amount,
        minOut: min_quote_out,
      })(tx);
    tx.transferObjects(
      [baseCoinResult, quoteCoinResult, deepCoinResult],
      senderAddress
    );

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      base_amount,
      min_quote_out,
      deep_amount,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`swap_base_for_quote failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 2: swap_quote_for_base handler
async function swapQuoteForBaseHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite check
    if (!state.keypair) {
      throw new Error('Cannot execute swap: MCP server is in read-only mode.');
    }

    // Extract parameters
    const pool = args.pool as string;
    const quote_amount = args.quote_amount as number;
    const min_base_out = (args.min_base_out as number) ?? 0;
    const deep_amount = (args.deep_amount as number) ?? 0;

    // Get sender address
    const senderAddress = state.keypair.toSuiAddress();

    // Build transaction
    const tx = new Transaction();
    const dbContract = state.client.deepbook.deepBook as any;
    const [baseCoinResult, quoteCoinResult, deepCoinResult] =
      dbContract.swapExactQuoteForBase({
        poolKey: pool,
        amount: quote_amount,
        deepAmount: deep_amount,
        minOut: min_base_out,
      })(tx);
    tx.transferObjects(
      [baseCoinResult, quoteCoinResult, deepCoinResult],
      senderAddress
    );

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      quote_amount,
      min_base_out,
      deep_amount,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`swap_quote_for_base failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool definitions
export const swapTools = [
  {
    name: 'swap_base_for_quote',
    description: 'Swap exact base asset for quote asset on a DeepBook pool. Uses wallet coins directly. DEEP fees are taken from the deepAmount parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        base_amount: {
          type: 'number',
          description: 'Exact amount of base asset to swap',
        },
        min_quote_out: {
          type: 'number',
          description: 'Minimum quote asset to receive (slippage protection). Default 0 (no protection).',
          default: 0,
        },
        deep_amount: {
          type: 'number',
          description: 'Amount of DEEP tokens to use for fees. Default 0.',
          default: 0,
        },
      },
      required: ['pool', 'base_amount'],
    },
  },
  {
    name: 'swap_quote_for_base',
    description: 'Swap exact quote asset for base asset on a DeepBook pool. Uses wallet coins directly. DEEP fees are taken from the deepAmount parameter.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        quote_amount: {
          type: 'number',
          description: 'Exact amount of quote asset to swap',
        },
        min_base_out: {
          type: 'number',
          description: 'Minimum base asset to receive (slippage protection). Default 0 (no protection).',
          default: 0,
        },
        deep_amount: {
          type: 'number',
          description: 'Amount of DEEP tokens to use for fees. Default 0.',
          default: 0,
        },
      },
      required: ['pool', 'quote_amount'],
    },
  },
];

// Handler mapping
export const swapHandlers: Record<string, SwapHandler> = {
  swap_base_for_quote: swapBaseForQuoteHandler,
  swap_quote_for_base: swapQuoteForBaseHandler,
};