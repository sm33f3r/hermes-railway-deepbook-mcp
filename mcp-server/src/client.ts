/**
 * DeepBook SDK client singleton for read-only RPC queries.
 * Phase 2: No private key, read-only access to pool objects.
 */

import { deepbook, type DeepBookClient } from '@mysten/deepbook-v3';
import type { ClientWithExtensions } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { config } from './config.js';

// Type alias for the extended client with DeepBook capabilities
export type AppClient = ClientWithExtensions<{ deepbook: DeepBookClient }>;

// Module-level singleton cache
let _client: AppClient | null = null;

/**
 * Initialise and return the DeepBook SDK client singleton.
 * On first call: constructs client, logs to stderr, returns it.
 * On subsequent calls: returns cached client directly.
 *
 * @returns Promise resolving to the AppClient
 */
export async function initClient(): Promise<AppClient> {
  // Return cached client if already initialised
  if (_client !== null) {
    return _client;
  }

  // Construct the read-only DeepBook client
  // Zero address satisfies SDK constructor for Phase 2 read-only use
  // No RPC call is made on construction
  const client = new SuiGrpcClient({
    network: config.network,
    baseUrl: config.rpcUrl,
  }).$extend(
    deepbook({
      address: '0x0000000000000000000000000000000000000000000000000000000000000000',
    })
  ) as AppClient;

  // Cache the client
  _client = client;

  // Log initialisation (stderr as requested)
  process.stderr.write(`[deepbook-mcp] Client initialised. Network: ${config.network}\n`);

  return _client;
}