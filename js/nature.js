/**
 * The rocky island and the tree standing on it.
 *
 * The tree is grown rather than modelled: a recursive skeleton is swept into
 * tapered tubes with parallel-transport frames (so branches never twist), and
 * leaf clusters are hung on the thin tips as instanced quads that drift in a
 * slow wind.
 */
import * as THREE from 'three';
import { ISLAND, TREE, POOL, PALETTE } from './config.js';
import { mulberry32 } from './textures.js';

/* --------------------------------------------------------------- noise -- */

function makeNoise3(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; grad[i] = rnd(); }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const fade = (t) => t * t * (3 - 2 * t);
  const val = (x, y, z) => grad[perm[(perm[(perm[x & 255] + y) & 255] + z) & 255]];

  return function (x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c000 = val(xi, yi, zi),         c100 = val(xi + 1, yi, zi);
    const c010 = val(xi, yi + 1, zi),     c110 = val(xi + 1, yi + 1, zi);
    const c001 = val(xi, yi, zi + 1),     c101 = val(xi + 1, yi, zi + 1);
    const c011 = val(xi, yi + 1, zi + 1), c111 = val(xi + 1, yi + 1, zi + 1);
    return lerp(
      lerp(lerp(c000, c100, xf), lerp(c010, c110, xf), yf),
      lerp(lerp(c001, c101, xf), lerp(c011, c111, xf), yf),
      zf
    );
  };
}

function fbm3(noise, x, y, z, octaves) {
  let s = 0, a = 0.5, n = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    s += a * noise(x * f, y * f, z * f);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

/** Roughens a sphere-like geometry into something quarried. */
function erode(geo, noise, amount, freq, squash) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm3(noise, v.x * freq, v.y * freq, v.z * freq, 4) - 0.5;
    const ridge = Math.abs(fbm3(noise, v.x * freq * 2.4 + 9, v.y * freq * 2.4, v.z * freq * 2.4, 3) - 0.5);
    const k = 1 + n * amount - ridge * amount * 0.55;
    v.multiplyScalar(k);
    if (squash) v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/* -------------------------------------------------------------- island -- */

export function buildIsland(textures, seed) {
  const group = new THREE.Group();
  group.name = 'island';
  const rnd = mulberry32(seed || 88);
  const noise = makeNoise3(seed || 88);

  const rockMat = new THREE.MeshStandardMaterial({
    color: PALETTE.rock,
    map: textures.rock.map,
    normalMap: textures.rock.normalMap,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.94,
    metalness: 0.0
  });

  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x8a9470,
    map: textures.moss,
    roughness: 0.96,
    metalness: 0.0
  });
  textures.moss.repeat.set(3, 3);

  /* the mound, sunk so its foot disappears under the water */
  const mound = new THREE.SphereGeometry(ISLAND.radius, 64, 40, 0, Math.PI * 2, 0, Math.PI * 0.55);
  erode(mound, noise, 0.22, 1.5, ISLAND.height / ISLAND.radius * 1.9);
  const moundMesh = new THREE.Mesh(mound, rockMat);
  moundMesh.position.y = POOL.waterLevel - 0.22;
  moundMesh.castShadow = true;
  moundMesh.receiveShadow = true;
  group.add(moundMesh);

  /* a skirt of boulders around the waterline */
  const boulders = [];
  const count = 16;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rnd() * 0.4;
    const rad = ISLAND.radius * (0.62 + rnd() * 0.42);
    const size = 0.20 + rnd() * 0.40;
    const g = new THREE.IcosahedronGeometry(size, 2);
    erode(g, makeNoise3(seed + i * 31), 0.42, 3.1, 0.72 + rnd() * 0.4);
    const m = new THREE.Mesh(g, rockMat);
    m.position.set(
      Math.cos(a) * rad,
      POOL.waterLevel + rnd() * 0.24 - 0.06,
      Math.sin(a) * rad
    );
    m.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    boulders.push(m);
  }

  /* a few larger stones nearer the trunk */
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = ISLAND.radius * (0.15 + rnd() * 0.4);
    const size = 0.28 + rnd() * 0.34;
    const g = new THREE.IcosahedronGeometry(size, 2);
    erode(g, makeNoise3(seed + 500 + i * 17), 0.38, 2.7, 0.6);
    const m = new THREE.Mesh(g, rockMat);
    m.position.set(Math.cos(a) * rad, ISLAND.height * 0.55 + rnd() * 0.1, Math.sin(a) * rad);
    m.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  /* mossy crown of the mound */
  const capGeo = new THREE.CircleGeometry(ISLAND.radius * 0.86, 56);
  capGeo.rotateX(-Math.PI / 2);
  const cpos = capGeo.attributes.position;
  const cv = new THREE.Vector3();
  for (let i = 0; i < cpos.count; i++) {
    cv.fromBufferAttribute(cpos, i);
    const d = Math.hypot(cv.x, cv.z) / (ISLAND.radius * 0.86);
    const bump = fbm3(noise, cv.x * 2.2, 0, cv.z * 2.2, 3) - 0.5;
    cpos.setY(i, ISLAND.height * (1 - d * d * 0.75) + bump * 0.12);
  }
  cpos.needsUpdate = true;
  capGeo.computeVertexNormals();
  const cap = new THREE.Mesh(capGeo, mossMat);
  cap.receiveShadow = true;
  cap.castShadow = true;
  group.add(cap);

  /* low ground cover */
  const tuft = new THREE.PlaneGeometry(0.42, 0.34);
  const tuftMat = new THREE.MeshStandardMaterial({
    map: textures.leaf,
    color: 0x6f7d58,
    transparent: true,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.9
  });
  const tufts = new THREE.InstancedMesh(tuft, tuftMat, 190);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 190; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.pow(rnd(), 0.6) * ISLAND.radius * 0.9;
    const h = ISLAND.height * (1 - (d / (ISLAND.radius * 0.86)) ** 2 * 0.75);
    dummy.position.set(Math.cos(a) * d, Math.max(POOL.waterLevel + 0.05, h) + 0.08, Math.sin(a) * d);
    dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.4);
    const s = 0.5 + rnd() * 0.9;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  tufts.castShadow = true;
  tufts.receiveShadow = true;
  group.add(tufts);

  return { group, rockMat, mossMat, boulders };
}

/* ---------------------------------------------------------------- tree -- */

function tubeFromPath(points, radii, sides) {
  const pos = [], nrm = [], uv = [], index = [];
  const n = points.length;

  // parallel transport so the tube never twists
  let normal = new THREE.Vector3(1, 0, 0);
  const t0 = points[1].clone().sub(points[0]).normalize();
  if (Math.abs(t0.dot(normal)) > 0.9) normal.set(0, 0, 1);
  normal.crossVectors(t0, normal).cross(t0).normalize();

  let prevT = t0.clone();
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    const tangent = b.clone().sub(a).normalize();

    const axis = new THREE.Vector3().crossVectors(prevT, tangent);
    const len = axis.length();
    if (len > 1e-6) {
      const ang = Math.atan2(len, prevT.dot(tangent));
      normal.applyAxisAngle(axis.normalize(), ang);
    }
    normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
    prevT = tangent;

    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    for (let k = 0; k <= sides; k++) {
      const a2 = (k / sides) * Math.PI * 2;
      const dir = normal.clone().multiplyScalar(Math.cos(a2)).addScaledVector(binormal, Math.sin(a2));
      const v = points[i].clone().addScaledVector(dir, radii[i]);
      pos.push(v.x, v.y, v.z);
      nrm.push(dir.x, dir.y, dir.z);
      uv.push(k / sides * 2.0, i * 0.5);
    }
  }

  const cols = sides + 1;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * cols + k, b = a + 1;
      const c = (i + 1) * cols + k + 1, d = (i + 1) * cols + k;
      index.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  return geo;
}

function mergeGeometries(list) {
  let vCount = 0, iCount = 0;
  for (const g of list) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nrm.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
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

/** Wind that sways leaves and the finest branch tips, injected into standard materials. */
function addWind(material, uniforms, strength) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWind = { value: strength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTime;
        uniform float uWind;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 wp = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #else
            vec3 wp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
          #endif
          float h = clamp( wp.y / 6.0, 0.0, 1.0 );
          float gust = sin( uTime * 0.62 + wp.x * 0.42 + wp.z * 0.31 )
                     * 0.65 + sin( uTime * 1.31 + wp.z * 0.77 ) * 0.35;
          transformed.x += gust * uWind * h * h;
          transformed.z += cos( uTime * 0.51 + wp.x * 0.29 ) * uWind * 0.7 * h * h;
        }
      `);
  };
  material.customProgramCacheKey = () => 'wind' + strength;
}

export function buildTree(textures, uniforms, seed) {
  const group = new THREE.Group();
  group.name = 'tree';
  const rnd = mulberry32(seed || 2024);

  // bark reuses the stone maps but wants its own tiling, so clone the
  // textures rather than re-scaling the ones the boulders are using
  const barkMap = textures.rock.map.clone();
  const barkNormal = textures.rock.normalMap.clone();
  for (const t of [barkMap, barkNormal]) {
    t.repeat.set(3, 1.2);
    t.needsUpdate = true;
  }

  const barkMat = new THREE.MeshStandardMaterial({
    color: PALETTE.bark,
    map: barkMap,
    normalMap: barkNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    roughness: 0.95,
    metalness: 0.0
  });

  const parts = [];
  const leafSpots = [];

  /**
   * One branch: a gently curving path that tapers, then splits.
   */
  function grow(origin, dir, length, radius, depth, twist) {
    const steps = Math.max(3, 8 - depth);
    const pts = [origin.clone()];
    const radii = [radius];
    let p = origin.clone();
    let d = dir.clone().normalize();

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // gnarl: wander sideways, and let gravity pull the outer limbs down
      const wander = new THREE.Vector3(
        (rnd() - 0.5) * twist,
        (rnd() - 0.5) * twist * 0.5,
        (rnd() - 0.5) * twist
      );
      d.add(wander).normalize();
      // only the outer limbs feel their own weight; an olive holds itself up
      if (depth > 1) d.y -= 0.011 * depth * (0.3 + t);
      // nothing is allowed to sag back down into the water
      if (p.y < 1.5 && depth > 0) d.y = Math.max(d.y, 0.10);
      d.normalize();
      p = p.clone().addScaledVector(d, length / steps);
      pts.push(p.clone());
      radii.push(radius * (1 - t * 0.66));
    }

    const sides = depth === 0 ? 12 : depth === 1 ? 8 : 5;
    parts.push(tubeFromPath(pts, radii, sides));

    const tip = pts[pts.length - 1];

    if (depth >= 5 || radius < 0.010) {
      // a tip: hang a fistful of foliage around it
      for (let i = 0; i < 16; i++) {
        leafSpots.push({
          pos: tip.clone().add(new THREE.Vector3(
            (rnd() - 0.5) * 0.62, (rnd() - 0.5) * 0.46, (rnd() - 0.5) * 0.62
          )),
          scale: 0.46 + rnd() * 0.50
        });
      }
      return;
    }

    const children = depth === 0 ? 4 : (rnd() > 0.34 ? 2 : 3);
    const phase = rnd() * Math.PI * 2;
    for (let i = 0; i < children; i++) {
      const spread = depth === 0 ? 0.98 : (depth === 1 ? 0.78 : 0.56) + rnd() * 0.46;
      // the trunk forks evenly around the compass; later splits are free
      const az = depth === 0
        ? phase + (i / children) * Math.PI * 2 + (rnd() - 0.5) * 0.5
        : rnd() * Math.PI * 2;
      const axis = new THREE.Vector3(Math.cos(az), rnd() * 0.25, Math.sin(az)).normalize();
      const nd = d.clone().applyAxisAngle(axis, spread * (0.6 + rnd() * 0.8));
      nd.y += depth === 0 ? 0.05 : 0.30;         // low fork, then back up toward the light
      grow(tip, nd, length * (0.66 + rnd() * 0.20), radius * (0.64 + rnd() * 0.15),
           depth + 1, twist * 1.22);
    }

    // fill the interior of the crown so it never reads as bare sticks
    if (depth >= 3) {
      for (let i = 0; i < 6; i++) {
        const along = pts[Math.max(1, Math.floor(pts.length * (0.45 + rnd() * 0.55)) - 1)];
        leafSpots.push({
          pos: along.clone().add(new THREE.Vector3(
            (rnd() - 0.5) * 0.42, (rnd() - 0.5) * 0.32, (rnd() - 0.5) * 0.42
          )),
          scale: 0.40 + rnd() * 0.44
        });
      }
    }
  }

  // a short, thick, leaning trunk that splits low — the olive habit
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.045, 1, 0.03),
       TREE.height * 0.34, TREE.trunkRadius, 0, 0.075);

  const trunk = new THREE.Mesh(mergeGeometries(parts), barkMat);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  addWind(barkMat, uniforms, 0.045);
  group.add(trunk);

  /* foliage */
  const leafMat = new THREE.MeshStandardMaterial({
    map: textures.leaf,
    color: 0xffffff,
    transparent: false,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.82,
    metalness: 0.0
  });
  addWind(leafMat, uniforms, 0.075);

  const leafGeo = new THREE.PlaneGeometry(1.02, 0.88);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafSpots.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < leafSpots.length; i++) {
    const spot = leafSpots[i];
    dummy.position.copy(spot.pos);
    dummy.rotation.set(rnd() * Math.PI, rnd() * Math.PI * 2, rnd() * Math.PI);
    dummy.scale.setScalar(spot.scale);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.name = 'foliage';
  group.add(leaves);

  group.userData.leafCount = leafSpots.length;
  return { group, barkMat, leafMat, leafCount: leafSpots.length };
}

/* ------------------------------------------------ the imported blossom -- */

/**
 * Dress an imported blossom tree (models/blossom-tree.glb) for the sanctuary.
 *
 * The .glb was cut out of a larger tree pack: one tree's canopy and only the
 * trunk components standing under it, re-framed Y-up with the trunk base at
 * the origin and scaled so the whole thing is TREE.height tall. Petal tint and
 * ambient occlusion are baked into COLOR_0, so the canopy needs no texture at
 * all — which is why it loads in a few megabytes rather than eighty.
 *
 * The gltf is owned by the model cache and reused across quality rebuilds, so
 * this returns a group holding the *same* meshes each time rather than clones.
 * Nothing here may modify geometry.
 */
export function buildImportedTree(gltf, uniforms, quality) {
  const group = new THREE.Group();
  group.name = 'tree';

  let barkMat = null, leafMat = null, leafCount = 0;
  const blossom = [];

  for (const child of gltf.scene.children.slice()) {
    group.add(child);
  }

  group.traverse((o) => {
    if (!o.isMesh) return;
    const mat = o.material;
    o.castShadow = true;
    o.receiveShadow = true;

    if (o.name.startsWith('Blossom')) {
      mat.vertexColors = true;
      mat.roughness = 0.94;
      mat.metalness = 0.0;
      // Petals are single-sided cards; lighting the back face from the flipped
      // normal is what stops the canopy going black when seen against the sky.
      mat.side = THREE.DoubleSide;
      mat.shadowSide = THREE.DoubleSide;
      leafMat = mat;
      leafCount += o.geometry.index ? o.geometry.index.count / 3 : 0;
      blossom.push(o);
    } else {
      mat.vertexColors = true;     // baked contact shading on the trunk
      mat.roughness = 0.93;
      mat.metalness = 0.0;
      if (mat.normalScale) mat.normalScale.set(0.85, 0.85);
      barkMat = mat;
    }
    mat.needsUpdate = true;
  });

  // The canopy ships as two layers. The second is a thickening pass: dropping
  // it halves the triangle count and reads as a slightly airier tree, which is
  // the right trade on a machine that asked for the low preset.
  if (quality && quality.canopyLayers === 1) {
    const extra = blossom.find((o) => o.name === 'BlossomB');
    if (extra) {
      extra.visible = false;
      leafCount -= extra.geometry.index ? extra.geometry.index.count / 3 : 0;
    }
  } else {
    for (const o of blossom) o.visible = true;
  }

  // Petals sway; the trunk and branches do not. At this strength the drift is
  // a few centimetres, which reads as air moving rather than as petals coming
  // loose from their twigs.
  if (leafMat && uniforms) addWind(leafMat, uniforms, 0.036);

  group.userData.leafCount = leafCount;
  return { group, barkMat, leafMat, leafCount, imported: true };
}
