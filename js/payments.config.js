/**
 * ============================================================================
 *  THE WISHING WELL — payment settings.
 * ============================================================================
 *
 *  Out of the box this runs in `demo` mode: the coin toss works, the wish is
 *  saved in the visitor's own browser, and NO MONEY MOVES. The panel says so
 *  plainly, so nobody can think they have paid when they have not.
 *
 *  `cloudflare/README.md` walks through turning it on. In short: a Stripe
 *  account, a Cloudflare Worker and its small database, then fill in the blanks
 *  below and set `mode: 'live'`.
 *
 *  Everything in this file is public. The Stripe SECRET key (`sk_…`) never
 *  comes near this folder: it lives only in the Worker's secrets.
 *
 *  Test with a `pk_test_` key first. The panel then says it is a test, and no
 *  card is charged.
 */

export const PAYMENTS = {

  /** 'demo' takes no money. 'live' uses Stripe (test or real, by the key). */
  mode: 'demo',

  /** What a coin costs, in cents. The Worker holds its own copy and wins. */
  amount: 200,

  currency: 'eur',

  /** Stripe publishable key. Safe to publish; starts pk_live_ or pk_test_. */
  stripePublishableKey: '',

  /** Your deployed Worker, e.g.
   *  https://museo-wishing-well.yourname.workers.dev */
  endpoint: '',

  /** Cloudflare Turnstile site key (public). Required before real money: the
   *  Worker refuses a live Stripe key without the matching secret. */
  turnstileSiteKey: '',

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
  testNotice: 'Test mode — no real money moves.',
  toss: 'toss',
  price: 'one coin',
  loading: 'finding your wallet…',
  paying: 'a moment…',
  cancelled: 'No coin, then. Whenever you like.',
  wishTitle: 'Make your wish',
  wishIntro: 'Anonymous. No name or address is kept with your wish.',
  wishPlaceholder: 'I wish…',
  send: 'Let it go',
  skip: 'Keep it to myself',
  thanks: 'Your coin is in the water.',
  failed: 'That did not go through. Nothing has been charged.',
  unsure: 'We could not confirm that payment. Check your wallet before trying again.',
  noWallet: 'This browser has no Apple Pay or Google Pay set up. Try it on your phone.'
};
