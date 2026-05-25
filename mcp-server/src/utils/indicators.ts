/**
 * Technical indicator calculations for candlestick data.
 * Pure functions with no side effects or external dependencies.
 */

export type Candle = {
  timestamp: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Exponential Moving Average of close prices
 * @param candles Array of candle data
 * @param period EMA period
 * @returns EMA value or null if insufficient data
 */
export function ema(candles: Candle[], period: number): number | null {
  if (candles.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);

  // Seed with SMA of first period closes
  let emaValue = 0;
  for (let i = 0; i < period; i++) {
    emaValue += candles[i].close;
  }
  emaValue /= period;

  // Calculate EMA for remaining candles
  for (let i = period; i < candles.length; i++) {
    emaValue = (candles[i].close - emaValue) * multiplier + emaValue;
  }

  return emaValue;
}

/**
 * Relative Strength Index using Wilder's smoothing
 * @param candles Array of candle data
 * @param period RSI period (default: 14)
 * @returns RSI value 0-100 or null if insufficient data
 */
export function rsi(candles: Candle[], period: number = 14): number | null {
  if (candles.length < period + 1) {
    return null;
  }

  const wilderMultiplier = 1 / period;
  let avgGain = 0;
  let avgLoss = 0;

  // Calculate initial gains and losses
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  // Wilder's smoothing for remaining candles
  for (let i = period + 1; i < candles.length; i++) {
    const change = candles[i].close - candles[i - 1].close;
    let currentGain = 0;
    let currentLoss = 0;

    if (change > 0) {
      currentGain = change;
    } else {
      currentLoss = Math.abs(change);
    }

    avgGain = (currentGain - avgGain) * wilderMultiplier + avgGain;
    avgLoss = (currentLoss - avgLoss) * wilderMultiplier + avgLoss;
  }

  // Calculate RSI
  if (avgLoss === 0) {
    return 100;
  }

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Moving Average Convergence Divergence
 * @param candles Array of candle data
 * @returns MACD, signal, and histogram values or null if insufficient data
 */
export function macd(candles: Candle[]): { macd: number; signal: number; histogram: number } | null {
  const fastPeriod = 12;
  const slowPeriod = 26;
  const signalPeriod = 9;

  // Need enough candles for slow EMA + signal EMA - 1
  const minCandles = slowPeriod + signalPeriod - 1;
  if (candles.length < minCandles) {
    return null;
  }

  // Calculate EMAs for fast and slow periods
  const fastMultiplier = 2 / (fastPeriod + 1);
  const slowMultiplier = 2 / (slowPeriod + 1);
  const signalMultiplier = 2 / (signalPeriod + 1);

  // Calculate fast EMA
  let fastEma = 0;
  for (let i = 0; i < fastPeriod; i++) {
    fastEma += candles[i].close;
  }
  fastEma /= fastPeriod;
  for (let i = fastPeriod; i < candles.length; i++) {
    fastEma = (candles[i].close - fastEma) * fastMultiplier + fastEma;
  }

  // Calculate slow EMA
  let slowEma = 0;
  for (let i = 0; i < slowPeriod; i++) {
    slowEma += candles[i].close;
  }
  slowEma /= slowPeriod;
  for (let i = slowPeriod; i < candles.length; i++) {
    slowEma = (candles[i].close - slowEma) * slowMultiplier + slowEma;
  }

  // Calculate MACD line
  const macdLine = fastEma - slowEma;

  // Calculate signal line (EMA of MACD values)
  // First, we need to generate MACD values for the last signalPeriod periods
  const macdValues: number[] = [];

  // We need to calculate MACD for each position to get enough values for signal EMA
  // For simplicity, we'll recalculate EMAs at each position
  for (let i = slowPeriod - 1; i < candles.length; i++) {
    // Calculate fast EMA up to position i
    let localFastEma = 0;
    const startIdx = Math.max(0, i - fastPeriod + 1);
    const count = Math.min(fastPeriod, i + 1);

    for (let j = startIdx; j <= i; j++) {
      localFastEma += candles[j].close;
    }
    localFastEma /= count;

    // For remaining values beyond initial period, apply EMA smoothing
    for (let j = i - count + 1; j <= i; j++) {
      if (j > startIdx) {
        localFastEma = (candles[j].close - localFastEma) * fastMultiplier + localFastEma;
      }
    }

    // Calculate slow EMA up to position i
    let localSlowEma = 0;
    const slowStartIdx = Math.max(0, i - slowPeriod + 1);
    const slowCount = Math.min(slowPeriod, i + 1);

    for (let j = slowStartIdx; j <= i; j++) {
      localSlowEma += candles[j].close;
    }
    localSlowEma /= slowCount;

    // For remaining values beyond initial period, apply EMA smoothing
    for (let j = i - slowCount + 1; j <= i; j++) {
      if (j > slowStartIdx) {
        localSlowEma = (candles[j].close - localSlowEma) * slowMultiplier + localSlowEma;
      }
    }

    macdValues.push(localFastEma - localSlowEma);
  }

  // We need at least signalPeriod MACD values
  if (macdValues.length < signalPeriod) {
    return null;
  }

  // Calculate signal EMA from MACD values
  let signalEma = 0;
  for (let i = 0; i < signalPeriod; i++) {
    signalEma += macdValues[i];
  }
  signalEma /= signalPeriod;

  for (let i = signalPeriod; i < macdValues.length; i++) {
    signalEma = (macdValues[i] - signalEma) * signalMultiplier + signalEma;
  }

  const histogram = macdLine - signalEma;

  return {
    macd: macdLine,
    signal: signalEma,
    histogram
  };
}

/**
 * Bollinger Bands
 * @param candles Array of candle data
 * @param period BB period (default: 20)
 * @returns Upper, middle, and lower bands or null if insufficient data
 */
export function bollingerBands(candles: Candle[], period: number = 20): { upper: number; middle: number; lower: number } | null {
  if (candles.length < period) {
    return null;
  }

  // Use last period candles
  const lastCandles = candles.slice(-period);

  // Calculate middle band (SMA)
  let sum = 0;
  for (const candle of lastCandles) {
    sum += candle.close;
  }
  const middle = sum / period;

  // Calculate standard deviation (population formula)
  let variance = 0;
  for (const candle of lastCandles) {
    const diff = candle.close - middle;
    variance += diff * diff;
  }
  variance /= period; // Population variance (divide by N)
  const stddev = Math.sqrt(variance);

  const upper = middle + 2 * stddev;
  const lower = middle - 2 * stddev;

  return { upper, middle, lower };
}