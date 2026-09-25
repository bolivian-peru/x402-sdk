# @proxies-sx/x402-sdk

x402 SDK for AI agent payments. Accept USDC on Base and Solana.

## Packages

| Package | Description |
|---------|-------------|
| `@proxies-sx/x402-core` | Core types and utilities |
| `@proxies-sx/x402-hono` | Hono middleware (Lucid compatible) |
| `@proxies-sx/x402-solana` | Solana payment verification |

## Quick Start

```bash
npm install @proxies-sx/x402-hono
```

```typescript
import { Hono } from 'hono'
import { x402 } from '@proxies-sx/x402-hono'

const app = new Hono()

// Free endpoint
app.get('/health', (c) => c.json({ status: 'ok' }))

// Paid endpoint - $0.10 per request
app.get('/data', x402({
  amount: 0.10,
  network: 'base',
  recipient: '0xYourWallet',
  description: 'Premium data endpoint'
}), async (c) => {
  const payment = c.get('x402Payment')
  console.log(`Paid by: ${payment.walletAddress}`)

  return c.json({ data: 'Premium content!' })
})

export default app
```

The example returns payment quotes. To unlock paid content, provide a
`verifyPayment(signature, network)` callback that verifies the intended recipient,
network, confirmed transfer amount and replay protection in your payment ledger.
Return `{ valid: true, amount, payer, txHash }` only after those checks succeed;
`amount` is in USDC, not micro-units. Missing, zero, non-finite or insufficient
amounts are rejected. The existing 2% amount tolerance is preserved.

Without a callback, the middleware attempts the legacy
`POST https://api.proxies.sx/v1/x402/verify` integration. That URL is not currently
a supported payment facilitator. Verification failures return HTTP 402 and never
unlock content. Do not treat this default path as a working payment integration.

## How x402 Works

1. Agent calls your endpoint without payment
2. Your server returns 402 with payment requirements
3. Agent sends USDC on Base or Solana
4. Agent retries with `Payment-Signature` header
5. Your server verifies payment and returns data

## Payment Networks

| Network | USDC Address | Speed | Cost |
|---------|--------------|-------|------|
| Base | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | ~2s | ~$0.01 |
| Solana | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | ~400ms | ~$0.0001 |

## Solana Verification

```typescript
import { verifySolanaPayment } from '@proxies-sx/x402-solana'

const result = await verifySolanaPayment(
  txSignature,
  'YourSolanaWalletAddress'
)

if (result.valid) {
  console.log(`Received $${result.amount} from ${result.payer}`)
}
```

## Deploy to Railway

```bash
railway login
railway init
railway up
```

## Register on xgate.run

After deploying, register your agent on [xgate.run](https://xgate.run) for discovery.

## Links

- [Lucid Agents SDK](https://github.com/daydreamsai/lucid-agents)
- [x402 Protocol](https://x402.org)
- [Proxies.sx](https://proxies.sx)

## License

MIT

## Build and release

From the workspace root, run `npm ci`, `npm run build` and `npm test`.
The tests pack all three packages, install those tarballs into a temporary
consumer and check their public imports and payment rejection behavior offline.
Each package also builds on `npm pack`/publish and includes its compiled `dist`
files. Use `npm run publish:all` only after release approval; it runs the build
and packed-package tests before publishing.
