/**
 * Taking a coin, and keeping the wish that came with it.
 *
 * Two things matter here and they are both about trust.
 *
 * The first is that the browser is never believed about money. It asks the
 * edge function to open a payment, Stripe's own sheet takes the card, and then
 * the *function* asks Stripe whether that payment really succeeded before a
 * wish is written down. A visitor with the developer console open cannot talk
 * their way into the wish book.
 *
 * The second is that demo mode must be impossible to mistake for the real
 * thing. When no keys are configured the panel says, in plain words, that
 * nothing is being charged.
 */
import { PAYMENTS } from './payments.config.js';

const STRIPE_JS = 'https://js.stripe.com/v3/';
const LOCAL_KEY = 'stark-museo-wishes';

let stripeLoader = null;

/** Stripe.js has to come from Stripe's own domain; it cannot be vendored. */
function loadStripe() {
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (stripeLoader) return stripeLoader;
  stripeLoader = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = STRIPE_JS;
    s.async = true;
    s.onload = () => resolve(window.Stripe);
    s.onerror = () => reject(new Error('Stripe.js could not be loaded'));
    document.head.appendChild(s);
  });
  return stripeLoader;
}

export class WishingWell {
  constructor() {
    this.mode = PAYMENTS.mode === 'live' && this._configured() ? 'live' : 'demo';
    this.stripe = null;
    this._walletChecked = false;
    this._walletAvailable = false;
  }

  _configured() {
    return !!(PAYMENTS.stripePublishableKey && PAYMENTS.endpoint && PAYMENTS.supabaseAnonKey);
  }

  /** True when a real charge would be made. */
  get live() { return this.mode === 'live'; }

  /**
   * Whether this browser can actually show a wallet sheet. Demo mode always
   * says yes so the flow can be tried anywhere.
   */
  async walletAvailable() {
    if (this.mode === 'demo') return true;
    if (this._walletChecked) return this._walletAvailable;
    this._walletChecked = true;
    try {
      const Stripe = await loadStripe();
      this.stripe = this.stripe || Stripe(PAYMENTS.stripePublishableKey);
      const pr = this.stripe.paymentRequest({
        country: PAYMENTS.country,
        currency: PAYMENTS.currency,
        total: { label: PAYMENTS.label, amount: PAYMENTS.amounts[0] },
        requestPayerName: false,
        requestPayerEmail: false
      });
      this._walletAvailable = !!(await pr.canMakePayment());
    } catch (e) {
      console.warn('[Stark Museo] wallet check failed:', e.message);
      this._walletAvailable = false;
    }
    return this._walletAvailable;
  }

  async _call(action, body) {
    const res = await fetch(PAYMENTS.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + PAYMENTS.supabaseAnonKey
      },
      body: JSON.stringify(Object.assign({ action }, body))
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  /**
   * Opens the wallet sheet and takes the payment.
   * Resolves { ok, paymentId } — or { ok: false, reason }.
   */
  async collect(amountCents) {
    if (this.mode === 'demo') {
      await new Promise((r) => setTimeout(r, 900));      // the pause of a real sheet
      return { ok: true, paymentId: 'demo-' + Date.now(), demo: true };
    }

    try {
      const Stripe = await loadStripe();
      this.stripe = this.stripe || Stripe(PAYMENTS.stripePublishableKey);

      const { clientSecret, paymentIntentId } =
        await this._call('intent', { amount: amountCents });

      const pr = this.stripe.paymentRequest({
        country: PAYMENTS.country,
        currency: PAYMENTS.currency,
        total: { label: PAYMENTS.label, amount: amountCents },
        requestPayerName: false,
        requestPayerEmail: false
      });

      if (!(await pr.canMakePayment())) return { ok: false, reason: 'no-wallet' };

      const outcome = await new Promise((resolve) => {
        let settled = false;
        const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

        pr.on('paymentmethod', async (ev) => {
          try {
            // don't let Stripe.js run 3DS while the sheet is still up
            const first = await this.stripe.confirmCardPayment(
              clientSecret, { payment_method: ev.paymentMethod.id }, { handleActions: false }
            );
            if (first.error) {
              ev.complete('fail');
              return finish({ ok: false, reason: first.error.message });
            }
            ev.complete('success');

            if (first.paymentIntent.status === 'requires_action') {
              const second = await this.stripe.confirmCardPayment(clientSecret);
              if (second.error) return finish({ ok: false, reason: second.error.message });
            }
            finish({ ok: true, paymentId: paymentIntentId });
          } catch (err) {
            ev.complete('fail');
            finish({ ok: false, reason: err.message });
          }
        });

        pr.on('cancel', () => finish({ ok: false, reason: 'cancelled' }));
        pr.show();
      });

      return outcome;
    } catch (err) {
      console.warn('[Stark Museo] payment failed:', err.message);
      return { ok: false, reason: err.message };
    }
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

  /** '€1' / '€2', in the visitor's own formatting. */
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
