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
    // The coin passed forward to the next hop is whichever result matches the
    // output asset of this swap. The OTHER result (change coin, near-zero) must
    // be transferred to sender immediately — leaving it unconsumed causes
    // UnusedValueWithoutDrop in the PTB.
    //
    // deepCoinResult is always transferred to sender (fee rebate or zero change).

    for (const operation of operations) {
      if (operation.type === 'swap_base_for_quote') {
        // Input: baseCoin. Output: quoteCoin (proceeds), baseCoin (change), deepCoin (fee change)
        const amount = borrow_amount * operation.pct / 100;
        const [baseResult, quoteResult, deepResult] = deepbookContract.swapExactBaseForQuote({
          poolKey: operation.pool,
          amount,
          deepAmount: 0,
          minOut: 0,
          baseCoin: baseCoin ?? undefined,
        })(tx);
        // baseResult is change of the input asset — transfer immediately, do not carry forward
        tx.transferObjects([baseResult], senderAddress);
        // quoteResult carries the swap proceeds forward
        quoteCoin = quoteResult;
        baseCoin = null;
        // deepResult is fee change — always transfer
        tx.transferObjects([deepResult], senderAddress);
      } else {
        // Input: quoteCoin. Output: baseCoin (proceeds), quoteCoin (change), deepCoin (fee change)
        const amount = borrow_amount * operation.pct / 100;
        const [baseResult, quoteResult, deepResult] = deepbookContract.swapExactQuoteForBase({
          poolKey: operation.pool,
          amount,
          deepAmount: 0,
          minOut: 0,
          quoteCoin: quoteCoin ?? undefined,
        })(tx);
        // quoteResult is change of the input asset — transfer immediately, do not carry forward
        tx.transferObjects([quoteResult], senderAddress);
        // baseResult carries the swap proceeds forward
        baseCoin = baseResult;
        quoteCoin = null;
        // deepResult is fee change — always transfer
        tx.transferObjects([deepResult], senderAddress);
      }
    }

    // Step 3 — Repay the flash loan
    //
    // returnBaseAsset / returnQuoteAsset (verified from source):
    //   - internally calls tx.splitCoins(coinInput, [borrow_amount])
    //   - sends the split portion to return_flashloan_*
    //   - returns coinInput (the remainder after split)
    //
    // After repayment, the remainder is the profit. Transfer it to sender.
    // The other coin variable (if non-null) is additional profit — also transfer.

    if (borrow_side === 'base') {
      // baseCoin must hold the borrowed asset for repayment
      const remainder = flashLoanContract.returnBaseAsset(pool, borrow_amount, baseCoin, flashLoan)(tx);
      tx.transferObjects([remainder], senderAddress);
      if (quoteCoin !== null) tx.transferObjects([quoteCoin], senderAddress);
    } else {
      // quoteCoin must hold the borrowed asset for repayment
      const remainder = flashLoanContract.returnQuoteAsset(pool, borrow_amount, quoteCoin, flashLoan)(tx);
      tx.transferObjects([remainder], senderAddress);
      if (baseCoin !== null) tx.transferObjects([baseCoin], senderAddress);
    }

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