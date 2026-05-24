/**
 * Configuration module for DeepBook MCP server.
 * Reads environment variables and exports a validated config object.
 * Validation errors are thrown at config construction time.
 */

// Define type for network
export type Network = 'mainnet' | 'testnet';

// Define type for log level
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Configuration interface
export interface Config {
  network: Network;
  rpcUrl: string;
  allowedPools: string[];
  logLevel: LogLevel;
}

/**
 * Parse ALLOWED_POOLS environment variable.
 * Comma-separated string, trim whitespace, filter empty strings.
 * Returns default if empty or undefined.
 */
function parseAllowedPools(envValue: string | undefined): string[] {
  if (!envValue) {
    return ['SUI_USDC', 'DEEP_USDC'];
  }

  const pools = envValue
    .split(',')
    .map(pool => pool.trim())
    .filter(pool => pool.length > 0);

  return pools.length > 0 ? pools : ['SUI_USDC', 'DEEP_USDC'];
}

/**
 * Validate SUI_NETWORK environment variable.
 * Throws Error if invalid.
 */
function validateNetwork(envValue: string | undefined): Network {
  const defaultValue: Network = 'mainnet';

  if (!envValue) {
    return defaultValue;
  }

  if (envValue !== 'mainnet' && envValue !== 'testnet') {
    throw new Error(
      `Invalid SUI_NETWORK value: "${envValue}". Must be "mainnet" or "testnet".`
    );
  }

  return envValue as Network;
}

/**
 * Validate LOG_LEVEL environment variable.
 * Throws Error if invalid.
 */
function validateLogLevel(envValue: string | undefined): LogLevel {
  const defaultValue: LogLevel = 'info';

  if (!envValue) {
    return defaultValue;
  }

  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(envValue as LogLevel)) {
    throw new Error(
      `Invalid LOG_LEVEL value: "${envValue}". Must be one of: ${validLevels.join(', ')}.`
    );
  }

  return envValue as LogLevel;
}

/**
 * Validate SUI_RPC_URL environment variable.
 * Returns default if empty or undefined.
 */
function validateRpcUrl(envValue: string | undefined): string {
  const defaultValue = 'https://fullnode.mainnet.sui.io:443';

  if (!envValue || envValue.trim().length === 0) {
    return defaultValue;
  }

  return envValue.trim();
}

// Internal validated configuration cache
let validatedConfig: Config | null = null;

/**
 * Get the validated configuration.
 * Throws Error if validation fails.
 * This is called lazily on first access.
 */
function getValidatedConfig(): Config {
  if (validatedConfig) {
    return validatedConfig;
  }

  try {
    validatedConfig = {
      network: validateNetwork(process.env.SUI_NETWORK),
      rpcUrl: validateRpcUrl(process.env.SUI_RPC_URL),
      allowedPools: parseAllowedPools(process.env.ALLOWED_POOLS),
      logLevel: validateLogLevel(process.env.LOG_LEVEL),
    };
    return validatedConfig;
  } catch (error) {
    throw new Error(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Configuration object.
 * Uses getters to defer validation until first access.
 * This allows main() to catch validation errors.
 */
export const config: Config = {
  get network(): Network {
    return getValidatedConfig().network;
  },
  get rpcUrl(): string {
    return getValidatedConfig().rpcUrl;
  },
  get allowedPools(): string[] {
    return getValidatedConfig().allowedPools;
  },
  get logLevel(): LogLevel {
    return getValidatedConfig().logLevel;
  },
};

/**
 * Check if a pool key is in the allowed pools list.
 * Case-sensitive match.
 */
export function isPoolAllowed(poolKey: string): boolean {
  return config.allowedPools.includes(poolKey);
}