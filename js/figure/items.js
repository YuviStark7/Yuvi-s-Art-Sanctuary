/**
 * What a visitor can hold: a glass of wine, an instant camera, a cigarette.
 *
 * Each is built around its own grip point, which sits at the origin of the
 * returned group, so the figure can put that point wherever the palm is without
 * knowing anything about the object.
 *
 *   wine      stem along +y, glass above the origin
 *   polaroid  lens toward -z, grip at the bottom edge of the body
 *   cigarette along z, ember toward -z
 */
import * as THREE from 'three';
import { softDot } from '../textures.js';

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


/**
 * Materials are made once and shared by every item that is built. A glass with a
 * clearcoat is a MeshPhysicalMaterial, whose shader takes ~130 ms to compile, and
 * three.js throws the compiled program away when the last material using it is
 * disposed. Building a fresh material per item therefore cost that 130 ms every
 * time the item was rebuilt. They are flagged so the figure leaves them alone.
 */
const _mat = {};
function shared(key, make) {
  if (!_mat[key]) { _mat[key] = make(); _mat[key].userData.shared = true; }
  return _mat[key];
}

/** @returns {{group: THREE.Group, ember: THREE.Mesh|null, smoke: object|null}} */
export function buildItem(style) {
  const group = new THREE.Group();
  group.name = 'held-' + style;
  let ember = null, smoke = null;

  const put = (geo, mat, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    (parent || group).add(m);
    return m;
  };

  if (style === 'wine') {
    const glassMat = shared('glass', () => new THREE.MeshPhysicalMaterial({
      color: 0xf2f6f6, roughness: 0.06, metalness: 0.0,
      transparent: true, opacity: 0.26, side: THREE.DoubleSide,
      depthWrite: false, clearcoat: 1.0, clearcoatRoughness: 0.04, ior: 1.5
    }));
    const profile = [
      [0.0000, 0.000], [0.0340, 0.002], [0.0345, 0.008], [0.0060, 0.016],
      [0.0055, 0.070], [0.0090, 0.082], [0.0330, 0.098], [0.0400, 0.128],
      [0.0395, 0.160], [0.0370, 0.162], [0.0370, 0.126], [0.0300, 0.100]
    ].map(([x, y]) => new THREE.Vector2(x, y - 0.045));          // grip at the stem's middle
    put(new THREE.LatheGeometry(profile, 24), glassMat);
    const wine = put(
      new THREE.CylinderGeometry(0.0345, 0.0250, 0.030, 22),
      shared('wine', () => new THREE.MeshPhysicalMaterial({ color: 0x5c1024, roughness: 0.16, transparent: true, opacity: 0.92, clearcoat: 0.7 }))
    );
    wine.position.y = 0.118 - 0.045;

  } else if (style === 'polaroid') {
    const bodyMat = shared('cam-body', () => new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.42 }));
    const darkMat = shared('cam-dark', () => new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.35 }));
    put(slab(0.115, 0.100, 0.062, 0.010, 3), bodyMat).position.y = 0.05;
    const lens = new THREE.CylinderGeometry(0.024, 0.028, 0.030, 20);
    lens.rotateX(Math.PI / 2);
    put(lens, darkMat).position.set(0.010, 0.046, -0.042);
    put(new THREE.TorusGeometry(0.0245, 0.004, 8, 20), darkMat).position.set(0.010, 0.046, -0.056);
    put(slab(0.026, 0.020, 0.012, 0.004, 2), darkMat).position.set(-0.038, 0.080, -0.034);
    put(slab(0.086, 0.005, 0.010, 0.002, 2), shared('cam-strap', () => new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.6 })))
      .position.set(0, -0.002, -0.020);

  } else if (style === 'cigarette') {
    const paper = shared('paper', () => new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.85 }));
    const filter = shared('filter', () => new THREE.MeshStandardMaterial({ color: 0xc08b4a, roughness: 0.9 }));
    const stick = new THREE.CylinderGeometry(0.0042, 0.0042, 0.062, 10);
    stick.rotateX(Math.PI / 2);
    put(stick, paper).position.set(0, 0, -0.018);
    const butt = new THREE.CylinderGeometry(0.0044, 0.0044, 0.020, 10);
    butt.rotateX(Math.PI / 2);
    put(butt, filter).position.set(0, 0, 0.023);
    ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0030, 0.006, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a1206, emissive: 0xff5a1e, emissiveIntensity: 0.6, roughness: 1 })
    );
    ember.rotation.x = Math.PI / 2;
    ember.position.set(0, 0, -0.051);
    group.add(ember);
    smoke = buildSmoke();
  }
  return { group, ember, smoke };
}

/** A puff of smoke: points that drift up and fade, restarted by setting uBirth. */
export function buildSmoke() {
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
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 21;
  return { points, uniforms };
}
