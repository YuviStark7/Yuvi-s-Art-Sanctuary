# Turning on the wishing well

Out of the box the coin toss runs in **demo mode**: the coin flies, the water
ripples, the wish is saved in the visitor's own browser, and the panel says
plainly that no payment is being taken. You can ship it like that.

This is how to make it take real money. Budget about half an hour, plus a day
or two of waiting if Stripe wants to verify your business.

---

## What you are signing up for

Taking €1 from strangers on the internet is a regulated activity, not a
feature flag. Before you start, know that:

- **You need a Stripe account in your own or your business's name.** Stripe
  will ask for identity and bank details. Payouts go to that account.
- **This is a donation, not a sale.** The visitor gets no goods and no
  service — they throw a coin in a fountain. Describe it that way everywhere,
  including on the panel. Do not imply they are buying anything.
- **Tax is yours to handle.** In the EU, money you receive this way is
  income. Whether VAT applies to a voluntary donation with no goods in return
  depends on your country. Ask an accountant once, early; it is a five-minute
  question for them.
- **Refunds happen.** Someone will misfire. Stripe lets you refund from the
  dashboard in two clicks. Keeping the amounts at €1–€2 keeps this rare.
- **The wishes are strangers' words.** They arrive unfiltered. The schema
  keeps every wish hidden until you flip `approved` to true, and the gallery
  shows none of them by default. Leave it that way until you have decided who
  reads them.

Nothing about the visitor is stored beyond their words. Stripe holds the card
details; your database never sees them, and no name, email, address or session
id is written anywhere.

---

## 1. Supabase

You already have a project (`FASTO INNOVA`), but **use a fresh one for this**
unless you are certain you want a public payment endpoint sitting beside
whatever else lives there.

1. **SQL Editor → New query.** Paste all of [`schema.sql`](schema.sql) and run
   it. That creates the `wishes` table with row-level security on and exactly
   one policy: anyone may read wishes you have approved. There is deliberately
   no insert policy — only the edge function, which bypasses RLS with the
   service role key, can write.

2. **Deploy the function.** With the
   [Supabase CLI](https://supabase.com/docs/guides/local-development):

   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy wishing-well --no-verify-jwt
   ```

   `--no-verify-jwt` is right here: visitors are anonymous, and the function
   does its own checking.

3. **Give it your Stripe secret and lock down who may call it:**

   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_live_xxxxxxxx
   supabase secrets set ALLOWED_ORIGIN=https://yourname.github.io
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already there; you do not
   set those yourself.

   Set `ALLOWED_ORIGIN` to exactly the origin the site is served from — scheme
   and host, no trailing slash, no path. Leaving it as `*` lets any website
   open payments against your Stripe account.

---

## 2. Stripe

1. **Developers → API keys.** Copy the **publishable** key (`pk_live_…`). That
   one is safe to publish and goes in `js/payments.config.js`. The **secret**
   key (`sk_live_…`) goes only into the Supabase secret above and must never
   appear in this repository.

2. **Apple Pay needs your domain registered.** Settings → Payments → Payment
   method domains → add `yourname.github.io`. Stripe gives you a file. Put it
   at:

   ```
   .well-known/apple-developer-merchantid-domain-association
   ```

   in the root of this repo, with no file extension, and push. GitHub Pages
   will serve it, and Stripe will verify it. Google Pay needs nothing extra.

3. **Test first.** Use your `pk_test_` and `sk_test_` keys and Stripe's test
   cards. Test-mode wallets work on real devices and charge nothing.

---

## 3. Point the site at it

In [`js/payments.config.js`](../js/payments.config.js):

```js
mode: 'live',
stripePublishableKey: 'pk_live_xxxxxxxx',
endpoint: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/wishing-well',
supabaseAnonKey: 'eyJhbG…'          // Settings → API → anon public
```

The anon key is designed to be public. It cannot read the `wishes` table —
RLS sees to that — and it only lets the browser reach the function.

If any of those three are blank the gallery quietly stays in demo mode, so a
half-finished setup can never take money by accident.

---

## How a coin actually gets thrown

Worth understanding before you go live, because one step is the whole point:

1. The browser asks the function to open a payment for €1 or €2. The function
   checks the amount against its own list — a visitor editing the request
   cannot pay 1 cent.
2. Stripe's own sheet takes the card. Your code never touches card details.
3. The browser tells the function the payment is done and hands over the wish.
4. **The function asks Stripe whether that payment really succeeded**, and only
   writes the wish if Stripe says yes. Someone with the developer console open
   cannot talk their way into the book.

The `payment_intent` column is unique, so one payment can only ever buy one
wish however many times the request is replayed.

---

## Reading the wishes

Table Editor → `wishes`. Newest first.

To show some of them in the gallery, set `approved = true` on the ones you
want and flip `showOthersWishes: true` in `payments.config.js`. Read them
before you do. They are anonymous, which means people will write things they
would not sign.
