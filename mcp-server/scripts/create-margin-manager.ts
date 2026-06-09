/**
 * One-shot script to create a DeepBook MarginManager on Sui mainnet.
 * Run once; store the printed address in MARGIN_MANAGER_ADDRESS on Railway.
 */

import { deepbook, type DeepBookClient } from '@mysten/deepbook-v3';
import type { ClientWithExtensions } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import * as fs from 'fs';

const KEY_FILE = '/data/.secrets/sui_private_key';
const POOL_KEY = 'SUI_USDC';

async function main(): Promise<void> {
  if (!fs.existsSync(KEY_FILE)) {
    throw new Error(
      `Key file not found: ${KEY_FILE}. Is SUI_PRIVATE_KEY configured on Railway?`
    );
  }

  const rawKey = fs.readFileSync(KEY_FILE, 'utf8').trim();
  const { secretKey } = decodeSuiPrivateKey(rawKey);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.toSuiAddress();

  console.log(`Wallet address: ${address}`);
  console.log(`Creating MarginManager for pool: ${POOL_KEY}`);

  const client = new SuiGrpcClient({
    network: 'mainnet',
    baseUrl: 'https://fullnode.mainnet.sui.io:443',
  }).$extend(
    deepbook({ address })
  ) as ClientWithExtensions<{ deepbook: DeepBookClient }>;

  const tx = new Transaction();
  tx.add((client.deepbook as any).marginManager.newMarginManager(POOL_KEY));

  const result = await client.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include: { effects: true, objectTypes: true },
  });

  const txResult = (result as any).Transaction;
  const digest: string = txResult?.digest ?? 'unknown';

  if (!txResult?.status?.success) {
    throw new Error(`Transaction failed. Digest: ${digest}`);
  }

  const objectTypes: Record<string, string> = txResult.objectTypes ?? {};
  const changedObjects: { objectId: string; idOperation: string }[] =
    txResult.effects?.changedObjects ?? [];

  const created = changedObjects.find(
    (obj) =>
      obj.idOperation === 'Created' &&
      objectTypes[obj.objectId]?.includes('MarginManager')
  );

  if (!created) {
    throw new Error(
      `Transaction succeeded but no MarginManager found in created objects. Digest: ${digest}`
    );
  }

  console.log('\n✅ MarginManager created successfully');
  console.log(`Address: ${created.objectId}`);
  console.log('→ Copy this address into MARGIN_MANAGER_ADDRESS on Railway');
}

main().catch((err: unknown) => {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
