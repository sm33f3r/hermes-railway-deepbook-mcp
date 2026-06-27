/**
 * Cetus CLMM LP tools.
 */

import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk';
import type { AppState } from '../client.js';
import { executeTransaction } from '../utils/tx-executor.js';
import { Transaction } from '@mysten/sui/transactions';

const cetusSDK = CetusClmmSDK.createSDK({ env: 'mainnet' });

function requireKeypair(state: AppState): string {
  if (!state.keypair) {
    throw new Error('Cetus tools require a configured keypair (SUI_PRIVATE_KEY).');
  }
  const address = state.keypair.toSuiAddress();
  cetusSDK.setSenderAddress(address);
  return address;
}

export const cetusTools = [
  {
    name: 'cetus_get_pool',
    description: 'Fetch current state of a Cetus CLMM pool by pool ID. Returns current price, tick index, tick spacing, fee rate, total liquidity, and rewarder info.',
    inputSchema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'The on-chain object ID of the Cetus CLMM pool.' },
      },
      required: ['pool_id'],
    },
  },
  {
    name: 'cetus_get_positions',
    description: 'List all open Cetus LP positions owned by this wallet across all pools. Returns position IDs, pool IDs, liquidity, and tick bounds.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cetus_get_position',
    description: 'Fetch full detail on a single Cetus LP position by position object ID. Returns tick bounds, liquidity, accrued fees (fee_owed_a, fee_owed_b), and accrued rewards.',
    inputSchema: {
      type: 'object',
      properties: {
        pos_id: { type: 'string', description: 'The on-chain object ID of the Cetus position NFT.' },
      },
      required: ['pos_id'],
    },
  },
  {
    name: 'cetus_open_position',
    description: 'Open a new Cetus LP position and deposit liquidity in one transaction. Specify a price range (or full range) and fix one coin amount — the SDK calculates the other side automatically based on the current pool ratio. Returns the new position object ID.',
    inputSchema: {
      type: 'object',
      properties: {
        pool_id: { type: 'string', description: 'Object ID of the Cetus CLMM pool.' },
        is_full_range: { type: 'boolean', description: 'If true, deposit across the full tick range. Overrides min_price and max_price.' },
        min_price: { type: 'string', description: 'Lower price bound (decimal string). Required if is_full_range is false.' },
        max_price: { type: 'string', description: 'Upper price bound (decimal string). Required if is_full_range is false.' },
        price_base_coin: { type: 'string', description: 'Which coin the price is expressed in: "coin_a" or "coin_b". Default: "coin_a".' },
        fix_amount_a: { type: 'boolean', description: 'If true, input_amount is in coin A and coin B is calculated. If false, reversed.' },
        input_amount: { type: 'string', description: 'Amount of the fixed coin to deposit, in base units (e.g. "1000000" for 1 DEEP at 6 decimals).' },
        slippage: { type: 'number', description: 'Slippage tolerance as a decimal. Default: 0.01 (1%).' },
      },
      required: ['pool_id', 'fix_amount_a', 'input_amount'],
    },
  },
  {
    name: 'cetus_add_liquidity',
    description: 'Add more liquidity to an existing open Cetus LP position. The position tick range is read from the existing position — you do not need to specify a price range. Fix one coin amount and the SDK calculates the other based on the current pool ratio.',
    inputSchema: {
      type: 'object',
      properties: {
        pos_id: { type: 'string', description: 'Object ID of the existing position NFT.' },
        fix_amount_a: { type: 'boolean', description: 'If true, input_amount is in coin A. If false, in coin B.' },
        input_amount: { type: 'string', description: 'Amount of the fixed coin to deposit, in base units.' },
        slippage: { type: 'number', description: 'Slippage tolerance as a decimal. Default: 0.01 (1%).' },
        collect_fee: { type: 'boolean', description: 'If true, collect accrued fees in the same transaction. Default: false.' },
      },
      required: ['pos_id', 'fix_amount_a', 'input_amount'],
    },
  },
  {
    name: 'cetus_remove_liquidity',
    description: 'Remove a specified amount of liquidity from an existing Cetus LP position. Pass the full position.liquidity value to drain everything without closing the NFT. Optionally collect fees and rewards in the same transaction.',
    inputSchema: {
      type: 'object',
      properties: {
        pos_id: { type: 'string', description: 'Object ID of the position NFT.' },
        liquidity_amount: { type: 'string', description: 'Amount of liquidity units to remove. Use the full position liquidity value to remove everything.' },
        slippage: { type: 'number', description: 'Slippage tolerance as a decimal. Default: 0.01 (1%).' },
        collect_fee: { type: 'boolean', description: 'Collect accrued trading fees in the same transaction. Default: true.' },
        collect_rewards: { type: 'boolean', description: 'Collect farming rewards in the same transaction. Default: true.' },
      },
      required: ['pos_id', 'liquidity_amount'],
    },
  },
  {
    name: 'cetus_collect_rewards',
    description: 'Harvest all accrued trading fees and farming rewards from a Cetus LP position in one transaction. Always collects both fees and rewards together. Use this on a regular schedule to compound yield from active LP positions.',
    inputSchema: {
      type: 'object',
      properties: {
        pos_id: { type: 'string', description: 'Object ID of the Cetus position NFT.' },
      },
      required: ['pos_id'],
    },
  },
  {
    name: 'cetus_close_position',
    description: 'Remove all remaining liquidity, collect all fees and rewards, and burn the position NFT in one atomic transaction. The position object ID is no longer valid after this call. Use this to fully exit a Cetus LP position.',
    inputSchema: {
      type: 'object',
      properties: {
        pos_id: { type: 'string', description: 'Object ID of the position NFT to close.' },
        slippage: { type: 'number', description: 'Slippage tolerance as a decimal. Default: 0.01 (1%).' },
      },
      required: ['pos_id'],
    },
  },
];

async function cetusGetPoolHandler(
  args: Record<string, unknown>,
  _state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const pool_id = args.pool_id as string;
    if (!pool_id) throw new Error('pool_id is required.');
    const pool = await cetusSDK.Pool.getPool(pool_id);
    const result = {
      pool_id: pool.id,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      current_sqrt_price: pool.current_sqrt_price,
      current_tick_index: pool.current_tick_index,
      tick_spacing: pool.tick_spacing,
      fee_rate: pool.fee_rate,
      liquidity: pool.liquidity,
      rewarder_infos: pool.rewarder_infos,
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

async function cetusGetPositionsHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const address = requireKeypair(state);
    const positions = await cetusSDK.Position.getPositionList(address, []);
    const result = {
      positions: positions.map((p: any) => ({
        pos_object_id: p.pos_object_id || p.pos_object_id,
        pool_id: p.pool_id || p.poolId,
        liquidity: p.liquidity,
        tick_lower_index: p.tick_lower_index || p.tick_lower_index,
        tick_upper_index: p.tick_upper_index || p.tick_upper_index,
        coin_type_a: p.coin_type_a || p.coin_type_a,
        coin_type_b: p.coin_type_b || p.coin_type_b,
      })),
      total: positions.length,
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

async function cetusGetPositionHandler(
  args: Record<string, unknown>,
  _state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const pos_id = args.pos_id as string;
    if (!pos_id) throw new Error('pos_id is required.');
    const position = await cetusSDK.Position.getPositionById(pos_id, true);
    const result = {
      pos_object_id: (position as any).pos_object_id || position.pos_object_id,
      pool_id: (position as any).pool_id || (position as any).poolId,
      liquidity: position.liquidity,
      tick_lower_index: (position as any).tick_lower_index || position.tick_lower_index,
      tick_upper_index: (position as any).tick_upper_index || position.tick_upper_index,
      coin_type_a: (position as any).coin_type_a || position.coin_type_a,
      coin_type_b: (position as any).coin_type_b || position.coin_type_b,
      fee_owned_a: (position as any).fee_owned_a || (position as any).fee_owed_a,
      fee_owned_b: (position as any).fee_owned_b || (position as any).fee_owed_b,
      rewarder_infos: (position as any).rewarder_infos,
    };
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}
async function cetusOpenPositionHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireKeypair(state);

    const pool_id = args.pool_id as string;
    const is_full_range = (args.is_full_range as boolean) ?? false;
    const fix_amount_a = args.fix_amount_a as boolean;
    const input_amount = args.input_amount as string;
    const slippage = (args.slippage as number) ?? 0.01;
    const price_base_coin = (args.price_base_coin as string) ?? 'coin_a';

    if (!pool_id) throw new Error('pool_id is required.');
    if (fix_amount_a === undefined) throw new Error('fix_amount_a is required.');
    if (!input_amount) throw new Error('input_amount is required.');

    const pool = await cetusSDK.Pool.getPool(pool_id);

    let add_mode_params: any;
    if (is_full_range) {
      add_mode_params = { is_full_range: true };
    } else {
      const min_price = args.min_price as string;
      const max_price = args.max_price as string;
      if (!min_price || !max_price) throw new Error('min_price and max_price are required when is_full_range is false.');
      add_mode_params = {
        is_full_range: false,
        min_price,
        max_price,
        price_base_coin,
        coin_decimals_a: 6,
        coin_decimals_b: 9,
      };
    }

    const calculate_result = await cetusSDK.Position.calculateAddLiquidityResultWithPrice({
      add_mode_params,
      pool_id,
      slippage,
      coin_amount: input_amount,
      fix_amount_a,
    });

    const payload = await cetusSDK.Position.createAddLiquidityFixCoinWithPricePayload({
      pool_id,
      calculate_result,
      add_mode_params,
    });

    const { tx_digest } = await executeTransaction(payload, state);

    const result = {
      success: true,
      pool_id,
      transaction_digest: tx_digest,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

async function cetusAddLiquidityHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireKeypair(state);

    const pos_id = args.pos_id as string;
    const fix_amount_a = args.fix_amount_a as boolean;
    const input_amount = args.input_amount as string;
    const slippage = (args.slippage as number) ?? 0.01;
    const collect_fee = (args.collect_fee as boolean) ?? false;

    if (!pos_id) throw new Error('pos_id is required.');
    if (fix_amount_a === undefined) throw new Error('fix_amount_a is required.');
    if (!input_amount) throw new Error('input_amount is required.');

    const position = await cetusSDK.Position.getPositionById(pos_id, false);
    const pool = await cetusSDK.Pool.getPool((position as any).pool || (position as any).pool_id || (position as any).poolId);
    if (!pool) throw new Error('Failed to fetch pool for position.');

    const tick_lower = Number((position as any).tick_lower_index);
    const tick_upper = Number((position as any).tick_upper_index);
    const coin_amount = input_amount;

    const add_liquidity_params: any = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: pool.id,
      tick_lower: tick_lower.toString(),
      tick_upper: tick_upper.toString(),
      fix_amount_a,
      amount_a: fix_amount_a ? coin_amount : '0',
      amount_b: fix_amount_a ? '0' : coin_amount,
      slippage,
      is_open: false,
      pos_id: (position as any).pos_object_id,
      rewarder_coin_types: [],
      collect_fee,
    };

    const payload = await cetusSDK.Position.createAddLiquidityFixTokenPayload(add_liquidity_params);
    const { tx_digest } = await executeTransaction(payload, state);

    const result = {
      success: true,
      pos_object_id: pos_id,
      transaction_digest: tx_digest,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

async function cetusRemoveLiquidityHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireKeypair(state);

    const pos_id = args.pos_id as string;
    const liquidity_amount = args.liquidity_amount as string;
    const slippage = (args.slippage as number) ?? 0.01;
    const collect_fee = (args.collect_fee as boolean) ?? true;
    const collect_rewards = (args.collect_rewards as boolean) ?? true;

    if (!pos_id) throw new Error('pos_id is required.');
    if (!liquidity_amount) throw new Error('liquidity_amount is required.');

    const position = await cetusSDK.Position.getPositionById(pos_id, true);
    const pool = await cetusSDK.Pool.getPool((position as any).pool || (position as any).pool_id || (position as any).poolId);
    if (!pool) throw new Error('Failed to fetch pool for position.');

    const rewarder_coin_types = collect_rewards
      ? pool.rewarder_infos.map((r: any) => r.coin_type)
      : [];

    const remove_liquidity_params: any = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      delta_liquidity: liquidity_amount,
      min_amount_a: '0',
      min_amount_b: '0',
      pool_id: pool.id,
      pos_id: (position as any).pos_object_id,
      tick_lower: String((position as any).tick_lower_index),
      tick_upper: String((position as any).tick_upper_index),
      rewarder_coin_types,
      collect_fee,
    };

    const payload = await cetusSDK.Position.removeLiquidityPayload(remove_liquidity_params) as Transaction;
    const { tx_digest } = await executeTransaction(payload, state);

    const result = {
      success: true,
      pos_object_id: pos_id,
      liquidity_removed: liquidity_amount,
      transaction_digest: tx_digest,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }) }] };
  }
}

async function cetusCollectRewardsHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireKeypair(state);

    const pos_id = args.pos_id as string;
    if (!pos_id) throw new Error('pos_id is required.');

    const position = await cetusSDK.Position.getPositionById(pos_id, false);
    const pool = await cetusSDK.Pool.getPool((position as any).pool || (position as any).pool_id || (position as any).poolId);
    if (!pool) throw new Error('Failed to fetch pool for position.');

    const rewarder_coin_types = pool.rewarder_infos.map((r: any) => r.coin_type);

    const collect_params: any = {
      pool_id: pool.id,
      pos_id,
      rewarder_coin_types,
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      collect_fee: true,
    };

    const payload = await cetusSDK.Rewarder.collectRewarderPayload(collect_params);
    const { tx_digest } = await executeTransaction(payload, state);

    const result = {
      success: true,
      pos_object_id: pos_id,
      transaction_digest: tx_digest,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }) }] };
  }
}

async function cetusClosePositionHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    requireKeypair(state);

    const pos_id = args.pos_id as string;
    const slippage = (args.slippage as number) ?? 0.01;
    if (!pos_id) throw new Error('pos_id is required.');

    try {
      var position = await cetusSDK.Position.getPositionById(pos_id, true);
      console.error('[cetus] getPositionById OK');
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'getPositionById failed: ' + (e instanceof Error ? e.message : String(e)) }) }] };
    }

    try {
      console.error('[cetus] position keys: ' + Object.keys(position).join(', '));
      var pool = await cetusSDK.Pool.getPool((position as any).pool || (position as any).pool_id || (position as any).poolId);
      if (!pool) throw new Error('Failed to fetch pool for position.');
      console.error('[cetus] getPool OK');
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'getPool failed: ' + (e instanceof Error ? e.message : String(e)) }) }] };
    }

    const rewarder_coin_types = (pool as any).rewarder_infos.map((r: any) => r.coin_type);

    const close_params: any = {
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      min_amount_a: '0',
      min_amount_b: '0',
      rewarder_coin_types,
      pool_id: pool.id,
      pos_id: (position as any).pos_object_id,
      tick_lower: String((position as any).tick_lower_index),
      tick_upper: String((position as any).tick_upper_index),
      collect_fee: true,
    };

    try {
      const payload = await cetusSDK.Position.closePositionPayload(close_params);
      console.error('[cetus] closePositionPayload OK');
      const { tx_digest } = await executeTransaction(payload, state);
      console.error('[cetus] executeTransaction OK');

      const result = {
        success: true,
        position_closed: pos_id,
        transaction_digest: tx_digest,
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: 'closePayload/exec failed: ' + (e instanceof Error ? e.message : String(e)), stack: e instanceof Error ? e.stack : undefined }) }] };
    }

    // unreachable
    return { content: [{ type: 'text', text: '{}' }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }) }] };
  }
}

export const cetusHandlers: Record<string, (args: Record<string, unknown>, state: AppState) => Promise<{ content: { type: string; text: string }[] }>> = {
  cetus_get_pool: cetusGetPoolHandler,
  cetus_get_positions: cetusGetPositionsHandler,
  cetus_get_position: cetusGetPositionHandler,
  cetus_open_position: cetusOpenPositionHandler,
  cetus_add_liquidity: cetusAddLiquidityHandler,
  cetus_remove_liquidity: cetusRemoveLiquidityHandler,
  cetus_collect_rewards: cetusCollectRewardsHandler,
  cetus_close_position: cetusClosePositionHandler,
};