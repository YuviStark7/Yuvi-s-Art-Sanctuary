import fs from 'fs';
export class GLBBuilder {
  constructor() { this.chunks = []; this.len = 0; this.g = { asset:{version:'2.0',generator:'stark-museo-extract'},
    scene:0, scenes:[{nodes:[]}], nodes:[], meshes:[], materials:[], accessors:[], bufferViews:[], buffers:[] };
  }
  _pad(n) { return (4 - (n % 4)) % 4; }
  view(typedArray, target) {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const pad = this._pad(this.len);
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.len += pad; }
    const off = this.len;
    this.chunks.push(bytes); this.len += bytes.length;
    const bv = { buffer:0, byteOffset:off, byteLength:bytes.length };
    if (target) bv.target = target;
    this.g.bufferViews.push(bv);
    return this.g.bufferViews.length - 1;
  }
  accessor(typedArray, type, compType, opts = {}) {
    const NUM = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16 };
    const n = NUM[type];
    if (!n) throw new Error('unknown accessor type ' + type);
    const bv = this.view(typedArray, opts.target);
    const count = typedArray.length / n;
    const a = { bufferView: bv, componentType: compType, count, type };
    if (opts.normalized) a.normalized = true;
    if (opts.minmax) {
      const min = new Array(n).fill(Infinity), max = new Array(n).fill(-Infinity);
      for (let i = 0; i < typedArray.length; i++) { const k = i % n; const v = typedArray[i];
        if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
      a.min = min; a.max = max;
    }
    this.g.accessors.push(a);
    return this.g.accessors.length - 1;
  }
  image(buffer, mime) {
    const pad = this._pad(this.len);
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.len += pad; }
    const off = this.len;
    this.chunks.push(buffer); this.len += buffer.length;
    this.g.bufferViews.push({ buffer:0, byteOffset:off, byteLength:buffer.length });
    if (!this.g.images) this.g.images = [];
    this.g.images.push({ bufferView: this.g.bufferViews.length - 1, mimeType: mime });
    return this.g.images.length - 1;
  }
  texture(imageIndex) {
    if (!this.g.samplers) this.g.samplers = [{ magFilter:9729, minFilter:9987, wrapS:10497, wrapT:10497 }];
    if (!this.g.textures) this.g.textures = [];
    this.g.textures.push({ sampler:0, source:imageIndex });
    return this.g.textures.length - 1;
  }
  write(file) {
    const pad = this._pad(this.len);
    if (pad) { this.chunks.push(Buffer.alloc(pad)); this.len += pad; }
    const bin = Buffer.concat(this.chunks);
    this.g.buffers.push({ byteLength: bin.length });
    let jsonStr = JSON.stringify(this.g);
    while (jsonStr.length % 4 !== 0) jsonStr += ' ';
    const json = Buffer.from(jsonStr, 'utf8');
    const total = 12 + 8 + json.length + 8 + bin.length;
    const out = Buffer.alloc(total);
    out.writeUInt32LE(0x46546C67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(total, 8);
    out.writeUInt32LE(json.length, 12); out.writeUInt32LE(0x4E4F534A, 16);
    json.copy(out, 20);
    let o = 20 + json.length;
    out.writeUInt32LE(bin.length, o); out.writeUInt32LE(0x004E4942, o + 4);
    bin.copy(out, o + 8);
    fs.writeFileSync(file, out);
    return total;
  }
}
