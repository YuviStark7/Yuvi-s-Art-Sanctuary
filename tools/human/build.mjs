/**
 * Build a figure: one skinned .glb per character, from CC0 MakeHuman parts.
 *
 *   node tools/human/build.mjs male
 *   node tools/human/build.mjs female
 *
 * Everything the page loads is produced here, offline; the browser never sees a
 * MakeHuman file. See tools/human/README.md for where the parts come from.
 */
import fs from 'fs';
import path from 'path';
import { GLBBuilder } from '../glb-write.mjs';
import { SRC, parseObj, macroBody, buildMesh, smoothNormals } from './mh.mjs';
import { parseMhclo, loadProxyMesh, fitProxy, parseMhmat } from './mhclo.mjs';
import { loadRig, repose, poseVertices, vertexWeights, proxyWeights, gameBones, foldWeights, Q } from './rig.mjs';
import { webp, raw, fromRaw, bleed, averageColour } from './tex.mjs';
import { CHARACTERS } from './characters.mjs';

const ASSETS = path.join(SRC, 'assets');
const SYS = path.join(ASSETS, 'makehuman_system_assets');
const OUT = path.resolve('models');

/** A skin path is relative to the system pack unless it names another pack's folder. */
function skinRoot(p) { return p.startsWith('skins0') ? ASSETS : SYS; }

/** Where each kind of proxy lives. A bare name means the system pack. */
function mhcloPath(kind, name) {
  if (name.endsWith('.mhclo')) return path.join(ASSETS, name);
  if (kind === 'eyes') return path.join(SRC, 'eyes', 'high-poly.mhclo');
  const dir = { hair: 'hair', brows: 'eyebrows', lashes: 'eyelashes', shoes: 'clothes' }[kind];
  return path.join(SYS, dir, name, name + '.mhclo');
}

/* ------------------------------------------------------------ the build -- */

export async function buildCharacter(key) {
  const spec = Object.assign({}, CHARACTERS[key]);
  if (process.env.HAIR) spec.hair = process.env.HAIR;
  if (process.env.BROWS) spec.brows = process.env.BROWS;
  if (process.env.SKIN) { spec.skin = process.env.SKIN; spec.skinNormal = process.env.SKINN || undefined; }
  const base = parseObj(path.join(SRC, 'base.obj'));
  const bodyGroup = base.groups.indexOf('body');
  const nV = base.pos.length / 3;

  // 1. the body, morphed
  const pos = macroBody(base, { gender: spec.gender, race: spec.race });
  if (spec.morph) spec.morph(pos);

  // 2. the skeleton, and the pose it settles into
  const rig = loadRig(pos);
  const per = vertexWeights(rig, nV);
  const pose = repose(rig);
  const posedBody = poseVertices(rig, pose, pos, per);          // metres

  const bones = gameBones();
  const index = new Map(bones.map((b, i) => [b.name, i]));
  const bonePos = bones.map((b) => pose.transforms[b.at].head);

  // 3. every part, fitted, posed and skinned
  const parts = [];
  const proxy = (kind, name, { outfit } = {}) => {
    const mh = parseMhclo(mhcloPath(kind, name));
    const obj = loadProxyMesh(mh);
    const fitted = fitProxy(mh, pos);
    const pw = proxyWeights(mh, per);
    const posed = poseVertices(rig, pose, fitted, pw);
    const mesh = buildMesh(obj, posed, null);
    return { mh, mesh, weights: pw, outfit };
  };

  const outfits = {};
  const hidden = [];                       // per-outfit sets of hidden body vertices
  for (const [id, o] of Object.entries(spec.outfits)) {
    const suit = proxy('suit', o.suit, { outfit: id });
    const shoes = proxy('shoes', spec.shoes, { outfit: id });
    outfits[id] = { suit, shoes, spec: o };
    hidden.push(new Set([...suit.mh.deleteVerts, ...shoes.mh.deleteVerts]));
  }

  // The body keeps whatever at least one outfit leaves showing.
  const covered = (f, h) => f.v.some((v) => h.has(v));
  const bodyMesh = buildMesh(base, posedBody, (f) => f.g === bodyGroup && !hidden.every((h) => covered(f, h)));
  parts.push({ name: 'body', kind: 'skin', mesh: bodyMesh, weights: per });

  const eyes = proxy('eyes', 'high-poly');
  parts.push({ name: 'eyes', kind: 'eye', mesh: eyes.mesh, weights: eyes.weights, mh: eyes.mh });
  const lashes = proxy('lashes', spec.lashes);
  parts.push({ name: 'lashes', kind: 'lash', mesh: lashes.mesh, weights: lashes.weights, mh: lashes.mh });
  const brows = proxy('brows', spec.brows);
  parts.push({ name: 'brows', kind: 'brow', mesh: brows.mesh, weights: brows.weights, mh: brows.mh });
  const hair = proxy('hair', spec.hair);
  parts.push({ name: 'hair', kind: 'hair', mesh: hair.mesh, weights: hair.weights, mh: hair.mh });

  // 4. place the whole figure: facing -z like the page's figure, feet on y = 0, right height
  const all = [bodyMesh, ...Object.values(outfits).flatMap((o) => [o.suit.mesh, o.shoes.mesh]), eyes.mesh, lashes.mesh, brows.mesh, hair.mesh];
  let floor = 1e9;
  for (const o of Object.values(outfits)) for (let i = 1; i < o.shoes.mesh.P.length; i += 3) floor = Math.min(floor, o.shoes.mesh.P[i]);
  let top = -1e9;
  for (let i = 1; i < bodyMesh.P.length; i += 3) top = Math.max(top, bodyMesh.P[i]);
  const scale = spec.height / (top - floor);
  const place = (p) => [-p[0] * scale, (p[1] - floor) * scale, -p[2] * scale];
  for (const m of all) {
    for (let i = 0; i < m.P.length; i += 3) {
      const q = place([m.P[i], m.P[i + 1], m.P[i + 2]]);
      m.P[i] = q[0]; m.P[i + 1] = q[1]; m.P[i + 2] = q[2];
    }
  }
  for (const o of Object.values(outfits)) { /* meshes already in `all` */ void o; }
  const bonePlaced = bonePos.map(place);

  // Anchor points the page aims hands at. The joint groups are small helper cubes in
  // the base mesh; their centroid, carried through the same pose, is the joint.
  const groupCentre = (name) => {
    const gi = base.groups.indexOf(name);
    const ids = new Set();
    for (const f of base.faces) if (f.g === gi) for (const v of f.v) ids.add(v);
    let x = 0, y = 0, z = 0;
    for (const v of ids) { x += posedBody[v * 3]; y += posedBody[v * 3 + 1]; z += posedBody[v * 3 + 2]; }
    return place([x / ids.size, y / ids.size, z / ids.size]);
  };
  const palm = (L) => {
    const t = (n) => pose.transforms[n].head;
    const pts = [t('wrist.' + L), t('finger2-1.' + L), t('finger5-1.' + L), t('finger3-1.' + L)];
    return place([0, 1, 2].map((k) => pts.reduce((a, q) => a + q[k], 0) / pts.length));
  };
  const eyeL = groupCentre('joint-l-eye'), eyeR = groupCentre('joint-r-eye');
  const anchors = {
    // joint-mouth is the jaw hinge, behind the eyes; the lips sit ~9 cm below the eye line, at the face
    mouth: [0, eyeL[1] - 0.092 * (spec.height / 1.8), eyeL[2] - 0.010],
    eyeL, eyeR,
    palmL: palm('L'), palmR: palm('R'),
    crown: place([0, top, 0])
  };
  for (const k of Object.keys(anchors)) anchors[k] = anchors[k].map((v) => +v.toFixed(4));

  // 5. write it
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
    if (bn.parent) {
      const pn = b.g.nodes[nodeOf[index.get(bn.parent)]];
      (pn.children ||= []).push(nodeOf[i]);
    }
  });

  // finger curl axes, carried to the page's frame, ride along on the finger bones
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
  const ibmAcc = b.accessor(ibm, 'MAT4', 5126, {});
  b.g.skins = [{ name: 'figure', joints: nodeOf, inverseBindMatrices: ibmAcc, skeleton: nodeOf[0] }];

  const materials = {};
  const material = (id, make) => {
    if (materials[id] !== undefined) return materials[id];
    b.g.materials.push(make());
    return (materials[id] = b.g.materials.length - 1);
  };
  const tex = (buf) => {
    const img = b.image(buf, 'image/webp');
    (b.g.textures ||= []).push({ sampler: 0, extensions: { EXT_texture_webp: { source: img } } });
    if (!b.g.samplers) b.g.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }];
    return b.g.textures.length - 1;
  };

  const prim = (mesh, weights, matIndex) => {
    const nv = mesh.P.length / 3;
    const nrm = smoothNormals(mesh);
    const n8 = new Int8Array(nv * 4);
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) n8[i * 4 + k] = Math.round(nrm[i * 3 + k] * 127);
    const joints = new Uint8Array(nv * 4), wts = new Uint8Array(nv * 4);
    for (let v = 0; v < nv; v++) {
      const f = foldWeights(weights[mesh.src[v]], index);
      let sum = 0;
      for (let k = 0; k < 4; k++) { joints[v * 4 + k] = f.joints[k]; wts[v * 4 + k] = Math.round(f.weights[k] * 255); sum += wts[v * 4 + k]; }
      wts[v * 4] += 255 - sum;                          // the largest influence absorbs the rounding
    }
    // UVs fit in 16 bits unless a texture tiles
    let uvMin = 1e9, uvMax = -1e9;
    for (const u of mesh.UV) { uvMin = Math.min(uvMin, u); uvMax = Math.max(uvMax, u); }
    const uvInRange = uvMin >= 0 && uvMax <= 1;
    const uv = uvInRange ? Uint16Array.from(mesh.UV, (u) => Math.round(u * 65535)) : mesh.UV;
    const attrs = {
      POSITION: b.accessor(mesh.P, 'VEC3', 5126, { minmax: true, target: 34962 }),
      NORMAL: b.accessor(n8, 'VEC3', 5120, { target: 34962, normalized: true, stride: 4, count: nv }),
      TEXCOORD_0: uvInRange
        ? b.accessor(uv, 'VEC2', 5123, { target: 34962, normalized: true })
        : b.accessor(uv, 'VEC2', 5126, { target: 34962 }),
      JOINTS_0: b.accessor(joints, 'VEC4', 5121, { target: 34962 }),
      WEIGHTS_0: b.accessor(wts, 'VEC4', 5121, { target: 34962, normalized: true })
    };
    const big = nv > 65535;
    const indices = b.accessor(big ? mesh.I : Uint16Array.from(mesh.I), 'SCALAR', big ? 5125 : 5123, { target: 34963 });
    return { attributes: attrs, indices, material: matIndex };
  };

  const meshNode = (name, primitives, extras) => {
    b.g.meshes.push({ name, primitives });
    const node = { name, mesh: b.g.meshes.length - 1, skin: 0 };
    if (extras) node.extras = extras;
    b.g.nodes.push(node);
    return b.g.nodes.length - 1;
  };
  const sceneNodes = [nodeOf[0]];

  // --- skin -----------------------------------------------------------------
  const skinMat = material('skin', () => {
    const pbr = { baseColorTexture: { index: tex(webp(path.join(skinRoot(spec.skin), spec.skin), { size: 2048, quality: 82 })) }, metallicFactor: 0, roughnessFactor: 0.62 };
    const out = { name: 'skin', pbrMetallicRoughness: pbr };
    // a skin that ships a normal map gets its pores and creases
    if (spec.skinNormal) out.normalTexture = { index: tex(webp(path.join(skinRoot(spec.skinNormal), spec.skinNormal), { size: 2048, quality: 88 })), scale: 0.8 };
    return out;
  });
  sceneNodes.push(meshNode('body', [prim(bodyMesh, per, skinMat)]));

  // --- eyes -----------------------------------------------------------------
  const eyeMat = material('eye', () => ({
    name: 'eye',
    pbrMetallicRoughness: { baseColorTexture: { index: tex(webp(path.join(SYS, 'eyes', 'materials', spec.eye + '_eye.png'), { size: 512, quality: 85, vf: spec.eyeVf || '' })) }, metallicFactor: 0, roughnessFactor: 0.18 },
    alphaMode: 'MASK', alphaCutoff: 0.5
  }));
  sceneNodes.push(meshNode('eyes', [prim(eyes.mesh, eyes.weights, eyeMat)]));

  // --- alpha-cut parts: lashes, brows, hair ---------------------------------
  const cut = (id, mh, size, cutoff, { tint, factor } = {}) => material(id, () => {
    const m = parseMhmat(path.join(mh.dir, mh.material));
    const pbr = { baseColorTexture: { index: tex(bleed(path.join(mh.dir, m.diffuseTexture), size, { tint })) }, metallicFactor: 0, roughnessFactor: 0.55 };
    if (factor) pbr.baseColorFactor = factor;
    return { name: id, pbrMetallicRoughness: pbr, alphaMode: 'MASK', alphaCutoff: cutoff, doubleSided: true };
  });
  sceneNodes.push(meshNode('lashes', [prim(lashes.mesh, lashes.weights, cut('lash', lashes.mh, 512, 0.30, { factor: [0.10, 0.08, 0.07, 1] }))]));
  sceneNodes.push(meshNode('brows', [prim(brows.mesh, brows.weights, cut('brow', brows.mh, 512, 0.12, { factor: [1, 1, 1, 1] }))]));
  sceneNodes.push(meshNode('hair', [prim(hair.mesh, hair.weights, cut('hair', hair.mh, 1024, 0.45))]));

  // --- outfits --------------------------------------------------------------
  for (const [id, o] of Object.entries(outfits)) {
    const suitMat = material('suit:' + id, () => {
      const m = parseMhmat(path.join(o.suit.mh.dir, o.suit.mh.material));
      const pbr = { baseColorTexture: { index: tex(webp(path.join(o.suit.mh.dir, m.diffuseTexture), { size: 2048, quality: o.spec.quality || 78, vf: o.spec.vf || '' })) }, metallicFactor: 0, roughnessFactor: 0.78 };
      const out = { name: 'suit:' + id, pbrMetallicRoughness: pbr, doubleSided: true };
      if (m.normalmapTexture) out.normalTexture = { index: tex(webp(path.join(o.suit.mh.dir, m.normalmapTexture), { size: 1024, quality: 88 })), scale: 0.9 };
      if (m.specularmapTexture) {
        const spec1 = raw(path.join(o.suit.mh.dir, m.specularmapTexture), 512, 512, 'rgb24');
        const mr = Buffer.alloc(512 * 512 * 3);
        for (let i = 0; i < 512 * 512; i++) { mr[i * 3] = 255; mr[i * 3 + 1] = Math.round(255 * (1 - 0.62 * spec1[i * 3] / 255)); mr[i * 3 + 2] = 0; }
        pbr.metallicRoughnessTexture = { index: tex(fromRaw(mr, 512, 512, 'rgb24', { quality: 80 })) };
        pbr.roughnessFactor = 1;
      }
      return out;
    });
    const shoeMat = material('shoes', () => {
      const m = parseMhmat(path.join(o.shoes.mh.dir, o.shoes.mh.material));
      const out = { name: 'shoes', pbrMetallicRoughness: { baseColorTexture: { index: tex(webp(path.join(o.shoes.mh.dir, m.diffuseTexture), { size: 1024, quality: 80 })) }, metallicFactor: 0, roughnessFactor: 0.42 }, doubleSided: true };
      if (m.normalmapTexture) out.normalTexture = { index: tex(webp(path.join(o.shoes.mh.dir, m.normalmapTexture), { size: 1024, quality: 85 })) };
      return out;
    });
    sceneNodes.push(meshNode('outfit_' + id, [prim(o.suit.mesh, o.suit.weights, suitMat), prim(o.shoes.mesh, o.shoes.weights, shoeMat)], { outfit: id, label: o.spec.label }));
  }

  b.g.scenes[0].nodes = sceneNodes;
  b.g.asset.generator = 'stark-museo tools/human/build.mjs';
  // Tone is applied at runtime as a ratio against what the textures actually contain.
  const skinBase = averageColour(path.join(skinRoot(spec.skin), spec.skin), { mask: 'body' });
  const hairBase = averageColour(path.join(hair.mh.dir, parseMhmat(path.join(hair.mh.dir, hair.mh.material)).diffuseTexture), { alpha: true });
  b.g.asset.extras = { height: spec.height, bones: bones.length, anchors, skinBase, hairBase, source: 'MakeHuman CC0 base and system assets; suits by Margaret Toigo (CC0)' };

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `figure-${key}${process.env.SUFFIX || ''}.glb`);
  const bytes = b.write(file);
  const tris = (m) => m.I.length / 3;
  console.log(`${key}: ${(bytes / 1048576).toFixed(2)} MB  bones ${bones.length}  floor ${floor.toFixed(3)}  scale ${scale.toFixed(3)}`);
  console.log('  anchors', JSON.stringify(anchors));
  console.log(`  tris: body ${tris(bodyMesh)} eyes ${tris(eyes.mesh)} lashes ${tris(lashes.mesh)} brows ${tris(brows.mesh)} hair ${tris(hair.mesh)}`);
  for (const [id, o] of Object.entries(outfits)) console.log(`  outfit ${id}: suit ${tris(o.suit.mesh)} shoes ${tris(o.shoes.mesh)}`);
  return file;
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  for (const k of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CHARACTERS)) await buildCharacter(k);
}
