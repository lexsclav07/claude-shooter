// Bullets, melee, projectiles (grenades, rockets, shells, bombs, C4, mines),
// explosions, smoke and damage routing for infantry and vehicles.

import * as THREE from 'three';
import { breakPane } from './world/builder.js';
import { hitboxes, makeHitboxes } from './actors/mascot.js';
import { rayBox } from './physics.js';
import { buildGun } from './weapons/models.js';

const HB = makeHitboxes();
const ZONE_ORDER = ['head', 'body', 'legs'];
const tmpV = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpQ = new THREE.Vector3();

// Projectile types. blast: radius (m), damage (infantry at the centre), vehicle
// (damage to vehicles at the centre), prop (damage to destructible props).
export const PROJECTILES = {
  frag: { name: 'Frag Grenade', model: 'grenade', scale: 1.4, gravity: 16, bounce: true, fuse: 2.2, speed: 17, blast: { radius: 7.5, damage: 120, vehicle: 90, prop: 160 } },
  smoke: { name: 'Smoke Grenade', model: 'smokeGrenade', scale: 1.4, gravity: 16, bounce: true, fuse: 1.3, speed: 17, smoke: true },
  c4: { name: 'C4', model: 'c4', scale: 1.4, gravity: 14, sticky: true, fuse: Infinity, speed: 11, blast: { radius: 6.5, damage: 220, vehicle: 680, prop: 600 } },
  mine: { name: 'AT Mine', model: 'mine', scale: 1, mine: true, blast: { radius: 5, damage: 160, vehicle: 820, prop: 400 } },
  rocket: { name: 'NLAW', model: 'rocket', scale: 1, gravity: 1.5, impact: true, life: 6, speed: 95, trail: 'rocket', blast: { radius: 4.5, damage: 140, vehicle: 260, direct: 290, prop: 400 } },
  shell: { name: 'Tank Shell', model: 'shell', scale: 1, gravity: 3, impact: true, life: 4, speed: 240, trail: 'shell', blast: { radius: 5.5, damage: 160, vehicle: 160, direct: 300, prop: 500 } },
  jetRocket: { name: 'Jet Rockets', model: 'rocket', scale: 0.8, gravity: 1, impact: true, life: 5, speed: 170, trail: 'rocket', blast: { radius: 5, damage: 130, vehicle: 120, direct: 140, prop: 400 } },
  bomb: { name: 'Bomb', model: 'bomb', scale: 1, gravity: 20, impact: true, life: 30, trail: null, blast: { radius: 11, damage: 240, vehicle: 450, direct: 500, prop: 800 } },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.projectiles = [];
    this.smokes = [];
  }

  reset() {
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    this.projectiles.length = 0;
    this.smokes.length = 0;
    this.game.fx.clearSmoke();
  }

  // Nearest actor (or vehicle) hit along a ray segment [tMin, tMax].
  // Returns { actor, t, zone } where zone is 'head' | 'body' | 'legs' | 'vehicle'.
  traceActors(o, d, tMin, tMax, shooter) {
    const g = this.game;
    let best = null;
    for (const a of g.actors) {
      if (!a.alive || a === shooter) continue;
      if (shooter && !g.match.friendlyFire && a.team === shooter.team) continue;
      if (a.vehicle) {
        const t = a.vehicle.rayHit(o, d, tMin, tMax);
        if (t !== null && (!best || t < best.t)) best = { actor: a, t, zone: 'vehicle' };
        continue;
      }
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

  // Fires one bullet. Handles wall penetration, glass, props and hits. Returns the end point.
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
      // fuel drums and pumps can be shot until they go up
      if (b.group && b.group.bullet) g.destruction.damage(b.group, damage, shooter, 'bullet');
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
    if (!p || !p.alive || p.vehicle) return;
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
    const p = tmpV.copy(dir).multiplyScalar(ah.t).add(origin);
    if (ah.zone === 'vehicle') {
      const v = ah.actor.vehicle;
      const armor = (def.armor && def.armor[v.kind]) ?? (v.kind === 'jet' ? 0.3 : 0.03);
      this.game.fx.impact(p, [-dir.x, -dir.y, -dir.z].map((c) => Math.round(c)), 'metal', shooter === this.game.player);
      this.game.damageVehicle(v, damage * fall * armor, shooter, def.id, origin);
      return;
    }
    let dmg = damage * fall;
    if (ah.zone === 'head') dmg *= def.head;
    else if (ah.zone === 'legs') dmg *= def.legs;
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
    if (ah && ah.zone !== 'vehicle') {
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

  // ------------------------------------------------------------------ projectiles

  // Infantry throw (frag, smoke, C4) from in front of the face.
  throw(thrower, type, speedScale = 1) {
    const def = PROJECTILES[type];
    const o = thrower.eye(new THREE.Vector3());
    const d = thrower.aimDir(new THREE.Vector3());
    d.y += 0.12;
    d.normalize();
    o.addScaledVector(d, 0.5);
    const v = d.multiplyScalar(def.speed * speedScale).add(new THREE.Vector3(thrower.vel.x * 0.5, 0, thrower.vel.z * 0.5));
    return this.spawnProjectile(type, thrower, o, v);
  }

  spawnProjectile(type, owner, pos, vel, opts = {}) {
    const def = PROJECTILES[type];
    const g = this.game;
    this.templates ||= {};
    if (!this.templates[def.model]) {
      const t = buildGun(def.model).group;
      t.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      this.templates[def.model] = t;
    }
    const mesh = this.templates[def.model].clone();
    mesh.scale.setScalar(def.scale);
    mesh.position.copy(pos);
    if (def.impact) mesh.lookAt(tmpQ.copy(pos).add(vel));
    g.scene.add(mesh);
    const p = {
      type,
      def,
      owner,
      team: owner ? owner.team : -1,
      pos: pos.clone(),
      vel: vel.clone(),
      fuse: opts.fuse ?? def.fuse ?? Infinity,
      life: def.life ?? Infinity,
      mesh,
      spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0),
      bounced: 0,
      stuck: false,
      stuckTo: null,
      local: null,
      armT: def.mine ? 1.5 : 0,
      trailT: 0,
      ignore: opts.ignore || null,
    };
    this.projectiles.push(p);
    if (def.bounce || def.sticky) g.emitNoise(pos, 12, owner, 'grenade');
    return p;
  }

  // Remote-detonate every C4 charge this player has placed.
  detonate(owner) {
    let n = 0;
    for (const p of this.projectiles) {
      if (p.type === 'c4' && p.owner === owner && !p.dead) {
        p.fuse = 0.05 + n * 0.08;
        n++;
      }
    }
    if (n) this.game.audio.play('beep', { pos: owner === this.game.player ? undefined : owner.pos });
    return n;
  }

  countOwned(owner, type) {
    let n = 0;
    for (const p of this.projectiles) if (p.owner === owner && p.type === type && !p.dead) n++;
    return n;
  }

  // Anti-tank mine dropped at the feet / just in front of the placer.
  placeMine(owner) {
    const g = this.game;
    const fx = -Math.sin(owner.yaw);
    const fz = -Math.cos(owner.yaw);
    const x = owner.pos.x + fx * 1.2;
    const z = owner.pos.z + fz * 1.2;
    const y = g.world.supportHeight(x, z, owner.pos.y + 0.5, owner.pos.y - 2);
    if (y === null) return false;
    // at most two mines each - the oldest is removed
    const mine = this.projectiles.filter((p) => p.owner === owner && p.type === 'mine');
    if (mine.length >= 2) this._remove(mine[0]);
    const p = this.spawnProjectile('mine', owner, new THREE.Vector3(x, y + 0.02, z), new THREE.Vector3());
    p.stuck = true;
    g.audio.play('pin', { pos: owner === g.player ? undefined : owner.pos });
    return true;
  }

  _remove(p) {
    p.dead = true;
    this.game.scene.remove(p.mesh);
    const i = this.projectiles.indexOf(p);
    if (i >= 0) this.projectiles.splice(i, 1);
  }

  update(dt) {
    const g = this.game;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const n = this.projectiles[i];
      if (n.dead) continue;
      const def = n.def;
      n.fuse -= dt;
      n.life -= dt;
      if (def.mine) {
        n.armT -= dt;
        if (n.armT <= 0) {
          for (const a of g.actors) {
            if (!a.alive || !a.vehicle || a.vehicle.kind !== 'tank') continue;
            if (n.owner && a.team === n.owner.team && !g.match.friendlyFire) continue;
            if (a.vehicle.pos.distanceTo(n.pos) < 3.2) {
              this._detonate(n, a.vehicle);
              break;
            }
          }
        }
        continue;
      }
      if (n.stuck) {
        if (n.stuckTo) {
          // ride along on the vehicle it is stuck to
          if (!n.stuckTo.alive) {
            n.stuckTo = null;
            n.stuck = false;
          } else {
            n.pos.copy(n.local).applyMatrix4(n.stuckTo.mesh.matrixWorld);
            n.mesh.position.copy(n.pos);
          }
        }
      } else if (def.impact) {
        this._flyImpact(n, dt);
        if (n.dead) continue;
      } else {
        this._flyBounce(n, dt);
      }
      if (!n.dead && (n.fuse <= 0 || n.life <= 0)) this._detonate(n, null);
    }
    // smoke clouds grow, linger, then thin out
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      s.r = Math.min(s.maxR, s.maxR * Math.min(1, s.t / 2.2));
      if (s.t > s.life) s.r *= Math.max(0, 1 - (s.t - s.life) / 3);
      if (s.t > s.life + 3) this.smokes.splice(i, 1);
    }
  }

  _flyBounce(n, dt) {
    const g = this.game;
    const world = g.world;
    const def = n.def;
    const steps = 3;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      n.vel.y -= def.gravity * h;
      const len = n.vel.length() * h;
      if (len < 1e-5) continue;
      const d = tmpD.copy(n.vel).normalize();
      // C4 sticks to vehicles it touches
      if (def.sticky) {
        const vh = this._traceVehicles(n.pos, d, len + 0.1, n.owner);
        if (vh) {
          n.pos.addScaledVector(d, vh.t);
          n.stuck = true;
          n.stuckTo = vh.vehicle;
          vh.vehicle.mesh.updateMatrixWorld();
          n.local = n.pos.clone().applyMatrix4(new THREE.Matrix4().copy(vh.vehicle.mesh.matrixWorld).invert());
          n.vel.set(0, 0, 0);
          g.audio.play('bounce', { pos: n.pos });
          break;
        }
      }
      const hit = world.raycast(n.pos.x, n.pos.y, n.pos.z, d.x, d.y, d.z, len + 0.06, 'move');
      if (hit) {
        if (hit.box.kind === 'glass' && hit.box.pane && breakPane(hit.box.pane)) {
          world.remove(hit.box);
          g.fx.glass(n.pos, hit.box);
          g.audio.play('glass', { pos: n.pos });
          continue;
        }
        n.pos.addScaledVector(d, Math.max(0, hit.t - 0.06));
        if (def.sticky) {
          n.stuck = true;
          n.vel.set(0, 0, 0);
          g.audio.play('bounce', { pos: n.pos });
          break;
        }
        const ax = hit.axis === 0 ? 'x' : hit.axis === 1 ? 'y' : 'z';
        n.vel[ax] *= -0.42;
        n.vel.multiplyScalar(0.62);
        if (hit.axis === 1 && Math.abs(n.vel.y) < 1.2) n.vel.y = 0;
        if (n.vel.lengthSq() > 2 && n.bounced < 6) {
          g.audio.play('bounce', { pos: n.pos, volume: Math.min(1, n.vel.length() / 8) });
          n.bounced++;
        }
      } else {
        n.pos.addScaledVector(d, len);
      }
      if (n.vel.y === 0) {
        n.vel.x *= 1 - 3 * h;
        n.vel.z *= 1 - 3 * h;
        if (!world.raycast(n.pos.x, n.pos.y, n.pos.z, 0, -1, 0, 0.1, 'move')) n.vel.y = -0.1;
      }
    }
    n.mesh.position.copy(n.pos);
    if (!n.stuck) {
      const sp = Math.min(1, n.vel.length());
      n.mesh.rotation.x += n.spin.x * dt * sp;
      n.mesh.rotation.y += n.spin.y * dt * sp;
    }
  }

  _flyImpact(n, dt) {
    const g = this.game;
    const world = g.world;
    const def = n.def;
    const steps = 2;
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      n.vel.y -= def.gravity * h;
      const len = n.vel.length() * h;
      const d = tmpD.copy(n.vel).normalize();
      // anything alive in the way?
      const ah = this.traceActors(n.pos, d, 0, len, n.ignore || n.owner);
      let wallHit = world.raycast(n.pos.x, n.pos.y, n.pos.z, d.x, d.y, d.z, len, 'bullet');
      while (wallHit && wallHit.box.kind === 'glass') {
        if (wallHit.box.pane && breakPane(wallHit.box.pane)) {
          world.remove(wallHit.box);
          g.fx.glass(n.pos, wallHit.box);
          g.audio.play('glass', { pos: n.pos });
        }
        wallHit = world.raycast(n.pos.x, n.pos.y, n.pos.z, d.x, d.y, d.z, len, 'bullet');
      }
      if (ah && (!wallHit || ah.t < wallHit.t)) {
        n.pos.addScaledVector(d, ah.t);
        this._detonate(n, ah.zone === 'vehicle' ? ah.actor.vehicle : null, ah.zone !== 'vehicle' ? ah.actor : null);
        return;
      }
      if (wallHit) {
        n.pos.addScaledVector(d, Math.max(0, wallHit.t - 0.05));
        this._detonate(n, null);
        return;
      }
      n.pos.addScaledVector(d, len);
    }
    n.mesh.position.copy(n.pos);
    n.mesh.lookAt(tmpQ.copy(n.pos).add(n.vel));
    // smoke trail
    if (def.trail) {
      n.trailT -= dt;
      if (n.trailT <= 0) {
        n.trailT = def.trail === 'rocket' ? 0.025 : 0.05;
        g.fx.trail(n.pos, def.trail);
      }
    }
  }

  // Vehicles hit along a short segment (for sticky charges).
  _traceVehicles(o, d, maxT, owner) {
    let best = null;
    for (const a of this.game.actors) {
      if (!a.alive || !a.vehicle) continue;
      const t = a.vehicle.rayHit(o, d, 0, maxT);
      if (t !== null && (!best || t < best.t)) best = { vehicle: a.vehicle, t };
    }
    void owner;
    return best;
  }

  _detonate(n, directVehicle, directActor = null) {
    const g = this.game;
    const def = n.def;
    this._remove(n);
    if (def.smoke) {
      this.smokes.push({ pos: n.pos.clone(), r: 0.5, maxR: 6.5, t: 0, life: 16 });
      g.fx.smokeCloud(n.pos, 16);
      g.audio.play('smokePop', { pos: n.pos });
      return;
    }
    if (directVehicle && def.blast.direct) {
      // rear hits on tanks hurt more
      let mult = 1;
      if (directVehicle.kind === 'tank') mult = directVehicle.isRearHit(n.pos) ? 1.45 : 1;
      g.damageVehicle(directVehicle, def.blast.direct * mult, n.owner, n.type, n.pos);
    }
    if (directActor) g.damage(directActor, def.blast.damage * 0.6, n.owner, n.type, 'body', n.pos);
    this.explode(n.pos, n.owner, { ...def.blast, weapon: n.type, skip: directVehicle });
  }

  // ------------------------------------------------------------------ explosions & smoke

  explode(pos, owner, opts = {}) {
    const g = this.game;
    const R = opts.radius ?? 7.5;
    const dmgMax = opts.damage ?? 120;
    const weapon = opts.weapon ?? 'frag';
    if (!opts.silent) {
      g.fx.explosion(pos, R / 7.5);
      g.audio.play(R > 9 ? 'bigExplosion' : 'explosion', { pos });
    }
    g.emitNoise(pos, 60 + R * 4, owner, 'explosion');
    const up = tmpQ.copy(pos);
    up.y += 0.25;
    for (const a of g.actors) {
      if (!a.alive) continue;
      if (owner && a !== owner && a.team === owner.team && !g.match.friendlyFire) continue;
      if (a.vehicle) {
        const v = a.vehicle;
        if (v === opts.skip || !opts.vehicle) continue;
        const dist = Math.max(0, v.pos.distanceTo(pos) - v.radius);
        if (dist > R) continue;
        const f = 1 - dist / R;
        g.damageVehicle(v, opts.vehicle * f, owner, weapon, pos);
        continue;
      }
      const c = new THREE.Vector3(a.pos.x, a.pos.y + 0.9, a.pos.z);
      const dist = c.distanceTo(pos);
      if (dist > R) continue;
      // blocked by walls?
      if (!g.world.clearLine(up.x, up.y, up.z, c.x, c.y, c.z, 'bullet')) {
        const head = c.clone();
        head.y += 0.5;
        if (!g.world.clearLine(up.x, up.y, up.z, head.x, head.y, head.z, 'bullet')) continue;
      }
      const f = 1 - dist / R;
      g.damage(a, dmgMax * Math.pow(f, 1.6), owner, weapon, 'body', pos);
      const push = c.sub(pos).normalize().multiplyScalar(6 * f * Math.min(2, R / 7.5));
      a.vel.x += push.x;
      a.vel.z += push.z;
      a.vel.y += Math.max(0, push.y) + 2 * f;
      a.grounded = false;
    }
    // knock down nearby props
    g.destruction.blast(pos, R * 0.75, opts.prop ?? dmgMax * 1.5, owner);
    // break nearby glass
    const gr2 = (R * 0.7) ** 2;
    for (const p of g.builder.panes) {
      if (p.broken) continue;
      const b = p.box;
      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      if ((cx - pos.x) ** 2 + (cy - pos.y) ** 2 + (cz - pos.z) ** 2 < gr2) {
        if (breakPane(p)) {
          g.world.remove(b);
          g.fx.glass(new THREE.Vector3(cx, cy, cz), b);
        }
      }
    }
    // shake the player's camera
    if (g.player) {
      const d = g.camera.position.distanceTo(pos);
      const range = 18 + R * 2;
      if (d < range) g.shake(Math.min(1, (range - d) / (range * 0.7)) * 0.9);
    }
  }

  // Does a smoke cloud block the line between a and b?
  smokeBlocks(ax, ay, az, bx, by, bz) {
    if (!this.smokes.length) return false;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    for (const s of this.smokes) {
      if (s.r < 1.5) continue;
      const r = s.r * 0.85;
      // closest point on the segment to the cloud centre
      let t = ((s.pos.x - ax) * dx + (s.pos.y + 1.5 - ay) * dy + (s.pos.z - az) * dz) / (len2 || 1);
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.pos.x;
      const py = ay + dy * t - (s.pos.y + 1.5);
      const pz = az + dz * t - s.pos.z;
      if (px * px + py * py * 2 + pz * pz < r * r) return true;
    }
    return false;
  }
}
