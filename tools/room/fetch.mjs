/**
 * Fetch the room's surface textures from Poly Haven (CC0) and encode them for the page.
 *
 *   node tools/room/fetch.mjs
 *
 * Writes textures/*.webp. Nothing is downloaded at runtime: the site serves these files
 * itself, so the page never depends on Poly Haven being up. Re-running reproduces the
 * same files from the same asset ids; the ids and sizes are the whole recipe.
 *
 * Sizes are the real-world size of one tile, which main code uses to set the repeat so a
 * tie-hole or a scuff comes out the size it would be on a real wall.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { webp, raw, fromRaw } from '../human/tex.mjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'textures');
const CACHE = fs.mkdtempSync(path.join(os.tmpdir(), 'museo-room-'));

/**
 * Each map is [source map, output name, size, quality, grade?]. A grade pulls the photo's
 * colour toward grey by `grey` (0..1) and scales it so its average lands on `mean` (sRGB).
 * The room's materials were tuned against a texture of a known average; grading the photo to
 * that average means swapping the texture does not move the brightness of the whole hall, and
 * it takes the green-brown cast of a weathered photo out of a room meant to be pale grey.
 */
const SET = [
  { id: 'grey_plaster', maps: [
    ['Diffuse', 'wall-diffuse', 1024, 82, { mean: [173, 169, 163], grey: 0.7, flatten: { radius: 70, keep: 0.22 } }],
    ['Rough', 'wall-rough', 1024, 78] ] },
  { id: 'concrete_floor_worn_001', maps: [
    ['Diffuse', 'floor-diffuse', 1024, 84, { mean: [112, 113, 110], grey: 0.8 }],
    ['Rough', 'floor-rough', 1024, 80], ['nor_gl', 'floor-normal', 1024, 88] ] },
  { id: 'mossy_rock', maps: [
    ['Diffuse', 'rock-diffuse', 1024, 82],
    ['nor_gl', 'rock-normal', 1024, 88] ] }
];

function average(file) {
  const px = raw(file, 32, 32, 'rgb24');
  const m = [0, 0, 0];
  for (let i = 0; i < px.length; i += 3) { m[0] += px[i]; m[1] += px[i + 1]; m[2] += px[i + 2]; }
  return m.map((v) => v / (px.length / 3));
}

function gradeFilter(file, { mean, grey }) {
  const m = average(file);
  const luma = 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
  // desaturate toward the average's own luma, then gain so the channel means hit the target
  const mixed = m.map((v) => v * (1 - grey) + luma * grey);
  const g = mean.map((t, i) => t / mixed[i]);
  const row = (i) => [0, 1, 2].map((j) => ((i === j ? 1 - grey : 0) + grey * [0.299, 0.587, 0.114][j]) * g[i]);
  const [r, gg, b] = [row(0), row(1), row(2)];
  console.log('  grade', m.map((v) => v.toFixed(0)).join(','), '->', mean.join(','), 'gain', g.map((v) => v.toFixed(2)).join(','));
  return `colorchannelmixer=rr=${r[0]}:rg=${r[1]}:rb=${r[2]}:gr=${gg[0]}:gg=${gg[1]}:gb=${gg[2]}:br=${b[0]}:bg=${b[1]}:bb=${b[2]}`;
}

/**
 * Take the broad blotches out of a tiling photo and keep the grain.
 *
 * A photograph of a wall carries its own big stains and gradients, and when it is repeated over
 * a dome they line up into bands. The grain is what reads as plaster; the cloudiness is better
 * made from something that does not repeat. So: subtract a wrapped blur (the tile edges must
 * meet, so the blur wraps), keep a little of it, and let the shader add the large-scale mottling.
 */
function flattened(file, size, quality, vf, { radius, keep }) {
  const out = path.join(CACHE, 'flat.raw');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `scale=${size}:${size}:flags=lanczos,${vf}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', out]);
  const px = fs.readFileSync(out);
  const n = size * size;
  const lo = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) lo[i] = px[i];
  const tmp = new Float32Array(n * 3);
  const pass = (src, dst, horizontal) => {
    // wrapped box blur, running sum
    const R = Math.max(1, Math.round(radius / 3)), w = 2 * R + 1;
    for (let line = 0; line < size; line++) for (let c = 0; c < 3; c++) {
      const at = (k) => {
        const kk = ((k % size) + size) % size;
        return (horizontal ? line * size + kk : kk * size + line) * 3 + c;
      };
      let sum = 0;
      for (let k = -R; k <= R; k++) sum += src[at(k)];
      for (let k = 0; k < size; k++) {
        dst[at(k)] = sum / w;
        sum += src[at(k + R + 1)] - src[at(k - R)];
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(lo, tmp, true); pass(tmp, lo, false); }
  let mean = [0, 0, 0];
  for (let i = 0; i < n * 3; i++) mean[i % 3] += px[i];
  mean = mean.map((v) => v / n);
  const res = Buffer.alloc(n * 3);
  for (let i = 0; i < n * 3; i++) {
    const v = mean[i % 3] + (px[i] - lo[i]) + (lo[i] - mean[i % 3]) * keep;
    res[i] = Math.max(0, Math.min(255, Math.round(v)));
  }
  return fromRaw(res, size, size, 'rgb24', { quality });
}

async function get(url, file) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return;
    } catch (e) { if (i === 3) throw new Error(url + ': ' + e.message); await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const { id, maps } of SET) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
  for (const [map, name, size, quality, grade] of maps) {
    const src = files[map]['2k'].jpg.url;
    const tmp = path.join(CACHE, `${id}-${map}.jpg`);
    await get(src, tmp);
    let buf;
    if (grade && grade.flatten) buf = flattened(tmp, size, quality, gradeFilter(tmp, grade), grade.flatten);
    else buf = webp(tmp, { size, quality, vf: grade ? gradeFilter(tmp, grade) : '' });
    fs.writeFileSync(path.join(OUT, name + '.webp'), buf);
    console.log(name.padEnd(14), (buf.length / 1024).toFixed(0).padStart(5), 'KB  <-', src);
  }
}
fs.rmSync(CACHE, { recursive: true, force: true });
