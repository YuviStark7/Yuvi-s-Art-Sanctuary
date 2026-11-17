/**
 * The MakeHuman files the build reads that are not in an asset pack: the base mesh,
 * the rig and its weights, the macro morph targets, and the eye mesh. They live in
 * the MakeHuman repository (CC0 assets, see LICENSE.ASSETS.md there).
 *
 *   node tools/human/fetch-base.mjs
 *
 * Writes to "3D Objects/makehuman-src/", which is git-ignored.
 */
import fs from 'fs';
import path from 'path';

const RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data';
const DEST = path.resolve('3D Objects/makehuman-src');

const FILES = [
  ['3dobjs/base.obj', 'base.obj'],
  ['rigs/default.mhskel', 'default.mhskel'],
  ['rigs/default_weights.mhw', 'default_weights.mhw'],
  ['eyes/high-poly/high-poly.obj', 'eyes/high-poly.obj'],
  ['eyes/high-poly/high-poly.mhclo', 'eyes/high-poly.mhclo'],
  ['eyes/materials/brown.mhmat', 'eyes/brown.mhmat'],
  ...['caucasian', 'african', 'asian'].flatMap((race) =>
    ['male', 'female'].map((g) => [`targets/macrodetails/${race}-${g}-young.target`, `targets/${race}-${g}-young.target`]))
];

let bytes = 0;
for (const [from, to] of FILES) {
  const out = path.join(DEST, to);
  if (fs.existsSync(out) && fs.statSync(out).size > 0) continue;
  const res = await fetch(`${RAW}/${from}`);
  if (!res.ok) throw new Error(`${from}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  bytes += buf.length;
  console.log('+', (buf.length / 1024).toFixed(0).padStart(6), 'KB', to);
}
console.log(`${FILES.length} files, ${(bytes / 1048576).toFixed(1)} MB fetched`);
