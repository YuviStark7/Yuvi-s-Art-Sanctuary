import fs from 'fs';
export function loadGLB(file) {
  const buf = fs.readFileSync(file);
  const len = buf.readUInt32LE(8);
  let off = 12, json = null, bin = null;
  while (off < len) {
    const cl = buf.readUInt32LE(off), ct = buf.readUInt32LE(off + 4);
    if (ct === 0x4E4F534A) json = JSON.parse(buf.subarray(off + 8, off + 8 + cl).toString('utf8'));
    else bin = buf.subarray(off + 8, off + 8 + cl);
    off += 8 + cl;
  }
  return { json, bin };
}
const COMP = { 5120: [Int8Array,1], 5121: [Uint8Array,1], 5122: [Int16Array,2], 5123: [Uint16Array,2], 5125: [Uint32Array,4], 5126: [Float32Array,4] };
const NUM = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };
export function readAccessor(g, bin, idx) {
  const a = g.accessors[idx];
  const n = NUM[a.type];
  const [TA, bytes] = COMP[a.componentType];
  const bv = g.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride || n * bytes;
  const out = new TA(a.count * n);
  if (stride === n * bytes) {
    const src = new TA(bin.buffer, bin.byteOffset + base, a.count * n);
    out.set(src);
  } else {
    for (let i = 0; i < a.count; i++) {
      const src = new TA(bin.buffer, bin.byteOffset + base + i * stride, n);
      out.set(src, i * n);
    }
  }
  return { data: out, n, count: a.count };
}
