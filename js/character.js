/**
 * The visitor: a figure you dress before you go in, and watch from behind
 * once you are inside.
 *
 * Built the same way as the building — from numbers, not from model files.
 * The body is a set of lofted tubes joined by spheres so the limbs can rotate
 * without ever opening a seam, and every garment is a second, slightly larger
 * shell parented to the same joint. That means a top can be swapped without
 * touching the body underneath.
 *
 * The face is deliberately blank. A crudely modelled face would be the first
 * thing anyone looked at; a bare one keeps the eye on the clothes.
 */
import * as THREE from 'three';
import { clothSurface, leatherSurface, softDot } from './textures.js';
import { WARDROBE, FIGURE } from './wardrobe.js';

/* ------------------------------------------------------- proportions (m) -- */

const P = {
  hipY: 0.95,
  thigh: 0.44,
  shin: 0.42,
  ankleY: 0.09,
  legSplit: 0.084,

  shoulderY: 0.46,      // above the hips
  shoulderX: 0.183,
  upperArm: 0.28,
  foreArm: 0.25,

  neckY: 0.50,
  neckLen: 0.06,
  headR: 0.104
};

/* --------------------------------------------------------------- geometry -- */

/**
 * Lofts a stack of elliptical rings into a smooth tube.
 * Sections run bottom to top: [{ y, rx, rz }].
 */
function loftTube(sections, radial, capBottom, capTop) {
  const pos = [], nrm = [], uv = [], index = [];
  const rings = sections.length;
  const cols = radial + 1;

  for (let i = 0; i < rings; i++) {
    const s = sections[i];
    const prev = sections[Math.max(0, i - 1)];
    const next = sections[Math.min(rings - 1, i + 1)];
    const dy = next.y - prev.y || 1;

    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(s.rx * ca, s.y, s.rz * sa);

      // slope of the silhouette tilts the normal so the shading stays smooth
      const drx = (next.rx - prev.rx) / dy;
      const drz = (next.rz - prev.rz) / dy;
      const n = new THREE.Vector3(
        ca / Math.max(0.02, s.rx),
        -(drx * ca * ca + drz * sa * sa),
        sa / Math.max(0.02, s.rz)
      ).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(j / radial, i / (rings - 1));
    }
  }

  // sections run bottom to top and the ring runs anticlockwise, so this is
  // the order that puts the front face on the outside of the tube
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1;
      const c = (i + 1) * cols + j + 1, d = (i + 1) * cols + j;
      index.push(a, c, b, a, d, c);
    }
  }

  const addCap = (ringIndex, up) => {
    const s = sections[ringIndex];
    const centre = pos.length / 3;
    pos.push(0, s.y, 0);
    nrm.push(0, up ? 1 : -1, 0);
    uv.push(0.5, 0.5);
    for (let j = 0; j < radial; j++) {
      const a = ringIndex * cols + j, b = ringIndex * cols + j + 1;
      if (up) index.push(centre, b, a); else index.push(centre, a, b);
    }
  };
  if (capBottom) addCap(0, false);
  if (capTop) addCap(rings - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/** A limb hanging downward from its pivot: y runs 0 to -length. */
function limb(topR, botR, length, radial, bulge) {
  const n = 6;
  const secs = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = topR + (botR - topR) * t;
    if (bulge) r *= 1 + Math.sin(t * Math.PI) * bulge;
    secs.push({ y: -length * t, rx: r, rz: r * 0.94 });
  }
  secs.reverse();                                     // loft wants bottom first
  return loftTube(secs, radial, false, false);
}

function ball(r, seg) {
  return new THREE.SphereGeometry(r, seg || 14, (seg || 14) - 4);
}

/** A rounded slab, used for feet, hands and the camera body. */
function slab(w, h, d, r) {
  const geo = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const c = new THREE.Vector3(
      Math.max(-hx, Math.min(hx, v.x)),
      Math.max(-hy, Math.min(hy, v.y)),
      Math.max(-hz, Math.min(hz, v.z))
    );
    v.sub(c).normalize().multiplyScalar(r).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ---------------------------------------------------------- body sections -- */

const TORSO = [
  { y: -0.115, rx: 0.146, rz: 0.106 },
  { y: -0.040, rx: 0.158, rz: 0.113 },
  { y: 0.060, rx: 0.141, rz: 0.100 },
  { y: 0.160, rx: 0.132, rz: 0.094 },
  { y: 0.280, rx: 0.148, rz: 0.104 },
  { y: 0.390, rx: 0.166, rz: 0.111 },
  { y: 0.460, rx: 0.158, rz: 0.103 },
  { y: 0.505, rx: 0.112, rz: 0.086 }
];

/** Grows a copy of a section stack outward, for a garment over a body part. */
function inflate(sections, pad, from, to) {
  return sections
    .filter((s) => s.y >= (from === undefined ? -9 : from) && s.y <= (to === undefined ? 9 : to))
    .map((s) => ({ y: s.y, rx: s.rx + pad, rz: s.rz + pad }));
}

/** The section stack, read at any height. */
function sectionAt(sections, y) {
  if (y <= sections[0].y) return { rx: sections[0].rx, rz: sections[0].rz };
  const last = sections[sections.length - 1];
  if (y >= last.y) return { rx: last.rx, rz: last.rz };
  for (let i = 1; i < sections.length; i++) {
    if (y > sections[i].y) continue;
    const a = sections[i - 1], b = sections[i];
    const k = (y - a.y) / (b.y - a.y || 1);
    return { rx: a.rx + (b.rx - a.rx) * k, rz: a.rz + (b.rz - a.rz) * k };
  }
  return { rx: last.rx, rz: last.rz };
}

/**
 * A collar, cuff or waistband. A torus would be round, and every part of this
 * body is an ellipse, so the band is lofted from the body's own section stack.
 */
function bandGeometry(sections, y, height, pad, radial) {
  const half = height / 2;
  const secs = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const yy = y - half + height * t;
    const s = sectionAt(sections, yy);
    // fattest in the middle, so it reads as a rolled hem
    const swell = pad + Math.sin(t * Math.PI) * pad * 0.55;
    secs.push({ y: yy, rx: s.rx + swell, rz: s.rz + swell });
  }
  return loftTube(secs, radial || 24, false, false);
}

/* ------------------------------------------------------------- the figure -- */

export class Character {
  constructor(textures) {
    this.textures = textures;
    this.root = new THREE.Group();
    this.root.name = 'visitor';

    this.phase = 0;
    this.breath = 0;
    this.speedRatio = 0;
    this.action = null;
    this.onEvent = null;
    this.outfit = {};

    this._buildMaterials();
    this._buildSkeleton();
    this._buildBody();
    this._buildBlobShadow();

    this.garments = new THREE.Group();
    this.root.add(this.garments);
    this._garmentMeshes = [];
    this._handItem = null;
    this._smoke = null;
  }

  /* ------------------------------------------------------------ materials */

  _buildMaterials() {
    const cloth = clothSurface({ size: 256, weave: 44, seed: 63 });
    const leather = leatherSurface({ size: 256, seed: 71 });
    this.maps = { cloth, leather };

    this.skinMat = new THREE.MeshStandardMaterial({
      color: FIGURE.tones[FIGURE.defaultTone].color,
      roughness: 0.74,
      metalness: 0.0
    });
  }

  _clothMat(color, repeat) {
    const m = new THREE.MeshStandardMaterial({
      color,
      normalMap: this.maps.cloth.normalMap.clone(),
      roughnessMap: this.maps.cloth.roughnessMap.clone(),
      normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1.0,
      metalness: 0.0
    });
    for (const t of [m.normalMap, m.roughnessMap]) {
      t.repeat.set(repeat || 3, repeat || 3);
      t.needsUpdate = true;
    }
    return m;
  }

  _leatherMat(color) {
    const m = new THREE.MeshStandardMaterial({
      color,
      normalMap: this.maps.leather.normalMap.clone(),
      roughnessMap: this.maps.leather.roughnessMap.clone(),
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1.0,
      metalness: 0.0
    });
    for (const t of [m.normalMap, m.roughnessMap]) {
      t.repeat.set(2, 2);
      t.needsUpdate = true;
    }
    return m;
  }

  /* ------------------------------------------------------------- skeleton */

  _buildSkeleton() {
    const J = (parent, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x || 0, y || 0, z || 0);
      parent.add(g);
      return g;
    };

    this.hips = J(this.root, 0, P.hipY, 0);
    this.spine = J(this.hips, 0, 0, 0);
    this.neck = J(this.spine, 0, P.neckY, 0);
    this.head = J(this.neck, 0, P.neckLen + P.headR * 0.86, 0);

    this.arm = {};
    this.leg = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const shoulder = J(this.spine, s * P.shoulderX, P.shoulderY, 0);
      const elbow = J(shoulder, 0, -P.upperArm, 0);
      const wrist = J(elbow, 0, -P.foreArm, 0);
      this.arm[side] = { shoulder, elbow, wrist, sign: s };

      const hip = J(this.hips, s * P.legSplit, 0, 0);
      const knee = J(hip, 0, -P.thigh, 0);
      const ankle = J(knee, 0, -P.shin, 0);
      this.leg[side] = { hip, knee, ankle, sign: s };
    }
  }

  /* ----------------------------------------------------------------- body */

  _buildBody() {
    const skin = this.skinMat;
    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat || skin);
      if (x || y || z) m.position.set(x || 0, y || 0, z || 0);
      m.castShadow = false;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };

    this.bodyParts = [];
    const bodyAdd = (...args) => { const m = add(...args); this.bodyParts.push(m); return m; };

    bodyAdd(this.spine, loftTube(TORSO, 26, true, true), skin);
    bodyAdd(this.neck, new THREE.CylinderGeometry(0.048, 0.055, 0.10, 14), skin, 0, 0.03, 0);

    const headGeo = ball(P.headR, 22);
    headGeo.scale(0.95, 1.16, 1.03);
    bodyAdd(this.head, headGeo, skin);

    for (const side of ['L', 'R']) {
      const a = this.arm[side], l = this.leg[side];
      bodyAdd(a.shoulder, ball(0.052), skin);
      bodyAdd(a.shoulder, limb(0.052, 0.043, P.upperArm, 14, 0.05), skin);
      bodyAdd(a.elbow, ball(0.043), skin);
      bodyAdd(a.elbow, limb(0.043, 0.034, P.foreArm, 14, 0.04), skin);
      const hand = slab(0.072, 0.115, 0.038, 0.018);
      bodyAdd(a.wrist, hand, skin, 0, -0.055, 0);

      bodyAdd(l.hip, ball(0.084), skin);
      bodyAdd(l.hip, limb(0.084, 0.063, P.thigh, 16, 0.05), skin);
      bodyAdd(l.knee, ball(0.062), skin);
      bodyAdd(l.knee, limb(0.062, 0.044, P.shin, 14, 0.07), skin);
      const foot = slab(0.086, 0.058, 0.225, 0.026);
      bodyAdd(l.ankle, foot, skin, 0, -0.035, -0.048);
    }
  }

  /** A soft patch of contact shadow that travels with the figure. */
  _buildBlobShadow() {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0.0, 'rgba(0,0,0,0.78)');
    g.addColorStop(0.40, 'rgba(0,0,0,0.38)');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(1.05, 1.35);
    geo.rotateX(-Math.PI / 2);
    this.blob = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false,
      blending: THREE.NormalBlending, opacity: 0.9, toneMapped: false
    }));
    this.blob.position.y = 0.012;
    this.blob.renderOrder = 3;
    this.root.add(this.blob);
  }

  /* -------------------------------------------------------------- wardrobe */

  setTone(id) {
    const t = FIGURE.tones.find((x) => x.id === id) || FIGURE.tones[FIGURE.defaultTone];
    this.skinMat.color.setHex(t.color);
    this.outfit.tone = t.id;
  }

  /** Rebuilds every garment from a chosen set of ids. */
  setOutfit(outfit) {
    this.outfit = Object.assign({}, this.outfit, outfit);
    if (outfit.tone) this.setTone(outfit.tone);

    // the list holds meshes and the odd group, so walk whatever is in it
    for (const obj of this._garmentMeshes) {
      obj.traverse((o) => {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (!o.material) return;
        for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
          for (const slot of ['map', 'normalMap', 'roughnessMap']) {
            if (mat[slot] && mat[slot].dispose) mat[slot].dispose();
          }
          if (mat.dispose) mat.dispose();
        }
      });
      if (obj.parent) obj.parent.remove(obj);
    }
    this._garmentMeshes = [];

    const pick = (list, id) => list.find((x) => x.id === id) || list[0];
    this._top = pick(WARDROBE.tops, this.outfit.top);
    this._bottom = pick(WARDROBE.bottoms, this.outfit.bottom);
    this._shoe = pick(WARDROBE.shoes, this.outfit.shoe);
    this._hat = pick(WARDROBE.hats, this.outfit.hat);
    this._hand = pick(WARDROBE.hands, this.outfit.hand);

    this._buildTop(this._top);
    this._buildBottom(this._bottom);
    this._buildShoes(this._shoe);
    this._buildHat(this._hat);
    this._buildHandItem(this._hand);
  }

  _wear(parent, geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    m.receiveShadow = true;
    parent.add(m);
    this._garmentMeshes.push(m);
    return m;
  }

  _buildTop(top) {
    if (!top) return;
    const mat = this._clothMat(top.color, 3.2);
    const trimMat = this._clothMat(top.trim === undefined ? top.color : top.trim, 2);

    // body of the shirt, a slightly looser copy of the torso
    const body = inflate(TORSO, 0.028, -0.13, 0.52);
    body.unshift({ y: -0.185, rx: body[0].rx * 0.99, rz: body[0].rz * 0.99 });   // hem
    this._wear(this.spine, loftTube(body, 26, false, false), mat);

    const shirtSections = inflate(TORSO, 0.028);
    this._wear(this.spine, bandGeometry(shirtSections, 0.500, 0.032, 0.008, 24), trimMat);

    // sleeves
    const long = top.sleeve === 'long';
    for (const side of ['L', 'R']) {
      const a = this.arm[side];
      this._wear(a.shoulder, ball(0.057), mat);
      const len = long ? P.upperArm : P.upperArm * 0.52;
      this._wear(a.shoulder, limb(0.057, long ? 0.048 : 0.052, len, 14, 0.03), mat);
      if (long) {
        this._wear(a.elbow, ball(0.048), mat);
        this._wear(a.elbow, limb(0.048, 0.038, P.foreArm * 0.92, 14, 0.03), mat);
        const cuffY = -P.foreArm * 0.92;
        const cuff = bandGeometry(
          [{ y: cuffY - 0.02, rx: 0.038, rz: 0.036 }, { y: cuffY + 0.02, rx: 0.040, rz: 0.038 }],
          cuffY, 0.026, 0.005, 16);
        this._wear(a.elbow, cuff, trimMat);
      }
    }

    if (top.graphic && this.textures.brandGraphics && this.textures.brandGraphics[top.id]) {
      this._buildChestGraphic(this.textures.brandGraphics[top.id], top);
    }
  }

  /** A printed graphic, curved to sit on the chest rather than float over it. */
  _buildChestGraphic(tex, top) {
    const w = top.graphicScale || 0.20;   // half-width in metres
    const h = w * (tex.image && tex.image.height ? tex.image.height / tex.image.width : 1);
    const R = 0.176;
    const segs = 14;
    const pos = [], uv = [], index = [], nrm = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const ang = (u - 0.5) * (2 * w / R);
      for (let j = 0; j <= 1; j++) {
        pos.push(Math.sin(ang) * R, 0.30 + (j ? h : -h) * 0.5, -Math.cos(ang) * R);
        nrm.push(Math.sin(ang), 0, -Math.cos(ang));
        uv.push(u, j);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 3, d = a + 2;
      index.push(a, b, c, a, c, d);       // face out of the chest, not into it
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    this._wear(this.spine, geo, mat);
  }

  _buildBottom(btm) {
    if (!btm) return;
    const mat = this._clothMat(btm.color, 3);
    const trimMat = this._clothMat(btm.trim === undefined ? btm.color : btm.trim, 2);
    const wide = btm.cut === 'wide';

    // seat and waist
    const seat = inflate(TORSO, 0.018, -0.13, 0.075);
    this._wear(this.spine, loftTube(seat, 24, false, false), mat);
    this._wear(this.spine, bandGeometry(inflate(TORSO, 0.018), 0.066, 0.048, 0.003, 24), trimMat);

    for (const side of ['L', 'R']) {
      const l = this.leg[side];
      this._wear(l.hip, ball(0.096), mat);
      this._wear(l.hip, limb(0.096, wide ? 0.086 : 0.076, P.thigh, 16, 0.03), mat);
      this._wear(l.knee, ball(wide ? 0.086 : 0.076), mat);
      this._wear(l.knee, limb(wide ? 0.086 : 0.076, wide ? 0.084 : 0.062, P.shin * 0.96, 16, 0.0), mat);
    }
  }

  _buildShoes(shoe) {
    if (!shoe) return;
    const mat = this._leatherMat(shoe.color);
    const soleMat = this._leatherMat(shoe.trim === undefined ? shoe.color : shoe.trim);
    for (const side of ['L', 'R']) {
      const l = this.leg[side];
      const upper = slab(0.100, 0.072, 0.245, 0.030);
      this._wear(l.ankle, upper, mat).position.set(0, -0.030, -0.052);
      const sole = slab(0.104, 0.026, 0.252, 0.012);
      this._wear(l.ankle, sole, soleMat).position.set(0, -0.062, -0.052);
      const collar = new THREE.TorusGeometry(0.043, 0.011, 8, 16);
      collar.rotateX(Math.PI / 2);
      this._wear(l.ankle, collar, soleMat).position.set(0, 0.002, 0.008);
    }
  }

  _buildHat(hat) {
    if (!hat || hat.style === 'none') return;
    const mat = this._clothMat(hat.color, 2.4);
    const trimMat = this._clothMat(hat.trim === undefined ? hat.color : hat.trim, 2);

    if (hat.style === 'cap') {
      const crown = ball(0.118, 20);
      crown.scale(1.0, 0.76, 1.02);
      const c = this._wear(this.head, crown, mat);
      c.position.y = 0.030;
      const peak = new THREE.CylinderGeometry(0.135, 0.135, 0.014, 22, 1, false, Math.PI * 0.12, Math.PI * 0.76);
      const p = this._wear(this.head, peak, trimMat);
      p.position.set(0, 0.006, -0.062);
      p.rotation.set(0.16, Math.PI / 2, 0);
      p.scale.set(1, 1, 0.78);
      const btn = ball(0.014, 8);
      this._wear(this.head, btn, trimMat).position.y = 0.118;
    } else if (hat.style === 'bucket') {
      const crown = new THREE.CylinderGeometry(0.116, 0.126, 0.115, 22, 1, false);
      this._wear(this.head, crown, mat).position.y = 0.058;
      const top = ball(0.116, 18);
      top.scale(1, 0.42, 1);
      this._wear(this.head, top, mat).position.y = 0.113;
      const brim = new THREE.TorusGeometry(0.135, 0.030, 10, 26);
      brim.rotateX(Math.PI / 2);
      brim.scale(1, 1, 0.42);
      const b = this._wear(this.head, brim, trimMat);
      b.position.y = 0.006;
      b.rotation.x = 0.10;
    } else if (hat.style === 'beanie') {
      const crown = ball(0.120, 20);
      crown.scale(1, 0.92, 1);
      this._wear(this.head, crown, mat).position.y = 0.036;
      const fold = new THREE.TorusGeometry(0.118, 0.024, 10, 24);
      fold.rotateX(Math.PI / 2);
      this._wear(this.head, fold, trimMat).position.y = -0.010;
    }
  }

  /* ------------------------------------------------------ what you carry */

  _buildHandItem(item) {
    this._handItem = null;
    this._ember = null;
    if (!item || item.style === 'none') return;

    const hand = this.arm.R.wrist;
    const holder = new THREE.Group();
    holder.position.set(0, -0.085, 0.012);
    hand.add(holder);
    this._garmentMeshes.push(holder);          // torn down with the rest
    this._handItem = holder;

    const put = (geo, mat) => {
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      holder.add(m);
      return m;
    };

    if (item.style === 'wine') {
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xf2f6f6, roughness: 0.06, metalness: 0.0,
        transparent: true, opacity: 0.26, side: THREE.DoubleSide,
        depthWrite: false, clearcoat: 1.0, clearcoatRoughness: 0.04, ior: 1.5
      });
      const profile = [
        new THREE.Vector2(0.0000, 0.000), new THREE.Vector2(0.0340, 0.002),
        new THREE.Vector2(0.0345, 0.008), new THREE.Vector2(0.0060, 0.016),
        new THREE.Vector2(0.0055, 0.070), new THREE.Vector2(0.0090, 0.082),
        new THREE.Vector2(0.0330, 0.098), new THREE.Vector2(0.0400, 0.128),
        new THREE.Vector2(0.0395, 0.160), new THREE.Vector2(0.0370, 0.162),
        new THREE.Vector2(0.0370, 0.126), new THREE.Vector2(0.0300, 0.100)
      ];
      put(new THREE.LatheGeometry(profile, 22), glassMat);
      const wine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0345, 0.0250, 0.030, 20),
        new THREE.MeshPhysicalMaterial({
          color: 0x5c1024, roughness: 0.16, metalness: 0.0,
          transparent: true, opacity: 0.92, clearcoat: 0.7
        })
      );
      wine.position.y = 0.118;
      holder.add(wine);
      // the fist closes on the stem, so the bowl clears the fingers
      holder.position.set(0.012, -0.055, 0.028);
      holder.rotation.set(0.10, 0, -0.06);
      for (const child of holder.children) child.position.y -= 0.062;

    } else if (item.style === 'polaroid') {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.42 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.35 });
      put(slab(0.115, 0.100, 0.062, 0.010), bodyMat);
      const lens = new THREE.CylinderGeometry(0.024, 0.028, 0.030, 20);
      lens.rotateX(Math.PI / 2);
      put(lens, darkMat).position.set(0.010, -0.004, -0.042);
      put(new THREE.TorusGeometry(0.0245, 0.004, 8, 20), darkMat).position.set(0.010, -0.004, -0.056);
      put(slab(0.026, 0.020, 0.012, 0.004), darkMat).position.set(-0.038, 0.030, -0.034);
      // the slot a print slides out of
      put(slab(0.086, 0.005, 0.010, 0.002),
          new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 }))
        .position.set(0, -0.052, -0.020);
      holder.rotation.set(0.12, 0.18, 0);
      holder.position.set(0.010, -0.075, 0.036);

    } else if (item.style === 'cigarette') {
      const paper = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.85 });
      const filter = new THREE.MeshStandardMaterial({ color: 0xc08b4a, roughness: 0.9 });
      const stick = new THREE.CylinderGeometry(0.0042, 0.0042, 0.062, 10);
      stick.rotateX(Math.PI / 2);
      put(stick, paper).position.set(0, 0, -0.018);
      const butt = new THREE.CylinderGeometry(0.0044, 0.0044, 0.020, 10);
      butt.rotateX(Math.PI / 2);
      put(butt, filter).position.set(0, 0, 0.023);
      const ember = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0042, 0.0030, 0.006, 10),
        new THREE.MeshStandardMaterial({
          color: 0x2a1206, emissive: 0xff5a1e, emissiveIntensity: 0.6, roughness: 1
        })
      );
      ember.rotation.x = Math.PI / 2;
      ember.position.set(0, 0, -0.051);
      holder.add(ember);
      this._ember = ember;
      holder.rotation.set(0.05, 0.28, 0);
      holder.position.set(0.006, -0.082, 0.030);
      this._buildSmoke();
    }
  }

  _buildSmoke() {
    if (this._smoke) return;
    const N = 90;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) seed[i] = Math.random();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const uniforms = {
      uTime: { value: 0 },
      uBirth: { value: -99 },
      uOrigin: { value: new THREE.Vector3() },
      uSprite: { value: softDot({ size: 64 }) }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false,
      vertexShader: `
        uniform float uTime, uBirth;
        uniform vec3 uOrigin;
        attribute float aSeed;
        varying float vFade;
        void main() {
          float age = ( uTime - uBirth ) - aSeed * 0.5;
          vFade = age > 0.0 ? max( 0.0, 1.0 - age / 3.2 ) : 0.0;
          vec3 p = uOrigin;
          p.y += age * ( 0.20 + aSeed * 0.16 );
          p.x += sin( age * 1.1 + aSeed * 6.28 ) * age * 0.07;
          p.z += cos( age * 0.9 + aSeed * 6.28 ) * age * 0.07;
          vec4 mv = viewMatrix * vec4( p, 1.0 );
          gl_PointSize = ( 26.0 + age * 70.0 ) * ( 0.5 + aSeed ) / max( 0.4, -mv.z );
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uSprite;
        varying float vFade;
        void main() {
          float a = texture2D( uSprite, gl_PointCoord ).a * vFade * 0.10;
          if ( a < 0.003 ) discard;
          gl_FragColor = vec4( vec3( 0.82, 0.82, 0.80 ), a );
        }`
    });
    this._smoke = new THREE.Points(geo, mat);
    this._smoke.frustumCulled = false;
    this._smoke.renderOrder = 21;
    this._smokeUniforms = uniforms;
  }

  /** The smoke lives in world space, so it stays put once it has left the hand. */
  get smoke() { return this._smoke; }

  /* -------------------------------------------------------------- actions */

  /** Which verb the held item performs, or null. */
  get handVerb() {
    return this._hand && this._hand.style !== 'none' ? this._hand.verb : null;
  }

  /** Plays a one-shot: 'drink', 'photograph', 'smoke' or 'toss'. */
  play(name) {
    if (this.action) return false;
    const spec = ACTIONS[name];
    if (!spec) return false;
    this.action = { name, spec, t: 0, fired: {} };
    return true;
  }

  get busy() { return !!this.action; }

  /* --------------------------------------------------------------- update */

  update(dt, state) {
    const speed = state.speed || 0;
    const maxSpeed = state.maxSpeed || 1;
    this.speedRatio += (Math.min(1, speed / maxSpeed) - this.speedRatio) * Math.min(1, dt * 8);
    const r = this.speedRatio;

    this.phase += speed * dt * 3.05;
    this.breath += dt;

    const p = this.phase;
    const swing = 0.66 * r;
    const idle = 1 - r;

    /* legs */
    for (const side of ['L', 'R']) {
      const l = this.leg[side];
      const o = side === 'L' ? 0 : Math.PI;
      l.hip.rotation.x = Math.sin(p + o) * swing;
      l.hip.rotation.z = l.sign * 0.02 * idle;
      l.knee.rotation.x = -(0.52 + 0.48 * Math.sin(p + o - 1.85)) * 0.95 * r - 0.05 * idle;
      l.ankle.rotation.x = -Math.sin(p + o - 0.8) * 0.28 * r;
    }

    /* arms counter-swing */
    for (const side of ['L', 'R']) {
      const a = this.arm[side];
      const o = side === 'L' ? Math.PI : 0;
      a.shoulder.rotation.x = Math.sin(p + o) * swing * 0.62;
      a.shoulder.rotation.z = a.sign * (0.085 + 0.03 * Math.sin(this.breath * 0.9 + a.sign));
      a.elbow.rotation.x = -(0.22 + 0.20 * Math.abs(Math.sin(p + o))) - 0.10 * idle;
      a.wrist.rotation.x = 0;
      a.wrist.rotation.z = 0;
    }

    /* an arm that is holding something does not swing freely: bend the elbow
       and bring the hand in front, or a glass ends up inside the thigh */
    if (this._hand && this._hand.style !== 'none') {
      const a = this.arm.R;
      const grip = this._hand.style === 'polaroid' ? 0.55 : 0.78;
      a.shoulder.rotation.x += (0.30 - a.shoulder.rotation.x) * grip;
      a.shoulder.rotation.z += (-0.34 - a.shoulder.rotation.z) * grip;
      a.elbow.rotation.x += (-1.32 - a.elbow.rotation.x) * grip;
      a.wrist.rotation.z = -0.18;
    }

    /* body carriage */
    this.hips.position.y = P.hipY + Math.sin(p * 2) * 0.020 * r;
    this.hips.rotation.y = Math.sin(p) * 0.06 * r;
    this.spine.rotation.x = -0.10 * r;
    this.spine.rotation.z = Math.sin(p) * 0.035 * r
                          + Math.sin(this.breath * 0.55) * 0.012 * idle;
    this.spine.rotation.y = -Math.sin(p) * 0.05 * r;
    this.neck.rotation.x = 0.06 * r;
    this.head.rotation.set(
      Math.sin(this.breath * 0.7) * 0.02 * idle,
      Math.sin(this.breath * 0.43) * 0.10 * idle,
      0
    );

    /* the one-shot pose blends over the top of all of that */
    if (this.action) this._applyAction(dt);

    /* Wine does not tilt with the wrist. Undo the arm's rotation on the
       holder so the glass stays level, which is what a hand actually does. */
    if (this._handItem && this._hand && this._hand.style === 'wine') {
      const wrist = this.arm.R.wrist;
      wrist.updateWorldMatrix(true, false);
      wrist.getWorldQuaternion(_q);
      this._handItem.quaternion.copy(_q).invert();
      this._handItem.quaternion.multiply(_upright);
    }

    if (this._smokeUniforms) this._smokeUniforms.uTime.value = state.time || 0;
    if (this._ember) {
      this._ember.material.emissiveIntensity =
        0.45 + Math.sin(this.breath * 2.1) * 0.12 + (this.action ? 1.4 : 0);
    }
  }

  _applyAction(dt) {
    const a = this.action;
    a.t += dt / a.spec.duration;

    if (a.t >= 1) {
      this.action = null;
      return;
    }

    // ease the pose in and back out so it never snaps
    const inK = Math.min(1, a.t / 0.18);
    const outK = Math.min(1, (1 - a.t) / 0.24);
    const blend = Math.min(inK, outK) * Math.min(inK, outK) * (3 - 2 * Math.min(inK, outK));

    const pose = a.spec.pose(a.t);
    for (const key in pose) {
      const node = this._node(key);
      if (!node) continue;
      const target = pose[key];
      for (const axis of ['x', 'y', 'z']) {
        if (target[axis] === undefined) continue;
        node.rotation[axis] = node.rotation[axis] * (1 - blend) + target[axis] * blend;
      }
    }

    if (a.spec.events) {
      for (const ev of a.spec.events) {
        if (a.t >= ev.at && !a.fired[ev.name]) {
          a.fired[ev.name] = true;
          if (this.onEvent) this.onEvent(ev.name, this);
        }
      }
    }
  }

  _node(key) {
    switch (key) {
      case 'shoulderR': return this.arm.R.shoulder;
      case 'elbowR': return this.arm.R.elbow;
      case 'wristR': return this.arm.R.wrist;
      case 'shoulderL': return this.arm.L.shoulder;
      case 'elbowL': return this.arm.L.elbow;
      case 'wristL': return this.arm.L.wrist;
      case 'head': return this.head;
      case 'neck': return this.neck;
      case 'spine': return this.spine;
      default: return null;
    }
  }

  /** Which arm is free to throw with. */
  get tossAction() {
    return (this._hand && this._hand.style !== 'none') ? 'tossLeft' : 'toss';
  }

  /** World position of a hand, for spawning coins and smoke. */
  handPosition(target, side) {
    const wrist = this.arm[side === 'L' ? 'L' : 'R'].wrist;
    wrist.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(wrist.matrixWorld);
  }

  headPosition(target) {
    this.head.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.head.matrixWorld);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry && o.geometry.dispose) o.geometry.dispose();
      if (o.material && o.material.dispose) {
        for (const k of ['map', 'normalMap', 'roughnessMap']) {
          if (o.material[k] && o.material[k].dispose) o.material[k].dispose();
        }
        o.material.dispose();
      }
    });
  }
}

const _q = new THREE.Quaternion();
const _upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -0.05));

/* ---------------------------------------------------------------- actions -- */

const ease = (t) => t * t * (3 - 2 * t);
/** Rises to 1 over [a,b], holds, falls back over [c,d]. */
const arc = (t, a, b, c, d) =>
  t < a ? 0 : t < b ? ease((t - a) / (b - a))
  : t < c ? 1 : t < d ? 1 - ease((t - c) / (d - c)) : 0;

const ACTIONS = {
  drink: {
    duration: 2.9,
    events: [{ name: 'sip', at: 0.46 }],
    pose(t) {
      const k = arc(t, 0.0, 0.30, 0.58, 0.92);
      const tip = arc(t, 0.30, 0.44, 0.56, 0.72);
      return {
        shoulderR: { x: 0.42 * k, z: -0.62 * k },
        elbowR: { x: -2.15 * k },
        wristR: { x: -0.35 * tip },
        head: { x: -0.16 * tip },
        neck: { x: -0.10 * tip }
      };
    }
  },

  photograph: {
    duration: 3.1,
    events: [{ name: 'shutter', at: 0.50 }, { name: 'print', at: 0.62 }],
    pose(t) {
      const k = arc(t, 0.0, 0.30, 0.62, 0.94);
      return {
        shoulderR: { x: 0.92 * k, z: -0.42 * k },
        elbowR: { x: -1.92 * k },
        shoulderL: { x: 0.88 * k, z: 0.52 * k },
        elbowL: { x: -2.05 * k },
        head: { x: 0.06 * k },
        spine: { x: -0.10 * k }
      };
    }
  },

  smoke: {
    duration: 3.4,
    events: [{ name: 'draw', at: 0.42 }, { name: 'exhale', at: 0.66 }],
    pose(t) {
      const k = arc(t, 0.0, 0.26, 0.46, 0.80);
      const up = arc(t, 0.60, 0.70, 0.78, 0.94);
      return {
        shoulderR: { x: 0.30 * k, z: -0.70 * k },
        elbowR: { x: -2.35 * k },
        head: { x: 0.04 * k - 0.20 * up },
        neck: { x: -0.14 * up }
      };
    }
  },

  toss: {
    duration: 2.2,
    events: [{ name: 'release', at: 0.42 }],
    pose(t) {
      const wind = arc(t, 0.0, 0.22, 0.30, 0.40);
      const throwK = arc(t, 0.34, 0.46, 0.52, 0.86);
      return {
        shoulderR: { x: -0.55 * wind + 1.25 * throwK, z: -0.30 * wind - 0.10 * throwK },
        elbowR: { x: -1.85 * wind - 0.25 * throwK },
        spine: { x: 0.06 * wind - 0.10 * throwK },
        head: { x: -0.10 * throwK }
      };
    }
  },

  /* the same throw with the other arm, for when the right hand is full */
  tossLeft: {
    duration: 2.2,
    events: [{ name: 'release', at: 0.42 }],
    pose(t) {
      const wind = arc(t, 0.0, 0.22, 0.30, 0.40);
      const throwK = arc(t, 0.34, 0.46, 0.52, 0.86);
      return {
        shoulderL: { x: -0.55 * wind + 1.25 * throwK, z: 0.30 * wind + 0.10 * throwK },
        elbowL: { x: -1.85 * wind - 0.25 * throwK },
        spine: { x: 0.06 * wind - 0.10 * throwK },
        head: { x: -0.10 * throwK }
      };
    }
  }
};

export { ACTIONS, P as PROPORTIONS };
