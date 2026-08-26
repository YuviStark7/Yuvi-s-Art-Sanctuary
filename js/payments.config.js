/**
 * ============================================================================
 *  THE WISHING WELL — payment settings.
 * ============================================================================
 *
 *  Out of the box this runs in `demo` mode: the coin toss works, the wish is
 *  saved in the visitor's own browser, and NO MONEY MOVES. The panel says so
 *  plainly, so nobody can think they have paid when they have not.
 *
 *  To take real money you need two accounts and about twenty minutes.
 *  `supabase/README.md` walks through it. In short:
 *
 *    1. A Stripe account (stripe.com). Copy your *publishable* key —
 *       it starts `pk_live_` or `pk_test_`. It is safe in this file.
 *       Your SECRET key never comes near this folder.
 *    2. A Supabase project. Run `supabase/schema.sql`, then deploy
 *       `supabase/functions/wishing-well`. That function is the only thing
 *       that talks to Stripe with your secret key, and the only thing that
 *       can write a wish to the database.
 *    3. Register your live domain with Stripe for Apple Pay, and put the file
 *       Stripe gives you at `.well-known/apple-developer-merchantid-domain-association`.
 *    4. Set `mode: 'live'` below and fill in the three blanks.
 *
 *  Test it with `pk_test_` keys first. Stripe's test cards will not charge you.
 */

export const PAYMENTS = {

  /** 'demo' takes no money. 'live' charges real cards. */
  mode: 'demo',

  /** What a coin costs, in cents. Two options look best in the panel. */
  amounts: [100, 200],

  currency: 'eur',

  /** Your business's country, as Stripe expects it: 'DE', 'FR', 'IT', 'GB'… */
  country: 'DE',

  /** What the visitor sees in the Apple Pay / Google Pay sheet. */
  label: 'Stark Museo — a coin in the water',

  /** Stripe publishable key. Safe to publish; starts pk_live_ or pk_test_. */
  stripePublishableKey: '',

  /** Your deployed edge function, e.g.
   *  https://abcdefgh.supabase.co/functions/v1/wishing-well */
  endpoint: '',

  /** Supabase anon key. Safe to publish — it only reaches the function. */
  supabaseAnonKey: '',

  /** Show other visitors' wishes on the wall of the panel. Off until you
   *  have a moderation habit: these are free-text messages from strangers. */
  showOthersWishes: false
};

/** Words on the coin panel. */
export const WISHING_COPY = {
  prompt: 'Toss a coin',
  title: 'A coin in the water',
  intro: 'People have been throwing coins into water and asking for things for a very long time. You can too.',
  demoNotice: 'Demonstration only — no payment is taken and no card is charged.',
  wishTitle: 'Make your wish',
  wishIntro: 'Anonymous. Nothing about you is stored — only the words.',
  wishPlaceholder: 'I wish…',
  send: 'Let it go',
  skip: 'Keep it to myself',
  thanks: 'Your coin is in the water.',
  failed: 'That did not go through. Nothing has been charged.',
  noWallet: 'This browser has no Apple Pay or Google Pay set up. Try it on your phone.'
};
