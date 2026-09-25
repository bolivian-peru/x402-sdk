import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { buildPaymentRequirement, parsePaymentHeader } from '@proxies-sx/x402-core';
import { x402 } from '@proxies-sx/x402-hono';
import { SolanaVerifier, verifySolanaPayment } from '@proxies-sx/x402-solana';

const signature = `0x${'a'.repeat(64)}`;
const options = { amount: 1, network: 'base', recipient: 'fixture-recipient' };

async function requestWithVerifier(response, verifyPayment) {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => {
    if (response instanceof Error) throw response;
    return response;
  };
  let served = false;
  const app = new Hono();
  app.get('/paid', x402({ ...options, verifyPayment }), (c) => {
    served = true;
    return c.json(c.get('x402Payment'));
  });
  try {
    const result = await app.request('/paid', { headers: { 'Payment-Signature': signature } });
    return { result, served };
  } finally {
    globalThis.fetch = previous;
  }
}

test('published core utilities and Solana entry points load without source files', async () => {
  const requirement = buildPaymentRequirement({ ...options, resource: '/paid', description: 'Fixture' });
  assert.equal(requirement.accepts[0].maxAmountRequired, '1000000');
  assert.equal(parsePaymentHeader(Buffer.from(JSON.stringify({ signature })).toString('base64')), signature);
  assert.equal(typeof SolanaVerifier, 'function');
  assert.equal((await verifySolanaPayment('invalid', 'fixture-recipient')).valid, false);
});

test('missing payment returns a quote without calling a verifier or serving content', async () => {
  const app = new Hono();
  app.get('/paid', x402({ ...options, verifyPayment: async () => assert.fail('unexpected verifier call') }),
    () => assert.fail('unpaid request reached handler'));
  const response = await app.request('/paid');
  assert.equal(response.status, 402);
  assert.equal((await response.json()).accepts[0].maxAmountRequired, '1000000');
});

for (const amount of [0, -1, NaN, Infinity, '1', undefined]) {
  test(`configured amount ${amount} is rejected before serving a quote`, () => {
    assert.throws(() => x402({ ...options, amount }), /positive finite/);
  });
}

test('unsupported configured network is rejected', () => {
  assert.throws(() => x402({ ...options, network: 'unknown' }), /Unsupported/);
});

for (const [network, payment] of [['solana', signature], ['base', 'a'.repeat(88)]]) {
  test(`known signature from another network cannot unlock ${network} content`, async () => {
    const app = new Hono();
    app.get('/paid', x402({ ...options, network,
      verifyPayment: async () => assert.fail('mismatched network reached verifier'),
    }), () => assert.fail('mismatched network reached handler'));
    const response = await app.request('/paid', { headers: { 'Payment-Signature': payment } });
    assert.equal(response.status, 402);
    assert.equal(response.headers.get('X-Payment-Settled'), null);
  });
}

for (const [name, response] of [
  ['network error', new Error('offline fixture')],
  ['HTTP 500', new Response('{}', { status: 500 })],
  ['HTTP 404', new Response('{}', { status: 404 })],
  ['malformed JSON', new Response('not-json')],
  ['null result', Response.json(null)],
  ['invalid result', Response.json({ valid: false, amount: 1 })],
  ['non-boolean valid', Response.json({ valid: 'true', amount: 1 })],
  ['missing amount', Response.json({ valid: true })],
  ['zero amount', Response.json({ valid: true, amount: 0 })],
  ['negative amount', Response.json({ valid: true, amount: -1 })],
  ['string amount', Response.json({ valid: true, amount: '1' })],
  ['insufficient amount', Response.json({ valid: true, amount: 0.97 })],
]) {
  test(`facilitator ${name} cannot unlock paid content`, async () => {
    const { result, served } = await requestWithVerifier(response);
    assert.equal(result.status, 402);
    assert.equal(served, false);
    assert.equal(result.headers.get('X-Payment-Settled'), null);
  });
}

for (const amount of [NaN, Infinity, 0, 0.97]) {
  test(`custom verifier amount ${amount} cannot unlock paid content`, async () => {
    const { result, served } = await requestWithVerifier(null, async () => ({ valid: true, amount }));
    assert.equal(result.status, 402);
    assert.equal(served, false);
  });
}

for (const amount of [0.98, 1, 1.2]) {
  test(`verified payment ${amount} preserves the existing 2% tolerance`, async () => {
    const { result, served } = await requestWithVerifier(Response.json({ valid: true, amount, payer: 'fixture-payer' }));
    assert.equal(result.status, 200);
    assert.equal(served, true);
    assert.equal(result.headers.get('X-Payment-Settled'), 'true');
    assert.equal((await result.json()).amountUSDC, amount);
  });
}
