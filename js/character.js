/**
 * The visitor: a man or a woman you dress at the door, and watch from behind
 * once you are inside.
 *
 * Each is a skinned 3D model built offline from CC0 parts (tools/human/), so this
 * file does no modelling. What it does:
 *
 *  - loads the chosen figure and keeps one copy of it (the .glb is cached, so
 *    switching back to a figure already seen is instant),
 *  - tints skin and hair, shows the chosen outfit and puts the held item in a hand,
 *  - walks it, and breathes, from a handful of rotations on a 49-bone skeleton.
 *    Every bone is world-aligned at rest, which is what lets the poses below be
 *    plain Euler angles: arms hang along -y, the figure faces -z, a positive
 *    rotation about x swings a limb forward,
 *  - and performs the actions (drink, photograph, smoke, toss) by saying where a
 *    palm has to be and letting an arm solver find the angles (figure/ik.js).
 *
 * If the model cannot be loaded, main.js falls back to character.procedural.js,
 * which has the same public surface.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadModel } from './models.js';
import { FIGURE, figureById } from './wardrobe.js';
import { WARDROBE } from './wardrobe.js';
import { Arm } from './figure/ik.js';
import { buildItem } from './figure/items.js';

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Extra curl, in radians, for each joint of each finger, on top of the relaxed rest hand. */
const GRIPS = {
  wine: [[0.10, 0.22, 0.12], [0.40, 0.65, 0.30], [0.50, 0.80, 0.40], [0.60, 0.85, 0.45], [0.66, 0.90, 0.50]],
  polaroid: [[0.05, 0.16, 0.10], [0.30, 0.50, 0.28], [0.34, 0.54, 0.30], [0.40, 0.58, 0.34], [0.44, 0.60, 0.36]],
  cigarette: [[0.30, 0.28, 0.10], [0.10, 0.22, 0.08], [0.14, 0.28, 0.10], [0.62, 0.92, 0.50], [0.72, 1.00, 0.52]],
  open: [[-0.10, -0.10, -0.05], [-0.18, -0.30, -0.15], [-0.20, -0.32, -0.16], [-0.20, -0.30, -0.16], [-0.18, -0.28, -0.15]]
};

const ease = (t) => t * t * (3 - 2 * t);
const arc = (t, a, b, c, d) =>
  t < a ? 0 : t < b ? ease((t - a) / (b - a))
  : t < c ? 1 : t < d ? 1 - ease((t - c) / (d - c)) : 0;
const lerp = (a, b, t) => a + (b - a) * t;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _pole = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _tgt = new THREE.Vector3();

export class Character {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'visitor';

    this.phase = 0;
    this.breath = 0;
    this.speedRatio = 0;
    this.action = null;
    this.onEvent = null;
    this.outfit = {};

    this.fig = null;                  // the figure currently standing here
    this._token = 0;
    this._handItem = null;
    this._ember = null;
    this._smoke = null;
    this._smokeUniforms = null;
    this._hold = 0;                   // 0..1: how firmly the right arm is holding its item
    this._hand = WARDROBE.hands[0];

    this._buildBlobShadow();
  }

  /* --------------------------------------------------------------- loading */

  /** Resolves when the figure and outfit asked for are standing here. */
  setOutfit(outfit) {
    this.outfit = Object.assign({}, this.outfit, outfit);
    const token = ++this._token;
    this.ready = this._apply(token);
    return this.ready;
  }

  async _apply(token) {
    const def = figureById(this.outfit.body);
    if (!this.fig || this.fig.id !== def.id) {
      const gltf = await loadModel(def.model);
      if (token !== this._token) return;            // a newer choice has superseded this one
      this._stand(def, gltf);
    }
    this._dress();
  }

  _stand(def, gltf) {
    if (this.fig) this._release();

    const scene = cloneSkinned(gltf.scene);
    scene.name = 'figure-' + def.id;
    const bones = {};
    const meshes = [];
    scene.traverse((o) => {
      if (o.isBone) bones[o.name] = o;
      if (o.isMesh) meshes.push(o);
    });
    this.root.add(scene);
    this.root.updateMatrixWorld(true);

    // where every bone sits at rest, in the figure's own space. The character may already
    // be standing somewhere in the room when a new figure is chosen, so world positions
    // would carry that along; undo the root's transform.
    const inv = this.root.matrixWorld.clone().invert();
    const rest = {};
    for (const n of Object.keys(bones)) rest[n] = bones[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);

    const a = (gltf.asset && gltf.asset.extras && gltf.asset.extras.anchors) || {};
    const anchors = {};
    for (const k of Object.keys(a)) anchors[k] = new THREE.Vector3().fromArray(a[k]);

    // materials: a copy of the two we tint, so the cached model keeps its own
    const mats = {};
    for (const m of meshes) {
      m.frustumCulled = false;                       // the bind-pose bounds do not follow the pose
      m.castShadow = false;
      m.receiveShadow = true;
      const mats1 = Array.isArray(m.material) ? m.material : [m.material];
      mats1.forEach((mat, i) => {
        if (mat.name === 'skin' || mat.name === 'hair' || mat.name === 'eye') {
          const c = mat.clone();
          if (Array.isArray(m.material)) m.material[i] = c; else m.material = c;
          mats[mat.name] = c;
          mat = c;
        }
        if (mat.alphaTest > 0 && mat.name !== 'eye') mat.alphaToCoverage = true;
        for (const slot of ['map', 'normalMap', 'metalnessMap', 'roughnessMap']) {
          if (mat[slot]) mat[slot].anisotropy = 4;
        }
      });
    }
    if (mats.eye) mats.eye.envMapIntensity = 1.4;

    const outfits = {};
    scene.traverse((o) => {
      if (/^outfit_/.test(o.name) && !o.isMesh && !o.parent.name.startsWith('outfit_')) outfits[o.name.slice(7)] = o;
    });

    const b = (n) => bones[n];
    const side = (L) => ({
      shoulder: b('shoulder' + L), elbow: b('elbow' + L), wrist: b('wrist' + L),
      clavicle: b('clavicle' + L),
      sign: L === 'L' ? -1 : 1,
      ik: new Arm(b('shoulder' + L), b('elbow' + L), b('wrist' + L)),
      fingers: FINGERS.map((f) => [1, 2, 3].map((j) => b(`${f}${j}${L}`)))
    });
    const leg = (L) => ({ hip: b('hip' + L), knee: b('knee' + L), ankle: b('ankle' + L), sign: L === 'L' ? -1 : 1 });

    this.fig = { id: def.id, def, scene, bones, rest, anchors, mats, outfits, height: (gltf.asset.extras || {}).height || 1.8,
      // the average colour of each tinted texture, so a tone is a ratio against what is really there
      skinBase: colourOf(gltf.asset.extras, 'skinBase', 0xd6a285), hairBase: colourOf(gltf.asset.extras, 'hairBase', 0x3a2a20) };
    this.hips = b('hips'); this.spine = b('spine'); this.chest = b('chest');
    this.neck = b('neck'); this.head = b('head');
    this.arm = { L: side('L'), R: side('R') };
    this.leg = { L: leg('L'), R: leg('R') };
    this._hipsRestY = this.hips.position.y;

    // palm centre, in the wrist's own (world-aligned) space
    for (const L of ['L', 'R']) {
      this.arm[L].palm = anchors['palm' + L].clone().sub(rest['wrist' + L]);
      this.arm[L].handAxis = this.arm[L].palm.clone().normalize();
    }
    // a finger's curl axis is carried on its bone
    for (const L of ['L', 'R']) {
      this.arm[L].fingerAxes = this.arm[L].fingers.map((row) => row.map((bone) => {
        const c = bone.userData && bone.userData.curl;
        return c ? new THREE.Vector3().fromArray(c) : new THREE.Vector3(0, 0, 1);
      }));
    }
    this.blob.scale.setScalar(this.fig.height / 1.8);
  }

  _release() {
    this._removeItem();
    const f = this.fig;
    if (!f) return;
    this.root.remove(f.scene);
    for (const m of Object.values(f.mats)) m.dispose();          // the textures belong to the cached model
    this.fig = null;
  }

  /** Skin and hair tone, the outfit that is showing, and what is in the hand. */
  _dress() {
    const f = this.fig;
    if (!f) return;

    const tone = FIGURE.tones.find((t) => t.id === this.outfit.tone) || FIGURE.tones[FIGURE.defaultTone];
    this.outfit.tone = tone.id;
    if (f.mats.skin) f.mats.skin.color.copy(toneMultiplier(tone.color, f.skinBase));
    if (f.mats.hair) f.mats.hair.color.copy(toneMultiplier(tone.hair === undefined ? 0x2b211b : tone.hair, f.hairBase));

    const want = f.outfits[this.outfit.outfit] ? this.outfit.outfit : Object.keys(f.outfits)[0];
    this.outfit.outfit = want;
    for (const [id, node] of Object.entries(f.outfits)) node.visible = id === want;

    this._hand = WARDROBE.hands.find((h) => h.id === this.outfit.hand) || WARDROBE.hands[0];
    this._buildHandItem(this._hand);
  }

  /* ------------------------------------------------------------ held item */

  _removeItem() {
    if (this._handItem && this._handItem.parent) this._handItem.parent.remove(this._handItem);
    this._handItem = null;
    this._ember = null;
    // the smoke belongs to the scene, so main.js can see it; it is rebuilt with the item
    if (this._smoke && this._smoke.parent) this._smoke.parent.remove(this._smoke);
    if (this._smoke) { this._smoke.geometry.dispose(); this._smoke.material.dispose(); }
    this._smoke = null;
    this._smokeUniforms = null;
  }

  _buildHandItem(item) {
    this._removeItem();
    if (!this.fig || !item || item.style === 'none') return;
    const built = buildItem(item.style);
    const holder = new THREE.Group();
    holder.name = 'holder';
    holder.position.copy(this.arm.R.palm);
    holder.add(built.group);
    this.arm.R.wrist.add(holder);
    this._handItem = holder;
    this._ember = built.ember;
    if (built.smoke) { this._smoke = built.smoke.points; this._smokeUniforms = built.smoke.uniforms; }
  }

  /* -------------------------------------------------------------- shadows */

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

  /* -------------------------------------------------------------- queries */

  get smoke() { return this._smoke; }

  get handVerb() {
    return this._hand && this._hand.style !== 'none' ? this._hand.verb : null;
  }

  get tossAction() {
    return (this._hand && this._hand.style !== 'none') ? 'tossLeft' : 'toss';
  }

  get busy() { return !!this.action; }

  play(name) {
    if (this.action || !this.fig) return false;
    const spec = ACTIONS[name];
    if (!spec) return false;
    this.action = { name, spec, t: 0, fired: {} };
    return true;
  }

  handPosition(target, side) {
    if (!this.fig) return target.set(0, 1, 0);
    const arm = this.arm[side === 'L' ? 'L' : 'R'];
    arm.wrist.updateWorldMatrix(true, false);
    return target.copy(arm.palm).applyMatrix4(arm.wrist.matrixWorld);
  }

  headPosition(target) {
    if (!this.fig) return target.set(0, 1.6, 0);
    this.head.updateWorldMatrix(true, false);
    return target.setFromMatrixPosition(this.head.matrixWorld);
  }

  /** the lips, in world space: where a puff of smoke starts */
  mouthPosition(target) {
    if (!this.fig) return this.headPosition(target);
    return this._onBone(this.head, this.fig.anchors.mouth, target);
  }

  /** A point fixed to a bone at rest, wherever the bone has gone since. */
  _onBone(bone, restPoint, target) {
    bone.updateWorldMatrix(true, false);
    _v.copy(restPoint).sub(this.fig.rest[bone.name]);
    return target.copy(_v).applyMatrix4(bone.matrixWorld);
  }

  /* --------------------------------------------------------------- update */

  update(dt, state) {
    const f = this.fig;
    const speed = state.speed || 0;
    const maxSpeed = state.maxSpeed || 1;
    this.speedRatio += (Math.min(1, speed / maxSpeed) - this.speedRatio) * Math.min(1, dt * 8);
    const r = this.speedRatio;
    this.phase += speed * dt * 3.05;
    this.breath += dt;
    if (!f) return;

    const p = this.phase;
    const swing = 0.62 * r;
    const idle = 1 - r;

    /* legs */
    for (const L of ['L', 'R']) {
      const leg = this.leg[L];
      const o = L === 'L' ? 0 : Math.PI;
      leg.hip.rotation.set(Math.sin(p + o) * swing, 0, leg.sign * 0.015 * idle);
      leg.knee.rotation.x = -(0.30 + 0.42 * Math.max(0, Math.sin(p + o - 1.45))) * 1.05 * r - 0.03 * idle;
      leg.ankle.rotation.x = -Math.sin(p + o - 0.6) * 0.20 * r + Math.max(0, Math.sin(p + o - 1.45)) * 0.18 * r;
    }

    /* carriage */
    this.hips.position.y = this._hipsRestY + Math.abs(Math.sin(p)) * -0.022 * r;
    this.hips.rotation.y = Math.sin(p) * 0.07 * r;
    this.spine.rotation.set(-0.04 * r, -Math.sin(p) * 0.04 * r, Math.sin(p) * 0.015 * r + Math.sin(this.breath * 0.55) * 0.006 * idle);
    this.chest.rotation.set(-0.03 * r + Math.sin(this.breath * 1.15) * 0.007 * idle, -Math.sin(p) * 0.03 * r, Math.sin(p) * 0.012 * r);
    this.neck.rotation.x = 0.04 * r;
    this.head.rotation.set(
      Math.sin(this.breath * 0.7) * 0.015 * idle,
      Math.sin(this.breath * 0.43) * 0.09 * idle,
      0
    );

    /* arms hang and swing */
    for (const L of ['L', 'R']) {
      const a = this.arm[L];
      const o = L === 'L' ? Math.PI : 0;
      const s = Math.sin(p + o);
      a.shoulder.rotation.set(s * swing * 0.55, 0, a.sign * 0.004 * Math.sin(this.breath * 0.9 + a.sign));
      a.elbow.rotation.set(0.10 + 0.20 * Math.max(0, -s) * r + 0.03 * idle, 0, 0);
      a.wrist.quaternion.identity();
      this._relaxFingers(a);
    }

    this.root.updateMatrixWorld(true);

    /* the right arm: holding its item, or performing */
    this._hold += ((this._hand && this._hand.style !== 'none' ? 1 : 0) - this._hold) * Math.min(1, dt * 6);
    if (this.action) this._act(dt);
    else if (this._hold > 0.01) this._holdPose(this._hold, r);
    else this._itemFollows();

    if (this._smokeUniforms) this._smokeUniforms.uTime.value = state.time || 0;
    if (this._ember) {
      this._ember.material.emissiveIntensity = 0.45 + Math.sin(this.breath * 2.1) * 0.12 + (this.action ? 1.4 : 0);
    }
  }

  _relaxFingers(arm) {
    for (let f = 0; f < 5; f++) for (let j = 0; j < 3; j++) arm.fingers[f][j].quaternion.identity();
  }

  /** Extra curl on every finger of one hand. grip is [thumb..pinky][joint]. */
  _curl(arm, grip, k) {
    for (let f = 0; f < 5; f++) for (let j = 0; j < 3; j++) {
      arm.fingers[f][j].quaternion.setFromAxisAngle(arm.fingerAxes[f][j], grip[f][j] * k);
    }
  }

  /**
   * Drive the right palm to a place in the figure's own space (relative to the
   * chest, so the torso leaning does not drag it away).
   */
  _reachGrip(arm, targetWorld, poleWorld, weight) {
    if (weight <= 0) return;
    const fk = [arm.shoulder.quaternion.clone(), arm.elbow.quaternion.clone()];
    _tgt.copy(targetWorld);
    let wrist = _w.copy(_tgt);
    // the palm sits a hand's length from the wrist; iterate so the PALM lands on target
    for (let i = 0; i < 4; i++) {
      arm.ik.reach(wrist, poleWorld);
      arm.wrist.updateWorldMatrix(true, false);
      _grip.copy(arm.palm).applyMatrix4(arm.wrist.matrixWorld);
      wrist.addScaledVector(_v.subVectors(_tgt, _grip), 1);
    }
    if (weight < 1) {
      const ik = [arm.shoulder.quaternion.clone(), arm.elbow.quaternion.clone()];
      arm.shoulder.quaternion.copy(fk[0]).slerp(ik[0], weight);
      arm.elbow.quaternion.copy(fk[1]).slerp(ik[1], weight);
    }
    arm.shoulder.updateMatrixWorld(true);
  }

  /** a point in front of the chest, in world space */
  _chestPoint(x, y, z, out) {
    const f = this.fig;
    return this._onBone(this.chest, _v.set(f.rest.chest.x + x, f.rest.chest.y + y, f.rest.chest.z + z), out);
  }

  _holdPose(w, r) {
    const k = this.fig.height / 1.8;
    const a = this.arm.R;
    this._chestPoint(0.175 * k, -0.01 * k + Math.sin(this.breath * 0.9) * 0.004, -0.255 * k, _tgt);
    _pole.set(0.8, -0.5, 0.5).applyQuaternion(this.root.getWorldQuaternion(_q2));
    this._reachGrip(a, _tgt, _pole, w);
    const grip = GRIPS[this._hand.style] || GRIPS.wine;
    this._curl(a, grip, w);
    this._orientItem(0);
  }

  _itemFollows() { this._orientItem(0); }

  /**
   * Items keep their own orientation rather than turning with the wrist: a glass
   * stays upright however the forearm is raised. `tilt` leans it toward the face.
   */
  _orientItem(tilt) {
    if (!this._handItem) return;
    const wrist = this.arm.R.wrist;
    wrist.getWorldQuaternion(_q).invert();
    this.root.getWorldQuaternion(_q2);
    this._handItem.quaternion.copy(_q).multiply(_q2);
    if (tilt) this._handItem.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), tilt));
    const style = this._hand && this._hand.style;
    if (style === 'cigarette') this._handItem.quaternion.multiply(_q.setFromAxisAngle(_v.set(0, 1, 0), 0.0));
  }

  /* -------------------------------------------------------------- actions */

  _act(dt) {
    const act = this.action;
    act.t += dt / act.spec.duration;
    if (act.t >= 1) { this.action = null; this._orientItem(0); return; }

    const inK = Math.min(1, act.t / 0.18);
    const outK = Math.min(1, (1 - act.t) / 0.24);
    const e = Math.min(inK, outK);
    const blend = e * e * (3 - 2 * e);

    act.spec.perform(this, act.t, blend);

    if (act.spec.events) {
      for (const ev of act.spec.events) {
        if (act.t >= ev.at && !act.fired[ev.name]) {
          act.fired[ev.name] = true;
          if (this.onEvent) this.onEvent(ev.name, this);
        }
      }
    }
  }

  /** helpers the actions use */
  _eyePoint(dx, dy, dz, out) {
    const f = this.fig;
    _w.copy(f.anchors.eyeL).add(f.anchors.eyeR).multiplyScalar(0.5).add(_pole.set(dx, dy, dz));
    return this._onBone(this.head, _w, out);
  }

  _mouthPoint(dx, dy, dz, out) {
    const m = this.fig.anchors.mouth;
    _w.set(m.x + dx, m.y + dy, m.z + dz);
    return this._onBone(this.head, _w, out);
  }

  dispose() {
    this._release();
    if (this.blob) { this.blob.geometry.dispose(); this.blob.material.map.dispose(); this.blob.material.dispose(); }
  }
}

/* ------------------------------------------------------------------ tones -- */

function colourOf(extras, key, fallback) {
  const v = extras && extras[key];
  return v ? new THREE.Color().setRGB(v[0], v[1], v[2]) : new THREE.Color(fallback);
}

/**
 * A tone is a ratio against the colour the texture really has, split in two: how
 * much lighter or darker (applied in full), and how much the hue moves (half).
 * Applying the whole per-channel ratio overshoots: a fair tone over an already
 * fair skin goes grey, and a brown hair multiplied by 2 in red alone goes ginger.
 */
function toneMultiplier(hex, base, { maxLight = 1.16 } = {}) {
  const a = new THREE.Color(hex);
  const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const light = Math.min(maxLight, Math.max(0.06, lum(a) / lum(base)));
  const out = new THREE.Color(1, 1, 1);
  const chroma = [a.r / base.r, a.g / base.g, a.b / base.b];
  const mean = (chroma[0] * 0.2126 + chroma[1] * 0.7152 + chroma[2] * 0.0722);
  out.r = light * Math.pow(chroma[0] / mean, 0.5);
  out.g = light * Math.pow(chroma[1] / mean, 0.5);
  out.b = light * Math.pow(chroma[2] / mean, 0.5);
  return out;
}

/* ---------------------------------------------------------------- actions -- */

/**
 * Each action says where the palm is, relative to the face or chest, over time.
 * `perform(c, t, e)`: c is the Character, t runs 0..1, e is the blend in/out.
 */
export const ACTIONS = {
  drink: {
    duration: 2.9,
    events: [{ name: 'sip', at: 0.46 }],
    perform(c, t, e) {
      const a = c.arm.R;
      const k = arc(t, 0.0, 0.30, 0.58, 0.92);
      const tip = arc(t, 0.30, 0.44, 0.56, 0.72);
      const s = c.fig.height / 1.8;
      c._chestPoint(0.175 * s, -0.01 * s, -0.255 * s, _grip);
      c._mouthPoint(0.0, -0.088 + tip * 0.012, -0.060 - tip * 0.010, _tgt);
      _tgt.lerp(_grip, 1 - k);
      _pole.set(1, -0.2, 0.4).applyQuaternion(c.root.getWorldQuaternion(_q2));
      c._reachGrip(a, _tgt, _pole, Math.max(e, c._hold));
      c._curl(a, GRIPS.wine, 1);
      c.head.rotation.x += -0.14 * tip;
      c.neck.rotation.x += -0.08 * tip;
      c._orientItem(-0.55 * tip);
    }
  },

  photograph: {
    duration: 3.1,
    events: [{ name: 'shutter', at: 0.50 }, { name: 'print', at: 0.62 }],
    perform(c, t, e) {
      const k = arc(t, 0.0, 0.30, 0.62, 0.94);
      const s = c.fig.height / 1.8;
      c._chestPoint(0.175 * s, -0.01 * s, -0.255 * s, _grip);
      c._eyePoint(0.062, -0.075, -0.20, _tgt);
      _tgt.lerp(_grip, 1 - k);
      _pole.set(1, -0.4, 0.6).applyQuaternion(c.root.getWorldQuaternion(_q2));
      c._reachGrip(c.arm.R, _tgt, _pole, Math.max(e, c._hold));
      c._curl(c.arm.R, GRIPS.polaroid, 1);

      // the other hand steadies the camera
      c._eyePoint(-0.075, -0.080, -0.19, _tgt);
      _pole.set(-1, -0.4, 0.6).applyQuaternion(c.root.getWorldQuaternion(_q2));
      c._chestPoint(-0.175 * s, -0.01 * s, -0.20 * s, _grip);
      _tgt.lerp(_grip, 1 - k);
      c._reachGrip(c.arm.L, _tgt, _pole, e);
      c._curl(c.arm.L, GRIPS.polaroid, k * 0.8);
      c.head.rotation.x += 0.05 * k;
      c._orientItem(0);
    }
  },

  smoke: {
    duration: 3.4,
    events: [{ name: 'draw', at: 0.42 }, { name: 'exhale', at: 0.66 }],
    perform(c, t, e) {
      const k = arc(t, 0.0, 0.26, 0.46, 0.80);
      const up = arc(t, 0.60, 0.70, 0.78, 0.94);
      const s = c.fig.height / 1.8;
      c._chestPoint(0.175 * s, -0.01 * s, -0.255 * s, _grip);
      c._mouthPoint(0.012, -0.006, -0.058, _tgt);
      _tgt.lerp(_grip, 1 - k);
      _pole.set(1, -0.2, 0.4).applyQuaternion(c.root.getWorldQuaternion(_q2));
      c._reachGrip(c.arm.R, _tgt, _pole, Math.max(e, c._hold));
      c._curl(c.arm.R, GRIPS.cigarette, 1);
      c.head.rotation.x += 0.03 * k - 0.18 * up;
      c.neck.rotation.x += -0.12 * up;
      c._orientItem(0);
    }
  },

  toss: {
    duration: 2.2,
    events: [{ name: 'release', at: 0.42 }],
    perform(c, t, e) { throwWith(c, c.arm.R, 1, t, e); }
  },

  /* the same throw with the other arm, for when the right hand is full */
  tossLeft: {
    duration: 2.2,
    events: [{ name: 'release', at: 0.42 }],
    perform(c, t, e) { throwWith(c, c.arm.L, -1, t, e); c._holdPose(c._hold, 0); }
  }
};

function throwWith(c, arm, sgn, t, e) {
  const s = c.fig.height / 1.8;
  const wind = arc(t, 0.0, 0.22, 0.30, 0.40);
  const go = arc(t, 0.34, 0.46, 0.52, 0.86);
  // back and low, then out over the water
  c._chestPoint(sgn * (0.20 - 0.04 * go) * s, (-0.12 + 0.30 * go + 0.06 * wind) * s, (0.10 * wind - 0.62 * go) * s, _tgt);
  c._chestPoint(sgn * 0.17 * s, -0.12 * s, -0.12 * s, _grip);
  _tgt.lerp(_grip, 1 - Math.max(wind, go));
  _pole.set(sgn, -0.5, 0.6).applyQuaternion(c.root.getWorldQuaternion(_q2));
  c._reachGrip(arm, _tgt, _pole, e);
  c._curl(arm, GRIPS.open, Math.max(wind * 0.5, go));
  c.chest.rotation.x += 0.05 * wind - 0.08 * go;
  c.head.rotation.x += -0.08 * go;
}
