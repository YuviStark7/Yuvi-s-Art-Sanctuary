/**
 * Build the DJ: models/figure-cyborg.glb, from the same CC0 MakeHuman parts as the visitors.
 *
 *   node tools/human/cyborg.mjs        (after the fetch steps in README.md)
 *
 * What differs from build.mjs: no clothes, so the whole body is kept; every body vertex carries
 * `_CHROME`, how far inside the plated half it lies (0.5 is the seam, and the page sharpens it);
 * and the relief that would show anatomical detail through a plate is smoothed away first.
 * Her hair here is only the swept-back base: the curls, headphones and flower are made by the page.
 */
import fs from 'fs';
import path from 'path';
import { GLBBuilder } from '../glb-write.mjs';
import { SRC, parseObj, macroBody, buildMesh, smoothNormals } from './mh.mjs';
import { parseMhclo, loadProxyMesh, fitProxy, parseMhmat } from './mhclo.mjs';
import { loadRig, repose, poseVertices, vertexWeights, proxyWeights, gameBones, foldWeights } from './rig.mjs';
import { webp, bleed } from './tex.mjs';

const SYS = path.join(SRC, 'assets', 'makehuman_system_assets');
const HEIGHT = 1.72;
const SKIN = 'skins/young_caucasian_female/young_lightskinned_female_diffuse.png';

const base = parseObj(path.join(SRC, 'base.obj'));
const bodyGroup = base.groups.indexOf('body');
const nV = base.pos.length / 3;
const pos = macroBody(base, { gender: 0, race: { caucasian: 0.7, asian: 0.15, african: 0.15 } });
const rig = loadRig(pos);
const per = vertexWeights(rig, nV);
const pose = repose(rig);
const posed = poseVertices(rig, pose, pos, per);            // metres, y up, facing +z, her left = +x

const bones = gameBones();
const index = new Map(bones.map((b, i) => [b.name, i]));
const bonePos = bones.map((b) => pose.transforms[b.at].head);
const joint = (name) => bonePos[index.get(name)];

/* ------------------------------------------------------ the body mesh -- */

const bodyFaces = base.faces.filter((f) => f.g === bodyGroup);
const used = new Set();
for (const f of bodyFaces) for (const v of f.v) used.add(v);
const P = (v) => [posed[v * 3], posed[v * 3 + 1], posed[v * 3 + 2]];

const groupCentre = (name) => {
  const gi = base.groups.indexOf(name);
  const ids = new Set();
  for (const f of base.faces) if (f.g === gi) for (const v of f.v) ids.add(v);
  const c = [0, 0, 0];
  for (const v of ids) { const p = P(v); c[0] += p[0] / ids.size; c[1] += p[1] / ids.size; c[2] += p[2] / ids.size; }
  return c;
};
const eyeL = groupCentre('joint-l-eye'), eyeR = groupCentre('joint-r-eye');
const neckY = joint('neck')[1], headY = joint('head')[1];
const chinY = eyeL[1] - 0.115;
const shoulderY = joint('shoulderL')[1];
const waistY = joint('spine')[1];

// the breasts' foremost points: what a plate must lie smoothly over
const apex = [1, -1].map((side) => {
  let best = null;
  for (const v of used) {
    const p = P(v);
    if (p[0] * side < 0.04 || p[0] * side > 0.16 || p[1] > shoulderY - 0.06 || p[1] < waistY + 0.06) continue;
    if (!best || p[2] > best[2]) best = p;
  }
  return best;
});
const groinY = joint('hipL')[1] - 0.055;

/** Laplacian smoothing of the vertices near a point: removes small relief, keeps the form. */
const neighbours = new Map();
for (const f of bodyFaces) {
  for (let i = 0; i < f.v.length; i++) {
    const a = f.v[i], b = f.v[(i + 1) % f.v.length];
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    if (!neighbours.has(b)) neighbours.set(b, new Set());
    neighbours.get(a).add(b); neighbours.get(b).add(a);
  }
}
function smoothNear(centre, radius, passes) {
  const near = [...used].filter((v) => Math.hypot(...P(v).map((x, k) => x - centre[k])) < radius);
  for (let pass = 0; pass < passes; pass++) {
    const next = near.map((v) => {
      const c = [0, 0, 0], n = neighbours.get(v);
      for (const u of n) { const p = P(u); c[0] += p[0] / n.size; c[1] += p[1] / n.size; c[2] += p[2] / n.size; }
      return c;
    });
    near.forEach((v, i) => { for (let k = 0; k < 3; k++) posed[v * 3 + k] += 0.6 * (next[i][k] - posed[v * 3 + k]); });
  }
  return near.length;
}
const smoothed = [
  smoothNear(apex[0], 0.032, 40),
  smoothNear(apex[1], 0.032, 40),
  smoothNear([0, groinY, joint('hips')[2] + 0.08], 0.11, 30)
];

/* ----------------------------------------------- where the plates are -- */

const ARM = /^(shoulder|elbow|wrist|thumb|index|middle|ring|pinky)\d?([LR])$/;
function armWeight(v) {
  const f = foldWeights(per[v], index);
  let left = 0, right = 0;
  f.joints.forEach((j, k) => {
    const m = ARM.exec(bones[j].name);
    if (m) { if (m[2] === 'L') left += f.weights[k]; else right += f.weights[k]; }
  });
  return [left, right];
}
const toSegment = (p, a, b) => {
  const ab = b.map((x, k) => x - a[k]), ap = p.map((x, k) => x - a[k]);
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) /
                                    (ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t);
};
// the seam that runs from under her left eye, down the cheek and jaw, into the neck
const cheek = [
  [eyeL[0] + 0.012, eyeL[1] - 0.006, eyeL[2] + 0.012],
  [eyeL[0] + 0.030, eyeL[1] - 0.052, eyeL[2] - 0.004],
  [0.046, chinY + 0.012, eyeL[2] - 0.035],
  [0.030, neckY + 0.02, joint('neck')[2] + 0.04]
];
const chestZ = joint('chest')[2] + 0.02;

/** Signed distance, metres, into the plated region (positive = chrome). */
function plated(v) {
  const [x, y, z] = P(v);
  const [armL, armR] = armWeight(v);
  if (armL > 0.5) return 0.03;                                          // her left arm is all machine
  if (armR > 0.5) return -0.03;                                         // her right arm is all skin
  let d = -1;
  const front = z - chestZ;
  // everything from under the bust down
  const under = apex[0][1] - 0.062 + 0.05 * Math.min(1, (x * x) / 0.03);
  d = Math.max(d, under - y);
  // the bust, both sides, generously: a wide band that dips at the middle
  const over = apex[0][1] + 0.052 + 0.035 * Math.min(1, Math.abs(x) / 0.11) - 0.05 * Math.exp(-(x * x) / 0.0006);
  d = Math.max(d, Math.min(over - y, y - under + 0.04, front));
  // her left side of the trunk, with a waving seam
  if (y < neckY + 0.01) d = Math.max(d, x - 0.012 * Math.sin(y * 34) + 0.004);
  // the spine
  if (y < neckY && z < chestZ) d = Math.max(d, 0.034 - Math.abs(x));
  // the neck
  if (Math.abs(x) < 0.085) d = Math.max(d, Math.min(y - (neckY - 0.045 + 0.4 * Math.abs(x)), chinY - 0.004 + Math.max(0, -z + eyeL[2] - 0.05) - y));
  // the cheek seam, widening toward the neck
  for (let i = 0; i < cheek.length - 1; i++) d = Math.max(d, (0.008 + i * 0.006) - toSegment([x, y, z], cheek[i], cheek[i + 1]));
  return d;
}

const chromeOf = new Float32Array(nV);
for (const v of used) chromeOf[v] = Math.max(0, Math.min(1, 0.5 + plated(v) * 28));

/* ------------------------------------------------------------- parts -- */

const proxy = (file) => {
  const mh = parseMhclo(file);
  const obj = loadProxyMesh(mh);
  const fitted = fitProxy(mh, pos);
  const pw = proxyWeights(mh, per);
  const mesh = buildMesh(obj, poseVertices(rig, pose, fitted, pw), null);
  return { mh, mesh, weights: pw };
};
const sys = (dir, name) => path.join(SYS, dir, name, name + '.mhclo');

const bodyMesh = buildMesh(base, posed, (f) => f.g === bodyGroup);
const eyes = proxy(path.join(SRC, 'eyes', 'high-poly.mhclo'));
const lashes = proxy(sys('eyelashes', 'eyelashes02'));
const brows = proxy(sys('eyebrows', 'eyebrow008'));
const hair = proxy(sys('hair', 'ponytail01'));

// keep the swept-back cap of the hair and drop the tail: the page puts curls up there instead
{
  const m = hair.mesh, kept = [];
  const tail = (i) => m.P[i * 3 + 1] < eyeL[1] - 0.01 && m.P[i * 3 + 2] < joint('head')[2] - 0.02;
  const behind = (i) => m.P[i * 3 + 2] < joint('head')[2] - 0.135;
  for (let t = 0; t < m.I.length; t += 3) {
    const tri = [m.I[t], m.I[t + 1], m.I[t + 2]];
    if (!tri.some((i) => tail(i) || behind(i))) kept.push(...tri);
  }
  m.I = Uint32Array.from(kept);
}

/* --------------------------------------------- place: facing -z, feet 0 -- */

const meshes = [bodyMesh, eyes.mesh, lashes.mesh, brows.mesh, hair.mesh];
let floor = 1e9, top = -1e9;
for (let i = 1; i < bodyMesh.P.length; i += 3) { floor = Math.min(floor, bodyMesh.P[i]); top = Math.max(top, bodyMesh.P[i]); }
const scale = HEIGHT / (top - floor);
const place = (p) => [-p[0] * scale, (p[1] - floor) * scale, -p[2] * scale];
for (const m of meshes) {
  for (let i = 0; i < m.P.length; i += 3) {
    const q = place([m.P[i], m.P[i + 1], m.P[i + 2]]);
    m.P[i] = q[0]; m.P[i + 1] = q[1]; m.P[i + 2] = q[2];
  }
}
const bonePlaced = bonePos.map(place);

/* ------------------------------------------------------------- write -- */

const b = new GLBBuilder();
b.g.extensionsUsed = ['KHR_mesh_quantization', 'EXT_texture_webp'];
b.g.extensionsRequired = ['KHR_mesh_quantization'];

const nodeOf = [];
bones.forEach((bn, i) => {
  const parent = bn.parent ? index.get(bn.parent) : -1;
  const p = bonePlaced[i], pp = parent >= 0 ? bonePlaced[parent] : [0, 0, 0];
  b.g.nodes.push({ name: bn.name, translation: [p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]] });
  nodeOf.push(b.g.nodes.length - 1);
});
bones.forEach((bn, i) => {
  if (bn.parent) (b.g.nodes[nodeOf[index.get(bn.parent)]].children ||= []).push(nodeOf[i]);
});
for (const name of Object.keys(pose.curlWorld)) {
  const m = /^finger(\d)-(\d)\.([LR])$/.exec(name);
  const game = `${['thumb', 'index', 'middle', 'ring', 'pinky'][+m[1] - 1]}${m[2]}${m[3]}`;
  const a = pose.curlWorld[name];
  b.g.nodes[nodeOf[index.get(game)]].extras = { curl: [-a[0], a[1], -a[2]] };
}
const ibm = new Float32Array(bones.length * 16);
bones.forEach((_, i) => {
  const p = bonePlaced[i];
  ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16);
});
b.g.skins = [{ name: 'figure', joints: nodeOf, inverseBindMatrices: b.accessor(ibm, 'MAT4', 5126, {}), skeleton: nodeOf[0] }];

const tex = (buf) => {
  const img = b.image(buf, 'image/webp');
  (b.g.textures ||= []).push({ sampler: 0, extensions: { EXT_texture_webp: { source: img } } });
  if (!b.g.samplers) b.g.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
  return b.g.textures.length - 1;
};
const material = (m) => { b.g.materials.push(m); return b.g.materials.length - 1; };

function prim(mesh, weights, mat, extra) {
  const nv = mesh.P.length / 3;
  const nrm = smoothNormals(mesh);
  const n8 = new Int8Array(nv * 4);
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) n8[i * 4 + k] = Math.round(nrm[i * 3 + k] * 127);
  const joints = new Uint8Array(nv * 4), wts = new Uint8Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const f = foldWeights(weights[mesh.src[v]], index);
    let sum = 0;
    for (let k = 0; k < 4; k++) { joints[v * 4 + k] = f.joints[k]; wts[v * 4 + k] = Math.round(f.weights[k] * 255); sum += wts[v * 4 + k]; }
    wts[v * 4] += 255 - sum;
  }
  let lo = 1e9, hi = -1e9;
  for (const u of mesh.UV) { lo = Math.min(lo, u); hi = Math.max(hi, u); }
  const inRange = lo >= 0 && hi <= 1;
  const attributes = {
    POSITION: b.accessor(mesh.P, 'VEC3', 5126, { minmax: true, target: 34962 }),
    NORMAL: b.accessor(n8, 'VEC3', 5120, { target: 34962, normalized: true, stride: 4, count: nv }),
    TEXCOORD_0: inRange
      ? b.accessor(Uint16Array.from(mesh.UV, (u) => Math.round(u * 65535)), 'VEC2', 5123, { target: 34962, normalized: true })
      : b.accessor(mesh.UV, 'VEC2', 5126, { target: 34962 }),
    JOINTS_0: b.accessor(joints, 'VEC4', 5121, { target: 34962 }),
    WEIGHTS_0: b.accessor(wts, 'VEC4', 5121, { target: 34962, normalized: true })
  };
  if (extra) Object.assign(attributes, extra(mesh));
  const big = nv > 65535;
  return { attributes, indices: b.accessor(big ? mesh.I : Uint16Array.from(mesh.I), 'SCALAR', big ? 5125 : 5123, { target: 34963 }), material: mat };
}

const sceneNodes = [nodeOf[0]];
function meshNode(name, primitive) {
  b.g.meshes.push({ name, primitives: [primitive] });
  b.g.nodes.push({ name, mesh: b.g.meshes.length - 1, skin: 0 });
  sceneNodes.push(b.g.nodes.length - 1);
}

const skinMat = material({ name: 'skin', pbrMetallicRoughness: {
  baseColorTexture: { index: tex(webp(path.join(SYS, SKIN), { size: 1024, quality: 84 })) }, metallicFactor: 0, roughnessFactor: 0.5 } });
meshNode('body', prim(bodyMesh, per, skinMat, (mesh) => {
  // padded to four bytes per vertex, as vertex attributes must be
  const data = new Uint8Array(mesh.P.length / 3 * 4);
  mesh.src.forEach((v, i) => { data[i * 4] = Math.round(chromeOf[v] * 255); });
  return { _CHROME: b.accessor(data, 'SCALAR', 5121, { target: 34962, normalized: true, stride: 4, count: mesh.src.length }) };
}));

const eyeMat = material({ name: 'eye', alphaMode: 'MASK', alphaCutoff: 0.5, pbrMetallicRoughness: {
  baseColorTexture: { index: tex(webp(path.join(SYS, 'eyes', 'materials', 'brown_eye.png'), { size: 256, quality: 85 })) }, metallicFactor: 0, roughnessFactor: 0.15 } });
meshNode('eyes', prim(eyes.mesh, eyes.weights, eyeMat));

function cutout(name, part, size, cutoff, factor) {
  const m = parseMhmat(path.join(part.mh.dir, part.mh.material));
  const pbr = { baseColorTexture: { index: tex(bleed(path.join(part.mh.dir, m.diffuseTexture), size)) }, metallicFactor: 0, roughnessFactor: 0.5 };
  if (factor) pbr.baseColorFactor = factor;
  meshNode(name, prim(part.mesh, part.weights, material({ name, pbrMetallicRoughness: pbr, alphaMode: 'MASK', alphaCutoff: cutoff, doubleSided: true })));
}
cutout('lashes', lashes, 256, 0.30, [0.05, 0.035, 0.03, 1]);
cutout('brows', brows, 256, 0.12, [0.35, 0.28, 0.24, 1]);
cutout('hair', hair, 512, 0.45, [0.16, 0.11, 0.09, 1]);

const round = (a) => a.map((v) => +v.toFixed(4));
const mouth = [0, eyeL[1] - 0.092 * (HEIGHT / 1.8), eyeL[2] + 0.012];
let crown = -1e9, headHalf = 0;
for (const v of used) {
  const p = P(v);
  crown = Math.max(crown, p[1]);
  if (p[1] > eyeL[1] - 0.03 && p[1] < eyeL[1] + 0.02 && Math.abs(p[0]) < 0.12) headHalf = Math.max(headHalf, Math.abs(p[0]));
}
b.g.scenes[0].nodes = sceneNodes;
b.g.asset.generator = 'stark-museo tools/human/cyborg.mjs';
b.g.asset.extras = {
  anchors: {
    eyeL: round(place(eyeL)), eyeR: round(place(eyeR)), mouth: round(place(mouth)),
    crown: round(place([0, crown, joint('head')[2]])), headHalf: +(headHalf * scale).toFixed(4),
    headBack: +(-(joint('head')[2] - 0.085) * scale).toFixed(4)
  },
  source: 'MakeHuman CC0 base and system assets'
};

fs.mkdirSync('models', { recursive: true });
const bytes = b.write('models/figure-cyborg.glb');
let chrome = 0;
for (const v of used) if (chromeOf[v] > 0.5) chrome++;
console.log(`cyborg: ${(bytes / 1048576).toFixed(2)} MB, body tris ${bodyMesh.I.length / 3}, hair tris ${hair.mesh.I.length / 3}`);
console.log(`  plated ${chrome} of ${used.size} body vertices; smoothed ${smoothed.join(', ')}`);
console.log('  anchors', JSON.stringify(b.g.asset.extras.anchors));
