/**
 * Ambient occlusion, worked out once at build time and written into vertex
 * colours.
 *
 * Screen space was tried first and never returned a usable buffer, but it was
 * the wrong shape of answer for this room anyway. Nothing in the building
 * moves — which is why its shadow map is drawn once and then frozen — so its
 * contact shading can be settled at load and cost nothing per frame after
 * that. The figure already shades itself this way in character.js, and the
 * canopy arrives pre-shaded from tools/extract-tree.mjs.
 *
 * The room is a known shape, so the occluders here are analytic rather than
 * traced. Each is one flat face: the wall, the floor, the side of a bench, the
 * inside of the pool basin. For a point in front of such a face there is a
 * closed form for how much of its sky the face hides — see `hidden()` — and
 * the same expression covers the floor beside a wall and the wall above the
 * floor, which is what lets a junction shade continuously round its own
 * corner instead of breaking along it.
 *
 * Range matters more than strength. True ambient occlusion in a closed room is
 * nearly black everywhere, because the room is closed; what reads as concrete
 * is a contact shadow about a metre deep with flat light beyond it. Widen the
 * range and the whole hall goes muddy.
 */
import * as THREE from 'three';
import { HALL, POOL, BENCHES, ALCOVES } from './config.js';

const TAU = Math.PI * 2;
const EPS = 1e-6;

/** The three numbers worth turning. Everything else follows from the room. */
export const AO = {
  range: 1.25,      // how far an occluder reaches, in metres
  strength: 0.62,   // how dark a face in full contact goes
  deepest: 0.42     // and how dark it may get once several occluders pile up
};

/**
 * The fraction of a point's cosine-weighted sky hidden by a large flat face
 * standing perpendicular to the surface it sits on, where `t` is the distance
 * to that face as a fraction of the range.
 *
 * Integrating the hemisphere over just the directions that reach the face
 * within the range gives this outright. It is a half at contact, because a
 * perpendicular face hides exactly half of what a point can see, and zero at
 * the range, so there is no edge where the shading stops.
 */
function hidden(t) {
  if (t <= 0) return 0.5;
  if (t >= 1) return 0;
  return (Math.PI / 2 - t * Math.sqrt(1 - t * t) - Math.asin(t)) / Math.PI;
}

/**
 * Turns one nearest-point measurement into an occlusion value. `s` is the true
 * distance to the nearest point of the face, `perp` the distance straight out
 * from it, `m` its normal on the open side, and `rise` how much of it stands
 * above the receiving point — a bench 40 cm tall hides far less sky than the
 * wall does from the same distance, and without that term every kerb in the
 * room shades like a cliff.
 */
function faceShade(s, perp, mx, my, mz, rise, nx, ny, nz) {
  const R = AO.range;
  if (s >= R) return 0;
  let a = hidden(s / R);

  /* How the receiver is turned relative to the face. Side-on it loses half its
   * sky, square on it loses nearly all of it, and lying in the same plane it
   * loses none — which is also what keeps a surface from shading itself, since
   * there the two normals are the same vector. */
  const k = -(nx * mx + ny * my + nz * mz);
  if (k <= 0) a *= 1 + k;
  else a += k * (1 - (s * s) / (R * R) - a);

  if (rise !== undefined) a *= (rise * rise) / (rise * rise + perp * perp + EPS);
  return a > 0 ? a : 0;
}

/* ----------------------------------------------------------- occluders -- */

/** A horizontal surface seen from above: the hall floor, the basin floor. */
function deck(y, outside) {
  return {
    at(px, py, pz, nx, ny, nz) {
      const dy = py - y;
      if (dy < 0 || dy >= AO.range) return 0;
      const out = outside(px, pz);
      return faceShade(Math.hypot(dy, out), dy, 0, 1, 0, undefined, nx, ny, nz);
    }
  };
}

/**
 * An upright face swept round the axis of the room: the wall, either side of a
 * bench, the inside of the basin. `facing` is +1 when the open side is outward
 * and -1 when it is inward; `a0`/`a1` limit it to an arc, and beyond the ends
 * the measurement falls back to the distance to the nearest point of the arc,
 * so a bench stops shading the floor past where it stops.
 */
function ring(radius, facing, base, top, a0, a1) {
  return {
    at(px, py, pz, nx, ny, nz) {
      if (py < base - AO.range || py > top + AO.range) return 0;
      const r = Math.hypot(px, pz) || EPS;
      let perp = facing * (r - radius);
      if (perp <= -EPS || perp >= AO.range) return 0;
      if (perp < 0) perp = 0;

      let lat = 0;
      if (a0 !== undefined) {
        const mid = (a0 + a1) / 2;
        let d = Math.atan2(pz, px) - mid;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        const over = Math.abs(d) - (a1 - a0) / 2;
        if (over > 0) lat = over * radius;
      }
      const dv = py < base ? base - py : (py > top ? py - top : 0);
      const s = Math.sqrt(perp * perp + lat * lat + dv * dv);
      const rise = Math.max(0, top - Math.max(py, base));
      return faceShade(s, perp, facing * px / r, 0, facing * pz / r, rise, nx, ny, nz);
    }
  };
}

/** A straight upright face: the sides and the back of a side chamber. */
function slab(ox, oz, mx, mz, ux, uz, u0, u1, base, top) {
  return {
    at(px, py, pz, nx, ny, nz) {
      if (py < base - AO.range || py > top + AO.range) return 0;
      const dx = px - ox, dz = pz - oz;
      let perp = dx * mx + dz * mz;
      if (perp <= -EPS || perp >= AO.range) return 0;
      if (perp < 0) perp = 0;

      const u = dx * ux + dz * uz;
      const lat = u < u0 ? u0 - u : (u > u1 ? u - u1 : 0);
      const dv = py < base ? base - py : (py > top ? py - top : 0);
      const s = Math.sqrt(perp * perp + lat * lat + dv * dv);
      const rise = Math.max(0, top - Math.max(py, base));
      return faceShade(s, perp, mx, 0, mz, rise, nx, ny, nz);
    }
  };
}

/**
 * Every face in the building that is worth shading against, built from the
 * same numbers architecture.js builds the geometry from.
 *
 * The wall is taken as the plain cylinder it is above the fillet at its foot
 * rather than as the fillet itself: a point on the fillet then lies in front
 * of the wall and above the floor, and picks up a share of each, which is the
 * gradient a filleted corner actually has.
 */
export function roomOccluders() {
  const list = [];

  // The floor, as one surface with the pool punched out of it. It carries on
  // past the wall into the chambers, which is exactly how it is built.
  const lip = POOL.radius + POOL.lipWidth;
  list.push(deck(0, (x, z) => Math.max(0, lip - Math.hypot(x, z))));
  list.push(ring(HALL.radius, -1, 0, HALL.wallHeight));

  for (const band of BENCHES) {
    for (const [a0, a1] of band.arcs) {
      list.push(ring(band.radius - band.depth / 2, -1, 0, band.height, a0, a1));
      list.push(ring(band.radius + band.depth / 2, 1, 0, band.height, a0, a1));
    }
  }

  // The basin: its wall shades its floor, and its floor shades its wall. Both
  // are read through the water, where the coins settle.
  list.push(ring(POOL.radius, -1, -POOL.depth, 0));
  list.push(deck(-POOL.depth, (x, z) => Math.max(0, Math.hypot(x, z) - (POOL.radius - 0.18))));

  for (const spec of ALCOVES) {
    const c = Math.cos(spec.around), s = Math.sin(spec.around);
    const ox = HALL.radius * c + (HALL.shellThickness - 0.02) * c;
    const oz = HALL.radius * s + (HALL.shellThickness - 0.02) * s;
    const rx = -s, rz = c;                       // across the doorway
    const half = spec.width / 2 + 0.22;
    // the side walls run back under the doorway, the way the chamber floor does
    const near = -HALL.shellThickness;
    list.push(slab(ox - rx * half, oz - rz * half, rx, rz, c, s, near, spec.depth, 0, spec.height));
    list.push(slab(ox + rx * half, oz + rz * half, -rx, -rz, c, s, near, spec.depth, 0, spec.height));
    list.push(slab(ox + c * spec.depth, oz + s * spec.depth, -c, -s, rx, rz, -half, half, 0, spec.height));
  }

  return list;
}

/* ---------------------------------------------------------------- bake -- */

/** How much sky is hidden at one point, from every face at once. */
export function occlusionAt(px, py, pz, nx, ny, nz, occluders) {
  let open = 1;
  for (const o of occluders) {
    const a = o.at(px, py, pz, nx, ny, nz);
    if (a > 0) open *= 1 - (a > 1 ? 1 : a);
  }
  return 1 - open;
}

/**
 * Writes the shading into the mesh's vertex colours. The mesh is measured
 * where it stands, not where its geometry was authored, because the chamber
 * floors are turned and pushed out to their doorways.
 *
 * `flip` is for a mesh whose normals face away from the side you look at — the
 * pool basin is revolved inside out and drawn double-sided — where shading it
 * by its own normals would bury every surface in the concrete behind it.
 */
export function bakeOcclusion(mesh, occluders, flip) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  if (!pos || !nrm) return mesh;

  mesh.updateMatrix();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrix);
  const v = new THREE.Vector3(), n = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
    n.fromBufferAttribute(nrm, i).applyMatrix3(normalMatrix).normalize();
    if (flip) n.negate();
    const ao = occlusionAt(v.x, v.y, v.z, n.x, n.y, n.z, occluders);
    const shade = 1 - Math.min(AO.deepest, AO.strength * ao);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return mesh;
}
