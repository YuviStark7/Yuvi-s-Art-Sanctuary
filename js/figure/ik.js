/**
 * Two-bone reach for an arm.
 *
 * The figure's actions are written as places a hand has to be — at the lips, at
 * the eye, out over the water — rather than as joint angles. That is what lets
 * one set of actions serve a man and a woman of different heights: the angles
 * differ, the destination does not.
 *
 * Every bone in the figure is world-aligned at rest (the build bakes the neutral
 * pose into the mesh), so a bone's rest direction toward its child is simply that
 * child's local position, and aiming it is a single shortest-arc rotation.
 */
import * as THREE from 'three';

const _pq = new THREE.Quaternion();
const _d = new THREE.Vector3();
const _S = new THREE.Vector3();
const _E = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _p = new THREE.Vector3();
const _T = new THREE.Vector3();

/** Rotate `bone` (in its parent's space) so `restDir` points along `dirWorld`. */
export function aim(bone, restDir, dirWorld) {
  bone.parent.getWorldQuaternion(_pq);
  _pq.invert();
  _d.copy(dirWorld).normalize().applyQuaternion(_pq);
  bone.quaternion.setFromUnitVectors(restDir, _d);
}

export class Arm {
  /** upper = shoulder joint, lower = elbow joint, hand = wrist joint */
  constructor(upper, lower, hand) {
    this.upper = upper; this.lower = lower; this.hand = hand;
    this.l1 = lower.position.length();                    // shoulder -> elbow
    this.l2 = hand.position.length();                     // elbow -> wrist
    this.restUpper = lower.position.clone().normalize();
    this.restLower = hand.position.clone().normalize();
  }

  get reachLength() { return this.l1 + this.l2; }

  /**
   * Put the wrist at `target` (world space). `pole` is a direction in world space the
   * elbow should lean toward. The wrist is clamped to what the arm can reach.
   */
  reach(target, pole) {
    this.upper.updateWorldMatrix(true, false);
    this.upper.getWorldPosition(_S);
    _T.copy(target);
    _axis.subVectors(_T, _S);
    let d = _axis.length();
    const max = this.l1 + this.l2 - 1e-3;
    const min = Math.abs(this.l1 - this.l2) + 1e-3;
    d = Math.min(max, Math.max(min, d));
    _axis.normalize();
    _T.copy(_S).addScaledVector(_axis, d);

    const a = (this.l1 * this.l1 - this.l2 * this.l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, this.l1 * this.l1 - a * a));
    _p.copy(pole).addScaledVector(_axis, -pole.dot(_axis));
    if (_p.lengthSq() < 1e-6) _p.set(0, 0, 1).addScaledVector(_axis, -_axis.z);
    _p.normalize();
    _E.copy(_S).addScaledVector(_axis, a).addScaledVector(_p, h);

    aim(this.upper, this.restUpper, _d.subVectors(_E, _S));
    this.upper.updateMatrixWorld(true);
    aim(this.lower, this.restLower, _d.subVectors(_T, _E));
    this.lower.updateMatrixWorld(true);
  }

  /** Wrist rotation about the hand's own long axis, in radians. */
  roll(angle, axis) {
    this.hand.quaternion.setFromAxisAngle(axis, angle);
  }
}
