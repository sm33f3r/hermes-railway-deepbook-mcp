/**
 * NAVI Protocol lending tools.
 * Gives Dulcibella the ability to deposit, borrow, repay, withdraw,
 * and claim rewards on NAVI — Sui's leading lending protocol.
 */

import type { AppState } from '../client.js';
import { executeTransaction } from '../utils/tx-executor.js';
import { Transaction } from '@mysten/sui/transactions';

export const naviTools: object[] = [];

export const naviHandlers: Record<
  string,
  (args: Record<string, unknown>, state: AppState) => Promise<{ content: { type: string; text: string }[] }>
> = {};