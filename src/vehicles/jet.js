// Eurofighter Typhoon: arcade "mouse-aim" flight. The mouse points the camera and
// the jet banks and pulls to follow it. Cannon, unguided rockets and free-fall bombs.

import * as THREE from 'three';
import { buildJet } from './models.js';
import { PROJECTILES } from '../combat.js';
import { WEAPONS } from '../weapons/defs.js';
import { rayBox } from '../physics.js';
import { clamp, damp, DEG, dirFromAngles } from '../util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qInv = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const AY = new THREE.Vector3(0, 1, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const BOXES = [
  { min: [-0.95, -1.25, -8.3], max: [0.95, 1.05, 9.0] },
  { min: [-5.6, -0.35, -1.6], max: [5.6, 0.2, 5.0] },
  { min: [-0.2, 0.8, 3.2], max: [0.2, 4.4, 7.6] },
];

export const JET = {
  maxHp: 320,
  minSpeed: 34,
  stall: 44,
  cruise: [52, 125], // speed at 0% and 100% throttle
  boost: 168,
  pitchRate: 1.25,
  rollRate: 3.3,
  yawRate: 0.4,
  cannonRpm: 1100,
  rockets: 14,
  bombs: 4,
  ceiling: 460,
  arena: { x: 720, z: 640 },
};

export class Jet {
  constructor(game, team, pos, yaw) {
    this.kind = 'jet';
    this.game = game;
    this.team = team;
    this.model = buildJet(team);
    this.mesh = this.model.root;
    this.pos = new THREE.Vector3(pos[0], pos[1], pos[2]);
    this.quat = new THREE.Quaternion().setFromAxisAngle(AY, yaw);
    this.speed = 92;
    this.throttle = 0.65;
    this.boost = false;
    this.w = new THREE.Vector3(); // angular velocity: x pitch, y yaw, z roll (local)
    this.hp = JET.maxHp;
    this.maxHp = JET.maxHp;
    this.alive = true;
    this.radius = 6;
    this.driver = null;
    this.lastHit = -10;
    this.lastAttacker = null;
    this.cannonCool = 0;
    this.heat = 0;
    this.heatLock = 0;
    this.rockets = JET.rockets;
    this.bombs = JET.bombs;
    this.rocketCool = 0;
    this.bombCool = 0;
    this.rearmT = 0;
    this.lastOrdnance = -10;
    this.secondary = 0; // 0 rockets, 1 bombs
    this.podSide = 1;
    this.camYaw = yaw;
    this.camPitch = 0;
    this.camPos = null;
    this.aimDir = dirFromAngles(yaw, 0, new THREE.Vector3());
    this.returning = false;
    this.input = { throttle: 0, roll: 0, yaw: 0, boost: false, fire: false, fire2: false, fire2Pressed: false };
    this.engine = null;
    this.vel = new THREE.Vector3();
    this.deadT = 0;
    this.shots = 0;
    this.syncMesh();
  }

  get forward() {
    return tmp.set(0, 0, -1).applyQuaternion(this.quat);
  }

  axis(v, out) {
    return out.copy(v).applyQuaternion(this.quat);
  }

  // ------------------------------------------------------------------ player controls

  control(game, input, dt, mouse) {
    const S = game.settings;
    const sens = 0.0011 * S.sensitivity;
    this.camYaw -= mouse.x * sens;
    this.camPitch = clamp(this.camPitch - mouse.y * sens * (S.invertY ? -1 : 1), -1.45, 1.45);
    dirFromAngles(this.camYaw, this.camPitch, this.aimDir);
    const inp = this.input;
    inp.throttle = (input.held('forward') ? 1 : 0) - (input.held('back') ? 1 : 0);
    inp.roll = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    inp.yaw = (input.held('leanRight') ? 1 : 0) - (input.held('leanLeft') ? 1 : 0);
    inp.boost = input.held('sprint');
    inp.fire = input.mouseHeld(0);
    inp.fire2 = input.mouseHeld(2);
    inp.fire2Pressed = input.mouseHit(2);
    if (input.hit('primary')) this.secondary = 0;
    if (input.hit('secondary')) this.secondary = 1;
    if (input.takeWheel()) this.secondary = 1 - this.secondary;
  }

  updateCamera(camera, dt, game) {
    const d = dirFromAngles(this.camYaw, this.camPitch, tmp2);
    const want = new THREE.Vector3(this.pos.x - d.x * 26, this.pos.y - d.y * 26 + 5.5, this.pos.z - d.z * 26);
    if (want.y < 1.5) want.y = 1.5;
    if (!this.camPos) this.camPos = want.clone();
    // stiff follow so the jet stays put on screen even at 150 m/s
    this.camPos.lerp(want, damp(14, dt));
    this.camPos.addScaledVector(this.vel, dt * (1 - damp(14, dt)));
    camera.position.copy(this.camPos);
    const sh = game.playerCtl.shake ** 2;
    game.playerCtl.shake = Math.max(0, game.playerCtl.shake - dt * 1.8);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(this.camPitch + (Math.random() - 0.5) * sh * 0.04, this.camYaw + (Math.random() - 0.5) * sh * 0.04, 0);
    const base = game.settings.fov;
    const vfov = (2 * Math.atan(Math.tan((base * DEG) / 2) * (9 / 16))) / DEG;
    const fov = vfov + (this.boost ? 6 : 0) + Math.min(6, (this.speed - 90) * 0.05);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * damp(4, dt);
      camera.updateProjectionMatrix();
    }
  }

  // ------------------------------------------------------------------ flight

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this._updateWreck(dt);
      return;
    }
    const inp = this.input;
    const F = this.axis(new THREE.Vector3(0, 0, -1), new THREE.Vector3());
    const U = this.axis(AY, new THREE.Vector3());
    const R = this.axis(AX, new THREE.Vector3());

    // air boundary: outside the arena (or too high) the autopilot turns you back
    const A = JET.arena;
    const out = Math.abs(this.pos.x) > A.x || Math.abs(this.pos.z) > A.z || this.pos.y > JET.ceiling;
    if (out && !this.returning) this.returning = true;
    if (this.returning && Math.abs(this.pos.x) < A.x - 120 && Math.abs(this.pos.z) < A.z - 120 && this.pos.y < JET.ceiling - 60) this.returning = false;
    let aim = this.aimDir;
    if (this.returning) aim = tmp2.set(-this.pos.x, 140 - this.pos.y, -this.pos.z).normalize();
    // ground avoidance for the last few metres (keeps arcade flying forgiving)
    if (this.pos.y < 18 && F.y < 0.05 && !this.driver?.isPlayer) aim = tmp2.copy(F).setY(0.5).normalize();

    // mouse-aim autopilot: bank towards the aim point, then pull
    const lx = aim.dot(R);
    const ly = aim.dot(U);
    const lz = aim.dot(F);
    const off = Math.acos(clamp(lz, -1, 1));
    let pitchIn = clamp(ly * 4, -1, 1);
    if (lz < 0 && Math.abs(ly) < 0.2) pitchIn = 1; // target behind: pull hard
    let yawIn = clamp(lx * 3, -1, 1);
    const aggressive = clamp(lx * 4, -1, 1) * (ly < 0 && off > 0.6 ? -1 : 1);
    const level = clamp(R.y * 3, -1, 1);
    const k = clamp(off / (12 * DEG), 0, 1);
    let rollIn = level + (aggressive - level) * k;
    // manual overrides
    if (inp.roll) rollIn = inp.roll;
    if (inp.yaw) yawIn = inp.yaw;
    const authority = clamp((this.speed - 28) / 55, 0.3, 1);
    const target = tmp.set(pitchIn * JET.pitchRate * authority, -yawIn * JET.yawRate * authority, -rollIn * JET.rollRate);
    this.w.lerp(target, damp(5, dt));
    // stalling: the nose drops
    if (this.speed < JET.stall) this.w.x -= (JET.stall - this.speed) * 0.03 * dt;
    qa.setFromAxisAngle(AX, this.w.x * dt);
    this.quat.multiply(qa);
    qa.setFromAxisAngle(AY, this.w.y * dt);
    this.quat.multiply(qa);
    qa.setFromAxisAngle(AZ, this.w.z * dt);
    this.quat.multiply(qa);
    this.quat.normalize();

    // throttle and speed
    this.throttle = clamp(this.throttle + inp.throttle * dt * 0.6, 0, 1);
    this.boost = inp.boost && this.throttle > 0.2;
    const want = this.boost ? JET.boost : JET.cruise[0] + (JET.cruise[1] - JET.cruise[0]) * this.throttle;
    this.speed += (want - this.speed) * 0.35 * dt;
    this.speed -= F.y * 9.8 * 0.7 * dt; // climbing costs speed, diving gains it
    this.speed -= Math.abs(this.w.x) * this.speed * 0.04 * dt; // hard turns bleed energy
    this.speed = clamp(this.speed, JET.minSpeed, 210);
    this.axis(new THREE.Vector3(0, 0, -1), F);
    this.vel.copy(F).multiplyScalar(this.speed);
    if (this.speed < JET.stall) this.vel.y -= (JET.stall - this.speed) * 0.6;
    const from = tmp2.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    this.syncMesh();
    if (this._checkCrash(from, dt)) return;

    // weapons
    const frozen = g.time < g.match.startAt;
    this.cannonCool = Math.max(-1, this.cannonCool - dt);
    this.heatLock = Math.max(0, this.heatLock - dt);
    if (this.cannonCool < -0.3) this.heat = Math.max(0, this.heat - dt * 0.3);
    if (!frozen && inp.fire && this.cannonCool <= 0 && this.heatLock <= 0) this._fireCannon(F);
    this.rocketCool = Math.max(0, this.rocketCool - dt);
    this.bombCool = Math.max(0, this.bombCool - dt);
    if (!frozen && inp.fire2) {
      if (this.secondary === 0 && this.rocketCool <= 0 && this.rockets > 0) this._fireRocket(F);
      else if (this.secondary === 1 && this.bombCool <= 0 && this.bombs > 0) this._dropBomb();
    }
    // rearm slowly when not firing ordnance
    if (g.time - this.lastOrdnance > 3) {
      this.rearmT += dt;
      if (this.rearmT > 2.4) {
        this.rearmT = 0;
        if (this.rockets < JET.rockets) this.rockets++;
        if ((this.bombT = (this.bombT || 0) + 1) >= 4 && this.bombs < JET.bombs) {
          this.bombT = 0;
          this.bombs++;
        }
      }
    }
    // smoke trail when damaged
    if (this.hp < this.maxHp * 0.4 && Math.random() < dt * 30) g.fx.puff(this.pos.clone().addScaledVector(F, -9), [0, 0.2, 0], 1.2, 2.5, 0x2a2826, 0.6);
    if (this.driver) {
      this.driver.pos.copy(this.pos);
      this.driver.yaw = Math.atan2(-F.x, -F.z);
      this.driver.pitch = Math.asin(clamp(F.y, -1, 1));
      this.driver.vel.copy(this.vel);
    }
  }

  syncMesh() {
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    const g = 0.5 + this.throttle * 0.5 + (this.boost ? 0.9 : 0);
    for (const gl of this.model.glows) {
      gl.scale.set(0.6 + g * 0.4, 0.4 + g * (0.8 + Math.random() * 0.2), 0.6 + g * 0.4);
      gl.material.opacity = 0.25 + g * 0.35;
    }
    this.model.stores[0].visible = this.model.stores[2].visible = this.rockets > 0;
    this.model.stores[1].visible = this.bombs > 0;
    this.model.stores[3].visible = this.bombs > 1;
  }

  // Ground, buildings, hills and other jets.
  _checkCrash(from, dt) {
    const g = this.game;
    let hit = this.pos.y < 1.5;
    const d = tmp.copy(this.pos).sub(from);
    const len = d.length();
    if (!hit && len > 0 && this.pos.y < 40) {
      d.divideScalar(len);
      const h = g.world.raycast(from.x, from.y, from.z, d.x, d.y, d.z, len + 2, 'bullet');
      if (h && h.box.kind !== 'glass') hit = true;
    }
    if (!hit) {
      for (const hl of g.map.hills) {
        const dx = (this.pos.x - hl.x) / hl.rx;
        const dz = (this.pos.z - hl.z) / hl.rz;
        if (dx * dx + dz * dz > 1) continue;
        const dy = (this.pos.y + 2) / (hl.h + 2);
        if (dx * dx + dy * dy + dz * dz < 1) {
          hit = true;
          break;
        }
      }
    }
    if (!hit) {
      for (const v of g.vehicles) {
        if (v === this || v.kind !== 'jet' || !v.alive) continue;
        if (v.pos.distanceToSquared(this.pos) < 25) {
          g.destroyVehicle(v, this.driver, 'crash');
          hit = true;
        }
      }
    }
    if (hit) {
      this.pos.y = Math.max(this.pos.y, 1);
      g.destroyVehicle(this, null, 'crash');
      return true;
    }
    void dt;
    return false;
  }

  _fireCannon(F) {
    const g = this.game;
    const o = this.axis(tmp2.set(0.75, 0.25, -6.6), new THREE.Vector3()).add(this.pos);
    const d = F.clone();
    const sp = 0.35 * DEG;
    d.x += (Math.random() - 0.5) * sp * 2;
    d.y += (Math.random() - 0.5) * sp * 2;
    d.z += (Math.random() - 0.5) * sp * 2;
    d.normalize();
    const start = o.addScaledVector(d, 2);
    const end = g.combat.fireBullet(this.driver, start, d, WEAPONS.jetcannon, 1, 700);
    this.shots++;
    if (this.shots % 2 === 0) g.fx.tracer(start, end);
    this.cannonCool = 60 / JET.cannonRpm;
    this.heat += 0.014;
    if (this.heat >= 1) {
      this.heatLock = 2.5;
      this.heat = 0.85;
    }
    const isPlayer = this.driver === g.player;
    if (this.shots % 2 === 0) g.audio.play('jetcannon', { pos: isPlayer ? undefined : start, volume: isPlayer ? 0.55 : 1 });
    g.fx.flashLight(start, 4, 0.04);
    g.emitNoise(start, 120, this.driver, 'shot');
    if (this.driver) g.onShot(this.driver);
  }

  _fireRocket(F) {
    const g = this.game;
    this.podSide = -this.podSide;
    const o = this.axis(tmp2.set(this.podSide * 2.4, -0.7, 0.6), new THREE.Vector3()).add(this.pos);
    const v = F.clone().multiplyScalar(PROJECTILES.jetRocket.speed + this.speed * 0.85);
    g.combat.spawnProjectile('jetRocket', this.driver, o, v, { ignore: this.driver });
    this.rockets--;
    this.rocketCool = 0.16;
    this.lastOrdnance = g.time;
    g.audio.play('jetRocket', { pos: this.driver === g.player ? undefined : o });
  }

  _dropBomb() {
    const g = this.game;
    const side = this.bombs % 2 ? 1 : -1;
    const o = this.axis(tmp2.set(side * 3.8, -1.0, 3.1), new THREE.Vector3()).add(this.pos);
    const v = this.vel.clone();
    v.y -= 2;
    g.combat.spawnProjectile('bomb', this.driver, o, v, { ignore: this.driver });
    this.bombs--;
    this.bombCool = 0.55;
    this.lastOrdnance = g.time;
    g.audio.play('bombDrop', { pos: this.driver === g.player ? undefined : o });
    g.later(0.6, () => g.audio.play('bombWhistle', { pos: o }));
  }

  // Where a bomb released right now would land (for the HUD pipper and bots).
  predictBomb(out) {
    const gr = PROJECTILES.bomb.gravity;
    let x = this.pos.x;
    let y = this.pos.y - 1;
    let z = this.pos.z;
    let vx = this.vel.x;
    let vy = this.vel.y - 2;
    let vz = this.vel.z;
    const h = 0.04;
    for (let t = 0; t < 14; t += h) {
      vy -= gr * h;
      x += vx * h;
      y += vy * h;
      z += vz * h;
      if (y <= 0.3) break;
    }
    return out.set(x, Math.max(0, y), z);
  }

  rayHit(o, d, tMin, tMax) {
    const cx = this.pos.x - o.x;
    const cy = this.pos.y - o.y;
    const cz = this.pos.z - o.z;
    const along = clamp(cx * d.x + cy * d.y + cz * d.z, tMin, tMax);
    const px = cx - d.x * along;
    const py = cy - d.y * along;
    const pz = cz - d.z * along;
    if (px * px + py * py + pz * pz > 110) return null;
    qInv.copy(this.quat).invert();
    const lo = tmp.set(o.x - this.pos.x, o.y - this.pos.y, o.z - this.pos.z).applyQuaternion(qInv);
    const ld = tmp2.copy(d).applyQuaternion(qInv);
    let best = null;
    for (const b of BOXES) {
      const r = rayBox(lo.x, lo.y, lo.z, 1 / ld.x, 1 / ld.y, 1 / ld.z, b);
      if (r && r.t0 >= tMin && r.t0 <= tMax && (best === null || r.t0 < best)) best = r.t0;
    }
    return best;
  }

  isRearHit() {
    return false;
  }

  // ------------------------------------------------------------------ death

  onDestroyed() {
    const g = this.game;
    this.alive = false;
    this.deadT = 0;
    this.landed = this.pos.y < 3;
    const burnt = new THREE.MeshLambertMaterial({ color: 0x262422 });
    this.mesh.traverse((o) => {
      if (o.isMesh && !o.material.isMeshBasicMaterial) o.material = burnt;
    });
    for (const gl of this.model.glows) gl.visible = false;
    this.model.pilot.visible = false;
    this.spinAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 1).normalize();
    this.vel.multiplyScalar(0.55);
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }
    if (this.landed) g.fx.smokeColumn(this.pos.clone(), 18, 1.4);
  }

  _updateWreck(dt) {
    const g = this.game;
    this.deadT += dt;
    if (this.landed) return;
    this.vel.y -= 20 * dt;
    this.vel.multiplyScalar(1 - 0.2 * dt);
    this.pos.addScaledVector(this.vel, dt);
    qa.setFromAxisAngle(this.spinAxis, dt * 3);
    this.quat.multiply(qa);
    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.quat);
    if (Math.random() < dt * 40) g.fx.puff(this.pos.clone(), [0, 0.3, 0], 2, 3, 0x2a2826, 0.7);
    if (Math.random() < dt * 20) g.fx.emit(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.4, 0.15, 0xff9030, 2);
    let ground = this.pos.y < 1;
    if (!ground && this.pos.y < 30) ground = !!g.world.pointInside(this.pos.x, this.pos.y, this.pos.z);
    if (ground) {
      this.landed = true;
      this.pos.y = Math.max(0.8, this.pos.y);
      this.mesh.position.copy(this.pos);
      g.fx.explosion(this.pos, 1.3);
      g.audio.play('explosion', { pos: this.pos });
      g.fx.smokeColumn(this.pos.clone(), 18, 1.4);
      g.destruction.blast(this.pos, 6, 300, null);
    }
  }

  dispose() {
    this.game.scene.remove(this.mesh);
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }

  updateSound(audio, listenerIsDriver) {
    if (!this.alive) return;
    if (!this.engine) this.engine = audio.engine('jet');
    if (!this.engine) return;
    const load = clamp(this.throttle * 0.7 + (this.boost ? 0.3 : 0), 0, 1);
    this.engine.update(listenerIsDriver ? null : this.pos, load, this.speed, 1);
  }
}
