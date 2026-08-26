/**
 * A slow, hands-off walk through the sanctuary, for visitors who would rather
 * watch than drive. Any keyboard or mouse input hands control straight back.
 */
import * as THREE from 'three';
import { PLAYER, POOL, HALL, ALCOVES } from './config.js';

const EYE = PLAYER.eyeHeight;

function stop(x, z, lx, ly, lz, dwell) {
  return {
    pos: new THREE.Vector3(x, EYE, z),
    look: new THREE.Vector3(lx, ly, lz),
    dwell: dwell === undefined ? 2.4 : dwell
  };
}

export function defaultStops(interactables, oculusRimY) {
  const stops = [
    // arrive, take in the room
    stop(0, 12.6, 0, 2.6, 0, 3.6),
    // drift toward the water
    stop(-4.2, 9.6, 0, 2.2, 0, 2.0),
    // stand at the pool edge and look up the falling sheet
    stop(-6.9, 6.4, 0, 5.4, 0, 4.2),
    // let the eye climb to the opening
    stop(-8.4, 3.0, 0, oculusRimY + 2.0, 0, 3.4),
    // round the far side
    stop(-8.8, -3.6, 0, 1.9, 0, 2.2),
    stop(-3.6, -8.4, 0, 2.4, 0, 2.4),
    // out toward the wall and the work hung on it
    stop(4.4, -10.2, 12.0, 1.7, -6.0, 3.2),
    stop(9.4, -6.2, 14.4, 1.7, 0.6, 3.4),
    // back in along the seating
    stop(8.0, 2.4, 0, 2.0, 0, 2.6),
    stop(2.6, 8.2, 0, 3.2, 0, 3.0)
  ];

  // finish facing whichever piece is nearest the last stop
  if (interactables && interactables.length) {
    let best = null, bestD = Infinity;
    const last = stops[stops.length - 1].pos;
    for (const it of interactables) {
      const d = it.focus.distanceTo(last);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best) {
      stops.push({
        pos: best.focus.clone(),
        look: best.centre.clone(),
        dwell: 4.0
      });
    }
  }
  return stops;
}

export class Tour {
  constructor(player, stops) {
    this.player = player;
    this.stops = stops;
    this.curve = new THREE.CatmullRomCurve3(stops.map((s) => s.pos), true, 'catmullrom', 0.35);
    this.active = false;
    this.index = 0;
    this.t = 0;
    this.phase = 'dwell';
    this.speed = 0.95;                 // metres per second, deliberately slow
    this._look = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this.onEnd = null;
  }

  start(fromCurrent) {
    this.active = true;
    this.index = 0;
    this.t = 0;
    this.phase = fromCurrent ? 'approach' : 'dwell';
    this._look.copy(this.stops[0].look);
  }

  stop() {
    this.active = false;
    if (this.onEnd) this.onEnd();
  }

  update(dt) {
    if (!this.active) return;
    const n = this.stops.length;
    const a = this.stops[this.index];
    const b = this.stops[(this.index + 1) % n];

    if (this.phase === 'approach') {
      // ease in from wherever the visitor was standing
      this.t += dt / 2.4;
      const k = this._ease(Math.min(1, this.t));
      this._pos.lerpVectors(this.player.position, a.pos, k);
      this._look.lerp(a.look, Math.min(1, dt * 1.6));
      if (this.t >= 1) { this.phase = 'dwell'; this.t = 0; }
    } else if (this.phase === 'dwell') {
      this.t += dt;
      this._pos.copy(a.pos);
      this._look.lerp(a.look, Math.min(1, dt * 1.1));
      if (this.t >= a.dwell) { this.phase = 'move'; this.t = 0; }
    } else {
      const span = a.pos.distanceTo(b.pos);
      const dur = Math.max(2.0, span / this.speed);
      this.t += dt / dur;
      const k = this._ease(Math.min(1, this.t));
      // follow the smoothed loop rather than a straight line
      const u = ((this.index + k) % n) / n;
      this.curve.getPoint(u, this._pos);
      this._pos.y = EYE;
      this._look.lerpVectors(a.look, b.look, k);
      if (this.t >= 1) {
        this.phase = 'dwell';
        this.t = 0;
        this.index = (this.index + 1) % n;
      }
    }

    this._keepOutOfWater();
    // remember which way the path is heading, for the body to face
    if (this._last) {
      const hx = this._pos.x - this._last.x, hz = this._pos.z - this._last.z;
      if (Math.hypot(hx, hz) > 0.002) this._heading = Math.atan2(-hx, -hz);
    } else this._last = new THREE.Vector3();
    this._last.copy(this._pos);
    this._apply(dt);
  }

  /** The spline can cut a corner across the pool; nudge it back out. */
  _keepOutOfWater() {
    const r = Math.hypot(this._pos.x, this._pos.z);
    const min = POOL.radius + POOL.lipWidth + 0.55;
    const max = HALL.radius - 0.7;
    if (r < min && r > 0.001) {
      this._pos.x *= min / r;
      this._pos.z *= min / r;
    } else if (r > max) {
      this._pos.x *= max / r;
      this._pos.z *= max / r;
    }
  }

  /**
   * Walks the figure along the path and lets the camera swing round to
   * whatever the stop is meant to be looking at.
   */
  _apply(dt) {
    const p = this.player;
    const prev = this._prev || (this._prev = p.position.clone());

    p.position.set(this._pos.x, 0, this._pos.z);

    // how fast the body is actually travelling, so the walk cycle matches
    const moved = Math.hypot(p.position.x - prev.x, p.position.z - prev.z);
    p.speed = moved / Math.max(1e-4, dt);
    prev.copy(p.position);

    const dir = this._look.clone().sub(this._pos);
    const camYaw = Math.atan2(-dir.x, -dir.z);
    const camPitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));

    // walking, the body follows the path; standing, it faces what we look at
    const bodyYaw = (moved > 0.0015 && this._heading !== undefined)
      ? this._heading
      : camYaw;

    const turn = (from, to, k) => {
      let d = to - from;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return from + d * k;
    };

    p.camYaw = turn(p.camYaw, camYaw, 0.05);
    p.camPitch += (camPitch - p.camPitch) * 0.05;
    p.facing = turn(p.facing, bodyYaw, 0.05);
    p.updateCamera(dt);
  }

  _ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}
