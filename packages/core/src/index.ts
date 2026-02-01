/**
 * @proxies-sx/x402-core
 * Core x402 protocol types and utilities
 */

// ============ Constants ============

export const USDC_ADDRESSES = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  solana: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'solana-devnet': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
} as const;

export const CHAIN_IDS = {
  base: 8453,
  'base-sepolia': 84532,
  solana: 900, // Custom ID for Solana
  'solana-devnet': 901,
} as const;

export type Network = keyof typeof USDC_ADDRESSES;

// ============ Types ============

export interface X402PaymentRequirement {
  x402Version: number;
  error: string;
  accepts: X402AcceptOption[];
}

export interface X402AcceptOption {
  scheme: 'exact';
  network: Network;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  outputSchema?: X402OutputSchema;
  extra?: Record<string, unknown>;
}

export interface X402OutputSchema {
  input: {
    type: 'http';
    method: 'GET' | 'POST';
    queryParams?: Record<string, X402SchemaField>;
    headerFields?: Record<string, X402SchemaField>;
  };
  output: {
    type: 'object';
    description: string;
    properties: Record<string, X402SchemaField>;
  };
}

export interface X402SchemaField {
  type: 'string' | 'number' | 'boolean' | 'object';
  required?: boolean;
  description?: string;
  enum?: string[];
  properties?: Record<string, X402SchemaField>;
}

export interface X402Payment {
  walletAddress: string;
  network: string;
  txHash: string;
  amountUSDC: number;
  amountMicro: string;
  recipient: string;
  resource: string;
  settledAt: Date;
  signature: string;
}

export interface X402PricingTier {
  tier: 'shared' | 'private';
  pricePerUnit: number;
  unit: string;
  description: string;
}

// ============ Utilities ============

/**
 * Convert USDC amount to micro units (6 decimals)
 */
export function toMicroUnits(amount: number): string {
  return Math.ceil(amount * 1_000_000).toString();
}

/**
 * Convert micro units to USDC amount
 */
export function fromMicroUnits(micro: string): number {
  return parseInt(micro, 10) / 1_000_000;
}

/**
 * Check if a signature looks like a Solana transaction
 */
export function isSolanaSignature(signature: string): boolean {
  if (!signature || signature.length < 80 || signature.length > 100) {
    return false;
  }
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(signature);
}

/**
 * Check if a signature looks like an EVM transaction
 */
export function isEvmSignature(signature: string): boolean {
  return /^0x[a-fA-F0-9]{64,}$/.test(signature);
}

/**
 * Detect network from signature format
 */
export function detectNetworkFromSignature(signature: string): 'solana' | 'evm' | 'unknown' {
  if (isSolanaSignature(signature)) return 'solana';
  if (isEvmSignature(signature)) return 'evm';
  return 'unknown';
}

/**
 * Build a 402 Payment Required response
 */
export function buildPaymentRequirement(options: {
  resource: string;
  amount: number;
  network: Network;
  recipient: string;
  description: string;
  outputSchema?: X402OutputSchema;
}): X402PaymentRequirement {
  const { resource, amount, network, recipient, description, outputSchema } = options;

  return {
    x402Version: 1,
    error: 'Payment required to access this resource',
    accepts: [
      {
        scheme: 'exact',
        network,
        maxAmountRequired: toMicroUnits(amount),
        resource,
        description,
        mimeType: 'application/json',
        payTo: recipient,
        maxTimeoutSeconds: 30,
        asset: USDC_ADDRESSES[network],
        outputSchema,
        extra: {
          chainId: CHAIN_IDS[network],
        },
      },
    ],
  };
}

/**
 * Parse Payment-Signature header
 */
export function parsePaymentHeader(header: string | undefined): string | null {
  if (!header) return null;
  // Handle base64 encoded or raw signature
  if (header.startsWith('eyJ')) {
    try {
      const decoded = JSON.parse(Buffer.from(header, 'base64').toString());
      return decoded.signature || decoded.txHash || null;
    } catch {
      return null;
    }
  }
  return header;
}
