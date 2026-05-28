/**
 * Utility to sign and submit Sui Programmable Transaction Blocks (PTBs).
 * Formats results for MCP tool responses.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { AppState } from '../client.js';

/**
 * Execute a signed Sui transaction and return formatted result.
 * @param tx The transaction to execute
 * @param state Application state containing client and keypair
 * @returns Transaction digest and status
 * @throws Error if transaction fails or server is in read-only mode
 */
export async function executeTransaction(
  tx: Transaction,
  state: AppState
): Promise<{ tx_digest: string; status: string }> {
  if (!state.keypair) {
    throw new Error(
      'Cannot execute transaction: MCP server is in read-only mode. SUI_PRIVATE_KEY is not configured.'
    );
  }

  const result = await state.client.core.signAndExecuteTransaction({
    transaction: tx,
    signer: state.keypair,
    include: { effects: true },
  });

  // VERIFY: check whether result.$kind exists on the TypeScript type.
  // Inspection shows that result.$kind does NOT exist on the TypeScript type
  // (causes compilation error). Therefore, we use Option B.
  //
  // Option A (if $kind is on the type): NOT USED - compilation error
  //   if (result.$kind === 'FailedTransaction') { ... }
  //
  // Option B (if $kind is not on the type): USED - compiles cleanly
  //   if (!result.Transaction?.status?.success) { ... }

  // Remove the temporary debug log once the result shape is confirmed.
  process.stderr.write(
    `[tx-executor] DEBUG result shape: ${JSON.stringify(result)}\n`
  );

  const digest = result.Transaction?.digest ?? 'unknown';
  const success = result.Transaction?.status?.success ?? false;

  if (!success) {
    throw new Error(
      `Transaction failed. Digest: ${digest}`
    );
  }

  return {
    tx_digest: digest,
    status: 'success',
  };
}