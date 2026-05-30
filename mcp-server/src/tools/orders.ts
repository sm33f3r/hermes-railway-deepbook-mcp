/**
 * DeepBook order placement tools.
 * Place limit and market orders on Sui mainnet.
 */

import { Transaction } from '@mysten/sui/transactions';
import { OrderType } from '@mysten/deepbook-v3';
import { executeTransaction } from '../utils/tx-executor.js';
import { checkRateLimit, isDryRun } from '../utils/risk-guard.js';
import { config } from '../config.js';
import type { AppState } from '../client.js';

// Handler signature
export type OrderHandler = (
  args: Record<string, unknown>,
  state: AppState
) => Promise<{ content: { type: string; text: string }[] }>;

// Manager key is always 'MANAGER_1' per SDK configuration
const MANAGER_KEY = 'MANAGER_1';

// Order type mapping
const ORDER_TYPE_MAP: Record<string, OrderType> = {
  NO_RESTRICTION: OrderType.NO_RESTRICTION,
  IMMEDIATE_OR_CANCEL: OrderType.IMMEDIATE_OR_CANCEL,
  FILL_OR_KILL: OrderType.FILL_OR_KILL,
  POST_ONLY: OrderType.POST_ONLY,
};

/**
 * Shared prerequisite checks for all order tools
 */
async function performPrerequisiteChecks(state: AppState): Promise<void> {
  if (!config.balanceManagerAddress) {
    throw new Error('Account tools require BALANCE_MANAGER_ADDRESS to be configured.');
  }
  if (!state.keypair) {
    throw new Error('Cannot place order: MCP server is in read-only mode.');
  }
  checkRateLimit();
}

/**
 * Format dry run response
 */
function createDryRunResponse(params: Record<string, unknown>): { content: { type: string; text: string }[] } {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        dry_run: true,
        tx_digest: 'DRY_RUN',
        ...params,
      }, null, 2)
    }]
  };
}

// Tool 1: place_limit_order handler
async function placeLimitOrderHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract and validate required parameters
    const pool = args.pool as string;
    const price = parseFloat(args.price as string);
    const quantity = parseFloat(args.quantity as string);
    const is_bid = args.is_bid as boolean;
    const client_order_id = Date.now();

    // Extract optional parameters with defaults
    const order_type = (args.order_type as string) || 'NO_RESTRICTION';
    const pay_with_deep = args.pay_with_deep !== undefined ? (args.pay_with_deep as boolean) : true;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({
        pool,
        price,
        quantity,
        is_bid,
        order_type,
        client_order_id,
        pay_with_deep,
      });
    }

    // Build transaction
    const tx = new Transaction();
    // SDK returns (tx) => void — call it directly on the tx builder
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.placeLimitOrder({
      poolKey: pool,
      balanceManagerKey: MANAGER_KEY,
      clientOrderId: client_order_id,
      price,
      quantity,
      isBid: is_bid,
      orderType: ORDER_TYPE_MAP[order_type],
      payWithDeep: pay_with_deep,
    })(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      price,
      quantity,
      is_bid,
      order_type,
      client_order_id,
      pay_with_deep,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`place_limit_order failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 2: place_market_order handler
async function placeMarketOrderHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract and validate required parameters
    const pool = args.pool as string;
    const quantity = parseFloat(args.quantity as string);
    const is_bid = args.is_bid as boolean;

    // Extract optional parameters with defaults
    const pay_with_deep = args.pay_with_deep !== undefined ? (args.pay_with_deep as boolean) : true;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({
        pool,
        quantity,
        is_bid,
        pay_with_deep,
      });
    }

    // Generate client order ID
    const clientOrderId = Date.now();

    // Build transaction
    const tx = new Transaction();
    // SDK returns (tx) => void — call it directly on the tx builder
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.placeMarketOrder({
      poolKey: pool,
      balanceManagerKey: MANAGER_KEY,
      clientOrderId,
      quantity,
      isBid: is_bid,
      payWithDeep: pay_with_deep,
    })(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      quantity,
      is_bid,
      pay_with_deep,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`place_market_order failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 3: cancel_order handler
async function cancelOrderHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract parameters
    const pool = args.pool as string;
    const order_id = args.order_id as number;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({ pool, order_id });
    }

    // Build transaction
    const tx = new Transaction();
    // SDK returns (tx) => void — call it directly on the tx builder
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.cancelOrder(pool, MANAGER_KEY, order_id)(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      order_id,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`cancel_order failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 4: cancel_all_orders handler
async function cancelAllOrdersHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract parameters
    const pool = args.pool as string;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({ pool });
    }

    // Build transaction
    const tx = new Transaction();
    // SDK returns (tx) => void — call it directly on the tx builder
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.cancelAllOrders(pool, MANAGER_KEY)(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`cancel_all_orders failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 5: modify_order handler
async function modifyOrderHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract parameters
    const pool = args.pool as string;
    const order_id = args.order_id as number;
    const new_quantity = args.new_quantity as number;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({ pool, order_id, new_quantity });
    }

    // Build transaction
    const tx = new Transaction();
    // SDK takes positional args and returns (tx) => void
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.modifyOrder(pool, MANAGER_KEY, order_id, new_quantity)(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      order_id,
      new_quantity,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`modify_order failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 6: withdraw_settled_amounts handler
async function withdrawSettledAmountsHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    // Prerequisite checks
    await performPrerequisiteChecks(state);

    // Extract parameters
    const pool = args.pool as string;

    // Dry run check
    if (isDryRun()) {
      return createDryRunResponse({ pool });
    }

    // Build transaction
    const tx = new Transaction();
    // SDK takes positional args and returns (tx) => void
    const dbContract = state.client.deepbook.deepBook as any;
    dbContract.withdrawSettledAmounts(pool, MANAGER_KEY)(tx);

    // Execute transaction
    const result = await executeTransaction(tx, state);

    // Return success response
    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      dry_run: false,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  } catch (err) {
    throw new Error(`withdraw_settled_amounts failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool definitions
export const orderTools = [
  {
    name: 'place_limit_order',
    description: 'Place a GTC limit order on a DeepBook pool.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        price: {
          type: 'number',
          description: 'Limit price for the order',
        },
        quantity: {
          type: 'number',
          description: 'Order quantity in base asset units',
        },
        is_bid: {
          type: 'boolean',
          description: 'true for bid (buy), false for ask (sell)',
        },
        order_type: {
          type: 'string',
          description: 'Order type: NO_RESTRICTION, IMMEDIATE_OR_CANCEL, FILL_OR_KILL, POST_ONLY',
          enum: ['NO_RESTRICTION', 'IMMEDIATE_OR_CANCEL', 'FILL_OR_KILL', 'POST_ONLY'],
          default: 'NO_RESTRICTION',
        },
        pay_with_deep: {
          type: 'boolean',
          description: 'Pay taker fees with DEEP tokens (true) or base/quote assets (false)',
          default: true,
        },
      },
      required: ['pool', 'price', 'quantity', 'is_bid'],
    },
  },
  {
    name: 'place_market_order',
    description: 'Place a market order on a DeepBook pool. Taker fees apply.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        quantity: {
          type: 'number',
          description: 'Order quantity in base asset units',
        },
        is_bid: {
          type: 'boolean',
          description: 'true for bid (buy), false for ask (sell)',
        },
        pay_with_deep: {
          type: 'boolean',
          description: 'Pay taker fees with DEEP tokens (true) or base/quote assets (false)',
          default: true,
        },
      },
      required: ['pool', 'quantity', 'is_bid'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel a single open order on a DeepBook pool.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        order_id: {
          type: 'number',
          description: 'Protocol order ID to cancel',
        },
      },
      required: ['pool', 'order_id'],
    },
  },
  {
    name: 'cancel_all_orders',
    description: 'Cancel all open orders in a DeepBook pool.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
      },
      required: ['pool'],
    },
  },
  {
    name: 'modify_order',
    description: 'Reduce the quantity of an open limit order. Cannot increase quantity — only reductions are permitted by the protocol.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
        order_id: {
          type: 'number',
          description: 'Protocol order ID to modify',
        },
        new_quantity: {
          type: 'number',
          description: 'New quantity — must be less than the current order quantity',
        },
      },
      required: ['pool', 'order_id', 'new_quantity'],
    },
  },
  {
    name: 'withdraw_settled_amounts',
    description: 'Claim any settled base, quote, or DEEP amounts from a DeepBook pool back into the BalanceManager.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key, e.g. SUI_USDC or DEEP_USDC',
        },
      },
      required: ['pool'],
    },
  },
];

// Handler mapping
export const orderHandlers: Record<string, OrderHandler> = {
  place_limit_order: placeLimitOrderHandler,
  place_market_order: placeMarketOrderHandler,
  cancel_order: cancelOrderHandler,
  cancel_all_orders: cancelAllOrdersHandler,
  modify_order: modifyOrderHandler,
  withdraw_settled_amounts: withdrawSettledAmountsHandler,};