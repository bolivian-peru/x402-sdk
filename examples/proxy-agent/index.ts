/**
 * Example x402 Agent - Proxies.sx Wrapper
 *
 * This agent wraps the Proxies.sx x402 API and adds additional features.
 * Deploy to Railway and register on xgate.run for discovery.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { x402 } from '@proxies-sx/x402-hono'

const app = new Hono()

// Enable CORS
app.use('/*', cors())

// Config
const RECIPIENT = process.env.WALLET_ADDRESS || '0xYourWallet'
const PROXIES_API = 'https://api.proxies.sx/v1'

// ============ FREE ENDPOINTS ============

// Health check
app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'proxies-sx-agent',
  version: '1.0.0'
}))

// Pricing info
app.get('/pricing', async (c) => {
  const res = await fetch(`${PROXIES_API}/x402/pricing`)
  return c.json(await res.json())
})

// Available countries
app.get('/countries', async (c) => {
  const res = await fetch(`${PROXIES_API}/x402/countries`)
  return c.json(await res.json())
})

// ============ PAID ENDPOINTS ============

// Get a mobile proxy - $0.40 minimum
app.post('/proxy', x402({
  amount: 0.40,
  network: 'base',
  recipient: RECIPIENT,
  description: 'Real 4G/5G mobile proxy - 1 hour + 0.1GB minimum'
}), async (c) => {
  const payment = c.get('x402Payment')
  const body = await c.req.json()

  // Forward to Proxies.sx with payment signature
  const res = await fetch(`${PROXIES_API}/x402/proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Payment-Signature': payment.signature,
    },
    body: JSON.stringify({
      country: body.country || 'US',
      duration: body.duration || 3600,
      traffic: body.traffic || 0.1,
      tier: body.tier || 'shared',
    }),
  })

  return c.json(await res.json())
})

// Rotate IP - FREE (included with proxy)
app.get('/rotate/:token', async (c) => {
  const token = c.req.param('token')
  const res = await fetch(`${PROXIES_API}/rotate/${token}`)
  return c.json(await res.json())
})

// Check session status
app.get('/session/:id', async (c) => {
  const id = c.req.param('id')
  const res = await fetch(`${PROXIES_API}/x402/sessions/${id}/status`)
  return c.json(await res.json())
})

// Export for deployment
export default app
