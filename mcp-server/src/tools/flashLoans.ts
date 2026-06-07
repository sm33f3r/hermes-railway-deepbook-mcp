import { Transaction } from '@mysten/sui/transactions';
import { executeTransaction } from '../utils/tx-executor.js';
import type { AppState } from '../client.js';

// Handler signature
export type FlashLoanHandler = (
  args: Record<string, unknown>,
  state: AppState
) => Promise<{ content: { type: string; text: string }[] }>;

interface FlashLoanOperation {
  type: 'swap_base_for_quote' | 'swap_quote_for_base';
  pool: string;
  pct: number;
  /** Optional explicit amount in this pool's asset units. Overrides borrow_amount * pct / 100. */
  amount?: number;
  deepAmount?: number;
}

async function executeFlashLoanHandler(
  args: Record<string, unknown>,
  state: AppState
): Promise<{ content: { type: string; text: string }[] }> {
  try {
    const pool = args.pool as string;
    const borrow_side = args.borrow_side as string;
    const borrow_amount = args.borrow_amount as number;
    const min_profit = (args.min_profit as number) ?? 0;
    const operations = args.operations as FlashLoanOperation[];

    // Prerequisite checks
    if (!state.keypair) {
      throw new Error('Cannot execute flash loan: MCP server is in read-only mode.');
    }
    if (!operations || operations.length === 0) {
      throw new Error('operations array must not be empty.');
    }
    for (const op of operations) {
      if (op.type !== 'swap_base_for_quote' && op.type !== 'swap_quote_for_base') {
        throw new Error(`Unsupported operation type: ${op.type}`);
      }
      if (op.pct < 1 || op.pct > 100) {
        throw new Error(`Operation pct must be between 1 and 100, got: ${op.pct}`);
      }
    }
    if (borrow_side !== 'base' && borrow_side !== 'quote') {
      throw new Error(`borrow_side must be 'base' or 'quote', got: ${borrow_side}`);
    }

    const tx = new Transaction();
    const flashLoanContract = (state.client.deepbook as any).flashLoans;
    const deepbookContract = (state.client.deepbook as any).deepBook;
    const senderAddress = state.keypair.toSuiAddress();

    // Pool asset lookup — matches SDK mainnetPools
    const POOL_ASSETS: Record<string, { base: string; quote: string }> = {
      DEEP_SUI:   { base: 'DEEP',  quote: 'SUI'  },
      SUI_USDC:   { base: 'SUI',   quote: 'USDC' },
      DEEP_USDC:  { base: 'DEEP',  quote: 'USDC' },
      WUSDT_USDC: { base: 'WUSDT', quote: 'USDC' },
      WUSDC_USDC: { base: 'WUSDC', quote: 'USDC' },
      BETH_USDC:  { base: 'BETH',  quote: 'USDC' },
      NS_USDC:    { base: 'NS',    quote: 'USDC' },
      NS_SUI:     { base: 'NS',    quote: 'SUI'  },
      TYPUS_SUI:  { base: 'TYPUS', quote: 'SUI'  },
      SUI_AUSD:   { base: 'SUI',   quote: 'AUSD' },
      AUSD_USDC:  { base: 'AUSD',  quote: 'USDC' },
      DRF_SUI:    { base: 'DRF',   quote: 'SUI'  },
    };

    // Step 1 — Borrow
    // After borrowing, exactly one of baseCoin/quoteCoin is set; the other is null.
    let baseCoin: any = null;
    let quoteCoin: any = null;
    let flashLoan: any;

    if (borrow_side === 'base') {
      const [borrowed, loan] = flashLoanContract.borrowBaseAsset(pool, borrow_amount)(tx);
      baseCoin = borrowed;
      flashLoan = loan;
    } else {
      const [borrowed, loan] = flashLoanContract.borrowQuoteAsset(pool, borrow_amount)(tx);
      quoteCoin = borrowed;
      flashLoan = loan;
    }

    // Step 2 — Operations loop
    //
    // SDK constraint (verified from source):
    //   swapExactBaseForQuote — accepts baseCoin only, throws if quoteCoin passed
    //   swapExactQuoteForBase — accepts quoteCoin only, throws if baseCoin passed
    //
    // Each swap returns [baseCoinResult, quoteCoinResult, deepCoinResult].
    // The proceeds coin is carried forward; the change coin is held in the
    // other variable. deepCoinResult is always transferred to sender.
    //
    // Asset tracking (baseAssetKey/quoteAssetKey) follows which asset each
    // variable holds, so we know which coin to use for repayment later.

    let baseAssetKey: string | null = borrow_side === 'base' ? POOL_ASSETS[pool].base : null;
    let quoteAssetKey: string | null = borrow_side === 'quote' ? POOL_ASSETS[pool].quote : null;

    for (const operation of operations) {
      if (operation.type === 'swap_base_for_quote') {
        // Input: baseCoin. Output: quoteCoin (proceeds), baseCoin (change), deepCoin (fee)
        const amount = operation.amount ?? (borrow_amount * operation.pct / 100);
        const [baseResult, quoteResult, deepResult] = deepbookContract.swapExactBaseForQuote({
          poolKey: operation.pool,
          amount,
          deepAmount: operation.deepAmount ?? 0.000001,
          minOut: 0,
          baseCoin: baseCoin ?? undefined,
        })(tx);
        // baseResult is change of input asset (same type as before)
        baseCoin = baseResult;
        // quoteResult is proceeds — the swap pool's quote asset
        quoteCoin = quoteResult;
        quoteAssetKey = POOL_ASSETS[operation.pool].quote;
        // deepResult is fee change — transfer immediately
        tx.transferObjects([deepResult], senderAddress);
      } else {
        // Input: quoteCoin. Output: baseCoin (proceeds), quoteCoin (change), deepCoin (fee)
        const amount = operation.amount ?? (borrow_amount * operation.pct / 100);
        const [baseResult, quoteResult, deepResult] = deepbookContract.swapExactQuoteForBase({
          poolKey: operation.pool,
          amount,
          deepAmount: operation.deepAmount ?? 0.000001,
          minOut: 0,
          quoteCoin: quoteCoin ?? undefined,
        })(tx);
        // quoteResult is change of input asset (same type as before)
        quoteCoin = quoteResult;
        // baseResult is proceeds — the swap pool's base asset
        baseCoin = baseResult;
        baseAssetKey = POOL_ASSETS[operation.pool].base;
        // deepResult is fee change — transfer immediately
        tx.transferObjects([deepResult], senderAddress);
      }
    }

    // Step 3 — Repay the flash loan
    //
    // After the operations loop, both baseCoin and quoteCoin may be populated.
    // Use POOL_ASSETS to determine which holds the borrowed asset, then call
    // the appropriate return function. The return function splits the borrow
    // amount from the coin and returns the remainder (profit).
    //
    // The other coin (profit from another pool's asset) is transferred to sender.

    const borrowedKey = borrow_side === 'base' ? POOL_ASSETS[pool].base : POOL_ASSETS[pool].quote;

    let repayCoin: any;
    let profitCoin: any;
    if (baseAssetKey === borrowedKey) {
      repayCoin = baseCoin;
      profitCoin = quoteCoin;
    } else {
      repayCoin = quoteCoin;
      profitCoin = baseCoin;
    }

    if (borrow_side === 'base') {
      const remainder = flashLoanContract.returnBaseAsset(pool, borrow_amount, repayCoin, flashLoan)(tx);
      tx.transferObjects([remainder], senderAddress);
    } else {
      const remainder = flashLoanContract.returnQuoteAsset(pool, borrow_amount, repayCoin, flashLoan)(tx);
      tx.transferObjects([remainder], senderAddress);
    }
    if (profitCoin !== null) tx.transferObjects([profitCoin], senderAddress);

    // Step 4 — Execute

    // Step 4 — Execute
    const result = await executeTransaction(tx, state);

    const response = {
      success: true,
      tx_digest: result.tx_digest,
      pool,
      borrow_side,
      borrow_amount,
      min_profit,
      operations_count: operations.length,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2),
      }],
    };
  } catch (err) {
    throw new Error(`execute_flash_loan failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// Tool definitions
export const flashLoanTools = [
  {
    name: 'execute_flash_loan',
    description: 'Execute an atomic flash loan sequence on DeepBook. Borrow an asset, execute an ordered series of swap operations, repay the loan, and keep the profit — all in a single PTB. If repayment cannot be satisfied, the entire transaction reverts.',
    inputSchema: {
      type: 'object',
      properties: {
        pool: {
          type: 'string',
          description: 'Pool key to borrow from, e.g. DEEP_SUI or SUI_USDC',
        },
        borrow_side: {
          type: 'string',
          description: "Which asset to borrow: 'base' or 'quote'",
          enum: ['base', 'quote'],
        },
        borrow_amount: {
          type: 'number',
          description: 'Amount to borrow in asset units',
        },
        min_profit: {
          type: 'number',
          description: 'Minimum profit in borrowed asset units. Default 0 (no minimum).',
          default: 0,
        },
        operations: {
          type: 'array',
          description: 'Ordered list of swap operations to execute with the borrowed funds',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['swap_base_for_quote', 'swap_quote_for_base'],
                description: 'Swap direction',
              },
              pool: {
                type: 'string',
                description: 'Pool key for this swap, e.g. DEEP_SUI or DEEP_USDC',
              },
              pct: {
                type: 'number',
                description: 'Percentage (1–100) of the original borrow amount to use for this swap',
              },
              amount: {
                type: 'number',
                description: 'Optional explicit amount in this pool\'s asset units. Overrides borrow_amount * pct / 100. Use for cross-pool hops where the asset type differs from the borrowed asset.',
              },
              deepAmount: {
                type: 'number',
                description: 'Optional DEEP fee amount. Default 0.000001.',
              },
            },
            required: ['type', 'pool', 'pct'],
          },
        },
      },
      required: ['pool', 'borrow_side', 'borrow_amount', 'operations'],
    },
  },
];

// Handler mapping
export const flashLoanHandlers: Record<string, FlashLoanHandler> = {
  execute_flash_loan: executeFlashLoanHandler,
};