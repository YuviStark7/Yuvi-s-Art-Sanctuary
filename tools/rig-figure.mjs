/**
 * Auto-rig the Fab female base mesh onto the sanctuary's own 17-bone skeleton.
 *
 * The source is a T-pose sculpting base mesh: no skeleton, no skin weights, no
 * UVs at all. What it does have is clean anatomy, which is the only thing we
 * want from it. So:
 *
 *   1. measure the mesh and find its landmarks (ankle, hip, shoulder, wrist)
 *   2. lay our own bone chain out in the mesh's proportions, still in T-pose
 *   3. weight every vertex against the bone segments
 *   4. export the skeleton in the sanctuary's REST layout (arms down) while
 *      writing inverse-bind matrices taken from the T-pose. That is precisely
 *      what a bind pose is for: at rest the arms fall to the sides on their
 *      own, and every animation we already have drives it unchanged.
 */
import fs from 'fs';
import { loadGLB, readAccessor } from './glb-read.mjs';
import { GLBBuilder } from './glb-write.mjs';

const SRC = process.argv[2];
const OUT = process.argv[3];

/* the sanctuary's figure, in metres off the floor (mirrors js/character.js) */
const Y = {
  hips: 0.95, spine: 1.09, chest: 1.26, neck: 1.44, head: 1.615,
  shoulder: 1.41, elbow: 1.13, wrist: 0.88,
  knee: 0.51, ankle: 0.09
};
const X = { shoulder: 0.183, leg: 0.084 };
const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR'
];
const B = {}; BONES.forEach((n, i) => { B[n] = i; });

/* ---------------------------------------------------------------- maths -- */

function matMul(a, b) {                    // column-major 4x4, a then b
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
function applyMat(m, x, y, z) {
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14]
  ];
}
function applyMat3(m, x, y, z) {           // directions: ignore translation
  return [m[0]*x + m[4]*y + m[8]*z, m[1]*x + m[5]*y + m[9]*z, m[2]*x + m[6]*y + m[10]*z];
}
function invertAffine(m) {
  // rotation+scale block inverse, then translation
  const a = [m[0], m[1], m[2]], b = [m[4], m[5], m[6]], c = [m[8], m[9], m[10]];
  const det = a[0]*(b[1]*c[2]-b[2]*c[1]) - b[0]*(a[1]*c[2]-a[2]*c[1]) + c[0]*(a[1]*b[2]-a[2]*b[1]);
  const id = 1 / det;
  const o = new Float64Array(16);
  o[0] =  (b[1]*c[2]-b[2]*c[1])*id; o[1] = -(a[1]*c[2]-a[2]*c[1])*id; o[2] =  (a[1]*b[2]-a[2]*b[1])*id;
  o[4] = -(b[0]*c[2]-b[2]*c[0])*id; o[5] =  (a[0]*c[2]-a[2]*c[0])*id; o[6] = -(a[0]*b[2]-a[2]*b[0])*id;
  o[8] =  (b[0]*c[1]-b[1]*c[0])*id; o[9] = -(a[0]*c[1]-a[1]*c[0])*id; o[10] = (a[0]*b[1]-a[1]*b[0])*id;
  const t = [m[12], m[13], m[14]];
  o[12] = -(o[0]*t[0] + o[4]*t[1] + o[8]*t[2]);
  o[13] = -(o[1]*t[0] + o[5]*t[1] + o[9]*t[2]);
  o[14] = -(o[2]*t[0] + o[6]*t[1] + o[10]*t[2]);
  o[15] = 1;
  return o;
}
function translation(x, y, z) {
  const m = new Float64Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

/* ------------------------------------------------------- read the source -- */

const { json: g, bin } = loadGLB(SRC);

// compose each mesh node's world matrix
const worldOf = new Map();
(function walk(nodeIndex, parent) {
  const n = g.nodes[nodeIndex];
  let local;
  if (n.matrix) local = Float64Array.from(n.matrix);
  else {
    local = new Float64Array(16); local[0] = local[5] = local[10] = local[15] = 1;
    if (n.translation) { local[12] = n.translation[0]; local[13] = n.translation[1]; local[14] = n.translation[2]; }
  }
  const world = matMul(parent, local);
  if (n.mesh !== undefined) worldOf.set(n.mesh, world);
  for (const c of (n.children || [])) walk(c, world);
})(g.scenes[0].nodes[0], (() => { const i = new Float64Array(16); i[0]=i[5]=i[10]=i[15]=1; return i; })());

// body only; the eyeballs are separate meshes we rebuild ourselves
const bodyMeshIndex = 0;
const p = g.meshes[bodyMeshIndex].primitives[0];
const srcPos = readAccessor(g, bin, p.attributes.POSITION).data;
const srcNrm = readAccessor(g, bin, p.attributes.NORMAL).data;
const srcIdx = readAccessor(g, bin, p.indices).data;
const W = worldOf.get(bodyMeshIndex);

const nv = srcPos.length / 3;
const P = new Float64Array(nv * 3);
const N = new Float64Array(nv * 3);
for (let i = 0; i < nv; i++) {
  const [x, y, z] = applyMat(W, srcPos[i*3], srcPos[i*3+1], srcPos[i*3+2]);
  P[i*3] = x; P[i*3+1] = y; P[i*3+2] = z;
  const [nx, ny, nz] = applyMat3(W, srcNrm[i*3], srcNrm[i*3+1], srcNrm[i*3+2]);
  const l = Math.hypot(nx, ny, nz) || 1;
  N[i*3] = nx/l; N[i*3+1] = ny/l; N[i*3+2] = nz/l;
}

/* ------------------------------------------------------------ landmarks -- */

const bb = { min: [1e9,1e9,1e9], max: [-1e9,-1e9,-1e9] };
for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) {
  const v = P[i*3+k]; if (v < bb.min[k]) bb.min[k] = v; if (v > bb.max[k]) bb.max[k] = v;
}
const rawH = bb.max[1] - bb.min[1];

// In a T-pose the arms are the widest thing in the mesh; the height band where
// |x| stays near maximum is the arm line, and that gives us shoulder height.
const SLICES = 400;
const halfW = new Float64Array(SLICES);
const zMin = new Float64Array(SLICES).fill(1e9);
const zMax = new Float64Array(SLICES).fill(-1e9);
const count = new Int32Array(SLICES);
for (let i = 0; i < nv; i++) {
  const h = (P[i*3+1] - bb.min[1]) / rawH;
  const s = Math.min(SLICES - 1, Math.max(0, Math.floor(h * SLICES)));
  const ax = Math.abs(P[i*3]);
  if (ax > halfW[s]) halfW[s] = ax;
  if (P[i*3+2] < zMin[s]) zMin[s] = P[i*3+2];
  if (P[i*3+2] > zMax[s]) zMax[s] = P[i*3+2];
  count[s]++;
}
let armSlice = 0;
for (let s = 0; s < SLICES; s++) if (halfW[s] > halfW[armSlice]) armSlice = s;
const armY = bb.min[1] + (armSlice + 0.5) / SLICES * rawH;
const armTipX = halfW[armSlice];

// crotch: walking up from the feet, the first height where the two legs merge
let crotchY = bb.min[1] + rawH * 0.5;
{
  // count distinct x-clusters per slice by looking for a gap near x = 0
  for (let s = Math.floor(SLICES * 0.35); s < SLICES * 0.62; s++) {
    let nearAxis = 0;
    const lo = bb.min[1] + s / SLICES * rawH, hi = bb.min[1] + (s + 1) / SLICES * rawH;
    for (let i = 0; i < nv; i++) {
      const y = P[i*3+1];
      if (y < lo || y >= hi) continue;
      if (Math.abs(P[i*3]) < rawH * 0.012) nearAxis++;
    }
    if (nearAxis > 0) { crotchY = lo; break; }
  }
}

// crown of the head and the narrowest point below it = the neck
let neckSlice = Math.floor(SLICES * 0.86);
{
  const lo = Math.floor(SLICES * 0.80), hi = Math.floor(SLICES * 0.93);
  let best = 1e9;
  for (let s = lo; s < hi; s++) {
    if (count[s] < 8) continue;
    if (halfW[s] < best) { best = halfW[s]; neckSlice = s; }
  }
}
const neckY = bb.min[1] + (neckSlice + 0.5) / SLICES * rawH;

console.log(`source height ${rawH.toFixed(3)}  bbox X[${bb.min[0].toFixed(2)},${bb.max[0].toFixed(2)}] Y[${bb.min[1].toFixed(2)},${bb.max[1].toFixed(2)}] Z[${bb.min[2].toFixed(2)},${bb.max[2].toFixed(2)}]`);
console.log(`landmarks: shoulder line y=${armY.toFixed(3)} (${((armY-bb.min[1])/rawH*100).toFixed(1)}%), arm tip |x|=${armTipX.toFixed(3)}, crotch y=${crotchY.toFixed(3)}, neck y=${neckY.toFixed(3)}`);

/* --------------------------------------------------- fit to our figure --- */

// Scale so the shoulder line lands at our shoulder height; that keeps the
// torso, which is what the clothes are cut for, in proportion.
const scale = (Y.shoulder - Y.ankle) / (armY - bb.min[1] - 0.02);
const lift = Y.ankle - bb.min[1] * scale;
console.log(`scale ${scale.toFixed(4)} -> height ${(rawH * scale).toFixed(3)} m`);

for (let i = 0; i < nv; i++) {
  P[i*3] *= scale;
  P[i*3+1] = P[i*3+1] * scale + lift;
  P[i*3+2] *= scale;
}
const fitArmY = armY * scale + lift;
const fitArmTip = armTipX * scale;
const fitCrotch = crotchY * scale + lift;
const fitNeck = neckY * scale + lift;
let fitTop = -1e9; for (let i = 0; i < nv; i++) fitTop = Math.max(fitTop, P[i*3+1]);
console.log(`fitted: shoulder ${fitArmY.toFixed(3)} armtip ${fitArmTip.toFixed(3)} crotch ${fitCrotch.toFixed(3)} neck ${fitNeck.toFixed(3)} crown ${fitTop.toFixed(3)}`);

/* ------------------------------------ T-pose skeleton in mesh proportions -- */

// Joint positions in the mesh's own T-pose, world space.
const shoulderX = fitArmTip * 0.185;     // where the arm leaves the torso
const elbowX = fitArmTip * 0.55;
const wristX = fitArmTip * 0.88;
const T = {};
T.hips     = [0, fitCrotch + (fitArmY - fitCrotch) * 0.10, 0];
T.spine    = [0, T.hips[1] + (fitArmY - T.hips[1]) * 0.30, 0];
T.chest    = [0, T.hips[1] + (fitArmY - T.hips[1]) * 0.68, 0];
T.neck     = [0, fitNeck, 0];
T.head     = [0, fitNeck + (fitTop - fitNeck) * 0.42, 0];
for (const side of ['L', 'R']) {
  const s = side === 'L' ? -1 : 1;
  T['shoulder' + side] = [s * shoulderX, fitArmY, 0];
  T['elbow' + side]    = [s * elbowX,    fitArmY, 0];
  T['wrist' + side]    = [s * wristX,    fitArmY, 0];
  T['hip' + side]      = [s * X.leg,     T.hips[1], 0];
  T['knee' + side]     = [s * X.leg,     Y.knee,   0];
  T['ankle' + side]    = [s * X.leg,     Y.ankle,  0];
}

/* --------------------------------------------------------- skin weights -- */

const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  shoulderL: 'chest', elbowL: 'shoulderL', wristL: 'elbowL',
  shoulderR: 'chest', elbowR: 'shoulderR', wristR: 'elbowR',
  hipL: 'hips', kneeL: 'hipL', ankleL: 'kneeL',
  hipR: 'hips', kneeR: 'hipR', ankleR: 'kneeR'
};

// Each bone owns the segment from itself to its children; a vertex is weighted
// by distance to those segments. Falloff is sharp enough that an elbow bends
// cleanly, soft enough that the skin does not tear at the joint.
const SEGMENTS = [];
for (const name of BONES) {
  const kids = BONES.filter((k) => PARENT[k] === name);
  if (kids.length === 0) {
    // a tip bone: give it a stub so hands and feet still attract weight
    const par = PARENT[name];
    if (par) {
      const d = [T[name][0] - T[par][0], T[name][1] - T[par][1], T[name][2] - T[par][2]];
      const l = Math.hypot(...d) || 1;
      SEGMENTS.push({ bone: name, a: T[name], b: [T[name][0] + d[0]/l*0.09, T[name][1] + d[1]/l*0.09, T[name][2] + d[2]/l*0.09] });
    }
    continue;
  }
  for (const k of kids) {
    if (k === 'shoulderL' || k === 'shoulderR' || k === 'hipL' || k === 'hipR' || k === 'neck') {
      // structural children: do not let the chest own the whole arm
      if (k === 'neck') SEGMENTS.push({ bone: name, a: T[name], b: T[k] });
      continue;
    }
    SEGMENTS.push({ bone: name, a: T[name], b: T[k] });
  }
}
// the hips need a body of their own (pelvis block)
SEGMENTS.push({ bone: 'hips', a: [0, T.hips[1] - 0.06, 0], b: [0, T.hips[1] + 0.03, 0] });

function distToSegment(px, py, pz, a, b) {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const apx = px-a[0], apy = py-a[1], apz = pz-a[2];
  const ab2 = abx*abx + aby*aby + abz*abz;
  let t = ab2 > 0 ? (apx*abx + apy*aby + apz*abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = apx - abx*t, dy = apy - aby*t, dz = apz - abz*t;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

const JOINTS = new Uint8Array(nv * 4);
const WEIGHTS = new Float32Array(nv * 4);
const FALLOFF = 3.4;

for (let i = 0; i < nv; i++) {
  const px = P[i*3], py = P[i*3+1], pz = P[i*3+2];
  const scores = new Map();
  for (const seg of SEGMENTS) {
    const d = Math.max(0.012, distToSegment(px, py, pz, seg.a, seg.b));
    const w = 1 / Math.pow(d, FALLOFF);
    scores.set(seg.bone, Math.max(scores.get(seg.bone) || 0, w));
  }
  const top = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  let sum = 0; for (const [, w] of top) sum += w;
  for (let k = 0; k < 4; k++) {
    if (k < top.length) {
      JOINTS[i*4+k] = B[top[k][0]];
      WEIGHTS[i*4+k] = top[k][1] / sum;
    } else { JOINTS[i*4+k] = 0; WEIGHTS[i*4+k] = 0; }
  }
}

/* ------------------------------------------- rest layout + bind matrices -- */

// Our rest layout, as local translations (exactly js/character.js).
const REST_LOCAL = {
  hips: [0, Y.hips, 0],
  spine: [0, Y.spine - Y.hips, 0],
  chest: [0, Y.chest - Y.spine, 0],
  neck: [0, Y.neck - Y.chest, 0],
  head: [0, Y.head - Y.neck, 0]
};
for (const side of ['L', 'R']) {
  const s = side === 'L' ? -1 : 1;
  REST_LOCAL['shoulder' + side] = [s * X.shoulder, Y.shoulder - Y.chest, 0];
  REST_LOCAL['elbow' + side] = [0, Y.elbow - Y.shoulder, 0];
  REST_LOCAL['wrist' + side] = [0, Y.wrist - Y.elbow, 0];
  REST_LOCAL['hip' + side] = [s * X.leg, 0, 0];
  REST_LOCAL['knee' + side] = [0, Y.knee - Y.hips, 0];
  REST_LOCAL['ankle' + side] = [0, Y.ankle - Y.knee, 0];
}

// Inverse bind matrices come from the T-pose the mesh is actually in.
//
// Position alone is not enough. three.js skins with boneWorld * inverseBind,
// so if the bind matrix carries no rotation each bone merely SLIDES its
// vertices to wherever the rest pose put it — arms drop as disconnected
// segments instead of swinging down. The bind matrix has to record which way
// the bone was pointing when the mesh was made.
//
// In our rest layout every bone's child sits along its local -Y (arms hang,
// legs descend) or +Y (up the spine), with no rotation anywhere. In the source
// T-pose the spine and legs already agree with that; only the arms differ,
// running out along -X on the left and +X on the right. So the arm bones get a
// quarter turn about Z and everything else stays upright.
function rotZ(theta) {
  const c = Math.cos(theta), s2 = Math.sin(theta);
  const m = new Float64Array(16);
  m[0] = c; m[1] = s2; m[4] = -s2; m[5] = c; m[10] = 1; m[15] = 1;
  return m;
}
const ARM_ROLL = {                       // maps local -Y onto the T-pose arm
  L: -Math.PI / 2,                       // ... out along -X
  R:  Math.PI / 2                        // ... out along +X
};
function bindMatrix(name) {
  const t = translation(T[name][0], T[name][1], T[name][2]);
  const side = /(shoulder|elbow|wrist)([LR])$/.exec(name);
  if (!side) return t;
  return matMul(t, rotZ(ARM_ROLL[side[2]]));
}

const invBind = new Float32Array(BONES.length * 16);
BONES.forEach((name, i) => {
  const m = invertAffine(bindMatrix(name));
  for (let k = 0; k < 16; k++) invBind[i * 16 + k] = m[k];
});

/* ------------------------------------------------------------- write it -- */

const b = new GLBBuilder();

// bone nodes
const nodeOf = {};
BONES.forEach((name) => {
  b.g.nodes.push({ name, translation: REST_LOCAL[name].slice() });
  nodeOf[name] = b.g.nodes.length - 1;
});
BONES.forEach((name) => {
  const kids = BONES.filter((k) => PARENT[k] === name);
  if (kids.length) b.g.nodes[nodeOf[name]].children = kids.map((k) => nodeOf[k]);
});

b.g.materials.push({
  name: 'Skin',
  pbrMetallicRoughness: { baseColorFactor: [0.86, 0.71, 0.62, 1], metallicFactor: 0, roughnessFactor: 0.78 }
});

const attrs = {
  POSITION: b.accessor(Float32Array.from(P), 'VEC3', 5126, { minmax: true, target: 34962 }),
  NORMAL:   b.accessor(Float32Array.from(N), 'VEC3', 5126, { target: 34962 }),
  JOINTS_0: b.accessor(JOINTS, 'VEC4', 5121, { target: 34962 }),
  WEIGHTS_0: b.accessor(WEIGHTS, 'VEC4', 5126, { target: 34962 })
};
const indices = b.accessor(Uint16Array.from(srcIdx), 'SCALAR', 5123, { target: 34963 });
b.g.meshes.push({ name: 'Body', primitives: [{ attributes: attrs, indices, material: 0 }] });

const ibmAccessor = b.accessor(invBind, 'MAT4', 5126, {});
b.g.skins = [{ name: 'Figure', joints: BONES.map((n) => nodeOf[n]), inverseBindMatrices: ibmAccessor, skeleton: nodeOf.hips }];

b.g.nodes.push({ name: 'BodyMesh', mesh: 0, skin: 0 });
const meshNode = b.g.nodes.length - 1;
b.g.scenes[0].nodes.push(nodeOf.hips, meshNode);

const size = b.write(OUT);
console.log(`\nwrote ${OUT}  ${(size / 1024).toFixed(0)} KB, ${nv} verts, ${srcIdx.length / 3} tris`);

// sanity: weight sums
let bad = 0;
for (let i = 0; i < nv; i++) {
  const s = WEIGHTS[i*4] + WEIGHTS[i*4+1] + WEIGHTS[i*4+2] + WEIGHTS[i*4+3];
  if (Math.abs(s - 1) > 1e-3) bad++;
}
console.log(`weight sums off by >1e-3: ${bad} / ${nv}`);
