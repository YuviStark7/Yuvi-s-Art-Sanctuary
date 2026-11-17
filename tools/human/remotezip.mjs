/**
 * Read single files out of a zip on a web server without downloading the zip.
 *
 * MakeHuman's asset packs are 20–270 MB each and we want a handful of files from
 * a handful of them. Zip keeps its index at the end of the archive and every
 * entry is independently compressed, so one range request for the tail gives the
 * file list and one more per file gives that file. The asset host answers
 * `Range` requests with 206, which is what this relies on.
 */
import zlib from 'zlib';

const MIRRORS = ['https://files2.makehumancommunity.org', 'https://files.makehumancommunity.org'];

async function range(url, start, end) {
  const headers = { Range: end === undefined ? `bytes=${start}` : `bytes=${start}-${end}` };
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && end !== undefined && buf.length > end - start + 1) {
        throw new Error('server ignored the Range header');
      }
      return buf;
    } catch (e) {
      if (attempt === 3) throw new Error(`${url} [${start}-${end}]: ${e.message}`);
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

export class RemoteZip {
  constructor(url) { this.url = url; this.entries = []; this.size = 0; }

  static async open(pack) {
    let lastErr;
    for (const host of MIRRORS) {
      const url = `${host}/asset_packs/${pack}/${pack}_cc0.zip`;
      try {
        const z = new RemoteZip(url);
        await z._readIndex();
        return z;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async _readIndex() {
    const head = await fetch(this.url, { method: 'HEAD' });
    this.size = +head.headers.get('content-length');
    if (!this.size) throw new Error('no content-length for ' + this.url);
    const tailLen = Math.min(this.size, 66000);
    const tail = await range(this.url, this.size - tailLen, this.size - 1);
    let e = -1;
    for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('end of central directory not found');
    let count = tail.readUInt16LE(e + 10);
    let cdSize = tail.readUInt32LE(e + 12);
    let cdOff = tail.readUInt32LE(e + 16);
    if (cdOff === 0xffffffff || count === 0xffff) throw new Error('zip64 archive: not supported');
    const cd = await range(this.url, cdOff, cdOff + cdSize - 1);
    let p = 0;
    while (p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50) {
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const size = cd.readUInt32LE(p + 24);
      const nameLen = cd.readUInt16LE(p + 28), extraLen = cd.readUInt16LE(p + 30), commentLen = cd.readUInt16LE(p + 32);
      const offset = cd.readUInt32LE(p + 42);
      const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
      this.entries.push({ name, method, compSize, size, offset });
      p += 46 + nameLen + extraLen + commentLen;
    }
  }

  find(re) { return this.entries.filter((x) => re.test(x.name) && !x.name.endsWith('/')); }

  async read(entry) {
    const hdr = await range(this.url, entry.offset, entry.offset + 29);
    if (hdr.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header for ' + entry.name);
    const dataStart = entry.offset + 30 + hdr.readUInt16LE(26) + hdr.readUInt16LE(28);
    if (entry.compSize === 0) return Buffer.alloc(0);
    const raw = await range(this.url, dataStart, dataStart + entry.compSize - 1);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return zlib.inflateRawSync(raw);
    throw new Error('unsupported compression method ' + entry.method + ' for ' + entry.name);
  }
}
