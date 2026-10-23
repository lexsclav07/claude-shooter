// Bullets, melee, grenades and damage.

import * as THREE from 'three';
import { breakPane } from './world/builder.js';
import { hitboxes, makeHitboxes } from './actors/mascot.js';
import { GRENADE } from './weapons/defs.js';
import { rayBox } from './physics.js';
import { DEG } from './util.js';

const HB = makeHitboxes();
const ZONE_ORDER = ['head', 'body', 'legs'];
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();

export class Combat {
  constructor(game) {
    this.game = game;
    this.grenades = [];
  }

  // Nearest actor hit along a ray segment [tMin, tMax]. Returns { actor, t, zone } or null.
  traceActors(o, d, tMin, tMax, shooter) {
    const g = this.game;
    let best = null;
    for (const a of g.actors) {
      if (!a.alive || a === shooter) continue;
      if (shooter && !g.match.friendlyFire && a.team === shooter.team) continue;
      // bounding sphere test
      const cx = a.pos.x - o.x;
      const cy = a.pos.y + 0.8 - o.y;
      const cz = a.pos.z - o.z;
      const along = cx * d.x + cy * d.y + cz * d.z;
      if (along < tMin - 1.2 || along > tMax + 1.2) continue;
      const px = cx - d.x * along;
      const py = cy - d.y * along;
      const pz = cz - d.z * along;
      if (px * px + py * py + pz * pz > 1.3 * 1.3) continue;
      // into the actor's local space
      const c = Math.cos(a.yaw);
      const s = Math.sin(a.yaw);
      const rx = o.x - a.pos.x;
      const ry = o.y - a.pos.y;
      const rz = o.z - a.pos.z;
      const lox = rx * c - rz * s;
      const loz = rx * s + rz * c;
      const ldx = d.x * c - d.z * s;
      const ldz = d.x * s + d.z * c;
      hitboxes(a.crouchT, a.lean * (a.leanClamp ?? 1), HB);
      for (const zn of ZONE_ORDER) {
        const hb = HB[zn];
        const r = rayBox(lox, ry, loz, 1 / ldx, 1 / d.y, 1 / ldz, hb);
        if (r && r.t0 >= tMin && r.t0 <= tMax && (!best || r.t0 < best.t)) best = { actor: a, t: r.t0, zone: zn };
      }
    }
    return best;
  }

  // Fires one bullet. Handles wall penetration, glass and hits. Returns the end point.
  fireBullet(shooter, origin, dir, def, damageScale = 1, maxRange = 400) {
    const g = this.game;
    const world = g.world;
    const hits = world.raycastAll(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxRange);
    let damage = def.damage * damageScale;
    let t0 = 0;
    let pens = 0;
    const end = new THREE.Vector3();
    for (const h of hits) {
      const ah = this.traceActors(origin, dir, t0, h.t, shooter);
      if (ah) {
        this._hitActor(shooter, ah, origin, dir, damage, def);
        return end.copy(dir).multiplyScalar(ah.t).add(origin);
      }
      const p = tmpV.copy(dir).multiplyScalar(h.t).add(origin);
      const normal = [0, 0, 0];
      normal[h.axis] = h.sign;
      const b = h.box;
      if (b.kind === 'glass') {
        if (b.pane && breakPane(b.pane)) {
          world.remove(b);
          g.fx.glass(p, b);
          g.audio.play('glass', { pos: p });
        }
        t0 = h.tOut;
        continue;
      }
      g.fx.impact(p, normal, b.k.impact, shooter === g.player);
      const thick = h.tOut - h.t;
      if (b.k.pen === 0 || thick > def.pen * 0.3 || pens >= 2) {
        if (shooter && g.audio && shooter !== g.player) this._whiz(origin, dir, h.t);
        return end.copy(p);
      }
      pens++;
      damage *= b.k.pen * (1 - thick / (def.pen * 0.6));
      const exitP = tmpD.copy(dir).multiplyScalar(h.tOut).add(origin);
      const n2 = [0, 0, 0];
      n2[h.axis] = -h.sign;
      g.fx.impact(exitP, n2, b.k.impact, false, true);
      t0 = h.tOut;
    }
    const ah = this.traceActors(origin, dir, t0, maxRange, shooter);
    if (ah) {
      this._hitActor(shooter, ah, origin, dir, damage, def);
      return end.copy(dir).multiplyScalar(ah.t).add(origin);
    }
    if (shooter && shooter !== g.player) this._whiz(origin, dir, maxRange);
    return end.copy(dir).multiplyScalar(Math.min(maxRange, 150)).add(origin);
  }

  // Bullet crack when a shot passes close to the player's head.
  _whiz(o, d, tEnd) {
    const g = this.game;
    const p = g.player;
    if (!p || !p.alive) return;
    const e = p.eye(tmpV);
    const along = (e.x - o.x) * d.x + (e.y - o.y) * d.y + (e.z - o.z) * d.z;
    if (along < 2 || along > tEnd) return;
    const qx = o.x + d.x * along - e.x;
    const qy = o.y + d.y * along - e.y;
    const qz = o.z + d.z * along - e.z;
    const dist = Math.hypot(qx, qy, qz);
    if (dist < 1.6) g.audio.play('whiz', { pos: new THREE.Vector3(e.x + qx, e.y + qy, e.z + qz), volume: 1 - dist / 1.6 });
  }

  _hitActor(shooter, ah, origin, dir, damage, def) {
    const dist = ah.t;
    const fall = Math.pow(def.range, dist / 10);
    let dmg = damage * fall;
    if (ah.zone === 'head') dmg *= def.head;
    else if (ah.zone === 'legs') dmg *= def.legs;
    const p = tmpV.copy(dir).multiplyScalar(ah.t).add(origin);
    this.game.fx.blood(p, dir, ah.zone === 'head');
    this.game.damage(ah.actor, dmg, shooter, def.id, ah.zone, origin);
  }

  // Knife swing: short ray, big damage from behind.
  melee(attacker, def) {
    const g = this.game;
    const o = attacker.eye(new THREE.Vector3());
    const d = attacker.aimDir(new THREE.Vector3());
    const wall = g.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, def.reach, 'bullet');
    const maxT = wall ? wall.t : def.reach;
    // slightly fat ray: try a few offsets so close swings connect
    let ah = this.traceActors(o, d, 0, maxT, attacker);
    if (!ah) {
      for (const [dy, dyaw] of [[-0.25, 0], [0, 0.12], [0, -0.12], [-0.4, 0]]) {
        const d2 = new THREE.Vector3();
        const cp = Math.cos(attacker.pitch + dy * 0.6);
        d2.set(-Math.sin(attacker.yaw + dyaw) * cp, Math.sin(attacker.pitch + dy * 0.6), -Math.cos(attacker.yaw + dyaw) * cp);
        ah = this.traceActors(o, d2, 0, maxT, attacker);
        if (ah) break;
      }
    }
    if (ah) {
      const v = ah.actor;
      // backstab if attacker is behind the victim
      const fx = -Math.sin(v.yaw);
      const fz = -Math.cos(v.yaw);
      const tx = v.pos.x - attacker.pos.x;
      const tz = v.pos.z - attacker.pos.z;
      const behind = (fx * tx + fz * tz) / (Math.hypot(tx, tz) || 1) > 0.5;
      const dmg = behind ? def.backstab : def.damage;
      g.fx.blood(v.pos.clone().setY(v.pos.y + 1), d, false);
      g.damage(v, dmg, attacker, def.id, behind ? 'back' : 'body', o);
      g.audio.play('knifeHit', { pos: o });
      return true;
    }
    if (wall) {
      const p = new THREE.Vector3().copy(d).multiplyScalar(wall.t).add(o);
      const n = [0, 0, 0];
      n[wall.axis] = wall.sign;
      g.fx.impact(p, n, wall.box.k.impact, attacker === g.player);
      g.audio.play('knifeWall', { pos: p });
    }
    return false;
  }

  throwGrenade(thrower, speedScale = 1) {
    const o = thrower.eye(new THREE.Vector3());
    const d = thrower.aimDir(new THREE.Vector3());
    // throw slightly upward of the aim and from in front of the face
    d.y += 0.12;
    d.normalize();
    o.addScaledVector(d, 0.5);
    const v = d.multiplyScalar(GRENADE.throwSpeed * speedScale).add(new THREE.Vector3(thrower.vel.x * 0.5, 0, thrower.vel.z * 0.5));
    this.spawnGrenade(thrower, o, v, GRENADE.fuse);
  }

  spawnGrenade(owner, pos, vel, fuse) {
    const mesh = this.game.fx.grenadeMesh();
    this.grenades.push({ owner, pos: pos.clone(), vel: vel.clone(), fuse, mesh, spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), bounced: 0 });
    this.game.emitNoise(pos, 12, owner, 'grenade');
  }

  updateGrenades(dt) {
    const g = this.game;
    const world = g.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i];
      n.fuse -= dt;
      const steps = 3;
      const h = dt / steps;
      for (let s = 0; s < steps; s++) {
        n.vel.y -= 16 * h;
        const len = n.vel.length() * h;
        if (len < 1e-5) continue;
        const d = tmpD.copy(n.vel).normalize();
        const hit = world.raycast(n.pos.x, n.pos.y, n.pos.z, d.x, d.y, d.z, len + 0.06, 'move');
        if (hit) {
          n.pos.addScaledVector(d, Math.max(0, hit.t - 0.06));
          const ax = hit.axis === 0 ? 'x' : hit.axis === 1 ? 'y' : 'z';
          n.vel[ax] *= -0.42;
          n.vel.multiplyScalar(0.62);
          if (hit.axis === 1 && Math.abs(n.vel.y) < 1.2) n.vel.y = 0;
          if (n.vel.lengthSq() > 2 && n.bounced < 6) {
            g.audio.play('bounce', { pos: n.pos, volume: Math.min(1, n.vel.length() / 8) });
            n.bounced++;
          }
          if (hit.box.kind === 'glass' && hit.box.pane && breakPane(hit.box.pane)) {
            world.remove(hit.box);
            g.fx.glass(n.pos, hit.box);
            g.audio.play('glass', { pos: n.pos });
          }
        } else {
          n.pos.addScaledVector(d, len);
        }
        // resting on ground: apply friction
        if (n.vel.y === 0) {
          n.vel.x *= 1 - 3 * h;
          n.vel.z *= 1 - 3 * h;
          if (!world.raycast(n.pos.x, n.pos.y, n.pos.z, 0, -1, 0, 0.1, 'move')) n.vel.y = -0.1;
        }
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.spin.x * dt * Math.min(1, n.vel.length());
      n.mesh.rotation.y += n.spin.y * dt * Math.min(1, n.vel.length());
      if (n.fuse <= 0) {
        this.explode(n.pos, n.owner);
        g.fx.releaseGrenade(n.mesh);
        this.grenades.splice(i, 1);
      }
    }
  }

  explode(pos, owner) {
    const g = this.game;
    g.fx.explosion(pos);
    g.audio.play('explosion', { pos });
    g.emitNoise(pos, 60, owner, 'explosion');
    const R = GRENADE.radius;
    for (const a of g.actors) {
      if (!a.alive) continue;
      if (owner && a !== owner && a.team === owner.team && !g.match.friendlyFire) continue;
      const c = new THREE.Vector3(a.pos.x, a.pos.y + 0.9, a.pos.z);
      const dist = c.distanceTo(pos);
      if (dist > R) continue;
      // blocked by walls?
      const up = pos.clone();
      up.y += 0.2;
      if (!g.world.clearLine(up.x, up.y, up.z, c.x, c.y, c.z, 'bullet')) {
        const head = c.clone();
        head.y += 0.5;
        if (!g.world.clearLine(up.x, up.y, up.z, head.x, head.y, head.z, 'bullet')) continue;
      }
      const f = 1 - dist / R;
      const dmg = GRENADE.damage * f * f * 0.85 + GRENADE.damage * 0.15 * f;
      g.damage(a, dmg, owner, 'grenade', 'body', pos);
      // knock-back
      const push = c.sub(pos).normalize().multiplyScalar(6 * f);
      a.vel.x += push.x;
      a.vel.z += push.z;
      a.vel.y += Math.max(0, push.y) + 2 * f;
      a.grounded = false;
    }
    // break nearby glass
    for (const p of g.builder.panes) {
      if (p.broken) continue;
      const b = p.box;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if ((cx - pos.x) ** 2 + (cy - pos.y) ** 2 + (cz - pos.z) ** 2 < 25) {
        if (breakPane(p)) {
          g.world.remove(b);
          g.fx.glass(new THREE.Vector3(cx, cy, cz), b);
        }
      }
    }
    // shake the player's camera
    if (g.player) {
      const d = g.player.pos.distanceTo(pos);
      if (d < 25) g.shake(Math.min(1, (25 - d) / 18) * 0.9);
    }
  }
}

export { DEG };
