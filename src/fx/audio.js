// All sounds are synthesised with WebAudio at runtime - no audio files.
// Positional sounds use distance attenuation, stereo panning and a low-pass
// filter for distance and for sounds heard through walls.

import { clamp } from '../util.js';

const GUNS = {
  rifleHeavy: { lp: 3400, decay: 0.17, thump: 115, tg: 0.85, crack: 0.5, tail: 0.55, gain: 1.0 },
  rifle: { lp: 4400, decay: 0.13, thump: 140, tg: 0.65, crack: 0.45, tail: 0.45, gain: 0.85 },
  smg: { lp: 5200, decay: 0.08, thump: 170, tg: 0.45, crack: 0.3, tail: 0.3, gain: 0.7 },
  pistol: { lp: 4800, decay: 0.09, thump: 190, tg: 0.5, crack: 0.35, tail: 0.3, gain: 0.7 },
  revolver: { lp: 3000, decay: 0.22, thump: 95, tg: 0.9, crack: 0.5, tail: 0.6, gain: 1.0 },
  shotgun: { lp: 2500, decay: 0.28, thump: 72, tg: 1.1, crack: 0.4, tail: 0.7, gain: 1.1 },
  sniper: { lp: 2900, decay: 0.42, thump: 58, tg: 1.2, crack: 0.9, tail: 1.1, gain: 1.25 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.listener = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
    this.volume = { master: 0.8, sfx: 1, ambient: 0.5 };
    this.occlusion = null;
    this.active = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    // gentle limiter so explosions + spray don't clip
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 6;
    this.comp.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.comp);
    this.amb = c.createGain();
    this.amb.connect(this.master);
    // noise buffers
    const len = c.sampleRate * 2;
    this.white = c.createBuffer(1, len, c.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) w[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      b[i] = last * 3.5;
    }
    this.applyVolume();
  }

  setVolume(v) {
    Object.assign(this.volume, v);
    this.applyVolume();
  }

  applyVolume() {
    if (!this.ctx) return;
    this.master.gain.value = this.volume.master;
    this.sfx.gain.value = this.volume.sfx;
    this.amb.gain.value = this.volume.ambient * 0.6;
  }

  setListener(pos, yaw) {
    const L = this.listener;
    L.x = pos.x;
    L.y = pos.y;
    L.z = pos.z;
    L.fx = -Math.sin(yaw);
    L.fz = -Math.cos(yaw);
  }

  // Output chain for a sound at an optional world position.
  _out(opts, ref = 6) {
    const c = this.ctx;
    const g = c.createGain();
    let vol = opts.volume ?? 1;
    let node = g;
    if (opts.pos) {
      const L = this.listener;
      const dx = opts.pos.x - L.x;
      const dy = opts.pos.y - L.y;
      const dz = opts.pos.z - L.z;
      const dist = Math.hypot(dx, dy, dz);
      const range = opts.range ?? 140;
      if (dist > range) return null;
      vol *= ref / (ref + Math.max(0, dist - ref) * 1.1);
      vol *= 1 - dist / range;
      const rx = -L.fz;
      const rz = L.fx;
      const pan = dist > 0.5 ? clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.85 : 0;
      let cutoff = 18000 - Math.min(1, dist / 90) * 14500;
      if (this.occlusion && dist > 2 && this.occlusion(opts.pos)) {
        cutoff = Math.min(cutoff, 900);
        vol *= 0.6;
      }
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      const p = c.createStereoPanner();
      p.pan.value = pan;
      g.connect(lp);
      lp.connect(p);
      p.connect(opts.bus || this.sfx);
      node = g;
    } else {
      g.connect(opts.bus || this.sfx);
    }
    if (vol < 0.003) return null;
    g.gain.value = vol;
    return node;
  }

  _noise(t, dest, { dur, type = 'lowpass', freq = 3000, q = 0.7, gain = 1, attack = 0.002, decay = dur, brown = false, sweepTo = null }) {
    if (!(gain > 0.001)) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  _tone(t, dest, { freq, to = null, dur, type = 'sine', gain = 0.5, attack = 0.003 }) {
    if (!(gain > 0.001)) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx;
    const t = c.currentTime + 0.005;
    const p = opts.pitch ?? 1;
    if (GUNS[name]) return this._gun(GUNS[name], t, opts);
    const ref = { step: 3, land: 3 }[name] ?? 6;
    const range = { step: 32, land: 30, bounce: 30, click: 15, reload: 18, glass: 70, explosion: 260, whiz: 10, knife: 15, knifeHit: 20, knifeWall: 20 }[name];
    const dest = this._out({ ...opts, range: opts.range ?? range }, ref);
    if (!dest) return;
    switch (name) {
      case 'step': {
        const s = opts.surface || 'hard';
        if (s === 'grass') this._noise(t, dest, { dur: 0.09, freq: 1100 * p, q: 0.8, gain: 0.35, decay: 0.08 });
        else if (s === 'wood') {
          this._noise(t, dest, { dur: 0.07, type: 'bandpass', freq: 520 * p, q: 1.6, gain: 0.6, decay: 0.07 });
          this._tone(t, dest, { freq: 110 * p, to: 70, dur: 0.06, gain: 0.25 });
        } else this._noise(t, dest, { dur: 0.06, type: 'bandpass', freq: 1500 * p, q: 1.1, gain: 0.45, decay: 0.05 });
        break;
      }
      case 'land':
        this._noise(t, dest, { dur: 0.12, freq: 700, gain: 0.5, decay: 0.12 });
        this._tone(t, dest, { freq: 90, to: 50, dur: 0.1, gain: 0.4 });
        break;
      case 'click':
        this._noise(t, dest, { dur: 0.02, type: 'highpass', freq: 3000, gain: 0.5, decay: 0.02 });
        break;
      case 'magOut':
        this._noise(t, dest, { dur: 0.05, type: 'bandpass', freq: 1800, q: 2, gain: 0.5, decay: 0.05 });
        this._tone(t + 0.01, dest, { freq: 900, dur: 0.04, type: 'square', gain: 0.05 });
        break;
      case 'magIn':
        this._noise(t, dest, { dur: 0.04, type: 'bandpass', freq: 2400, q: 2, gain: 0.6, decay: 0.04 });
        this._noise(t + 0.06, dest, { dur: 0.05, type: 'bandpass', freq: 1500, q: 2, gain: 0.5, decay: 0.05 });
        break;
      case 'bolt':
        this._noise(t, dest, { dur: 0.05, type: 'bandpass', freq: 2000, q: 3, gain: 0.5, decay: 0.05 });
        this._noise(t + 0.12, dest, { dur: 0.06, type: 'bandpass', freq: 1400, q: 3, gain: 0.6, decay: 0.06 });
        break;
      case 'pump':
        this._noise(t, dest, { dur: 0.07, type: 'bandpass', freq: 900, q: 2, gain: 0.7, decay: 0.07 });
        this._noise(t + 0.14, dest, { dur: 0.08, type: 'bandpass', freq: 1300, q: 2, gain: 0.8, decay: 0.07 });
        break;
      case 'shell':
        this._noise(t, dest, { dur: 0.05, type: 'bandpass', freq: 1700, q: 2.5, gain: 0.45, decay: 0.05 });
        break;
      case 'draw':
        this._noise(t, dest, { dur: 0.12, type: 'bandpass', freq: 2500, q: 1.2, gain: 0.18, decay: 0.12, sweepTo: 4000 });
        break;
      case 'knife':
        this._noise(t, dest, { dur: 0.16, type: 'bandpass', freq: 700, q: 1.5, gain: 0.5, decay: 0.15, sweepTo: 3600 });
        break;
      case 'knifeHit':
        this._tone(t, dest, { freq: 160, to: 60, dur: 0.1, gain: 0.7 });
        this._noise(t, dest, { dur: 0.08, freq: 900, gain: 0.6, decay: 0.08 });
        break;
      case 'knifeWall':
        this._tone(t, dest, { freq: 2600, dur: 0.12, gain: 0.25, type: 'triangle' });
        this._noise(t, dest, { dur: 0.04, type: 'highpass', freq: 2500, gain: 0.4, decay: 0.04 });
        break;
      case 'hit':
        this._tone(t, dest, { freq: 1900, dur: 0.035, gain: 0.25, type: 'triangle' });
        break;
      case 'headshot':
        this._tone(t, dest, { freq: 3100, dur: 0.22, gain: 0.25, type: 'sine' });
        this._tone(t, dest, { freq: 4650, dur: 0.15, gain: 0.12, type: 'sine' });
        break;
      case 'kill':
        this._tone(t, dest, { freq: 700, dur: 0.08, gain: 0.25, type: 'triangle' });
        this._tone(t + 0.07, dest, { freq: 1050, dur: 0.14, gain: 0.25, type: 'triangle' });
        break;
      case 'hurt':
        this._tone(t, dest, { freq: 85, to: 45, dur: 0.18, gain: 0.8 });
        this._noise(t, dest, { dur: 0.1, freq: 500, gain: 0.5, decay: 0.1 });
        break;
      case 'explosion':
        this._noise(t, dest, { dur: 1.4, freq: 1800, sweepTo: 160, gain: 1.4, decay: 1.4, brown: true });
        this._noise(t, dest, { dur: 0.25, freq: 4000, gain: 0.8, decay: 0.25 });
        this._tone(t, dest, { freq: 62, to: 28, dur: 0.9, gain: 1.2 });
        break;
      case 'bounce':
        this._tone(t, dest, { freq: 1300 + Math.random() * 400, dur: 0.06, gain: 0.25, type: 'triangle' });
        this._noise(t, dest, { dur: 0.03, type: 'bandpass', freq: 900, gain: 0.3, decay: 0.03 });
        break;
      case 'pin':
        this._tone(t, dest, { freq: 2200, dur: 0.05, gain: 0.15, type: 'triangle' });
        this._noise(t + 0.05, dest, { dur: 0.06, type: 'bandpass', freq: 1500, gain: 0.35, decay: 0.06 });
        break;
      case 'glass':
        for (let i = 0; i < 6; i++) {
          const tt = t + Math.random() * 0.25;
          this._noise(tt, dest, { dur: 0.06, type: 'bandpass', freq: 3000 + Math.random() * 4000, q: 4, gain: 0.5, decay: 0.08 });
          this._tone(tt, dest, { freq: 3500 + Math.random() * 3000, dur: 0.12, gain: 0.06 });
        }
        this._noise(t, dest, { dur: 0.15, type: 'highpass', freq: 2000, gain: 0.6, decay: 0.15 });
        break;
      case 'heal':
        for (let i = 0; i < 5; i++) this._noise(t + i * 0.09, dest, { dur: 0.06, type: 'bandpass', freq: 2600, q: 1.5, gain: 0.25, decay: 0.06 });
        this._tone(t + 0.2, dest, { freq: 520, to: 880, dur: 0.4, gain: 0.08 });
        break;
      case 'healDone':
        this._tone(t, dest, { freq: 660, dur: 0.12, gain: 0.15 });
        this._tone(t + 0.1, dest, { freq: 990, dur: 0.2, gain: 0.15 });
        break;
      case 'pickup':
        this._tone(t, dest, { freq: 520, dur: 0.08, gain: 0.18, type: 'triangle' });
        this._tone(t + 0.07, dest, { freq: 780, dur: 0.08, gain: 0.18, type: 'triangle' });
        this._tone(t + 0.14, dest, { freq: 1040, dur: 0.15, gain: 0.18, type: 'triangle' });
        break;
      case 'whiz':
        this._noise(t, dest, { dur: 0.13, type: 'bandpass', freq: 5000, q: 2, gain: 0.7, decay: 0.12, sweepTo: 1400 });
        break;
      case 'ui':
        this._tone(t, dest, { freq: 900, dur: 0.04, gain: 0.08, type: 'triangle' });
        break;
      case 'spawn':
        this._tone(t, dest, { freq: 440, dur: 0.2, gain: 0.08 });
        this._tone(t + 0.12, dest, { freq: 660, dur: 0.3, gain: 0.08 });
        break;
      case 'beep':
        this._tone(t, dest, { freq: 1200, dur: 0.07, gain: 0.12, type: 'square' });
        break;
      default:
        break;
    }
  }

  _gun(g, t, opts) {
    const dist = opts.pos
      ? Math.hypot(opts.pos.x - this.listener.x, opts.pos.y - this.listener.y, opts.pos.z - this.listener.z)
      : 0;
    const dest = this._out({ ...opts, range: 260, volume: (opts.volume ?? 1) * g.gain }, 10);
    if (!dest) return;
    const p = (opts.pitch ?? 1) * (0.96 + Math.random() * 0.08);
    const far = clamp(dist / 80, 0, 1);
    this._noise(t, dest, { dur: g.decay, freq: g.lp * p * (1 - far * 0.5), gain: 1.0, decay: g.decay });
    this._noise(t, dest, { dur: 0.02, type: 'highpass', freq: 3500, gain: g.crack * (1 - far), decay: 0.025 });
    this._tone(t, dest, { freq: g.thump * p, to: g.thump * 0.4, dur: 0.12, gain: g.tg, type: 'sine' });
    // echoey tail, more noticeable at range
    this._noise(t + 0.02, dest, { dur: g.tail, freq: 900, gain: 0.18 + far * 0.25, attack: 0.03, decay: g.tail, brown: true });
  }

  // Wind and the occasional bird.
  startAmbience() {
    if (!this.ctx || this.ambStarted) return;
    this.ambStarted = true;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.brown;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g = c.createGain();
    g.gain.value = 0.12;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg);
    lg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.amb);
    src.start();
    lfo.start();
    const bird = () => {
      if (!this.ctx) return;
      const t = c.currentTime + 0.05;
      const pan = c.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      const bg = c.createGain();
      bg.gain.value = 0.05 + Math.random() * 0.05;
      bg.connect(pan);
      pan.connect(this.amb);
      const n = 2 + Math.floor(Math.random() * 4);
      const base = 2400 + Math.random() * 1800;
      for (let i = 0; i < n; i++) {
        const tt = t + i * (0.09 + Math.random() * 0.08);
        this._tone(tt, bg, { freq: base * (0.9 + Math.random() * 0.3), to: base * (1.2 + Math.random() * 0.4), dur: 0.06 + Math.random() * 0.05, gain: 0.6 });
      }
      this.birdTimer = setTimeout(bird, 2500 + Math.random() * 7000);
    };
    bird();
  }
}
