/**
 * The visitor: a figure you dress before you go in, and watch from behind
 * once you are inside.
 *
 * Built from numbers rather than model files, and skinned. Every limb is one
 * continuous tube bound to a skeleton, so an elbow bends instead of pivoting
 * — which is the difference between a person and a stack of parts. Garments
 * are second, slightly larger tubes bound to the same skeleton, which is why
 * a top can be swapped without touching the body underneath.
 *
 * The face is painted, not modelled. So was every face in the games this is
 * aiming at: geometry that cheap cannot hold a likeness, and a texture can.
 */
import * as THREE from 'three';
import { clothSurface, leatherSurface, skinSurface, faceTexture, softDot } from './textures.js';
import { WARDROBE, FIGURE } from './wardrobe.js';

/* -------------------------------------- the figure, in metres off the floor */

const Y = {
  hips: 0.95, spine: 1.09, chest: 1.26, neck: 1.44, head: 1.615,
  shoulder: 1.41, elbow: 1.13, wrist: 0.88,
  knee: 0.51, ankle: 0.09
};
const X = { shoulder: 0.183, leg: 0.084 };
const HEAD_R = 0.104;
/** Scaled to a real skull: 16cm across, 23cm tall, 19cm deep. */
const HEAD_SCALE = [0.78, 1.10, 0.92];

/** Bone order. Each name's index is its slot in the skeleton. */
const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'shoulderL', 'elbowL', 'wristL',
  'shoulderR', 'elbowR', 'wristR',
  'hipL', 'kneeL', 'ankleL',
  'hipR', 'kneeR', 'ankleR'
];
const B = {};
BONES.forEach((n, i) => { B[n] = i; });

/** Which bones drive which stretch of the body, root outward. */
const CHAINS = {
  torso: [
    { bone: B.hips, y: Y.hips }, { bone: B.spine, y: Y.spine },
    { bone: B.chest, y: Y.chest }, { bone: B.neck, y: Y.neck }
  ],
  head: [{ bone: B.neck, y: Y.neck }, { bone: B.head, y: Y.head }],
  armL: [
    { bone: B.shoulderL, y: Y.shoulder }, { bone: B.elbowL, y: Y.elbow },
    { bone: B.wristL, y: Y.wrist }
  ],
  armR: [
    { bone: B.shoulderR, y: Y.shoulder }, { bone: B.elbowR, y: Y.elbow },
    { bone: B.wristR, y: Y.wrist }
  ],
  legL: [
    { bone: B.hipL, y: Y.hips }, { bone: B.kneeL, y: Y.knee },
    { bone: B.ankleL, y: Y.ankle }
  ],
  legR: [
    { bone: B.hipR, y: Y.hips }, { bone: B.kneeR, y: Y.knee },
    { bone: B.ankleR, y: Y.ankle }
  ]
};

/* --------------------------------------------------------------- geometry -- */

/**
 * Lofts a stack of elliptical rings into a smooth tube, in bind space.
 * Sections run bottom to top: [{ y, rx, rz }], optionally offset sideways.
 */
function loftTube(sections, radial, capBottom, capTop, ox, oz) {
  const pos = [], nrm = [], uv = [], index = [];
  const rings = sections.length;
  const cols = radial + 1;
  ox = ox || 0; oz = oz || 0;

  for (let i = 0; i < rings; i++) {
    const s = sections[i];
    const prev = sections[Math.max(0, i - 1)];
    const next = sections[Math.min(rings - 1, i + 1)];
    const dy = next.y - prev.y || 1;
    const drx = (next.rx - prev.rx) / dy;
    const drz = (next.rz - prev.rz) / dy;

    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(ox + s.rx * ca, s.y, oz + s.rz * sa);
      const n = new THREE.Vector3(
        ca / Math.max(0.02, s.rx),
        -(drx * ca * ca + drz * sa * sa),
        sa / Math.max(0.02, s.rz)
      ).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(j / radial, i / (rings - 1));
    }
  }

  // sections run bottom to top and the ring anticlockwise, so this is the
  // winding that puts the front face on the outside
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * cols + j, b = a + 1;
      const c = (i + 1) * cols + j + 1, d = (i + 1) * cols + j;
      index.push(a, c, b, a, d, c);
    }
  }

  /** A domed cap, so a raised limb never shows a hollow tube. */
  const addCap = (ringIndex, up) => {
    const s = sections[ringIndex];
    const rows = 4;
    const base = pos.length / 3;
    for (let r = 1; r <= rows; r++) {
      const t = r / rows;
      const k = Math.cos(t * Math.PI / 2);
      const sinT = Math.sin(t * Math.PI / 2);
      const lift = sinT * Math.min(s.rx, s.rz) * 0.42;
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        pos.push(ox + s.rx * k * ca, s.y + (up ? lift : -lift), oz + s.rz * k * sa);
        const n = new THREE.Vector3(ca * k, up ? sinT : -sinT, sa * k).normalize();
        nrm.push(n.x, n.y, n.z);
        uv.push(j / radial, up ? 1 : 0);
      }
    }
    let prevRow = ringIndex * cols;
    for (let r = 0; r < rows; r++) {
      const row = base + r * cols;
      for (let j = 0; j < radial; j++) {
        const a = prevRow + j, b = prevRow + j + 1;
        const c = row + j + 1, d = row + j;
        if (up) index.push(a, c, b, a, d, c);
        else index.push(a, b, c, a, c, d);
      }
      prevRow = row;
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

/** Builds a limb's section stack between height stops, with a mid bulge. */
function taper(stops, bulge) {
  const secs = [];
  const span = stops[stops.length - 1].y - stops[0].y || 1;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    const steps = 4;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const y = a.y + (b.y - a.y) * t;
      let r = a.r + (b.r - a.r) * t;
      if (bulge) r *= 1 + Math.sin(((y - stops[0].y) / span) * Math.PI) * bulge;
      secs.push({ y, rx: r, rz: r * 0.93 });
    }
  }
  const last = stops[stops.length - 1];
  secs.push({ y: last.y, rx: last.r, rz: last.r * 0.93 });
  return secs.sort((p, q) => p.y - q.y);
}

/** A rounded slab, for feet, hands and the camera body. */
function slab(w, h, d, r, segs) {
  const geo = new THREE.BoxGeometry(w, h, d, segs || 3, segs || 3, segs || 3);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  const hx = Math.max(0, w / 2 - r), hy = Math.max(0, h / 2 - r), hz = Math.max(0, d / 2 - r);
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

/** Merges geometries that share an attribute layout. */
function merge(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) {
    if (!g.index) {
      const n = g.attributes.position.count;
      const seq = new Uint32Array(n);
      for (let i = 0; i < n; i++) seq[i] = i;
      g.setIndex(new THREE.BufferAttribute(seq, 1));
    }
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------- skinning -- */

/**
 * Binds a geometry to a chain of bones by height.
 *
 * Geometry between two bones is driven by the upper one; within `band` of a
 * joint the two blend, reaching an even split exactly at the joint. That is
 * what turns a hinge into a bend.
 */
function skinChain(geo, chain, band) {
  const pos = geo.attributes.position;
  const n = chain.length;
  const asc = chain[n - 1].y > chain[0].y;
  const proj = (v) => (asc ? v : -v);
  const ys = chain.map((c) => proj(c.y));

  const idx = new Uint16Array(pos.count * 4);
  const wts = new Float32Array(pos.count * 4);

  for (let k = 0; k < pos.count; k++) {
    const y = proj(pos.getY(k));
    const acc = [];

    if (y <= ys[0]) {
      acc.push([chain[0].bone, 1]);
    } else if (y >= ys[n - 1]) {
      acc.push([chain[n - 1].bone, 1]);
    } else {
      let i = 0;
      while (i < n - 2 && y > ys[i + 1]) i++;
      const dFar = ys[i + 1] - y;
      const dNear = y - ys[i];
      const wFar = dFar < band ? 0.5 * (1 - dFar / band) : 0;
      const wNear = (i > 0 && dNear < band) ? 0.5 * (1 - dNear / band) : 0;
      acc.push([chain[i].bone, 1 - wFar - wNear]);
      if (wFar > 0) acc.push([chain[i + 1].bone, wFar]);
      if (wNear > 0) acc.push([chain[i - 1].bone, wNear]);
    }

    for (let s = 0; s < Math.min(4, acc.length); s++) {
      idx[k * 4 + s] = acc[s][0];
      wts[k * 4 + s] = acc[s][1];
    }
  }

  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

/** Binds every vertex rigidly to one bone. */
function skinTo(geo, bone) {
  const count = geo.attributes.position.count;
  const idx = new Uint16Array(count * 4);
  const wts = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) { idx[k * 4] = bone; wts[k * 4] = 1; }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

/* ----------------------------------------------------- ambient occlusion -- */

/**
 * Cheap contact shading, written into vertex colours.
 *
 * The body is approximated by a handful of spheres, and each vertex asks how
 * much of its sky they block. One pass over the mesh, and it darkens exactly
 * the places a real renderer would: armpits, inner thighs, under the chin,
 * under a hem.
 */
const OCCLUDERS = [
  { tag: 'torso', p: [0, 1.32, 0], r: 0.20 },
  { tag: 'torso', p: [0, 1.14, 0], r: 0.17 },
  { tag: 'torso', p: [0, 0.94, 0], r: 0.19 },
  { tag: 'head', p: [0, 1.53, 0], r: 0.12 },
  { tag: 'armL', p: [-X.shoulder, 1.30, 0], r: 0.06 },
  { tag: 'armR', p: [X.shoulder, 1.30, 0], r: 0.06 },
  { tag: 'legL', p: [-X.leg, 0.80, 0], r: 0.09 },
  { tag: 'legR', p: [X.leg, 0.80, 0], r: 0.09 },
  { tag: 'legL', p: [-X.leg, 0.55, 0], r: 0.07 },
  { tag: 'legR', p: [X.leg, 0.55, 0], r: 0.07 }
];

/**
 * `skip` names the occluders that stand for the part being baked. Without it
 * a part shades itself, and because the "am I inside this sphere" test is a
 * hard yes or no, that shows up as a scalloped band across the mesh.
 */
function bakeOcclusion(geo, strength, skip) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  if (!nrm) return geo;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3(), n = new THREE.Vector3(), d = new THREE.Vector3();
  const k = strength === undefined ? 0.55 : strength;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nrm, i);
    let ao = 0;

    for (const o of OCCLUDERS) {
      if (skip && skip.indexOf(o.tag) >= 0) continue;
      d.set(o.p[0] - v.x, o.p[1] - v.y, o.p[2] - v.z);
      const dist = d.length();
      if (dist > o.r + 0.42) continue;
      // ramp in over four centimetres rather than switching on at the surface
      const fade = Math.min(1, Math.max(0, (dist - o.r) / 0.04));
      if (fade <= 0) continue;
      d.multiplyScalar(1 / dist);
      const facing = d.dot(n);
      if (facing <= 0) continue;                              // behind the surface
      ao += facing * Math.min(0.85, (o.r * o.r) / (dist * dist)) * fade;
    }

    const shade = 1 - Math.min(0.58, ao * k);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

/* ----------------------------------------------------------- body shapes -- */

const TORSO = [
  { y: 0.828, rx: 0.144, rz: 0.104 },
  { y: 0.878, rx: 0.155, rz: 0.111 },
  { y: 0.930, rx: 0.158, rz: 0.113 },
  { y: 1.010, rx: 0.141, rz: 0.100 },
  { y: 1.110, rx: 0.132, rz: 0.094 },
  { y: 1.190, rx: 0.140, rz: 0.099 },
  { y: 1.270, rx: 0.156, rz: 0.107 },
  { y: 1.345, rx: 0.166, rz: 0.111 },
  { y: 1.408, rx: 0.157, rz: 0.102 },
  { y: 1.448, rx: 0.116, rz: 0.088 }
];

const ARM_STOPS = [
  { y: Y.shoulder + 0.03, r: 0.055 },
  { y: Y.elbow, r: 0.0425 },
  { y: Y.wrist, r: 0.0335 }
];
const LEG_STOPS = [
  { y: Y.hips + 0.02, r: 0.0855 },
  { y: Y.knee, r: 0.0615 },
  { y: Y.ankle, r: 0.0425 }
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

/** A collar, cuff or waistband that follows the body's ellipse. */
function bandGeometry(sections, y, height, pad, radial, ox) {
  const half = height / 2;
  const secs = [];
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const yy = y - half + height * t;
    const s = sectionAt(sections, yy);
    const swell = pad + Math.sin(t * Math.PI) * pad * 0.55;
    secs.push({ y: yy, rx: s.rx + swell, rz: s.rz + swell });
  }
  return loftTube(secs, radial || 24, false, false, ox || 0, 0);
}

/* -------------------------------------------------------------- the figure */

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

    this._garments = [];
    this._handItem = null;
    this._smoke = null;
  }

  /* ------------------------------------------------------------ materials */

  _buildMaterials() {
    this.maps = {
      cloth: clothSurface({ size: 512, weave: 60, drape: 0.85, relief: 1.5, seed: 63 }),
      denim: clothSurface({ size: 512, weave: 40, drape: 1.05, relief: 1.9, seed: 21 }),
      leather: leatherSurface({ size: 256, seed: 71 }),
      skin: skinSurface({ size: 512, seed: 88 }),
      face: faceTexture({ size: 512 })
    };

    const tone = FIGURE.tones[FIGURE.defaultTone];
    this.skinMat = new THREE.MeshStandardMaterial({
      color: tone.color,
      map: this.maps.skin.map,
      normalMap: this.maps.skin.normalMap,
      roughnessMap: this.maps.skin.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true
    });
    for (const t of [this.maps.skin.map, this.maps.skin.normalMap, this.maps.skin.roughnessMap]) {
      t.repeat.set(2, 3);
      t.needsUpdate = true;
    }

    this.faceMat = new THREE.MeshStandardMaterial({
      map: this.maps.face,
      transparent: true,
      roughness: 0.62,
      metalness: 0.0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });

    this.hairMat = new THREE.MeshStandardMaterial({
      color: tone.hair === undefined ? 0x2b211b : tone.hair,
      roughness: 0.78,
      metalness: 0.0,
      vertexColors: true
    });
  }

  _clothMat(color, repeat, denim) {
    const src = denim ? this.maps.denim : this.maps.cloth;
    const m = new THREE.MeshStandardMaterial({
      color,
      map: src.map.clone(),
      normalMap: src.normalMap.clone(),
      roughnessMap: src.roughnessMap.clone(),
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 1.0,
      metalness: 0.0,
      vertexColors: true
    });
    const r = repeat || 2;
    for (const t of [m.map, m.normalMap, m.roughnessMap]) {
      t.repeat.set(r, r * 1.4);
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
      metalness: 0.0,
      vertexColors: true
    });
    for (const t of [m.normalMap, m.roughnessMap]) {
      t.repeat.set(2, 2);
      t.needsUpdate = true;
    }
    return m;
  }

  /* ------------------------------------------------------------- skeleton */

  _buildSkeleton() {
    const bone = (name, x, y, z) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x || 0, y || 0, z || 0);
      return b;
    };

    const bones = new Array(BONES.length);
    bones[B.hips] = bone('hips', 0, Y.hips, 0);
    bones[B.spine] = bone('spine', 0, Y.spine - Y.hips, 0);
    bones[B.chest] = bone('chest', 0, Y.chest - Y.spine, 0);
    bones[B.neck] = bone('neck', 0, Y.neck - Y.chest, 0);
    bones[B.head] = bone('head', 0, Y.head - Y.neck, 0);

    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      bones[B['shoulder' + side]] = bone('shoulder' + side, s * X.shoulder, Y.shoulder - Y.chest, 0);
      bones[B['elbow' + side]] = bone('elbow' + side, 0, Y.elbow - Y.shoulder, 0);
      bones[B['wrist' + side]] = bone('wrist' + side, 0, Y.wrist - Y.elbow, 0);
      bones[B['hip' + side]] = bone('hip' + side, s * X.leg, 0, 0);
      bones[B['knee' + side]] = bone('knee' + side, 0, Y.knee - Y.hips, 0);
      bones[B['ankle' + side]] = bone('ankle' + side, 0, Y.ankle - Y.knee, 0);
    }

    bones[B.hips].add(bones[B.spine], bones[B.hipL], bones[B.hipR]);
    bones[B.spine].add(bones[B.chest]);
    bones[B.chest].add(bones[B.neck], bones[B.shoulderL], bones[B.shoulderR]);
    bones[B.neck].add(bones[B.head]);
    for (const side of ['L', 'R']) {
      bones[B['shoulder' + side]].add(bones[B['elbow' + side]]);
      bones[B['elbow' + side]].add(bones[B['wrist' + side]]);
      bones[B['hip' + side]].add(bones[B['knee' + side]]);
      bones[B['knee' + side]].add(bones[B['ankle' + side]]);
    }

    this.root.add(bones[B.hips]);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(bones);
    this.bones = bones;

    this.hips = bones[B.hips];
    this.spine = bones[B.spine];
    this.chest = bones[B.chest];
    this.neck = bones[B.neck];
    this.head = bones[B.head];
    this.arm = {
      L: { shoulder: bones[B.shoulderL], elbow: bones[B.elbowL], wrist: bones[B.wristL], sign: -1 },
      R: { shoulder: bones[B.shoulderR], elbow: bones[B.elbowR], wrist: bones[B.wristR], sign: 1 }
    };
    this.leg = {
      L: { hip: bones[B.hipL], knee: bones[B.kneeL], ankle: bones[B.ankleL], sign: -1 },
      R: { hip: bones[B.hipR], knee: bones[B.kneeR], ankle: bones[B.ankleR], sign: 1 }
    };
  }

  /** Adds a skinned mesh in bind space. */
  _skinned(geo, mat) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(this.skeleton);
    return mesh;
  }

  /* ----------------------------------------------------------------- body */

  _buildBody() {
    this.bodyMeshes = [];

    /* torso — one piece from seat to collarbone */
    const torso = loftTube(TORSO, 30, true, true);
    skinChain(torso, CHAINS.torso, 0.13);
    bakeOcclusion(torso, 0.5, ['torso']);
    this.bodyMeshes.push(this._skinned(torso, this.skinMat));

    /* neck */
    const neck = loftTube([
      { y: 1.395, rx: 0.060, rz: 0.056 },
      { y: 1.450, rx: 0.050, rz: 0.047 },
      { y: 1.520, rx: 0.048, rz: 0.046 }
    ], 18, false, false);
    skinChain(neck, CHAINS.head, 0.09);
    bakeOcclusion(neck, 0.75, ['torso']);
    this.bodyMeshes.push(this._skinned(neck, this.skinMat));

    /* head */
    const headGeo = new THREE.SphereGeometry(HEAD_R, 30, 24);
    headGeo.scale(HEAD_SCALE[0], HEAD_SCALE[1], HEAD_SCALE[2]);
    const hp = headGeo.attributes.position, hv = new THREE.Vector3();
    for (let i = 0; i < hp.count; i++) {
      hv.fromBufferAttribute(hp, i);
      const down = Math.max(0, -hv.y / (HEAD_R * HEAD_SCALE[1]));
      hv.x *= 1 - down * down * 0.34;   // taper into a jaw and chin
      hv.z *= 1 - down * down * 0.20;
      if (hv.z > 0) hv.z *= 0.93;       // flatten the back of the skull
      else hv.z *= 1 + down * 0.02;     // and push the chin forward a little
      hp.setXYZ(i, hv.x, hv.y, hv.z);
    }
    hp.needsUpdate = true;
    headGeo.computeVertexNormals();
    headGeo.translate(0, Y.head, 0);
    skinTo(headGeo, B.head);
    bakeOcclusion(headGeo, 0.35, ['head']);
    this.bodyMeshes.push(this._skinned(headGeo, this.skinMat));

    /* the face, projected straight onto the front of the skull */
    const face = this._faceGeometry();
    skinTo(face, B.head);
    this.faceMesh = this._skinned(face, this.faceMat);
    this.faceMesh.renderOrder = 2;

    /* hair, a cap a hat can sit over */
    const hair = new THREE.SphereGeometry(HEAD_R * 1.045, 26, 20, 0, Math.PI * 2, 0, 1.30);
    hair.scale(HEAD_SCALE[0] * 1.02, HEAD_SCALE[1] * 1.01, HEAD_SCALE[2] * 1.02);
    const gp = hair.attributes.position, gv = new THREE.Vector3();
    for (let i = 0; i < gp.count; i++) {
      gv.fromBufferAttribute(gp, i);
      const t = gv.z / (HEAD_R * HEAD_SCALE[2]);
      if (t > 0) gv.y -= t * 0.030;          // longer at the back
      else gv.y -= t * 0.016;                // lifted off the brow at the front
      gp.setXYZ(i, gv.x, gv.y, gv.z);
    }
    gp.needsUpdate = true;
    hair.computeVertexNormals();
    hair.translate(0, Y.head, 0);
    skinTo(hair, B.head);
    bakeOcclusion(hair, 0.3, ['head']);
    this.hairMesh = this._skinned(hair, this.hairMat);

    /* arms and legs — each one continuous tube through its joints */
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;

      const arm = loftTube(taper(ARM_STOPS, 0.05), 18, true, true, s * X.shoulder, 0);
      skinChain(arm, CHAINS['arm' + side], 0.085);
      bakeOcclusion(arm, 0.6, ['arm' + side]);
      this.bodyMeshes.push(this._skinned(arm, this.skinMat));

      const hand = this._handGeometry(s);
      skinTo(hand, B['wrist' + side]);
      bakeOcclusion(hand, 0.4, ['arm' + side]);
      this.bodyMeshes.push(this._skinned(hand, this.skinMat));

      const leg = loftTube(taper(LEG_STOPS, 0.055), 20, true, false, s * X.leg, 0);
      skinChain(leg, CHAINS['leg' + side], 0.10);
      bakeOcclusion(leg, 0.55, ['leg' + side]);
      this.bodyMeshes.push(this._skinned(leg, this.skinMat));

      const foot = slab(0.084, 0.056, 0.215, 0.024);
      foot.translate(s * X.leg, Y.ankle - 0.030, -0.046);
      skinTo(foot, B['ankle' + side]);
      bakeOcclusion(foot, 0.4, ['leg' + side]);
      this.bodyMeshes.push(this._skinned(foot, this.skinMat));
    }
  }

  /**
   * The face patch.
   *
   * A sphere segment would do, but it pinches toward the pole and drags the
   * mouth out of shape. Projecting a flat grid onto the front of the skull
   * instead keeps the features laid out exactly as they were painted.
   */
  _faceGeometry() {
    const a = HEAD_R * HEAD_SCALE[0];
    const b = HEAD_R * HEAD_SCALE[1];
    const c = HEAD_R * HEAD_SCALE[2];
    const W = 0.150, H = 0.225, CY = 1.593;      // where the painting lands
    const NX = 22, NY = 26;

    const pos = [], nrm = [], uv = [], index = [];
    for (let j = 0; j <= NY; j++) {
      const tv = j / NY;
      const y = CY + (0.5 - tv) * H;
      const ny = (y - Y.head) / b;
      const down = Math.max(0, -ny);

      for (let i = 0; i <= NX; i++) {
        const tu = i / NX;
        const x0 = (tu - 0.5) * W;
        const k = 1 - (x0 / a) * (x0 / a) - ny * ny;

        // the same jaw taper the skull got, so the patch stays on the face
        // rather than floating off it — and a mouth narrower than the eyes
        // is what a face does anyway
        const x = x0 * (1 - down * down * 0.34);
        let z = -c * Math.sqrt(Math.max(0.05, k));
        z *= (1 - down * down * 0.20) * (1 + down * 0.02);
        z *= 1.022;                                   // stand off the skin

        pos.push(x, y, z);
        const n = new THREE.Vector3(x / (a * a), ny / b, z / (c * c)).normalize();
        nrm.push(n.x, n.y, n.z);
        uv.push(tu, 1 - tv);
      }
    }
    const cols = NX + 1;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const p0 = j * cols + i, p1 = p0 + 1;
        const p2 = (j + 1) * cols + i + 1, p3 = (j + 1) * cols + i;
        index.push(p0, p1, p2, p0, p2, p3);   // faces out of the head, not into it
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return geo;
  }

  /**
   * A hand rather than a paddle: a palm, a soft block of fingers with two
   * grooves cut in, and a thumb set across. At seven centimetres, enough.
   */
  _handGeometry(s) {
    const parts = [];
    const palm = slab(0.070, 0.062, 0.031, 0.014, 3);
    palm.translate(0, Y.wrist - 0.034, 0);
    parts.push(palm);

    const fingers = slab(0.066, 0.062, 0.027, 0.013, 3);
    fingers.translate(0, Y.wrist - 0.092, 0.002);
    parts.push(fingers);

    for (const dx of [-0.021, 0.021]) {
      const groove = new THREE.CylinderGeometry(0.0032, 0.0032, 0.058, 6);
      groove.translate(dx, Y.wrist - 0.096, -0.014);
      parts.push(groove);
    }

    const thumb = slab(0.024, 0.046, 0.024, 0.011, 2);
    thumb.rotateZ(s * 0.55);
    thumb.translate(-s * 0.030, Y.wrist - 0.052, 0.008);
    parts.push(thumb);

    return merge(parts);
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
      map: tex, transparent: true, depthWrite: false, opacity: 0.9, toneMapped: false
    }));
    this.blob.position.y = 0.012;
    this.blob.renderOrder = 3;
    this.root.add(this.blob);
  }

  /* -------------------------------------------------------------- wardrobe */

  setTone(id) {
    const t = FIGURE.tones.find((x) => x.id === id) || FIGURE.tones[FIGURE.defaultTone];
    this.skinMat.color.setHex(t.color);
    this.hairMat.color.setHex(t.hair === undefined ? 0x2b211b : t.hair);
    this.outfit.tone = t.id;
  }

  setOutfit(outfit) {
    this.outfit = Object.assign({}, this.outfit, outfit);
    if (outfit.tone) this.setTone(outfit.tone);

    for (const obj of this._garments) {
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
    this._garments = [];

    const pick = (list, id) => list.find((x) => x.id === id) || list[0];
    this._top = pick(WARDROBE.tops, this.outfit.top);
    this._bottom = pick(WARDROBE.bottoms, this.outfit.bottom);
    this._shoe = pick(WARDROBE.shoes, this.outfit.shoe);
    this._hat = pick(WARDROBE.hats, this.outfit.hat);
    this._hand = pick(WARDROBE.hands, this.outfit.hand);

    // bind everything with the figure standing at the origin, so a garment
    // chosen mid-visit binds exactly like one chosen at the door
    const keepPos = this.root.position.clone();
    const keepRot = this.root.rotation.clone();
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.updateMatrixWorld(true);

    this._buildTop(this._top);
    this._buildBottom(this._bottom);
    this._buildShoes(this._shoe);
    this._buildHat(this._hat);

    this.root.position.copy(keepPos);
    this.root.rotation.copy(keepRot);
    this.root.updateMatrixWorld(true);

    this._buildHandItem(this._hand);
    this.hairMesh.visible = !this._hat || this._hat.style !== 'beanie';
  }

  /** `bind` is either a chain plus blend band, or a single bone index. */
  _wear(geo, mat, chain, bind, ao, skip) {
    if (chain) skinChain(geo, chain, bind); else skinTo(geo, bind);
    bakeOcclusion(geo, ao === undefined ? 0.5 : ao, skip);
    const mesh = this._skinned(geo, mat);
    this._garments.push(mesh);
    return mesh;
  }

  _buildTop(top) {
    if (!top) return;
    const mat = this._clothMat(top.color, 3.2);
    const trimMat = this._clothMat(top.trim === undefined ? top.color : top.trim, 1.4);

    const body = inflate(TORSO, 0.021, 0.82, 1.46);
    body.unshift({ y: 0.800, rx: body[0].rx * 0.985, rz: body[0].rz * 0.985 });  // hem
    this._wear(loftTube(body, 28, false, false), mat, CHAINS.torso, 0.13, 0.55, ['torso']);

    this._wear(bandGeometry(inflate(TORSO, 0.021), 1.452, 0.026, 0.005, 24),
               trimMat, CHAINS.torso, 0.09, 0.7, ['torso']);

    const long = top.sleeve === 'long';
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const end = long ? Y.wrist + 0.028 : Y.shoulder - 0.150;
      // the sleeve head has to reach inboard far enough to meet the body of
      // the shirt, or a notch of bare shoulder shows between them
      const stops = long
        ? [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: Y.elbow, r: 0.049 }, { y: end, r: 0.041 }]
        : [{ y: Y.shoulder + 0.034, r: 0.065 }, { y: end, r: 0.057 }];

      this._wear(loftTube(taper(stops, 0.03), 18, false, true, s * X.shoulder, 0),
                 mat, CHAINS['arm' + side], 0.085, 0.6, ['arm' + side]);

      if (long) {
        this._wear(bandGeometry(
          [{ y: end - 0.02, rx: 0.042, rz: 0.040 }, { y: end + 0.02, rx: 0.044, rz: 0.042 }],
          end, 0.026, 0.005, 16, s * X.shoulder), trimMat, CHAINS['arm' + side], 0.06, 0.7, ['arm' + side]);
      }
    }

    if (top.graphic && this.textures.brandGraphics && this.textures.brandGraphics[top.id]) {
      this._buildChestGraphic(this.textures.brandGraphics[top.id], top);
    }
  }

  /** A printed graphic, curved to sit on the chest rather than float over it. */
  _buildChestGraphic(tex, top) {
    const w = top.graphicScale || 0.20;
    const h = w * (tex.image && tex.image.height ? tex.image.height / tex.image.width : 1);
    const R = 0.178;
    const segs = 14;
    const cy = 1.285;
    const pos = [], uv = [], index = [], nrm = [];
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const ang = (u - 0.5) * (2 * w / R);
      for (let j = 0; j <= 1; j++) {
        pos.push(Math.sin(ang) * R, cy + (j ? h : -h) * 0.5, -Math.cos(ang) * R);
        nrm.push(Math.sin(ang), 0, -Math.cos(ang));
        uv.push(u, j);
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2, b = a + 1, c = a + 3, d = a + 2;
      index.push(a, b, c, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.9, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    skinChain(geo, CHAINS.torso, 0.13);
    this._garments.push(this._skinned(geo, mat));
  }

  _buildBottom(btm) {
    if (!btm) return;
    const denim = btm.cut === 'straight';
    const mat = this._clothMat(btm.color, 2.8, denim);
    const trimMat = this._clothMat(btm.trim === undefined ? btm.color : btm.trim, 1.4, denim);
    const wide = btm.cut === 'wide';

    const seat = inflate(TORSO, 0.013, 0.82, 1.02);
    this._wear(loftTube(seat, 26, true, false), mat, CHAINS.torso, 0.13, 0.55, ['torso']);
    this._wear(bandGeometry(inflate(TORSO, 0.013), 1.008, 0.044, 0.002, 28),
               trimMat, CHAINS.torso, 0.11, 0.6, ['torso']);

    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const stops = [
        { y: Y.hips + 0.03, r: 0.098 },
        { y: Y.knee, r: wide ? 0.086 : 0.076 },
        { y: Y.ankle + 0.035, r: wide ? 0.085 : 0.063 }
      ];
      this._wear(loftTube(taper(stops, 0.02), 22, false, true, s * X.leg, 0),
                 mat, CHAINS['leg' + side], 0.10, 0.55, ['leg' + side]);
    }
  }

  _buildShoes(shoe) {
    if (!shoe) return;
    const mat = this._leatherMat(shoe.color);
    const soleMat = this._leatherMat(shoe.trim === undefined ? shoe.color : shoe.trim);
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? -1 : 1;
      const upper = slab(0.098, 0.070, 0.238, 0.028, 4);
      upper.translate(s * X.leg, Y.ankle - 0.026, -0.050);
      this._wear(upper, mat, null, B['ankle' + side], 0.45, ['leg' + side]);

      const sole = slab(0.102, 0.024, 0.244, 0.011, 4);
      sole.translate(s * X.leg, Y.ankle - 0.058, -0.050);
      this._wear(sole, soleMat, null, B['ankle' + side], 0.5, ['leg' + side]);
    }
  }

  _buildHat(hat) {
    if (!hat || hat.style === 'none') return;
    const mat = this._clothMat(hat.color, 1.6);
    const trimMat = this._clothMat(hat.trim === undefined ? hat.color : hat.trim, 1.2);
    const put = (geo) => this._wear(geo, mat, null, B.head, 0.35, ['head']);
    const putTrim = (geo) => this._wear(geo, trimMat, null, B.head, 0.4, ['head']);

    // sized off the skull, so a narrower head does not wear a wide hat
    const SX = HEAD_SCALE[0], SZ = HEAD_SCALE[2];

    if (hat.style === 'cap') {
      const crown = new THREE.SphereGeometry(HEAD_R * 1.06, 24, 18, 0, Math.PI * 2, 0, 1.32);
      crown.scale(SX * 1.04, 0.80, SZ * 1.04);
      crown.translate(0, Y.head + 0.024, 0);
      put(crown);

      // a partial disc fanned forward: radius sets the reach, the x scale
      // keeps it no wider than the head
      const peak = new THREE.CylinderGeometry(0.116, 0.116, 0.012, 24, 1, false,
                                              Math.PI * 0.14, Math.PI * 0.72);
      peak.scale(0.80, 1, 1.0);
      peak.rotateY(Math.PI / 2);
      peak.rotateX(0.16);
      peak.translate(0, Y.head + 0.006, -0.024);
      putTrim(peak);

      const btn = new THREE.SphereGeometry(0.011, 10, 8);
      btn.translate(0, Y.head + 0.098, 0);
      putTrim(btn);

    } else if (hat.style === 'bucket') {
      const crown = new THREE.CylinderGeometry(HEAD_R * 0.98, HEAD_R * 1.06, 0.110, 24, 1, false);
      crown.scale(SX * 1.05, 1, SZ * 1.05);
      crown.translate(0, Y.head + 0.050, 0);
      put(crown);

      const top = new THREE.SphereGeometry(HEAD_R * 0.98, 22, 12, 0, Math.PI * 2, 0, 1.2);
      top.scale(SX * 1.05, 0.40, SZ * 1.05);
      top.translate(0, Y.head + 0.102, 0);
      put(top);

      const brim = new THREE.TorusGeometry(HEAD_R * 1.12, 0.028, 10, 28);
      brim.rotateX(Math.PI / 2 + 0.10);
      brim.scale(SX * 1.10, 1, SZ * 0.50);
      brim.translate(0, Y.head + 0.002, 0);
      putTrim(brim);

    } else if (hat.style === 'beanie') {
      const crown = new THREE.SphereGeometry(HEAD_R * 1.07, 24, 18, 0, Math.PI * 2, 0, 1.5);
      crown.scale(SX * 1.05, 1.02, SZ * 1.05);
      crown.translate(0, Y.head + 0.026, 0);
      put(crown);

      const fold = new THREE.TorusGeometry(HEAD_R * 1.05, 0.022, 10, 26);
      fold.rotateX(Math.PI / 2);
      fold.scale(SX * 1.06, 1, SZ * 1.06);
      fold.translate(0, Y.head - 0.020, 0);
      putTrim(fold);
    }
  }

  /* -------------------------------------------------------- what you carry */

  _buildHandItem(item) {
    this._handItem = null;
    this._ember = null;
    if (!item || item.style === 'none') return;

    const holder = new THREE.Group();
    holder.position.set(0, -0.085, 0.012);
    this.arm.R.wrist.add(holder);
    this._garments.push(holder);
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
      put(new THREE.LatheGeometry(profile, 24), glassMat);
      const wine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0345, 0.0250, 0.030, 22),
        new THREE.MeshPhysicalMaterial({
          color: 0x5c1024, roughness: 0.16, metalness: 0.0,
          transparent: true, opacity: 0.92, clearcoat: 0.7
        })
      );
      wine.position.y = 0.118;
      holder.add(wine);
      holder.position.set(0.012, -0.055, 0.028);
      holder.rotation.set(0.10, 0, -0.06);
      for (const child of holder.children) child.position.y -= 0.062;

    } else if (item.style === 'polaroid') {
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.42 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.35 });
      put(slab(0.115, 0.100, 0.062, 0.010, 3), bodyMat);
      const lens = new THREE.CylinderGeometry(0.024, 0.028, 0.030, 20);
      lens.rotateX(Math.PI / 2);
      put(lens, darkMat).position.set(0.010, -0.004, -0.042);
      put(new THREE.TorusGeometry(0.0245, 0.004, 8, 20), darkMat).position.set(0.010, -0.004, -0.056);
      put(slab(0.026, 0.020, 0.012, 0.004, 2), darkMat).position.set(-0.038, 0.030, -0.034);
      put(slab(0.086, 0.005, 0.010, 0.002, 2),
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

  get smoke() { return this._smoke; }

  /* -------------------------------------------------------------- actions */

  get handVerb() {
    return this._hand && this._hand.style !== 'none' ? this._hand.verb : null;
  }

  get tossAction() {
    return (this._hand && this._hand.style !== 'none') ? 'tossLeft' : 'toss';
  }

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

    for (const side of ['L', 'R']) {
      const l = this.leg[side];
      const o = side === 'L' ? 0 : Math.PI;
      l.hip.rotation.x = Math.sin(p + o) * swing;
      l.hip.rotation.z = l.sign * 0.02 * idle;
      l.knee.rotation.x = -(0.52 + 0.48 * Math.sin(p + o - 1.85)) * 0.95 * r - 0.06 * idle;
      l.ankle.rotation.x = -Math.sin(p + o - 0.8) * 0.28 * r;
    }

    for (const side of ['L', 'R']) {
      const a = this.arm[side];
      const o = side === 'L' ? Math.PI : 0;
      a.shoulder.rotation.x = Math.sin(p + o) * swing * 0.62;
      a.shoulder.rotation.z = a.sign * (0.085 + 0.03 * Math.sin(this.breath * 0.9 + a.sign));
      a.elbow.rotation.x = -(0.22 + 0.20 * Math.abs(Math.sin(p + o))) - 0.12 * idle;
      a.wrist.rotation.set(0, 0, 0);
    }

    /* an arm that is holding something does not swing freely */
    if (this._hand && this._hand.style !== 'none') {
      const a = this.arm.R;
      const grip = this._hand.style === 'polaroid' ? 0.55 : 0.78;
      a.shoulder.rotation.x += (0.30 - a.shoulder.rotation.x) * grip;
      a.shoulder.rotation.z += (-0.34 - a.shoulder.rotation.z) * grip;
      a.elbow.rotation.x += (-1.32 - a.elbow.rotation.x) * grip;
      a.wrist.rotation.z = -0.18;
    }

    /* carriage — split across two spine bones so the back actually curves */
    this.hips.position.y = Y.hips + Math.sin(p * 2) * 0.020 * r;
    this.hips.rotation.y = Math.sin(p) * 0.06 * r;
    this.spine.rotation.x = -0.055 * r;
    this.spine.rotation.z = Math.sin(p) * 0.020 * r
                          + Math.sin(this.breath * 0.55) * 0.008 * idle;
    this.spine.rotation.y = -Math.sin(p) * 0.030 * r;
    this.chest.rotation.x = -0.045 * r + Math.sin(this.breath * 0.9) * 0.006 * idle;
    this.chest.rotation.z = Math.sin(p) * 0.016 * r;
    this.chest.rotation.y = -Math.sin(p) * 0.022 * r;
    this.neck.rotation.x = 0.06 * r;
    this.head.rotation.set(
      Math.sin(this.breath * 0.7) * 0.02 * idle,
      Math.sin(this.breath * 0.43) * 0.10 * idle,
      0
    );

    if (this.action) this._applyAction(dt);

    /* wine does not tilt with the wrist */
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
    if (a.t >= 1) { this.action = null; return; }

    const inK = Math.min(1, a.t / 0.18);
    const outK = Math.min(1, (1 - a.t) / 0.24);
    const e = Math.min(inK, outK);
    const blend = e * e * (3 - 2 * e);

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
      case 'chest': return this.chest;
      case 'spine': return this.spine;
      default: return null;
    }
  }

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
    if (this.skeleton) this.skeleton.dispose();
  }
}

const _q = new THREE.Quaternion();
const _upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, -0.05));

/* ---------------------------------------------------------------- actions -- */

const ease = (t) => t * t * (3 - 2 * t);
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
        chest: { x: -0.10 * k }
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
        chest: { x: 0.06 * wind - 0.10 * throwK },
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
        chest: { x: 0.06 * wind - 0.10 * throwK },
        head: { x: -0.10 * throwK }
      };
    }
  }
};

export { ACTIONS, Y as HEIGHTS };
