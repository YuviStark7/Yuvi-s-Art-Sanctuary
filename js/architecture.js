/**
 * The building itself: one continuous concrete shell with openings genuinely
 * cut through it, plus the floor, seating and side chambers.
 *
 * The shell is generated as a polar grid over a revolved profile. Openings are
 * described in the shell's own surface coordinates (arc length along the
 * meridian, arc length around the axis) so an ellipse stays an ellipse no
 * matter how the surface curves. Vertices falling inside an opening are
 * dropped; vertices just outside are snapped exactly onto its boundary, which
 * gives a clean silhouette without needing a dense mesh.
 */
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { HALL, OCULUS, SKYLIGHTS, ALCOVES, POOL, BENCHES, PALETTE } from './config.js';

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/* ------------------------------------------------- the revolved profile -- */

/**
 * Samples the wall/dome silhouette and tabulates arc length so that positions
 * can be looked up by "how far along the surface" rather than by angle.
 */
export function buildProfile() {
  const R = HALL.radius;
  const cove = 0.30;                 // soft fillet where wall meets floor
  const pts = [];

  // base cove
  for (let i = 0; i <= 10; i++) {
    const t = -Math.PI / 2 + (i / 10) * (Math.PI / 2);
    pts.push({ r: R - cove + Math.cos(t) * cove, y: cove + Math.sin(t) * cove });
  }
  // straight wall
  const wallTop = HALL.wallHeight;
  for (let i = 1; i <= 24; i++) {
    pts.push({ r: R, y: cove + (wallTop - cove) * (i / 24) });
  }
  // dome, an ellipse quarter that stops at the oculus rim
  const phiMax = Math.acos(Math.min(0.999, OCULUS.radius / R));
  const DOME = 220;
  for (let i = 1; i <= DOME; i++) {
    const phi = (i / DOME) * phiMax;
    pts.push({ r: R * Math.cos(phi), y: wallTop + HALL.domeRise * Math.sin(phi) });
  }

  // cumulative arc length + analytic inward normal
  let total = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i].r - pts[i - 1].r, pts[i].y - pts[i - 1].y);
    pts[i].s = total;
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dr = b.r - a.r, dy = b.y - a.y;
    const len = Math.hypot(dr, dy) || 1;
    pts[i].nr = -dy / len;   // points toward the room
    pts[i].ny = dr / len;
  }

  /** Look up the profile at arc length `s` (metres from the floor). */
  function at(s) {
    const t = Math.min(total, Math.max(0, s));
    let lo = 0, hi = pts.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (pts[mid].s <= t) lo = mid; else hi = mid;
    }
    const a = pts[lo], b = pts[hi];
    const span = b.s - a.s || 1;
    const k = (t - a.s) / span;
    return {
      r: a.r + (b.r - a.r) * k,
      y: a.y + (b.y - a.y) * k,
      nr: a.nr + (b.nr - a.nr) * k,
      ny: a.ny + (b.ny - a.ny) * k
    };
  }

  return { at, total, rim: pts[pts.length - 1] };
}

/* -------------------------------------------------------------- openings -- */

/**
 * An opening knows one thing: for any point on the shell, how far out it is
 * relative to the opening's edge. Below 1 is inside the hole, 1 is exactly on
 * the rim.
 */
function ellipseOpening(spec, profile) {
  const s0 = spec.along * profile.total;
  const rHole = profile.at(s0).r;
  const cosT = Math.cos(spec.tilt), sinT = Math.sin(spec.tilt);
  return {
    kind: 'ellipse',
    s0, rHole, theta0: spec.around, a: spec.a, b: spec.b,
    rho(s, theta) {
      const ds = s - s0;
      const dw = rHole * wrapAngle(theta - spec.around);
      const x = ds * cosT + dw * sinT;
      const z = -ds * sinT + dw * cosT;
      return Math.hypot(x / spec.a, z / spec.b);
    },
    /** Move a point radially onto the rim (rho === 1). */
    snap(s, theta, rho) {
      const ds = (s - s0) / rho;
      const dw = (rHole * wrapAngle(theta - spec.around)) / rho;
      return { s: s0 + ds, theta: spec.around + dw / rHole };
    },
    boundary(n) {
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU;
        const x = spec.a * Math.cos(t), z = spec.b * Math.sin(t);
        const ds = x * cosT - z * sinT;
        const dw = x * sinT + z * cosT;
        out.push({ s: s0 + ds, theta: spec.around + dw / rHole });
      }
      return out;
    },
    cellRho(dsCell, dwCell) {
      return Math.max(dsCell / spec.a, dwCell / spec.b);
    }
  };
}

function archOpening(spec, profile) {
  const rHole = HALL.radius;
  const b = spec.width / 2;
  const shoulder = Math.max(0.01, spec.height - b);
  return {
    kind: 'arch',
    theta0: spec.around, rHole, halfWidth: b, shoulder, spec,
    rho(s, theta) {
      const dw = rHole * wrapAngle(theta - spec.around);
      if (s <= shoulder) return Math.abs(dw) / b;
      return Math.hypot(dw, s - shoulder) / b;
    },
    snap(s, theta, rho) {
      const dw = rHole * wrapAngle(theta - spec.around);
      if (s <= shoulder) {
        return { s, theta: spec.around + (dw / rho) / rHole };
      }
      const dy = s - shoulder;
      return { s: shoulder + dy / rho, theta: spec.around + (dw / rho) / rHole };
    },
    boundary(n) {
      const out = [];
      const arcN = Math.max(8, Math.round(n * 0.55));
      const jambN = Math.max(4, Math.round((n - arcN) / 2));
      for (let i = 0; i < jambN; i++) {                       // up the left jamb
        out.push({ s: (i / jambN) * shoulder, theta: spec.around - b / rHole });
      }
      for (let i = 0; i <= arcN; i++) {                       // over the head
        const t = Math.PI - (i / arcN) * Math.PI;
        out.push({ s: shoulder + b * Math.sin(t), theta: spec.around + (b * Math.cos(t)) / rHole });
      }
      for (let i = jambN; i > 0; i--) {                       // down the right jamb
        out.push({ s: (i / jambN) * shoulder, theta: spec.around + b / rHole });
      }
      return out;
    },
    cellRho(dsCell, dwCell) {
      return Math.max(dsCell / b, dwCell / b);
    }
  };
}

/* ----------------------------------------------------------- shell mesh -- */

function buildShellMesh(profile, openings, rings, segs) {
  const cols = segs + 1;
  const pos = [], nrm = [], uv = [];
  const alive = new Uint8Array((rings + 1) * cols);
  const dsCell = profile.total / rings;

  for (const o of openings) {
    const rAt = o.kind === 'arch' ? HALL.radius : o.rHole;
    o._band = Math.min(0.55, Math.max(0.08, 1.7 * o.cellRho(dsCell, (TAU * rAt) / segs)));
  }

  for (let i = 0; i <= rings; i++) {
    for (let j = 0; j <= segs; j++) {
      let s = (i / rings) * profile.total;
      let theta = (j / segs) * TAU;
      let dead = false;

      for (const o of openings) {
        const rho = o.rho(s, theta);
        if (rho < 1) { dead = true; break; }
        if (rho < 1 + o._band) {
          const snapped = o.snap(s, theta, rho);
          s = snapped.s;
          theta = snapped.theta;
          break;
        }
      }

      const p = profile.at(s);
      const idx = i * cols + j;
      alive[idx] = dead ? 0 : 1;

      pos.push(p.r * Math.cos(theta), p.y, p.r * Math.sin(theta));
      const nlen = Math.hypot(p.nr, p.ny) || 1;
      const nr = p.nr / nlen, ny = p.ny / nlen;
      nrm.push(nr * Math.cos(theta), ny, nr * Math.sin(theta));

      // scale by the true local circumference, otherwise the texture
      // compresses circumferentially and smears into radial streaks
      // as the dome narrows toward the oculus
      uv.push((theta * p.r) / 3.0, s / 3.0);
    }
  }

  const index = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = (i + 1) * cols + j + 1;
      const d = (i + 1) * cols + j;
      if (!alive[a] || !alive[b] || !alive[c] || !alive[d]) continue;
      index.push(a, b, c, a, c, d);
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

/* ------------------------------------------------------- opening reveals -- */

/**
 * The concrete is thick, so every opening shows a band of its own depth.
 * The rim loop is pushed outward along the surface normal and stitched.
 */
function buildReveal(profile, opening, thickness, segments) {
  const loop = opening.boundary(segments);
  const inner = [], outer = [], centroid = new THREE.Vector3();

  for (const pt of loop) {
    const p = profile.at(pt.s);
    const c = Math.cos(pt.theta), sn = Math.sin(pt.theta);
    const nlen = Math.hypot(p.nr, p.ny) || 1;
    const nr = p.nr / nlen, ny = p.ny / nlen;
    const vIn = new THREE.Vector3(p.r * c, p.y, p.r * sn);
    const nOut = new THREE.Vector3(-nr * c, -ny, -nr * sn);   // away from the room
    inner.push(vIn);
    outer.push(vIn.clone().addScaledVector(nOut, thickness));
    centroid.add(vIn);
  }
  centroid.multiplyScalar(1 / loop.length);

  const pos = [], nrm = [], uv = [], index = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    // reveal faces the middle of the opening
    const toward = centroid.clone().sub(inner[i]).normalize();
    for (const v of [inner[i], outer[i]]) {
      pos.push(v.x, v.y, v.z);
      nrm.push(toward.x, toward.y, toward.z);
    }
    uv.push(i / n * 4, 0, i / n * 4, 1);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % n) * 2, d = ((i + 1) % n) * 2 + 1;
    index.push(a, c, d, a, d, b);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return { geo, outer, centroid };
}

/** Flat disc closing the far end of a skylight well: this is the sky. */
function buildSkyCap(outer, thickness) {
  const centre = new THREE.Vector3();
  for (const v of outer) centre.add(v);
  centre.multiplyScalar(1 / outer.length);

  const pos = [], uv = [], index = [];
  let maxR = 0;
  for (const v of outer) maxR = Math.max(maxR, v.distanceTo(centre));

  pos.push(centre.x, centre.y, centre.z);
  uv.push(0.5, 0.5);
  for (let i = 0; i < outer.length; i++) {
    const v = outer[i];
    pos.push(v.x, v.y, v.z);
    const d = v.clone().sub(centre);
    uv.push(0.5 + (d.x / maxR) * 0.5, 0.5 + (d.z / maxR) * 0.5);
  }
  for (let i = 0; i < outer.length; i++) {
    index.push(0, 1 + i, 1 + ((i + 1) % outer.length));
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, centre };
}

/* -------------------------------------------------------- sweep helpers -- */

/**
 * Sweeps a 2D profile (radial offset, height) around the vertical axis between
 * two angles. Used for the seating rings and the pool lip.
 */
function sweepProfile(pts, radius, a0, a1, segs, cap) {
  const pos = [], index = [];
  const n = pts.length;
  for (let i = 0; i <= segs; i++) {
    const t = a0 + (a1 - a0) * (i / segs);
    const c = Math.cos(t), s = Math.sin(t);
    for (const p of pts) pos.push((radius + p[0]) * c, p[1], (radius + p[0]) * s);
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n;
      const a = i * n + k, b = i * n + k2;
      const c = (i + 1) * n + k2, d = (i + 1) * n + k;
      index.push(a, b, c, a, c, d);
    }
  }
  if (cap) {
    for (const end of [0, segs]) {
      const base = end * n;
      for (let k = 1; k < n - 1; k++) {
        if (end === 0) index.push(base, base + k + 1, base + k);
        else index.push(base, base + k, base + k + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Outline of an arch: straight jambs, semicircular head. */
function archOutline(halfWidth, height, segs) {
  const shoulder = Math.max(0.01, height - halfWidth);
  const pts = [[-halfWidth, 0]];
  for (let i = 0; i <= segs; i++) {
    const t = Math.PI - (i / segs) * Math.PI;
    pts.push([halfWidth * Math.cos(t), shoulder + halfWidth * Math.sin(t)]);
  }
  pts.push([halfWidth, 0]);
  return pts;
}

/** Lofts a 2D outline along a straight direction, walls only, facing inward. */
function loftOutline(outline, origin, forward, right, up, depth) {
  const pos = [], nrm = [], uv = [], index = [];
  const n = outline.length;
  const place = (p, d) =>
    origin.clone()
      .addScaledVector(right, p[0])
      .addScaledVector(up, p[1])
      .addScaledVector(forward, d);

  for (let i = 0; i < n; i++) {
    const prev = outline[(i - 1 + n) % n], next = outline[(i + 1) % n];
    let tx = next[0] - prev[0], ty = next[1] - prev[1];
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    // inward normal of a counter-clockwise outline
    const nx = ty, ny = -tx;
    const normal = right.clone().multiplyScalar(nx).addScaledVector(up, ny).normalize();
    for (const d of [0, depth]) {
      const v = place(outline[i], d);
      pos.push(v.x, v.y, v.z);
      nrm.push(normal.x, normal.y, normal.z);
    }
    uv.push((i / n) * 3, 0, (i / n) * 3, depth / 3);
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2 + 1, d = (i + 1) * 2;
    index.push(a, c, b, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

/* ------------------------------------------------------------ triplanar -- */

/**
 * Projects the concrete maps from world space on all three axes and blends by
 * the surface normal.
 *
 * A revolved shell cannot be UV-mapped cleanly: scale the coordinate by the
 * true local circumference and the texture shears as the dome narrows; keep
 * the scale fixed and it compresses instead. Either way the noise smears into
 * radial streaks around the oculus. Projecting from world space sidesteps the
 * parameterisation entirely — and it gives the swept seating, which carries no
 * UVs at all, a real surface for free.
 */
export function makeTriplanar(material, scale) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTriScale = { value: scale };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `
        #include <common>
        varying vec3 vTriPos;
        varying vec3 vTriNrm;
      `)
      .replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vTriPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        vTriNrm = normalize( mat3( modelMatrix ) * objectNormal );
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `
        #include <common>
        uniform float uTriScale;
        varying vec3 vTriPos;
        varying vec3 vTriNrm;

        vec3 triWeights() {
          vec3 w = pow( abs( normalize( vTriNrm ) ), vec3( 4.0 ) );
          return w / max( 1e-4, w.x + w.y + w.z );
        }
      `)
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec3 twD = triWeights();
          vec3 tpD = vTriPos / uTriScale;
          diffuseColor *= texture2D( map, tpD.zy ) * twD.x
                        + texture2D( map, tpD.xz ) * twD.y
                        + texture2D( map, tpD.xy ) * twD.z;
        #endif
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec3 twR = triWeights();
          vec3 tpR = vTriPos / uTriScale;
          roughnessFactor *= texture2D( roughnessMap, tpR.zy ).g * twR.x
                           + texture2D( roughnessMap, tpR.xz ).g * twR.y
                           + texture2D( roughnessMap, tpR.xy ).g * twR.z;
        #endif
      `);
  };
  material.customProgramCacheKey = () => 'triplanar' + scale;
  return material;
}

/* ------------------------------------------------------ reflective floor -- */

const FresnelReflectorShader = {
  name: 'FresnelReflectorShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    strength: { value: 0.17 },
    blur: { value: 3.1 }
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    varying vec4 vUvR;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4( position, 1.0 );
      vWorld = world.xyz;
      vUvR = textureMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float strength;
    uniform float blur;
    varying vec4 vUvR;
    varying vec3 vWorld;

    void main() {
      vec2 uv = vUvR.xy / vUvR.w;
      vec2 px = blur / vec2( textureSize( tDiffuse, 0 ) );
      // four cheap taps soften the mirror into a polished-floor sheen
      vec4 c  = texture2D( tDiffuse, uv + vec2(  px.x,  px.y ) );
      c      += texture2D( tDiffuse, uv + vec2( -px.x,  px.y ) );
      c      += texture2D( tDiffuse, uv + vec2(  px.x, -px.y ) );
      c      += texture2D( tDiffuse, uv + vec2( -px.x, -px.y ) );
      c *= 0.25;

      vec3 viewDir = normalize( cameraPosition - vWorld );
      float fres = pow( 1.0 - clamp( viewDir.y, 0.0, 1.0 ), 3.2 );
      float a = clamp( strength * ( 0.18 + fres * 1.5 ), 0.0, 0.85 );

      gl_FragColor = vec4( color * c.rgb, a );
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

/* ---------------------------------------------------------------- build -- */

export function buildSanctuary(textures, quality) {
  const group = new THREE.Group();
  group.name = 'sanctuary';

  const profile = buildProfile();
  const rings = quality.shellRings;
  const segs = quality.shellSegments;

  const openings = [];
  for (const s of SKYLIGHTS) openings.push(ellipseOpening(s, profile));
  for (const a of ALCOVES) openings.push(archOpening(a, profile));

  /* ---- materials ---- */
  const concrete = makeTriplanar(new THREE.MeshStandardMaterial({
    color: PALETTE.concrete,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    side: THREE.FrontSide
  }), 3.4);

  const interiorMat = makeTriplanar(new THREE.MeshStandardMaterial({
    color: 0x8e8a83,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.94,
    metalness: 0.0,
    side: THREE.DoubleSide
  }), 3.4);

  const revealMat = makeTriplanar(new THREE.MeshStandardMaterial({
    color: PALETTE.concreteDeep,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide
  }), 2.2);

  /* ---- shell ---- */
  const shell = new THREE.Mesh(buildShellMesh(profile, openings, rings, segs), concrete);
  shell.name = 'shell';
  shell.receiveShadow = true;
  shell.castShadow = false;
  group.add(shell);

  /* ---- skylight wells and their sky ---- */
  const skyMat = new THREE.MeshBasicMaterial({
    map: textures.sky,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const skylightLights = [];

  for (let i = 0; i < SKYLIGHTS.length; i++) {
    const o = openings[i];
    const { geo, outer, centroid } = buildReveal(profile, o, HALL.shellThickness, 128);
    const well = new THREE.Mesh(geo, revealMat);
    well.receiveShadow = true;
    group.add(well);

    const cap = buildSkyCap(outer, HALL.shellThickness);
    const capMesh = new THREE.Mesh(cap.geo, skyMat);
    group.add(capMesh);

    // remembered so main.js can hang a light shaft under the opening
    skylightLights.push({
      centre: cap.centre.clone(),
      aim: centroid.clone().sub(cap.centre).normalize(),
      spec: SKYLIGHTS[i]
    });
  }

  /* ---- oculus: the shaft the water falls from ---- */
  const rim = profile.rim;
  const shaftGeo = new THREE.CylinderGeometry(
    OCULUS.radius * 1.06, OCULUS.radius, OCULUS.shaftHeight, 96, 1, true
  );
  const shaft = new THREE.Mesh(shaftGeo, revealMat);
  shaft.position.set(0, rim.y + OCULUS.shaftHeight / 2, 0);
  shaft.material.side = THREE.DoubleSide;
  group.add(shaft);

  const oculusSky = new THREE.Mesh(
    new THREE.CircleGeometry(OCULUS.radius * 1.06, 96),
    new THREE.MeshBasicMaterial({ map: textures.skyBright, color: new THREE.Color(1.45, 1.45, 1.45), toneMapped: false, side: THREE.DoubleSide })
  );
  oculusSky.rotation.x = Math.PI / 2;
  oculusSky.position.set(0, rim.y + OCULUS.shaftHeight, 0);
  group.add(oculusSky);

  /* ---- floor ---- */
  const floorMat = new THREE.MeshStandardMaterial({
    color: PALETTE.floor,
    map: textures.floor.map,
    roughnessMap: textures.floor.roughnessMap,
    normalMap: textures.floor.normalMap,
    normalScale: new THREE.Vector2(0.22, 0.22),
    roughness: 0.34,
    metalness: 0.05
  });
  for (const t of [textures.floor.map, textures.floor.roughnessMap, textures.floor.normalMap]) {
    t.repeat.set(9, 9);
    t.needsUpdate = true;
  }

  const floorGeo = new THREE.RingGeometry(POOL.radius, HALL.radius + 0.4, 160, 6);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  let reflector = null;
  if (quality.floorReflection) {
    const shader = {
      name: FresnelReflectorShader.name,
      uniforms: THREE.UniformsUtils.clone(FresnelReflectorShader.uniforms),
      vertexShader: FresnelReflectorShader.vertexShader,
      fragmentShader: FresnelReflectorShader.fragmentShader
    };
    reflector = new Reflector(new THREE.RingGeometry(POOL.radius, HALL.radius + 0.4, 128, 4), {
      textureWidth: quality.reflectionSize,
      textureHeight: quality.reflectionSize,
      color: 0xb6b2ab,
      multisample: 0,
      shader
    });
    reflector.rotation.x = -Math.PI / 2;
    reflector.position.y = 0.004;
    reflector.material.transparent = true;
    reflector.material.depthWrite = false;
    reflector.renderOrder = 1;
    group.add(reflector);
  }

  /* ---- concentric seating ---- */
  // swept arcs carry no UVs, so this one has to be projected
  const benchMat = makeTriplanar(new THREE.MeshStandardMaterial({
    color: PALETTE.concreteDeep,
    map: textures.concrete.map,
    roughnessMap: textures.concrete.roughnessMap,
    roughness: 0.88,
    metalness: 0.0
  }), 1.7);
  const benchBands = [];
  for (const band of BENCHES) {
    const h = band.height, d = band.depth / 2, ch = 0.045;
    const section = [
      [-d, 0], [d, 0], [d, h - ch], [d - ch, h], [-d + ch, h], [-d, h - ch]
    ];
    for (const [a0, a1] of band.arcs) {
      const segs2 = Math.max(12, Math.round(Math.abs(a1 - a0) * 26));
      const mesh = new THREE.Mesh(sweepProfile(section, band.radius, a0, a1, segs2, true), benchMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      benchBands.push({ radius: band.radius, half: d + 0.05, a0, a1, height: h });
    }
  }

  /* ---- side chambers behind the arched doorways ---- */
  const chambers = [];
  for (let i = 0; i < ALCOVES.length; i++) {
    const spec = ALCOVES[i];
    const o = openings[SKYLIGHTS.length + i];

    // doorway reveal through the thickness of the wall
    const rv = buildReveal(profile, o, HALL.shellThickness, 96);
    const jamb = new THREE.Mesh(rv.geo, revealMat);
    jamb.receiveShadow = true;
    group.add(jamb);

    const c = Math.cos(spec.around), s = Math.sin(spec.around);
    const forward = new THREE.Vector3(c, 0, s);                 // outward, into the chamber
    const right = new THREE.Vector3(-s, 0, c);
    const up = new THREE.Vector3(0, 1, 0);
    const origin = new THREE.Vector3(
      HALL.radius * c, 0, HALL.radius * s
    ).addScaledVector(forward, HALL.shellThickness - 0.02);

    const outline = archOutline(spec.width / 2 + 0.22, spec.height + 0.22, 26);
    const walls = new THREE.Mesh(
      loftOutline(outline, origin, forward, right, up, spec.depth),
      interiorMat
    );
    walls.receiveShadow = true;
    group.add(walls);

    // back wall
    const backShape = new THREE.Shape();
    backShape.moveTo(outline[0][0], outline[0][1]);
    for (let k = 1; k < outline.length; k++) backShape.lineTo(outline[k][0], outline[k][1]);
    backShape.closePath();
    const back = new THREE.Mesh(new THREE.ShapeGeometry(backShape, 24), interiorMat);
    back.geometry.rotateY(Math.PI);
    back.position.copy(origin).addScaledVector(forward, spec.depth);
    back.lookAt(back.position.clone().addScaledVector(forward, 1));
    back.receiveShadow = true;
    group.add(back);

    // chamber floor — run it back under the doorway so no gap opens up
    // where it meets the floor of the hall
    const chDepth = spec.depth + HALL.shellThickness + 1.2;
    const chGeo = new THREE.PlaneGeometry(spec.width + 0.9, chDepth);
    chGeo.rotateX(-Math.PI / 2);
    const chFloor = new THREE.Mesh(chGeo, floorMat);
    chFloor.rotation.y = Math.PI / 2 - spec.around;
    chFloor.position.copy(origin)
      .addScaledVector(forward, spec.depth / 2 - HALL.shellThickness / 2 - 0.6);
    chFloor.position.y = 0.002;
    chFloor.receiveShadow = true;
    group.add(chFloor);

    chambers.push({
      spec, forward, right, origin,
      centre: origin.clone().addScaledVector(forward, spec.depth / 2)
    });
  }

  return {
    group, profile, openings, reflector,
    materials: { concrete, interiorMat, revealMat, floorMat, benchMat, skyMat },
    skylightLights,
    chambers,
    benchBands,
    oculusRimY: rim.y,
    sweepProfile
  };
}

export { sweepProfile, wrapAngle };
