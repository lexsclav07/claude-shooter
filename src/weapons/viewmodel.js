// First-person weapon + Clawd's stubby orange arms, rendered in their own scene so
// they never clip into walls. Handles bob, sway, recoil kick and action animations.

import * as THREE from 'three';
import { buildGun } from './models.js';
import { CLAUDE_ORANGE } from '../actors/mascot.js';
import { flashTexture } from '../world/textures.js';
import { clamp, damp, lerp } from '../util.js';

const POSES = {
  rifle: { hip: [0.2, -0.2, -0.5], ads: -0.3, fore: [0, -0.03, -0.32] },
  smg: { hip: [0.19, -0.19, -0.46], ads: -0.3, fore: [0, -0.03, -0.27] },
  shotgun: { hip: [0.2, -0.2, -0.52], ads: -0.33, fore: [0, -0.03, -0.34] },
  sniper: { hip: [0.2, -0.2, -0.52], ads: -0.26, fore: [0, -0.04, -0.33] },
  pistol: { hip: [0.16, -0.17, -0.46], ads: -0.36, fore: [-0.03, -0.07, 0.02] },
  melee: { hip: [0.2, -0.19, -0.42], ads: -0.36, fore: null },
  launcher: { hip: [0.2, -0.12, -0.16], ads: -0.2, fore: [0, -0.04, -0.3] },
  c4: { hip: [0.15, -0.17, -0.36], ads: -0.36, fore: null },
  mine: { hip: [0.12, -0.24, -0.42], ads: -0.42, fore: [-0.17, 0, 0] },
};

const smooth = (t) => t * t * (3 - 2 * t);

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xe8eef8, 0x7a6a58, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
    sun.position.set(-0.6, 1, 0.4);
    this.scene.add(sun);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    this.scene.add(this.flashLight);

    this.root = new THREE.Group(); // pose, moved to hip/ads
    this.camera.add(this.root);
    this.anim = new THREE.Group(); // procedural animation on top
    this.root.add(this.anim);
    this.holder = new THREE.Group();
    this.anim.add(this.holder);

    this.armMat = new THREE.MeshLambertMaterial({ color: CLAUDE_ORANGE });
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.armR = new THREE.Mesh(box, this.armMat);
    this.armL = new THREE.Mesh(box, this.armMat);
    this.handR = new THREE.Mesh(box, this.armMat);
    this.handL = new THREE.Mesh(box, this.armMat);
    for (const m of [this.armR, this.armL, this.handR, this.handL]) this.holder.add(m);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.22),
      new THREE.MeshBasicMaterial({ map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.flash.visible = false;
    this.flashT = 0;

    this.medkit = buildGun('medkit');
    this.medkit.group.visible = false;
    this.root.add(this.medkit.group);
    this.nade = buildGun('grenade');
    this.nade.group.visible = false;
    this.root.add(this.nade.group);
    this.smokeNade = buildGun('smokeGrenade');
    this.smokeNade.group.visible = false;
    this.root.add(this.smokeNade.group);
    this.detonator = buildGun('detonator');
    this.detonator.group.position.set(-0.17, -0.03, 0.03);
    this.detonator.group.rotation.set(0.4, 0.3, 0);

    this.shells = [];
    const shellGeo = new THREE.BoxGeometry(0.005, 0.005, 0.014);
    const shellMat = new THREE.MeshLambertMaterial({ color: 0xc8a040 });
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(shellGeo, shellMat);
      s.visible = false;
      this.camera.add(s);
      this.shells.push({ m: s, v: new THREE.Vector3(), t: 0 });
    }
    this.shellIdx = 0;

    this.gun = null;
    this.model = null;
    this.cls = 'rifle';
    this.bob = 0;
    this.sway = new THREE.Vector2();
    this.kick = 0;
    this.kickRot = 0;
    this.sprintT = 0;
    this.swingT = 1;
    this.swingSide = 1;
    this.inspectT = 0;
    this.landT = 0;
    this.time = 0;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(def) {
    if (this.model === def.model) return;
    this.model = def.model;
    this.cls = def.cls;
    if (this.gun) this.holder.remove(this.gun.group);
    this.gun = buildGun(def.model);
    this.holder.add(this.gun.group);
    if (def.cls === 'c4') this.holder.add(this.detonator.group);
    else this.holder.remove(this.detonator.group);
    this.gun.muzzle.add(this.flash);
    this.flash.position.set(0, 0, -0.06);
    this._layoutArms();
    this.inspectT = 0;
  }

  // Place Clawd's arm blocks so they reach the grip and fore-grip.
  _layoutArms() {
    const pose = POSES[this.cls] || POSES.rifle;
    const place = (mesh, from, to, thick) => {
      const a = new THREE.Vector3(...from);
      const b = new THREE.Vector3(...to);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.scale.set(thick, thick, a.distanceTo(b));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.sub(a).normalize());
    };
    // Clawd's arms are short orange nubs: a block reaching up to each hand
    place(this.armR, [0.05, -0.22, 0.2], [0.0, -0.075, 0.04], 0.095);
    this.handR.position.set(0, -0.07, 0.03);
    this.handR.scale.set(0.085, 0.085, 0.085);
    if (pose.fore) {
      const f = pose.fore;
      place(this.armL, [f[0] - 0.12, f[1] - 0.2, f[2] + 0.12], [f[0], f[1] - 0.02, f[2]], 0.095);
      this.handL.position.set(f[0], f[1] - 0.02, f[2]);
      this.handL.scale.set(0.085, 0.085, 0.085);
      this.armL.visible = this.handL.visible = true;
    } else {
      this.armL.visible = this.handL.visible = false;
    }
  }

  fire(def) {
    const heavy = { sniper: 1.6, shotgun: 1.5, pistol: 1.1, rifle: 1, smg: 0.7, melee: 0, launcher: 2.6, c4: 0, mine: 0 }[def.cls] ?? 1;
    this.kick = Math.min(0.12, this.kick + 0.028 * heavy);
    this.kickRot = Math.min(0.35, this.kickRot + 0.05 * heavy);
    if (def.cls !== 'melee' && def.cls !== 'c4' && def.cls !== 'mine') {
      this.flashT = 0.045;
      this.flash.rotation.z = Math.random() * Math.PI;
      this.flash.scale.setScalar(def.cls === 'smg' ? 0.8 : def.cls === 'pistol' ? 0.7 : 1.1);
      this.flashLight.intensity = 3;
      if (def.cls !== 'shotgun' && def.cls !== 'sniper' && def.cls !== 'launcher' && def.model !== 'webley') this._ejectShell();
    }
    this.inspectT = 0;
  }

  swing() {
    this.swingT = 0;
    this.swingSide = -this.swingSide;
  }

  inspect() {
    if (this.inspectT <= 0) this.inspectT = 2.2;
  }

  land(v) {
    this.landT = Math.min(1, v / 12);
  }

  _ejectShell() {
    const s = this.shells[this.shellIdx++ % this.shells.length];
    if (!this.gun) return;
    const p = new THREE.Vector3(0.03, 0.04, -0.05);
    this.gun.group.localToWorld(p);
    this.camera.worldToLocal(p);
    s.m.position.copy(p);
    s.v.set(1.4 + Math.random() * 0.5, 1.1 + Math.random() * 0.5, 0.3);
    s.t = 0.4;
    s.m.visible = true;
  }

  // ctx: { actor, weapon, mouse: {x, y}, speed, roll, healProgress, throwProgress }
  update(dt, ctx) {
    this.time += dt;
    const a = ctx.actor;
    const w = ctx.weapon;
    if (!w) return;
    this.setWeapon(w.def);
    const def = w.def;
    const pose = POSES[def.cls] || POSES.rifle;
    const ads = smooth(clamp(a.adsT, 0, 1));
    this.sprintT += ((a.sprinting ? 1 : 0) - this.sprintT) * damp(10, dt);
    const sprint = smooth(this.sprintT);

    // position: hip -> ads
    const sightY = this.gun ? this.gun.sightY : 0.08;
    const sightX = this.gun && this.gun.sightX ? this.gun.sightX : 0;
    const hx = lerp(pose.hip[0], -sightX, ads);
    const hy = lerp(pose.hip[1], -sightY, ads);
    const hz = lerp(pose.hip[2], pose.ads, ads);
    this.root.position.set(hx, hy, hz);
    this.camera.rotation.z = ctx.roll || 0;

    // walk bob
    const sp = ctx.speed;
    const grounded = a.grounded;
    this.bob += dt * (grounded ? sp * 1.65 : 0);
    const bobAmp = Math.min(1, sp / 5) * (1 - ads * 0.88) * (a.sprinting ? 1.6 : 1) * (grounded ? 1 : 0.2);
    const bx = Math.sin(this.bob) * 0.011 * bobAmp;
    const by = -Math.abs(Math.cos(this.bob)) * 0.012 * bobAmp;
    // idle breathing
    const br = Math.sin(this.time * 1.6) * 0.0025 * (1 - ads * 0.7);

    // sway lags behind mouse movement
    const sx = clamp(-ctx.mouse.x * 0.00035, -0.05, 0.05);
    const sy = clamp(ctx.mouse.y * 0.00035, -0.05, 0.05);
    this.sway.x += (sx - this.sway.x) * damp(8, dt);
    this.sway.y += (sy - this.sway.y) * damp(8, dt);
    const swayK = 1 - ads * 0.75;

    // recoil spring
    this.kick += -this.kick * damp(14, dt);
    this.kickRot += -this.kickRot * damp(12, dt);
    this.landT += -this.landT * damp(6, dt);

    const an = this.anim;
    an.position.set(bx + this.sway.x * swayK * 0.6, by + br - this.landT * 0.04, this.kick);
    an.rotation.set(this.kickRot * (1 - ads * 0.5) + this.sway.y * swayK, this.sway.x * swayK * 1.5, 0);

    // sprint pose
    if (sprint > 0.001) {
      an.position.x += 0.05 * sprint;
      an.position.y -= 0.05 * sprint;
      an.rotation.y += 0.65 * sprint;
      an.rotation.x -= 0.25 * sprint;
      an.rotation.z += 0.15 * sprint;
    }

    // draw (switching weapons)
    if (a.switchT > 0) {
      const k = smooth(clamp(a.switchT / def.draw, 0, 1));
      an.position.y -= 0.22 * k;
      an.rotation.x -= 0.9 * k;
    }

    // reload
    if (w.reloadT > 0 && !def.shellReload) {
      const r = 1 - w.reloadT / def.reload;
      const dip = Math.sin(clamp(r, 0, 1) * Math.PI);
      an.rotation.z += 0.55 * dip;
      an.rotation.x -= 0.28 * dip;
      an.position.y -= 0.045 * dip;
      if (this.gun && this.gun.mag) {
        const out = r > 0.22 && r < 0.62;
        const m = out ? Math.min(1, (r - 0.22) / 0.08, (0.62 - r) / 0.08) : 0;
        this.gun.mag.position.y = this.gun.magY0 ?? (this.gun.magY0 = this.gun.mag.position.y);
        this.gun.mag.position.y -= 0.18 * m;
        this.gun.mag.visible = !(r > 0.3 && r < 0.54);
      }
    } else if (this.gun && this.gun.mag) {
      if (this.gun.magY0 !== undefined) this.gun.mag.position.y = this.gun.magY0;
      this.gun.mag.visible = true;
    }
    if (w.reloadT > 0 && def.shellReload) {
      const k = Math.sin(clamp(1 - w.reloadT / def.reload, 0, 1) * Math.PI);
      an.rotation.z += 0.35;
      an.rotation.x += 0.1 * k;
      an.position.y -= 0.03 + 0.02 * k;
    }
    // pump / bolt action after a shot
    if (this.gun && this.gun.pump) {
      const t = w.cooldown / (60 / def.rpm);
      const k = t > 0.15 && t < 0.75 ? Math.sin(((t - 0.15) / 0.6) * Math.PI) : 0;
      this.gun.pump.position.z = -0.34 + 0.09 * k;
    }
    if (this.gun && this.gun.bolt) {
      const t = w.boltT / (60 / def.rpm);
      const k = t > 0.15 && t < 0.85 ? Math.sin(((t - 0.15) / 0.7) * Math.PI) : 0;
      this.gun.bolt.rotation.z = 1.1 * Math.min(1, k * 2);
      this.gun.bolt.position.z = 0.12 + 0.08 * Math.max(0, k * 2 - 1);
    }

    // charges and mines leave the hand once used
    if (this.gun && (def.cls === 'c4' || def.cls === 'mine' || def.cls === 'launcher')) {
      this.gun.group.visible = w.ammo > 0 || (def.cls === 'launcher' && w.reloadT > 0 && w.reloadT < def.reload * 0.5);
    }

    // knife swing (also used for throwing C4 and placing mines)
    if (def.cls === 'melee' || def.cls === 'c4' || def.cls === 'mine') {
      this.swingT = Math.min(1, this.swingT + dt * 3.2);
      if (this.swingT < 1) {
        const s = Math.sin(this.swingT * Math.PI);
        an.rotation.y += 0.9 * s * this.swingSide;
        an.rotation.x -= 0.6 * s;
        an.position.x -= 0.12 * s * this.swingSide;
        an.position.z -= 0.12 * s;
      }
    }

    // inspect
    if (this.inspectT > 0 && w.reloadT <= 0 && !a.sprinting && a.adsT < 0.1) {
      this.inspectT -= dt;
      const k = smooth(clamp(Math.min(this.inspectT, 2.2 - this.inspectT) / 0.4, 0, 1));
      an.rotation.y -= 0.9 * k;
      an.rotation.z += 0.35 * k;
      an.position.x -= 0.06 * k;
      an.position.y += 0.03 * k;
    } else this.inspectT = 0;

    // healing / throwing take the gun off-screen
    const busy = ctx.healProgress >= 0 || ctx.throwProgress >= 0;
    this.holder.visible = !(def.scope && a.adsT > 0.92);
    this.medkit.group.visible = ctx.healProgress >= 0;
    const nade = ctx.throwType === 'smoke' ? this.smokeNade : this.nade;
    (ctx.throwType === 'smoke' ? this.nade : this.smokeNade).group.visible = false;
    nade.group.visible = ctx.throwProgress >= 0;
    if (busy) {
      an.position.y -= 0.3;
      an.rotation.x -= 0.6;
      this.holder.visible = false;
    }
    if (ctx.healProgress >= 0) {
      const h = ctx.healProgress;
      const m = this.medkit.group;
      const rise = smooth(clamp(h * 5, 0, 1));
      m.position.set(-0.14, 0.03 - (1 - rise) * 0.2 + Math.sin(h * 40) * 0.004, 0.02);
      m.rotation.set(0.35, 0.35, 0.15 + Math.sin(h * 25) * 0.05);
    }
    if (ctx.throwProgress >= 0) {
      const t = ctx.throwProgress;
      const g = nade.group;
      const wind = t < 0.6 ? smooth(t / 0.6) : 0;
      const fly = t > 0.6 ? (t - 0.6) / 0.4 : 0;
      g.position.set(-0.04, 0.05 + wind * 0.07 + fly * 0.1, 0.06 + wind * 0.05 - fly * 0.6);
      g.rotation.set(-0.3 * wind, 0, 0);
      g.visible = t < 0.7;
    }

    // muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 60);
    if (this.gun) this.gun.muzzle.getWorldPosition(this.flashLight.position);

    for (const s of this.shells) {
      if (!s.m.visible) continue;
      s.t -= dt;
      s.v.y -= 7 * dt;
      s.m.position.addScaledVector(s.v, dt * 0.6);
      s.m.rotation.x += dt * 20;
      s.m.rotation.y += dt * 13;
      if (s.t <= 0) s.m.visible = false;
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
