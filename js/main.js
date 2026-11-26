/**
 * Stark Museo — assembly and the frame loop.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { HALL, OCULUS, POOL, CURTAIN, PLAYER, RENDER, PALETTE, CAMERA, WISHING, TREE, SUN } from './config.js';
import * as TEX from './textures.js';
import { buildSanctuary, dappleTime } from './architecture.js';
import { buildPool, buildWaterSurface, buildCurtain, buildMist, buildLightShaft, causticTime } from './water.js';
import { buildIsland, buildTree, buildImportedTree } from './nature.js';
import { loadModel, modelTextures } from './models.js';
import { buildGallery, loadArtworkTextures } from './gallery.js';
import { buildStudio } from './studio.js';
import { BEAT } from './cyborg.js';
import { loadShopWorks, loadShopTextures } from './shop.js';
import { Player } from './player.js';
import { Character, prepareFigureScene } from './character.js';
import { CoinPool } from './coin.js';
import { WishingWell } from './wishes.js';
import { Tour, defaultStops } from './tour.js';
import { Ambience } from './audio.js';
import { UI } from './ui.js';
import { ARTWORKS, EXHIBITION } from './artworks.js';
import { DEFAULT_OUTFIT, WARDROBE, FIGURES, figureById } from './wardrobe.js';
import { PAYMENTS, WISHING_COPY, LETTER_COPY } from './payments.config.js';
import { Governor } from './governor.js';

/* ------------------------------------------------------------- quality -- */

const QUALITY = {
  high: {
    shellRings: 150, shellSegments: 352,
    floorReflection: true, reflectionSize: 1024,
    bloom: true, bloomStrength: 0.34,
    shadowMap: 4096, chamberShadows: true, roomAO: true,
    mist: 1100, msaa: 4, maxPixelRatio: 2,
    artworkGlow: 0.05, shafts: 4, canopyLayers: 2, canopyTranslucency: true, dapple: true, caustics: true
  },
  medium: {
    shellRings: 118, shellSegments: 280,
    floorReflection: true, reflectionSize: 512,
    bloom: true, bloomStrength: 0.30,
    shadowMap: 2048, chamberShadows: false, roomAO: true,
    mist: 650, msaa: 0, maxPixelRatio: 1.5,
    artworkGlow: 0.07, shafts: 3, canopyLayers: 2, canopyTranslucency: true, dapple: true, caustics: true
  },
  low: {
    shellRings: 86, shellSegments: 208,
    floorReflection: false, reflectionSize: 256,
    bloom: false, bloomStrength: 0,
    shadowMap: 1024, chamberShadows: false, roomAO: false,
    mist: 260, msaa: 0, maxPixelRatio: 1,
    artworkGlow: 0.12, shafts: 2, canopyLayers: 1, canopyTranslucency: false, dapple: false, caustics: false
  }
};

/* ----------------------------------------------------------------- app -- */

const app = {
  qualityName: matchMedia('(pointer: coarse)').matches ? 'medium' : 'high',
  mode: 'gate',                      // gate → wardrobe → visit
  scale: 1,                          // the governor's resolution multiplier
  treeModel: null,                   // models/blossom-tree.glb, once fetched
  fernModel: null,                   // models/fern.glb, once fetched
  outfit: Object.assign({}, DEFAULT_OUTFIT),
  textures: null,
  artworks: ARTWORKS,       // replaced by the Shopify collection when it can be read
  artworkTextures: null,
  world: null,
  animated: [],
  running: false,
  wasLocked: false,
  splashTime: -1,
  pendingWish: null,
  wardrobeAngle: 0.35,
  wardrobeSpin: true
};

const canvas = document.getElementById('scene');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, powerPreference: 'high-performance', stencil: false
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// the building and the sun never move, so the shadow map is drawn once
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0c);
scene.fog = new THREE.FogExp2(0xb0b4b3, 0.0080);

const camera = new THREE.PerspectiveCamera(
  RENDER.fov, window.innerWidth / window.innerHeight, RENDER.near, RENDER.far
);

let composer = null, bloomPass = null, renderPass = null;

const ambience = new Ambience();
const player = new Player(camera, canvas, { benchBands: [] });
const well = new WishingWell();
let character = null;
let coins = null;
let tour = null;

/* --------------------------------------------------------------- setup -- */

function setupComposer(quality) {
  if (composer) {
    for (const pass of composer.passes) if (pass.dispose) pass.dispose();
    composer.dispose();
  }
  const size = getSize();
  const target = new THREE.WebGLRenderTarget(size.w, size.h, {
    type: THREE.HalfFloatType, samples: quality.msaa
  });
  composer = new EffectComposer(renderer, target);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  if (quality.bloom) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.w * 0.5, size.h * 0.5), quality.bloomStrength, 0.62, 1.00
    );
    composer.addPass(bloomPass);
  } else bloomPass = null;
  composer.addPass(new OutputPass());
  composer.setSize(size.w, size.h);
  // composer.setSize hands every pass the full device resolution; bloom wants half
  if (bloomPass) bloomPass.setSize(Math.round(size.w * 0.5), Math.round(size.h * 0.5));
}

function getSize() { return { w: window.innerWidth, h: window.innerHeight }; }

function applySize() {
  const { w, h } = getSize();
  const quality = QUALITY[app.qualityName];
  const pr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * app.scale);
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(w, h); }
  // Bloom is a soft glow; it does not need the resolution the picture does. A
  // quarter of the pixels costs a quarter of the blur chain and looks the same.
  if (bloomPass) bloomPass.setSize(Math.round(w * 0.5), Math.round(h * 0.5));
}

/* ------------------------------------------------------------ textures -- */

const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(finish, 0));
  setTimeout(finish, 60);
});

/**
 * The plaster and the floor are photographs (Poly Haven, CC0 — see README), vendored under
 * textures/. If one will not load the room is built from the generated surfaces instead, so
 * a missing file costs some realism rather than the whole page. `photo` tells the materials
 * which they got, since the two are tuned to different averages.
 */
function loadPhotoSet(files) {
  const loader = new THREE.TextureLoader();
  const load = (name, srgb) => new Promise((resolve, reject) => {
    loader.load('./textures/' + name + '.webp', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      resolve(t);
    }, undefined, () => reject(new Error('textures/' + name + '.webp')));
  });
  return Promise.all(Object.entries(files).map(([slot, [name, srgb]]) => load(name, srgb).then((t) => [slot, t])))
    .then((pairs) => ({ ...Object.fromEntries(pairs), photo: true }));
}

async function makeTextures(ui) {
  const photo = (files, fallback, what) => async () => {
    try { return await loadPhotoSet(files); }
    catch (e) { console.warn('[Stark Museo] ' + what + ' photo missing (' + e.message + '); using the generated surface'); return fallback(); }
  };
  const steps = [
    ['pouring the concrete', async () => ({ concrete: await photo(
      { map: ['wall-diffuse', true], roughnessMap: ['wall-rough', false] },
      () => TEX.concreteSurface({ size: 1024, seed: 7 }), 'wall')() })],
    ['polishing the floor', async () => ({ floor: await photo(
      { map: ['floor-diffuse', true], roughnessMap: ['floor-rough', false], normalMap: ['floor-normal', false] },
      () => TEX.polishedFloor({ size: 1024, seed: 21 }), 'floor')() })],
    ['quarrying the stone', async () => ({ rock: await photo(
      { map: ['rock-diffuse', true], normalMap: ['rock-normal', false] },
      () => TEX.rockSurface({ size: 512, seed: 44 }), 'rock')() })],
    ['stilling the water', () => ({ waterNormal: TEX.waterNormal({ size: 512, seed: 91 }) })],
    ['growing the leaves', () => ({ leaf: TEX.leafCluster({ size: 256, seed: 3 }), moss: TEX.mossTexture({ size: 256, seed: 12 }) })],
    ['opening the sky', () => ({
      sky: TEX.skyDisc({ size: 512, seed: 5, foliage: true }),
      skyBright: TEX.skyDisc({ size: 512, seed: 9, foliage: false }),
      dot: TEX.softDot({ size: 128 }),
      sunCookie: TEX.sunCookie({ size: 256, seed: 61 })
    })]
  ];
  const out = {};
  for (let i = 0; i < steps.length; i++) {
    ui.progress(0.05 + (i / steps.length) * 0.50, steps[i][0]);
    await nextFrame();
    Object.assign(out, await steps[i][1]());
  }
  return out;
}

/** Chest prints for any top that names one. Missing files are skipped. */
function loadBrandGraphics(onDone) {
  const loader = new THREE.TextureLoader();
  const jobs = WARDROBE.tops.filter((t) => t.graphic);
  const out = {};
  if (!jobs.length) return Promise.resolve(out);
  return Promise.all(jobs.map((t) => new Promise((resolve) => {
    loader.load(t.graphic,
      (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; out[t.id] = tex; resolve(); },
      undefined,
      () => { console.warn('[Stark Museo] no chest graphic at "' + t.graphic + '"'); resolve(); });
  }))).then(() => out);
}

/* --------------------------------------------------------------- world -- */

const TEXTURE_SLOTS = [
  'map', 'roughnessMap', 'normalMap', 'emissiveMap', 'alphaMap', 'aoMap',
  'metalnessMap', 'bumpMap', 'displacementMap', 'lightMap', 'specularMap'
];

function sharedTextures() {
  const keep = new Set();
  const add = (t) => { if (t && t.isTexture) keep.add(t); };
  for (const v of Object.values(app.textures || {})) {
    if (!v) continue;
    if (v.isTexture) add(v);
    else for (const t of Object.values(v)) add(t);
  }
  for (const a of app.artworkTextures || []) add(a && a.tex);
  if (app.treeModel) modelTextures(app.treeModel.scene, keep);
  if (app.fernModel) modelTextures(app.fernModel.scene, keep);
  return keep;
}

function disposeWorld() {
  if (!app.world) return;
  const keep = sharedTextures();
  const seen = new Set();

  // she goes first: her geometry is cached for the next build and must not be disposed with the room
  for (const studio of app.world.studios || []) studio.dispose();

  app.world.root.traverse((o) => {
    if (o.isReflector && o.dispose) o.dispose();
    if (o.isLight && o.shadow && o.shadow.dispose) o.shadow.dispose();
    // Imported models are cached and reused across quality rebuilds; their
    // geometry and materials belong to models.js, not to this world.
    if (o.userData.shared) return;
    if (o.geometry) o.geometry.dispose();
    if (!o.material) return;
    for (const mat of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      for (const slot of TEXTURE_SLOTS) {
        const t = mat[slot];
        if (t && t.isTexture && !keep.has(t)) t.dispose();
      }
      if (mat.uniforms) {
        for (const u of Object.values(mat.uniforms)) {
          if (u && u.value && u.value.isTexture && !keep.has(u.value)) u.value.dispose();
        }
      }
      mat.dispose();
    }
  });

  if (app.world.tree && app.world.tree.imported && app.treeModel) {
    for (const child of app.world.tree.group.children.slice()) {
      app.treeModel.scene.add(child);
    }
  }

  scene.remove(app.world.root);
  if (app.world.envTarget) app.world.envTarget.dispose();
  scene.environment = null;
  app.world = null;
  app.animated = [];
}

function buildWorld(quality) {
  const root = new THREE.Group();
  root.name = 'world';
  const animated = [];
  const windUniforms = { uTime: { value: 0 } };

  const sanctuary = buildSanctuary(app.textures, quality);
  sanctuary.materials.skyMat.color.setScalar(1.28);
  root.add(sanctuary.group);

  const shell = sanctuary.group.getObjectByName('shell');
  if (shell) shell.castShadow = true;

  const rimY = sanctuary.oculusRimY;

  const pool = buildPool(app.textures, quality);
  root.add(pool.group);

  const water = buildWaterSurface(app.textures, rimY);
  root.add(water.mesh);
  animated.push(water.uniforms);

  const curtain = buildCurtain(POOL.waterLevel + 0.02, rimY - 0.12);
  root.add(curtain.group);
  for (const u of curtain.uniformSets) animated.push(u);

  const mist = buildMist(app.textures, POOL.waterLevel, quality.mist);
  root.add(mist.points);
  animated.push(mist.uniforms);

  const island = buildIsland(app.textures, 88, app.fernModel);
  root.add(island.group);

  const tree = app.treeModel
    ? buildImportedTree(app.treeModel, windUniforms, quality)
    : buildTree(app.textures, windUniforms, 2024);
  tree.group.position.y = 0.50;
  root.add(tree.group);
  animated.push(windUniforms);
  animated.push({ uTime: dappleTime }, { uTime: causticTime });

  /* light — an overcast afternoon, not a hard sun. The fill is lower than it was: with the photographic
   * surfaces in, a bright fill flattened them, and the pools of sun read as a stain rather than light. */
  const hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 2.45);
  root.add(hemi);

  const ambient = new THREE.AmbientLight(0xa9b0b2, 0.26);
  root.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff6e8, 2.6);
  sun.position.set(...SUN.position);
  sun.target.position.set(...SUN.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
  sun.shadow.camera.left = -17;
  sun.shadow.camera.right = 17;
  sun.shadow.camera.top = 17;
  sun.shadow.camera.bottom = -17;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 62;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.045;
  // PCF takes five taps whatever the radius, so widening it is free; what it buys is the soft edge a
  // pool of light has when it has fallen 25 m through an opening
  sun.shadow.radius = 22;
  root.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xdce8f2, 0.42);
  fill.position.set(-14, 12, 9);
  fill.target.position.set(0, 1, 0);
  root.add(fill, fill.target);

  const shafts = sanctuary.skylightLights.slice()
    .sort((a, b) => b.spec.a - a.spec.a).slice(0, quality.shafts);
  for (const sl of shafts) {
    const drop = (sl.aim.y < -0.05 ? Math.min(30, sl.centre.y / -sl.aim.y) : 16) * 0.78;
    const shaft = buildLightShaft(sl.centre, sl.aim, drop, sl.spec.a * 0.85, sl.spec.a * 1.9, 0.042);
    root.add(shaft.mesh);
    animated.push(shaft.uniforms);
  }

  const gallery = buildGallery(app.artworks, app.artworkTextures, app.textures, sanctuary.chambers, quality);
  root.add(gallery.group);

  const studios = [];
  for (const chamber of sanctuary.chambers) {
    if (!chamber.spec.desk) continue;
    const studio = buildStudio(chamber, app.textures, quality);
    root.add(studio.group);
    animated.push(...studio.animated);
    studios.push(studio);
  }

  scene.add(root);
  player.world = { benchBands: sanctuary.benchBands };

  app.world = {
    root, sanctuary, pool, water, curtain, mist, island, tree, gallery,
    interactables: gallery.interactables,
    reflector: sanctuary.reflector,
    rimY
  };
  app.animated = animated;

  captureEnvironment(quality);
  // after the hall's own capture, so the warm room is seen lit as visitors will see it
  for (const studio of studios) studio.capture(renderer, scene);
  app.world.studios = studios;
  for (const studio of studios) {
    studio.arrive().catch((err) => console.warn('[Stark Museo] the DJ could not be loaded:', err.message));
  }
  renderer.shadowMap.needsUpdate = true;

  tour = new Tour(player, defaultStops(gallery.interactables, rimY));
  tour.onEnd = () => ui.setSubtitle(EXHIBITION.credit || '');
}

function captureEnvironment(quality) {
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.2, 120, rt);
  cubeCam.position.set(0, 2.6, 0);
  scene.add(cubeCam);

  const reflector = app.world && app.world.reflector;
  const hidden = [];
  if (reflector) { reflector.visible = false; hidden.push(reflector); }
  // the figure would otherwise be baked into every reflective surface
  if (character) { character.root.visible = false; hidden.push(character.root); }
  // The canopy is a pink mass in the middle of the probe's view, and a probe has no idea how far
  // away it is: left in, it tints every surface in the hall pink as if the tree stood against it.
  // The floor still reflects the tree where it should — that comes from the planar reflection.
  const canopy = app.world && app.world.tree && app.world.tree.group;
  if (canopy) { canopy.visible = false; hidden.push(canopy); }

  renderer.shadowMap.needsUpdate = true;
  cubeCam.update(renderer, scene);
  for (const o of hidden) o.visible = true;
  scene.remove(cubeCam);

  scene.environmentIntensity = 0.74;
  const filter = () => {
    const g = new THREE.PMREMGenerator(renderer);
    g.compileCubemapShader();
    const target = g.fromCubemap(rt.texture);
    g.dispose();
    return target;
  };

  const first = filter();
  scene.environment = first.texture;

  scene.add(cubeCam);
  for (const o of hidden) o.visible = false;
  cubeCam.update(renderer, scene);
  for (const o of hidden) o.visible = true;
  scene.remove(cubeCam);

  const second = filter();
  scene.environment = second.texture;
  if (app.world) app.world.envTarget = second;

  // the probe rendered without the canopy, and the shadow map is frozen: draw it once more with it
  renderer.shadowMap.needsUpdate = true;

  first.dispose();
  rt.dispose();
}

/* ---------------------------------------------------------- interaction -- */

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _hand = new THREE.Vector3();
let focused = null;

/** Standing on the pool's edge, facing the water. */
function atTheWater() {
  const r = Math.hypot(player.position.x, player.position.z);
  const edge = POOL.radius + POOL.lipWidth;
  if (r < edge - 0.2 || r > edge + WISHING.reach) return false;
  // facing roughly inward
  const inward = -player.position.x * -Math.sin(player.facing) -
                 player.position.z * -Math.cos(player.facing);
  return inward / Math.max(0.001, r) > 0.25;
}

function updatePrompts() {
  if (app.mode !== 'visit' || ui.anyPanelOpen || (tour && tour.active)) {
    if (focused) focused = null;
    ui.setPrompts([]);
    return;
  }

  /* the nearest work the camera is pointed at */
  camera.getWorldDirection(_fwd);
  player.eyePosition(_eye);
  let best = null, bestScore = 0.80;
  for (const it of app.world.interactables) {
    const d = it.centre.distanceTo(_eye);
    if (d > 5.6) continue;
    _to.copy(it.centre).sub(_eye).normalize();
    const facing = _fwd.dot(_to);
    if (facing < 0.82) continue;
    if (it.normal.dot(_to) > -0.30) continue;
    const score = facing - d * 0.012;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  focused = best;

  const list = [];
  if (best) list.push({ key: 'E', label: 'look closely' });
  else if (nearHer()) list.push({ key: 'E', label: ambience.beating ? 'quiet her heart' : 'hear her heart' });
  if (atTheWater()) list.push({ key: 'F', label: 'toss a coin', kind: 'coin' });
  const verb = character && character.handVerb;
  // at her desk the second button writes a letter; elsewhere it is whatever is in the hand
  if (nearHer()) list.push({ key: 'G', label: 'write to the artist', short: 'write' });
  else if (verb && !character.busy) list.push({ key: 'G', label: verb });
  ui.setPrompts(list);
}

/** Standing in front of her desk: close enough to hear a heart. */
function nearHer() {
  const studio = app.world && app.world.studios && app.world.studios[0];
  if (!studio || !studio.dj) return false;
  return Math.hypot(player.position.x - studio.heartAt.x, player.position.z - studio.heartAt.z) < 4.2;
}

function toggleHeart() {
  if (!nearHer() || ui.anyPanelOpen) return;
  ambience.heartbeat(!ambience.beating, app.world.studios[0].heartAt, elapsed % BEAT);
}

/** G, or the second round button: a letter at her desk, otherwise what the visitor is holding. */
function useOrWrite() {
  if (nearHer()) openLetterPanel();
  else useHeldItem();
}

function openLetterPanel() {
  if (app.mode !== 'visit' || ui.anyPanelOpen || !nearHer() || (tour && tour.active)) return;
  player.enabled = false;
  ui.openLetter(well.posting ? '' : LETTER_COPY.preview);
  well.openLetter(ui.el.letterGuard);
}

let lettersSent = 0;

async function sendLetter(text) {
  ui.setLetterBusy(true);
  ui.setLetterStatus(LETTER_COPY.sending);
  const res = await well.sendLetter(text);
  ui.setLetterBusy(false);
  if (!res.ok) { ui.setLetterStatus(LETTER_COPY.failed, true); return; }
  ui.clearLetter();
  ui.setLetterStatus(res.preview ? LETTER_COPY.previewSent : LETTER_COPY.sent);
  const mine = ++lettersSent;
  setTimeout(() => { if (mine === lettersSent) ui.closeLetter(); }, 2200);
}

function openFocused() {
  if (!focused || ui.anyPanelOpen) return;
  const it = focused;
  ui.setPrompts([]);
  player.flyTo(it.focus, it.centre, 1.1);
  ui.openViewer(it.art, app.artworkTextures[it.index].tex);
}

function useHeldItem() {
  if (app.mode !== 'visit' || ui.anyPanelOpen || !character) return;
  const verb = character.handVerb;
  if (!verb) return;
  character.play(verb);
}

/* -------------------------------------------------------- the coin toss -- */

function openCoinPanel() {
  if (app.mode !== 'visit' || ui.anyPanelOpen || !atTheWater()) return;
  player.enabled = false;
  ui.openCoin({
    amount: well.amount,
    format: (c) => well.format(c),
    wallet: well.live,
    notice: !well.live ? WISHING_COPY.demoNotice : well.testing ? WISHING_COPY.testNotice : '',
    note: well.live ? WISHING_COPY.loading : ''
  });
  if (!well.live) return;

  well.openWallet(ui.el.coinWallet, ui.el.coinGuard, {
    ready: () => ui.setCoinStatus(''),
    checking: () => ui.setCoinStatus(WISHING_COPY.checking),
    unavailable: (text) => ui.setCoinStatus(text, true),
    busy: () => { ui.setCoinBusy(true); ui.setCoinStatus(WISHING_COPY.paying); },
    paid: (paymentId) => throwCoin(paymentId, well.amount),
    stopped: (text, bad) => { ui.setCoinBusy(false); ui.setCoinStatus(text, bad); }
  });
}

/** The demo coin; the real one is paid for through the wallet button above. */
async function takeCoin(cents) {
  ui.setCoinBusy(true);
  ui.setCoinStatus('pretending to open your wallet…');
  const result = await well.collect();
  throwCoin(result.paymentId, cents);
}

function throwCoin(paymentId, cents) {
  app.pendingWish = { paymentId, amount: cents, thrown: false };
  ui.closeCoin();
  player.enabled = true;

  if (character) {
    // a coin that has been paid for takes priority over whatever the figure
    // was in the middle of doing
    character.action = null;
    if (!character.play(character.tossAction)) spawnCoin();
  } else {
    spawnCoin();
  }

  // and if the throw never reaches its release for any reason, the coin still
  // goes in — nobody pays and gets nothing
  setTimeout(() => {
    if (app.pendingWish && !app.pendingWish.thrown) spawnCoin();
  }, 2600);
}

function spawnCoin() {
  if (!coins) return;
  if (app.pendingWish) app.pendingWish.thrown = true;
  const side = character && character.tossAction === 'tossLeft' ? 'L' : 'R';
  const from = character ? character.handPosition(_hand, side)
                         : _hand.set(player.position.x, 1.3, player.position.z);
  coins.toss(from, coins.aimFrom(player.position, player.facing));
}

function onCoinSplash(pos) {
  if (app.world) {
    const u = app.world.water.uniforms;
    u.uSplashPos.value.set(pos.x, pos.z);
    u.uSplashAge.value = 0;
    app.splashTime = elapsed;
  }
  ambience.splash();
  if (app.pendingWish) setTimeout(() => { if (app.pendingWish) ui.openWish(); }, 520);
}

async function sendWish(text) {
  const pending = app.pendingWish;
  app.pendingWish = null;
  player.enabled = true;
  if (!pending) return;
  const res = await well.submitWish(pending.paymentId, text);
  ui.setSubtitle(res.ok ? 'your wish is in the water' : 'the wish could not be saved');
  ambience.chime();
  setTimeout(() => ui.setSubtitle(EXHIBITION.credit || ''), 6000);
}

/* ------------------------------------------------------------------ ui -- */

const ui = new UI({
  onGetReady: () => {
    warmFigures();
    ambience.start();
    app.mode = 'wardrobe';
    app.running = true;
    ui.buildWardrobe(app.outfit);
    ui.showWardrobe();
    placeForWardrobe();
  },
  onWardrobeChange: (cat, id) => {
    app.outfit[cat] = id;
    if (cat === 'body') {
      // the outfits on offer belong to the figure, so offer the new figure's
      app.outfit.outfit = figureById(id).outfits[0].id;
      ui.buildWardrobe(app.outfit);
    }
    if (character) {
      const done = character.setOutfit(app.outfit);
      // a 3D figure loads asynchronously the first time it is chosen
      if (done && done.then) done.then(attachSmoke); else attachSmoke();
    }
  },
  onEnter: () => {
    if (PAYMENTS.preloadWallet) well.prepareWallet(ui.el.coinWallet, ui.el.coinGuard);
    app.mode = 'visit';
    player.enabled = true;
    player.position.set(0, 0, 11.4);
    player.facing = 0;
    player.camYaw = 0;
    player.camPitch = CAMERA.pitch;
    player.updateCamera(0.016);
    player.requestLock();
  },
  onWatch: () => {
    ambience.start();
    app.mode = 'visit';
    app.running = true;
    player.enabled = true;
    if (character) character.setOutfit(app.outfit);
    startTour();
  },
  onUse: () => useOrWrite(),
  onLetterSend: (text) => sendLetter(text),
  onLetterClosed: () => { lettersSent++; well.closeLetter(); player.enabled = true; player.requestLock(); },
  onAction: () => {
    if (focused) openFocused();
    else if (atTheWater()) openCoinPanel();
    else toggleHeart();
  },
  onCoinPick: (cents) => takeCoin(cents),
  onCoinCancel: () => { player.enabled = true; },
  onCoinClosed: () => well.closeWallet(),
  onWishSend: (text) => sendWish(text),
  onWishSkip: () => { app.pendingWish = null; player.enabled = true; },
  onPanelOpen: () => { player.releaseLock(); },
  onViewerOpen: () => { player.releaseLock(); },
  onViewerClose: () => { if (!ui.anyPanelOpen) player.requestLock(); },
  onMenuOpen: () => { player.enabled = false; ambience.suspend(); },
  onMenuClose: () => { player.enabled = true; ambience.resume(); player.requestLock(); },
  onTour: () => { startTour(); player.requestLock(); },
  onReset: () => {
    stopTour();
    player.position.set(0, 0, 11.4);
    player.velocity.set(0, 0, 0);
    player.facing = 0;
    player.camYaw = 0;
    player.camPitch = CAMERA.pitch;
  },
  onVolume: (v) => ambience.setVolume(v),
  onSensitivity: (v) => { player.sensitivity = v; },
  onInvert: (v) => { player.invertY = v; },
  onFov: (v) => { camera.fov = v; camera.updateProjectionMatrix(); },
  onQuality: (name) => changeQuality(name)
});


player.onInteract = () => {
  if (tour && tour.active) { stopTour(); return; }
  if (focused) openFocused();
  else toggleHeart();
};
player.onUse = () => useOrWrite();
player.onSecondary = () => openCoinPanel();

/* --------------------------------------------------------- the wardrobe -- */

function placeForWardrobe() {
  player.position.set(0, 0, 10.6);
  player.facing = Math.PI;                     // turn to face the visitor
  player.enabled = false;
  app.wardrobeAngle = 0.35;
  app.wardrobeSpin = true;
}

/** Slow turntable, or wherever the visitor has dragged it to. */
function updateWardrobeCamera(dt) {
  if (app.wardrobeSpin) app.wardrobeAngle += dt * 0.16;
  const a = app.wardrobeAngle;
  const d = 2.55, h = 1.16;
  camera.position.set(
    player.position.x + Math.sin(a) * d,
    h,
    player.position.z + Math.cos(a) * d
  );
  camera.lookAt(player.position.x, 0.98, player.position.z);
  if (character) character.root.rotation.y = player.facing;
}

/* -------------------------------------------------------------- guided -- */

function startTour() {
  if (!tour) return;
  tour.start(true);
  ui.setPrompts([]);
  ui.setSubtitle('guided walk — press any key to take over');
}

function stopTour() {
  if (!tour || !tour.active) return;
  tour.stop();
  ui.setSubtitle(EXHIBITION.credit || '');
}

async function changeQuality(name) {
  if (!QUALITY[name] || name === app.qualityName) return;
  app.qualityName = name;
  ui.busy(true, 'rebuilding the room');
  await nextFrame();
  disposeWorld();
  const quality = QUALITY[name];
  applySize();
  setupComposer(quality);
  buildWorld(quality);
  throttleReflector();
  if (governor) governor.reset();          // an explicit choice is the new ceiling
  ui.busy(false);
}

/* --------------------------------------------------------------- events -- */

window.addEventListener('resize', applySize);
window.addEventListener('orientationchange', () => setTimeout(applySize, 250));

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  ui.setLocked(locked);
  if (!locked && app.wasLocked && !ui.anyPanelOpen && app.mode === 'visit') ui.openMenu();
  app.wasLocked = locked;
});

canvas.addEventListener('click', () => {
  if (ui.anyPanelOpen) return;
  if (app.mode !== 'visit') return;
  if (player.dragTravel > 6) { player.dragTravel = 0; return; }
  if (focused) { openFocused(); return; }
  if (tour && tour.active) { stopTour(); return; }
  if (document.pointerLockElement !== canvas) player.requestLock();
});

/* dragging on the wardrobe screen turns the figure on its turntable */
let wardrobeDrag = null;
const dragStart = (x) => { if (app.mode === 'wardrobe') { wardrobeDrag = x; app.wardrobeSpin = false; } };
const dragMove = (x) => {
  if (wardrobeDrag === null) return;
  app.wardrobeAngle -= (x - wardrobeDrag) * 0.008;
  wardrobeDrag = x;
};
const dragEnd = () => { wardrobeDrag = null; };

canvas.addEventListener('mousedown', (e) => dragStart(e.clientX));
window.addEventListener('mousemove', (e) => dragMove(e.clientX));
window.addEventListener('mouseup', dragEnd);
canvas.addEventListener('touchstart', (e) => dragStart(e.touches[0].clientX), { passive: true });
canvas.addEventListener('touchmove', (e) => dragMove(e.touches[0].clientX), { passive: true });
canvas.addEventListener('touchend', dragEnd);

window.addEventListener('keydown', (e) => {
  if (app.mode !== 'visit' || ui.anyPanelOpen) return;
  if (e.code === 'KeyT') { if (tour && tour.active) stopTour(); else startTour(); }
  if (tour && tour.active &&
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    stopTour();
  }
});

document.addEventListener('mousemove', (e) => {
  if (tour && tour.active && document.pointerLockElement === canvas &&
      (Math.abs(e.movementX) > 6 || Math.abs(e.movementY) > 6)) stopTour();
});

canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  app.running = false;
  ui.busy(true, 'the room lost its light — reload to return');
});

/* ----------------------------------------------------------------- loop -- */

let elapsed = 0;
let lastTime = 0;
const _face = new THREE.Vector3();

function attachSmoke() {
  if (character && character.smoke && !character.smoke.parent) scene.add(character.smoke);
}

function step(dt) {
  elapsed += dt;
  if (!app.running) return;

  if (app.mode === 'wardrobe') {
    if (character) {
      character.root.position.set(player.position.x, 0, player.position.z);
      character.update(dt, { speed: 0, maxSpeed: PLAYER.walkSpeed, time: elapsed });
    }
    updateWardrobeCamera(dt);
  } else {
    if (tour && tour.active) tour.update(dt);
    else if (player.enabled) player.update(dt);
    else player.updateCamera(dt);

    if (character) {
      character.root.position.set(player.position.x, 0, player.position.z);
      character.root.rotation.y = player.facing;
      character.update(dt, {
        speed: player.speed, maxSpeed: PLAYER.fastSpeed, time: elapsed
      });
    }
    updatePrompts();
  }

  if (coins) coins.update(dt);

  for (const u of app.animated) if (u.uTime) u.uTime.value = elapsed;
  // she only moves while someone could see it
  for (const studio of (app.world && app.world.studios) || []) {
    if (camera.position.distanceTo(studio.heartAt) < 17) {
      studio.update(elapsed, app.mode === 'visit' ? player.eyePosition(_face) : null);
    }
  }

  if (app.splashTime >= 0 && app.world) {
    const u = app.world.water.uniforms;
    const age = elapsed - app.splashTime;
    u.uSplashAge.value = age;
    if (age > 7) { u.uSplashAge.value = -1; app.splashTime = -1; }
  }

  ambience.update(camera);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!lastTime) lastTime = now || performance.now();
  const t = now || performance.now();
  if (governor) governor.frame(t);
  step(Math.min(0.05, (t - lastTime) / 1000));
  lastTime = t;
  if (composer) composer.render(0);
}

/**
 * The visitor. The 3D figure is a few megabytes; if it cannot be fetched the
 * sanctuary should still open, so the older procedural figure takes over.
 */
async function makeCharacter() {
  try {
    const c = new Character();
    await c.setOutfit(app.outfit);
    return c;
  } catch (err) {
    console.warn('3D figure unavailable, using the procedural one instead:', err);
    const { Character: Procedural } = await import('./character.procedural.js');
    const c = new Procedural(app.textures);
    c.setOutfit(app.outfit);
    return c;
  }
}

/**
 * Warm the figures while the visitor is choosing one.
 *
 * The first time a figure or outfit is drawn its textures are uploaded to the GPU,
 * which measured 225-255 ms in one frame: a stall in the wardrobe at exactly the
 * moment someone taps. So the moment they reach the wardrobe, fetch the figures
 * they might pick and upload every texture, one a frame, in the background. Done
 * only where memory is not tight, because the textures of outfits that are never
 * picked are uploaded too.
 */
let warmed = false;
async function warmFigures() {
  if (warmed) return;
  warmed = true;
  const tight = matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory < 4);
  if (tight) return;
  const pause = () => new Promise((r) => setTimeout(r, 60));
  try {
    for (const def of FIGURES) {
      const gltf = await loadModel(def.model);
      prepareFigureScene(gltf.scene);
      const seen = new Set();
      gltf.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
          for (const slot of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[slot]) seen.add(m[slot]);
        }
      });
      for (const t of seen) { renderer.initTexture(t); await pause(); }

      // The outfits that are not showing have shaders nobody has asked for yet (a suit
      // without a normal map is a different program from one with), so compile every
      // outfit with all of them visible, against the room's real lights.
      const outfits = [];
      gltf.scene.traverse((o) => { if (/^outfit_/.test(o.name) && !o.isMesh) outfits.push([o, o.visible]); });
      for (const [o] of outfits) o.visible = true;
      try { await compileForComposer(gltf.scene, scene); } finally { for (const [o, v] of outfits) o.visible = v; }
    }
  } catch (err) {
    console.warn('could not warm the figures:', err);   // the first look will simply cost a frame
  }
}

/**
 * Compile shaders the way they will actually be used.
 *
 * The game draws into the composer's offscreen target, where three.js uses linear
 * output and no tone mapping; compiling against the canvas (ACES, sRGB) builds
 * programs with different keys, which are never drawn with, so the first real
 * frame pays for its own. That showed as 100-300 ms hitches. The target has to be
 * the composer's when compile() starts, which is when program keys are decided.
 */
async function compileForComposer(object, targetScene) {
  const rt = composer ? composer.readBuffer : null;
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  try {
    await renderer.compileAsync(object, camera, targetScene);
  } finally {
    renderer.setRenderTarget(previous);
  }
}

/* ------------------------------------------------------------- governor -- */

let governor = null;
const reflection = { every: 1 };           // 1: every frame, 2: every other frame

/** Every other frame is enough for a floor reflection; it lags by one frame, which cannot be seen. */
function throttleReflector() {
  const r = app.world && app.world.reflector;
  if (!r || r.userData.throttled) return;
  const original = r.onBeforeRender;
  let n = 0;
  r.onBeforeRender = function (...args) {
    if (reflection.every === 2 && (n++ & 1)) return;
    return original.apply(this, args);
  };
  r.userData.throttled = true;
}

function startGovernor() {
  governor = new Governor({
    setScale(f) { if (app.scale !== f) { app.scale = f; applySize(); } },
    setBloom(on) { if (bloomPass) bloomPass.enabled = on; },
    setReflection(mode) {
      reflection.every = mode || 1;
      const r = app.world && app.world.reflector;
      if (r) r.visible = mode !== 0;
    },
    setCanopy(layers) {
      const t = app.world && app.world.tree;
      const second = t && t.imported && t.group.getObjectByName('BlossomB');
      if (second) second.visible = layers > 1;
    }
  }, { start: app.qualityName === 'high' ? 0 : 2 });
  governor.reapply();
  window.museoGovernor = governor;
}

/* ----------------------------------------------------------------- boot -- */

async function boot() {
  ui.setExhibition(EXHIBITION);
  ui.setQualityValue(app.qualityName);
  applySize();

  ui.progress(0.03, 'preparing the room');
  await nextFrame();

  app.textures = await makeTextures(ui);

  ui.progress(0.58, 'hanging the work');
  await nextFrame();
  const forSale = await loadShopWorks();
  const hanging = (f) => ui.progress(0.58 + f * 0.12, 'hanging the work');
  app.artworks = forSale || ARTWORKS;
  app.artworkTextures = forSale
    ? await loadShopTextures(forSale, hanging)
    : await loadArtworkTextures(ARTWORKS, hanging);

  ui.progress(0.70, 'pressing the clothes');
  await nextFrame();
  app.textures.brandGraphics = await loadBrandGraphics();

  if (TREE.model === 'blossom') {
    ui.progress(0.74, 'planting the tree');
    // the only step that is ever a real wait, so it is the only one that
    // gets to explain itself
    ui.beginWait('the blossom tree', 'the room will open without it');
    await nextFrame();
    try {
      app.treeModel = await loadModel(TREE.modelUrl, (f, loaded, total) => {
        if (f !== null) ui.progress(0.74 + f * 0.06, 'planting the tree');
        ui.waitBytes(loaded, total);
      });
    } catch (err) {
      // A missing or broken model is not worth failing the whole visit over;
      // nature.js can still grow one.
      console.warn('blossom tree unavailable, growing one instead:', err);
      app.treeModel = null;
    }
    ui.endWait();
  }

  // the ferns on the island: nice to have, never worth failing the visit over
  try { app.fernModel = await loadModel('./models/fern.glb'); }
  catch (err) { console.warn('[Stark Museo] ferns unavailable, the island keeps its ground cover only:', err); app.fernModel = null; }

  character = await makeCharacter();
  character.onEvent = (name) => {
    if (name === 'release') spawnCoin();
    if (name === 'shutter') ambience.shutter();
    if (name === 'sip') ambience.sip();
    if (name === 'draw' || name === 'exhale') {
      if (character._smokeUniforms) {
        (character.mouthPosition || character.headPosition).call(character, _hand);
        character._smokeUniforms.uOrigin.value.copy(_hand).add(new THREE.Vector3(0, 0.02, 0));
        character._smokeUniforms.uBirth.value = elapsed;
      }
    }
  };
  scene.add(character.root);
  attachSmoke();

  coins = new CoinPool();
  coins.onSplash = onCoinSplash;
  coins.seed(16);
  scene.add(coins.group);

  ui.progress(0.82, 'raising the walls');
  await nextFrame();

  const quality = QUALITY[app.qualityName];
  setupComposer(quality);
  buildWorld(quality);

  throttleReflector();
  startGovernor();

  // Compile every shader now, while the loading screen is up, so the first look
  // into a side chamber is not a half-second hitch.
  ui.progress(0.96, 'warming the light');
  try { await compileForComposer(scene); } catch { /* an old browser: it will compile lazily */ }

  ui.progress(1, 'the room is ready');
  player.position.set(0, 0, 11.4);
  player.updateCamera(0.016);
  composer.render(0);
  await nextFrame();

  ui.finishLoading();
  ui.showGate();
  frame();
}

boot().catch((err) => {
  console.error(err);
  ui.endWait();
  ui.progress(1, 'something went wrong — see the browser console');
});

// A handle for tinkering from the browser console.
window.museo = { THREE, app, scene, camera, renderer, player, ui, ambience, well,
                 get character() { return character; },
                 get coins() { return coins; },
                 get composer() { return composer; },
                 get tour() { return tour; },
                 step,
                 render: () => composer && composer.render(0) };
