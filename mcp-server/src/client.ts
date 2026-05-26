/**
 * DeepBook SDK client singleton.
 * Supports read-only mode (no private key) and signing mode (private key present).
 */

import { deepbook, type DeepBookClient } from '@mysten/deepbook-v3';
import type { ClientWithExtensions } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { config } from './config.js';

// Type alias for the extended client with DeepBook capabilities
export type AppClient = ClientWithExtensions<{ deepbook: DeepBookClient }>;

// Exported state type — client plus optional keypair for signing
export type AppState = { client: AppClient; keypair: Ed25519Keypair | null };

// Module-level singleton cache
let _state: AppState | null = null;

/**
 * Initialise and return the DeepBook SDK client singleton.
 * Read-only mode: no private key configured — uses zero address placeholder.
 * Signing mode: SUI_PRIVATE_KEY present — derives keypair and uses real address.
 *
 * @returns Promise resolving to AppState
 */
export async function initClient(): Promise<AppState> {
  if (_state !== null) {
    return _state;
  }

  let keypair: Ed25519Keypair | null = null;
  let address: string;

  if (config.privateKey) {
    const { secretKey } = decodeSuiPrivateKey(config.privateKey);
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
    address = keypair.toSuiAddress();
  } else {
    address = '0x0000000000000000000000000000000000000000000000000000000000000000';
  }

  const balanceManagers = config.balanceManagerAddress
    ? {
        MANAGER_1: {
          address: config.balanceManagerAddress,
          tradeCap: undefined,
        },
      }
    : undefined;

  const client = new SuiGrpcClient({
    network: config.network,
    baseUrl: config.rpcUrl,
  }).$extend(
    deepbook({
      address,
      balanceManagers,
    })
  ) as AppClient;

  _state = { client, keypair };

  if (keypair) {
    process.stderr.write(`[deepbook-mcp] Client initialised in SIGNING mode. Address: ${address} Network: ${config.network}\n`);
  } else {
    process.stderr.write(`[deepbook-mcp] Client initialised in READ-ONLY mode. Network: ${config.network}\n`);
  }

  return _state;
}