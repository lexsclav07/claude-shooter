// Challenger 2 tank: tracked driving with collision against the town, crushing
// fences / hedges / cars, a turret that follows the aim, 120 mm cannon and coax MG.

import * as THREE from 'three';
import { buildTank, TANK_DIMS } from './models.js';
import { PROJECTILES } from '../combat.js';
import { WEAPONS } from '../weapons/defs.js';
import { nudgeBody, rayBox } from '../physics.js';
import { PHYS } from '../config.js';
import { clamp, wrapAngle, damp, approach, DEG, dirFromAngles } from '../util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _q = new THREE.Quaternion();
const HULL_BOX = { min: [-1.85, 0, -3.8], max: [1.85, 1.75, 3.8] };
const TURRET_BOX = { min: [-1.3, 0, -2.15], max: [1.3, 0.95, 2.75] };

export const TANK = {
  maxHp: 1000,
  forward: 11, // m/s
  reverse: 4.5,
  accel: 4.2,
  brake: 10,
  turn: 0.8, // rad/s
  turretSpeed: 42 * DEG,
  gunSpeed: 24 * DEG,
  gunMin: -8 * DEG,
  gunMax: 20 * DEG,
  reload: 4.0,
  mgRpm: 650,
  climb: 0.75, // tallest step the tracks will mount
};

export class Tank {
  constructor(game, team, pos, yaw) {
    this.kind = 'tank';
    this.game = game;
    this.team = team;
    this.model = buildTank(team);
    this.mesh = this.model.root;
    this.pos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.yaw = yaw;
    this.speed = 0;
    this.spin = 0;
    this.turretYaw = 0; // relative to the hull
    this.gunPitch = 0;
    this.aimYaw = yaw;
    this.aimPitch = -0.05;
    this.hp = TANK.maxHp;
    this.maxHp = TANK.maxHp;
    this.alive = true;
    this.radius = 3.0;
    this.reload = 1.5;
    this.mgCool = 0;
    this.mgHeat = 0;
    this.mgLocked = 0;
    this.weapon = 0; // 0 cannon, 1 coax MG
    this.driver = null;
    this.pitch = 0;
    this.roll = 0;
    this.recoil = 0;
    this.lastHit = -10;
    this.lastAttacker = null;
    this.smokeT = 0;
    this.deadT = 0;
    this.zoom = false;
    this.input = { throttle: 0, steer: 0, fire: false, firePressed: false, mg: false };
    this.aimPoint = new THREE.Vector3();
    this.camYaw = yaw;
    this.camPitch = -0.12;
    this.camPos = null;
    this.engine = null;
    this.fwd = new THREE.Vector3();
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.order = 'YXZ';
    this._place(1);
  }

  get forwardDir() {
    return this.fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  // World yaw the gun is pointing at.
  get gunYaw() {
    return this.yaw + this.turretYaw;
  }

  muzzleWorld(out) {
    this.mesh.updateMatrixWorld(true);
    return this.model.muzzle.getWorldPosition(out);
  }

  // Barrel direction in world space (includes the hull tilting on kerbs).
  gunDir(out) {
    this.mesh.updateMatrixWorld(true);
    this.model.gun.getWorldQuaternion(_q);
    return out.set(0, 0, -1).applyQuaternion(_q);
  }

  // Ray against hull and turret boxes. Returns distance or null.
  rayHit(o, d, tMin, tMax) {
    // quick reject: the ray segment must pass within 6 m of the tank
    const cx = this.pos.x - o.x;
    const cy = this.pos.y + 1.2 - o.y;
    const cz = this.pos.z - o.z;
    const along = clamp(cx * d.x + cy * d.y + cz * d.z, tMin, tMax);
    const px = cx - d.x * along;
    const py = cy - d.y * along;
    const pz = cz - d.z * along;
    if (px * px + py * py + pz * pz > 36) return null;
    let best = null;
    const test = (yaw, ox, oy, oz, box) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const rx = o.x - ox;
      const ry = o.y - oy;
      const rz = o.z - oz;
      const lx = rx * c - rz * s;
      const lz = rx * s + rz * c;
      const ldx = d.x * c - d.z * s;
      const ldz = d.x * s + d.z * c;
      const r = rayBox(lx, ry, lz, 1 / ldx, 1 / d.y, 1 / ldz, box);
      if (r && r.t0 >= tMin && r.t0 <= tMax && (best === null || r.t0 < best)) best = r.t0;
    };
    test(this.yaw, this.pos.x, this.pos.y, this.pos.z, HULL_BOX);
    const tp = this._turretPivot(tmp2);
    test(this.gunYaw, tp.x, tp.y, tp.z, TURRET_BOX);
    return best;
  }

  _turretPivot(out) {
    const f = this.forwardDir;
    return out.set(this.pos.x + f.x * 0.2, this.pos.y + TANK_DIMS.turretY, this.pos.z + f.z * 0.2);
  }

  // Hits in the back third of the hull do extra damage.
  isRearHit(p) {
    const f = this.forwardDir;
    return (p.x - this.pos.x) * f.x + (p.z - this.pos.z) * f.z < -1.4;
  }

  // ------------------------------------------------------------------ player controls

  control(game, input, dt, mouse) {
    const S = game.settings;
    const zoomK = this.zoom ? 3.2 : 1;
    const sens = (0.0011 * S.sensitivity) / zoomK;
    this.camYaw -= mouse.x * sens;
    this.camPitch = clamp(this.camPitch - mouse.y * sens * (S.invertY ? -1 : 1), -0.6, 0.45);
    const inp = this.input;
    inp.throttle = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
    inp.steer = (input.held('left') ? 1 : 0) - (input.held('right') ? 1 : 0);
    this.zoom = input.mouseHeld(2);
    if (input.hit('primary')) this.weapon = 0;
    if (input.hit('secondary')) this.weapon = 1;
    const wheel = input.takeWheel();
    if (wheel) this.weapon = 1 - this.weapon;
    const fire = input.mouseHeld(0);
    inp.fire = fire && this.weapon === 0;
    inp.firePressed = input.mouseHit(0) && this.weapon === 0;
    inp.mg = (fire && this.weapon === 1) || input.held('jump');
    // where is the crosshair pointing? the turret swings to look there
    const cam = this._cameraPose(tmp);
    const dir = dirFromAngles(this.camYaw, this.camPitch, new THREE.Vector3());
    const hit = game.world.raycast(cam.x, cam.y, cam.z, dir.x, dir.y, dir.z, 600, 'bullet');
    const t = hit ? hit.t : 600;
    this.aimPoint.copy(dir).multiplyScalar(t).add(cam);
    this.aimAt(this.aimPoint);
  }

  // Turn the turret and gun towards a world point.
  aimAt(p) {
    const tp = this._turretPivot(tmp2);
    const dx = p.x - tp.x;
    const dz = p.z - tp.z;
    this.aimYaw = Math.atan2(-dx, -dz);
    this.aimPitch = Math.atan2(p.y - (tp.y + 0.38), Math.hypot(dx, dz));
  }

  // Camera: chase view orbiting the turret, or the gunner's sight when zoomed.
  _cameraPose(outPos) {
    const tp = this._turretPivot(_tp);
    if (this.zoom) {
      const gy = this.gunYaw;
      return outPos.set(tp.x - Math.sin(gy) * 1.6 - Math.cos(gy) * 0.6, tp.y + 1.05, tp.z - Math.cos(gy) * 1.6 + Math.sin(gy) * 0.6);
    }
    const d = dirFromAngles(this.camYaw, this.camPitch, outPos);
    const dist = 11.5;
    return outPos.set(tp.x - d.x * dist, tp.y + 3.0 - d.y * dist, tp.z - d.z * dist);
  }

  updateCamera(camera, dt, game) {
    const want = this._cameraPose(new THREE.Vector3());
    if (!this.zoom) {
      // keep the camera out of buildings
      const tp = this._turretPivot(new THREE.Vector3());
      tp.y += 1.6;
      const dx = want.x - tp.x;
      const dy = want.y - tp.y;
      const dz = want.z - tp.z;
      const len = Math.hypot(dx, dy, dz);
      const hit = game.world.raycast(tp.x, tp.y, tp.z, dx / len, dy / len, dz / len, len, 'move');
      if (hit) want.set(tp.x + (dx / len) * (hit.t - 0.4), tp.y + (dy / len) * (hit.t - 0.4), tp.z + (dz / len) * (hit.t - 0.4));
      if (want.y < this.pos.y + 0.6) want.y = this.pos.y + 0.6;
    }
    if (!this.camPos || this.zoom || this.camSnap) this.camPos = want.clone();
    else this.camPos.lerp(want, damp(18, dt));
    this.camSnap = this.zoom;
    camera.position.copy(this.camPos);
    const shake = game.playerCtl.shake ** 2;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.camPitch + (Math.random() - 0.5) * shake * 0.05, this.camYaw + (Math.random() - 0.5) * shake * 0.05, 0);
    game.playerCtl.shake = Math.max(0, game.playerCtl.shake - dt * 1.8);
    const base = game.settings.fov;
    const vfov = (2 * Math.atan(Math.tan((base * DEG) / 2) * (9 / 16))) / DEG;
    const fov = this.zoom ? vfov / 3.2 : vfov;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ simulation

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this._updateWreck(dt);
      return;
    }
    const inp = this.input;
    const frozen = g.time < g.match.startAt;
    // tracks
    const want = frozen ? 0 : inp.throttle > 0 ? inp.throttle * TANK.forward : inp.throttle * TANK.reverse;
    const rate = Math.sign(want) !== Math.sign(this.speed) && Math.abs(this.speed) > 0.2 ? TANK.brake : want === 0 ? TANK.brake * 0.6 : TANK.accel;
    this.speed = approach(this.speed, want, rate * dt);
    const turnWant = (frozen ? 0 : inp.steer) * TANK.turn * (Math.abs(this.speed) > 6 ? 0.75 : 1) * (this.speed < -0.5 ? -1 : 1);
    this.spin = approach(this.spin, turnWant, dt * 2.5);
    this.yaw += this.spin * dt;
    const f = this.forwardDir;
    const ox = this.pos.x;
    const oz = this.pos.z;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this._collideWorld(ox, oz);
    this._place(dt);

    // turret follows the aim (relative to the hull, so it counter-rotates as the hull turns)
    const rel = wrapAngle(this.aimYaw - this.yaw - this.turretYaw);
    this.turretYaw = wrapAngle(this.turretYaw + clamp(rel, -TANK.turretSpeed * dt, TANK.turretSpeed * dt));
    this.gunPitch = approach(this.gunPitch, clamp(this.aimPitch, TANK.gunMin, TANK.gunMax), TANK.gunSpeed * dt);

    // weapons
    this.reload = Math.max(0, this.reload - dt);
    if (this.reload === 0 && this.reloadSound) {
      this.reloadSound = false;
      g.audio.play('clank', { pos: this.driver === g.player ? undefined : this.pos });
    }
    if (!frozen && inp.fire && this.reload <= 0) this.fireCannon();
    this.mgCool = Math.max(-1, this.mgCool - dt);
    this.mgLocked = Math.max(0, this.mgLocked - dt);
    if (this.mgCool <= -0.3) this.mgHeat = Math.max(0, this.mgHeat - dt * 0.3);
    if (!frozen && inp.mg && this.mgCool <= 0 && this.mgLocked <= 0) this.fireMG();
    this.recoil = Math.max(0, this.recoil - dt * 2.5);

    // burning when badly damaged
    if (this.hp < this.maxHp * 0.35) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.18;
        const back = tmp.copy(this.pos).addScaledVector(f, -2.6);
        back.y += 1.8;
        g.fx.puff(back, [0.1, 1.4, 0], 0.7, 2.4, 0x2a2826, 0.6);
      }
    }
    // slow self-repair up to 40% when out of combat
    if (g.time - this.lastHit > 10 && this.hp < this.maxHp * 0.4) this.hp = Math.min(this.maxHp * 0.4, this.hp + 20 * dt);

    this._crushActors(dt);
    if (this.driver) {
      this.driver.pos.copy(this.pos);
      this.driver.yaw = this.gunYaw;
      this.driver.pitch = this.gunPitch;
      this.driver.vel.set(f.x * this.speed, 0, f.z * this.speed);
    }
    // dust from the tracks
    if (Math.abs(this.speed) > 4 && Math.random() < dt * 8) {
      const s = Math.random() < 0.5 ? -1 : 1;
      const p = tmp.set(this.pos.x - f.x * 3.4 * Math.sign(this.speed) + Math.cos(this.yaw) * 1.4 * s, this.pos.y + 0.3, this.pos.z - f.z * 3.4 * Math.sign(this.speed) - Math.sin(this.yaw) * 1.4 * s);
      g.fx.puff(p, [0, 0.5, 0], 0.6, 1.4, 0x9a8a70, 0.35);
    }
  }

  fireCannon() {
    const g = this.game;
    const pd = PROJECTILES.shell;
    const o = this.muzzleWorld(new THREE.Vector3());
    const d = this.gunDir(new THREE.Vector3());
    d.x += (Math.random() - 0.5) * 0.004;
    d.y += (Math.random() - 0.5) * 0.004;
    d.normalize();
    const owner = this.driver;
    g.combat.spawnProjectile('shell', owner, o, d.clone().multiplyScalar(pd.speed), { ignore: owner });
    this.reload = TANK.reload;
    this.reloadSound = true;
    this.recoil = 1;
    const isPlayer = owner === g.player;
    g.audio.play('cannon', { pos: isPlayer ? undefined : o });
    g.fx.flashLight(o, 30, 0.12, 0xffc070, 18);
    for (let i = 0; i < 5; i++) g.fx.puff(o.clone().addScaledVector(d, i * 0.6), [d.x * 2 + (Math.random() - 0.5), 0.3, d.z * 2 + (Math.random() - 0.5)], 1.1, 1.8, 0xb0aca4);
    g.fx.burst(o, 14, [d.x, d.y, d.z], 8, 4, 0.18, 0.08, [0xffd080, 0xffa040], 2);
    // muzzle blast kicks up dust around the tank
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      g.fx.puff(tmp.set(this.pos.x + Math.cos(a) * 2.5, this.pos.y + 0.3, this.pos.z + Math.sin(a) * 2.5), [Math.cos(a), 0.3, Math.sin(a)], 1.0, 1.5, 0xa89a80, 0.4);
    }
    if (isPlayer) g.shake(0.45);
    g.emitNoise(o, 160, owner, 'shot');
    if (owner) g.onShot(owner);
  }

  fireMG() {
    const g = this.game;
    const def = WEAPONS.tankmg;
    this.mesh.updateMatrixWorld(true);
    const o = this.model.coax.getWorldPosition(new THREE.Vector3());
    const d = this.gunDir(new THREE.Vector3());
    const sp = 0.6 * DEG;
    d.x += (Math.random() - 0.5) * sp * 2;
    d.y += (Math.random() - 0.5) * sp * 2;
    d.z += (Math.random() - 0.5) * sp * 2;
    d.normalize();
    // aim the MG from slightly ahead of the coax so it clears the mantlet
    const start = o.clone().addScaledVector(d, 0.8);
    const end = g.combat.fireBullet(this.driver, start, d, def, 1, 500);
    this.mgShots = (this.mgShots || 0) + 1;
    if (this.mgShots % 3 === 0) g.fx.tracer(start, end);
    this.mgCool = 60 / TANK.mgRpm;
    this.mgHeat += 0.03;
    if (this.mgHeat >= 1) {
      this.mgLocked = 2.5;
      this.mgHeat = 0.8;
    }
    const isPlayer = this.driver === g.player;
    g.audio.play('tankmg', { pos: isPlayer ? undefined : o, volume: isPlayer ? 0.6 : 1 });
    g.fx.flashLight(start, 3, 0.04);
    g.emitNoise(o, 80, this.driver, 'shot');
    if (this.driver) g.onShot(this.driver);
  }

  // Oriented-box vs world boxes: push the hull out of walls, flatten crushable props.
  _collideWorld(ox, oz) {
    const g = this.game;
    const world = g.world;
    const hw = TANK_DIMS.halfW;
    const hl = TANK_DIMS.halfL;
    const base = this.pos.y;
    let bumped = false;
    for (let iter = 0; iter < 4; iter++) {
      const c = Math.cos(this.yaw);
      const s = Math.sin(this.yaw);
      const fx = -s;
      const fz = -c;
      const rx = c;
      const rz = -s;
      const ext = Math.abs(fx) * hl + Math.abs(rx) * hw;
      const ezt = Math.abs(fz) * hl + Math.abs(rz) * hw;
      let best = null;
      world.forEachNear(this.pos.x - ext, this.pos.z - ezt, this.pos.x + ext, this.pos.z + ezt, (b) => {
        if (!b.k.move || b.removed) return;
        if (b.max[1] <= base + TANK.climb || b.min[1] >= base + 2.8) return;
        const bx = (b.min[0] + b.max[0]) / 2;
        const bz = (b.min[2] + b.max[2]) / 2;
        const hx = (b.max[0] - b.min[0]) / 2;
        const hz = (b.max[2] - b.min[2]) / 2;
        const dx = bx - this.pos.x;
        const dz = bz - this.pos.z;
        let minO = Infinity;
        let nx = 0;
        let nz = 0;
        for (const [ax, az] of [[1, 0], [0, 1], [fx, fz], [rx, rz]]) {
          const ra = hl * Math.abs(fx * ax + fz * az) + hw * Math.abs(rx * ax + rz * az);
          const rb = hx * Math.abs(ax) + hz * Math.abs(az);
          const dist = dx * ax + dz * az;
          const o = ra + rb - Math.abs(dist);
          if (o <= 0) return; // separated
          if (o < minO) {
            minO = o;
            const sg = dist > 0 ? -1 : 1;
            nx = ax * sg;
            nz = az * sg;
          }
        }
        // crushable prop? flatten it instead of stopping
        if (b.group && b.group.crush && !b.group.destroyed) {
          if (Math.abs(this.speed) > 0.6 || Math.abs(this.spin) > 0.2) g.destruction.destroy(b.group, this.driver, 'crush');
          if (b.group.destroyed) return;
        }
        if (!best || minO > best.o) best = { o: minO, nx, nz };
      });
      if (!best) break;
      this.pos.x += best.nx * (best.o + 0.001);
      this.pos.z += best.nz * (best.o + 0.001);
      bumped = true;
      // lose speed when driving into the obstacle
      const f = this.forwardDir;
      const into = -(best.nx * f.x + best.nz * f.z) * Math.sign(this.speed);
      if (into > 0.3) this.speed *= 1 - into * 0.5;
    }
    if (bumped && Math.hypot(this.pos.x - ox, this.pos.z - oz) < 0.01) this.speed *= 0.8;
    // map edge
    const B = g.map.bounds;
    this.pos.x = clamp(this.pos.x, B.minX + 4, B.maxX - 4);
    this.pos.z = clamp(this.pos.z, B.minZ + 4, B.maxZ - 4);
  }

  // Sit the hull on the ground: height from the highest support under the hull,
  // pitch and roll from front/back and left/right samples (visual only).
  _place(dt) {
    const world = this.game.world;
    const f = this.forwardDir;
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const top = this.pos.y + TANK.climb;
    const h = (a, b) => {
      const x = this.pos.x + f.x * a + rx * b;
      const z = this.pos.z + f.z * a + rz * b;
      return world.supportHeight(x, z, top, this.pos.y - 3) ?? 0;
    };
    const fr = Math.max(h(3, -1.2), h(3, 1.2));
    const bk = Math.max(h(-3, -1.2), h(-3, 1.2));
    const lf = Math.max(h(2, -1.4), h(-2, -1.4));
    const rt = Math.max(h(2, 1.4), h(-2, 1.4));
    const ctr = h(0, 0);
    const y = Math.max(ctr, (fr + bk) / 2, (lf + rt) / 2);
    this.pos.y += (y - this.pos.y) * Math.min(1, dt * 12);
    const wantPitch = clamp(Math.atan2(fr - bk, 6), -0.25, 0.25);
    const wantRoll = clamp(Math.atan2(rt - lf, 2.8), -0.2, 0.2);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 8);
    this.roll += (wantRoll - this.roll) * Math.min(1, dt * 8);
    this.syncMesh();
  }

  syncMesh() {
    const m = this.model;
    this.mesh.position.copy(this.pos);
    // a little squat under acceleration and when the gun fires
    const accelPitch = -this.recoil * 0.035;
    this.mesh.rotation.set(this.pitch + accelPitch, this.yaw, this.roll);
    m.turret.rotation.y = this.turretYaw;
    m.gun.rotation.x = this.gunPitch;
    m.gun.position.z = -1.95 + this.recoil * 0.35;
    // in the gunner's sight we're inside the turret
    this.mesh.visible = !(this.alive && this.driver === this.game.player && this.zoom);
  }

  // Run over enemies, shove friendlies aside.
  _crushActors() {
    const g = this.game;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const hw = TANK_DIMS.halfW + PHYS.radius;
    const hl = TANK_DIMS.halfL + PHYS.radius;
    for (const a of g.actors) {
      if (!a.alive || a.vehicle) continue;
      if (a.pos.y > this.pos.y + 2.2 || a.pos.y + a.height < this.pos.y) continue;
      const dx = a.pos.x - this.pos.x;
      const dz = a.pos.z - this.pos.z;
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
      const enemy = !this.driver || a.team !== this.team || g.match.friendlyFire;
      const moving = Math.abs(this.speed) > 2.2 || Math.abs(this.spin) > 0.5;
      if (enemy && moving && a.spawnProtect <= 0) {
        g.fx.blood(a.pos.clone().setY(a.pos.y + 0.6), this.forwardDir, true);
        g.damage(a, 400, this.driver, 'roadkill', 'body', this.pos);
        continue;
      }
      // push out of the nearest side
      const ox = hw - Math.abs(lx);
      const oz = hl - Math.abs(lz);
      let px = 0;
      let pz = 0;
      if (ox < oz) px = Math.sign(lx || 1) * ox;
      else pz = Math.sign(lz || 1) * oz;
      // back to world space
      const wx = px * c + pz * s;
      const wz = -px * s + pz * c;
      nudgeBody(g.world, a, wx, wz);
    }
  }

  // ------------------------------------------------------------------ damage

  onDestroyed() {
    const g = this.game;
    this.alive = false;
    this.deadT = 0;
    this.speed = 0;
    // blacken the hull
    const burnt = new THREE.MeshLambertMaterial({ color: 0x24221f });
    this.mesh.traverse((o) => {
      if (o.isMesh) o.material = burnt;
    });
    this.model.crew.visible = false;
    // the turret pops off
    this.turretVel = new THREE.Vector3((Math.random() - 0.5) * 3, 9 + Math.random() * 3, (Math.random() - 0.5) * 3);
    this.turretSpin = (Math.random() - 0.5) * 4;
    this.turretY = 0;
    g.fx.smokeColumn(tmp.copy(this.pos).setY(this.pos.y + 1.8), 22, 1.6);
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }

  _updateWreck(dt) {
    this.deadT += dt;
    const t = this.model.turret;
    if (this.turretVel) {
      this.turretVel.y -= 20 * dt;
      t.position.addScaledVector(this.turretVel, dt);
      t.rotation.y += this.turretSpin * dt;
      t.rotation.x += this.turretSpin * 0.2 * dt;
      if (t.position.y < 0.9 && this.turretVel.y < 0) {
        t.position.y = 0.9;
        this.turretVel = null;
      }
    }
    // the wreck still blocks other vehicles and people
    this._crushActors(dt);
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }

  // Engine sound, positional for everyone except the driver.
  updateSound(audio, listenerIsDriver) {
    if (!this.alive) return;
    if (!this.engine) this.engine = audio.engine('tank');
    if (!this.engine) return;
    const load = clamp(Math.abs(this.input.throttle) * 0.7 + Math.abs(this.speed) / TANK.forward * 0.3, 0, 1);
    this.engine.update(listenerIsDriver ? null : this.pos, load, Math.abs(this.speed), 1);
  }
}
