/**
 * Measure the figure's limbs against its body, through the walk cycle, with
 * no browser involved.
 *
 * The daily improvement routine cannot see the render, which makes the figure
 * the one part of the sanctuary it is nearly blind to: a skinning fault reads
 * as perfectly sensible code and only shows up on screen. This closes some of
 * that gap. It rebuilds the skeleton and the limb tubes from the numbers
 * `js/character.js` builds them from, drives them with the same walk pose, and
 * then asks the one question a still image cannot answer: does any limb
 * surface cross the body surface as the figure walks?
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
 * Every measurement comes from `js/figure.metrics.js`, which is the one place
 * the figure is described — this file used to restate those numbers and the
 * copies drifted, so for a while it measured a figure nobody shipped. Two
 * things are still written twice and are worth knowing about: the rest layout
 * of the skeleton, which follows from the shared `Y`, `X` and `CHAINS` and so
 * cannot drift numerically, and the walk pose, which is read off
 * `Character.update()` by hand and can.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import {
  Y, X, B, BONES, CHAINS, BAND, TORSO, PAD, RADIAL, ARM_OFFSET, HAND,
  armSections, legSections, sleeveSections, trouserSections,
  chainWeights, inflate, sectionAt
} from '../js/figure.metrics.js';

/** Above this the torso closes into a dome, so the ellipse stack stops being
 *  a fair description of it. */
const STACK_TOP = 1.41;

/* ---------------------------------------------------- reading the figure -- */

/**
 * The probe exists to be believed, so it refuses to measure anything it
 * cannot read.
 *
 * A named export that disappears already stops this file from loading at all.
 * A key quietly dropped from one of the tables would not: it would turn a
 * measurement into NaN, and a probe reporting NaN is worse than no probe.
 */
function number(label, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(
      `this probe reads ${label} out of js/figure.metrics.js, and it is no longer ` +
      `a number. The figure has been re-measured; bring the probe up to date with it.`);
  }
  return v;
}

function stack(label, secs) {
  if (!Array.isArray(secs) || secs.length < 2) {
    throw new Error(`this probe reads ${label} out of js/figure.metrics.js as a ` +
      `stack of sections, and it is no longer one.`);
  }
  secs.forEach((s, i) => {
    number(`${label}[${i}].y`, s.y);
    number(`${label}[${i}].rx`, s.rx);
    number(`${label}[${i}].rz`, s.rz);
  });
  return secs;
}

function chain(label, c) {
  if (!Array.isArray(c) || c.length < 2) {
    throw new Error(`this probe reads ${label} out of js/figure.metrics.js as a ` +
      `chain of bones, and it is no longer one.`);
  }
  c.forEach((j, i) => {
    number(`${label}[${i}].y`, j.y);
    if (!Number.isInteger(j.bone) || j.bone < 0 || j.bone >= BONES.length) {
      throw new Error(`${label}[${i}] names a bone this probe cannot find.`);
    }
  });
  return c;
}

/** Everything read out of the figure, checked before anything is measured. */
function checkMetrics() {
  for (const k of ['hips', 'chest', 'shoulder', 'elbow', 'wrist', 'knee', 'ankle']) {
    number(`Y.${k}`, Y[k]);
  }
  for (const k of ['shoulder', 'leg']) number(`X.${k}`, X[k]);
  number('ARM_OFFSET', ARM_OFFSET);
  for (const k of ['arm', 'leg']) number(`BAND.${k}`, BAND[k]);
  for (const k of ['arm', 'leg', 'sleeve', 'trouser']) number(`RADIAL.${k}`, RADIAL[k]);
  for (const k of ['top', 'seat']) number(`PAD.${k}`, PAD[k]);
  for (const part of ['palm', 'fingers', 'thumb']) {
    const spec = HAND[part];
    if (!spec || !Array.isArray(spec.slab) || spec.slab.length !== 4) {
      throw new Error(`HAND.${part} is no longer a rounded slab this probe can build.`);
    }
    spec.slab.forEach((v, i) => number(`HAND.${part}.slab[${i}]`, v));
    number(`HAND.${part}.y`, spec.y);
    number(`HAND.${part}.z`, spec.z);
  }
  number('HAND.thumb.x', HAND.thumb.x);
  number('HAND.thumb.tilt', HAND.thumb.tilt);
  for (const name of ['hips', 'chest', 'wristL', 'wristR']) {
    if (!Number.isInteger(B[name])) throw new Error(`B.${name} is no longer a bone.`);
  }
  for (const name of ['armL', 'armR', 'legL', 'legR']) chain(`CHAINS.${name}`, CHAINS[name]);
  stack('TORSO', TORSO);
  stack('armSections()', armSections());
  stack('legSections()', legSections());
  for (const long of [true, false]) stack(`sleeveSections(${long})`, sleeveSections(long));
  for (const wide of [true, false]) stack(`trouserSections(${wide})`, trouserSections(wide));
}

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

/** slab()'s vertices, for one part of the hand, placed the way it places it. */
function slabPoints(spec, s) {
  const [w, h, d, r] = spec.slab;
  const geo = new THREE.BoxGeometry(w, h, d, spec.segs, spec.segs, spec.segs);
  const p = geo.attributes.position;
  const hx = Math.max(0, w / 2 - r), hy = Math.max(0, h / 2 - r), hz = Math.max(0, d / 2 - r);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)),
          Math.max(-hz, Math.min(hz, v.z)));
    v.sub(c).normalize().multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  if (spec.tilt) geo.rotateZ(s * spec.tilt);
  geo.translate(s * (spec.x || 0), spec.y, spec.z);
  const pts = [];
  for (let i = 0; i < p.count; i++) {
    pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
  }
  geo.dispose();
  return pts;
}

/**
 * The hand, out on the arm's line the way `_handGeometry()` carries it.
 *
 * The two grooves are left out: they are a shading detail inside the block of
 * fingers, and nothing about them can reach the body the palm does not reach
 * first.
 */
function handPoints(s) {
  const pts = [];
  for (const part of ['palm', 'fingers', 'thumb']) {
    for (const p of slabPoints(HAND[part], s)) {
      pts.push([p[0] + s * ARM_OFFSET, p[1], p[2]]);
    }
  }
  return pts;
}

/* ------------------------------------------------------------- skinning -- */

function skinChainWeights(pts, chain, band) {
  return pts.map((p) => chainWeights(p[1], chain, band));
}

function skinToWeights(pts, bone) {
  return pts.map(() => [[bone, 1]]);
}

/**
 * The skeleton at rest. The offsets are all differences between shared
 * measurements, so they move when the figure does; only the parenting is
 * written out here, and it matches `Character._buildSkeleton()`.
 */
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

/**
 * Character.update()'s walk, at `r` of full speed.
 *
 * This is the one part of the figure still written out twice, because the
 * frame loop drives live bones and cannot hand its pose over. Read it against
 * `Character.update()` before trusting a surprising number out of this probe.
 */
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
  const shirt = inflate(TORSO, PAD.top, 0.82, 1.46);

  return [
    {
      name: 'bare arm',
      pts: loftPoints(armSections(), RADIAL.arm, true, true, s * ARM_OFFSET),
      chain: CHAINS['arm' + side], band: BAND.arm, body: TORSO, ref: B.chest
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
      pts: loftPoints(sleeveSections(false), RADIAL.sleeve, false, true, s * X.shoulder),
      chain: CHAINS['arm' + side], band: BAND.arm, body: shirt, ref: B.chest
    },
    {
      name: 'long sleeve',
      pts: loftPoints(sleeveSections(true), RADIAL.sleeve, false, true, s * X.shoulder),
      chain: CHAINS['arm' + side], band: BAND.arm, body: shirt, ref: B.chest
    },
    {
      name: 'bare leg',
      pts: loftPoints(legSections(), RADIAL.leg, true, false, s * X.leg),
      chain: CHAINS['leg' + side], band: BAND.leg, body: TORSO, ref: B.hips
    },
    {
      // the wide cut, which is the roomier of the two and so the one that has
      // the most of itself inside the seat of the trousers
      name: 'trouser leg',
      pts: loftPoints(trouserSections(true), RADIAL.trouser, false, true, s * X.leg),
      chain: CHAINS['leg' + side], band: BAND.leg,
      body: inflate(TORSO, PAD.seat, 0.82, 1.02), ref: B.hips
    }
  ];
}

checkMetrics();

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
