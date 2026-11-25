/**
 * Runs the Worker against a real SQLite copy of the schema and a stand-in for Stripe and
 * Turnstile. No network, no accounts:   node cloudflare/wishing-well/test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './worker.mjs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const DB = {
  prepare(sql) {
    let args = [];
    const st = {
      bind(...a) { args = a; return st; },
      async run() { sqlite.prepare(sql).run(...args); return {}; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; }
    };
    return st;
  }
};

const paid = { status: 'succeeded', amount_received: 200, currency: 'eur', metadata: { source: 'museo-coin' } };
const intents = {
  pi_good: paid,
  pi_unpaid: { ...paid, status: 'requires_payment_method' },
  pi_other: { ...paid, metadata: {} },
  pi_cheap: { ...paid, amount_received: 100 }
};
let sent = null;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes('siteverify')) return Response.json({ success: init.body.get('response') === 'person' });
  if (u.endsWith('/payment_intents') && init.method === 'POST') {
    sent = Object.fromEntries(new URLSearchParams(init.body));
    return Response.json({ id: 'pi_new', client_secret: 'pi_new_secret' });
  }
  const pi = intents[u.split('/').pop()];
  return pi ? Response.json(pi) : Response.json({ error: { message: 'No such payment_intent' } }, { status: 404 });
};
console.error = () => {};

const ORIGIN = 'https://museo.yuvistark.com';
const base = { DB, ALLOWED_ORIGINS: ORIGIN + ',https://yuvistark7.github.io', STRIPE_SECRET_KEY: 'sk_test_x' };
const call = async (body, { env = base, origin = ORIGIN, method = 'POST' } = {}) => {
  const res = await worker.fetch(new Request('https://w.example/', {
    method,
    headers: { Origin: origin },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  }), env);
  return { status: res.status, headers: res.headers, data: res.status === 204 ? null : await res.json() };
};
const count = () => sqlite.prepare('SELECT count(*) AS n FROM wishes').get().n;

let r = await call({ action: 'intent' }, { origin: 'https://evil.example' });
assert.equal(r.status, 403);
assert.equal(r.headers.get('access-control-allow-origin'), null);
r = await call(null, { method: 'OPTIONS' });
assert.equal(r.status, 204);
assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);

r = await call({ action: 'intent', amount: 1 });
assert.equal(r.status, 200);
assert.equal(sent.amount, '200', 'the client cannot choose the amount');
assert.equal(sent['metadata[source]'], 'museo-coin');

r = await call({ action: 'intent' }, { env: { ...base, STRIPE_SECRET_KEY: 'sk_live_x' } });
assert.equal(r.status, 503, 'a live key without a bot check refuses to run');
const guarded = { ...base, STRIPE_SECRET_KEY: 'sk_live_x', TURNSTILE_SECRET: 's' };
assert.equal((await call({ action: 'intent' }, { env: guarded })).status, 403);
assert.equal((await call({ action: 'intent', turnstile: 'bot' }, { env: guarded })).status, 403);
assert.equal((await call({ action: 'intent', turnstile: 'person' }, { env: guarded })).status, 200);

for (const id of ['pi_unpaid', 'pi_other', 'pi_cheap']) {
  assert.equal((await call({ action: 'wish', paymentIntentId: id, text: 'x' })).status, 402, id);
}
assert.equal((await call({ action: 'wish', paymentIntentId: '../x', text: 'x' })).status, 400);
assert.equal((await call({ action: 'wish', paymentIntentId: 'pi_good', text: '   ' })).status, 400);
assert.equal(count(), 0);

assert.equal((await call({ action: 'wish', paymentIntentId: 'pi_good', text: 'a'.repeat(500) })).status, 200);
assert.equal((await call({ action: 'wish', paymentIntentId: 'pi_good', text: 'again' })).status, 200);
assert.equal(count(), 1, 'one payment buys one wish');
assert.equal(sqlite.prepare('SELECT length(text) AS n FROM wishes').get().n, 280);

assert.equal((await call({ action: 'recent' })).data.wishes.length, 0, 'unapproved wishes stay private');
sqlite.exec('UPDATE wishes SET approved = 1');
assert.equal((await call({ action: 'recent' })).data.wishes.length, 1);

assert.equal((await call('x'.repeat(5000))).status, 413);
assert.equal((await call('{nope')).status, 400);
assert.equal((await call({ action: 'wish', paymentIntentId: 'pi_missing', text: 'x' })).status, 500);
const full = { ...base, LIMITER: { limit: async () => ({ success: false }) } };
assert.equal((await call({ action: 'intent' }, { env: full })).status, 429);

process.stdout.write('wishing well: all checks passed\n');
