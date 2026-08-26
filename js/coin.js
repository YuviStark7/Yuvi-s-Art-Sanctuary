/**
 * Coins thrown into the pool.
 *
 * A coin arcs from the figure's hand, breaks the surface, sinks, and stays
 * there. They accumulate on the basin floor, so a visitor who arrives later
 * sees that other people have been here before them.
 */
import * as THREE from 'three';
import { POOL, ISLAND, WISHING } from './config.js';

const G = 9.81;
const REST_Y = POOL.waterLevel - POOL.depth + 0.014;
const MAX_COINS = 80;

function coinGeometry(r, thickness) {
  return new THREE.CylinderGeometry(r, r, thickness, 30, 1);
}

export class CoinPool {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'coins';
    this.active = [];
    this.settled = [];
    this.onSplash = null;

    const ring = new THREE.MeshStandardMaterial({
      color: 0xb99a5c, metalness: 1.0, roughness: 0.34
    });
    const core = new THREE.MeshStandardMaterial({
      color: 0xc9cbc8, metalness: 1.0, roughness: 0.30
    });
    this.materials = { ring, core };

    const r = WISHING.coinRadius;
    this._ringGeo = coinGeometry(r, 0.0022);
    this._coreGeo = coinGeometry(r * 0.66, 0.0026);
  }

  _makeCoin() {
    const g = new THREE.Group();
    const outer = new THREE.Mesh(this._ringGeo, this.materials.ring);
    const inner = new THREE.Mesh(this._coreGeo, this.materials.core);
    g.add(outer, inner);
    return g;
  }

  /** Throws a coin from a point in the world toward the water. */
  toss(from, aimAt) {
    const coin = this._makeCoin();
    coin.position.copy(from);
    this.group.add(coin);

    const target = aimAt ? aimAt.clone() : this._randomTarget();
    const flight = WISHING.flightTime * (0.9 + Math.random() * 0.2);

    this.active.push({
      mesh: coin,
      state: 'flight',
      t: 0,
      flight,
      from: from.clone(),
      to: target,
      arc: WISHING.arcHeight * (0.85 + Math.random() * 0.3),
      spin: new THREE.Vector3(
        6 + Math.random() * 7,
        2 + Math.random() * 4,
        9 + Math.random() * 8
      ),
      sinkT: 0,
      sinkDur: 1.5 + Math.random() * 0.9,
      restTilt: (Math.random() - 0.5) * 0.5,
      restSpin: Math.random() * Math.PI * 2
    });

    if (this.active.length + this.settled.length > MAX_COINS) this._retireOldest();
    return coin;
  }

  /** A believable place for a coin to land: the water, clear of the island. */
  _randomTarget() {
    const a = Math.random() * Math.PI * 2;
    const inner = ISLAND.radius + 0.35;
    const outer = POOL.radius - 0.55;
    const r = inner + Math.random() * Math.max(0.2, outer - inner);
    return new THREE.Vector3(Math.cos(a) * r, POOL.waterLevel, Math.sin(a) * r);
  }

  /** Where a coin thrown from here should land — ahead of the thrower. */
  aimFrom(position, facing) {
    const fx = -Math.sin(facing), fz = -Math.cos(facing);
    const inner = ISLAND.radius + 0.40;
    const outer = POOL.radius - 0.60;

    for (let i = 0; i < 14; i++) {
      const reach = 1.6 + Math.random() * 3.4;
      const spread = (Math.random() - 0.5) * 1.5;
      const x = position.x + fx * reach - fz * spread;
      const z = position.z + fz * reach + fx * spread;
      const r = Math.hypot(x, z);
      if (r > inner && r < outer) return new THREE.Vector3(x, POOL.waterLevel, z);
    }
    return this._randomTarget();
  }

  _retireOldest() {
    const old = this.settled.shift();
    if (old) {
      this.group.remove(old);
      // geometry and materials are shared, so only the group goes
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];

      if (c.state === 'flight') {
        c.t += dt;
        const k = Math.min(1, c.t / c.flight);
        c.mesh.position.lerpVectors(c.from, c.to, k);
        c.mesh.position.y += c.arc * 4 * k * (1 - k);        // a clean parabola
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;

        if (k >= 1) {
          c.state = 'sinking';
          if (this.onSplash) this.onSplash(c.to.clone());
        }

      } else if (c.state === 'sinking') {
        c.sinkT += dt / c.sinkDur;
        const k = Math.min(1, c.sinkT);
        const fall = k * k * (3 - 2 * k);                    // water slows it
        c.mesh.position.y = POOL.waterLevel + (REST_Y - POOL.waterLevel) * fall;
        // flutter down like a real coin does
        const flutter = (1 - k) * 0.9;
        c.mesh.rotation.x += c.spin.x * dt * flutter * 0.35;
        c.mesh.rotation.z += c.spin.z * dt * flutter * 0.35;
        c.mesh.position.x += Math.sin(c.sinkT * 7 + c.restSpin) * dt * 0.06 * flutter;
        c.mesh.position.z += Math.cos(c.sinkT * 6 + c.restSpin) * dt * 0.06 * flutter;

        if (k >= 1) {
          c.mesh.rotation.set(c.restTilt * 0.4, c.restSpin, c.restTilt);
          c.mesh.position.y = REST_Y;
          this.settled.push(c.mesh);
          this.active.splice(i, 1);
        }
      }
    }
  }

  /** Drops a few coins in without ceremony, so the pool is never quite empty. */
  seed(count) {
    for (let i = 0; i < count; i++) {
      const coin = this._makeCoin();
      const t = this._randomTarget();
      coin.position.set(t.x, REST_Y, t.z);
      coin.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
      this.group.add(coin);
      this.settled.push(coin);
    }
  }

  dispose() {
    this._ringGeo.dispose();
    this._coreGeo.dispose();
    this.materials.ring.dispose();
    this.materials.core.dispose();
  }
}
