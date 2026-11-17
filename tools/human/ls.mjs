// List what is inside an asset pack without downloading it.   node tools/human/ls.mjs suits01 [regex]
import { RemoteZip } from './remotezip.mjs';
const [, , pack, pat] = process.argv;
const z = await RemoteZip.open(pack);
const re = pat ? new RegExp(pat, 'i') : /./;
const rows = z.find(re);
const total = rows.reduce((s, e) => s + e.size, 0);
for (const e of rows) console.log(String(e.size).padStart(10), e.name);
console.log(`-- ${rows.length} files, ${(total / 1048576).toFixed(1)} MB uncompressed (zip is ${(z.size / 1048576).toFixed(0)} MB)`);
