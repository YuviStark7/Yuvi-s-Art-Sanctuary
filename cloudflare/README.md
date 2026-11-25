# Turning on the wishing well

Out of the box the coin toss runs in **demo mode**: the coin flies, the water
ripples, the wish is saved in the visitor's own browser, and the panel says
plainly that no payment is being taken. You can ship it like that.

This is how to make it take €2 through Apple Pay and Google Pay.

## Before you start

- **You need a Stripe account** in your own or your business's name (country:
  Italy). Stripe asks for identity and bank details, and pays out to that
  account.
- **A coin is a gift, not a sale.** The visitor gets no goods or service. Do not
  word anything as if they are buying something.
- **Tax is yours to handle.** Ask your accountant how this income is treated.
- **Fees are large relative to €2.** Check Stripe's pricing page for Italy.
- **Wishes are strangers' words.** They arrive unfiltered and stay hidden unless
  you approve them.

## What is stored

For each wish: the words, the time, the amount and Stripe's payment id. No name,
email or IP address. The payment id means that you, in your Stripe dashboard,
could match a wish to the payment that carried it; the panel therefore does not
promise more than "no name or address is kept with your wish".

## The pieces

| Piece | Where | Holds |
|---|---|---|
| The panel and wallet button | `js/wishes.js` | public keys only |
| The server | `wishing-well/worker.mjs` | the Stripe secret, as a Worker secret |
| The wish book | Cloudflare D1, `wishing-well/schema.sql` | the wishes |
| Bot check | Cloudflare Turnstile | its secret, as a Worker secret |

Check the server logic without any accounts:

```bash
node cloudflare/wishing-well/test.mjs
```

## 1. Create the database and deploy (test mode)

From `cloudflare/wishing-well`:

```bash
npx wrangler login
```

```bash
npx wrangler d1 create museo-wishes
```

Put the `database_id` it prints into `wrangler.jsonc`, then:

```bash
npx wrangler d1 execute museo-wishes --remote --file=schema.sql
```

```bash
npx wrangler deploy
```

Then store the Stripe **test** secret key. The command asks for it and does not
echo it. Never paste a secret key into a file or a chat.

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

If `deploy` rejects the `ratelimits` block on your plan, remove it from
`wrangler.jsonc`; the Worker runs without it, but then the bot check below is the
only brake on abuse.

## 2. Point the site at it

In [`js/payments.config.js`](../js/payments.config.js):

```js
mode: 'live',
stripePublishableKey: 'pk_test_…',
endpoint: 'https://museo-wishing-well.YOURNAME.workers.dev',
```

With a `pk_test_` key the panel says **"Test mode — no real money moves."**

The Worker only answers the origins listed in `ALLOWED_ORIGINS` in
`wrangler.jsonc`. Add an origin there (and deploy again) if the site moves.

## 3. Register the domain for the wallets

Apple Pay and Google Pay only appear on a domain you have registered, so neither
can be tried on `localhost`. In Stripe: **Settings → Payment method domains** →
add `museo.yuvistark.com`. Registering in live mode covers test mode as well. If
Stripe asks for an Apple verification file, put it, unrenamed and with no
extension, at `.well-known/apple-developer-merchantid-domain-association` in the
root of this repository.

## 4. Before real money

1. **Turnstile.** In the Cloudflare dashboard create a Turnstile widget for
   `museo.yuvistark.com`. Put the site key in `turnstileSiteKey`, and:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

   The Worker refuses to run with a live Stripe key until this is set. An open
   payment address is otherwise used to test stolen cards.
2. Replace both Stripe keys with the live ones (`pk_live_…` in the config,
   `sk_live_…` with `wrangler secret put STRIPE_SECRET_KEY`).
3. Update the privacy and cookie pages on yuvistark.com to name Stripe and
   Cloudflare.
4. Pay one real coin from your own phone, then refund it in Stripe.

## Reading the wishes

Cloudflare dashboard → D1 → `museo-wishes` → Console:

```sql
SELECT id, created_at, text FROM wishes ORDER BY created_at DESC;
```

To show one in the gallery, `UPDATE wishes SET approved = 1 WHERE id = …;` and set
`showOthersWishes: true` in `payments.config.js`. Read them first: they are
anonymous, so people will write things they would not sign.
