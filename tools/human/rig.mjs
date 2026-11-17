/**
 * The skeleton: from MakeHuman's 163-bone rig to the 49 bones the page animates.
 *
 * Three things happen here, in this order.
 *
 *  1. Joint positions are read off the *morphed* body, so a woman and a man each
 *     get a skeleton that fits them, rather than one shared rig stretched over both.
 *  2. The body is re-posed. MakeHuman stands in an A-pose with the forearms swung
 *     forward and the palms facing the floor; the page's animation wants arms that
 *     hang. Settling the pose is done here, once, with MakeHuman's own twist bones
 *     (upperarm01/02, lowerarm01/02) still in the rig so the roll of the forearm is
 *     spread along it, not squeezed into one joint. Baking it means the figure's
 *     bind pose already IS the neutral pose, and every bone starts world-aligned.
 *  3. The 163 bones are folded into 49: the face, toe and helper bones are merged
 *     into their nearest useful ancestor, and the twist pairs become one bone each.
 *     Fingers are kept — a hand that holds a glass needs them.
 *
 * Units here are metres, y up, the figure facing +z (MakeHuman's own convention).
 * The final coordinate flip to the page's facing is done at export.
 */
import fs from 'fs';
import path from 'path';
import { SRC } from './mh.mjs';

/* ------------------------------------------------------------- vectors -- */

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
};

// quaternions are [x, y, z, w]
export const Q = {
  id: () => [0, 0, 0, 1],
  axisAngle(axis, angle) {
    const a = V.norm(axis), s = Math.sin(angle / 2);
    return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
  },
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
  },
  apply(q, v) {
    const [x, y, z, w] = q;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx)
    ];
  },
  /** the shortest rotation taking direction a onto direction b */
  fromTo(a, b) {
    a = V.norm(a); b = V.norm(b);
    const d = V.dot(a, b);
    if (d > 0.999999) return [0, 0, 0, 1];
    if (d < -0.999999) {
      let ax = V.cross([1, 0, 0], a);
      if (V.len(ax) < 1e-6) ax = V.cross([0, 1, 0], a);
      return Q.axisAngle(ax, Math.PI);
    }
    const c = V.cross(a, b);
    const q = [c[0], c[1], c[2], 1 + d];
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
};

/** signed angle from a to b about axis, both projected onto the plane normal to it */
function signedAngle(a, b, axis) {
  const n = V.norm(axis);
  const pa = V.norm(V.sub(a, V.mul(n, V.dot(a, n))));
  const pb = V.norm(V.sub(b, V.mul(n, V.dot(b, n))));
  return Math.atan2(V.dot(V.cross(pa, pb), n), V.dot(pa, pb));
}

/* ------------------------------------------------------------ MH rig -- */

export function loadRig(pos) {
  const sk = JSON.parse(fs.readFileSync(path.join(SRC, 'default.mhskel'), 'utf8'));
  const w = JSON.parse(fs.readFileSync(path.join(SRC, 'default_weights.mhw'), 'utf8')).weights;
  const joint = (name) => {
    const ids = sk.joints[name];
    let x = 0, y = 0, z = 0;
    for (const i of ids) { x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; }
    const n = ids.length;
    return [x / n * 0.1, y / n * 0.1, z / n * 0.1];            // decimetres -> metres
  };
  const bones = {};
  for (const [name, b] of Object.entries(sk.bones)) {
    bones[name] = { name, parent: b.parent, head: joint(b.head), tail: joint(b.tail) };
  }
  // parents before children
  const order = [];
  const seen = new Set();
  const visit = (n) => {
    if (seen.has(n)) return;
    const p = bones[n].parent;
    if (p) visit(p);
    seen.add(n); order.push(n);
  };
  Object.keys(bones).forEach(visit);
  return { bones, order, weights: w };
}

/* --------------------------------------------------------- the re-pose -- */

/**
 * What the arms and legs should hang like. Directions are for the figure's LEFT
 * side (+x in MakeHuman's space); the right side is mirrored in x.
 */
const HANG = {
  upperarm: { dir: [0.215, -0.976, -0.030] },     // about 12 degrees out: a jacket needs air under the arm
  lowerarm: { dir: [0.115, -0.972, 0.200] },      // a little forward of the upper arm: a relaxed elbow
  hand: { dir: [0.075, -0.988, 0.130] },
  upperleg: { dir: [0.000, -1.000, 0.020] },
  lowerleg: { dir: [0.000, -1.000, 0.000] }
};

/** how far each finger joint curls at rest: a relaxed hand, not a board */
const REST_CURL = {
  1: [0.28, 0.20, 0.12],     // thumb
  2: [0.20, 0.34, 0.20],
  3: [0.24, 0.40, 0.24],
  4: [0.30, 0.46, 0.26],
  5: [0.36, 0.52, 0.28]
};

function side(name) { return name.endsWith('.L') ? 1 : name.endsWith('.R') ? -1 : 0; }
function mirrorX(v, s) { return [v[0] * s, v[1], v[2]]; }

/**
 * Settle the A-pose. Returns, for every MH bone, the rigid transform it applies
 * (head position and absolute rotation), plus the curl axes used for the fingers.
 */
export function repose(rig) {
  const { bones, order } = rig;
  const out = {};
  const palm = {};                       // per side: palm normal in rest space

  for (const s of [1, -1]) {
    const L = s === 1 ? '.L' : '.R';
    const wrist = bones['wrist' + L].head;
    const along = V.sub(bones['finger3-1' + L].head, wrist);
    const across = V.sub(bones['finger2-1' + L].head, bones['finger5-1' + L].head);
    let n = V.norm(V.cross(along, across));
    // the palm faces down-and-in when the hand rests flat; make the sign agree
    const want = [-s, -1, 0];
    if (V.dot(n, want) < 0) n = V.mul(n, -1);
    palm[s] = n;
  }

  // roll that turns the palm to face the thigh once the hand points down
  const roll = {};
  for (const s of [1, -1]) {
    const L = s === 1 ? '.L' : '.R';
    const b = bones['wrist' + L];
    const restDir = V.norm(V.sub(bones['finger3-1' + L].head, b.head));
    const target = V.norm(mirrorX(HANG.hand.dir, s));
    const q0 = Q.fromTo(restDir, target);
    const n1 = Q.apply(q0, palm[s]);
    roll[s] = signedAngle(n1, [-s, 0, 0], target);
  }

  const targetFor = (name) => {
    const s = side(name);
    const m = (d) => V.norm(mirrorX(d, s || 1));
    const base = name.replace(/\.[LR]$/, '');
    if (base === 'shoulder01') return null;
    if (base === 'upperarm01' || base === 'upperarm02') return { dir: m(HANG.upperarm.dir), roll: 0 };
    if (base === 'lowerarm01') return { dir: m(HANG.lowerarm.dir), roll: roll[s] * 0.25 };
    if (base === 'lowerarm02') return { dir: m(HANG.lowerarm.dir), roll: roll[s] * 0.62 };
    if (base === 'wrist') return { dir: m(HANG.hand.dir), roll: roll[s] };
    if (base === 'upperleg01' || base === 'upperleg02') return { dir: m(HANG.upperleg.dir), roll: 0 };
    if (base === 'lowerleg01' || base === 'lowerleg02') return { dir: m(HANG.lowerleg.dir), roll: 0 };
    if (base === 'foot') return { identity: true };
    return null;
  };

  const curlAxis = {};
  const curlWorld = {};
  for (const name of order) {
    const b = bones[name];
    const p = b.parent ? out[b.parent] : null;
    const restHead = b.head;
    const parentRest = b.parent ? bones[b.parent].head : restHead;
    const head = p ? V.add(p.head, Q.apply(p.R, V.sub(restHead, parentRest))) : restHead;

    let R = p ? p.R : Q.id();
    const t = targetFor(name);
    if (t && t.identity) R = Q.id();
    else if (t) {
      const restDir = V.norm(V.sub(b.tail, b.head));
      R = Q.mul(Q.axisAngle(t.dir, t.roll), Q.fromTo(restDir, t.dir));
    }

    // finger curl: a rotation about the knuckle's own axis, applied before the parent's
    const m = /^finger(\d)-(\d)\.([LR])$/.exec(name);
    if (m) {
      const s = m[3] === 'L' ? 1 : -1;
      const f = +m[1], j = +m[2];
      const restDir = V.norm(V.sub(b.tail, b.head));
      // flexion axis: perpendicular to both the finger and the palm normal
      let axis = V.cross(restDir, palm[s]);
      if (V.len(axis) < 1e-5) axis = V.cross(restDir, [0, 0, 1]);
      axis = V.norm(axis);
      curlAxis[name] = axis;
      // the same axis once the parent's pose has been applied: what a runtime curl rotates about
      curlWorld[name] = Q.apply(p ? p.R : Q.id(), axis);
      const ang = REST_CURL[f][j - 1];
      R = Q.mul(R, Q.axisAngle(axis, ang));
    }
    out[name] = { head, R };
  }
  return { transforms: out, curlAxis, curlWorld, palm, roll };
}

/** Apply the re-pose to a set of vertices with MakeHuman weights. */
export function poseVertices(rig, pose, pos, vertexWeights) {
  const out = new Float64Array(pos.length);
  const { bones } = rig;
  const nv = pos.length / 3;
  for (let v = 0; v < nv; v++) {
    const p = [pos[v * 3] * 0.1, pos[v * 3 + 1] * 0.1, pos[v * 3 + 2] * 0.1];
    let x = 0, y = 0, z = 0, sum = 0;
    for (const [bn, w] of vertexWeights[v]) {
      const t = pose.transforms[bn];
      const r = Q.apply(t.R, V.sub(p, bones[bn].head));
      x += (t.head[0] + r[0]) * w; y += (t.head[1] + r[1]) * w; z += (t.head[2] + r[2]) * w;
      sum += w;
    }
    if (!sum) { x = p[0]; y = p[1]; z = p[2]; sum = 1; }
    out[v * 3] = x / sum; out[v * 3 + 1] = y / sum; out[v * 3 + 2] = z / sum;
  }
  return out;
}

/** vertex -> [[boneName, weight], ...] for every vertex of the base mesh */
export function vertexWeights(rig, nVerts) {
  const per = Array.from({ length: nVerts }, () => []);
  for (const [bone, list] of Object.entries(rig.weights)) {
    for (const [v, w] of list) per[v].push([bone, w]);
  }
  return per;
}

/* ------------------------------------------------- the 49-bone skeleton -- */

/** The page's bone names, parent and the MH bone whose (posed) head gives its position. */
export function gameBones() {
  const list = [
    { name: 'hips', parent: null, at: 'spine05' },
    { name: 'spine', parent: 'hips', at: 'spine04' },
    { name: 'chest', parent: 'spine', at: 'spine02' },
    { name: 'neck', parent: 'chest', at: 'neck01' },
    { name: 'head', parent: 'neck', at: 'head' }
  ];
  for (const s of ['L', 'R']) {
    list.push(
      { name: 'clavicle' + s, parent: 'chest', at: `clavicle.${s}` },
      { name: 'shoulder' + s, parent: 'clavicle' + s, at: `upperarm01.${s}` },
      { name: 'elbow' + s, parent: 'shoulder' + s, at: `lowerarm01.${s}` },
      { name: 'wrist' + s, parent: 'elbow' + s, at: `wrist.${s}` },
      { name: 'hip' + s, parent: 'hips', at: `upperleg01.${s}` },
      { name: 'knee' + s, parent: 'hip' + s, at: `lowerleg01.${s}` },
      { name: 'ankle' + s, parent: 'knee' + s, at: `foot.${s}` }
    );
    const fn = ['thumb', 'index', 'middle', 'ring', 'pinky'];
    for (let f = 1; f <= 5; f++) {
      for (let j = 1; j <= 3; j++) {
        list.push({
          name: `${fn[f - 1]}${j}${s}`,
          parent: j === 1 ? 'wrist' + s : `${fn[f - 1]}${j - 1}${s}`,
          at: `finger${f}-${j}.${s}`
        });
      }
    }
  }
  return list;
}

/** Which game bone a given MH bone's weights are folded into. */
export function foldTarget(mhName) {
  const s = mhName.endsWith('.L') ? 'L' : mhName.endsWith('.R') ? 'R' : '';
  const base = mhName.replace(/\.[LR]$/, '');
  if (base === 'root' || base === 'spine05' || base.startsWith('pelvis')) return 'hips';
  if (base === 'spine04' || base === 'spine03') return 'spine';
  if (base === 'spine02' || base === 'spine01' || base === 'breast') return 'chest';
  if (base.startsWith('neck')) return 'neck';
  if (base === 'clavicle') return 'clavicle' + s;
  if (base === 'shoulder01' || base === 'upperarm01' || base === 'upperarm02') return 'shoulder' + s;
  if (base === 'lowerarm01' || base === 'lowerarm02') return 'elbow' + s;
  if (base === 'wrist' || base.startsWith('metacarpal')) return 'wrist' + s;
  const f = /^finger(\d)-(\d)$/.exec(base);
  if (f) return `${['thumb', 'index', 'middle', 'ring', 'pinky'][+f[1] - 1]}${f[2]}${s}`;
  if (base === 'upperleg01' || base === 'upperleg02') return 'hip' + s;
  if (base === 'lowerleg01' || base === 'lowerleg02') return 'knee' + s;
  if (base === 'foot' || base.startsWith('toe')) return 'ankle' + s;
  // head, jaw, eyes, tongue, every facial-muscle and "special" helper bone
  return 'head';
}

/**
 * Collapse a vertex's MH weights to at most four game bones, largest first, and
 * renormalise. Returns {joints:[4], weights:[4]} as indices into `names`.
 */
export function foldWeights(list, index) {
  const acc = new Map();
  for (const [bn, w] of list) {
    const t = foldTarget(bn);
    acc.set(t, (acc.get(t) || 0) + w);
  }
  const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0; for (const [, w] of top) sum += w;
  const joints = [0, 0, 0, 0], weights = [0, 0, 0, 0];
  top.forEach(([n, w], i) => { joints[i] = index.get(n); weights[i] = w / (sum || 1); });
  return { joints, weights };
}

/**
 * A garment's skin weights, inherited: each of its vertices blends the weights of
 * the three body vertices it is anchored to, by the same weights the fit uses.
 */
export function proxyWeights(mh, per) {
  return mh.refs.map((r) => {
    const acc = new Map();
    for (let k = 0; k < 3; k++) {
      if (!r.w[k]) continue;
      for (const [bn, w] of per[r.v[k]]) acc.set(bn, (acc.get(bn) || 0) + w * r.w[k]);
    }
    const list = [...acc.entries()].filter(([, w]) => w > 1e-4);
    return list.length ? list : per[r.v[0]];
  });
}
