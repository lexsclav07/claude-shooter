// State shared by the player and bots: body, view, health, inventory, stats.

import * as THREE from 'three';
import { PHYS, MAX_HEALTH } from '../config.js';
import { CLASSES } from '../classes.js';
import { WeaponState } from '../weapons/weapon.js';
import { moveBody, bodyFits } from '../physics.js';
import { clamp, approach, lerp, dirFromAngles } from '../util.js';
import { Mascot } from './mascot.js';

let nextId = 1;

export const SLOT_ORDER = ['primary', 'secondary', 'melee', 'gadget', 'gadget2'];

export class Actor {
  constructor({ name, team, isPlayer = false }) {
    this.id = nextId++;
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.height = PHYS.standHeight;
    this.grounded = false;
    this.stepped = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.crouching = false;
    this.crouchT = 0;
    this.sprinting = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.lean = 0;
    this.adsT = 0;
    this.health = MAX_HEALTH;
    this.alive = false;
    this.respawnAt = 0;
    this.diedAt = 0;
    this.spawnProtect = 0;
    this.weapons = { primary: null, secondary: null, melee: null, gadget: null, gadget2: null };
    this.slot = 'primary';
    this.lastSlot = 'secondary';
    this.switchT = 0;
    this.cls = 'rifleman';
    this.frags = 1;
    this.smokes = 0;
    this.medkits = 2;
    this.healT = -1;
    this.throwT = -1;
    this.throwType = 'frag';
    this.vehicle = null; // the tank or jet this actor is driving / flying
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.headshots = 0;
    this.damageDealt = 0;
    this.streak = 0;
    this.damageLog = new Map();
    this.lastHurt = -10;
    this.lastShotTime = -10;
    this.stride = 0;
    this.airTime = 0;
    this.loadout = { cls: 'rifleman', primary: 'ak47', secondary: 'hipower' };
    // movement intent, written by the player controller or bot brain
    this.input = { x: 0, z: 0, jump: false, crouch: false, sprint: false, walk: false, lean: 0, ads: false };
    this.model = new Mascot(team, name);
    this.bot = null;
  }

  get weapon() {
    return this.weapons[this.slot];
  }

  eyeHeight() {
    return lerp(PHYS.eyeStand, PHYS.eyeCrouch, this.crouchT);
  }

  // Eye position including lean offset.
  eye(out) {
    out.copy(this.pos);
    out.y += this.eyeHeight();
    if (this.lean !== 0) {
      const off = this.lean * PHYS.leanDist * (this.leanClamp ?? 1);
      out.x += Math.cos(this.yaw) * off;
      out.z += -Math.sin(this.yaw) * off;
    }
    return out;
  }

  // View direction including recoil.
  aimDir(out) {
    return dirFromAngles(this.yaw + this.recoilYaw, this.pitch + this.recoilPitch, out);
  }

  // Total grenades of both kinds (used by pickups and the HUD).
  get grenades() {
    return this.frags + this.smokes;
  }

  giveLoadout(cls = this.loadout.cls) {
    const c = CLASSES[cls] && !CLASSES[cls].vehicle ? CLASSES[cls] : CLASSES.rifleman;
    this.cls = CLASSES[cls] ? cls : 'rifleman';
    const primary = c.primaries.includes(this.loadout.primary) ? this.loadout.primary : c.primaries[0];
    this.weapons.primary = new WeaponState(primary);
    this.weapons.secondary = new WeaponState(this.loadout.secondary || 'hipower');
    this.weapons.melee = new WeaponState('knife');
    this.weapons.gadget = c.gadget ? new WeaponState(c.gadget) : null;
    this.weapons.gadget2 = c.gadget2 ? new WeaponState(c.gadget2) : null;
    this.frags = c.frags;
    this.smokes = c.smokes;
    this.medkits = c.medkits;
    this.slot = 'primary';
    this.lastSlot = 'secondary';
    this.switchT = this.weapon.def.draw * 0.6;
    this.model.setGun(this.weapon.def.model);
  }

  switchTo(slot) {
    if (!this.weapons[slot] || slot === this.slot || this.healT >= 0 || this.throwT >= 0) return false;
    const w = this.weapon;
    if (w) w.cancelReload();
    this.lastSlot = this.slot;
    this.slot = slot;
    this.switchT = this.weapon.def.draw;
    this.adsT = Math.min(this.adsT, 0.3);
    this.model.setGun(this.weapon.def.model);
    return true;
  }

  spawn(p, yaw, cls) {
    this.pos.set(p[0], p[1] + 0.05, p[2]);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.health = MAX_HEALTH;
    this.alive = true;
    this.crouching = false;
    this.crouchT = 0;
    this.height = PHYS.standHeight;
    this.grounded = true;
    this.slideT = 0;
    this.lean = 0;
    this.adsT = 0;
    this.healT = -1;
    this.throwT = -1;
    this.damageLog.clear();
    this.streak = 0;
    this.vehicle = null;
    this.giveLoadout(cls);
  }

  // Integrates movement from this.input. Returns events: { landed, footstep, jumped }.
  move(world, dt) {
    const inp = this.input;
    const ev = { landed: 0, footstep: false, jumped: false };
    const w = this.weapon;
    const wasGrounded = this.grounded;

    // crouch / stand, with headroom check
    const wantCrouch = inp.crouch || this.slideT > 0;
    if (wantCrouch && !this.crouching) {
      this.crouching = true;
      this.height = PHYS.crouchHeight;
      if (!this.grounded) {
        // tuck legs in the air (crouch-jump)
        const lift = PHYS.standHeight - PHYS.crouchHeight;
        const p = this.pos.clone();
        p.y += lift;
        if (bodyFits(world, p, PHYS.crouchHeight)) {
          this.pos.y += lift;
          this.crouchT = Math.max(0, this.crouchT - lift / 0.37);
        }
      }
    } else if (!wantCrouch && this.crouching) {
      let p = this.pos;
      if (!this.grounded) {
        p = this.pos.clone();
        p.y -= PHYS.standHeight - PHYS.crouchHeight;
      }
      if (bodyFits(world, p, PHYS.standHeight)) {
        if (p !== this.pos) this.pos.copy(p);
        this.crouching = false;
        this.height = PHYS.standHeight;
      }
    }
    this.crouchT = approach(this.crouchT, this.crouching ? 1 : 0, dt * 7);

    // sprint only forward-ish, not crouched, not aiming
    const moving = Math.hypot(inp.x, inp.z) > 0.1;
    this.sprinting = inp.sprint && moving && !this.crouching && this.adsT < 0.3 && this.healT < 0 && (inp.forward ?? true);
    // slide: sprint then crouch
    this.slideCd = Math.max(0, this.slideCd - dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (inp.crouchPressed && this.grounded && hs > PHYS.runSpeed * 1.08 && this.slideCd <= 0 && this.slideT <= 0) {
      this.slideT = PHYS.slideTime;
      this.slideCd = PHYS.slideCooldown + PHYS.slideTime;
      const k = PHYS.slideSpeed / Math.max(hs, 0.01);
      this.vel.x *= k;
      this.vel.z *= k;
      this.crouching = true;
      this.height = PHYS.crouchHeight;
      ev.slide = true;
    }
    if (this.slideT > 0) {
      this.slideT -= dt;
      if (hs < PHYS.runSpeed * PHYS.crouchMult || inp.jump) this.slideT = 0;
    }

    let cap = PHYS.runSpeed * (w ? w.def.speed : 1);
    if (this.crouching) cap *= PHYS.crouchMult;
    else if (this.sprinting) cap *= PHYS.sprintMult;
    if (this.adsT > 0.5) cap *= PHYS.adsMult;
    if (this.healT >= 0) cap *= PHYS.healMult;
    if (inp.walk) cap *= 0.55;
    const wl = Math.min(1, Math.hypot(inp.x, inp.z));
    const wx = wl > 0 ? (inp.x / Math.max(wl, 1e-6)) * wl * cap : 0;
    const wz = wl > 0 ? (inp.z / Math.max(wl, 1e-6)) * wl * cap : 0;

    if (this.grounded) {
      if (this.slideT > 0) {
        // keep momentum, slight steering
        const f = Math.max(0, 1 - 2.2 * dt);
        this.vel.x = this.vel.x * f + wx * 0.6 * dt;
        this.vel.z = this.vel.z * f + wz * 0.6 * dt;
      } else {
        const dx = wx - this.vel.x;
        const dz = wz - this.vel.z;
        const dl = Math.hypot(dx, dz);
        const accel = (wl > 0.05 ? PHYS.groundAccel : PHYS.groundAccel * 0.9) * dt;
        if (dl > accel) {
          this.vel.x += (dx / dl) * accel;
          this.vel.z += (dz / dl) * accel;
        } else {
          this.vel.x = wx;
          this.vel.z = wz;
        }
      }
      if (inp.jump && !this.jumpHeld) {
        const p = this.pos.clone();
        p.y += 0.1;
        if (bodyFits(world, p, this.height)) {
          this.vel.y = PHYS.jumpSpeed;
          this.grounded = false;
          ev.jumped = true;
          this.slideT = 0;
        }
      }
    } else {
      // limited air control
      const ax = wx - this.vel.x;
      const az = wz - this.vel.z;
      const al = Math.hypot(ax, az);
      const step = PHYS.airAccel * dt;
      if (wl > 0.05 && al > 0) {
        this.vel.x += (ax / al) * Math.min(step, al);
        this.vel.z += (az / al) * Math.min(step, al);
      }
    }
    this.jumpHeld = inp.jump;

    const vy = this.vel.y;
    this.stepped = 0;
    moveBody(world, this, dt);
    if (!wasGrounded && this.grounded) ev.landed = -vy;
    if (!this.grounded) this.airTime += dt;
    else this.airTime = 0;

    // footsteps
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && sp > 0.8) {
      this.stride += sp * dt;
      const strideLen = this.sprinting ? 2.4 : 2.0;
      if (this.stride > strideLen) {
        this.stride = 0;
        ev.footstep = true;
      }
    }
    return ev;
  }

  // Lean (peek) with a wall check so you can't lean through walls.
  updateLean(world, target, dt) {
    if (this.sprinting || this.slideT > 0) target = 0;
    this.lean = approach(this.lean, target, dt * 5.5);
    this.leanClamp = 1;
    if (this.lean !== 0) {
      const s = Math.sign(this.lean);
      const dx = Math.cos(this.yaw) * s;
      const dz = -Math.sin(this.yaw) * s;
      const ey = this.pos.y + this.eyeHeight();
      const hit = world.raycast(this.pos.x, ey, this.pos.z, dx, 0, dz, PHYS.leanDist + 0.25, 'move');
      if (hit) this.leanClamp = clamp((hit.t - 0.25) / PHYS.leanDist / Math.abs(this.lean), 0, 1);
    }
  }
}
