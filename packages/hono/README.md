# @proxies-sx/x402-hono

Hono middleware for x402 payment quotes and verified access.

```sh
npm install @proxies-sx/x402-hono hono
```

The public middleware export is `x402`. Configure `amount` in USDC, `network`,
`recipient`, and your `verifyPayment(signature, network)` callback. The callback
must verify the intended recipient, network, confirmed amount and replay
protection in your payment ledger before returning
`{ valid: true, amount, payer, txHash }`.

Version 1.0.1 rejects unavailable or invalid verification, missing/zero/non-finite
amounts and underpayment beyond the existing 2% tolerance. It never treats a
verification error as paid. Invalid configured prices/networks fail at setup;
known EVM/Solana signature mismatches are rejected before verification. A matching
signature format does not prove the actual chain or payment. The legacy default `POST /v1/x402/verify` integration
is not a supported payment facilitator; provide a real verifier for paid access.

[API examples and build/release instructions](https://github.com/bolivian-peru/x402-sdk#quick-start).
