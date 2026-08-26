/**
 * Stark Museo — the wishing well.
 *
 * The only piece of this project that holds a secret. It does three things:
 *
 *   intent  → open a Stripe payment for €1 or €2 and hand back a client secret
 *   wish    → ask Stripe whether that payment actually succeeded, and only
 *             then write the wish down
 *   recent  → return approved wishes, if the gallery is showing them
 *
 * The browser is never believed about whether money changed hands.
 *
 * Deploy:  supabase functions deploy wishing-well --no-verify-jwt
 * Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_... \
 *                               ALLOWED_ORIGIN=https://you.github.io
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*';

/** What a coin may cost, in cents. The client does not get to choose freely. */
const ALLOWED_AMOUNTS = [100, 200];
const CURRENCY = 'eur';

const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });

/** Stripe's REST API, called directly — no SDK needed for three endpoints. */
async function stripe(path: string, method: 'GET' | 'POST', form?: Record<string, string>) {
  const res = await fetch('https://api.stripe.com/v1/' + path, {
    method,
    headers: {
      'Authorization': 'Bearer ' + STRIPE_KEY,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form ? new URLSearchParams(form).toString() : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Stripe request failed');
  return data;
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!STRIPE_KEY) return json({ error: 'The wishing well is not configured yet.' }, 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Malformed request' }, 400);
  }

  try {
    /* ---------------------------------------------------------- intent -- */
    if (body.action === 'intent') {
      const amount = Number(body.amount);
      if (!ALLOWED_AMOUNTS.includes(amount)) {
        return json({ error: 'That is not one of the amounts on offer.' }, 400);
      }
      const pi = await stripe('payment_intents', 'POST', {
        amount: String(amount),
        currency: CURRENCY,
        'automatic_payment_methods[enabled]': 'true',
        description: 'Stark Museo — a coin in the water'
      });
      return json({ clientSecret: pi.client_secret, paymentIntentId: pi.id });
    }

    /* ------------------------------------------------------------ wish -- */
    if (body.action === 'wish') {
      const id = String(body.paymentIntentId ?? '');
      const text = String(body.text ?? '').trim().slice(0, 280);
      if (!id.startsWith('pi_')) return json({ error: 'Unknown payment' }, 400);
      if (!text) return json({ error: 'The wish is empty' }, 400);

      // the whole point: Stripe is asked, the browser is not believed
      const pi = await stripe('payment_intents/' + encodeURIComponent(id), 'GET');
      if (pi.status !== 'succeeded') {
        return json({ error: 'That payment has not gone through.' }, 402);
      }

      const { error } = await admin().from('wishes').insert({
        text,
        amount_cents: pi.amount_received ?? pi.amount,
        currency: pi.currency ?? CURRENCY,
        payment_intent: id
      });

      // a repeat of the same payment hits the unique index; that is a success,
      // not a failure — the wish is already in the book
      if (error && !String(error.message).includes('duplicate key')) {
        return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    /* ---------------------------------------------------------- recent -- */
    if (body.action === 'recent') {
      const limit = Math.min(20, Math.max(1, Number(body.limit) || 8));
      const { data, error } = await admin()
        .from('wishes')
        .select('text, created_at')
        .eq('approved', true)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ wishes: data ?? [] });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: (err as Error).message }, 500);
  }
});
