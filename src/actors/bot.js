// Bot brain. Each bot perceives (sight cone + line of sight, hearing, being shot),
// decides what to do (roam / hold / engage / hunt / investigate / retreat / heal) and
// drives the same Actor + weapon code the player uses. Difficulty presets in config.js
// control reaction time, aim error, turn speed, spray control, strafing and more.

import * as THREE from 'three';
import { DIFFICULTY, MAX_HEALTH } from '../config.js';
import { makeCommand, updateActions } from './actions.js';
import { GRENADE } from '../weapons/defs.js';
import { PROJECTILES } from '../combat.js';
import { DEG, clamp, gaussian, wrapAngle, yawTo, rand, pick } from '../util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

// The enemy team's infantry spawn (car park / rec ground at the ends of the high street).
function inEnemySpawn(team, x, z) {
  const ex = team === 0 ? 1 : -1;
  return x * ex > 44 && x * ex < 66 && Math.abs(z) < 26;
}

// Where to look / shoot at an actor (their vehicle if they're driving one).
function aimPoint(t, out) {
  if (t.vehicle) {
    out.copy(t.vehicle.pos);
    if (t.vehicle.kind === 'tank') out.y += 1.3;
    return out;
  }
  return out.set(t.pos.x, t.pos.y + 1.0 - 0.37 * t.crouchT, t.pos.z);
}

const PRIMARY_WEIGHTS = [
  ['ak47', 30],
  ['l85', 25],
  ['mp5', 20],
  ['shotgun', 10],
  ['l96', 15],
];

export function randomLoadout() {
  const total = PRIMARY_WEIGHTS.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  let primary = 'ak47';
  for (const [id, w] of PRIMARY_WEIGHTS) {
    r -= w;
    if (r <= 0) {
      primary = id;
      break;
    }
  }
  return { primary, secondary: Math.random() < 0.7 ? 'hipower' : 'webley' };
}

export class BotBrain {
  constructor(game, actor, level) {
    this.game = game;
    this.a = actor;
    this.cmd = makeCommand();
    this.known = new Map();
    this.mode = 'roam';
    this.target = null;
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.holdT = 0;
    this.holdDir = null;
    this.senseT = Math.random() * 0.15;
    this.thinkT = Math.random() * 0.3;
    this.reactT = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.aimHead = false;
    this.aimRollT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.stopT = 0;
    this.crouchFire = false;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.progressT = 0;
    this.noise = null;
    this.lookYaw = actor.yaw;
    this.lookPitch = 0;
    this.glanceT = 0;
    this.repathT = 0;
    this.nadeT = 5 + Math.random() * 5;
    this.wantNade = null;
    this.setSkill(level);
  }

  setSkill(level) {
    this.level = level;
    const base = DIFFICULTY[level] || DIFFICULTY.normal;
    const v = () => 0.88 + Math.random() * 0.24; // personal variation
    this.s = {
      ...base,
      reaction: base.reaction * v(),
      aimError: base.aimError * v(),
      settle: base.settle * v(),
      turnSpeed: base.turnSpeed * v(),
    };
  }

  onSpawn() {
    this.known.clear();
    this.mode = 'roam';
    this.target = null;
    this.path = null;
    this.goal = null;
    this.holdT = 0;
    this.noise = null;
    this.wantNade = null;
    this.reactT = 0;
    this.lookYaw = this.a.yaw;
    this.thinkT = 0.2 + Math.random() * 0.5;
    this.tankThreat = null;
    this.c4T = 0;
    this.mineT = rand(8, 20);
  }

  // Called by the game when this bot takes damage.
  onDamaged(attacker) {
    if (!attacker || attacker.team === this.a.team) return;
    const k = this._know(attacker);
    // being shot tells you roughly where it came from
    k.lastPos.copy(attacker.pos);
    k.time = this.game.time;
    k.seenFor = Math.max(k.seenFor, this.s.reaction * 0.5);
    k.alert = true;
    if (!this.target || !this._visible(this.target)) {
      this.target = attacker;
      this.reactT = Math.min(this.reactT || 1, this.s.reaction * 0.8);
      if (this.mode !== 'engage') this.mode = 'hunt';
    }
  }

  // Called by the game for gunshots, footsteps and explosions.
  onNoise(pos, radius, source, kind) {
    if (!this.a.alive || (source && source.team === this.a.team)) return;
    const d = pos.distanceTo(this.a.pos);
    if (d > radius * this.s.hearing) return;
    this.noise = { pos: pos.clone(), time: this.game.time, kind };
    if (source && (kind === 'shot' || kind === 'step') && d < radius * this.s.hearing * 0.6) {
      const k = this._know(source);
      if (!k.visible) {
        // rough idea of where they are
        k.lastPos.set(pos.x + (Math.random() - 0.5) * 3, pos.y, pos.z + (Math.random() - 0.5) * 3);
        k.time = this.game.time;
        k.heard = true;
      }
    }
  }

  _know(actor) {
    let k = this.known.get(actor.id);
    if (!k) {
      k = { actor, lastPos: actor.pos.clone(), time: -100, seenFor: 0, visible: false, alert: false, heard: false };
      this.known.set(actor.id, k);
    }
    return k;
  }

  _visible(actor) {
    const k = this.known.get(actor.id);
    return !!(k && k.visible);
  }

  // ------------------------------------------------------------------ perception

  _sense(interval) {
    const g = this.game;
    const a = this.a;
    const eye = a.eye(tmp);
    const fwdX = -Math.sin(a.yaw);
    const fwdZ = -Math.cos(a.yaw);
    const halfFov = (this.s.fov * DEG) / 2;
    for (const e of g.actors) {
      if (e.team === a.team) continue;
      const k = this._know(e);
      if (!e.alive) {
        k.visible = false;
        k.seenFor = 0;
        continue;
      }
      if (e.vehicle) {
        // tanks and jets are big and loud: spotted from much further away
        const tp = aimPoint(e, tmp2);
        const d = tp.distanceTo(eye);
        const vis = d < this.s.sight * (e.vehicle.kind === 'jet' ? 4 : 2.6) && g.world.clearLine(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z) && !g.combat.smokeBlocks(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z);
        if (vis) {
          k.seenFor += interval * 2;
          k.lastPos.copy(e.pos);
          k.time = g.time;
          k.visible = true;
          g.reportSighting(a.team, e);
        } else {
          k.visible = false;
          k.seenFor = Math.max(0, k.seenFor - interval);
        }
        continue;
      }
      const cy = e.pos.y + 1.0 - 0.37 * e.crouchT;
      const dx = e.pos.x - eye.x;
      const dy = cy - eye.y;
      const dz = e.pos.z - eye.z;
      const dist = Math.hypot(dx, dy, dz);
      let vis = false;
      if (dist < this.s.sight) {
        const ang = Math.acos(clamp((dx * fwdX + dz * fwdZ) / (Math.hypot(dx, dz) || 1), -1, 1));
        const inFov = ang < halfFov || dist < 2.2 || (k.visible && ang < halfFov + 0.5);
        if (inFov) {
          const hy = e.pos.y + 1.4 - 0.37 * e.crouchT;
          const ex = e.pos.x + Math.cos(e.yaw) * e.lean * 0.4;
          const ez = e.pos.z - Math.sin(e.yaw) * e.lean * 0.4;
          vis = g.world.clearLine(eye.x, eye.y, eye.z, ex, hy, ez) || g.world.clearLine(eye.x, eye.y, eye.z, e.pos.x, cy, e.pos.z);
          if (vis && g.combat.smokeBlocks(eye.x, eye.y, eye.z, e.pos.x, cy, e.pos.z)) vis = false;
          // far away, crouched and still targets are harder to notice
          if (vis && dist > 30 && e.crouching && Math.hypot(e.vel.x, e.vel.z) < 0.5 && !k.visible && Math.random() < 0.5) vis = false;
        }
      }
      if (vis) {
        const gain = interval * (dist < 12 ? 1.6 : 1) * (k.alert ? 1.5 : 1);
        k.seenFor += gain;
        k.lastPos.copy(e.pos);
        k.time = g.time;
        k.visible = true;
        k.heard = false;
        g.reportSighting(a.team, e);
      } else {
        k.visible = false;
        k.seenFor = Math.max(0, k.seenFor - interval * 0.6);
      }
    }
  }

  // What can this bot do about a vehicle? 'nlaw' | 'c4' | 'shoot' (jets) | null
  _antiVehicle(v, d) {
    const a = this.a;
    const gd = a.weapons.gadget;
    if (v.kind === 'tank') {
      if (gd && gd.def.cls === 'launcher' && gd.ammo + gd.reserve > 0 && d < 140) return 'nlaw';
      if (gd && gd.def.cls === 'c4' && d < 26 && (gd.ammo + gd.reserve > 0 || this.game.combat.countOwned(a, 'c4') > 0)) return 'c4';
      return null;
    }
    return d < 140 ? 'shoot' : null;
  }

  _pickTarget() {
    const a = this.a;
    let best = null;
    let bestScore = Infinity;
    this.tankThreat = null;
    for (const k of this.known.values()) {
      if (!k.visible || !k.actor.alive) continue;
      const d = k.actor.pos.distanceTo(a.pos);
      const veh = k.actor.vehicle;
      if (veh) {
        if (veh.kind === 'tank' && d < 60 && (!this.tankThreat || d < this.tankThreat.d)) this.tankThreat = { v: veh, d };
        if (!this._antiVehicle(veh, d)) continue;
      }
      let score = veh ? d * (veh.kind === 'jet' ? 2.2 : 0.8) : d;
      if (k.actor === this.target) score *= 0.6;
      // threats that are looking at us matter more
      const fx = -Math.sin(k.actor.yaw);
      const fz = -Math.cos(k.actor.yaw);
      const tx = a.pos.x - k.actor.pos.x;
      const tz = a.pos.z - k.actor.pos.z;
      if ((fx * tx + fz * tz) / (Math.hypot(tx, tz) || 1) > 0.9) score *= 0.75;
      if (score < bestScore) {
        bestScore = score;
        best = k.actor;
      }
    }
    return best;
  }

  _acquire(t) {
    if (this.target === t) return;
    const k = this.known.get(t.id);
    const recent = k && this.game.time - k.time < 1.2 && k.seenFor > 0.15;
    this.target = t;
    this.c4T = 0;
    const dist = t.pos.distanceTo(this.a.pos);
    this.reactT = recent ? this.s.reaction * 0.35 : this.s.reaction * rand(0.8, 1.25);
    const e = this.s.aimError * DEG * (1 + dist / 45) * (Math.hypot(this.a.vel.x, this.a.vel.z) > 1 ? 1.25 : 1);
    this.errYaw = gaussian() * e;
    this.errPitch = gaussian() * e * 0.55;
    this.aimHead = Math.random() < this.s.headshot;
    this.aimRollT = rand(0.8, 1.6);
    this.burstLeft = 0;
    this.burstPause = 0;
  }

  // ------------------------------------------------------------------ navigation

  _goTo(pos, kind = 'move') {
    const nav = this.game.nav;
    const a = this.a;
    // Half the time, avoid the open high street so bots also flank through gardens and back lanes.
    const flank = kind !== 'chase' && kind !== 'pickup' && Math.random() < 0.45;
    // avoid walking through the enemy spawn, and half the time avoid the open high street
    const penalty = (n) => {
      if (inEnemySpawn(a.team, nav.x[n], nav.z[n])) return 6;
      if (flank && nav.y[n] < 0.5 && Math.abs(nav.z[n]) < 6.5 && Math.abs(nav.x[n]) < 46) return 3;
      return 1;
    };
    const p = nav.pathBetween(a.pos.x, a.pos.y, a.pos.z, pos[0] ?? pos.x, pos[1] ?? pos.y, pos[2] ?? pos.z, penalty);
    this.goal = { pos: Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z], kind };
    if (!p || p.length === 0) {
      this.path = null;
      return false;
    }
    this.path = p;
    this.pathIdx = 0;
    this.progressT = 0;
    this.stuckT = 0;
    this.lastPos.copy(a.pos);
    return true;
  }

  _pathRemaining() {
    if (!this.path) return 0;
    let d = 0;
    const a = this.a;
    let px = a.pos.x;
    let pz = a.pos.z;
    for (let i = this.pathIdx; i < this.path.length; i++) {
      d += Math.hypot(this.path[i][0] - px, this.path[i][2] - pz);
      px = this.path[i][0];
      pz = this.path[i][2];
    }
    return d;
  }

  // Steering along the current path. Returns world-space direction or null when done.
  _follow(dt) {
    const a = this.a;
    if (!this.path) return null;
    const nav = this.game.nav;
    // skip ahead when we can walk straight to a later node
    this.skipT = (this.skipT ?? 0) - dt;
    if (this.skipT <= 0) {
      this.skipT = 0.25;
      for (let k = Math.min(this.path.length - 1, this.pathIdx + 4); k > this.pathIdx; k--) {
        const n = this.path[k];
        if (Math.abs(n[1] - a.pos.y) > 0.3) continue;
        if (nav.walk(a.pos.x, a.pos.y, a.pos.z, n[0], n[1], n[2])) {
          this.pathIdx = k;
          break;
        }
      }
    }
    let n = this.path[this.pathIdx];
    let dx = n[0] - a.pos.x;
    let dz = n[2] - a.pos.z;
    let d = Math.hypot(dx, dz);
    const last = this.pathIdx >= this.path.length - 1;
    const reach = last ? 0.45 : 0.55;
    if (d < reach && Math.abs(n[1] - a.pos.y) < 1.0) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) {
        this.path = null;
        return null;
      }
      n = this.path[this.pathIdx];
      dx = n[0] - a.pos.x;
      dz = n[2] - a.pos.z;
      d = Math.hypot(dx, dz);
    }
    // stuck detection
    this.progressT += dt;
    if (this.progressT > 0.8) {
      const moved = this.lastPos.distanceTo(a.pos);
      this.stuckT = moved < 0.35 ? this.stuckT + this.progressT : 0;
      this.lastPos.copy(a.pos);
      this.progressT = 0;
      if (this.stuckT > 1.5) {
        a.input.jump = true;
        if (this.stuckT > 3) {
          // give up on this route
          this.path = null;
          this.goal = null;
          this.stuckT = 0;
          return null;
        }
      }
    }
    if (d < 1e-4) return [0, 0];
    return [dx / d, dz / d];
  }

  _chooseRoamGoal() {
    const g = this.game;
    const nav = g.nav;
    const a = this.a;
    const enemySide = a.team === 0 ? 1 : -1; // +x for Opus, -x for Sonnet
    // join in on what teammates have seen recently - but don't all dogpile the same
    // sighting, and don't chase people back into their own spawn
    const intel = g.freshIntel(a.team, 8);
    if (intel && !intel.actor.vehicle && !inEnemySpawn(a.team, intel.pos.x, intel.pos.z) && Math.random() < 0.2 + this.s.aggression * 0.35) {
      let hunters = 0;
      for (const o of g.actors) if (o.bot && o !== a && o.team === a.team && o.bot.mode === 'hunt' && o.bot.huntId === intel.actor.id) hunters++;
      if (hunters < 2) {
        this._goTo(intel.pos, 'hunt');
        this.mode = 'hunt';
        this.huntId = intel.actor.id;
        this.huntUntil = g.time + 10;
        return;
      }
    }
    const sniper = a.weapon && a.weapon.def.cls === 'sniper';
    for (let attempt = 0; attempt < 12; attempt++) {
      let pos;
      let dir = null;
      if ((sniper || Math.random() < 0.3) && nav.spots.length && Math.random() < (sniper ? 0.85 : 0.5)) {
        const s = pick(nav.spots);
        if (sniper && s.kind !== 'upper' && Math.random() < 0.6) continue;
        pos = nav.pos(s.node);
        dir = s.dir;
      } else {
        pos = nav.pos(nav.randomNode());
      }
      // mostly fight in and around town, sometimes head out to the farms and woods
      const forward = pos[0] * enemySide;
      const inTown = Math.abs(pos[0]) < 64 && Math.abs(pos[2]) < 48;
      if (inEnemySpawn(a.team, pos[0], pos[2])) continue; // never camp the enemy spawn
      if (inTown && forward < -40 && Math.random() < 0.85) continue;
      if (!inTown && (Math.random() < 0.55 || forward < -120 || Math.abs(pos[0]) > 175)) continue;
      if (Math.hypot(pos[0] - a.pos.x, pos[2] - a.pos.z) < 8) continue;
      if (this._goTo(pos, dir ? 'spot' : 'move')) {
        this.holdDir = dir;
        this.mode = 'roam';
        return;
      }
    }
  }

  // ------------------------------------------------------------------ main update

  update(dt) {
    const g = this.game;
    const a = this.a;
    const cmd = this.cmd;
    cmd.fire = false;
    cmd.firePressed = false;
    cmd.reload = false;
    cmd.slot = null;
    cmd.grenade = false;
    cmd.smoke = false;
    cmd.heal = false;
    cmd.ads = false;
    cmd.adsPressed = false;
    cmd.detonate = false;
    a.input.jump = false;
    a.input.sprint = false;
    a.input.walk = false;
    a.input.crouchPressed = false;
    if (!a.alive) return;

    this.senseT -= dt;
    if (this.senseT <= 0) {
      const interval = 0.12;
      this.senseT = interval;
      this._sense(interval);
    }
    const t = this._pickTarget();
    if (t) {
      this._acquire(t);
      this.mode = 'engage';
    } else if (this.mode === 'engage') {
      // lost sight: chase the last known position (unless they ran home to their spawn)
      const k = this.target && this.known.get(this.target.id);
      if (k && !inEnemySpawn(a.team, k.lastPos.x, k.lastPos.z) && !this.target.vehicle) {
        this.mode = 'hunt';
        this.huntId = this.target.id;
        this.huntUntil = g.time + 4 + this.s.aggression * 6;
        this._goTo(k.lastPos, 'hunt');
      } else {
        this.mode = 'roam';
        this.target = null;
        this.path = null;
      }
    }

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.3 + Math.random() * 0.2;
      this._think();
    }

    let wish = null;
    let crouch = false;
    let lookAt = null;
    const w = a.weapon;

    if (this.mode === 'engage' && this.target) {
      const res = this.target.vehicle ? this._engageVehicle(dt) : this._engage(dt);
      wish = res.wish;
      crouch = res.crouch;
    } else {
      this.target = this.mode === 'hunt' ? this.target : null;
      wish = this._follow(dt);
      if (!wish && this.mode === 'roam') {
        // arrived: hold for a bit
        if (this.holdT <= 0) this.holdT = (w && w.def.cls === 'sniper' ? rand(8, 18) : rand(1.5, 6)) * (1.2 - this.s.aggression * 0.5);
        this.holdT -= dt;
        if (this.holdT <= 0) {
          this.holdDir = null;
          this._chooseRoamGoal();
        }
      }
      if (this.mode === 'hunt') {
        const k = this.target && this.known.get(this.target.id);
        if (k) lookAt = tmp2.set(k.lastPos.x, k.lastPos.y + 1.2, k.lastPos.z);
        if (!wish && (!this.huntUntil || g.time > this.huntUntil)) {
          this.mode = 'roam';
          this.target = null;
        } else if (!wish && k && !this.path) {
          // nothing there: look around a bit, then roam
          if (g.time > (this.huntUntil ?? 0) - 1) this.mode = 'roam';
        }
        // move quietly when close to where we think they are
        if (k && k.lastPos.distanceTo(a.pos) < 14 && this.s.aggression < 0.65) a.input.walk = true;
        this._maybeGrenade(k, dt);
      } else if (this.mode === 'investigate' && this.noise) {
        lookAt = tmp2.set(this.noise.pos.x, this.noise.pos.y + 1.2, this.noise.pos.z);
        if (!wish && g.time - this.noise.time > 3) this.mode = 'roam';
      } else if (this.mode === 'heal') {
        wish = null;
        crouch = true;
        if (a.healT < 0 && a.medkits > 0 && a.health < MAX_HEALTH) cmd.heal = true;
        if (a.medkits <= 0 || a.health >= MAX_HEALTH * 0.95) this.mode = 'roam';
      } else if (this.mode === 'retreat') {
        if (!wish) this.mode = a.medkits > 0 && a.health < 60 ? 'heal' : 'roam';
      }
      // sprint on long trips when nothing is around
      if (wish && this.mode === 'roam' && this._pathRemaining() > 14 && !this._threatNear(25)) a.input.sprint = true;
      if (wish && this.mode === 'retreat') a.input.sprint = true;
      this._lookAround(dt, wish, lookAt);
      // housekeeping when safe
      if (w && w.def.mag > 0 && w.ammo < w.def.mag * 0.35 && w.reserve > 0 && !this._threatNear(10)) cmd.reload = true;
      if (a.slot !== 'primary' && a.weapons.primary && (a.weapons.primary.ammo > 0 || a.weapons.primary.reserve > 0) && !this._threatNear(15) && !this.placing) cmd.slot = 'primary';
      this._maybeMine(dt);
    }

    // separation from teammates so they don't pile up in doorways
    if (wish) {
      let sx = 0;
      let sz = 0;
      for (const o of g.actors) {
        if (o === a || !o.alive || o.team !== a.team) continue;
        const dx = a.pos.x - o.pos.x;
        const dz = a.pos.z - o.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 1.6 && d2 > 1e-4 && Math.abs(a.pos.y - o.pos.y) < 1) {
          const d = Math.sqrt(d2);
          sx += (dx / d) * (1.3 - d);
          sz += (dz / d) * (1.3 - d);
        }
      }
      wish = [wish[0] + sx * 0.8, wish[1] + sz * 0.8];
      const l = Math.hypot(wish[0], wish[1]);
      if (l > 1) wish = [wish[0] / l, wish[1] / l];
    }

    a.input.x = wish ? wish[0] : 0;
    a.input.z = wish ? wish[1] : 0;
    a.input.forward = true;
    const wasCrouch = a.input.crouch;
    a.input.crouch = crouch;
    if (crouch && !wasCrouch) a.input.crouchPressed = false;
    a.input.lean = 0;
    updateActions(g, a, cmd, dt);
  }

  _threatNear(r) {
    for (const k of this.known.values()) {
      if (!k.actor.alive) continue;
      if (this.game.time - k.time < 4 && k.lastPos.distanceTo(this.a.pos) < r) return true;
    }
    return false;
  }

  _think() {
    const g = this.game;
    const a = this.a;
    // a tank we can't hurt is rolling towards us: get behind something solid
    if (this.tankThreat && this.mode !== 'retreat' && this.tankThreat.d < 50) {
      const v = this.tankThreat.v;
      if (this._findCoverFrom(v.pos)) {
        this.mode = 'retreat';
        if (a.smokes > 0 && this.tankThreat.d < 35 && Math.random() < 0.5) this._throwAt(v.pos, 'smoke');
        return;
      }
    }
    if (this.mode === 'engage') {
      // fall back when badly hurt and outgunned
      if (a.health < 30 && this.s.aggression < 0.8 && Math.random() < 0.35) {
        if (this._findCover()) this.mode = 'retreat';
      }
      return;
    }
    // heal when hurt and nobody is around
    if (a.health < 55 && a.medkits > 0 && !this._threatNear(18) && this.mode !== 'heal') {
      this.mode = 'heal';
      this.path = null;
      return;
    }
    // detour for a nearby health pack
    if (a.health < 60 && this.mode !== 'heal') {
      const hp = g.nearestPickup('health', a.pos, 18);
      if (hp && (!this.goal || this.goal.kind !== 'pickup')) {
        this._goTo(hp.pos, 'pickup');
        return;
      }
    }
    if (this.mode === 'roam' || this.mode === 'investigate') {
      if (this.noise && g.time - this.noise.time < 2.5 && (!this.goal || this.goal.kind !== 'noise')) {
        const d = this.noise.pos.distanceTo(a.pos);
        if (d > 6 && Math.random() < 0.4 + this.s.aggression * 0.5) {
          this._goTo(this.noise.pos, 'noise');
        } else {
          this.path = null;
        }
        this.mode = 'investigate';
        return;
      }
    }
    if (this.mode === 'roam' && !this.path && this.holdT <= 0) this._chooseRoamGoal();
    if (this.mode === 'hunt' && !this.path && this.target) {
      const k = this.known.get(this.target.id);
      if (k && k.lastPos.distanceTo(a.pos) > 2.5 && g.time < (this.huntUntil ?? 0)) this._goTo(k.lastPos, 'hunt');
    }
  }

  _findCover() {
    const k = this.target && this.known.get(this.target.id);
    if (!k) return false;
    return this._findCoverFrom(k.lastPos);
  }

  _findCoverFrom(threat) {
    const g = this.game;
    const a = this.a;
    const nav = g.nav;
    const cand = nav.near(a.pos.x, a.pos.z, 12, []);
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < Math.min(cand.length, 40); i++) {
      const n = cand[(Math.random() * cand.length) | 0];
      const x = nav.x[n];
      const y = nav.y[n];
      const z = nav.z[n];
      if (Math.abs(y - a.pos.y) > 3) continue;
      const d = Math.hypot(x - a.pos.x, z - a.pos.z);
      if (d < 2 || d > bestD) continue;
      if (g.world.clearLine(threat.x, threat.y + 1.3, threat.z, x, y + 1.2, z)) continue;
      // don't run towards the threat
      if (Math.hypot(x - threat.x, z - threat.z) < Math.hypot(a.pos.x - threat.x, a.pos.z - threat.z) - 1) continue;
      best = [x, y, z];
      bestD = d;
    }
    if (best) return this._goTo(best, 'cover');
    return false;
  }

  _lookAround(dt, wish, lookAt) {
    const a = this.a;
    let ty = this.lookYaw;
    let tp = 0;
    if (lookAt) {
      const e = a.eye(tmp);
      ty = yawTo(lookAt.x - e.x, lookAt.z - e.z);
      tp = Math.atan2(lookAt.y - e.y, Math.hypot(lookAt.x - e.x, lookAt.z - e.z));
    } else if (wish && (Math.abs(wish[0]) + Math.abs(wish[1]) > 0.1)) {
      // look a little ahead along the path
      let dx = wish[0];
      let dz = wish[1];
      if (this.path && this.pathIdx + 2 < this.path.length) {
        const n = this.path[this.pathIdx + 2];
        const ex = n[0] - a.pos.x;
        const ez = n[2] - a.pos.z;
        const l = Math.hypot(ex, ez);
        if (l > 1) {
          dx = dx * 0.5 + (ex / l) * 0.5;
          dz = dz * 0.5 + (ez / l) * 0.5;
        }
      }
      ty = yawTo(dx, dz);
      // occasional glance to the side
      this.glanceT -= dt;
      if (this.glanceT < 0) this.glanceT = rand(1.5, 4);
      if (this.glanceT < 0.5 && !a.sprinting) ty += Math.sin(this.glanceT * 6) * 0.6;
    } else if (this.holdDir) {
      ty = yawTo(this.holdDir[0], this.holdDir[1]);
      tp = -0.05;
      this.glanceT -= dt;
      if (this.glanceT < 0) this.glanceT = rand(2, 5);
      ty += Math.sin(this.game.time * 0.6 + this.a.id) * 0.45;
    } else {
      // idle scan towards the enemy side
      const enemySide = a.team === 0 ? 1 : -1;
      ty = yawTo(enemySide, Math.sin(this.game.time * 0.3 + a.id));
    }
    this.lookYaw = ty;
    const maxTurn = Math.min(this.s.turnSpeed, 300) * DEG * dt;
    const dy = wrapAngle(ty - a.yaw);
    a.yaw += clamp(dy * Math.min(1, dt * 6), -maxTurn, maxTurn);
    a.pitch += clamp((tp - a.pitch) * Math.min(1, dt * 5), -maxTurn, maxTurn);
  }

  _maybeGrenade(k, dt) {
    const a = this.a;
    const g = this.game;
    this.nadeT -= dt;
    if (!k || a.frags <= 0 || this.s.grenade <= 0 || a.throwT >= 0 || this.nadeT > 0) return;
    const d = k.lastPos.distanceTo(a.pos);
    const age = g.time - k.time;
    if (d < 8 || d > 28 || age > 4 || k.visible) return;
    this.nadeT = rand(6, 14);
    if (Math.random() > this.s.grenade) return;
    // lob it: solve the launch pitch for the throw speed
    const e = a.eye(tmp);
    const dx = k.lastPos.x - e.x;
    const dz = k.lastPos.z - e.z;
    const dy = k.lastPos.y + 0.3 - e.y;
    const h = Math.hypot(dx, dz);
    const v = GRENADE.throwSpeed * 0.95;
    const gg = 16;
    const disc = v ** 4 - gg * (gg * h * h + 2 * dy * v * v);
    if (disc < 0) return;
    const ang = Math.atan((v * v - Math.sqrt(disc)) / (gg * h));
    // must have a clear-ish arc: check the first few metres
    const yaw = yawTo(dx, dz);
    const cx = e.x - Math.sin(yaw) * 2;
    const cz = e.z - Math.cos(yaw) * 2;
    if (!g.world.clearLine(e.x, e.y, e.z, cx, e.y + Math.tan(ang) * 2, cz, 'bullet')) return;
    a.yaw = yaw;
    a.pitch = ang - 0.12;
    this.cmd.grenade = true;
    this.cmd.throwScale = 0.95;
  }

  _engage(dt) {
    const g = this.game;
    const a = this.a;
    const t = this.target;
    const cmd = this.cmd;
    const w = a.weapon;
    const def = w ? w.def : null;
    if (a.slot === 'gadget' || a.slot === 'gadget2') cmd.slot = 'primary';
    const e = a.eye(tmp);
    const head = t.pos.y + 1.33 - 0.37 * t.crouchT;
    const chest = t.pos.y + 0.66 - 0.37 * t.crouchT; // low chest: recoil climbs from here
    const lx = Math.cos(t.yaw) * t.lean * 0.35;
    const lz = -Math.sin(t.yaw) * t.lean * 0.35;
    // re-roll head/chest preference now and then
    this.aimRollT -= dt;
    if (this.aimRollT < 0) {
      this.aimRollT = rand(0.8, 1.6);
      this.aimHead = Math.random() < this.s.headshot;
    }
    const ty = this.aimHead ? head : chest;
    const dx = t.pos.x + lx - e.x;
    const dy = ty - e.y;
    const dz = t.pos.z + lz - e.z;
    const dist = Math.hypot(dx, dy, dz);
    const hd = Math.hypot(dx, dz);
    let wantYaw = yawTo(dx, dz);
    let wantPitch = Math.atan2(dy, hd);
    // pull against recoil
    wantPitch -= a.recoilPitch * this.s.sprayControl;
    wantYaw -= a.recoilYaw * this.s.sprayControl;

    // aim error settles over time, grows when the target strafes across our view
    const settle = Math.exp(-dt / this.s.settle);
    this.errYaw *= settle;
    this.errPitch *= settle;
    const tvx = t.vel.x;
    const tvz = t.vel.z;
    const lateral = Math.abs((tvx * dz - tvz * dx) / (hd || 1));
    const ang = lateral / Math.max(dist, 1);
    this.errYaw += gaussian() * (this.s.jitter * DEG * dt * 2 + ang * dt * (1.3 - this.s.sprayControl) * 0.9);
    this.errPitch += gaussian() * this.s.jitter * DEG * dt;
    const goalYaw = wantYaw + this.errYaw;
    const goalPitch = wantPitch + this.errPitch;
    const maxTurn = this.s.turnSpeed * DEG * dt;
    const dyaw = wrapAngle(goalYaw - a.yaw);
    a.yaw += clamp(dyaw * Math.min(1, dt * 14), -maxTurn, maxTurn);
    a.pitch += clamp((goalPitch - a.pitch) * Math.min(1, dt * 14), -maxTurn, maxTurn);
    a.pitch = clamp(a.pitch, -1.4, 1.4);

    // ammo management
    if (w && def.mag > 0 && w.ammo <= 0) {
      if (w.reserve > 0 && a.slot === 'primary' && dist < 14 && a.weapons.secondary.ammo > 0 && this.s.aggression > 0.4) cmd.slot = 'secondary';
      else if (w.reserve > 0) cmd.reload = true;
      else if (a.slot === 'primary') cmd.slot = 'secondary';
      else cmd.slot = 'melee';
    }
    if (w && def.cls === 'melee' && a.weapons.secondary.ammo + a.weapons.secondary.reserve > 0) cmd.slot = 'secondary';

    // shooting
    this.reactT -= dt;
    const offYaw = Math.abs(wrapAngle(wantYaw + a.recoilYaw * this.s.sprayControl - (a.yaw + a.recoilYaw)));
    const offPitch = Math.abs(wantPitch + a.recoilPitch * this.s.sprayControl - (a.pitch + a.recoilPitch));
    const off = Math.hypot(offYaw, offPitch);
    const tol = Math.atan2(this.aimHead ? 0.28 : 0.38, dist) * (dist < 10 ? 2.2 : 1.5);
    const sniper = def && def.cls === 'sniper';
    if (sniper) cmd.ads = true;
    else if (def && def.cls !== 'melee' && dist > 22 && this.s.counterStrafe > 0.5) cmd.ads = true;
    let firing = false;
    if (def && this.reactT <= 0 && off < tol && (!sniper || a.adsT > 0.95)) {
      if (def.cls === 'melee') {
        if (dist < 1.8) firing = true;
      } else if (def.auto) {
        if (dist < 13) firing = true;
        else if (this.burstPause > 0) this.burstPause -= dt;
        else {
          if (this.burstLeft <= 0) this.burstLeft = Math.round(rand(this.s.burst[0], this.s.burst[1]) * (dist > 35 ? 0.5 : 1));
          firing = true;
        }
      } else {
        // semi-auto: tap at a human-ish cadence
        this.tapT = (this.tapT ?? 0) - dt;
        if (this.tapT <= 0) {
          cmd.firePressed = true;
          this.tapT = (60 / def.rpm) * rand(1.1, 1.8) + (dist > 25 ? 0.15 : 0);
        }
      }
    }
    if (firing) {
      cmd.fire = true;
      cmd.firePressed = true;
      if (def.auto && dist >= 13 && w.cooldown <= 0 && w.ammo > 0) {
        this.burstLeft--;
        if (this.burstLeft <= 0) this.burstPause = rand(0.22, 0.45) / (0.5 + this.s.sprayControl);
      }
    }

    // movement: strafe, counter-strafe to shoot, push or back off
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(0.35, 1.2) / (0.4 + this.s.strafe);
      if (Math.random() < 0.65) this.strafe = -this.strafe;
      this.crouchFire = Math.random() < this.s.counterStrafe * 0.35 && dist > 9;
      this.stopT = Math.random() < this.s.counterStrafe ? rand(0.25, 0.6) : 0;
    }
    const fx = dx / (hd || 1);
    const fz = dz / (hd || 1);
    const sx = -fz * this.strafe;
    const sz = fx * this.strafe;
    let mx = 0;
    let mz = 0;
    if (Math.random() < this.s.strafe || this.s.strafe > 0.5) {
      mx += sx;
      mz += sz;
    }
    const sniperHold = sniper && a.adsT > 0.5;
    const prefer = def ? { shotgun: 4, melee: 0.8, smg: 9, pistol: 12, rifle: 18, sniper: 35 }[def.cls] : 15;
    if (dist > prefer * 1.4 && this.s.aggression > 0.35) {
      // close the distance, using the nav graph so we don't run into walls
      if (!this.path || this.repathT <= 0) {
        this._goTo(t.pos, 'chase');
        this.repathT = 1.0;
      }
      const f = this._follow(dt);
      if (f) {
        mx = mx * 0.4 + f[0];
        mz = mz * 0.4 + f[1];
      }
    } else if (dist < prefer * 0.5 && def && def.cls !== 'melee' && def.cls !== 'shotgun') {
      mx -= fx * 0.7;
      mz -= fz * 0.7;
    } else if (def && def.cls === 'melee') {
      mx += fx;
      mz += fz;
    }
    this.repathT -= dt;
    // counter-strafe: stand still while taking an aimed shot at range
    if (firing && dist > 14 && this.stopT > 0) {
      this.stopT -= dt;
      mx = 0;
      mz = 0;
    }
    if (sniperHold) {
      mx = 0;
      mz = 0;
    }
    // don't strafe off ledges / into walls
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) {
      mx /= ml;
      mz /= ml;
      const nav = g.nav;
      if (!nav.walk(a.pos.x, a.pos.y, a.pos.z, a.pos.x + mx * 1.0, a.pos.y, a.pos.z + mz * 1.0)) {
        this.strafe = -this.strafe;
        mx = -mx * 0.5;
        mz = -mz * 0.5;
      }
    }
    // jump-peek occasionally at high skill when target is far
    return { wish: ml > 0.01 ? [mx, mz] : null, crouch: this.crouchFire && firing };
  }

  // Lob a grenade (frag or smoke) towards a world position.
  _throwAt(p, type) {
    const a = this.a;
    const e = a.eye(tmp);
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const h = Math.min(Math.hypot(dx, dz), 20);
    const v = GRENADE.throwSpeed * 0.95;
    const gg = 16;
    const dy = p.y + 0.3 - e.y;
    const disc = v ** 4 - gg * (gg * h * h + 2 * dy * v * v);
    const ang = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (gg * h)) : 0.6;
    a.yaw = yawTo(dx, dz);
    a.pitch = ang - 0.12;
    if (type === 'smoke') this.cmd.smoke = true;
    else this.cmd.grenade = true;
    this.cmd.throwScale = 0.95;
  }

  // Fighting a tank (NLAW / C4) or a low jet (rifle fire).
  _engageVehicle(dt) {
    const g = this.game;
    const a = this.a;
    const t = this.target;
    const v = t.vehicle;
    const cmd = this.cmd;
    const e = a.eye(tmp);
    const tp = aimPoint(t, tmp3);
    const dist = tp.distanceTo(e);
    const how = this._antiVehicle(v, dist);
    let wish = null;
    if (!how) {
      this.mode = 'roam';
      this.target = null;
      return { wish: null, crouch: false };
    }
    if (how === 'nlaw' && a.slot !== 'gadget') cmd.slot = 'gadget';
    if (how === 'c4' && a.slot !== 'gadget' && g.combat.countOwned(a, 'c4') === 0) cmd.slot = 'gadget';
    // lead the target
    const vel = v.kind === 'tank' ? v.forwardDir.clone().multiplyScalar(v.speed) : v.vel;
    const aimP = tp.clone();
    if (how === 'nlaw') {
      const pd = PROJECTILES.rocket;
      const tt = dist / pd.speed;
      aimP.addScaledVector(vel, tt);
      aimP.y += 0.5 * pd.gravity * tt * tt;
    }
    const wantYaw = yawTo(aimP.x - e.x, aimP.z - e.z) + this.errYaw;
    const wantPitch = Math.atan2(aimP.y - e.y, Math.hypot(aimP.x - e.x, aimP.z - e.z)) + this.errPitch;
    this.errYaw *= Math.exp(-dt / this.s.settle);
    this.errPitch *= Math.exp(-dt / this.s.settle);
    const maxTurn = this.s.turnSpeed * DEG * dt;
    a.yaw += clamp(wrapAngle(wantYaw - a.yaw) * Math.min(1, dt * 12), -maxTurn, maxTurn);
    a.pitch = clamp(a.pitch + clamp((wantPitch - a.pitch) * Math.min(1, dt * 12), -maxTurn, maxTurn), -1.4, 1.4);
    const off = Math.hypot(wrapAngle(wantYaw - a.yaw), wantPitch - a.pitch);
    this.reactT -= dt;
    const w = a.weapon;
    if (how === 'nlaw') {
      cmd.ads = true;
      if (w && w.def.cls === 'launcher') {
        if (w.ammo <= 0) cmd.reload = true;
        else if (this.reactT <= 0 && a.adsT > 0.8 && off < Math.atan2(1.4, dist) + 0.01 && g.world.clearLine(e.x, e.y, e.z, tp.x, tp.y, tp.z, 'bullet')) {
          cmd.firePressed = true;
          cmd.fire = true;
          this.reactT = rand(0.8, 1.6);
        }
      }
      // fire from cover: stand still, crouch between shots
      return { wish: null, crouch: w && w.reloadT > 0 };
    }
    if (how === 'c4') {
      const mine = g.combat.countOwned(a, 'c4');
      const flat = Math.hypot(v.pos.x - a.pos.x, v.pos.z - a.pos.z);
      if (mine > 0) {
        // charges out: back off and blow them when they're on (or near) the tank
        let near = false;
        for (const p of g.combat.projectiles) if (p.owner === a && p.type === 'c4' && (p.stuckTo === v || p.pos.distanceTo(v.pos) < 4)) near = true;
        if (near && flat > 7) cmd.detonate = true;
        const away = [(a.pos.x - v.pos.x) / (flat || 1), (a.pos.z - v.pos.z) / (flat || 1)];
        if (flat < 9) wish = away;
        if (!near && flat > 12) this.c4T += dt;
        if (this.c4T > 4) cmd.detonate = true;
      } else if (w && w.def.cls === 'c4') {
        if (flat > 11) wish = [(v.pos.x - a.pos.x) / flat, (v.pos.z - a.pos.z) / flat];
        else if (w.ammo > 0 && this.reactT <= 0 && off < 0.15) {
          a.pitch = Math.max(a.pitch, 0.1);
          cmd.firePressed = true;
          cmd.fire = true;
          this.reactT = 0.4;
        }
      }
      if (wish) a.input.sprint = true;
      return { wish, crouch: false };
    }
    // a jet: spray at it
    if (w && w.def.cls === 'melee') cmd.slot = 'primary';
    if (w && w.def.mag > 0 && w.ammo <= 0) cmd.reload = true;
    if (this.reactT <= 0 && off < 0.05 && w && w.def.cls !== 'sniper') {
      cmd.fire = true;
      cmd.firePressed = true;
    }
    return { wish: null, crouch: false };
  }

  // Engineers lay AT mines on roads when enemy tanks are about.
  _maybeMine(dt) {
    const g = this.game;
    const a = this.a;
    const m = a.weapons.gadget2;
    this.mineT -= dt;
    if (this.placing) {
      if (a.slot !== 'gadget2') this.cmd.slot = 'gadget2';
      else if (m.ammo > 0) {
        this.cmd.firePressed = true;
        this.cmd.fire = true;
      } else this.placing = false;
      this.placeT -= dt;
      if (this.placeT <= 0) this.placing = false;
      return;
    }
    if (!m || m.def.cls !== 'mine' || this.mineT > 0 || this._threatNear(25)) return;
    this.mineT = rand(10, 25);
    if (m.ammo + m.reserve <= 0 || g.combat.countOwned(a, 'mine') >= 2) return;
    let tanks = false;
    for (const v of g.vehicles) if (v.alive && v.kind === 'tank' && v.team !== a.team) tanks = true;
    if (!tanks || g.surfaceAt(a.pos) !== 'hard' || a.pos.y > 0.3) return;
    this.placing = true;
    this.placeT = 2.5;
  }
}

