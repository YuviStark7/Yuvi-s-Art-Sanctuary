/**
 * Keeps the sanctuary smooth on whatever it is opened on.
 *
 * The quality presets are a guess made before anyone's machine is known. This
 * watches the frame time the visitor is actually getting and, when frames run
 * long, sheds cost in small steps that nobody has to rebuild the room for:
 * first resolution, which is nearly free to the eye, then bloom, then the floor
 * reflection. When there is room to spare it cautiously gives a step back.
 *
 * Measured on a GTX 1650 at 1080p, the preset ladder spans 3.7 ms (low) to 11.4
 * ms (high) a frame, so a machine three or four times slower than that lands at
 * 20–30 fps on the default. That is the lag this exists to remove.
 *
 * It looks only at the interval between frames, which is what the visitor feels
 * and needs no GPU timer, so it works in every browser.
 */

/** Heaviest first. Each step is cumulative: a later step keeps the earlier savings. */
export const LADDER = [
  { scale: 1.00, bloom: true,  reflect: 1, canopy: 2 },     // as built
  { scale: 0.85, bloom: true,  reflect: 2, canopy: 2 },     // a little lower, reflection every other frame
  { scale: 0.85, bloom: false, reflect: 2, canopy: 2 },     // no bloom
  { scale: 0.72, bloom: false, reflect: 2, canopy: 1 },     // thinner canopy
  { scale: 0.72, bloom: false, reflect: 0, canopy: 1 },     // no floor reflection
  { scale: 0.58, bloom: false, reflect: 0, canopy: 1 }      // the floor
];

const HITCH = 120;               // ms: a longer frame is a throttled or backgrounded tab, not a slow GPU
const REMEMBER_MAX = 3;          // never restore a remembered step deeper than this: it may have been learned wrongly
const WINDOW = 36;               // frames per decision
const SETTLE = 40;               // frames ignored after a change, while things warm up
const PROBE_AFTER = 20000;       // ms of steady frames before trying a step back up
const BAD_FOR = 150000;          // ms a step that failed is left alone

export class Governor {
  /**
   * @param hooks { setScale(f), setBloom(on), setReflection(0|1|2), setCanopy(layers) }
   *              reflect: 0 off, 1 every frame, 2 every other frame
   */
  constructor(hooks, { start = 0, key = 'museo.governor' } = {}) {
    this.hooks = hooks;
    this.key = key;
    this.enabled = true;
    this.step = Math.min(LADDER.length - 1, Math.max(0, start, Math.min(REMEMBER_MAX, readStep(key))));

    this._last = 0;
    this._buf = [];
    this._settle = SETTLE;
    this._refresh = 1000 / 60;
    this._changed = clock();
    this._bad = LADDER.map(() => 0);
    this._probing = false;
    this.history = [];              // for anyone who wants to look: [time, step, median]
  }

  /** Put the current step into effect (after the world is rebuilt, say). */
  reapply() {
    const s = LADDER[this.step];
    this.hooks.setScale(s.scale);
    this.hooks.setBloom(s.bloom);
    this.hooks.setReflection(s.reflect);
    this.hooks.setCanopy(s.canopy);
    this._settle = SETTLE;
    this._buf.length = 0;
  }

  /**
   * The visitor chose a quality themselves: go back to that preset as built, and forget
   * what the governor had learned about steps that did not hold. The preset is the ceiling;
   * the governor only ever sheds from it.
   */
  reset() {
    this.step = 0;
    this._bad.fill(0);
    this._probing = false;
    this._changed = clock();
    writeStep(this.key, 0);
    this.reapply();
  }

  /** Call once per rendered frame with a timestamp in ms. */
  frame(t) {
    if (!this._last) { this._last = t; return; }
    const dt = t - this._last;
    this._last = t;

    // A hidden tab, a throttled one, or a single long hitch says nothing about steady-state cost.
    // A browser that is not drawing a window at full rate delivers frames 130-1000 ms apart; read
    // as load, that would walk the quality to the floor and remember it.
    if (!this.enabled || document.hidden || dt > HITCH) {
      this._settle = SETTLE; this._buf.length = 0; return;
    }
    if (this._settle > 0) { this._settle--; return; }

    this._buf.push(dt);
    if (this._buf.length < WINDOW) return;

    const sorted = this._buf.slice().sort((a, b) => a - b);
    this._buf.length = 0;
    const median = sorted[sorted.length >> 1];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    // the fastest frames seen are about one refresh interval, whatever the display
    this._refresh = Math.min(this._refresh, sorted[2]);
    const target = Math.max(this._refresh * 1.35, 18.5);
    const slow = median > target;

    if (slow) {
      this._to(this.step + 1, median);
      if (this._probing) this._bad[this.step - 1] = clock() + BAD_FOR;     // that step up did not hold
      this._probing = false;
      return;
    }
    this._probing = false;

    const steady = clock() - this._changed;
    if (this.step > 0 && steady > PROBE_AFTER && clock() > this._bad[this.step - 1] && p90 < target * 0.92) {
      this._probing = true;
      this._to(this.step - 1, median);
    }
  }

  _to(step, median) {
    step = Math.min(LADDER.length - 1, Math.max(0, step));
    if (step === this.step) return;
    if (step > this.step) this._bad[this.step] = 0;
    this.step = step;
    this._changed = clock();
    this.history.push([Math.round(clock()), step, +median.toFixed(1)]);
    if (this.history.length > 40) this.history.shift();
    writeStep(this.key, step);
    this.reapply();
  }
}

const clock = () => performance.now();

function readStep(key) {
  try { return Math.max(0, parseInt(localStorage.getItem(key), 10) || 0); } catch { return 0; }
}
function writeStep(key, step) {
  try { localStorage.setItem(key, String(step)); } catch { /* private mode: it simply will not be remembered */ }
}
