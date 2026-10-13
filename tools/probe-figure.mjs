/**
 * Measure the figure's limbs against its body, through the walk cycle, with
 * no browser involved.
 *
 * The daily improvement routine cannot see the render, which makes the figure
 * the one part of the sanctuary it is nearly blind to: a skinning fault reads
 * as perfectly sensible code and only shows up on screen. This closes some of
 * that gap. It rebuilds the skeleton and the limb tubes from the same numbers
 * `js/character.js` uses, drives them with the same walk pose, and then asks
 * the one question a still image cannot answer: does any limb surface cross
 * the body surface as the figure walks?
 *
 * A limb that is buried in the torso at rest and outside it mid-stride is the
 * fault reported as "arms pass in and out of the body". A limb that sits
 * inside the body at every phase is fine — it is simply hidden.
 *
 * The skinning maths is the vendored three.js, not a re-implementation, so a
 * clean report here means the browser agrees. The body it measures against is
 * an approximation: above the shoulder line the torso stops being a stack of
 * ellipses and closes into a dome, so vertices up there are left out of the
 * count rather than guessed at.
 *
 *   node tools/probe-figure.mjs
 *
 * Every number it measures with is imported from js/figure.metrics.js, which
 * is also what js/character.js builds the figure from. This file restated them
 * by hand once and drifted far enough in three merges to report 266 mm of
 * fault that had already been fixed. What is still written out here is the
 * walk — a pose rather than a measurement, and the one place left where this
 * probe can fall behind the figure.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import {
  Y, X, B, BONES, CHAINS, TORSO, ARM_STOPS, LEG_STOPS, LIMB, HAND,
  armOffset, clearInboardFlank, topShell, seatShell, sleeveStops, trouserStops,
  taper, sectionAt
} from '../js/figure.metrics.js';

/** Above this the torso closes into a dome, so the ellipse stack stops being
 *  a fair description of it. */
const STACK_TOP = 1.41;

/**
 * A constant that disappears is a module error before any measuring happens,
 * which is loud enough. A constant that survives but changes shape is not: an
 * emptied stack, or a hand that loses a part, would simply be measured — and
 * a quiet measurement of a figure nobody ships is how this probe went wrong
 * the first time. So the shapes it leans on are checked before it starts.
 */
function need(ok, what) {
  if (ok) return;
  console.error(`probe-figure: ${what}.`);
  console.error('js/figure.metrics.js has changed shape under this probe. Fix the probe');
  console.error('before trusting anything it prints.');
  process.exit(1);
}

/** The bones this probe builds a rig for and drives through the walk. */
const DRIVEN = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL', 'hipR', 'kneeR', 'ankleR'
];

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const stack = (s) => Array.isArray(s) && s.length > 1 && s.every((p) => num(p.y));

need(['hips', 'shoulder', 'elbow', 'wrist', 'knee', 'ankle'].every((k) => num(Y[k])),
     'Y has lost a height this probe measures from');
need(num(X.shoulder) && num(X.leg), 'X has lost a sideways offset');
need(DRIVEN.every((n) => num(B[n])), 'the bone table has lost a bone this probe drives');
need(['armL', 'armR', 'legL', 'legR'].every((c) => CHAINS[c] && CHAINS[c].length === 3),
     'a limb chain is no longer three bones deep');
need(stack(TORSO) && stack(ARM_STOPS) && stack(LEG_STOPS),
     'a body stack is too short to sweep');
need(stack(topShell()) && stack(seatShell()) && stack(sleeveStops(true)) &&
     stack(sleeveStops(false)) && stack(trouserStops(true)),
     'a garment stack came back empty');
need(HAND.parts.some((part) => part.slab), 'the hand has no parts left to measure');
// Not that the clearance is still ten millimetres — that is a dial, and
// zero is a fair setting for it — only that the arm is still placed by a
// finite, mirrored offset that never pulls it inboard of its own bone.
need(num(armOffset(1)) && armOffset(-1) === -armOffset(1) && armOffset(1) >= X.shoulder,
     'the arm is no longer placed by a mirrored offset outboard of its bone');

/* ------------------------------------------------------------- geometry -- */

/** loftTube()'s vertices, domed caps included. Positions are all we need. */
function loftPoints(sections, radial, capBottom, capTop, ox) {
  const pts = [];
  for (const s of sections) {
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pts.push([ox + s.rx * Math.cos(a), s.y, s.rz * Math.sin(a)]);
    }
  }
  const cap = (s, up) => {
    for (let r = 1; r <= 4; r++) {
      const t = r / 4;
      const k = Math.cos(t * Math.PI / 2);
      const lift = Math.sin(t * Math.PI / 2) * Math.min(s.rx, s.rz) * 0.42;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        pts.push([ox + s.rx * k * Math.cos(a), s.y + (up ? lift : -lift), s.rz * k * Math.sin(a)]);
      }
    }
  };
  if (capBottom) cap(sections[0], false);
  if (capTop) cap(sections[sections.length - 1], true);
  return pts;
}

/** slab()'s vertices, for the hand. */
function slabPoints(w, h, d, r, segs) {
  const geo = new THREE.BoxGeometry(w, h, d, segs || 3, segs || 3, segs || 3);
  const p = geo.attributes.position;
  const hx = Math.max(0, w / 2 - r), hy = Math.max(0, h / 2 - r), hz = Math.max(0, d / 2 - r);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  const pts = [];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)),
          Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    pts.push([v.x, v.y, v.z]);
  }
  geo.dispose();
  return pts;
}

/**
 * The hand's surface, laid out the way `Character._handGeometry()` lays it
 * out: each part authored on the centre line and the whole thing carried out
 * to the arm's own offset at the end. The knuckle grooves are left out, as
 * they are recessed into the fingers and carry no part of the hand's outline
 * against the body.
 */
function handPoints(s) {
  const pts = [];
  for (const part of HAND.parts) {
    if (!part.slab) continue;
    const box = part.slab;
    const a = part.tiltZ ? s * part.tiltZ : 0;
    const cos = Math.cos(a), sin = Math.sin(a);
    for (const p of slabPoints(box.w, box.h, box.d, box.r, box.segs)) {
      pts.push([armOffset(s) + s * part.at[0] + p[0] * cos - p[1] * sin,
                part.at[1] + p[0] * sin + p[1] * cos,
                part.at[2] + p[2]]);
    }
  }
  return pts;
}

/* ------------------------------------------------------------- skinning -- */

function skinChainWeights(pts, chain, band) {
  const n = chain.length;
  const asc = chain[n - 1].y > chain[0].y;
  const proj = (v) => (asc ? v : -v);
  const ys = chain.map((c) => proj(c.y));
  return pts.map((p) => {
    const y = proj(p[1]);
    if (y <= ys[0]) return [[chain[0].bone, 1]];
    if (y >= ys[n - 1]) return [[chain[n - 1].bone, 1]];
    let i = 0;
    while (i < n - 2 && y > ys[i + 1]) i++;
    const dFar = ys[i + 1] - y;
    const dNear = y - ys[i];
    const wFar = dFar < band ? 0.5 * (1 - dFar / band) : 0;
    const wNear = (i > 0 && dNear < band) ? 0.5 * (1 - dNear / band) : 0;
    const acc = [[chain[i].bone, 1 - wFar - wNear]];
    if (wFar > 0) acc.push([chain[i + 1].bone, wFar]);
    if (wNear > 0) acc.push([chain[i - 1].bone, wNear]);
    return acc;
  });
}

function skinToWeights(pts, bone) {
  return pts.map(() => [[bone, 1]]);
}

function buildRig() {
  const bone = (name, x, y, z) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x || 0, y || 0, z || 0);
    return b;
  };
  const root = new THREE.Group();
  const bones = new Array(BONES.length);
  bones[B.hips] = bone('hips', 0, Y.hips, 0);
  bones[B.spine] = bone('spine', 0, Y.spine - Y.hips, 0);
  bones[B.chest] = bone('chest', 0, Y.chest - Y.spine, 0);
  bones[B.neck] = bone('neck', 0, Y.neck - Y.chest, 0);
  bones[B.head] = bone('head', 0, Y.head - Y.neck, 0);
  for (const side of ['L', 'R']) {
    const s = side === 'L' ? -1 : 1;
    bones[B['shoulder' + side]] = bone('shoulder' + side, s * X.shoulder, Y.shoulder - Y.chest, 0);
    bones[B['elbow' + side]] = bone('elbow' + side, 0, Y.elbow - Y.shoulder, 0);
    bones[B['wrist' + side]] = bone('wrist' + side, 0, Y.wrist - Y.elbow, 0);
    bones[B['hip' + side]] = bone('hip' + side, s * X.leg, 0, 0);
    bones[B['knee' + side]] = bone('knee' + side, 0, Y.knee - Y.hips, 0);
    bones[B['ankle' + side]] = bone('ankle' + side, 0, Y.ankle - Y.knee, 0);
  }
  bones[B.hips].add(bones[B.spine], bones[B.hipL], bones[B.hipR]);
  bones[B.spine].add(bones[B.chest]);
  bones[B.chest].add(bones[B.neck], bones[B.shoulderL], bones[B.shoulderR]);
  bones[B.neck].add(bones[B.head]);
  for (const side of ['L', 'R']) {
    bones[B['shoulder' + side]].add(bones[B['elbow' + side]]);
    bones[B['elbow' + side]].add(bones[B['wrist' + side]]);
    bones[B['hip' + side]].add(bones[B['knee' + side]]);
    bones[B['knee' + side]].add(bones[B['ankle' + side]]);
  }
  root.add(bones[B.hips]);
  root.updateMatrixWorld(true);
  return { root, bones, skeleton: new THREE.Skeleton(bones) };
}

/** Character.update()'s walk, at `r` of full speed. */
function walk(rig, p, r) {
  const { bones } = rig;
  const swing = 0.66 * r, idle = 1 - r;
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const o = side === 'L' ? 0 : Math.PI;
    bones[B['hip' + side]].rotation.x = Math.sin(p + o) * swing;
    bones[B['hip' + side]].rotation.z = sign * 0.02 * idle;
    bones[B['knee' + side]].rotation.x =
      -(0.52 + 0.48 * Math.sin(p + o - 1.85)) * 0.95 * r - 0.06 * idle;
    bones[B['ankle' + side]].rotation.x = -Math.sin(p + o - 0.8) * 0.28 * r;
  }
  for (const side of ['L', 'R']) {
    const sign = side === 'L' ? -1 : 1;
    const o = side === 'L' ? Math.PI : 0;
    bones[B['shoulder' + side]].rotation.x = Math.sin(p + o) * swing * 0.62;
    // the breath term is sampled at a fixed moment; it only splays the arm
    bones[B['shoulder' + side]].rotation.z = sign * (0.085 + 0.03 * Math.sin(0.9 + sign));
    bones[B['elbow' + side]].rotation.x =
      -(0.22 + 0.20 * Math.abs(Math.sin(p + o))) - 0.12 * idle;
    bones[B['wrist' + side]].rotation.set(0, 0, 0);
  }
  bones[B.hips].position.y = Y.hips + Math.sin(p * 2) * 0.020 * r;
  bones[B.hips].rotation.y = Math.sin(p) * 0.06 * r;
  bones[B.spine].rotation.x = -0.055 * r;
  bones[B.spine].rotation.z = Math.sin(p) * 0.020 * r;
  bones[B.spine].rotation.y = -Math.sin(p) * 0.030 * r;
  bones[B.chest].rotation.x = -0.045 * r;
  bones[B.chest].rotation.z = Math.sin(p) * 0.016 * r;
  bones[B.chest].rotation.y = -Math.sin(p) * 0.022 * r;
  bones[B.neck].rotation.x = 0.06 * r;
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
}

const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

function skin(rig, point, weights) {
  const out = new THREE.Vector3();
  for (const [bone, w] of weights) {
    if (!w) continue;
    _m.multiplyMatrices(rig.bones[bone].matrixWorld, rig.skeleton.boneInverses[bone]);
    _v.set(point[0], point[1], point[2]).applyMatrix4(_m);
    out.addScaledVector(_v, w);
  }
  return out;
}

/**
 * How far inside the body a skinned point sits, in metres.
 *
 * The body deforms too, so the point is carried back through the bone that
 * drives the body where it stands — that is the frame the ellipse stack
 * describes. Returns null where the stack is not a fair description.
 */
function depth(rig, world, sections, refBone) {
  _m.multiplyMatrices(rig.bones[refBone].matrixWorld, rig.skeleton.boneInverses[refBone]).invert();
  const p = world.clone().applyMatrix4(_m);
  const floor = sections[0].y;
  const ceil = Math.min(sections[sections.length - 1].y, STACK_TOP);
  if (p.y < floor || p.y > ceil) return null;
  const s = sectionAt(sections, p.y);
  const q = Math.hypot(p.x / s.rx, p.z / s.rz);
  return (1 - q) * Math.min(s.rx, s.rz);
}

/* ---------------------------------------------------------------- probe -- */

const PHASES = 64;

/** One limb surface, and the body surface it must not cut through. */
function surfaces(side) {
  const s = side === 'L' ? -1 : 1;
  const sleeve = (long) =>
    loftPoints(taper(sleeveStops(long), LIMB.sleeve.bulge), LIMB.sleeve.radial,
               false, true, s * X.shoulder);

  return [
    {
      name: 'bare arm',
      pts: loftPoints(clearInboardFlank(taper(ARM_STOPS, LIMB.arm.bulge)),
                      LIMB.arm.radial, true, true, armOffset(s)),
      chain: CHAINS['arm' + side], band: LIMB.arm.band, body: TORSO, ref: B.chest
    },
    {
      // the hand is bound rigidly to the wrist, so wherever it was authored
      // is where it stays relative to the arm
      name: 'hand',
      pts: handPoints(s),
      bone: B['wrist' + side], body: TORSO, ref: B.hips
    },
    {
      name: 'short sleeve',
      pts: sleeve(false),
      chain: CHAINS['arm' + side], band: LIMB.sleeve.band, body: topShell(), ref: B.chest
    },
    {
      name: 'long sleeve',
      pts: sleeve(true),
      chain: CHAINS['arm' + side], band: LIMB.sleeve.band, body: topShell(), ref: B.chest
    },
    {
      name: 'bare leg',
      pts: loftPoints(taper(LEG_STOPS, LIMB.leg.bulge), LIMB.leg.radial,
                      true, false, s * X.leg),
      chain: CHAINS['leg' + side], band: LIMB.leg.band, body: TORSO, ref: B.hips
    },
    {
      // the wide cut, which is the roomier of the two and so the one that has
      // the most of itself inside the seat of the trousers
      name: 'trouser leg',
      pts: loftPoints(taper(trouserStops(true), LIMB.trouser.bulge),
                      LIMB.trouser.radial, false, true, s * X.leg),
      chain: CHAINS['leg' + side], band: LIMB.trouser.band, body: seatShell(), ref: B.hips
    }
  ];
}

const rig = buildRig();
let worstOverall = 0, totalCrossing = 0;

console.log(`figure probe — ${PHASES} phases of the walk cycle, measured against the`);
console.log(`body below y=${STACK_TOP.toFixed(2)} m, where its profile is a stack of ellipses\n`);
console.log('  surface              verts  measured  buried at rest  crossing  worst breakout');

for (const side of ['L', 'R']) {
  for (const surf of surfaces(side)) {
    const wts = surf.chain
      ? skinChainWeights(surf.pts, surf.chain, surf.band)
      : skinToWeights(surf.pts, surf.bone);

    walk(rig, 0, 0);
    const rest = surf.pts.map((p, i) => depth(rig, skin(rig, p, wts[i]), surf.body, surf.ref));

    const shallowest = surf.pts.map(() => Infinity);
    const deepest = surf.pts.map(() => -Infinity);
    for (let k = 0; k < PHASES; k++) {
      walk(rig, (k / PHASES) * Math.PI * 2, 1);
      for (let i = 0; i < surf.pts.length; i++) {
        const d = depth(rig, skin(rig, surf.pts[i], wts[i]), surf.body, surf.ref);
        if (d === null) continue;
        shallowest[i] = Math.min(shallowest[i], d);
        deepest[i] = Math.max(deepest[i], d);
      }
    }

    let measured = 0, buried = 0, crossing = 0, worst = 0;
    for (let i = 0; i < surf.pts.length; i++) {
      if (rest[i] === null || shallowest[i] === Infinity) continue;
      measured++;
      if (rest[i] > 0) buried++;
      if (shallowest[i] < 0 && deepest[i] > 0) {
        crossing++;
        worst = Math.max(worst, -shallowest[i]);
      }
    }
    worstOverall = Math.max(worstOverall, worst);
    totalCrossing += crossing;

    console.log(`  ${(surf.name + ' ' + side).padEnd(20)} ` +
      `${String(surf.pts.length).padStart(5)} ${String(measured).padStart(9)} ` +
      `${String(buried).padStart(15)} ${String(crossing).padStart(9)} ` +
      `${(worst * 1000).toFixed(1).padStart(12)} mm`);
  }
}

console.log(`\n${totalCrossing} vertices cross the body surface during the walk; ` +
  `the worst reaches ${(worstOverall * 1000).toFixed(1)} mm clear of it.`);
console.log('A vertex that stays inside at every phase is hidden and harmless.');
console.log('A vertex that is inside at rest and outside mid-stride is the fault');
console.log('seen on screen as a limb passing in and out of the body.');
