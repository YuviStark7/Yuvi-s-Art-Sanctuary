/**
 * The DJ's desk: a sweeping slab of brushed metal held up by two outcrops of warm stone, the
 * decks and mixer on top, and four holograms standing behind where she plays.
 *
 * Everything is built here from numbers; nothing is downloaded. Positions are given as
 * (side, height, forward) through the chamber's `at`, as in studio.js. Negative `side` is the
 * visitor's left.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTriplanar } from './architecture.js';
import { tame } from './cyborg.js';

const WARM = new THREE.Color(1.0, 0.64, 0.32);
const HALF = 2.35;                       // half the length of the desk
export const TOP = 1.08;                 // height of the playing surface

/* ------------------------------------------------------------ materials -- */

/** Fine streaks along the length, which is what makes metal read as brushed. */
function brushed() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgb(150,150,150)';
  ctx.fillRect(0, 0, 512, 256);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.floor(rnd() * 130);
    ctx.fillStyle = `rgba(${v},${v},${v},0.18)`;
    ctx.fillRect(rnd() * 512 - 60, rnd() * 256, 60 + rnd() * 220, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* ----------------------------------------------------------- the slab -- */

// u runs 0..1 from the visitor's left end to the right end
const sideAt = (u) => -HALF + u * HALF * 2;
const topAt = (u) => TOP + 0.035 * Math.sin(Math.PI * u);
const frontAt = (u, desk) => desk - 0.42 - 0.25 * Math.sin(Math.PI * u);
// deep as a hull on the left, sweeping up to a blade on the right
const keelAt = (u) => 0.54 + 0.46 * Math.pow(u, 1.7);

/** Lofts the desk's cross-section along its length. Each face has its own vertices: crisp edges. */
function slabGeometry(at, desk) {
  const N = 72, K = 8;
  // each face of the cross-section is a run of [height, forward] points
  const section = (u) => {
    const top = topAt(u), front = frontAt(u, desk), back = desk + 0.40;
    const keel = [Math.min(keelAt(u), top - 0.07), front + 0.24];
    const belly = [keel[0] + (top - keel[0]) * 0.35, front - 0.09];
    const curve = [];
    for (let k = 0; k <= K; k++) {
      const t = k / K, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      curve.push([a * keel[0] + b * belly[0] + c * top, a * keel[1] + b * belly[1] + c * front]);
    }
    return [
      [[top, front], [top, back]],                       // the playing surface
      [[top, back], [top - 0.09, back - 0.04]],          // back edge
      [[top - 0.09, back - 0.04], keel],                 // underside
      curve                                              // the bellied front, keel to lip
    ];
  };
  const pos = [], uv = [], index = [];
  const push = (u, p, v) => {
    const q = at(sideAt(u), p[0], p[1]);
    pos.push(q.x, q.y, q.z);
    uv.push(u * 5, v);
  };
  for (let face = 0; face < 4; face++) {
    const start = pos.length / 3;
    const n = section(0)[face].length;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      section(u)[face].forEach((p, k) => push(u, p, k / (n - 1)));
    }
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < n - 1; k++) {
        const a = start + i * n + k, b = a + n;
        index.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
  }
  for (const u of [0, 1]) {                                  // the two ends
    const start = pos.length / 3;
    const ring = section(u).flatMap((face) => face.slice(0, -1));
    ring.forEach((p, k) => push(u, p, k / ring.length));
    for (let k = 1; k < ring.length - 1; k++) index.push(start, start + k, start + k + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------- stone -- */

/** A faceted outcrop: an icosahedron pushed about, flat on its base. */
function boulder(sx, sy, sz, seed) {
  const geo = new THREE.IcosahedronGeometry(1, 4);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const hash = (a, b, c) => {
    const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7 + seed * 53.3) * 43758.5453;
    return h - Math.floor(h);
  };
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // keyed on the position, so the copies of a shared corner move together
    const at = (f) => hash(Math.round(v.x * f), Math.round(v.y * f), Math.round(v.z * f));
    const k = 0.70 + 0.34 * at(1.6) + 0.2 * at(3.4) + 0.07 * at(40);
    v.multiplyScalar(k);
    v.y = Math.max(v.y, -0.55);
    p.setXYZ(i, v.x * sx, v.y * sy, v.z * sz);
  }
  geo.computeVertexNormals();
  return geo;
}

/* -------------------------------------------------------- the decks -- */

function addDecks(group, at, desk, turn) {
  const body = tame(new THREE.MeshStandardMaterial({ color: 0x15130f, roughness: 0.38, metalness: 0.6 }));
  const wheel = tame(new THREE.MeshStandardMaterial({ color: 0x8d857b, roughness: 0.28, metalness: 1.0 }));
  const glow = new THREE.MeshBasicMaterial({ color: WARM.clone().multiplyScalar(2.2), toneMapped: false });
  const screen = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.0), toneMapped: false });

  const place = (mesh, side, y, f) => {
    mesh.position.copy(at(side, y, f));
    mesh.rotation.y = turn;
    group.add(mesh);
    return mesh;
  };
  const surface = TOP + 0.035;
  const f = desk + 0.02;
  // local x of a turned object points to the visitor's right, local +z toward the visitor
  for (const side of [-0.55, 0.55]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), body), side, surface + 0.03, f).castShadow = true;
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.15, 0.028, 40), wheel), side, surface + 0.072, f + 0.04);
    place(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 24), body), side, surface + 0.09, f + 0.04);
    const ring = place(new THREE.Mesh(new THREE.TorusGeometry(0.158, 0.0045, 6, 48), glow), side, surface + 0.064, f + 0.04);
    ring.rotation.set(Math.PI / 2, 0, 0);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.07), screen), side, surface + 0.064, f - 0.17);
  }

  place(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.075, 0.5), body), 0, surface + 0.0375, f).castShadow = true;
  const knobs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016, 0.018, 0.028, 14), wheel, 16);
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.007, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 16);
  const m = new THREE.Matrix4(), colour = new THREE.Color();
  const tints = [[2.4, 1.4, 0.5], [0.5, 1.6, 2.4], [2.2, 0.5, 0.6], [0.8, 2.0, 0.9]];
  for (let i = 0; i < 16; i++) {
    const x = -0.17 + (i % 4) * 0.113, z = Math.floor(i / 4);
    m.setPosition(at(x, surface + 0.09, f - 0.19 + z * 0.065));
    knobs.setMatrixAt(i, m);
    m.setPosition(at(x + 0.04, surface + 0.08, f - 0.19 + z * 0.065));
    dots.setMatrixAt(i, m);
    dots.setColorAt(i, colour.setRGB(...tints[(i * 7) % 4]));
  }
  group.add(knobs, dots);
  for (let i = 0; i < 4; i++) {                          // channel faders
    const x = -0.17 + i * 0.113;
    place(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.11), glow), x, surface + 0.077, f + 0.14);
    place(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.022, 0.016), wheel), x, surface + 0.087, f + 0.11 + (i % 3) * 0.028);
  }
}

/**
 * Fuses the plain meshes under `root` that share a material into one each: the decks and the
 * stones are dozens of small pieces, and each would otherwise be drawn on its own, twice over
 * with the reflection.
 */
function fuse(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  });
  const toRoot = root.matrixWorld.clone().invert();
  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return g.applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld));
    });
    const merged = new THREE.Mesh(mergeGeometries(parts), material);
    merged.castShadow = meshes.some((m) => m.castShadow);
    merged.receiveShadow = true;
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    parts.forEach((g) => g.dispose());
    root.add(merged);
  }
}

/* ----------------------------------------------------------- holograms -- */

const HUD_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`;

const HUD_FRAGMENT = /* glsl */`
  uniform float uTime, uAspect, uKind, uSeed;
  varying vec2 vUv;

  float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float noise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hash( i ), hash( i + vec2( 1, 0 ) ), f.x ),
                mix( hash( i + vec2( 0, 1 ) ), hash( i + vec2( 1, 1 ) ), f.x ), f.y );
  }
  // distance from the edge of a rounded rectangle filling the panel
  float rim( vec2 p, vec2 ext, float r ) {
    vec2 q = abs( p ) - ext + r;
    return length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 ) - r;
  }

  void main() {
    // panel coordinates with a height of 1
    vec2 p = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
    float edge = rim( p, vec2( uAspect, 1.0 ) * 0.5 - 0.012, 0.045 );
    if ( edge > 0.012 ) discard;

    float a = 0.055;                                             // the faint sheet itself
    a += 0.85 * ( 1.0 - smoothstep( 0.0, 0.007, abs( edge ) ) ); // its bright edge

    // two rows of small "text" along the top and one along the bottom
    float cell = floor( vUv.x * uAspect * 38.0 );
    for ( int k = 0; k < 3; k++ ) {
      float y = k == 0 ? 0.40 : k == 1 ? 0.345 : -0.40;
      float on = step( 0.38, hash( vec2( cell, float( k ) + uSeed + floor( uTime * 0.4 ) * 0.01 ) ) );
      a += 0.45 * on * step( abs( p.y - y ), 0.012 ) * step( p.x, uAspect * ( k == 1 ? -0.02 : 0.18 ) )
                     * step( -uAspect * 0.43, p.x );
    }

    if ( uKind < 0.5 ) {                                         // a waveform, playing
      float x = p.x / uAspect;
      if ( abs( x ) < 0.43 ) {
        float bar = floor( ( x + 0.5 ) * 130.0 );
        float swell = exp( -pow( x * 3.1, 2.0 ) );
        float beat = 0.65 + 0.35 * pow( max( 0.0, sin( uTime * 6.8 ) ), 6.0 );
        float level = 0.012 + 0.26 * swell * beat * noise( vec2( bar * 0.37 + uSeed, uTime * 5.0 ) );
        a += 0.9 * step( abs( p.y ), level ) * step( 0.35, fract( ( x + 0.5 ) * 130.0 ) );
        a += 0.35 * step( abs( p.y ), 0.004 );
      }
    } else if ( uKind < 1.5 ) {                                  // a moon, turning
      float r = length( p - vec2( 0.0, -0.03 ) ) / 0.29;
      if ( r < 1.0 ) {
        float z = sqrt( 1.0 - r * r );
        vec2 s = ( p - vec2( 0.0, -0.03 ) ) / 0.29;
        vec2 ball = vec2( atan( s.x, z ) + uTime * 0.06, asin( s.y ) );
        float crust = noise( ball * 4.0 ) * 0.6 + noise( ball * 11.0 ) * 0.3 + noise( ball * 27.0 ) * 0.1;
        a += ( 0.12 + 0.75 * crust ) * ( 0.35 + 0.65 * z );
      }
      a += 0.3 * ( 1.0 - smoothstep( 0.0, 0.005, abs( r - 1.22 ) * 0.29 ) );
    } else {                                                     // levels
      float x = ( p.x / uAspect + 0.43 ) / 0.86;
      if ( x > 0.0 && x < 1.0 ) {
        float col = floor( x * 14.0 );
        float level = 0.1 + 0.46 * noise( vec2( col * 1.7 + uSeed, uTime * 3.2 ) );
        float y = p.y + 0.30;
        a += 0.7 * step( 0.0, y ) * step( y, level ) * step( 0.3, fract( x * 14.0 ) ) * step( 0.35, fract( y * 22.0 ) );
      }
    }

    a *= 0.86 + 0.14 * sin( vUv.y * 260.0 - uTime * 5.0 );       // scan lines
    gl_FragColor = vec4( vec3( 1.0, 0.80, 0.58 ) * a * 1.25, 1.0 );
  }`;

function addHolograms(group, at, desk, turn, animated) {
  //        side   height  deeper  width  height  kind
  const panels = [
    [-1.80, 2.12, 1.30, 1.40, 0.86, 0],
    [-0.98, 2.38, 1.12, 0.74, 0.74, 1],
    [-2.62, 2.62, 1.48, 0.76, 0.46, 2],
    [ 1.78, 2.08, 1.24, 1.22, 0.80, 0]
  ];
  panels.forEach(([side, y, deeper, w, h, kind], i) => {
    const uniforms = {
      uTime: { value: 0 }, uAspect: { value: w / h }, uKind: { value: kind }, uSeed: { value: i * 17.3 }
    };
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
      uniforms, vertexShader: HUD_VERTEX, fragmentShader: HUD_FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
    }));
    panel.position.copy(at(side, y, desk + deeper));
    // each turned a little toward her
    panel.rotation.y = turn - side * 0.09;
    panel.renderOrder = 6;
    group.add(panel);
    animated.push(uniforms);
  });
}

/* --------------------------------------------------------------- build -- */

/**
 * @returns {{group, reflective, animated}} `reflective` are the materials that should mirror the
 * room once it has been captured; `animated` are uniforms that want the clock.
 */
export function buildDesk(chamber, textures) {
  const group = new THREE.Group();
  group.name = 'desk';
  const { at, spec } = chamber;
  const desk = spec.desk;
  // turns a thing so that its local +z faces the visitor
  const turn = Math.atan2(-chamber.forward.x, -chamber.forward.z);
  const animated = [];

  const metal = tame(new THREE.MeshStandardMaterial({
    color: 0xd9d6d2, metalness: 1.0, roughness: 0.46, roughnessMap: brushed(), side: THREE.DoubleSide
  }), 1.6);
  const slab = new THREE.Mesh(slabGeometry(at, desk), metal);
  slab.castShadow = slab.receiveShadow = true;
  group.add(slab);

  // the light tucked under the keel
  const glow = new THREE.MeshBasicMaterial({ color: WARM.clone().multiplyScalar(2.6), toneMapped: false });
  const keel = [];
  for (let i = 0; i <= 40; i++) {
    const u = 0.04 + (i / 40) * 0.92;
    keel.push(at(sideAt(u), Math.min(keelAt(u), topAt(u) - 0.07) - 0.012, frontAt(u, desk) + 0.27));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(keel), 90, 0.012, 6, false), glow));

  const stone = makeTriplanar(new THREE.MeshStandardMaterial({
    color: 0x86705c, map: textures.concrete.map, roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.82, metalness: 0.0, flatShading: true
  }), 0.55);
  const rocks = new THREE.Group();
  //          side  height  deeper   sx     sy     sz   seed
  for (const [side, y, deeper, sx, sy, sz, seed] of [
    [-1.12, 0.27, -0.10, 0.70, 0.44, 0.40, 3],
    [-0.46, 0.16, -0.22, 0.40, 0.30, 0.30, 11],
    [-1.76, 0.13, -0.20, 0.32, 0.24, 0.26, 5],
    [ 1.12, 0.36, -0.06, 0.50, 0.54, 0.34, 8],
    [ 0.60, 0.15, -0.18, 0.32, 0.27, 0.26, 13],
    [ 1.62, 0.15, -0.16, 0.34, 0.28, 0.28, 21]
  ]) {
    const rock = new THREE.Mesh(boulder(sx, sy, sz, seed), stone);
    rock.position.copy(at(side, y, desk + deeper));
    rock.rotation.y = turn + seed;
    rock.castShadow = rock.receiveShadow = true;
    rocks.add(rock);
  }
  fuse(rocks);
  group.add(rocks);

  // the kit is built at life size and enlarged about its own middle, to carry on a desk this long
  const kit = new THREE.Group();
  addDecks(kit, at, desk, turn);
  fuse(kit);                       // before the group is moved, while its parts are in world terms
  const middle = at(0, TOP + 0.035, desk + 0.02);
  kit.scale.setScalar(1.28);
  kit.position.copy(middle).multiplyScalar(1 - 1.28);
  group.add(kit);
  addHolograms(group, at, desk, turn, animated);

  return { group, reflective: [metal], animated };
}
