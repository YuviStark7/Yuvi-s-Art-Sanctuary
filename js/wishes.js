/**
 * Taking a coin, and keeping the wish that came with it.
 *
 * Two things matter here and they are both about trust.
 *
 * The first is that the browser is never believed about money. It asks the
 * Worker to open a payment, Apple's or Google's own sheet takes the card, and
 * then the *Worker* asks Stripe whether that payment really succeeded before a
 * wish is written down. A visitor with the developer console open cannot talk
 * their way into the wish book.
 *
 * The second is that demo mode must be impossible to mistake for the real
 * thing. When no keys are configured the panel says, in plain words, that
 * nothing is being charged.
 *
 * The wallet button is Stripe's Express Checkout Element. It is a real button
 * the visitor taps, so the phone's pay sheet opens from the tap itself; Safari
 * will not open it any other way. The payment is only created on the server
 * after the visitor has approved it in the sheet.
 */
import { PAYMENTS, WISHING_COPY } from './payments.config.js';

const STRIPE_JS = 'https://js.stripe.com/endive/stripe.js';
const TURNSTILE_JS = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const LOCAL_KEY = 'stark-museo-wishes';
const WALLET_PATIENCE = 12000;    // ms to wait for Stripe to say which wallets there are
const CHECK_PATIENCE = 15000;     // ms to wait for the bot check

const loading = {};

/** Stripe and Turnstile must come from their own domains; neither can be vendored.
 *  Both are fetched only when a visitor opens the coin panel. */
function loadScript(src, global) {
  if (window[global]) return Promise.resolve(window[global]);
  if (!loading[src]) {
    loading[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve(window[global]);
      s.onerror = () => { delete loading[src]; s.remove(); reject(new Error(src + ' could not be loaded')); };
      document.head.appendChild(s);
    });
  }
  return loading[src];
}

export class WishingWell {
  constructor() {
    // ?coin=test opts one visitor into Stripe, and only ever with a test key: it cannot charge
    const trying = PAYMENTS.stripePublishableKey.startsWith('pk_test_') &&
      new URLSearchParams(window.location.search).get('coin') === 'test';
    this.mode = (PAYMENTS.mode === 'live' || trying) && this._configured() ? 'live' : 'demo';
    this.stripe = null;
  }

  _configured() {
    return !!(PAYMENTS.stripePublishableKey && PAYMENTS.endpoint);
  }

  /** True when Stripe is in the loop (with a test key, still no real money). */
  get live() { return this.mode === 'live'; }

  /** True when Stripe is in the loop but only pretending. */
  get testing() { return this.live && PAYMENTS.stripePublishableKey.startsWith('pk_test_'); }

  get amount() { return PAYMENTS.amount; }

  async _call(action, body) {
    const res = await fetch(PAYMENTS.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action }, body))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  /** The demo coin: the pause of a real sheet, and nothing charged. */
  async collect() {
    await new Promise((r) => setTimeout(r, 900));
    return { ok: true, paymentId: 'demo-' + Date.now(), demo: true };
  }

  /**
   * Puts the Apple Pay / Google Pay button into `box`.
   *
   * hooks: ready()            a wallet button is showing
   *        unavailable(text)  there will be no button
   *        busy()             the visitor has approved; do not close the panel
   *        paid(paymentId)    the money moved
   *        stopped(text)      it did not; the panel may be used or closed again
   *
   * Returns a function that takes it all down again.
   */
  mountWallet(box, guardBox, hooks) {
    let gone = false, express = null, widget = null, patience = 0;
    const check = this._botCheck(guardBox, (id) => { widget = id; }, () => gone);

    const unavailable = (text) => {
      if (gone) return;
      clearTimeout(patience);
      hooks.unavailable(text);
    };

    (async () => {
      const Stripe = await loadScript(STRIPE_JS, 'Stripe');
      if (gone) return;
      this.stripe = this.stripe || Stripe(PAYMENTS.stripePublishableKey);
      const stripe = this.stripe;
      const elements = stripe.elements({ mode: 'payment', amount: PAYMENTS.amount, currency: PAYMENTS.currency });

      express = elements.create('expressCheckout', {
        // wallets only: this is a coin, not a checkout
        paymentMethods: { link: 'never', paypal: 'never', klarna: 'never', amazonPay: 'never' },
        buttonHeight: 48,
        // light buttons: the panel is nearly black and the default black buttons vanish into it
        buttonTheme: { applePay: 'white-outline', googlePay: 'white' }
      });

      // fires on the first render and on any later change; undefined means no button will show
      express.on('availablepaymentmethodschange', ({ paymentMethods }) => {
        if (gone) return;
        if (paymentMethods && Object.values(paymentMethods).some((m) => m && m.available)) {
          clearTimeout(patience);
          hooks.ready();
        } else unavailable(WISHING_COPY.noWallet);
      });
      express.on('loaderror', () => unavailable(WISHING_COPY.failed));
      express.on('cancel', () => { if (!gone) hooks.stopped(WISHING_COPY.cancelled, false); });

      express.on('confirm', async (ev) => {
        hooks.busy();
        let sheetOpen = true;
        try {
          const { error: formError } = await elements.submit();
          if (formError) throw new Error(formError.message);

          const turnstile = await check.token();
          const { clientSecret, paymentIntentId } = await this._call('intent', { turnstile });

          // from here the money may move, so a failure must not claim that it did not
          sheetOpen = false;
          const { error, paymentIntent } = await stripe.confirmPayment({
            elements,
            clientSecret,
            confirmParams: { return_url: window.location.href },
            redirect: 'if_required'
          });
          if (error) {
            const certain = error.type === 'card_error' || error.type === 'validation_error';
            return hooks.stopped(certain ? WISHING_COPY.failed : WISHING_COPY.unsure, true);
          }
          if (paymentIntent && paymentIntent.status !== 'succeeded') {
            return hooks.stopped(WISHING_COPY.unsure, true);
          }
          hooks.paid(paymentIntentId);
        } catch (err) {
          console.warn('[Stark Museo] payment failed:', err.message);
          if (sheetOpen) ev.paymentFailed({ reason: 'fail' });
          hooks.stopped(sheetOpen ? WISHING_COPY.failed : WISHING_COPY.unsure, true);
        } finally {
          check.reset();
        }
      });

      patience = setTimeout(() => unavailable(WISHING_COPY.noWallet), WALLET_PATIENCE);
      express.mount(box);
    })().catch((err) => {
      console.warn('[Stark Museo] wallet could not be set up:', err.message);
      unavailable(WISHING_COPY.failed);
    });

    return () => {
      gone = true;
      clearTimeout(patience);
      // Stripe destroys the element itself after a load error, and a second destroy throws
      if (express) { try { express.destroy(); } catch (e) { /* already gone */ } }
      if (widget !== null && window.turnstile) window.turnstile.remove(widget);
      box.textContent = '';
      guardBox.textContent = '';
    };
  }

  /** Turnstile, if a site key is set: invisible unless it wants a person to click. */
  _botCheck(box, remember, isGone) {
    if (!PAYMENTS.turnstileSiteKey) return { token: async () => '', reset: () => {} };

    let value = '', waiting = [], id = null;
    const settle = (t) => { value = t; if (t) waiting.splice(0).forEach((w) => w(t)); };

    loadScript(TURNSTILE_JS, 'turnstile').then((turnstile) => {
      if (isGone()) return;
      id = turnstile.render(box, {
        sitekey: PAYMENTS.turnstileSiteKey,
        appearance: 'interaction-only',
        callback: settle,
        'expired-callback': () => settle('')
      });
      remember(id);
    }).catch((err) => console.warn('[Stark Museo]', err.message));

    return {
      token: () => value ? Promise.resolve(value) : new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('the bot check did not answer')), CHECK_PATIENCE);
        waiting.push((t) => { clearTimeout(timer); resolve(t); });
      }),
      // a token is good for one payment
      reset: () => { value = ''; if (!isGone() && id !== null) window.turnstile.reset(id); }
    };
  }

  /** Records the wish. In live mode the server checks the payment first. */
  async submitWish(paymentId, text) {
    const clean = String(text || '').trim().slice(0, 280);
    if (!clean) return { ok: true, skipped: true };

    if (this.mode === 'demo') {
      try {
        const all = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        all.push({ text: clean, at: Date.now() });
        localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(-100)));
      } catch (e) { /* private browsing; the wish is still made */ }
      return { ok: true, demo: true };
    }

    try {
      await this._call('wish', { paymentIntentId: paymentId, text: clean });
      return { ok: true };
    } catch (err) {
      console.warn('[Stark Museo] wish not saved:', err.message);
      return { ok: false, reason: err.message };
    }
  }

  /** Wishes other people have left, if they are being shown at all. */
  async recent(limit) {
    if (!PAYMENTS.showOthersWishes) return [];
    if (this.mode === 'demo') {
      try {
        return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]').slice(-(limit || 8)).reverse();
      } catch (e) { return []; }
    }
    try {
      const data = await this._call('recent', { limit: limit || 8 });
      return data.wishes || [];
    } catch (e) { return []; }
  }

  /** '€2', in the visitor's own formatting. */
  format(cents) {
    try {
      return new Intl.NumberFormat(navigator.language || 'en', {
        style: 'currency',
        currency: PAYMENTS.currency.toUpperCase(),
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2
      }).format(cents / 100);
    } catch (e) {
      return '€' + (cents / 100).toFixed(cents % 100 === 0 ? 0 : 2);
    }
  }
}
