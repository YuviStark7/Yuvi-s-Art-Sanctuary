import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { loadGLB, readAccessor } from './glb-read.mjs';
import { GLBBuilder } from './glb-write.mjs';

const SRC = process.argv[2];
const OUT = process.argv[3];
const TARGET_HEIGHT = Number(process.argv[4] || 5.35);
const CANOPY_BOX = { x: [-21.5, 1.2], y: [-16.0, 8.2] };
const CANOPY_MESHES = [7, 8];
const TRUNK_MESH = 12;
const TRUNK_BASE_IMAGE = 4;
const TRUNK_NORMAL_IMAGE = 6;

const { json: g, bin } = loadGLB(SRC);

function prim(mi) {
  const p = g.meshes[mi].primitives[0];
  return {
    pos: readAccessor(g, bin, p.attributes.POSITION).data,
    nrm: readAccessor(g, bin, p.attributes.NORMAL).data,
    uv:  readAccessor(g, bin, p.attributes.TEXCOORD_0).data,
    idx: readAccessor(g, bin, p.indices).data
  };
}

// ---- select trunk components inside the pink footprint -------------------
function trunkSelection() {
  const { pos, nrm, uv, idx } = prim(TRUNK_MESH);
  const nv = pos.length / 3;
  const parent = new Uint32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let i = 0; i < idx.length; i += 3) { uni(idx[i], idx[i+1]); uni(idx[i+1], idx[i+2]); }
  const box = new Map();
  for (let v = 0; v < nv; v++) {
    const r = find(v); let e = box.get(r);
    if (!e) { e = { min: [1e9, 1e9], max: [-1e9, -1e9] }; box.set(r, e); }
    for (let k = 0; k < 2; k++) { const val = pos[v*3+k]; if (val < e.min[k]) e.min[k] = val; if (val > e.max[k]) e.max[k] = val; }
  }
  const keep = new Set();
  for (const [r, e] of box) {
    const cx = (e.min[0] + e.max[0]) / 2, cy = (e.min[1] + e.max[1]) / 2;
    if (cx >= CANOPY_BOX.x[0] && cx <= CANOPY_BOX.x[1] && cy >= CANOPY_BOX.y[0] && cy <= CANOPY_BOX.y[1]) keep.add(r);
  }
  const tris = [];
  for (let i = 0; i < idx.length; i += 3) if (keep.has(find(idx[i]))) tris.push(idx[i], idx[i+1], idx[i+2]);
  const map = new Map(); const P = [], N = [], U = [], I = [];
  for (const v of tris) {
    let n = map.get(v);
    if (n === undefined) {
      n = P.length / 3; map.set(v, n);
      P.push(pos[v*3], pos[v*3+1], pos[v*3+2]);
      N.push(nrm[v*3], nrm[v*3+1], nrm[v*3+2]);
      U.push(uv[v*2], uv[v*2+1]);
    }
    I.push(n);
  }
  return { P: Float32Array.from(P), N: Float32Array.from(N), U: Float32Array.from(U), I };
}

const trunk = trunkSelection();
const canopies = CANOPY_MESHES.map(mi => {
  const { pos, nrm, uv, idx } = prim(mi);
  return { P: pos, N: nrm, U: uv, I: Array.from(idx) };
});

// ---- frame: Z-up -> Y-up, trunk base to origin, scale to target ----------
let bottom = 1e9;
for (let i = 2; i < trunk.P.length; i += 3) bottom = Math.min(bottom, trunk.P[i]);
let top = -1e9;
for (const c of canopies) for (let i = 2; i < c.P.length; i += 3) top = Math.max(top, c.P[i]);
const height = top - bottom;
const scale = TARGET_HEIGHT / height;
let bx = 0, by = 0, bn = 0;
for (let i = 0; i < trunk.P.length; i += 3) if (trunk.P[i+2] < bottom + 0.8) { bx += trunk.P[i]; by += trunk.P[i+1]; bn++; }
bx /= bn; by /= bn;
console.log(`source height ${height.toFixed(2)} -> ${TARGET_HEIGHT} m (scale ${scale.toFixed(4)}); base centre (${bx.toFixed(2)}, ${by.toFixed(2)}, ${bottom.toFixed(2)})`);

// Z-up -> Y-up:  X = x - bx,  Y = z - bottom,  Z = -(y - by)
function xform(P, N) {
  const oP = new Float32Array(P.length), oN = new Float32Array(N.length);
  for (let i = 0; i < P.length; i += 3) {
    oP[i]   = (P[i]   - bx) * scale;
    oP[i+1] = (P[i+2] - bottom) * scale;
    oP[i+2] = -(P[i+1] - by) * scale;
    oN[i] = N[i]; oN[i+1] = N[i+2]; oN[i+2] = -N[i+1];
  }
  return { P: oP, N: oN };
}
const tX = xform(trunk.P, trunk.N); trunk.P = tX.P; trunk.N = tX.N;
canopies.forEach(c => { const r = xform(c.P, c.N); c.P = r.P; c.N = r.N; });

// ---- canopy density grid for ambient occlusion ---------------------------
const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const c of canopies) for (let i = 0; i < c.P.length; i += 3)
  for (let k = 0; k < 3; k++) { const v = c.P[i+k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
const GRID = 40;
const cell = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]) / GRID;
const org = [mn[0]-cell, mn[1]-cell, mn[2]-cell];
const dim = [Math.ceil((mx[0]-mn[0])/cell)+3, Math.ceil((mx[1]-mn[1])/cell)+3, Math.ceil((mx[2]-mn[2])/cell)+3];
const dens = new Float32Array(dim[0]*dim[1]*dim[2]);
const at = (i, j, k) => (i*dim[1]+j)*dim[2]+k;
for (const c of canopies) for (let i = 0; i < c.P.length; i += 3) {
  const gi = Math.floor((c.P[i]-org[0])/cell), gj = Math.floor((c.P[i+1]-org[1])/cell), gk = Math.floor((c.P[i+2]-org[2])/cell);
  if (gi >= 0 && gj >= 0 && gk >= 0 && gi < dim[0] && gj < dim[1] && gk < dim[2]) dens[at(gi, gj, gk)] += 1;
}
let dmax = 0; for (const v of dens) if (v > dmax) dmax = v;
for (let i = 0; i < dens.length; i++) dens[i] = Math.min(1, dens[i] / (dmax * 0.22));
console.log(`AO grid ${dim.join('x')} cell ${cell.toFixed(3)} m, peak ${dmax} verts/cell`);

const RAYS = [];
for (let i = 0; i < 14; i++) {
  const gold = Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (i / 13) * 0.92;             // upper hemisphere
  const r = Math.sqrt(Math.max(0, 1 - y*y));
  const th = gold * i;
  RAYS.push([Math.cos(th)*r, y, Math.sin(th)*r]);
}
function occlusion(x, y, z) {
  let occ = 0;
  for (const d of RAYS) {
    let t = cell * 1.2, hit = 0;
    for (let s = 0; s < 16; s++) {
      const px = x + d[0]*t, py = y + d[1]*t, pz = z + d[2]*t;
      const gi = Math.floor((px-org[0])/cell), gj = Math.floor((py-org[1])/cell), gk = Math.floor((pz-org[2])/cell);
      if (gi < 0 || gj < 0 || gk < 0 || gi >= dim[0] || gj >= dim[1] || gk >= dim[2]) break;
      hit += dens[at(gi, gj, gk)] * (1 - s/18);
      t += cell * 0.95;
    }
    occ += Math.min(1, hit * 0.42);
  }
  return occ / RAYS.length;
}

// ---- canopy vertex colours: per-cluster blossom tint x AO ----------------
// Each petal cluster is a separate connected component. Colouring per vertex
// from the source noise map made neighbouring petals wildly different, which
// read as patchy; one coherent tint per cluster is what blossom actually does.
function clustersOf(c) {
  const nv = c.P.length / 3;
  const parent = new Uint32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
  const find = a => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let i = 0; i < c.I.length; i += 3) { uni(c.I[i], c.I[i+1]); uni(c.I[i+1], c.I[i+2]); }
  const groups = new Map();
  for (let v = 0; v < nv; v++) {
    const r = find(v);
    let e = groups.get(r);
    if (!e) { e = { verts: [], cx: 0, cy: 0, cz: 0 }; groups.set(r, e); }
    e.verts.push(v); e.cx += c.P[v*3]; e.cy += c.P[v*3+1]; e.cz += c.P[v*3+2];
  }
  for (const e of groups.values()) { const n = e.verts.length; e.cx /= n; e.cy /= n; e.cz /= n; }
  return [...groups.values()];
}

// deterministic per-cluster hash
function hash01(a, b, c2) {
  let h = Math.sin(a * 127.1 + b * 311.7 + c2 * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

// These are albedo, not the colour you see. The hall is lit for overcast
// daylight and graded through ACES, which walks light tints toward white, so
// the palette is mixed deeper than the tree should finally read.
const BLOSSOM = {
  pale:  [0.960, 0.610, 0.625],   // sun-caught petal
  mid:   [0.880, 0.375, 0.425],   // coral rose: the body of the canopy
  deep:  [0.620, 0.195, 0.275]    // deep rose, used sparingly
};
function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

const canopyTop = mx[1], canopyBot = mn[1];
let aoLo = 1, aoHi = 0, aoSum = 0, aoN = 0;

canopies.forEach((c, ci) => {
  const col = new Uint8Array((c.P.length/3) * 3);
  const groups = clustersOf(c);
  for (const grp of groups) {
    // exposure: high and far from the trunk axis = more light
    const rad = Math.hypot(grp.cx, grp.cz);
    const hNorm = (grp.cy - canopyBot) / Math.max(0.001, canopyTop - canopyBot);
    const exposure = Math.min(1, Math.max(0, hNorm * 0.62 + (rad / 3.6) * 0.38));
    const r1 = hash01(grp.cx, grp.cy, grp.cz);
    const r2 = hash01(grp.cz * 3.3, grp.cx * 1.7, grp.cy * 2.9);
    // most petals sit between mid and pale; a tenth go deeper for variety
    let base = r1 < 0.13 ? mix(BLOSSOM.mid, BLOSSOM.deep, 0.30 + r2 * 0.55)
                         : mix(BLOSSOM.mid, BLOSSOM.pale, exposure * 0.55 + r2 * 0.20);
    const jitter = 0.94 + r2 * 0.12;
    const aoC = occlusion(grp.cx, grp.cy, grp.cz);
    aoLo = Math.min(aoLo, aoC); aoHi = Math.max(aoHi, aoC); aoSum += aoC; aoN++;
    for (const v of grp.verts) {
      // a touch of per-vertex AO on top of the cluster value keeps petals from
      // going flat, without the noise that per-vertex tinting produced
      const aoV = occlusion(c.P[v*3], c.P[v*3+1], c.P[v*3+2]);
      const ao = aoC * 0.55 + aoV * 0.45;
      const shade = (0.58 + 0.42 * Math.pow(1 - ao, 0.75)) * jitter;
      for (let k = 0; k < 3; k++) col[v*3+k] = Math.max(0, Math.min(255, Math.round(base[k] * shade * 255)));
    }
  }
  c.C = col;
  console.log(`canopy ${ci}: ${c.P.length/3} verts, ${c.I.length/3} tris, ${groups.length} petal clusters`);
});
console.log(`canopy AO: min ${aoLo.toFixed(3)} mean ${(aoSum/aoN).toFixed(3)} max ${aoHi.toFixed(3)}`);

// ---- trunk vertex AO: canopy shadow + ground contact ---------------------
{
  const col = new Uint8Array((trunk.P.length/3) * 3);
  for (let i = 0, v = 0; i < trunk.P.length; i += 3, v++) {
    const ao = occlusion(trunk.P[i], trunk.P[i+1], trunk.P[i+2]);
    const ground = Math.min(1, Math.max(0, trunk.P[i+1] / (TARGET_HEIGHT * 0.09)));
    const shade = (0.52 + 0.48 * Math.pow(1 - ao, 0.8)) * (0.62 + 0.38 * ground);
    const q = Math.max(0, Math.min(255, Math.round(shade * 255)));
    col[v*3] = col[v*3+1] = col[v*3+2] = q;
  }
  trunk.C = col;
  console.log(`trunk: ${trunk.P.length/3} verts, ${trunk.I.length/3} tris`);
}

// ---- write ---------------------------------------------------------------
const b = new GLBBuilder();
// The pack ships five 4096 maps for this tree, 41 MB of them. Two survive:
//   - the leaf map is pure pink noise with no leaf shapes in it, so the petal
//     tint is generated above instead and the texture is dropped entirely
//   - the metallic-roughness map is flat white in the two channels glTF
//     actually reads, so it becomes a scalar
// What is left is bark colour and bark normal, resampled to 1024 and graded
// down to sit in the hall's concrete palette.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'museo-tree-'));
function bakeTexture(imageIndex, filters, quality) {
  const bv = g.bufferViews[g.images[imageIndex].bufferView];
  const raw = path.join(work, `src${imageIndex}`);
  const out = path.join(work, `out${imageIndex}.jpg`);
  fs.writeFileSync(raw, bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
  execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-vf', filters, '-q:v', String(quality), '-y', out]);
  const buf = fs.readFileSync(out);
  console.log(`  texture ${imageIndex}: ${(bv.byteLength / 1048576).toFixed(2)} MB -> ${(buf.length / 1024).toFixed(0)} KB`);
  return buf;
}
console.log('resampling textures (needs ffmpeg on PATH)');
const barkBase = b.texture(b.image(
  bakeTexture(TRUNK_BASE_IMAGE, 'scale=1024:1024,eq=saturation=0.58:brightness=-0.015:contrast=1.06', 4), 'image/jpeg'));
const barkNorm = b.texture(b.image(
  bakeTexture(TRUNK_NORMAL_IMAGE, 'scale=1024:1024', 2), 'image/jpeg'));
b.g.materials.push({
  name: 'Bark',
  pbrMetallicRoughness: { baseColorTexture: { index: barkBase }, metallicFactor: 0, roughnessFactor: 0.92 },
  normalTexture: { index: barkNorm, scale: 1.0 }
});
b.g.materials.push({
  name: 'Blossom',
  pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.95 },
  doubleSided: true
});

function addMesh(name, data, material, withUV) {
  const attrs = {
    POSITION: b.accessor(data.P, 'VEC3', 5126, { minmax: true, target: 34962 }),
    NORMAL:   b.accessor(data.N, 'VEC3', 5126, { target: 34962 }),
    COLOR_0:  b.accessor(data.C, 'VEC3', 5121, { normalized: true, target: 34962 })
  };
  if (withUV) attrs.TEXCOORD_0 = b.accessor(data.U, 'VEC2', 5126, { target: 34962 });
  const nv = data.P.length / 3;
  const big = nv > 65535;
  const indices = b.accessor(big ? Uint32Array.from(data.I) : Uint16Array.from(data.I),
    'SCALAR', big ? 5125 : 5123, { target: 34963 });
  b.g.meshes.push({ name, primitives: [{ attributes: attrs, indices, material }] });
  b.g.nodes.push({ name, mesh: b.g.meshes.length - 1 });
  b.g.scenes[0].nodes.push(b.g.nodes.length - 1);
}
addMesh('Trunk', trunk, 0, true);
addMesh('BlossomA', canopies[0], 1, false);
addMesh('BlossomB', canopies[1], 1, false);

const size = b.write(OUT);
console.log(`\nwrote ${OUT}  ${(size/1048576).toFixed(2)} MB`);
console.log(`total tris ${(trunk.I.length + canopies[0].I.length + canopies[1].I.length) / 3}`);
fs.rmSync(work, { recursive: true, force: true });
