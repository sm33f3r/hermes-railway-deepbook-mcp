/**
 * Risk limit enforcement for order and swap submissions.
 * Called by all write tools before building a PTB.
 */

import { config } from '../config.js';

// Module-level array for rate limiting (sliding window)
const callTimestamps: number[] = [];

/**
 * Check if the system is in dry-run mode.
 * @returns boolean - true if dry-run mode is enabled
 */
export function isDryRun(): boolean {
  return config.dryRun;
}

/**
 * Validate order size against maximum notional limit.
 * @param quantity Order quantity in base asset units
 * @param midPrice Current mid price of the pool
 * @throws Error if quantity * midPrice exceeds maxOrderSizeUsd
 */
export function checkOrderSize(quantity: number, midPrice: number): void {
  const notional = quantity * midPrice;
  const limit = config.maxOrderSizeUsd;

  if (notional > limit) {
    throw new Error(
      `Order size check failed: notional $${notional.toFixed(2)} exceeds limit $${limit.toFixed(2)}.\n` +
      'Split the order into smaller chunks.'
    );
  }
}

/**
 * Enforce sliding window rate limit for write tool calls.
 * @throws Error if rate limit is exceeded
 */
export function checkRateLimit(): void {
  const now = Date.now();
  const windowMs = 60000; // 60 seconds
  const windowStart = now - windowMs;

  // Remove all entries older than the window
  while (callTimestamps.length > 0 && callTimestamps[0] < windowStart) {
    callTimestamps.shift();
  }

  const currentCount = callTimestamps.length;
  const limit = config.maxOrdersPerMinute;

  if (currentCount >= limit) {
    throw new Error(
      `Rate limit exceeded: ${currentCount} write tool calls in the last 60 seconds ` +
      `(limit: ${limit}). Wait before retrying.`
    );
  }

  // Add current timestamp to the window
  callTimestamps.push(now);
}