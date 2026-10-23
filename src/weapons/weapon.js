// Per-actor weapon state: ammo, fire timing, reloads, spray index and spread bloom.

import { WEAPONS } from './defs.js';
import { PHYS } from '../config.js';
import { clamp, lerp } from '../util.js';

export class WeaponState {
  constructor(id) {
    this.def = WEAPONS[id];
    this.id = id;
    this.ammo = this.def.mag;
    this.reserve = this.def.reserve;
    this.cooldown = 0;
    this.reloadT = 0; // time left on the current reload (or current shell)
    this.shotIndex = 0; // position in the recoil pattern
    this.bloom = 0; // extra spread from sustained fire
    this.sinceShot = 10;
    this.boltT = 0; // sniper bolt cycling
  }

  get reloading() {
    return this.reloadT > 0;
  }

  canReload() {
    const d = this.def;
    return d.mag > 0 && this.ammo < d.mag && this.reserve > 0 && !this.reloading;
  }

  startReload() {
    if (!this.canReload()) return false;
    this.reloadT = this.def.reload;
    if (this.def.shellReload) this.reloadT += 0.25; // lead-in before the first shell
    return true;
  }

  cancelReload() {
    this.reloadT = 0;
  }

  // Returns 'shell' / 'done' events so the owner can play sounds.
  update(dt) {
    const d = this.def;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.boltT = Math.max(0, this.boltT - dt);
    this.sinceShot += dt;
    this.bloom = Math.max(0, this.bloom - d.spread.recover * dt * (this.sinceShot > 0.12 ? 1 : 0.25));
    if (this.sinceShot > (60 / d.rpm) * 1.6) this.shotIndex = Math.max(0, this.shotIndex - dt * 14);
    let ev = null;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        if (d.shellReload) {
          this.ammo++;
          this.reserve--;
          ev = 'shell';
          if (this.ammo < d.mag && this.reserve > 0) this.reloadT = d.reload;
          else {
            this.reloadT = 0;
            ev = 'done';
          }
        } else {
          const need = d.mag - this.ammo;
          const take = Math.min(need, this.reserve);
          this.ammo += take;
          this.reserve -= take;
          this.reloadT = 0;
          ev = 'done';
        }
      }
    }
    return ev;
  }

  // Called after a shot leaves the barrel.
  onFired() {
    const d = this.def;
    this.ammo--;
    this.cooldown = 60 / d.rpm;
    this.sinceShot = 0;
    this.shotIndex++;
    this.bloom = Math.min(d.spread.max, this.bloom + d.spread.perShot);
    if (d.cls === 'sniper') this.boltT = 60 / d.rpm;
  }

  // Recoil kick for the shot just fired, in degrees [pitch, yaw].
  kick(rand = Math.random) {
    const r = this.def.recoil;
    const i = this.shotIndex;
    const climbing = i <= r.climb;
    const up = r.up * (climbing ? 1 : 0.3) * (0.85 + rand() * 0.3);
    // horizontal: slight wobble while climbing, then a left-right sway
    const sway = climbing ? (rand() - 0.5) * 0.6 : Math.sin((i - r.climb) * 0.55 + 0.8) * 1.4;
    const yaw = r.side * sway + (rand() - 0.5) * r.side * 0.3;
    return [up, yaw];
  }

  // Current cone half-angle in degrees for an actor.
  inaccuracy(actor) {
    const s = this.def.spread;
    const speed = Math.hypot(actor.vel.x, actor.vel.z);
    const moveFrac = clamp((speed - 0.4) / PHYS.runSpeed, 0, 1.4);
    let a = s.base + s.move * moveFrac + (actor.grounded ? 0 : s.air) + this.bloom;
    if (actor.crouching && actor.grounded) a *= s.crouch;
    if (this.def.scope) {
      // snipers are only accurate fully scoped
      a = actor.adsT > 0.95 ? lerp(s.base, s.base * s.ads, 1) + s.move * moveFrac * 0.6 + (actor.grounded ? 0 : s.air) : a;
    } else {
      a *= lerp(1, s.ads, actor.adsT);
    }
    return a;
  }
}
