/**
 * The DJ: half skin, half chrome, standing at the decks.
 *
 * The body is models/figure-cyborg.glb (tools/human/cyborg.mjs). It carries, at every point, how
 * far inside the plated half it lies; the shader below turns that into chrome with a dark seam
 * round it. Her curls, headphones, the flower over her left eye and the spine on her back are
 * made here. Her arms are posed by the same two-bone solver the visitors use.
 *
 * She faces -z in her own space, like every figure here, so her left is -x.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from './models.js';
import { Arm } from './figure/ik.js';

const RISER = 0.12;                           // she stands on a step the desk hides
const STATURE = 1.07;                         // a little larger than life, to hold her own behind that desk
const HIDDEN = 0.80;                          // below this height of her body the desk covers all

export const BEAT = 60 / 64;                  // seconds per heartbeat, shared with the sound

/** 0..1: the two thumps of a heartbeat, "lub" then a softer "dub". */
export function heartPulse(t) {
  const p = (t % BEAT) / BEAT;
  const thump = (at, w) => Math.exp(-(((p - at) / w) ** 2));
  return Math.min(1, thump(0.06, 0.045) + 0.6 * thump(0.34, 0.05));
}

/**
 * Caps how bright a surface can get. A lamp glancing off polished metal reaches a hundred times
 * white in a few pixels, and the glow pass smears that across the whole view. Capped just above
 * white, the highlight stays a highlight and glows only a little.
 */
export function tame(material, limit = 1.25) {
  const before = material.onBeforeCompile;
  const key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
      `outgoingLight = min( outgoingLight, vec3( ${limit.toFixed(2)} ) );
      #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => key() + '|tame' + limit;
  return material;
}

/* ------------------------------------------------------------- the skin -- */

function bodyMaterial(source, probe, anchors) {
  const mat = new THREE.MeshStandardMaterial({
    map: source.map, envMap: probe, envMapIntensity: 1.0, roughness: 0.36, metalness: 0.0
  });
  const mouth = new THREE.Vector3(...anchors.mouth), eye = new THREE.Vector3(...anchors.eyeL);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMouth = { value: mouth };
    shader.uniforms.uEyeY = { value: eye.y };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        attribute float _chrome;
        varying float vChrome;
        varying vec3 vRest;`)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vChrome = _chrome;
        vRest = position;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform vec3 uMouth;
        uniform float uEyeY;
        varying float vChrome;
        varying vec3 vRest;
        float dotHash( vec3 p ) { return fract( sin( dot( p, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 ); }
        // a thin groove where \`v\` crosses \`at\`
        float groove( float v, float at ) { return 1.0 - smoothstep( 0.0008, 0.0022, abs( v - at ) ); }`)
      .replace('#include <map_fragment>', `
        #include <map_fragment>
        // her legs are never meant to be seen: nothing is drawn where the desk stands in front
        if ( vRest.y < ${HIDDEN.toFixed(2)} ) discard;
        float plate = smoothstep( 0.47, 0.53, vChrome );
        float seam = 1.0 - smoothstep( 0.04, 0.11, abs( vChrome - 0.5 ) );
        {
          // warm, sun-touched skin with freckles over the nose and cheeks, and a deeper lip
          diffuseColor.rgb *= vec3( 0.68, 0.45, 0.32 );
          float onFace = ( 1.0 - smoothstep( 0.025, 0.055, abs( vRest.y - uEyeY + 0.035 ) ) )
                       * ( 1.0 - smoothstep( 0.045, 0.065, abs( vRest.x ) ) ) * step( vRest.z, uMouth.z + 0.045 );
          float speck = step( 0.90, dotHash( floor( vRest * 520.0 ) ) );
          diffuseColor.rgb *= 1.0 - 0.28 * speck * onFace;
          vec3 d = ( vRest - uMouth ) / vec3( 0.027, 0.012, 0.022 );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.23, 0.042, 0.030 ), ( 1.0 - smoothstep( 0.6, 1.1, length( d ) ) ) * 0.85 );
        }
        // the plates: panel lines where they would be assembled
        float panel = max( max( groove( vRest.y, 1.06 ), groove( vRest.y, 0.93 ) ), groove( vRest.y, 0.50 ) );
        panel = max( panel, groove( abs( vRest.x ), 0.085 + 0.02 * sin( vRest.y * 21.0 ) ) * step( vRest.y, 1.30 ) );
        panel = max( panel, groove( vRest.y + abs( vRest.x ) * 0.5, 1.47 ) );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.56, 0.54, 0.53 ), plate );
        diffuseColor.rgb *= 1.0 - 0.75 * max( seam, panel * plate );`)
      .replace('#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, 0.17, plate );`)
      .replace('#include <metalnessmap_fragment>', `
        #include <metalnessmap_fragment>
        metalnessFactor = mix( 0.0, 1.0, plate );`);
  };
  mat.customProgramCacheKey = () => 'cyborg-skin';
  return tame(mat, 1.15);
}

/* ------------------------------------------------------------ the extras -- */

/** One ringlet: a tube wound round a short axis along y. */
function ringlet(turns, radius, length, thickness, segments = 18, sides = 3) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * turns * Math.PI * 2;
    const r = radius * (0.75 + 0.25 * Math.sin(t * Math.PI));
    pts.push(new THREE.Vector3(Math.cos(a) * r, (t - 0.5) * length, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segments, thickness, sides, false);
}

/** The up-do: a heap of ringlets on the crown, and a few escaping beside the face. */
function curls(anchors, mat) {
  const group = new THREE.Group();
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const [, crownY, crownZ] = anchors.crown;
  const centre = new THREE.Vector3(0, crownY - 0.012, anchors.headBack + 0.012);

  const heart = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), mat);
  heart.scale.set(0.056, 0.040, 0.048);
  heart.position.copy(centre);
  group.add(heart);

  const bun = new THREE.InstancedMesh(ringlet(2.2, 0.016, 0.052, 0.0026), mat, 230);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < bun.count; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 0.55 + 0.45 * Math.cbrt(rnd());
    const ring = Math.sqrt(1 - u * u);
    p.set(Math.cos(a) * ring * 0.072 * r, u * 0.052 * r, Math.sin(a) * ring * 0.062 * r).add(centre);
    q.setFromEuler(new THREE.Euler(rnd() * 6.3, rnd() * 6.3, rnd() * 6.3));
    s.setScalar(0.7 + 0.6 * rnd());
    bun.setMatrixAt(i, m.compose(p, q, s));
  }
  group.add(bun);

  // loose strands: down past the temples and the nape
  const [, eyeY] = anchors.eyeL;
  const half = anchors.headHalf;
  const strands = [];
  for (const [x, y, z, len, tilt] of [
    [-half * 0.86, eyeY - 0.035, -0.062, 0.15, 0.10], [half * 0.88, eyeY - 0.045, -0.058, 0.17, -0.12],
    [-half * 0.95, eyeY - 0.020, -0.010, 0.12, 0.22], [half * 0.96, eyeY - 0.015, -0.006, 0.11, -0.20],
    [-0.035, eyeY - 0.085, anchors.headBack + 0.012, 0.10, 0.1], [0.040, eyeY - 0.070, anchors.headBack + 0.015, 0.09, -0.1],
    // wisps over the hairline
    [-0.040, eyeY + 0.062, -0.122, 0.060, 0.85], [0.052, eyeY + 0.052, -0.112, 0.075, -0.6],
    [-0.068, eyeY + 0.030, -0.098, 0.085, 0.3]
  ]) {
    const turns = Math.min(3.2, len * 26);
    strands.push(ringlet(turns, 0.0085, len, 0.0016, 30, 4).rotateZ(tilt).translate(x, y, z));
  }
  group.add(new THREE.Mesh(mergeGeometries(strands), mat));
  strands.forEach((g) => g.dispose());
  return group;
}

function headphones(anchors, chrome, dark, glow) {
  const group = new THREE.Group();
  const parts = new Map([[chrome, []], [dark, []], [glow, []]]);
  const [, eyeY] = anchors.eyeL;
  const x = anchors.headHalf + 0.014, y = eyeY - 0.012, z = -0.026;
  for (const side of [-1, 1]) {
    const shell = new THREE.CylinderGeometry(0.041, 0.046, 0.03, 28).rotateZ(Math.PI / 2);
    parts.get(chrome).push(shell.translate(side * x, y, z));
    const cushion = new THREE.TorusGeometry(0.034, 0.012, 8, 28).rotateY(Math.PI / 2);
    parts.get(dark).push(cushion.translate(side * (x - 0.017), y, z));
    const ring = new THREE.TorusGeometry(0.026, 0.0028, 6, 32).rotateY(Math.PI / 2);
    parts.get(glow).push(ring.translate(side * (x + 0.0165), y, z));
  }
  const top = anchors.crown[1] + 0.028;
  const band = new THREE.CatmullRomCurve3([
    [-x, y + 0.03, z], [-x * 1.02, y + 0.095, z], [-x * 0.66, top - 0.012, z], [0, top + 0.006, z],
    [x * 0.66, top - 0.012, z], [x * 1.02, y + 0.095, z], [x, y + 0.03, z]
  ].map((v) => new THREE.Vector3(...v)));
  parts.get(chrome).push(new THREE.TubeGeometry(band, 48, 0.0075, 8, false));
  for (const [mat, list] of parts) {
    group.add(new THREE.Mesh(mergeGeometries(list), mat));
    list.forEach((g) => g.dispose());
  }
  return group;
}

/** A petal, base at the origin, lying along +y and cupped toward -z. */
function petalGeometry(length, width) {
  const U = 14, V = 8, pos = [], index = [];
  for (let i = 0; i <= U; i++) {
    const u = i / U;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(0.98, u * 0.92 + 0.05)), 0.8) * (1 - u * u * u * 0.85);
    for (let j = 0; j <= V; j++) {
      const v = j / V * 2 - 1;
      pos.push(v * w, u * length, -0.011 * v * v * (1 - u) - 0.012 * u * u + 0.0022 * Math.cos(v * 9) * u);
    }
  }
  for (let i = 0; i < U; i++) {
    for (let j = 0; j < V; j++) {
      const a = i * (V + 1) + j, b = a + V + 1;
      index.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** The flower that opens where her left eye would be: silver petals, a golden lit heart. */
function flower(anchors, probe) {
  const group = new THREE.Group();
  const silver = tame(new THREE.MeshStandardMaterial({
    color: 0xe6e0d8, metalness: 1.0, roughness: 0.27, envMap: probe, envMapIntensity: 1.1,
    emissive: 0xffa64a, emissiveIntensity: 0.05, side: THREE.DoubleSide
  }), 1.4);
  const gold = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.5, 0.4), toneMapped: false });

  const rings = [[6, 0.056, 0.0155, 0.0, 0, 0.16], [5, 0.036, 0.0105, -0.006, 0.5, 0.55]].map(
    ([count, length, width, depth, turn, open]) => {
      const mesh = new THREE.InstancedMesh(petalGeometry(length, width), silver, count);
      mesh.frustumCulled = false;
      group.add(mesh);
      return { mesh, count, depth, turn, open };
    });
  const place = new THREE.Matrix4(), tilt = new THREE.Matrix4();

  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 16, 12), gold);
  heart.position.z = -0.011;
  group.add(heart);
  const stalks = [];                                       // geometries, fused into one mesh below
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, r = 0.012 + 0.021 * ((i * 7) % 18) / 18;
    const tip = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -0.022 - 0.012 * ((i * 5) % 7) / 7);
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0, -0.01), new THREE.Vector3(tip.x * 0.4, tip.y * 0.4, tip.z - 0.006), tip);
    stalks.push(new THREE.TubeGeometry(curve, 8, 0.00045, 4, false));
    stalks.push(new THREE.SphereGeometry(0.0016, 6, 5).translate(tip.x, tip.y, tip.z));
  }
  group.add(new THREE.Mesh(mergeGeometries(stalks), gold));
  stalks.forEach((g) => g.dispose());

  const [x, y, z] = anchors.eyeL;
  group.position.set(x - 0.004, y + 0.002, z - 0.019);
  group.scale.setScalar(1.12);
  group.rotation.y = 0.16;                                 // lies along the curve of the face

  return {
    group,
    /** Opening and closing, slowly; the heart brightens on each beat. */
    update(t, pulse) {
      for (const ring of rings) {
        for (let i = 0; i < ring.count; i++) {
          const open = ring.open + 0.22 * (0.5 + 0.5 * Math.sin(t * 0.55 + i * 0.245));
          place.makeRotationZ((i / ring.count) * Math.PI * 2 + ring.turn).setPosition(0, 0, ring.depth);
          ring.mesh.setMatrixAt(i, place.multiply(tilt.makeRotationX(-open)));
        }
        ring.mesh.instanceMatrix.needsUpdate = true;
      }
      gold.color.setRGB(1.7, 1.0, 0.28).multiplyScalar(0.8 + 0.5 * pulse);
      silver.emissiveIntensity = 0.04 + 0.12 * pulse;
    }
  };
}

/** Ridged segments down the middle of her back, each riding the bone nearest its height. */
function spine(body, bones, rest, mat) {
  const pos = body.geometry.attributes.position;
  const v = new THREE.Vector3();
  const backAt = (y) => {
    let z = -1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (Math.abs(v.x) < 0.03 && Math.abs(v.y - y) < 0.022) z = Math.max(z, v.z);
    }
    return z;
  };
  const segment = new THREE.CapsuleGeometry(0.0105, 0.026, 3, 8);
  segment.rotateZ(Math.PI / 2);
  const pieces = {};
  for (let y = 1.02; y < 1.47; y += 0.031) {
    const z = backAt(y);
    if (z < 0) continue;
    const name = y > rest.neck.y - 0.02 ? 'neck' : y > rest.chest.y ? 'chest' : 'spine';
    (pieces[name] ||= []).push(segment.clone().translate(0, y - rest[name].y, z + 0.003 - rest[name].z));
  }
  for (const [name, list] of Object.entries(pieces)) {
    bones[name].add(new THREE.Mesh(mergeGeometries(list), mat));
    list.forEach((g) => g.dispose());
  }
  segment.dispose();
}

/* ----------------------------------------------------------------- build -- */

/**
 * @param chamber  from buildSanctuary
 * @param probe    the studio's captured reflections
 * @param surface  height of the desk's playing surface
 */
export async function buildCyborg(chamber, probe, surface) {
  const gltf = await loadModel('models/figure-cyborg.glb');
  const anchors = gltf.asset.extras.anchors;
  const figure = cloneSkinned(gltf.scene);
  figure.name = 'dj';

  const { at, spec } = chamber;
  const root = new THREE.Group();
  root.position.copy(at(0, RISER, spec.desk + 0.46));
  root.rotation.y = Math.atan2(chamber.forward.x, chamber.forward.z);      // faces the visitor
  root.scale.setScalar(STATURE);
  root.add(figure);

  const bones = {}, own = [];
  let body = null;
  figure.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.receiveShadow = true;
    if (o.name.startsWith('body')) body = o;
  });
  figure.traverse((o) => {
    if (!o.isMesh) return;
    if (o === body) o.material = bodyMaterial(o.material, probe, anchors);
    else {
      o.material = tame(o.material.clone());
      o.material.envMap = probe;
      if (o.name.startsWith('hair')) {
        o.material.color.multiplyScalar(0.45);
        o.material.alphaTest = 0.2;
        o.material.alphaToCoverage = true;
        o.material.envMapIntensity = 0.35;
      }
      if (o.name.startsWith('eyes')) {
        o.material.color.setRGB(0.62, 0.72, 0.78);
        o.material.envMapIntensity = 0.4;
      }
    }
    own.push(o.material);
  });

  // everything worn on the head is placed in her own space, then hung from the head bone
  root.updateMatrixWorld(true);
  const toLocal = figure.matrixWorld.clone().invert();
  const rest = {};
  for (const n of Object.keys(bones)) rest[n] = bones[n].getWorldPosition(new THREE.Vector3()).applyMatrix4(toLocal);
  const onHead = (object) => {
    const holder = new THREE.Group();
    holder.position.copy(rest.head).negate();
    holder.add(object);
    bones.head.add(holder);
  };

  const chrome = tame(new THREE.MeshStandardMaterial({ color: 0xd9d5d0, metalness: 1.0, roughness: 0.26, envMap: probe, envMapIntensity: 1.1 }));
  const dark = tame(new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.55, envMap: probe }));
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.55, 0.8), toneMapped: false });
  const hairMat = tame(new THREE.MeshStandardMaterial({ color: 0x1b0f09, roughness: 0.4, envMap: probe, envMapIntensity: 0.7 }));

  onHead(curls(anchors, hairMat));
  onHead(headphones(anchors, chrome, dark, glow));
  const bloom = flower(anchors, probe);
  onHead(bloom.group);
  spine(body, bones, rest, chrome);

  /* ---- hands on the decks ---- */
  const arms = {};
  for (const L of ['L', 'R']) {
    arms[L] = new Arm(bones['shoulder' + L], bones['elbow' + L], bones['wrist' + L]);
    arms[L].l1 *= STATURE;                       // the solver works in the room, where she is larger
    arms[L].l2 *= STATURE;
  }
  const curl = new THREE.Vector3();
  for (const name of Object.keys(bones)) {
    const axis = bones[name].userData.curl;
    // a little more bend than the relaxed rest hand, as over a platter
    if (axis && !name.startsWith('thumb')) bones[name].quaternion.setFromAxisAngle(curl.fromArray(axis).normalize(), 0.14);
  }
  const target = new THREE.Vector3(), pole = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  // her right hand is on the visitor's left (negative side), her left on the visitor's right
  const hands = [{ L: 'R', side: -0.53 }, { L: 'L', side: 0.28 }];

  function pose(t, pulse) {
    // the head keeps time; she leans a little into the decks
    bones.chest.rotation.x = -0.10 - 0.018 * pulse;
    bones.neck.rotation.x = -0.05;
    bones.head.rotation.set(-0.12 - 0.06 * pulse, 0.06 * Math.sin(t * 0.31), 0.045 * Math.sin(t * 0.47));
    root.updateMatrixWorld(true);
    hands.forEach(({ L, side }, i) => {
      // the right hand works the platter back and forth; the left rides a control
      const scratch = i === 0 ? 0.045 * Math.sin(t * 5.2) * Math.max(0, Math.sin(t * 0.7)) : 0.012 * Math.sin(t * 1.9);
      target.copy(at(side + scratch, surface + (i === 0 ? 0.13 : 0.15) + 0.004 * Math.sin(t * 3.3 + i), spec.desk + 0.17));
      pole.copy(chamber.right).multiplyScalar(Math.sign(side)).addScaledVector(up, -0.6).addScaledVector(chamber.forward, 0.35);
      arms[L].reach(target, pole);
      // the hand hangs along the forearm at rest; tip it toward flat on the deck
      bones['wrist' + L].rotation.set(0.55, 0, 0);
    });
  }
  pose(0, 0);
  bloom.update(0, 0);

  return {
    group: root,
    head: bones.head,
    update(t) {
      const pulse = heartPulse(t);
      pose(t, pulse);
      bloom.update(t, pulse);
    },
    dispose() {
      // her geometry and textures belong to the model cache; only what was made here goes
      for (const m of [...own, chrome, dark, glow, hairMat]) m.dispose();
    }
  };
}
