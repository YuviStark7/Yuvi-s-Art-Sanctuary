/**
 * Texture work, done by ffmpeg so the build needs nothing installed beyond it.
 * Everything the page loads is WebP: smaller than JPEG at the same quality and,
 * unlike JPEG, it keeps an alpha channel, which hair, brows and lashes need.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'museo-tex-'));
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });
let n = 0;

/** Resize/encode an image file to WebP. `vf` is any extra ffmpeg filter chain. */
export function webp(src, { size, width, height, quality = 80, vf = '', lossless = false } = {}) {
  const out = path.join(tmp, `t${n++}.webp`);
  const w = width || size, h = height || size;
  const filters = [];
  if (w && h) filters.push(`scale=${w}:${h}:flags=lanczos`);
  if (vf) filters.push(vf);
  const args = ['-v', 'error', '-y', '-i', src];
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-c:v', 'libwebp', lossless ? '-lossless' : '-quality', lossless ? '1' : String(quality), '-f', 'webp', out);
  execFileSync('ffmpeg', args);
  return fs.readFileSync(out);
}

/** Raw pixels, for the few places that need to touch them directly. */
export function raw(src, w, h, pix = 'rgba') {
  const out = path.join(tmp, `r${n++}.raw`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${w}:${h}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', pix, out]);
  return fs.readFileSync(out);
}

export function dims(src) {
  const o = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).toString().trim().split(',');
  return { w: +o[0], h: +o[1] };
}

/** Encode raw pixels (built in code) to WebP. */
export function fromRaw(buf, w, h, pix = 'rgb24', { quality = 80 } = {}) {
  const src = path.join(tmp, `f${n++}.raw`);
  const out = path.join(tmp, `f${n++}.webp`);
  fs.writeFileSync(src, buf);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', pix, '-s', `${w}x${h}`, '-i', src, '-c:v', 'libwebp', '-quality', String(quality), '-f', 'webp', out]);
  return fs.readFileSync(out);
}

/**
 * An RGBA texture with its colour pushed outwards into the transparent texels.
 *
 * A hair card's transparent pixels still carry a colour, and it is usually the
 * skin or background the artist painted on. Filtering blends that colour into the
 * edge of every strand, which shows as a pale fringe. Growing the opaque colour a
 * few pixels outwards gives the edge texels the right colour to blend with.
 */
export function bleed(src, size, { quality = 80, passes = 6, solid = 128, tint } = {}) {
  const buf = raw(src, size, size, 'rgba');
  const n = size * size;
  const done = new Uint8Array(n);
  for (let i = 0; i < n; i++) done[i] = buf[i * 4 + 3] >= solid ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next = Uint8Array.from(done);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (done[i]) continue;
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const j = yy * size + xx;
        if (!done[j]) continue;
        r += buf[j * 4]; g += buf[j * 4 + 1]; b += buf[j * 4 + 2]; c++;
      }
      if (c) { buf[i * 4] = r / c; buf[i * 4 + 1] = g / c; buf[i * 4 + 2] = b / c; next[i] = 1; }
    }
    done.set(next);
  }
  if (tint) for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) buf[i * 4 + k] = Math.min(255, buf[i * 4 + k] * tint[k]);
  return fromRaw(buf, size, size, 'rgba', { quality });
}
