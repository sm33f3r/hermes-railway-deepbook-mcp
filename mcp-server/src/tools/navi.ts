/**
 * NAVI Protocol lending tools.
 * Gives Dulcibella the ability to deposit, borrow, repay, withdraw,
 * and claim rewards on NAVI -- Sui's leading lending protocol.
 */

import type { AppState } from '../client.js';
import { executeTransaction } from '../utils/tx-executor.js';
import { Transaction } from '@mysten/sui/transactions';

async function naviGetPoolHandler(
  args: Record<string, unknown>,
  _state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const { getPool } = await import('@naviprotocol/lending');
    const coin_type = args.coin_type as string;
    if (!coin_type) throw new Error('coin_type is required.');

    const pool = await getPool(coin_type, { env: 'prod' });

    const result = {
      coin_type: (pool as any).coinType ?? (pool as any).coin_type,
      symbol: (pool as any).token?.symbol ?? '',
      asset_id: (pool as any).id,
      supply_apy: (pool as any).supplyIncentiveApyInfo?.apy ?? (pool as any).currentSupplyRate,
      borrow_apy: (pool as any).borrowIncentiveApyInfo?.apy ?? (pool as any).currentBorrowRate,
      total_supply: (pool as any).totalSupplyAmount,
      total_borrow: (pool as any).borrowedAmount,
      utilization_rate: (pool as any).utilizationRate ?? '',
      ltv: (pool as any).ltvValue ?? (pool as any).ltv,
      liquidation_threshold: (pool as any).liquidationFactor?.threshold ?? '',
      is_isolated: (pool as any).isIsolated,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

async function naviGetPositionHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const { getLendingState, getHealthFactor } = await import('@naviprotocol/lending');

    if (!state.keypair) throw new Error('Keypair not configured.');
    const address = state.keypair.toSuiAddress();

    const [lendingState, healthFactor] = await Promise.all([
      getLendingState(address, { env: 'prod' }),
      getHealthFactor(address, { env: 'prod' }),
    ]);

    const result = {
      address,
      health_factor: healthFactor,
      positions: lendingState.map((s: any) => ({
        asset_id: s.assetId,
        coin_type: s.pool?.coinType ?? s.pool?.coin_type ?? '',
        symbol: s.pool?.token?.symbol ?? '',
        supply_balance: s.supplyBalance,
        borrow_balance: s.borrowBalance,
        market: s.market,
      })),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }] };
  }
}

export const naviTools = [
  {
    name: 'navi_get_pool',
    description: 'Fetch current lending pool state for any NAVI-supported asset. Returns supply APY, borrow APY, utilization rate, LTV, and liquidation threshold. Use this to check yield rates before depositing or to assess borrow costs.',
    inputSchema: {
      type: 'object',
      properties: {
        coin_type: {
          type: 'string',
          description: 'Coin type string (e.g. "0x2::sui::SUI") or numeric asset ID (e.g. "0" for SUI).',
        },
      },
      required: ['coin_type'],
    },
  },
  {
    name: 'navi_get_position',
    description: 'Fetch current NAVI lending position for this wallet -- all supply and borrow balances across all assets plus health factor. Always call this before borrowing to verify health factor is safe. Health factor above 1.0 is safe; at or below 1.0 risks liquidation.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export const naviHandlers: Record<string, (args: Record<string, unknown>, state: AppState) => Promise<{ content: { type: string; text: string }[] }>> = {
  navi_get_pool: naviGetPoolHandler,
  navi_get_position: naviGetPositionHandler,
};
