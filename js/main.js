/**
 * Stark Museo — assembly and the frame loop.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { HALL, OCULUS, POOL, CURTAIN, PLAYER, RENDER, PALETTE, CAMERA, WISHING, TREE } from './config.js';
import * as TEX from './textures.js';
import { buildSanctuary } from './architecture.js';
import { buildPool, buildWaterSurface, buildCurtain, buildMist, buildLightShaft } from './water.js';
import { buildIsland, buildTree, buildImportedTree } from './nature.js';
import { loadModel, modelTextures } from './models.js';
import { buildGallery, loadArtworkTextures } from './gallery.js';
import { Player } from './player.js';
import { Character } from './character.js';
import { CoinPool } from './coin.js';
import { WishingWell } from './wishes.js';
import { Tour, defaultStops } from './tour.js';
import { Ambience } from './audio.js';
import { UI } from './ui.js';
import { ARTWORKS, EXHIBITION } from './artworks.js';
import { DEFAULT_OUTFIT, WARDROBE } from './wardrobe.js';
import { PAYMENTS } from './payments.config.js';

/* ------------------------------------------------------------- quality -- */

const QUALITY = {
  high: {
    shellRings: 150, shellSegments: 352,
    floorReflection: true, reflectionSize: 1024,
    bloom: true, bloomStrength: 0.34,
    shadowMap: 4096, chamberShadows: true,
    mist: 1100, msaa: 4, maxPixelRatio: 2,
    artworkGlow: 0.05, shafts: 4, canopyLayers: 2
  },
  medium: {
    shellRings: 118, shellSegments: 280,
    floorReflection: true, reflectionSize: 512,
    bloom: true, bloomStrength: 0.30,
    shadowMap: 2048, chamberShadows: false,
    mist: 650, msaa: 0, maxPixelRatio: 1.5,
    artworkGlow: 0.07, shafts: 3, canopyLayers: 2
  },
  low: {
    shellRings: 86, shellSegments: 208,
    floorReflection: false, reflectionSize: 256,
    bloom: false, bloomStrength: 0,
    shadowMap: 1024, chamberShadows: false,
    mist: 260, msaa: 0, maxPixelRatio: 1,
    artworkGlow: 0.12, shafts: 2, canopyLayers: 1
  }
};

/* ----------------------------------------------------------------- app -- */

const app = {
  qualityName: matchMedia('(pointer: coarse)').matches ? 'medium' : 'high',
  mode: 'gate',                      // gate → wardrobe → visit
  treeModel: null,                   // models/blossom-tree.glb, once fetched
  outfit: Object.assign({}, DEFAULT_OUTFIT),
  textures: null,
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
renderer.toneMappingExposure = 1.14;
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
      new THREE.Vector2(size.w, size.h), quality.bloomStrength, 0.62, 1.00
    );
    composer.addPass(bloomPass);
  } else bloomPass = null;
  composer.addPass(new OutputPass());
  composer.setSize(size.w, size.h);
}

function getSize() { return { w: window.innerWidth, h: window.innerHeight }; }

function applySize() {
  const { w, h } = getSize();
  const quality = QUALITY[app.qualityName];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) composer.setSize(w, h);
  if (bloomPass) bloomPass.setSize(w, h);
}

/* ------------------------------------------------------------ textures -- */

const nextFrame = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(finish, 0));
  setTimeout(finish, 60);
});

async function makeTextures(ui) {
  const steps = [
    ['pouring the concrete', () => ({ concrete: TEX.concreteSurface({ size: 1024, seed: 7 }) })],
    ['polishing the floor', () => ({ floor: TEX.polishedFloor({ size: 1024, seed: 21 }) })],
    ['quarrying the stone', () => ({ rock: TEX.rockSurface({ size: 512, seed: 44 }) })],
    ['stilling the water', () => ({ waterNormal: TEX.waterNormal({ size: 512, seed: 91 }) })],
    ['growing the leaves', () => ({ leaf: TEX.leafCluster({ size: 256, seed: 3 }), moss: TEX.mossTexture({ size: 256, seed: 12 }) })],
    ['opening the sky', () => ({
      sky: TEX.skyDisc({ size: 512, seed: 5, foliage: true }),
      skyBright: TEX.skyDisc({ size: 512, seed: 9, foliage: false }),
      dot: TEX.softDot({ size: 128 })
    })]
  ];
  const out = {};
  for (let i = 0; i < steps.length; i++) {
    ui.progress(0.05 + (i / steps.length) * 0.50, steps[i][0]);
    await nextFrame();
    Object.assign(out, steps[i][1]());
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
  return keep;
}

function disposeWorld() {
  if (!app.world) return;
  const keep = sharedTextures();
  const seen = new Set();

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

  const pool = buildPool(app.textures);
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

  const island = buildIsland(app.textures, 88);
  root.add(island.group);

  const tree = app.treeModel
    ? buildImportedTree(app.treeModel, windUniforms, quality)
    : buildTree(app.textures, windUniforms, 2024);
  tree.group.position.y = 0.50;
  root.add(tree.group);
  animated.push(windUniforms);

  /* light — an overcast afternoon, not a hard sun. */
  const hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 3.05);
  root.add(hemi);

  const ambient = new THREE.AmbientLight(0xa9b0b2, 0.26);
  root.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff6e8, 2.6);
  sun.position.set(5.4, 30, -8.2);
  sun.target.position.set(-1.2, 0, 1.6);
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

  const gallery = buildGallery(ARTWORKS, app.artworkTextures, app.textures, sanctuary.chambers, quality);
  root.add(gallery.group);

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

  renderer.shadowMap.needsUpdate = true;
  cubeCam.update(renderer, scene);
  for (const o of hidden) o.visible = true;
  scene.remove(cubeCam);

  scene.environmentIntensity = 0.88;
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
  if (reflector) reflector.visible = false;
  if (character) character.root.visible = false;
  cubeCam.update(renderer, scene);
  if (reflector) reflector.visible = true;
  if (character) character.root.visible = true;
  scene.remove(cubeCam);

  const second = filter();
  scene.environment = second.texture;
  if (app.world) app.world.envTarget = second;

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
  if (atTheWater()) list.push({ key: 'F', label: 'toss a coin', kind: 'coin' });
  const verb = character && character.handVerb;
  if (verb && !character.busy) list.push({ key: 'G', label: verb });
  ui.setPrompts(list);
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
    amounts: PAYMENTS.amounts,
    format: (c) => well.format(c),
    demo: !well.live,
    note: ''
  });
}

async function takeCoin(cents) {
  ui.setCoinBusy(true);
  ui.setCoinStatus(well.live ? 'opening your wallet…' : 'pretending to open your wallet…');

  const result = await well.collect(cents);

  if (!result.ok) {
    ui.setCoinBusy(false);
    ui.setCoinStatus(
      result.reason === 'cancelled' ? 'No coin, then. Whenever you like.'
      : result.reason === 'no-wallet' ? window.__wishNoWallet
      : 'That did not go through. Nothing has been charged.',
      result.reason !== 'cancelled'
    );
    return;
  }

  app.pendingWish = { paymentId: result.paymentId, amount: cents, thrown: false };
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
    ambience.start();
    app.mode = 'wardrobe';
    app.running = true;
    ui.buildWardrobe(app.outfit);
    ui.showWardrobe();
    placeForWardrobe();
  },
  onWardrobeChange: (cat, id) => {
    app.outfit[cat] = id;
    if (character) {
      character.setOutfit(app.outfit);
      attachSmoke();
    }
  },
  onEnter: () => {
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
  onUse: () => useHeldItem(),
  onAction: () => {
    if (focused) openFocused();
    else if (atTheWater()) openCoinPanel();
  },
  onCoinPick: (cents) => takeCoin(cents),
  onCoinCancel: () => { player.enabled = true; },
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

window.__wishNoWallet = 'No Apple Pay or Google Pay here. Try it on your phone.';

player.onInteract = () => {
  if (tour && tour.active) { stopTour(); return; }
  openFocused();
};
player.onUse = () => useHeldItem();
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
  step(Math.min(0.05, (t - lastTime) / 1000));
  lastTime = t;
  if (composer) composer.render(0);
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
  app.artworkTextures = await loadArtworkTextures(ARTWORKS, (f) => {
    ui.progress(0.58 + f * 0.12, 'hanging the work');
  });

  ui.progress(0.70, 'pressing the clothes');
  await nextFrame();
  app.textures.brandGraphics = await loadBrandGraphics();

  if (TREE.model === 'blossom') {
    ui.progress(0.74, 'planting the tree');
    await nextFrame();
    try {
      app.treeModel = await loadModel(TREE.modelUrl, (f) => {
        ui.progress(0.74 + f * 0.06, 'planting the tree');
      });
    } catch (err) {
      // A missing or broken model is not worth failing the whole visit over;
      // nature.js can still grow one.
      console.warn('blossom tree unavailable, growing one instead:', err);
      app.treeModel = null;
    }
  }

  character = new Character(app.textures);
  character.setOutfit(app.outfit);
  character.onEvent = (name) => {
    if (name === 'release') spawnCoin();
    if (name === 'shutter') ambience.shutter();
    if (name === 'sip') ambience.sip();
    if (name === 'draw' || name === 'exhale') {
      if (character._smokeUniforms) {
        character.headPosition(_hand);
        character._smokeUniforms.uOrigin.value.copy(_hand).add(new THREE.Vector3(0, -0.02, 0));
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
