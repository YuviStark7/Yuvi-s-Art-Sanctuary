/**
 * The sound of the room, synthesised. No audio files ship with the gallery:
 * falling water is filtered noise, the room tone is a low rumble, and the
 * occasional drip is a short damped tone.
 *
 * The waterfall is positioned in space, so it swells as you approach the pool
 * and falls behind you when you walk into a side chamber.
 */
import * as THREE from 'three';

export class Ambience {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.volume = 0.55;
    this.nodes = {};
    this._dripTimer = null;
  }

  /** Must be called from a user gesture — browsers require it. */
  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    const ctx = new AC();
    this.ctx = ctx;
    this.started = true;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.nodes.master = master;

    /* a couple of seconds of white noise, looped */
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const makeNoise = () => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start();
      return src;
    };

    /* ---- the falling curtain: three noise bands in the pool's position ---- */
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 3.5;
    panner.rolloffFactor = 0.55;
    panner.maxDistance = 45;
    if (panner.positionX) {
      panner.positionX.value = 0;
      panner.positionY.value = 1.2;
      panner.positionZ.value = 0;
    } else {
      panner.setPosition(0, 1.2, 0);
    }
    panner.connect(master);
    this.nodes.panner = panner;

    const bands = [
      { f: 240, q: 0.7, g: 0.30 },   // the body of the fall
      { f: 1250, q: 0.55, g: 0.34 }, // the hiss of the sheet
      { f: 4200, q: 0.5, g: 0.13 }   // spray
    ];
    for (const b of bands) {
      const src = makeNoise();
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = b.f;
      filt.Q.value = b.q;
      const g = ctx.createGain();
      g.gain.value = b.g;
      src.connect(filt).connect(g).connect(panner);

      // slow breathing so the fall never sounds like static
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.045 + Math.random() * 0.09;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = b.g * 0.28;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
    }

    /* ---- room tone: a very low, very quiet rumble ---- */
    const room = makeNoise();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 110;
    const roomGain = ctx.createGain();
    roomGain.gain.value = 0.085;
    room.connect(lp).connect(roomGain).connect(master);

    /* ---- drips ---- */
    const drip = () => {
      if (!this.ctx || this.ctx.state === 'closed') return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const f = 620 + Math.random() * 1100;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(panner);
      osc.start(t);
      osc.stop(t + 0.26);
      this._dripTimer = setTimeout(drip, 900 + Math.random() * 3800);
    };
    this._dripTimer = setTimeout(drip, 1600);

    this.setVolume(this.volume);
  }

  setVolume(v) {
    this.volume = v;
    if (!this.ctx) return;
    const g = this.nodes.master.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.linearRampToValueAtTime(v, this.ctx.currentTime + 0.9);
  }

  /** Keeps the listener where the camera is, so the fall stays put in the room. */
  update(camera) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = camera.position;
    if (!this._fwd) this._fwd = new THREE.Vector3();
    const f = camera.getWorldDirection(this._fwd);

    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.setTargetAtTime(0, t, 0.02);
      L.upY.setTargetAtTime(1, t, 0.02);
      L.upZ.setTargetAtTime(0, t, 0.02);
    } else if (L.setPosition) {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /* ------------------------------------------------------------ one-shots */

  /** A short burst of filtered noise: a coin breaking the surface. */
  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1500, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.4);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.30, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp).connect(g).connect(this.nodes.panner || this.nodes.master);
    src.start(t);
  }

  /** Two clicks — the mirror going up, and coming back down. */
  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const tick = (at, freq, gain) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
      osc.connect(g).connect(this.nodes.master);
      osc.start(at);
      osc.stop(at + 0.06);
    };
    tick(t, 2400, 0.05);
    tick(t + 0.085, 1500, 0.035);
  }

  /** The soft knock of a glass being set down again. */
  sip() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.9;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, t);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    osc.connect(g).connect(this.nodes.master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  /** A small held chord when a wish is let go. */
  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [i, f] of [523.25, 783.99, 1046.5].entries()) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const at = t + i * 0.10;
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.2);
      osc.connect(g).connect(this.nodes.master);
      osc.start(at);
      osc.stop(at + 2.4);
    }
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}
