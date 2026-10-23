// Third-person model: Clawd, the little orange Claude mascot, kitted out per team.
// Built from boxes: a wide body with two tall black eyes, stubby arms and four legs.

import * as THREE from 'three';
import { TEAMS } from '../config.js';
import { buildGun } from '../weapons/models.js';

export const CLAUDE_ORANGE = 0xd97757;
const BOX = new THREE.BoxGeometry(1, 1, 1);
const LEG_H = 0.42;
const CROUCH_DROP = 0.37;

const shared = {};
function sharedMat(key, color) {
  if (!shared[key]) shared[key] = new THREE.MeshLambertMaterial({ color });
  return shared[key];
}

function part(parent, w, h, d, x, y, z, material, shadow = true) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

function markerTexture(color, text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 96;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillText(text, 129, 35);
  g.fillStyle = color;
  g.fillText(text, 128, 33);
  g.beginPath();
  g.moveTo(112, 58);
  g.lineTo(144, 58);
  g.lineTo(128, 84);
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Mascot {
  constructor(teamIndex, name = '') {
    const team = TEAMS[teamIndex];
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // everything that moves with the torso
    this.root.add(this.body);
    this.bodyMat = new THREE.MeshLambertMaterial({ color: CLAUDE_ORANGE, emissive: 0x000000 });
    const black = sharedMat('eye', 0x161412);
    const teamMat = sharedMat(`team${teamIndex}`, team.hex);
    const teamDark = sharedMat(`teamDark${teamIndex}`, team.dark);

    // legs: four stubby legs in a row, pivoted at the hip
    this.legs = [];
    for (const x of [-0.31, -0.12, 0.12, 0.31]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, LEG_H, 0.02);
      part(pivot, 0.13, LEG_H, 0.15, 0, -LEG_H / 2, 0, this.bodyMat);
      part(pivot, 0.14, 0.06, 0.17, 0, -LEG_H + 0.03, -0.01, teamDark); // boots
      this.root.add(pivot);
      this.legs.push(pivot);
    }

    // torso / head (Clawd is one big block with eyes)
    part(this.body, 0.84, 1.06, 0.6, 0, 0.53, 0, this.bodyMat);
    this.eyes = [];
    for (const x of [-0.18, 0.18]) this.eyes.push(part(this.body, 0.085, 0.2, 0.02, x, 0.9, -0.305, black, false));
    // team kit: vest band and headwear
    part(this.body, 0.86, 0.12, 0.62, 0, 0.25, 0, teamMat);
    part(this.body, 0.2, 0.1, 0.05, 0.2, 0.25, -0.32, teamDark, false); // pouch
    if (teamIndex === 0) {
      // flat cap
      part(this.body, 0.88, 0.09, 0.64, 0, 1.1, 0.0, teamMat);
      part(this.body, 0.62, 0.035, 0.22, 0, 1.07, -0.38, teamDark);
    } else {
      // beanie with a bobble
      part(this.body, 0.8, 0.17, 0.56, 0, 1.13, 0.02, teamMat);
      part(this.body, 0.84, 0.06, 0.6, 0, 1.06, 0.02, teamDark);
      part(this.body, 0.12, 0.1, 0.12, 0, 1.26, 0.02, sharedMat('bobble', 0xf2f2f2));
    }

    // arms + gun pivot around the shoulders so they follow aim pitch
    this.aim = new THREE.Group();
    this.aim.position.set(0, 0.48, 0);
    this.body.add(this.aim);
    this.armL = part(this.aim, 0.15, 0.15, 0.36, -0.36, 0, -0.2, this.bodyMat);
    this.armR = part(this.aim, 0.15, 0.15, 0.36, 0.34, 0, -0.22, this.bodyMat);
    this.armL.rotation.y = -0.35;
    this.armR.rotation.y = 0.15;
    this.gunHolder = new THREE.Group();
    this.gunHolder.position.set(0.16, 0.02, -0.42);
    this.aim.add(this.gunHolder);
    this.gun = null;
    this.gunModel = null;

    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffd890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash.scale.set(0.5, 0.5, 0.5);
    this.flash.visible = false;
    this.flashT = 0;

    // ally marker (shown above teammates)
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: markerTexture(team.color, name), depthTest: false, transparent: true }));
    this.marker.scale.set(1.0, 0.375, 1);
    this.marker.position.set(0, 2.05, 0);
    this.marker.renderOrder = 10;
    this.marker.visible = false;
    this.root.add(this.marker);

    this.phase = Math.random() * 6;
    this.blinkT = 2 + Math.random() * 3;
    this.hitT = 0;
    this.deathT = 0;
    this.deathDir = 1;
    this.lastGun = null;
  }

  setGun(model) {
    if (this.gunModel === model) return;
    this.gunModel = model;
    if (this.gun) this.gunHolder.remove(this.gun.group);
    this.gun = buildGun(model);
    this.gun.group.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.gunHolder.add(this.gun.group);
    this.gun.muzzle.add(this.flash);
  }

  muzzleFlash() {
    this.flashT = 0.05;
    this.flash.material.rotation = Math.random() * Math.PI;
  }

  hit() {
    this.hitT = 0.12;
  }

  muzzleWorld(out) {
    if (this.gun) return this.gun.muzzle.getWorldPosition(out);
    return this.root.getWorldPosition(out);
  }

  update(dt, a) {
    const r = this.root;
    r.position.copy(a.pos);
    r.rotation.order = 'YXZ';
    r.rotation.y = a.yaw;

    // death: topple over and later sink into the ground
    if (!a.alive) {
      this.deathT += dt;
      const t = Math.min(1, this.deathT / 0.45);
      const ease = 1 - (1 - t) * (1 - t);
      r.rotation.x = this.deathDir * ease * (Math.PI / 2);
      r.position.y += Math.sin(ease * (Math.PI / 2)) * 0.3 - Math.max(0, this.deathT - 4) * 0.25;
      for (const l of this.legs) l.rotation.x *= 0.9;
      this.flash.visible = false;
      return;
    }
    this.deathT = 0;
    r.rotation.x = 0;

    const speed = Math.hypot(a.vel.x, a.vel.z);
    const amp = Math.min(1, speed / 4) * (a.grounded ? 1 : 0.3);
    this.phase += dt * (3 + speed * 1.9);
    const c = a.crouchT;
    const hip = LEG_H - CROUCH_DROP * c;
    const legScale = 1 - 0.88 * c;
    for (let i = 0; i < 4; i++) {
      const l = this.legs[i];
      l.position.y = hip;
      l.scale.y = legScale;
      l.rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0)) * 0.7 * amp * (1 - c * 0.6);
    }
    const bob = Math.abs(Math.sin(this.phase)) * 0.035 * amp;
    this.body.position.set(a.lean * 0.28, hip + bob, 0);
    this.body.rotation.z = -a.lean * 0.28;
    this.aim.rotation.x = a.pitch + a.recoilPitch;
    // lower the gun while sprinting
    if (a.sprinting) this.aim.rotation.x = -0.5;

    // blink
    this.blinkT -= dt;
    const blinking = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3.5;
    for (const e of this.eyes) e.scale.y = blinking ? 0.03 : 0.2;

    // hit flash
    this.hitT = Math.max(0, this.hitT - dt);
    this.bodyMat.emissive.setRGB(this.hitT * 5, this.hitT * 1.2, 0);

    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    // spawn protection shimmer
    this.bodyMat.opacity = 1;
    if (a.spawnProtect > 0) this.bodyMat.emissive.setRGB(0.15, 0.15, 0.25 + Math.sin(performance.now() * 0.02) * 0.1);
  }
}

// Hit zones in the model's local space (facing -Z) for a given crouch and lean.
// Returns [min, max] arrays: head, body, legs.
export function hitboxes(crouchT, lean, out) {
  const drop = CROUCH_DROP * crouchT;
  const lx = lean * 0.3;
  out.head.min[0] = -0.42 + lx;
  out.head.max[0] = 0.42 + lx;
  out.head.min[1] = 1.1 - drop;
  out.head.max[1] = 1.6 - drop;
  out.body.min[0] = -0.46 + lx * 0.6;
  out.body.max[0] = 0.46 + lx * 0.6;
  out.body.min[1] = LEG_H - drop;
  out.body.max[1] = 1.1 - drop;
  out.legs.max[1] = Math.max(0.05, LEG_H - drop);
  return out;
}

export function makeHitboxes() {
  return {
    head: { min: [-0.42, 1.1, -0.31], max: [0.42, 1.6, 0.31], zone: 'head' },
    body: { min: [-0.46, LEG_H, -0.31], max: [0.46, 1.1, 0.31], zone: 'body' },
    legs: { min: [-0.4, 0, -0.1], max: [0.4, LEG_H, 0.12], zone: 'legs' },
  };
}
