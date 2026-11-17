/**
 * Reading the MakeHuman base: the mesh, its morph targets, and the pieces we
 * need to turn them into a single figure.
 *
 * MakeHuman's base mesh, rig, weights and targets are published CC0 (see
 * LICENSE.ASSETS.md in https://github.com/makehumancommunity/makehuman), which
 * is what makes it safe to ship a figure derived from them. The raw files are
 * fetched by tools/human/fetch-base.mjs and fetch.mjs into `3D Objects/makehuman-src/` — outside
 * the published site — and everything the page loads is built from them offline.
 */
import fs from 'fs';
import path from 'path';

export const SRC = path.resolve('3D Objects/makehuman-src');

/* -------------------------------------------------------------- the mesh -- */

/**
 * Wavefront OBJ, as MakeHuman writes it: quads only, no normals, one group per
 * body part. Returns raw arrays so nothing downstream has to re-parse.
 */
export function parseObj(file) {
  const pos = [], uv = [];
  const faces = [];            // { v: [..], t: [..], g }
  const groups = [];
  let cur = -1;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  for (const raw of lines) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    if (l.startsWith('v ')) {
      const p = l.split(/\s+/); pos.push(+p[1], +p[2], +p[3]);
    } else if (l.startsWith('vt ')) {
      const p = l.split(/\s+/); uv.push(+p[1], +p[2]);
    } else if (l.startsWith('g ') || l.startsWith('o ')) {
      const name = l.slice(2).trim();
      cur = groups.indexOf(name);
      if (cur < 0) { groups.push(name); cur = groups.length - 1; }
    } else if (l.startsWith('f ')) {
      const parts = l.split(/\s+/).slice(1);
      const v = [], t = [];
      for (const part of parts) {
        const [a, b] = part.split('/');
        v.push(+a - 1);
        t.push(b ? +b - 1 : -1);
      }
      faces.push({ v, t, g: cur });
    }
  }
  return { pos: Float64Array.from(pos), uv: Float32Array.from(uv), faces, groups };
}

/* --------------------------------------------------------------- targets -- */

/** A .target file is sparse: "vertex dx dy dz" per line. */
export function parseTarget(file) {
  const idx = [], d = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const p = l.split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: Int32Array.from(idx), d: Float64Array.from(d) };
}

export function applyTarget(pos, target, weight) {
  if (!weight) return;
  for (let k = 0; k < target.idx.length; k++) {
    const i = target.idx[k] * 3;
    pos[i]     += target.d[k * 3]     * weight;
    pos[i + 1] += target.d[k * 3 + 1] * weight;
    pos[i + 2] += target.d[k * 3 + 2] * weight;
  }
}

/**
 * The macro targets that make a body. MakeHuman blends one target per
 * (ethnicity, gender, age) at the product of their weights. At a young adult
 * (its age slider at 0.5) only the "young" set contributes, and the
 * "universal" muscle/weight set is empty at its averages, so a figure is just
 * the sum below.
 */
export function macroBody(base, { gender, race }) {
  const pos = Float64Array.from(base.pos);
  const w = race || { caucasian: 1, african: 0, asian: 0 };
  for (const name of Object.keys(w)) {
    if (!w[name]) continue;
    const gW = [['female', 1 - gender], ['male', gender]];
    for (const [g, gw] of gW) {
      if (!gw) continue;
      const t = parseTarget(path.join(SRC, 'targets', `${name}-${g}-young.target`));
      applyTarget(pos, t, w[name] * gw);
    }
  }
  return pos;
}

/* ------------------------------------------------------------- geometry -- */

/**
 * Turn a chosen set of faces into render-ready arrays. OBJ keeps one vertex per
 * position and a separate UV index per corner, so a vertex on a UV seam has to
 * be split; `src` remembers which base vertex each output vertex came from, which
 * is how skin weights and masks follow it later.
 */
export function buildMesh(obj, pos, faceFilter) {
  const key = new Map();
  const P = [], UV = [], SRC_V = [], I = [];
  const faceOf = [];                       // output triangle -> source face
  obj.faces.forEach((f, fi) => {
    if (faceFilter && !faceFilter(f, fi)) return;
    const corner = f.v.map((v, c) => {
      const t = f.t[c];
      const k = v * 100003 + t;
      let id = key.get(k);
      if (id === undefined) {
        id = P.length / 3; key.set(k, id);
        P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
        // OBJ puts the UV origin bottom-left, glTF top-left
        UV.push(t >= 0 ? obj.uv[t * 2] : 0, t >= 0 ? 1 - obj.uv[t * 2 + 1] : 0);
        SRC_V.push(v);
      }
      return id;
    });
    for (let c = 1; c < corner.length - 1; c++) { I.push(corner[0], corner[c], corner[c + 1]); faceOf.push(fi); }
  });
  return {
    P: Float32Array.from(P), UV: Float32Array.from(UV),
    src: Uint32Array.from(SRC_V), I: Uint32Array.from(I), faceOf: Uint32Array.from(faceOf)
  };
}

/** Area-weighted vertex normals, welded on the source vertex so UV seams stay smooth. */
export function smoothNormals(mesh) {
  const { P, I, src } = mesh;
  const accum = new Map();
  const n = new Float32Array(P.length);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ax = P[a*3], ay = P[a*3+1], az = P[a*3+2];
    const ux = P[b*3] - ax, uy = P[b*3+1] - ay, uz = P[b*3+2] - az;
    const vx = P[c*3] - ax, vy = P[c*3+1] - ay, vz = P[c*3+2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) {
      const s = src[v];
      let e = accum.get(s);
      if (!e) { e = [0, 0, 0]; accum.set(s, e); }
      e[0] += nx; e[1] += ny; e[2] += nz;
    }
  }
  for (let v = 0; v < P.length / 3; v++) {
    const e = accum.get(src[v]) || [0, 1, 0];
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    n[v*3] = e[0] / l; n[v*3+1] = e[1] / l; n[v*3+2] = e[2] / l;
  }
  return n;
}

export function bounds(P) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) {
    const v = P[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v;
  }
  return { min, max, size: min.map((m, k) => max[k] - m) };
}
