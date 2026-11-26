/**
 * Stark Museo — the wishing well, as a Cloudflare Worker.
 *
 * The only piece of this project that holds a secret, and the only part that takes input from
 * strangers. It does four things:
 *
 *   intent  → open a Stripe payment for the one fixed amount and hand back a client secret
 *   wish    → ask Stripe whether that payment really succeeded, and only then write the wish down
 *   recent  → return approved wishes, if the gallery is showing them
 *   letter  → keep an anonymous letter to the artist; always behind the bot check
 *
 * The browser is never believed: not about the amount, not about whether money changed hands.
 *
 * Bindings (see wrangler.jsonc and ../README.md):
 *   DB                 D1 database holding the wishes and the letters
 *   LIMITER            rate limiter, optional
 *   ALLOWED_ORIGINS    comma-separated origins allowed to call; anything else is refused
 *   STRIPE_SECRET_KEY  secret
 *   TURNSTILE_SECRET   secret; required for letters, and once the Stripe key is not a test key
 */

const AMOUNT = 200;                   // cents; the client does not get a say
const CURRENCY = 'eur';
const SOURCE = 'museo-coin';          // marks our payments, so no other payment can buy a wish
const MAX_BODY = 8192;               // room for a full letter and its bot-check token
const MAX_WISH = 280;
const MAX_LETTER = 1400;
const MAX_LETTER_WORDS = 200;

const origins = (env) => String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

function reply(body, status, origin) {
  const headers = { 'Content-Type': 'application/json', 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'content-type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return new Response(body === null ? null : JSON.stringify(body), { status, headers });
}

/** Stripe's REST API, called directly: two endpoints do not need an SDK. */
async function stripe(env, path, method, form) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Stripe request failed');
  return data;
}

/** Turnstile, Cloudflare's check that a person and not a script is asking. The token must have
 *  been earned on the site that is calling, not collected somewhere else with our public key. */
async function isPerson(env, token, origin) {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token) })
  });
  const data = await res.json();
  return data.success === true && data.hostname === new URL(origin).hostname;
}

export default {
  async fetch(request, env) {
    const asked = request.headers.get('Origin') || '';
    const origin = origins(env).includes(asked) ? asked : '';
    if (!origin) return reply({ error: 'Not allowed from here' }, 403, '');
    const json = (body, status = 200) => reply(body, status, origin);

    if (request.method === 'OPTIONS') return reply(null, 204, origin);
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    if (env.LIMITER) {
      // the address only names a counter Cloudflare holds for a minute; it is never stored
      const { success } = await env.LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!success) return json({ error: 'Too many coins at once. Wait a minute.' }, 429);
    }

    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return json({ error: 'Too long' }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: 'Malformed request' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'Malformed request' }, 400);

    if (body.action !== 'letter') {
      const key = String(env.STRIPE_SECRET_KEY || '');
      if (!key) return json({ error: 'The wishing well is not configured yet.' }, 503);
      // a live key with no bot check would let a script test stolen cards against this account
      if (!/^(sk|rk)_test_/.test(key) && !env.TURNSTILE_SECRET) {
        return json({ error: 'The wishing well is not configured yet.' }, 503);
      }
    }

    try {
      if (body.action === 'letter') {
        // free text from strangers: never without the check that a person is sending it
        if (!env.TURNSTILE_SECRET) return json({ error: 'Letters are not open yet.' }, 503);
        const text = String(body.text || '').trim();
        if (!text) return json({ error: 'The letter is empty' }, 400);
        if (text.length > MAX_LETTER || text.split(/\s+/).length > MAX_LETTER_WORDS) {
          return json({ error: 'The letter is too long' }, 400);
        }
        if (!(await isPerson(env, body.turnstile, origin))) {
          return json({ error: 'Could not confirm you are a person. Try again.' }, 403);
        }
        // the words and the time, nothing about who sent them
        await env.DB.prepare('INSERT INTO letters (text) VALUES (?1)').bind(text).run();
        return json({ ok: true });
      }

      if (body.action === 'intent') {
        if (env.TURNSTILE_SECRET && !(await isPerson(env, body.turnstile, origin))) {
          return json({ error: 'Could not confirm you are a person. Try again.' }, 403);
        }
        const pi = await stripe(env, 'payment_intents', 'POST', {
          amount: String(AMOUNT),
          currency: CURRENCY,
          'automatic_payment_methods[enabled]': 'true',
          'metadata[source]': SOURCE,
          description: 'Stark Museo — a coin in the water'
        });
        return json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
      }

      if (body.action === 'wish') {
        const id = String(body.paymentIntentId || '');
        const text = String(body.text || '').trim().slice(0, MAX_WISH);
        if (!/^pi_[A-Za-z0-9_]{1,100}$/.test(id)) return json({ error: 'Unknown payment' }, 400);
        if (!text) return json({ error: 'The wish is empty' }, 400);

        // the whole point: Stripe is asked, the browser is not believed
        const pi = await stripe(env, 'payment_intents/' + id, 'GET');
        if (pi.status !== 'succeeded' || pi.amount_received !== AMOUNT ||
            pi.currency !== CURRENCY || pi.metadata?.source !== SOURCE) {
          return json({ error: 'That payment has not gone through.' }, 402);
        }
        // one payment buys one wish, however many times the request is replayed
        await env.DB.prepare(
          'INSERT INTO wishes (text, amount_cents, currency, payment_intent) VALUES (?1, ?2, ?3, ?4) ' +
          'ON CONFLICT(payment_intent) DO NOTHING'
        ).bind(text, pi.amount_received, pi.currency, id).run();
        return json({ ok: true });
      }

      if (body.action === 'recent') {
        const limit = Math.min(20, Math.max(1, Math.floor(Number(body.limit)) || 8));
        const { results } = await env.DB.prepare(
          'SELECT text, created_at FROM wishes WHERE approved = 1 ORDER BY created_at DESC LIMIT ?1'
        ).bind(limit).all();
        return json({ wishes: results || [] });
      }

      return json({ error: 'Unknown action' }, 400);
    } catch (err) {
      console.error(err);
      return json({ error: 'Something went wrong. Nothing was recorded.' }, 500);
    }
  }
};
