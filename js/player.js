/**
 * Walking the room in third person.
 *
 * The figure moves relative to the camera and turns to face wherever it is
 * going; the camera rides a spring arm behind and slightly over its shoulder.
 *
 * Nothing is raycast. The room is a known shape — a cylinder capped by an
 * ellipsoidal dome, plus two rectangular chambers — so the camera arm is
 * shortened analytically until its end sits somewhere legal. That is exact,
 * costs nothing, and cannot tunnel through a wall the way a ray can.
 */
import * as THREE from 'three';
import { HALL, POOL, PLAYER, ALCOVES, CAMERA } from './config.js';

const TAU = Math.PI * 2;

function angleInArc(a, a0, a1) {
  let lo = a0, x = a;
  while (x < lo) x += TAU;
  while (x > lo + TAU) x -= TAU;
  return x >= lo && x <= a1;
}

function shortestAngle(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/** Height of the dome directly above a given distance from the centre. */
function ceilingAt(r) {
  const k = Math.min(0.999, r / HALL.radius);
  return HALL.wallHeight + HALL.domeRise * Math.sqrt(1 - k * k);
}

export class Player {
  constructor(camera, dom, world) {
    this.camera = camera;
    this.dom = dom;
    this.world = world;

    this.position = new THREE.Vector3(0, 0, 11.4);   // the feet, on the floor
    this.velocity = new THREE.Vector3();
    this.facing = 0;                                  // where the figure looks
    this.camYaw = 0;
    this.camPitch = CAMERA.pitch;
    this.camDist = CAMERA.distance;
    this._armDist = CAMERA.distance;

    this.sensitivity = 1.0;
    this.invertY = false;
    this.enabled = false;
    this.speed = 0;

    this.keys = Object.create(null);
    this.touchMove = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchLook = { active: false, id: -1, x: 0, y: 0 };

    this.autopilot = null;
    this.onInteract = null;
    this.onSecondary = null;
    this.onUse = null;

    this.dragging = false;
    this.dragX = 0;
    this.dragY = 0;
    this.dragTravel = 0;

    this._pivot = new THREE.Vector3();
    this._want = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._look = new THREE.Vector3();

    this._bind();
  }

  /* --------------------------------------------------------------- input */

  _bind() {
    const el = this.dom;

    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE' || e.code === 'Enter') { if (this.onInteract) this.onInteract(); }
      if (e.code === 'KeyG') { if (this.onUse) this.onUse(); }
      if (e.code === 'KeyF') { if (this.onSecondary) this.onSecondary(); }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };

    const look = (dx, dy, scale) => {
      const s = scale * this.sensitivity;
      this.camYaw -= dx * s;
      this.camPitch -= (this.invertY ? -1 : 1) * dy * s;
      this.camPitch = Math.max(CAMERA.minPitch, Math.min(CAMERA.maxPitch, this.camPitch));
      this.autopilot = null;
    };

    this._onMouseMove = (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === el) look(e.movementX, e.movementY, 0.0022);
      else if (this.dragging) {
        look(e.clientX - this.dragX, e.clientY - this.dragY, 0.0032);
        this.dragTravel += Math.abs(e.clientX - this.dragX) + Math.abs(e.clientY - this.dragY);
        this.dragX = e.clientX;
        this.dragY = e.clientY;
      }
    };
    this._onMouseDown = (e) => {
      if (!this.enabled || document.pointerLockElement === el) return;
      this.dragging = true;
      this.dragTravel = 0;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
    };
    this._onMouseUp = () => { this.dragging = false; };

    this._onWheel = (e) => {
      if (!this.enabled) return;
      this.camDist = Math.max(CAMERA.minDistance,
        Math.min(CAMERA.maxDistance, this.camDist + Math.sign(e.deltaY) * 0.32));
      e.preventDefault();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    el.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    el.addEventListener('wheel', this._onWheel, { passive: false });

    /* touch: left half drives, right half turns the camera */
    const half = () => window.innerWidth / 2;

    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX < half() && !this.touchMove.active) {
          this.touchMove = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        } else if (t.clientX >= half() && !this.touchLook.active) {
          this.touchLook = { active: true, id: t.identifier, x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.touchMove.active && t.identifier === this.touchMove.id) {
          this.touchMove.x = t.clientX; this.touchMove.y = t.clientY;
        } else if (this.touchLook.active && t.identifier === this.touchLook.id) {
          look(t.clientX - this.touchLook.x, t.clientY - this.touchLook.y, 0.0055);
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });

    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) this.touchMove = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
        if (t.identifier === this.touchLook.id) this.touchLook = { active: false, id: -1, x: 0, y: 0 };
      }
    };
    el.addEventListener('touchend', endTouch);
    el.addEventListener('touchcancel', endTouch);
  }

  requestLock() {
    if (!this.dom.requestPointerLock) return;
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* drag-to-look covers it */ }
  }

  releaseLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  /* ---------------------------------------------------- where you may go */

  canStand(x, z) {
    const r = Math.hypot(x, z);
    const pr = PLAYER.radius;

    let ok = r < HALL.radius - pr - 0.10 &&
             r > POOL.radius + POOL.lipWidth + pr - 0.06;

    if (ok) {
      for (const b of this.world.benchBands) {
        if (Math.abs(r - b.radius) < b.half + pr) {
          if (angleInArc(Math.atan2(z, x), b.a0 - 0.03, b.a1 + 0.03)) { ok = false; break; }
        }
      }
    }
    if (ok) return true;

    for (const a of ALCOVES) {
      const c = Math.cos(a.around), s = Math.sin(a.around);
      const dx = x - HALL.radius * c, dz = z - HALL.radius * s;
      const forward = dx * c + dz * s;
      const side = dx * -s + dz * c;
      if (forward > -1.5 && forward < a.depth + HALL.shellThickness - 0.45 &&
          Math.abs(side) < a.width / 2 - pr + 0.02) {
        return true;
      }
    }
    return false;
  }

  /** Somewhere the camera is allowed to sit: inside the dome, or a chamber. */
  _cameraFits(p) {
    const r = Math.hypot(p.x, p.z);
    if (r < HALL.radius - 0.30 && p.y > 0.32 && p.y < ceilingAt(r) - 0.22) return true;

    for (const a of ALCOVES) {
      const c = Math.cos(a.around), s = Math.sin(a.around);
      const dx = p.x - HALL.radius * c, dz = p.z - HALL.radius * s;
      const forward = dx * c + dz * s;
      const side = dx * -s + dz * c;
      if (forward > -1.0 && forward < a.depth + HALL.shellThickness - 0.30 &&
          Math.abs(side) < a.width / 2 + 0.10 &&
          p.y > 0.32 && p.y < a.height - 0.10) {
        return true;
      }
    }
    return false;
  }

  /* -------------------------------------------------------------- update */

  /** Walks the figure to a spot and turns it to face something. */
  flyTo(position, lookAt, seconds) {
    this.autopilot = {
      from: this.position.clone(),
      to: new THREE.Vector3(position.x, 0, position.z),
      fromFacing: this.facing,
      toFacing: Math.atan2(-(lookAt.x - position.x), -(lookAt.z - position.z)),
      t: 0,
      duration: seconds || 1.2
    };
  }

  update(dt) {
    if (this.autopilot) {
      const ap = this.autopilot;
      ap.t = Math.min(1, ap.t + dt / ap.duration);
      const k = ap.t < 0.5 ? 4 * ap.t ** 3 : 1 - Math.pow(-2 * ap.t + 2, 3) / 2;
      const prev = this.position.clone();
      this.position.lerpVectors(ap.from, ap.to, k);
      this.facing = ap.fromFacing + shortestAngle(ap.fromFacing, ap.toFacing) * k;
      this.speed = prev.distanceTo(this.position) / Math.max(1e-4, dt);
      if (ap.t >= 1) { this.autopilot = null; this.speed = 0; }
      this.updateCamera(dt);
      return;
    }

    /* what the visitor asked for, in screen terms */
    let fx = 0, fz = 0;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) fz -= 1;
    if (k.KeyS || k.ArrowDown) fz += 1;
    if (k.KeyA || k.ArrowLeft) fx -= 1;
    if (k.KeyD || k.ArrowRight) fx += 1;

    if (this.touchMove.active) {
      const dx = this.touchMove.x - this.touchMove.ox;
      const dy = this.touchMove.y - this.touchMove.oy;
      const mag = Math.min(1, Math.hypot(dx, dy) / 70);
      if (mag > 0.06) {
        const a = Math.atan2(dy, dx);
        fx += Math.cos(a) * mag;
        fz += Math.sin(a) * mag;
      }
    }

    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }

    /* translate it into the room, relative to where the camera is pointing */
    const sinY = Math.sin(this.camYaw), cosY = Math.cos(this.camYaw);
    const fwdX = -sinY, fwdZ = -cosY;          // camera forward on the floor
    const rgtX = cosY, rgtZ = -sinY;
    const mf = -fz;

    const dirX = fwdX * mf + rgtX * fx;
    const dirZ = fwdZ * mf + rgtZ * fx;
    const moving = Math.hypot(dirX, dirZ) > 0.02;

    const fast = k.ShiftLeft || k.ShiftRight;
    const speed = fast ? PLAYER.fastSpeed : PLAYER.walkSpeed;

    const accel = Math.min(1, PLAYER.accel * dt);
    this.velocity.x += (dirX * speed - this.velocity.x) * accel;
    this.velocity.z += (dirZ * speed - this.velocity.z) * accel;
    if (!moving) {
      const damp = Math.exp(-PLAYER.damping * dt);
      this.velocity.x *= damp;
      this.velocity.z *= damp;
    }

    const dx = this.velocity.x * dt;
    const dz = this.velocity.z * dt;
    let travelled = 0;

    if (Math.abs(dx) > 1e-6 && this.canStand(this.position.x + dx, this.position.z)) {
      this.position.x += dx; travelled += dx * dx;
    } else this.velocity.x *= 0.25;

    if (Math.abs(dz) > 1e-6 && this.canStand(this.position.x, this.position.z + dz)) {
      this.position.z += dz; travelled += dz * dz;
    } else this.velocity.z *= 0.25;

    this.speed = Math.sqrt(travelled) / Math.max(1e-4, dt);

    /* turn to face the way we are going */
    if (moving) {
      const want = Math.atan2(-dirX, -dirZ);
      this.facing += shortestAngle(this.facing, want) * Math.min(1, dt * CAMERA.turnRate);
    }

    this.updateCamera(dt);
  }

  /**
   * Places the camera on a spring arm behind the figure, shortening the arm
   * until its end is somewhere it is allowed to be.
   */
  updateCamera(dt) {
    const shoulder = CAMERA.shoulder;
    const cy = Math.cos(this.camYaw), sy = Math.sin(this.camYaw);

    this._pivot.set(
      this.position.x + cy * shoulder,
      this.position.y + CAMERA.pivotHeight,
      this.position.z - sy * shoulder
    );

    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fwd = this._want.set(-sy * cp, sp, -cy * cp);

    let d = this.camDist;
    for (let i = 0; i < 14; i++) {
      this._camPos.copy(this._pivot).addScaledVector(fwd, -d);
      if (this._cameraFits(this._camPos) || d <= CAMERA.minDistance * 0.6) break;
      d *= 0.86;
    }

    // ease the arm out, snap it in — pushing through a wall should feel instant
    const rate = d < this._armDist ? 1 : Math.min(1, dt * 5.5);
    this._armDist += (d - this._armDist) * rate;
    this._camPos.copy(this._pivot).addScaledVector(fwd, -this._armDist);

    this.camera.position.copy(this._camPos);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.camYaw;
    this.camera.rotation.x = this.camPitch;
  }

  /** Where the visitor is looking, for working out what they can reach. */
  eyePosition(target) {
    return target.set(this.position.x, this.position.y + 1.55, this.position.z);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    this.dom.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.dom.removeEventListener('wheel', this._onWheel);
  }
}

export { ceilingAt };
