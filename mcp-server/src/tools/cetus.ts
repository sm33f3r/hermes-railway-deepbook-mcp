/**
 * Cetus CLMM LP tools.
 */

import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk';
import type { AppState } from '../client.js';

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
export const cetusHandlers: Record<string, (args: Record<string, unknown>, state: AppState) => Promise<{ content: { type: string; text: string }[] }>> = {
  cetus_get_pool: cetusGetPoolHandler,
  cetus_get_positions: cetusGetPositionsHandler,
  cetus_get_position: cetusGetPositionHandler,
};
