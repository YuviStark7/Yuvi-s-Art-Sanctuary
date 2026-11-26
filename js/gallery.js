/**
 * Hanging the work: where each piece goes, how it is lit, and the wall label
 * beside it. Also builds the two side chambers' plinths.
 */
import * as THREE from 'three';
import { HALL, ALCOVES, PALETTE } from './config.js';
import { inkArtwork } from './textures.js';
import { FRAMING } from './shop.config.js';

const DEG = Math.PI / 180;

/* ------------------------------------------------------ texture loading -- */

/**
 * Resolves a texture for every entry: the artist's file if one is named,
 * otherwise a generated stand-in canvas.
 */
export function loadArtworkTextures(list, onProgress) {
  const loader = new THREE.TextureLoader();
  let done = 0;
  const total = list.length;

  return Promise.all(list.map((art, i) => new Promise((resolve) => {
    const step = (tex, aspect) => {
      done++;
      if (onProgress) onProgress(done / total);
      resolve({ tex, aspect });
    };

    if (!art.src) {
      const tex = inkArtwork({ seed: i + 1, size: 768, density: 0.85 + (i % 3) * 0.2 });
      tex.anisotropy = 8;
      step(tex, null);
      return;
    }

    loader.load(
      art.src,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        const img = tex.image;
        step(tex, img && img.height ? img.width / img.height : null);
      },
      undefined,
      () => {
        // missing file: fall back rather than leaving a hole in the wall
        console.warn('[Stark Museo] could not load "' + art.src + '" — using a placeholder.');
        const tex = inkArtwork({ seed: i + 1, size: 768 });
        step(tex, null);
      }
    );
  })));
}

/* --------------------------------------------------------------- labels -- */

/** Writes `text` over as many lines as it needs; returns the y below the last. */
function wrapped(ctx, text, x, y, width, line) {
  let row = '';
  for (const word of String(text).split(' ')) {
    const next = row ? row + ' ' + word : word;
    if (row && ctx.measureText(next).width > width) {
      ctx.fillText(row, x, y);
      y += line;
      row = word;
    } else row = next;
  }
  if (row) { ctx.fillText(row, x, y); y += line; }
  return y;
}

const LABEL_W = 512, LABEL_H = 320;

function labelTexture(art) {
  const W = LABEL_W, H = LABEL_H;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfcbc3';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#2b2926';
  ctx.textBaseline = 'top';

  let y = 30;
  ctx.font = '600 36px Georgia, "Times New Roman", serif';
  y = wrapped(ctx, art.title || 'Untitled', 36, y, W - 72, 42) + 8;

  ctx.font = 'italic 28px Georgia, "Times New Roman", serif';
  ctx.fillStyle = '#4a4741';
  if (art.year) { ctx.fillText(art.year, 36, y); y += 36; }

  ctx.font = '25px Georgia, "Times New Roman", serif';
  ctx.fillStyle = '#5c584f';
  if (art.medium) y = wrapped(ctx, art.medium, 36, y, W - 72, 31);
  if (art.size) { ctx.fillText(art.size, 36, y); y += 31; }

  if (art.price) {
    y += 8;
    ctx.font = '600 28px Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#2b2926';
    if (art.available) ctx.fillText(art.price, 36, y);
    else {
      // the gallery's red dot
      ctx.beginPath();
      ctx.arc(46, y + 14, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#a3211c';
      ctx.fill();
      ctx.fillStyle = '#2b2926';
      ctx.fillText('Sold', 66, y);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ----------------------------------------------------------- placement -- */

/** Even spacing around the wall, skipping the arched doorways. */
function wallAngles(count) {
  const blocked = ALCOVES.map((a) => ({
    lo: a.around - (a.width / 2 / HALL.radius) - 0.20,
    hi: a.around + (a.width / 2 / HALL.radius) + 0.20
  }));

  const free = [];
  for (let deg = 0; deg < 360; deg += 0.5) {
    const a = deg * DEG;
    const clear = blocked.every((b) => {
      let d = a - (b.lo + b.hi) / 2;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) > (b.hi - b.lo) / 2;
    });
    if (clear) free.push(a);
  }

  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(free[Math.floor(((i + 0.5) / count) * free.length)]);
  }
  return out;
}

/* ---------------------------------------------------------------- build -- */

export function buildGallery(artworks, loaded, textures, chambers, quality) {
  const group = new THREE.Group();
  group.name = 'gallery';
  const interactables = [];

  const wallPieces = artworks.filter((a) => a.place !== 'chamber');
  const chamberPieces = artworks.filter((a) => a.place === 'chamber');
  const angles = wallAngles(wallPieces.length);

  const stretcherMat = new THREE.MeshStandardMaterial({
    color: 0xe8e5df, roughness: 0.88, metalness: 0.0
  });
  const labelMat = () => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.0 });

  const frameMat = new THREE.MeshStandardMaterial({ color: FRAMING.frameColor, roughness: 0.45, metalness: 0.1 });
  const boardMat = new THREE.MeshStandardMaterial({
    color: FRAMING.matColor, roughness: 0.92, metalness: 0.0,
    emissive: FRAMING.matColor, emissiveIntensity: quality.artworkGlow
  });

  /** The wall label, set to the right of a piece `w` by `h` at reading height. */
  function addLabel(holder, art, w, h) {
    const lw = 0.26, lh = lw * LABEL_H / LABEL_W;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(lw, lh), labelMat());
    label.material.map = labelTexture(art);
    label.position.set(w / 2 + 0.30, -h / 2 + 0.12, 0.004);
    holder.add(label);
  }

  function makeFramed(art, texInfo, index) {
    const holder = new THREE.Group();
    const { mat, rail, depth } = FRAMING;
    const openW = art.width + 2 * mat, openH = art.height + 2 * mat;
    const w = openW + 2 * rail, h = openH + 2 * rail;

    // the frame is one piece: a rectangle with a rectangular hole, given some depth
    const outline = new THREE.Shape()
      .moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2);
    outline.holes.push(new THREE.Path()
      .moveTo(-openW / 2, -openH / 2).lineTo(-openW / 2, openH / 2)
      .lineTo(openW / 2, openH / 2).lineTo(openW / 2, -openH / 2));
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false }), frameMat);
    frame.castShadow = true;
    frame.receiveShadow = true;
    holder.add(frame);

    const board = new THREE.Mesh(new THREE.PlaneGeometry(openW, openH), boardMat);
    board.position.z = depth * 0.45;
    board.receiveShadow = true;
    holder.add(board);

    // unlit and left out of tone mapping: a buyer should see the colours of the photograph, not
    // the room's idea of them. Dimmed a little so it still sits in the room.
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(art.width, art.height),
      new THREE.MeshBasicMaterial({ map: texInfo.tex, color: 0xd6d3ce, toneMapped: false }));
    sheet.position.z = depth * 0.45 + 0.0016;
    holder.add(sheet);

    addLabel(holder, art, w, h);
    holder.userData = { art, index, width: w, height: h };
    return holder;
  }

  /** Builds one hung piece and returns its group. */
  function makePiece(art, texInfo, index) {
    if (art.framed) return makeFramed(art, texInfo, index);
    const holder = new THREE.Group();

    let w = art.width || 1.4;
    let h = art.height || 1.4;
    if (art.src && texInfo.aspect && !art.lockSize) h = w / texInfo.aspect;

    // shallow stretcher so the canvas stands off the wall like a real one
    const depth = 0.045;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), stretcherMat);
    body.position.z = depth / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    holder.add(body);

    const faceMat = new THREE.MeshStandardMaterial({
      map: texInfo.tex,
      roughness: 0.86,
      metalness: 0.0,
      // a whisper of self-illumination so the work reads in the soft daylight
      emissive: 0xffffff,
      emissiveMap: texInfo.tex,
      emissiveIntensity: quality.artworkGlow
    });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMat);
    face.position.z = depth + 0.0012;
    holder.add(face);

    addLabel(holder, art, w, h);

    holder.userData = { art, index, width: w, height: h };
    return holder;
  }

  /* ---- pieces on the great wall ---- */
  wallPieces.forEach((art, i) => {
    const idx = artworks.indexOf(art);
    const texInfo = loaded[idx];
    const piece = makePiece(art, texInfo, idx);

    const h = piece.userData.height;
    const angle = angles[i];
    const centreY = Math.min(2.92 - h / 2, Math.max(0.58 + h / 2, 1.60));

    const r = HALL.radius - 0.07;
    piece.position.set(Math.cos(angle) * r, centreY, Math.sin(angle) * r);
    piece.lookAt(0, centreY, 0);
    group.add(piece);

    const normal = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
    interactables.push({
      centre: piece.position.clone(),
      normal,
      focus: piece.position.clone().addScaledVector(normal, art.framed ? 1.7 : 2.6).setY(1.62),
      art,
      index: idx
    });
  });

  /* ---- side chambers: plinth, stone, and a piece on the back wall ---- */
  const plinthMat = new THREE.MeshStandardMaterial({
    color: PALETTE.concreteDeep,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.9,
    metalness: 0.0
  });
  const chamberLights = [];

  chambers.forEach((ch, ci) => {
    if (ch.spec.desk) return;                 // the studio is furnished by studio.js
    const spec = ch.spec;
    const fwd = ch.forward;

    // plinth
    const plinthH = 0.92;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.52, plinthH, 0.52), plinthMat);
    plinth.position.copy(ch.origin).addScaledVector(fwd, spec.depth * 0.48);
    plinth.position.y = plinthH / 2;
    plinth.rotation.y = -spec.around;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    group.add(plinth);

    // a small worked stone resting on it
    const stoneGeo = new THREE.IcosahedronGeometry(0.19, 3);
    const sp = stoneGeo.attributes.position;
    const sv = new THREE.Vector3();
    for (let i = 0; i < sp.count; i++) {
      sv.fromBufferAttribute(sp, i);
      const k = 1 + Math.sin(sv.x * 7 + ci) * 0.07 + Math.cos(sv.y * 5.5) * 0.06;
      sv.multiplyScalar(k);
      sv.y *= 1.35;
      sp.setXYZ(i, sv.x, sv.y, sv.z);
    }
    sp.needsUpdate = true;
    stoneGeo.computeVertexNormals();
    const stone = new THREE.Mesh(stoneGeo, new THREE.MeshStandardMaterial({
      color: 0x9a958c,
      map: textures.rock.map,
      normalMap: textures.rock.normalMap,
      roughness: 0.88
    }));
    stone.position.copy(plinth.position);
    stone.position.y = plinthH + 0.24;
    stone.castShadow = true;
    group.add(stone);

    // a warm light, the one place in the building that is not daylight
    const lamp = new THREE.SpotLight(0xffe6c4, 12.0, 10, 0.52, 0.68, 1.4);
    lamp.position.copy(ch.origin).addScaledVector(fwd, spec.depth * 0.5);
    lamp.position.y = spec.height + 0.05;
    lamp.target.position.copy(plinth.position).setY(plinthH);
    lamp.castShadow = quality.chamberShadows;
    if (lamp.castShadow) {
      lamp.shadow.mapSize.set(1024, 1024);
      lamp.shadow.bias = -0.0012;
    }
    group.add(lamp, lamp.target);
    chamberLights.push(lamp);

    // one piece on the back wall
    const art = chamberPieces[ci];
    if (art) {
      const idx = artworks.indexOf(art);
      const piece = makePiece(art, loaded[idx], idx);
      const h = piece.userData.height;
      const centreY = Math.min(spec.height - 0.35 - h / 2, Math.max(0.55 + h / 2, 1.55));
      piece.position.copy(ch.origin).addScaledVector(fwd, spec.depth - 0.04);
      piece.position.y = centreY;
      piece.lookAt(piece.position.clone().addScaledVector(fwd, -1));
      group.add(piece);

      const normal = fwd.clone().multiplyScalar(-1);
      interactables.push({
        centre: piece.position.clone(),
        normal,
        focus: piece.position.clone().addScaledVector(normal, 2.0).setY(1.62),
        art,
        index: idx
      });
    }
  });

  return { group, interactables, chamberLights };
}
