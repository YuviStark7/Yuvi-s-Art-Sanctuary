/**
 * Every surface in the sanctuary is drawn procedurally at load time.
 * Nothing is fetched from disk, so the whole gallery stays one small repo.
 */
import * as THREE from 'three';

/* ----------------------------------------------------------- noise kit -- */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise on an integer lattice of `period` cells. */
export function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const SIZE = 256;
  const grid = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();

  const smooth = (t) => t * t * (3 - 2 * t);

  return function noise(x, y, px, py) {
    const pX = Math.max(1, px | 0);
    const pY = Math.max(1, (py === undefined ? px : py) | 0);
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const x0 = ((xi % pX) + pX) % pX, y0 = ((yi % pY) + pY) % pY;
    const x1 = (x0 + 1) % pX, y1 = (y0 + 1) % pY;
    const a = grid[((y0 & 255) << 8) | (x0 & 255)];
    const b = grid[((y0 & 255) << 8) | (x1 & 255)];
    const c = grid[((y1 & 255) << 8) | (x0 & 255)];
    const d = grid[((y1 & 255) << 8) | (x1 & 255)];
    const top = a + (b - a) * xf;
    const bot = c + (d - c) * xf;
    return top + (bot - top) * yf;
  };
}

/**
 * Fractal sum. `period` is the lattice size at the base octave, and may be a
 * pair [x, y] when the two axes tile at different rates.
 *
 * For a texture to tile, the coordinate you pass must span exactly `period`
 * across the 0..1 range you are drawing. Get that wrong and every repeat
 * shows a seam.
 */
export function fbm(noise, x, y, period, octaves, gain, lacunarity) {
  gain = gain === undefined ? 0.5 : gain;
  lacunarity = lacunarity === undefined ? 2 : lacunarity;
  const px = Array.isArray(period) ? period[0] : period;
  const py = Array.isArray(period) ? period[1] : period;
  let sum = 0, amp = 1, norm = 0, freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq,
                       Math.max(1, Math.round(px * freq)),
                       Math.max(1, Math.round(py * freq)));
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Most of these canvases are read back pixel by pixel, which the browser
 *  only optimises for when told up front. */
function readable(c) {
  return c.getContext('2d', { willReadFrequently: true });
}

function finish(c, opts) {
  opts = opts || {};
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso === undefined ? 8 : opts.aniso;
  const r = opts.repeat === undefined ? 1 : opts.repeat;
  t.repeat.set(r, r);
  t.needsUpdate = true;
  return t;
}

/** Sobel a height field into a tangent-space normal map. */
function heightToNormal(height, size, strength) {
  const c = makeCanvas(size);
  const ctx = readable(c);
  const img = ctx.createImageData(size, size);
  const at = (x, y) =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      let nx = -dx, ny = -dy, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayTexture(field, size) {
  const c = makeCanvas(size), ctx = readable(c);
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.min(255, Math.max(0, field[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------------------------------------ concrete -- */

/**
 * Board-formed concrete: broad cloudy blotches, faint shuttering bands,
 * fine aggregate speckle and a scatter of formwork tie-holes.
 */
export function concreteSurface(opts) {
  opts = opts || {};
  const size = opts.size || 1024;
  const seed = opts.seed || 7;
  const tint = opts.tint || [173, 169, 162];
  const contrast = opts.contrast === undefined ? 0.115 : opts.contrast;
  const bands = opts.bands !== false;

  const noise = makeNoise(seed);
  const c = makeCanvas(size), ctx = readable(c);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const S = 8 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * S, v = y * S;
      const broad = fbm(noise, u, v, 8, 5);
      const fine = fbm(noise, u * 9, v * 9, 72, 3);
      const grain = noise(x * 0.9, y * 0.9, 256);

      let shade = 0.5 + (broad - 0.5) * 0.72 + (fine - 0.5) * 0.40 + (grain - 0.5) * 0.16;
      if (bands) {
        const band = Math.sin(v * 4.7 + broad * 1.4);
        shade += Math.pow(Math.max(0, band), 14) * -0.09;
      }
      shade = Math.min(1, Math.max(0, shade));

      const k = 1 + (shade - 0.5) * contrast * 2;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, tint[0] * k);
      img.data[i + 1] = Math.min(255, tint[1] * k);
      img.data[i + 2] = Math.min(255, tint[2] * k);
      img.data[i + 3] = 255;

      height[y * size + x] = fine * 0.55 + grain * 0.45;
      rough[y * size + x] = 0.62 + (broad - 0.5) * 0.35 + (grain - 0.5) * 0.1;
    }
  }
  ctx.putImageData(img, 0, 0);

  const rnd = mulberry32(seed * 31 + 5);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = size * (0.004 + rnd() * 0.003);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
    g.addColorStop(0, 'rgba(74,70,66,0.42)');
    g.addColorStop(0.5, 'rgba(130,125,118,0.16)');
    g.addColorStop(1, 'rgba(160,155,148,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    map: finish(c),
    roughnessMap: finish(grayTexture(rough, size), { srgb: false }),
    normalMap: finish(heightToNormal(height, size, 1.6), { srgb: false })
  };
}

/** Polished floor: wide soft smudges, almost no relief, low roughness. */
export function polishedFloor(opts) {
  opts = opts || {};
  const size = opts.size || 1024;
  const seed = opts.seed || 21;
  const noise = makeNoise(seed);
  const c = makeCanvas(size), ctx = readable(c);
  const img = ctx.createImageData(size, size);
  const rough = new Float32Array(size * size);
  const height = new Float32Array(size * size);
  const S = 5 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * S, v = y * S;
      const broad = fbm(noise, u, v, 5, 5);
      const swirl = fbm(noise, u * 2.6 + broad * 1.5, v * 2.6, 13, 4);
      const grain = noise(x * 1.3, y * 1.3, 256);
      const shade = 0.5 + (broad - 0.5) * 0.9 + (swirl - 0.5) * 0.5 + (grain - 0.5) * 0.07;
      const k = 1 + (shade - 0.5) * 0.2;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, 164 * k);
      img.data[i + 1] = Math.min(255, 161 * k);
      img.data[i + 2] = Math.min(255, 153 * k);
      img.data[i + 3] = 255;
      rough[y * size + x] = 0.30 + (swirl - 0.5) * 0.40 + (grain - 0.5) * 0.05;
      height[y * size + x] = grain * 0.3 + swirl * 0.7;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: finish(c),
    roughnessMap: finish(grayTexture(rough, size), { srgb: false }),
    normalMap: finish(heightToNormal(height, size, 0.35), { srgb: false })
  };
}

/* ---------------------------------------------------------------- rock -- */

export function rockSurface(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const seed = opts.seed || 44;
  const noise = makeNoise(seed);
  const c = makeCanvas(size), ctx = readable(c);
  const img = ctx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const S = 10 / size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * S, v = y * S;
      const n = fbm(noise, u, v, 10, 5);
      const ridge = 1 - Math.abs(fbm(noise, u * 3, v * 3, 30, 4) * 2 - 1);
      const shade = 0.45 + (n - 0.5) * 1.2 + ridge * 0.22;
      const k = 1 + (shade - 0.5) * 0.42;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, 141 * k);
      img.data[i + 1] = Math.min(255, 138 * k);
      img.data[i + 2] = Math.min(255, 131 * k);
      img.data[i + 3] = 255;
      height[y * size + x] = n * 0.6 + ridge * 0.4;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: finish(c),
    normalMap: finish(heightToNormal(height, size, 3.2), { srgb: false })
  };
}

/* --------------------------------------------------------------- water -- */

/** Tiling ripple normal map, sampled twice at different scales and drifts. */
export function waterNormal(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const noise = makeNoise(opts.seed || 91);
  const height = new Float32Array(size * size);
  const S = 6 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * S, v = y * S;
      const n = fbm(noise, u, v, 6, 4, 0.55);
      const w = fbm(noise, u * 2.3 + 4.1, v * 2.3, 14, 3, 0.5);
      height[y * size + x] = n * 0.65 + w * 0.35;
    }
  }
  return finish(heightToNormal(height, size, 2.1), { srgb: false });
}

/* ------------------------------------------------------------- foliage -- */

/** One billboard holding a rough cluster of small olive leaves. */
export function leafCluster(opts) {
  opts = opts || {};
  const size = opts.size || 256;
  const rnd = mulberry32(opts.seed || 3);
  const c = makeCanvas(size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;

  for (let i = 0; i < 46; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = Math.pow(rnd(), 0.62) * size * 0.44;
    const x = cx + Math.cos(ang) * dist;
    const y = cy + Math.sin(ang) * dist * 0.86;
    const len = size * (0.075 + rnd() * 0.065);
    const wid = len * (0.26 + rnd() * 0.14);
    const lift = dist / (size * 0.44);
    const r = 112 + lift * 48 + rnd() * 24;
    const g = 126 + lift * 42 + rnd() * 28;
    const b = 92 + lift * 44 + rnd() * 22;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rnd() * Math.PI * 2);
    ctx.fillStyle = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + (0.72 + rnd() * 0.28) + ')';
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(206,212,190,' + (0.2 + rnd() * 0.2) + ')';
    ctx.lineWidth = Math.max(1, size * 0.0035);
    ctx.beginPath();
    ctx.moveTo(-len * 0.42, 0);
    ctx.lineTo(len * 0.42, 0);
    ctx.stroke();
    ctx.restore();
  }
  return finish(c);
}

/** Low mossy ground cover for the island. */
export function mossTexture(opts) {
  opts = opts || {};
  const size = opts.size || 256;
  const noise = makeNoise(opts.seed || 12);
  const c = makeCanvas(size), ctx = readable(c);
  const img = ctx.createImageData(size, size);
  const S = 9 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(noise, x * S, y * S, 9, 5);
      const sp = noise(x * 1.7, y * 1.7, 256);
      const k = 0.62 + n * 0.7 + (sp - 0.5) * 0.25;
      const i = (y * size + x) * 4;
      img.data[i] = Math.min(255, 88 * k);
      img.data[i + 1] = Math.min(255, 102 * k);
      img.data[i + 2] = Math.min(255, 68 * k);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return finish(c);
}

/* ----------------------------------------------------------- sky / glow -- */

/**
 * What you see looking up through an opening: blown-out daylight with a
 * suggestion of branches drifting across the top edge.
 */
export function skyDisc(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const rnd = mulberry32(opts.seed || 5);
  const c = makeCanvas(size), ctx = c.getContext('2d');

  const g = ctx.createRadialGradient(size * 0.5, size * 0.42, 0, size * 0.5, size * 0.5, size * 0.58);
  g.addColorStop(0.0, '#ffffff');
  g.addColorStop(0.45, '#f7fbfd');
  g.addColorStop(0.8, '#e2ecf3');
  g.addColorStop(1.0, '#cbd8e2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  if (opts.foliage !== false) {
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#4d5a48';
    ctx.lineCap = 'round';
    const branch = (x, y, ang, len, w, depth) => {
      if (depth <= 0 || len < 4) return;
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      branch(x2, y2, ang + 0.42 + rnd() * 0.3, len * 0.72, w * 0.68, depth - 1);
      branch(x2, y2, ang - 0.4 - rnd() * 0.3, len * 0.7, w * 0.66, depth - 1);
      if (rnd() > 0.55) branch(x2, y2, ang + (rnd() - 0.5) * 0.3, len * 0.6, w * 0.6, depth - 1);
    };
    for (let i = 0; i < 3; i++) {
      branch(size * (0.1 + rnd() * 0.8), -size * 0.02,
             Math.PI * (0.35 + rnd() * 0.3), size * 0.16, size * 0.018, 5);
    }
    ctx.globalAlpha = 1;
    ctx.filter = 'blur(7px)';
    ctx.drawImage(c, 0, 0);
    ctx.filter = 'none';
  }
  return finish(c);
}

/** Soft round sprite for mist and spray. */
export function softDot(opts) {
  opts = opts || {};
  const size = opts.size || 128;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, { srgb: false });
}

/* ---------------------------------------------------------------- cloth -- */

/**
 * A woven surface for the wardrobe: a fine warp/weft grid with slubs and
 * drifting shade so garments do not read as flat plastic.
 */
export function clothSurface(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const weave = opts.weave === undefined ? 64 : opts.weave;   // threads across
  const drape = opts.drape === undefined ? 1 : opts.drape;    // how much it folds
  const noise = makeNoise(opts.seed || 63);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const shade = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;

      // over-under weave: two offset ridges beating against each other
      const warp = Math.sin(u * weave * Math.PI * 2);
      const weft = Math.sin(v * weave * Math.PI * 2);
      const thread = (warp + weft) * 0.26 + warp * weft * 0.30;

      /* Folds. Cloth creases along its hang, so the noise tiles four times
         across and only twice down — long soft ridges rather than blobs.
         The warp field is itself periodic, so displacing by it keeps the
         whole thing seamless. */
      const warpX = fbm(noise, u * 4, v * 2, [4, 2], 3) - 0.5;
      const f1 = fbm(noise, u * 8 + warpX * 1.5, v * 3, [8, 3], 4);
      const f2 = fbm(noise, u * 16 + warpX * 2.0, v * 6, [16, 6], 3);
      const folds = ((f1 - 0.5) * 1.25 + (f2 - 0.5) * 0.55) * drape;

      // ridge tops catch light, valleys hold shadow
      const crease = Math.abs(folds) * 2.0;
      const fibre = noise(u * 128, v * 128, 128) - 0.5;

      height[y * size + x] = 0.5 + folds * 0.42 + thread * 0.13 + fibre * 0.09;
      rough[y * size + x] = 0.82 + folds * 0.10 + fibre * 0.07 - Math.abs(warp * weft) * 0.05;

      // this is the part that does the work: shading painted into the cloth,
      // the way it is on a San Andreas character
      shade[y * size + x] = 1.0 - crease * 0.13 * drape + folds * 0.06;
    }
  }

  return {
    map: finish(grayTexture(shade, size)),
    normalMap: finish(heightToNormal(height, size, opts.relief === undefined ? 2.4 : opts.relief), { srgb: false }),
    roughnessMap: finish(grayTexture(rough, size), { srgb: false })
  };
}

/**
 * Skin: not a colour, a modulation. White where the skin is untouched, so it
 * multiplies over any tone; darker in the creases and at the hairline.
 */
export function skinSurface(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const noise = makeNoise(opts.seed || 88);
  const height = new Float32Array(size * size);
  const shade = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const pore = fbm(noise, u * 48, v * 48, 48, 3, 0.6);
      const blotch = fbm(noise, u * 4, v * 4, 4, 4);
      height[y * size + x] = pore * 0.7 + blotch * 0.3;
      shade[y * size + x] = 0.965 + (blotch - 0.5) * 0.07 + (pore - 0.5) * 0.03;
      rough[y * size + x] = 0.66 + (blotch - 0.5) * 0.13 + (pore - 0.5) * 0.10;
    }
  }

  return {
    map: finish(grayTexture(shade, size)),
    normalMap: finish(heightToNormal(height, size, 0.55), { srgb: false }),
    roughnessMap: finish(grayTexture(rough, size), { srgb: false })
  };
}

/** Smooth-ish leather for shoes: fine pebbling, no weave. */
export function leatherSurface(opts) {
  opts = opts || {};
  const size = opts.size || 256;
  const noise = makeNoise(opts.seed || 71);
  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = fbm(noise, (x / size) * 26, (y / size) * 26, 26, 3, 0.6);
      const broad = fbm(noise, (x / size) * 4, (y / size) * 4, 4, 4) - 0.5;
      height[y * size + x] = cell * 0.7 + broad * 0.3;
      rough[y * size + x] = 0.46 + broad * 0.22 + (cell - 0.5) * 0.18;
    }
  }
  return {
    normalMap: finish(heightToNormal(height, size, 1.1), { srgb: false }),
    roughnessMap: finish(grayTexture(rough, size), { srgb: false })
  };
}

/* ----------------------------------------------------------------- face -- */

/**
 * A face, painted rather than modelled — which is how every character in the
 * games this is modelled on got theirs. Transparent everywhere except the
 * features, so it sits over any skin tone as a decal on the front of the head.
 */
export function faceTexture(opts) {
  opts = opts || {};
  const size = opts.size || 512;
  const c = makeCanvas(size), ctx = c.getContext('2d');
  const S = size / 512;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const brow = opts.brow || 'rgba(48,34,26,0.72)';
  const lash = opts.lash || 'rgba(32,24,20,0.86)';
  const iris = opts.iris || '#4a3b2c';

  /** One eye, mirrored by the caller. */
  const eye = (cx, cy, w, h, flip) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(flip ? -1 : 1, 1);

    // the white, an almond rather than an oval
    ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.quadraticCurveTo(-w * 0.35, -h * 1.25, w * 0.72, -h * 0.30);
    ctx.quadraticCurveTo(w * 0.30, h * 1.05, -w, 0);
    ctx.closePath();
    ctx.fillStyle = 'rgba(238,236,231,0.94)';
    ctx.fill();

    // iris and pupil, tucked slightly under the upper lid
    ctx.save();
    ctx.clip();
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(-w * 0.02, -h * 0.10, h * 0.74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#140f0c';
    ctx.beginPath();
    ctx.arc(-w * 0.02, -h * 0.10, h * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(-w * 0.24, -h * 0.42, h * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // upper lash line — the single mark that reads most as "a face"
    ctx.strokeStyle = lash;
    ctx.lineWidth = 5.2 * S;
    ctx.beginPath();
    ctx.moveTo(-w * 1.02, h * 0.04);
    ctx.quadraticCurveTo(-w * 0.35, -h * 1.34, w * 0.78, -h * 0.30);
    ctx.stroke();

    // a whisper of a lower lid
    ctx.strokeStyle = 'rgba(60,44,36,0.34)';
    ctx.lineWidth = 2.4 * S;
    ctx.beginPath();
    ctx.moveTo(-w * 0.80, h * 0.16);
    ctx.quadraticCurveTo(w * 0.10, h * 0.92, w * 0.68, -h * 0.18);
    ctx.stroke();
    ctx.restore();
  };

  const cx = size * 0.5;
  const eyeY = size * 0.40;
  const eyeDx = size * 0.200;
  eye(cx - eyeDx, eyeY, size * 0.094, size * 0.054, false);
  eye(cx + eyeDx, eyeY, size * 0.094, size * 0.054, true);

  // brows
  ctx.strokeStyle = brow;
  ctx.lineCap = 'round';
  for (const dir of [-1, 1]) {
    ctx.lineWidth = 13 * S;
    ctx.beginPath();
    ctx.moveTo(cx + dir * (eyeDx - size * 0.092), eyeY - size * 0.105);
    ctx.quadraticCurveTo(
      cx + dir * eyeDx, eyeY - size * 0.150,
      cx + dir * (eyeDx + size * 0.088), eyeY - size * 0.098);
    ctx.stroke();
  }

  // nose: two soft shadows and the underside, never an outline
  const noseY = size * 0.575;
  ctx.strokeStyle = 'rgba(96,66,50,0.20)';
  ctx.lineWidth = 9 * S;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + dir * size * 0.030, eyeY + size * 0.030);
    ctx.quadraticCurveTo(
      cx + dir * size * 0.044, noseY - size * 0.030,
      cx + dir * size * 0.052, noseY);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(88,60,46,0.26)';
  ctx.beginPath();
  ctx.ellipse(cx, noseY + size * 0.012, size * 0.055, size * 0.017, 0, 0, Math.PI * 2);
  ctx.fill();
  for (const dir of [-1, 1]) {
    ctx.fillStyle = 'rgba(56,38,30,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx + dir * size * 0.034, noseY + size * 0.014,
                size * 0.014, size * 0.009, dir * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // mouth: the seam between the lips does the work, not an outline
  const mouthY = size * 0.715;
  ctx.strokeStyle = 'rgba(84,50,44,0.62)';
  ctx.lineWidth = 5.6 * S;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.082, mouthY);
  ctx.quadraticCurveTo(cx, mouthY + size * 0.020, cx + size * 0.082, mouthY);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150,86,78,0.20)';
  ctx.beginPath();
  ctx.ellipse(cx, mouthY - size * 0.016, size * 0.070, size * 0.020, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, mouthY + size * 0.021, size * 0.062, size * 0.024, 0, 0, Math.PI * 2);
  ctx.fill();

  // soften the whole thing so nothing reads as line art
  ctx.filter = 'blur(' + (1.5 * S) + 'px)';
  ctx.drawImage(c, 0, 0);
  ctx.filter = 'none';

  return finish(c);
}

/* ------------------------------------------------------------- artworks -- */

/**
 * Stand-in canvases in the spirit of the concept image: a black ink
 * fracture on raw cotton. Replace by pointing `js/artworks.js` at real files.
 */
export function inkArtwork(opts) {
  opts = opts || {};
  const size = opts.size || 768;
  const density = opts.density === undefined ? 1 : opts.density;
  const seed = opts.seed || 1;
  const rnd = mulberry32(seed * 977 + 13);
  const c = makeCanvas(size), ctx = readable(c);

  ctx.fillStyle = '#f4f2ec';
  ctx.fillRect(0, 0, size, size);

  const noise = makeNoise(seed + 400);
  const img = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x * 0.6, y * 0.6, 256) - 0.5;
      const i = (y * size + x) * 4;
      img.data[i] += n * 12;
      img.data[i + 1] += n * 12;
      img.data[i + 2] += n * 11;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const fracture = (x, y, ang, len, w, depth) => {
    if (depth <= 0 || len < 3) return;
    const wob = (rnd() - 0.5) * 0.55;
    const mx = x + Math.cos(ang + wob * 0.5) * len * 0.5;
    const my = y + Math.sin(ang + wob * 0.5) * len * 0.5;
    const x2 = x + Math.cos(ang + wob) * len;
    const y2 = y + Math.sin(ang + wob) * len;
    ctx.strokeStyle = 'rgba(16,15,14,' + (0.8 + rnd() * 0.2) + ')';
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(mx, my, x2, y2);
    ctx.stroke();
    const forks = rnd() > 0.35 ? 2 : 3;
    for (let i = 0; i < forks; i++) {
      fracture(x2, y2, ang + (rnd() - 0.5) * 1.5,
               len * (0.55 + rnd() * 0.25), w * (0.5 + rnd() * 0.22), depth - 1);
    }
  };

  const cx = size * (0.36 + rnd() * 0.28);
  const cy = size * (0.36 + rnd() * 0.28);
  const arms = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < arms; i++) {
    fracture(cx, cy, rnd() * Math.PI * 2,
             size * (0.1 + rnd() * 0.09) * density,
             size * (0.02 + rnd() * 0.016), 5);
  }

  ctx.fillStyle = 'rgba(14,13,12,0.92)';
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * size * 0.045;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d,
                size * (0.012 + rnd() * 0.026), size * (0.01 + rnd() * 0.022),
                rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 90 * density; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.45) * size * 0.34;
    const r = size * 0.0012 * (1 + rnd() * 5);
    ctx.fillStyle = 'rgba(18,17,16,' + (0.25 + rnd() * 0.6) + ')';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.92, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return finish(c);
}
