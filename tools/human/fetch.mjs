// Pull files out of an asset pack into 3D Objects/makehuman-src/assets/
//   node tools/human/fetch.mjs suits01 "thumb$"
import fs from 'fs';
import path from 'path';
import { RemoteZip } from './remotezip.mjs';

const DEST = path.resolve('3D Objects/makehuman-src/assets');
const [, , pack, pat] = process.argv;
const z = await RemoteZip.open(pack);
const rows = z.find(new RegExp(pat || '.', 'i'));
let bytes = 0;
for (const e of rows) {
  const out = path.join(DEST, pack, e.name);
  if (fs.existsSync(out) && fs.statSync(out).size === e.size) { continue; }
  const data = await z.read(e);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  bytes += data.length;
  console.log('+', (data.length / 1024).toFixed(0).padStart(7), 'KB', e.name);
}
console.log(`${rows.length} matched, ${(bytes / 1048576).toFixed(1)} MB written to ${path.join(DEST, pack)}`);
