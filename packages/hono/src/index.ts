/**
 * @proxies-sx/x402-hono
 * x402 payment middleware for Hono
 * Compatible with Lucid Agents SDK
 */

import type { Context, MiddlewareHandler } from 'hono';
import {
  buildPaymentRequirement,
  parsePaymentHeader,
  detectNetworkFromSignature,
  fromMicroUnits,
  USDC_ADDRESSES,
  type Network,
  type X402Payment,
  type X402OutputSchema,
} from '@proxies-sx/x402-core';

// Extend Hono context
declare module 'hono' {
  interface ContextVariableMap {
    x402Payment: X402Payment;
  }
}

export interface X402MiddlewareOptions {
  /** Price in USDC (e.g., 0.40 for 40 cents) */
  amount: number;
  /** Payment network: 'base' | 'solana' */
  network: Network;
  /** Your wallet address to receive payments */
  recipient: string;
  /** Description shown to agents */
  description?: string;
  /** Output schema for agent discovery */
  outputSchema?: X402OutputSchema;
  /** Custom payment verifier */
  verifyPayment?: (signature: string, network: string) => Promise<VerifyResult>;
}

export interface VerifyResult {
  valid: boolean;
  error?: string;
  payer?: string;
  amount?: number;
  txHash?: string;
}

/**
 * x402 Payment Middleware for Hono
 *
 * @example
 * ```ts
 * import { Hono } from 'hono'
 * import { x402 } from '@proxies-sx/x402-hono'
 *
 * const app = new Hono()
 *
 * app.get('/paid-endpoint', x402({
 *   amount: 0.01,
 *   network: 'base',
 *   recipient: '0xYourWallet'
 * }), (c) => {
 *   const payment = c.get('x402Payment')
 *   return c.json({ message: 'Paid!', payer: payment.walletAddress })
 * })
 * ```
 */
export function x402(options: X402MiddlewareOptions): MiddlewareHandler {
  const {
    amount,
    network,
    recipient,
    description = 'Payment required',
    outputSchema,
    verifyPayment,
  } = options;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be a positive finite number');
  }
  if (!Object.hasOwn(USDC_ADDRESSES, network)) {
    throw new Error('Unsupported payment network');
  }

  return async (c: Context, next) => {
    // Get payment signature from headers
    const paymentHeader =
      c.req.header('payment-signature') ||
      c.req.header('x-payment-signature') ||
      c.req.header('payment');

    const signature = parsePaymentHeader(paymentHeader);

    // No payment provided - return 402
    if (!signature) {
      const requirement = buildPaymentRequirement({
        resource: new URL(c.req.url).pathname,
        amount,
        network,
        recipient,
        description,
        outputSchema,
      });

      return c.json(requirement, 402, {
        'X-Payment-Required': 'true',
        'Content-Type': 'application/json',
      });
    }

    // Verify payment
    try {
      let result: VerifyResult;
      const detectedNetwork = detectNetworkFromSignature(signature);
      let expectedNetwork = 'evm';
      if (network.startsWith('solana')) expectedNetwork = 'solana';

      if (detectedNetwork !== 'unknown' && detectedNetwork !== expectedNetwork) {
        result = { valid: false, error: 'Payment network mismatch' };
      } else if (verifyPayment) {
        // Custom verifier
        result = await verifyPayment(signature, detectedNetwork);
      } else {
        // Default: require successful verification by the Proxies.sx facilitator.
        result = await defaultVerifyPayment(signature, network);
      }

      if (result?.valid !== true) {
        const requirement = buildPaymentRequirement({
          resource: new URL(c.req.url).pathname,
          amount,
          network,
          recipient,
          description: result?.error || 'Payment verification failed',
          outputSchema,
        });
        return c.json(requirement, 402);
      }

      // Check amount is sufficient
      if (typeof result.amount !== 'number' || !Number.isFinite(result.amount) ||
          result.amount <= 0 || result.amount < amount * 0.98) {
        const requirement = buildPaymentRequirement({
          resource: new URL(c.req.url).pathname,
          amount,
          network,
          recipient,
          description: `Insufficient payment: $${result.amount} < $${amount}`,
          outputSchema,
        });
        return c.json(requirement, 402);
      }

      // Attach payment info to context
      const payment: X402Payment = {
        walletAddress: result.payer || '',
        network,
        txHash: result.txHash || signature,
        amountUSDC: result.amount,
        amountMicro: String(Math.ceil(result.amount * 1_000_000)),
        recipient,
        resource: c.req.url,
        settledAt: new Date(),
        signature,
      };

      c.set('x402Payment', payment);

      // Add response headers
      c.header('X-Payment-Settled', 'true');
      c.header('X-Payment-TxHash', payment.txHash);

      await next();
    } catch (error) {
      const requirement = buildPaymentRequirement({
        resource: new URL(c.req.url).pathname,
        amount,
        network,
        recipient,
        description: `Payment error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        outputSchema,
      });
      return c.json(requirement, 402);
    }
  };
}

/**
 * Default payment verifier using Proxies.sx facilitator
 */
async function defaultVerifyPayment(signature: string, network: Network): Promise<VerifyResult> {
  try {
    // Call Proxies.sx facilitator API
    const response = await fetch('https://api.proxies.sx/v1/x402/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, network }),
    });

    if (!response.ok) {
      return {
        valid: false,
        error: `Payment verification unavailable (HTTP ${response.status})`,
      };
    }

    return await response.json();
  } catch {
    return {
      valid: false,
      error: 'Payment verification unavailable',
    };
  }
}

// Re-export core types
export * from '@proxies-sx/x402-core';
