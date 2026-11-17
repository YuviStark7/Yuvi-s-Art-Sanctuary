/**
 * Does the governor settle, and stay settled?
 *
 *   node tools/test-governor.mjs
 *
 * It is fed frame times from a pretend machine whose frame cost falls as the
 * governor sheds steps, and the test checks the outcomes that matter to a
 * visitor: a slow machine ends up at a smooth frame rate, a fast one is left
 * alone, a machine that gets faster is given quality back, and nothing sits
 * there flapping between two steps.
 */
globalThis.document = { hidden: false };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { Governor, LADDER } = await import('../js/governor.js');

// relative cost of each ladder step (resolution is most of it)
const COST = [1.00, 0.80, 0.68, 0.50, 0.40, 0.28];

function simulate({ fullCostMs, seconds, refreshHz = 60, change }) {
  let scale = 1, bloom = true, reflect = 1, canopy = 2;
  const g = new Governor({
    setScale: (f) => { scale = f; }, setBloom: (b) => { bloom = b; },
    setReflection: (m) => { reflect = m; }, setCanopy: (c) => { canopy = c; }
  }, { start: 0, key: 'test' });
  g.reapply();
  const vsync = 1000 / refreshHz;
  let t = 0, frames = 0;
  const trace = [];
  while (t < seconds * 1000) {
    if (change && t >= change.at) fullCostMs = change.costMs;
    const cost = fullCostMs * COST[g.step];
    const dt = Math.max(vsync, Math.ceil(cost / vsync) * vsync);      // vsync snaps it to a whole number of refreshes
    t += dt; frames++;
    performance.now = () => t;
    g.frame(t);
    if (frames % 120 === 0) trace.push(g.step);
  }
  const lastDt = Math.max(vsync, Math.ceil(fullCostMs * COST[g.step] / vsync) * vsync);
  return { step: g.step, fps: Math.round(1000 / lastDt), changes: g.history.length, history: g.history, trace };
}

let failed = 0;
const check = (name, ok, detail) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  ' + detail : '')); if (!ok) failed++; };

// a fast machine is left alone
let r = simulate({ fullCostMs: 8, seconds: 90 });
check('a fast machine stays at full quality', r.step === 0 && r.changes === 0, `step ${r.step}, ${r.changes} changes`);

// a slow one (full cost 40 ms = 25 fps) is brought to smooth
r = simulate({ fullCostMs: 40, seconds: 90 });
check('a 25 fps machine reaches 60 fps', r.fps >= 55, `${r.fps} fps at step ${r.step}`);
check('...without flapping', r.changes <= 8, `${r.changes} changes`);

// a very slow one still ends at the floor, not beyond it
r = simulate({ fullCostMs: 110, seconds: 90 });
check('a very slow machine stops at the last step', r.step === LADDER.length - 1, `step ${r.step}`);

// a machine that recovers is given quality back
r = simulate({ fullCostMs: 40, seconds: 240, change: { at: 90000, costMs: 12 } });
check('a machine that gets faster is offered quality again', r.step <= 1, `step ${r.step} after recovery`);

// a 144 Hz display: 18.5 ms is the bar, not 22
r = simulate({ fullCostMs: 15, seconds: 90, refreshHz: 144 });
check('a 144 Hz display is not throttled for running at 60+ fps', r.step === 0, `step ${r.step}`);

// hitches alone (one long frame now and then) must not be mistaken for load
{
  const g = new Governor({ setScale() {}, setBloom() {}, setReflection() {}, setCanopy() {} }, { start: 0, key: 'test' });
  let t = 0;
  for (let i = 0; i < 4000; i++) { t += i % 150 === 0 ? 600 : 16.7; performance.now = () => t; g.frame(t); }
  check('an occasional hitch is not load', g.step === 0, `step ${g.step}`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
