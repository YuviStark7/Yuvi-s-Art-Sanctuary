/**
 * Build models/fern.glb from Poly Haven's `fern_02` (CC0, scanned by Rob Tuytel).
 *
 *   node tools/room/fern.mjs
 *
 * The upstream glTF is four loose files plus three JPEG textures at 1k, with the leaf
 * cut-out kept in a separate alpha image. This packs it into one .glb the page can fetch in
 * a single request: geometry as it came, the colour map merged with its alpha into one WebP,
 * the normal map as WebP. The four variants (a-d) stay as four meshes; the island scatters
 * them.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'https://dl.polyhaven.org/file/ph-assets/Models';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'museo-fern-'));

async function get(url, name) {
  const f = path.join(tmp, name);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
      return f;
    } catch (e) { if (i === 3) throw new Error(url + ': ' + e.message); await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
  }
}

const gltf = JSON.parse(fs.readFileSync(await get(`${BASE}/gltf/1k/fern_02/fern_02_1k.gltf`, 'f.gltf'), 'utf8'));
const bin = fs.readFileSync(await get(`${BASE}/gltf/8k/fern_02/fern_02.bin`, 'f.bin'));
const diff = await get(`${BASE}/jpg/1k/fern_02/fern_02_diff_1k.jpg`, 'diff.jpg');
const alpha = await get(`${BASE}/jpg/1k/fern_02/fern_02_alpha_1k.jpg`, 'alpha.jpg');
const nor = await get(`${BASE}/jpg/1k/fern_02/fern_02_nor_gl_1k.jpg`, 'nor.jpg');

const enc = (args, out) => { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-c:v', 'libwebp', '-quality', '84', '-f', 'webp', out]); return fs.readFileSync(out); };
const colour = enc(['-i', diff, '-i', alpha, '-filter_complex', '[1]format=gray[a];[0][a]alphamerge'], path.join(tmp, 'c.webp'));
const normal = enc(['-i', nor], path.join(tmp, 'n.webp'));

// one buffer: the original geometry, then the two images, each 4-byte aligned
const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const parts = [pad(bin)];
let len = parts[0].length;
const addView = (buf) => {
  const off = len; const p = pad(buf); parts.push(p); len += p.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
  return gltf.bufferViews.length - 1;
};
gltf.images = [
  { bufferView: addView(normal), mimeType: 'image/webp', name: 'fern_normal' },
  { bufferView: addView(colour), mimeType: 'image/webp', name: 'fern_colour' }
];
gltf.textures = [
  { sampler: 0, extensions: { EXT_texture_webp: { source: 0 } } },
  { sampler: 0, extensions: { EXT_texture_webp: { source: 1 } } }
];
const m = gltf.materials[0];
m.normalTexture = { index: 0 };
m.pbrMetallicRoughness = { baseColorTexture: { index: 1 }, metallicFactor: 0, roughnessFactor: 0.72 };
gltf.extensionsUsed = ['EXT_texture_webp'];
gltf.extensionsRequired = ['EXT_texture_webp'];
gltf.buffers = [{ byteLength: len }];

let json = JSON.stringify(gltf);
while (json.length % 4) json += ' ';
const jb = Buffer.from(json), bb = Buffer.concat(parts);
const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
const ch = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
const out = path.join(ROOT, 'models', 'fern.glb');
fs.writeFileSync(out, Buffer.concat([head, ch(jb.length, 0x4e4f534a), jb, ch(bb.length, 0x004e4942), bb]));
console.log('models/fern.glb', (fs.statSync(out).size / 1024).toFixed(0), 'KB');
fs.rmSync(tmp, { recursive: true, force: true });
