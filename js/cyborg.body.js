/**
 * The machine in her: the rigid parts. Rings and bands where plates meet, the shoulder, the
 * pelvis, her robotic legs, the platform she stands on, and the little dark studio her metal
 * reflects.
 *
 * Every part worn on the body is placed in her rest pose and bound wholly to one bone of her
 * skeleton, then fused by material: a few draws in all, however many pieces there are.
 *
 * Her own space: metres, facing -z, so her left is -x.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ----------------------------------------------------- what metal reflects -- */

/**
 * A dark photographer's studio with a few long lamps. Metal is only as convincing as what it
 * mirrors: the warm room around her is an even brown from every side, which reads as rubber,
 * where hard bright strips against dark read as chrome. Drawn once.
 */
export function buildSteelSky(renderer, forward, right) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uFront: { value: forward.clone().negate() }, uRight: { value: right.clone() } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uFront, uRight;
      varying vec3 vDir;
      // a lamp: centred on a bearing (0 is where the visitor stands), between two heights
      float lamp( float az, float el, float at, float wide, float low, float high ) {
        float turn = abs( mod( az - at + 3.14159, 6.28318 ) - 3.14159 );
        return ( 1.0 - smoothstep( wide * 0.65, wide, turn ) )
             * smoothstep( low - 0.07, low + 0.07, el ) * ( 1.0 - smoothstep( high - 0.12, high + 0.06, el ) );
      }
      void main() {
        vec3 d = normalize( vDir );
        float el = asin( clamp( d.y, -1.0, 1.0 ) );
        float az = atan( dot( d, uRight ), dot( d, uFront ) );
        vec3 c = vec3( 0.014, 0.012, 0.011 );
        c += vec3( 0.30, 0.235, 0.19 ) * exp( -pow( ( el - 0.06 ) / 0.20, 2.0 ) );     // a horizon
        c += vec3( 0.30, 0.17, 0.08 ) * ( 1.0 - smoothstep( -0.85, -0.25, el ) );      // warm floor
        c += vec3( 2.1, 1.96, 1.82 ) * lamp( az, el, 0.72, 0.17, -0.30, 0.85 );
        c += vec3( 1.3, 1.26, 1.24 ) * lamp( az, el, -1.02, 0.09, -0.25, 1.00 );
        c += vec3( 0.75, 0.70, 0.66 ) * lamp( az, el, -0.22, 0.05, -0.10, 0.70 );
        c += vec3( 2.3, 1.25, 0.55 ) * lamp( az, el, 2.15, 0.22, -0.20, 0.75 );
        c += vec3( 1.7, 0.90, 0.42 ) * lamp( az, el, -2.40, 0.15, -0.20, 0.75 );
        c += vec3( 0.75, 0.68, 0.61 ) * smoothstep( 0.95, 1.25, el );                    // overhead
        gl_FragColor = vec4( c, 1.0 );
      }`
  });
  const scene = new THREE.Scene();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), material);
  scene.add(sphere);
  const pmrem = new THREE.PMREMGenerator(renderer);
  // the same size as the room's capture: her skin shader reads both with one set of constants
  const target = pmrem.fromScene(scene, 0, 0.1, 100, { size: 128 });
  pmrem.dispose();
  sphere.geometry.dispose();
  material.dispose();
  return target;
}

/* ------------------------------------------------------------- fitting -- */

/**
 * The outline of her body where a plane crosses it: points round `centre`, in the plane square to
 * `axis`, ignoring anything farther out than `reach`.
 */
function outline(points, centre, axis, reach, slice = 0.012, n = 40) {
  const a = axis.clone().normalize();
  const u = v3(1, 0, 0).addScaledVector(a, -a.x).normalize();
  const w = new THREE.Vector3().crossVectors(a, u);
  const radius = new Array(n).fill(0);
  const d = new THREE.Vector3();
  for (const p of points) {
    d.subVectors(p, centre);
    const along = d.dot(a);
    if (Math.abs(along) > slice) continue;
    const x = d.dot(u), y = d.dot(w), r = Math.hypot(x, y);
    if (r > reach) continue;
    const bin = Math.floor(((Math.atan2(y, x) / (Math.PI * 2)) + 1) * n) % n;
    radius[bin] = Math.max(radius[bin], r);
  }
  // directions with no vertex take their neighbours' mean, then the whole ring is evened out
  const filled = radius.map((r, i) => {
    if (r) return r;
    let lo = 1, hi = 1;
    while (lo < n && !radius[(i - lo + n) % n]) lo++;
    while (hi < n && !radius[(i + hi) % n]) hi++;
    return (radius[(i - lo + n) % n] * hi + radius[(i + hi) % n] * lo) / (lo + hi) || reach * 0.5;
  });
  let even = filled;
  for (let pass = 0; pass < 2; pass++) {
    even = even.map((r, i) => Math.max(filled[i] * 0.985, (even[(i + n - 1) % n] + 2 * r + even[(i + 1) % n]) / 4));
  }
  return {
    axis: a,
    centre,
    /** The ring, moved `along` the axis, `out` from the skin and scaled. */
    ring(out = 0, along = 0, scale = 1) {
      return even.map((r, i) => {
        const t = (i / n) * Math.PI * 2 + Math.PI / n, len = r * scale + out;
        return centre.clone().addScaledVector(a, along)
          .addScaledVector(u, Math.cos(t) * len).addScaledVector(w, Math.sin(t) * len);
      });
    }
  };
}

/** A surface strung through a stack of closed rings. */
function loft(rings) {
  const n = rings[0].length, pos = [], index = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n);
      index.push(a, b, b + n, a, b + n, a + n);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

/** A machined band round an outline: flat face, bevelled edges, each face its own strip. */
function band(shape, along, height, proud, bevel = 0.003) {
  const h = height / 2;
  const profile = [[-h, -0.002], [-h + bevel, proud], [h - bevel, proud], [h, -0.002]];
  const rings = profile.map(([y, out]) => shape.ring(out, along + y));
  return [0, 1, 2].map((i) => loft([rings[i], rings[i + 1]]));
}

/** Turns a shape built along +y so that it runs from `a` to `b`. */
function between(geometry, a, b) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3().subVectors(b, a).normalize());
  geometry.applyQuaternion(q);
  return geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}
const rod = (a, b, r0, r1 = r0, sides = 10) =>
  between(new THREE.CylinderGeometry(r1, r0, a.distanceTo(b), sides), a, b);
const ball = (p, r, sx = 1, sy = 1, sz = 1) =>
  new THREE.SphereGeometry(r, 24, 16).scale(sx, sy, sz).translate(p.x, p.y, p.z);
/** A turned shell: [radius, height] pairs from bottom to top, round the point `p`. */
const turned = (profile, p, sx = 1, sz = 1) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 28).scale(sx, 1, sz).translate(p.x, p.y, p.z);

/* ------------------------------------------------------------ the parts -- */

/** Collects parts per material, each bound to one bone, and fuses them into skinned meshes. */
function assembler(body) {
  const bins = new Map();
  const names = body.skeleton.bones.map((b) => b.name);
  return {
    add(bone, material, ...geometries) {
      const index = names.indexOf(bone);
      for (const given of geometries.flat()) {
        const geo = given.index ? given.toNonIndexed() : given;
        if (geo !== given) given.dispose();
        for (const key of Object.keys(geo.attributes)) {
          if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
        }
        const n = geo.attributes.position.count;
        const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { joints[i * 4] = index; weights[i * 4] = 1; }
        geo.setAttribute('skinIndex', new THREE.BufferAttribute(joints, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
        if (!bins.has(material)) bins.set(material, []);
        bins.get(material).push(geo);
      }
    },
    build() {
      const meshes = [];
      for (const [material, list] of bins) {
        const mesh = new THREE.SkinnedMesh(mergeGeometries(list), material);
        list.forEach((g) => g.dispose());
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        body.parent.add(mesh);
        mesh.bind(body.skeleton, body.bindMatrix);
        meshes.push(mesh);
      }
      return meshes;
    }
  };
}

function legs(part, rest, { steel, gun, dark, glow }) {
  for (const L of ['L', 'R']) {
    const hip = rest['hip' + L], knee = rest['knee' + L], ankle = rest['ankle' + L];
    const out = Math.sign(hip.x);
    const at = (joint, x, y, z) => joint.clone().add(v3(x * out, y, z));
    const hipBone = 'hip' + L, kneeBone = 'knee' + L;

    // thigh: two shells with a gap between that shows the dark core
    part.add(hipBone, gun, ball(hip, 0.050));
    part.add(hipBone, dark, rod(hip, knee, 0.026, 0.038));
    part.add(hipBone, steel,
      turned([[0.030, -0.368], [0.046, -0.352], [0.054, -0.300], [0.066, -0.222], [0.063, -0.214]], hip, 0.95),
      turned([[0.064, -0.202], [0.072, -0.192], [0.077, -0.125], [0.074, -0.075], [0.057, -0.036], [0.030, -0.024]], hip, 0.95));

    // knee: an axle with a disc each side, and a shield in front
    part.add(kneeBone, gun, rod(at(knee, -0.045, 0, 0), at(knee, 0.045, 0, 0), 0.037, 0.037, 20));
    part.add(kneeBone, steel,
      rod(at(knee, 0.045, 0, 0), at(knee, 0.054, 0, 0), 0.028, 0.025, 24),
      rod(at(knee, -0.054, 0, 0), at(knee, -0.045, 0, 0), 0.025, 0.028, 24),
      ball(at(knee, 0, 0.004, -0.028), 0.036, 0.85, 1.2, 0.6));
    part.add(kneeBone, glow, new THREE.TorusGeometry(0.014, 0.0022, 6, 24).rotateY(Math.PI / 2)
      .translate(knee.x + out * 0.055, knee.y, knee.z));

    // shin: a slim shell ahead, two pistons behind
    part.add(kneeBone, dark, rod(knee, ankle, 0.018, 0.024));
    part.add(kneeBone, steel, turned(
      [[0.020, -0.372], [0.027, -0.350], [0.030, -0.295], [0.047, -0.170], [0.051, -0.112], [0.042, -0.060], [0.024, -0.046]],
      at(knee, 0, 0, -0.008), 0.92));
    for (const side of [-1, 1]) {
      const top = at(knee, side * 0.021, -0.050, 0.044), end = at(knee, side * 0.011, -0.388, 0.026);
      part.add(kneeBone, steel, rod(top, end, 0.0058));
      part.add(kneeBone, gun, rod(top, top.clone().lerp(end, 0.52), 0.0105), ball(top, 0.012), ball(end, 0.009));
    }
    part.add(kneeBone, glow, new THREE.TorusGeometry(0.0275, 0.0025, 6, 32).rotateX(Math.PI / 2)
      .translate(ankle.x, ankle.y + 0.046, ankle.z - 0.006));

    // foot: a machined wedge, flat on the platform
    const foot = new THREE.Shape([
      [0.048, -0.073], [-0.155, -0.073], [-0.148, -0.052], [-0.052, -0.020], [-0.024, 0.004], [0.022, -0.012], [0.050, -0.050]
    ].map(([z, y]) => new THREE.Vector2(z, y)));
    part.add('ankle' + L, steel, new THREE.ExtrudeGeometry(foot, {
      depth: 0.054, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.005, bevelSegments: 2
    }).rotateY(-Math.PI / 2).translate(ankle.x + 0.027, ankle.y, ankle.z));
    part.add('ankle' + L, gun, ball(ankle, 0.029));
  }
}

/**
 * @param figure    her cloned model
 * @param body      her skin-and-plate mesh, whose surface the bands are fitted to
 * @param rest      bone positions in her space
 * @param materials { steel, gun, dark, glow }
 */
export function buildMachine(body, rest, materials) {
  const { steel, gun, dark, glow } = materials;
  const part = assembler(body);
  const points = [];
  const pos = body.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  const fit = (centre, axis, reach) => outline(points, centre, axis, reach);

  /* neck: two collar rings, and two cables running down into them on her machine side */
  const collar = fit(v3(0, 1.446, -0.016), UP, 0.074);
  part.add('neck', steel, band(collar, -0.012, 0.014, 0.0065), band(collar, 0.014, 0.011, 0.0055));
  part.add('neck', dark, band(collar, 0.001, 0.012, 0.0015));
  const low = fit(v3(0, 1.452, -0.016), UP, 0.074).ring(0.004);
  const high = fit(v3(0, 1.500, -0.012), UP, 0.062).ring(0.001);
  // ring points run from +x round toward -z; pick two bearings on her left, ahead and beside
  const bearing = (ring, x, z) => ring.reduce((best, p) =>
    (p.x * x + p.z * z > best.x * x + best.z * z ? p : best), ring[0]);
  for (const [x, z] of [[-0.80, -0.60], [-1.0, 0.05]]) {
    const a = bearing(high, x, z), b = bearing(low, x * 0.85, z - 0.2);
    const bulge = a.clone().lerp(b, 0.5).add(v3(x * 0.007, 0, z * 0.007));
    part.add('neck', gun, new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, bulge, b), 16, 0.0042, 8, false));
  }

  /* waist and hips: a belt, and a pelvis shell that closes the body above the machine legs */
  const waist = fit(v3(0, 1.040, -0.045), UP, 0.19);
  part.add('spine', gun, band(waist, 0, 0.024, 0.0055));
  part.add('spine', glow, band(waist, 0, 0.0045, 0.0068, 0.001));

  const hips = fit(v3(0, 0.900, -0.012), UP, 0.19);
  // cut high over each hip, so the joints show, and low in the middle
  const cut = (ring) => ring.map((p) => p.setY(p.y + 0.34 * Math.abs(p.x) - 0.018));
  const hem = () => cut(hips.ring(-0.016, -0.046, 0.90));
  part.add('hips', steel, loft([
    hem(), cut(hips.ring(0.004, -0.030)), hips.ring(0.0075, 0.012), hips.ring(0.0065, 0.026), hips.ring(-0.001, 0.036)
  ]));
  part.add('hips', gun, band(hips, 0.022, 0.014, 0.0125));
  part.add('hips', dark, loft([hem(), hips.ring(0, -0.030, 0.10)]));

  /* her left arm, all machine: a shoulder shell, and rings at the elbow and wrist */
  const shoulder = rest.shoulderL.clone().add(v3(-0.006, -0.012, 0.001));
  const cap = (radius) => new THREE.SphereGeometry(radius, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.46)
    .scale(1, 0.92, 0.98).rotateZ(0.82).translate(shoulder.x, shoulder.y, shoulder.z);
  part.add('shoulderL', steel, cap(0.058));
  part.add('shoulderL', gun, new THREE.TorusGeometry(0.056, 0.0045, 8, 40).rotateX(Math.PI / 2)
    .translate(0, 0.92 * 0.058 * Math.cos(Math.PI * 0.46), 0).rotateZ(0.82).translate(shoulder.x, shoulder.y, shoulder.z));

  const upper = new THREE.Vector3().subVectors(rest.elbowL, rest.shoulderL).normalize();
  const fore = new THREE.Vector3().subVectors(rest.wristL, rest.elbowL).normalize();
  const above = fit(rest.elbowL.clone().addScaledVector(upper, -0.030), upper, 0.058);
  const below = fit(rest.elbowL.clone().addScaledVector(fore, 0.032), fore, 0.054);
  const wrist = fit(rest.wristL.clone().addScaledVector(fore, -0.020), fore, 0.045);
  part.add('shoulderL', steel, band(above, 0, 0.020, 0.0055));
  part.add('shoulderL', dark, band(above, 0.019, 0.016, 0.0012));
  part.add('elbowL', steel, band(below, 0, 0.020, 0.0055));
  part.add('elbowL', dark, band(below, -0.019, 0.016, 0.0012));
  part.add('elbowL', gun, band(wrist, 0, 0.018, 0.005));
  part.add('elbowL', glow, band(wrist, 0, 0.0035, 0.006, 0.001));
  // the elbow's hub, on the outside
  const outer = above.ring().reduce((best, p) => (p.x < best.x ? p : best));
  const hub = v3(outer.x, rest.elbowL.y, rest.elbowL.z);
  part.add('elbowL', gun, rod(hub.clone().add(v3(0.012, 0, 0)), hub.clone().add(v3(-0.008, 0, 0)), 0.019, 0.019, 20));
  part.add('elbowL', glow, new THREE.TorusGeometry(0.0105, 0.002, 6, 24).rotateY(Math.PI / 2).translate(hub.x - 0.009, hub.y, hub.z));

  /* ridged segments down the middle of her back, each riding the bone nearest its height */
  const backAt = (y) => points.reduce((z, p) =>
    (Math.abs(p.x) < 0.03 && Math.abs(p.y - y) < 0.022 ? Math.max(z, p.z) : z), -1);
  for (let y = 1.06; y < 1.41; y += 0.031) {
    const z = backAt(y);
    if (z < 0) continue;
    part.add(y > rest.chest.y ? 'chest' : 'spine', steel,
      new THREE.CapsuleGeometry(0.0105, 0.026, 3, 8).rotateZ(Math.PI / 2).translate(0, y, z + 0.003));
  }

  legs(part, rest, materials);
  return part.build();
}

/** The low stage she stands on, its rim lit. `depth` is how far it lies below her feet. */
export function buildPlatform(depth, { steel, gun, glow }) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.41, depth, 64), gun);
  base.position.y = -depth / 2 - 0.001;
  base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.372, 0.0065, 8, 96).rotateX(Math.PI / 2), glow);
  rim.position.y = -0.004;
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.004, 6, 96).rotateX(Math.PI / 2), steel);
  inlay.position.y = -0.002;
  group.add(base, rim, inlay);
  return group;
}
