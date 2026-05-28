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
  privateKey: string | null;
  balanceManagerAddress: string | null;
  dryRun: boolean;
  maxOrdersPerMinute: number;
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
 * Validate SUI_PRIVATE_KEY environment variable.
 * Must begin with 'suiprivkey' if set.
 * Returns null if not set.
 */
function validatePrivateKey(envValue: string | undefined): string | null {
  if (!envValue || envValue.trim().length === 0) {
    return null;
  }
  if (!envValue.trim().startsWith('suiprivkey')) {
    throw new Error(
      'Invalid SUI_PRIVATE_KEY: must be a Bech32-encoded Ed25519 key starting with "suiprivkey".'
    );
  }
  return envValue.trim();
}

/**
 * Validate BALANCE_MANAGER_ADDRESS environment variable.
 * Must be a 0x-prefixed 64-character hex string if set.
 * Returns null if not set.
 */
function validateBalanceManagerAddress(envValue: string | undefined): string | null {
  if (!envValue || envValue.trim().length === 0) {
    return null;
  }
  const addr = envValue.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(addr)) {
    throw new Error(
      'Invalid BALANCE_MANAGER_ADDRESS: must be a 0x-prefixed 64-character hex string.'
    );
  }
  return addr;
}

/**
 * Parse DRY_RUN environment variable.
 * 'true' (case-insensitive) maps to true; anything else maps to false.
 */
function parseDryRun(envValue: string | undefined): boolean {
  if (!envValue) {
    return false;
  }
  return envValue.trim().toLowerCase() === 'true';
}


/**
 * Validate MAX_ORDERS_PER_MINUTE environment variable.
 * Default: 10. Must be a positive integer if set.
 */
function validateMaxOrdersPerMinute(envValue: string | undefined): number {
  const defaultValue = 10;

  if (!envValue) {
    return defaultValue;
  }

  const value = parseFloat(envValue.trim());
  if (isNaN(value) || !isFinite(value) || value < 1 || Math.floor(value) !== value) {
    throw new Error(
      `Invalid MAX_ORDERS_PER_MINUTE value: "${envValue}". Must be a positive integer (>= 1).`
    );
  }

  return value;
}

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
      privateKey: validatePrivateKey(process.env.SUI_PRIVATE_KEY),
      balanceManagerAddress: validateBalanceManagerAddress(process.env.BALANCE_MANAGER_ADDRESS),
      dryRun: parseDryRun(process.env.DRY_RUN),
            maxOrdersPerMinute: validateMaxOrdersPerMinute(process.env.MAX_ORDERS_PER_MINUTE),
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
  get privateKey(): string | null {
    return getValidatedConfig().privateKey;
  },
  get balanceManagerAddress(): string | null {
    return getValidatedConfig().balanceManagerAddress;
  },
  get dryRun(): boolean {
    return getValidatedConfig().dryRun;
  },
    get maxOrdersPerMinute(): number {
    return getValidatedConfig().maxOrdersPerMinute;
  },
};

/**
 * Check if a pool key is in the allowed pools list.
 * Case-sensitive match.
 */
export function isPoolAllowed(poolKey: string): boolean {
  return config.allowedPools.includes(poolKey);
}