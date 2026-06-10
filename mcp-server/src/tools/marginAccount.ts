import { Transaction } from '@mysten/sui/transactions';
import { executeTransaction } from '../utils/tx-executor.js';
import { config } from '../config.js';
import type { AppState } from '../client.js';

// Common handler signature for all margin account tools
export type MarginAccountHandler = (
  args: Record<string, unknown>,
  state: AppState
) => Promise<{ content: { type: string; text: string }[] }>;

// Margin manager key per SDK configuration
const MARGIN_KEY = 'MARGIN_1';

function requireMarginManager(toolName: string): void {
  if (!config.marginManagerAddress) {
    throw new Error(`${toolName} requires MARGIN_MANAGER_ADDRESS to be configured.`);
  }
}

// Tool 1: deposit_margin
async function depositMarginHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireMarginManager('deposit_margin');
    if (!state.keypair) {
      throw new Error('deposit_margin requires signing mode (SUI_PRIVATE_KEY configured).');
    }

    const coin_type = args.coin_type as string;
    const amount = args.amount as number;
    const mm = (state.client.deepbook as any).marginManager;

    if (coin_type !== 'SUI' && coin_type !== 'USDC') {
      throw new Error(`Invalid coin_type: '${coin_type}'. Must be SUI or USDC.`);
    }

    const tx = new Transaction();
    if (coin_type === 'SUI') {
      tx.add(mm.depositBase(MARGIN_KEY, amount));
    } else {
      tx.add(mm.depositQuote(MARGIN_KEY, amount));
    }

    const result = await executeTransaction(tx, state);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, tx_digest: result.tx_digest, coin_type, amount }, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(`deposit_margin failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 2: withdraw_margin
async function withdrawMarginHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireMarginManager('withdraw_margin');
    if (!state.keypair) {
      throw new Error('withdraw_margin requires signing mode (SUI_PRIVATE_KEY configured).');
    }

    const coin_type = args.coin_type as string;
    const amount = args.amount as number;
    const mm = (state.client.deepbook as any).marginManager;

    if (coin_type !== 'SUI' && coin_type !== 'USDC') {
      throw new Error(`Invalid coin_type: '${coin_type}'. Must be SUI or USDC.`);
    }

    const tx = new Transaction();
    if (coin_type === 'SUI') {
      tx.add(mm.withdrawBase(MARGIN_KEY, amount));
    } else {
      tx.add(mm.withdrawQuote(MARGIN_KEY, amount));
    }

    const result = await executeTransaction(tx, state);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ success: true, tx_digest: result.tx_digest, coin_type, amount }, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(`withdraw_margin failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 3: get_margin_balances
async function getMarginBalancesHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireMarginManager('get_margin_balances');

    const result = await (state.client.deepbook as any).getMarginManagerState(MARGIN_KEY);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(`get_margin_balances failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool 4: get_margin_orders
async function getMarginOrdersHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireMarginManager('get_margin_orders');

    const ids = await (state.client.deepbook as any).getConditionalOrderIds(MARGIN_KEY);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ conditional_order_ids: ids }, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(`get_margin_orders failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool definitions
export const marginAccountTools = [
  {
    name: 'deposit_margin',
    description: 'Deposit SUI or USDC collateral into the MarginManager.',
    inputSchema: {
      type: 'object',
      properties: {
        coin_type: {
          type: 'string',
          description: 'Coin to deposit — SUI or USDC',
          enum: ['SUI', 'USDC'],
        },
        amount: {
          type: 'number',
          description: 'Amount to deposit in human-readable units (e.g. 1.5 for 1.5 SUI)',
        },
      },
      required: ['coin_type', 'amount'],
    },
  },
  {
    name: 'withdraw_margin',
    description: 'Withdraw SUI or USDC collateral from the MarginManager. Subject to on-chain risk ratio limits.',
    inputSchema: {
      type: 'object',
      properties: {
        coin_type: {
          type: 'string',
          description: 'Coin to withdraw — SUI or USDC',
          enum: ['SUI', 'USDC'],
        },
        amount: {
          type: 'number',
          description: 'Amount to withdraw in human-readable units',
        },
      },
      required: ['coin_type', 'amount'],
    },
  },
  {
    name: 'get_margin_balances',
    description: 'Query MarginManager state — deposited assets, outstanding debts, and current risk ratio.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_margin_orders',
    description: 'Query conditional order IDs currently registered on the MarginManager.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Handler mapping
export const marginAccountHandlers: Record<string, MarginAccountHandler> = {
  deposit_margin: depositMarginHandler,
  withdraw_margin: withdrawMarginHandler,
  get_margin_balances: getMarginBalancesHandler,
  get_margin_orders: getMarginOrdersHandler,
};
