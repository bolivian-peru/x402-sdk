/**
 * @proxies-sx/x402-solana
 * Solana USDC payment verification
 */

import { isSolanaSignature, USDC_ADDRESSES } from '@proxies-sx/x402-core';

export interface SolanaVerifyResult {
  valid: boolean;
  error?: string;
  payer?: string;
  amount?: number;
  amountMicro?: string;
  txHash?: string;
}

export interface SolanaVerifierOptions {
  /** Solana RPC URL (default: mainnet) */
  rpcUrl?: string;
  /** Expected recipient address */
  recipientAddress: string;
  /** USDC mint address (default: mainnet USDC) */
  usdcMint?: string;
}

/**
 * Solana USDC Payment Verifier
 */
export class SolanaVerifier {
  private readonly rpcUrl: string;
  private readonly recipientAddress: string;
  private readonly usdcMint: string;

  constructor(options: SolanaVerifierOptions) {
    this.rpcUrl = options.rpcUrl || 'https://api.mainnet-beta.solana.com';
    this.recipientAddress = options.recipientAddress;
    this.usdcMint = options.usdcMint || USDC_ADDRESSES.solana;
  }

  /**
   * Check if signature is a valid Solana format
   */
  isValidSignature(signature: string): boolean {
    return isSolanaSignature(signature);
  }

  /**
   * Verify a Solana USDC transaction
   */
  async verify(txSignature: string): Promise<SolanaVerifyResult> {
    if (!this.isValidSignature(txSignature)) {
      return { valid: false, error: 'Invalid Solana signature format' };
    }

    try {
      // Get transaction from Solana RPC
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            txSignature,
            {
              encoding: 'jsonParsed',
              commitment: 'confirmed',
              maxSupportedTransactionVersion: 0,
            },
          ],
        }),
      });

      const data = await response.json();

      if (data.error) {
        return { valid: false, error: `RPC error: ${data.error.message}` };
      }

      if (!data.result) {
        return { valid: false, error: 'Transaction not found or not confirmed' };
      }

      const tx = data.result;

      // Check if transaction was successful
      if (tx.meta?.err) {
        return { valid: false, error: 'Transaction failed on-chain' };
      }

      // Parse token transfers
      const transfers = this.parseTokenTransfers(tx);

      // Find USDC transfer to our recipient
      const usdcTransfer = transfers.find(
        (t) => t.mint === this.usdcMint && t.destination === this.recipientAddress
      );

      if (!usdcTransfer) {
        return {
          valid: false,
          error: `No USDC transfer to ${this.recipientAddress} found`,
        };
      }

      // Get payer address
      const payer = tx.transaction?.message?.accountKeys?.[0]?.pubkey;

      return {
        valid: true,
        payer,
        amount: usdcTransfer.amount / 1_000_000,
        amountMicro: String(usdcTransfer.amount),
        txHash: txSignature,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Parse token transfers from transaction
   */
  private parseTokenTransfers(tx: any): Array<{
    mint: string;
    source: string;
    destination: string;
    amount: number;
  }> {
    const transfers: Array<{
      mint: string;
      source: string;
      destination: string;
      amount: number;
    }> = [];

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Build balance map
    const balanceChanges = new Map<
      string,
      { pre: number; post: number; mint: string; owner: string }
    >();

    for (const pre of preBalances) {
      const key = `${pre.accountIndex}`;
      balanceChanges.set(key, {
        pre: parseInt(pre.uiTokenAmount?.amount || '0'),
        post: 0,
        mint: pre.mint,
        owner: pre.owner,
      });
    }

    for (const post of postBalances) {
      const key = `${post.accountIndex}`;
      const existing = balanceChanges.get(key);
      if (existing) {
        existing.post = parseInt(post.uiTokenAmount?.amount || '0');
      } else {
        balanceChanges.set(key, {
          pre: 0,
          post: parseInt(post.uiTokenAmount?.amount || '0'),
          mint: post.mint,
          owner: post.owner,
        });
      }
    }

    // Find accounts that received tokens
    for (const [_, change] of balanceChanges) {
      const diff = change.post - change.pre;
      if (diff > 0 && change.mint === this.usdcMint) {
        let sourceOwner = '';
        for (const [__, srcChange] of balanceChanges) {
          if (srcChange.mint === change.mint && srcChange.post - srcChange.pre < 0) {
            sourceOwner = srcChange.owner;
            break;
          }
        }

        transfers.push({
          mint: change.mint,
          source: sourceOwner,
          destination: change.owner,
          amount: diff,
        });
      }
    }

    return transfers;
  }
}

/**
 * Quick verify function
 */
export async function verifySolanaPayment(
  txSignature: string,
  recipientAddress: string
): Promise<SolanaVerifyResult> {
  const verifier = new SolanaVerifier({ recipientAddress });
  return verifier.verify(txSignature);
}

// Re-export core utilities
export { isSolanaSignature, USDC_ADDRESSES } from '@proxies-sx/x402-core';
