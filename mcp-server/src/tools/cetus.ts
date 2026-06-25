/**
 * Cetus CLMM LP tools.
 * Gives Dulcibella the ability to manage concentrated liquidity positions
 * on Cetus Protocol (Sui's primary AMM) for yield generation during low-activity periods.
 */

import { CetusClmmSDK } from '@cetusprotocol/sui-clmm-sdk';
import type { AppState } from '../client.js';

// ---------------------------------------------------------------------------
// SDK singleton
// ---------------------------------------------------------------------------

const cetusSDK = CetusClmmSDK.createSDK({ env: 'mainnet' });

// ---------------------------------------------------------------------------
// Tool definitions (empty — tools added in subsequent steps)
// ---------------------------------------------------------------------------

export const cetusTools: object[] = [];

// ---------------------------------------------------------------------------
// Tool handlers (empty — handlers added in subsequent steps)
// ---------------------------------------------------------------------------

export const cetusHandlers: Record<string, (args: Record<string, unknown>, state: AppState) => Promise<unknown>> = {};