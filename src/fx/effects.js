// Visual effects: particles, bullet holes, tracers, muzzle lights, explosions.

import * as THREE from 'three';
import { bulletHoleTexture, radialTexture, flashTexture } from '../world/textures.js';
import { buildGun } from '../weapons/models.js';

const MAX_P = 1200;
const MAX_DECALS = 320;
const IMPACT_COLORS = {
  brick: [0x8a4a34, 0xb07a5a, 0x6a4a3a],
  stone: [0xa8a49a, 0x8a867c, 0xc8c4b8],
  dirt: [0x5a4a32, 0x7a6a4a, 0x4a3a2a],
  wood: [0xa07850, 0xc8a070, 0x6a4a2a],
  metal: [0xffe0a0, 0xfff4d0, 0xffb040],
  glass: [0xd8eef8, 0xb8d8e8, 0xffffff],
  foliage: [0x4a7a30, 0x6a9a40, 0x3a5a22],
  none: [0xffffff],
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // particles
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.pMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_P);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    scene.add(this.pMesh);
    this.p = {
      pos: new Float32Array(MAX_P * 3),
      vel: new Float32Array(MAX_P * 3),
      life: new Float32Array(MAX_P),
      max: new Float32Array(MAX_P),
      size: new Float32Array(MAX_P),
      grav: new Float32Array(MAX_P),
      col: new Float32Array(MAX_P * 3),
      n: 0,
    };
    const col = new THREE.Color();
    for (let i = 0; i < MAX_P; i++) this.pMesh.setColorAt(i, col.setRGB(1, 1, 1));

    // bullet holes
    const dg = new THREE.PlaneGeometry(1, 1);
    const dm = new THREE.MeshLambertMaterial({ map: bulletHoleTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = new THREE.InstancedMesh(dg, dm, MAX_DECALS);
    this.decals.count = 0;
    this.decals.frustumCulled = false;
    this.decals.renderOrder = 1;
    scene.add(this.decals);
    this.decalIdx = 0;

    // tracers
    this.tracers = [];
    const tm = new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(geo, tm);
      m.visible = false;
      scene.add(m);
      this.tracers.push({ mesh: m, a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0, len: 0, active: false });
    }

    // muzzle / explosion lights (always in the scene so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 9, 2);
      scene.add(l);
      this.lights.push({ light: l, t: 0, max: 0, peak: 0 });
    }

    // explosion flashes & smoke
    this.flashTex = flashTexture();
    this.smokeTex = radialTexture('rgba(200,200,200,0.8)', 'rgba(200,200,200,0)');
    this.sprites = [];
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.sprites.push({ s, t: 0, max: 0, grow: 0, vel: new THREE.Vector3(), fade: 1, active: false });
    }
    this.grenadePool = [];
    this._q = new THREE.Quaternion();
    this._m = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.quality = 1;
  }

  emit(x, y, z, vx, vy, vz, life, size, color, grav = 9) {
    const P = this.p;
    if (P.n >= MAX_P) return;
    const i = P.n++;
    P.pos[i * 3] = x;
    P.pos[i * 3 + 1] = y;
    P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx;
    P.vel[i * 3 + 1] = vy;
    P.vel[i * 3 + 2] = vz;
    P.life[i] = life;
    P.max[i] = life;
    P.size[i] = size;
    P.grav[i] = grav;
    this._c.set(color);
    P.col[i * 3] = this._c.r;
    P.col[i * 3 + 1] = this._c.g;
    P.col[i * 3 + 2] = this._c.b;
  }

  burst(p, n, dir, speed, spread, life, size, colors, grav = 9) {
    const cnt = Math.ceil(n * this.quality);
    for (let k = 0; k < cnt; k++) {
      const vx = dir[0] * speed + (Math.random() - 0.5) * spread;
      const vy = dir[1] * speed + (Math.random() - 0.5) * spread + spread * 0.3;
      const vz = dir[2] * speed + (Math.random() - 0.5) * spread;
      this.emit(p.x, p.y, p.z, vx, vy, vz, life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), colors[(Math.random() * colors.length) | 0], grav);
    }
  }

  impact(p, normal, kind, important = false, exit = false) {
    const colors = IMPACT_COLORS[kind] || IMPACT_COLORS.brick;
    if (kind !== 'none') {
      const n = important ? 8 : 4;
      if (kind === 'metal') this.burst(p, n, normal, 3, 4, 0.25, 0.025, colors, 12);
      else this.burst(p, n, normal, 1.8, 2.2, 0.5, kind === 'foliage' ? 0.05 : 0.035, colors, 7);
      if (important && kind !== 'foliage') this.puff(p, normal, 0.35, 0.6, kind === 'dirt' ? 0x8a7a5a : 0xb8b0a8);
    }
    if (kind !== 'foliage' && kind !== 'glass' && kind !== 'none') this.decal(p, normal, exit ? 0.11 : 0.08);
  }

  decal(p, normal, size) {
    const i = this.decalIdx++ % MAX_DECALS;
    this.decals.count = Math.min(MAX_DECALS, Math.max(this.decals.count, i + 1));
    const n = this._v.set(normal[0], normal[1], normal[2]);
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const spin = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * Math.PI * 2);
    this._q.multiply(spin);
    const pos = this._s.copy(p).addScaledVector(n, 0.004);
    this._m.compose(pos, this._q, new THREE.Vector3(size, size, size));
    this.decals.setMatrixAt(i, this._m);
    this.decals.instanceMatrix.needsUpdate = true;
  }

  blood(p, dir, head) {
    // Clawd is made of warm orange clay: spray orange flecks
    this.burst(p, head ? 16 : 9, [dir.x * 0.3, 0.2, dir.z * 0.3], 2.2, 2.5, 0.55, head ? 0.06 : 0.045, [0xd97757, 0xb8553a, 0xf0a080], 9);
    if (head) this.puff(p, [0, 1, 0], 0.4, 0.5, 0xe8906a);
  }

  glass(p, box) {
    const cx = (box.min[0] + box.max[0]) / 2;
    const cy = (box.min[1] + box.max[1]) / 2;
    const cz = (box.min[2] + box.max[2]) / 2;
    const w = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2]);
    const h = box.max[1] - box.min[1];
    const n = Math.min(40, Math.ceil(w * h * 14));
    for (let k = 0; k < n; k++) {
      const x = box.max[0] - box.min[0] > 0.1 ? box.min[0] + Math.random() * (box.max[0] - box.min[0]) : cx;
      const z = box.max[2] - box.min[2] > 0.1 ? box.min[2] + Math.random() * (box.max[2] - box.min[2]) : cz;
      const y = box.min[1] + Math.random() * h;
      this.emit(x, y, z, (Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5, 0.9 + Math.random() * 0.5, 0.03 + Math.random() * 0.05, IMPACT_COLORS.glass[k % 3], 12);
    }
    void cy;
    void p;
  }

  puff(p, normal, size, life, color) {
    const sp = this.sprites.find((s) => !s.active);
    if (!sp) return;
    sp.active = true;
    sp.s.visible = true;
    sp.s.material.map = this.smokeTex;
    sp.s.material.color.set(color);
    sp.s.material.blending = THREE.NormalBlending;
    sp.s.material.opacity = 0.7;
    sp.s.position.copy(p);
    sp.s.scale.setScalar(size);
    sp.t = 0;
    sp.max = life;
    sp.grow = size * 2.2;
    sp.fade = 0.7;
    sp.vel.set(normal[0] * 0.6, normal[1] * 0.6 + 0.3, normal[2] * 0.6);
  }

  tracer(a, b) {
    const tr = this.tracers.find((t) => !t.active);
    if (!tr) return;
    tr.a.copy(a);
    tr.b.copy(b);
    tr.len = a.distanceTo(b);
    if (tr.len < 2) return;
    tr.t = 0;
    tr.active = true;
    tr.mesh.visible = true;
  }

  flashLight(p, intensity = 6, time = 0.06, color = 0xffc070, dist = 9) {
    const l = this.lights.reduce((m, c) => (c.t >= c.max ? c : m.t / (m.max || 1) > c.t / (c.max || 1) ? m : c), this.lights[0]);
    l.light.position.copy(p);
    l.light.color.set(color);
    l.light.distance = dist;
    l.t = 0;
    l.max = time;
    l.peak = intensity;
  }

  explosion(p) {
    this.flashLight(p, 60, 0.25, 0xffb050, 20);
    for (let i = 0; i < 2; i++) {
      const sp = this.sprites.find((s) => !s.active);
      if (!sp) break;
      sp.active = true;
      sp.s.visible = true;
      sp.s.material.map = this.flashTex;
      sp.s.material.color.set(0xffffff);
      sp.s.material.blending = THREE.AdditiveBlending;
      sp.s.material.opacity = 1;
      sp.s.position.copy(p).y += 0.4;
      sp.s.scale.setScalar(2);
      sp.t = 0;
      sp.max = 0.18;
      sp.grow = 8;
      sp.fade = 1;
      sp.vel.set(0, 0, 0);
    }
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const q = p.clone();
      q.x += Math.cos(a) * 0.8;
      q.z += Math.sin(a) * 0.8;
      q.y += 0.3 + Math.random();
      this.puff(q, [Math.cos(a), 0.6, Math.sin(a)], 1.4, 1.8 + Math.random(), 0x5a5652);
    }
    this.burst(p, 40, [0, 1, 0], 4, 9, 0.8, 0.06, [0xffc060, 0xff8030, 0xfff0c0], 10);
    this.burst(p, 25, [0, 1, 0], 3, 6, 1.4, 0.08, [0x3a3530, 0x5a5048], 9);
    this.decal(new THREE.Vector3(p.x, Math.max(0.01, p.y - 0.05), p.z), [0, 1, 0], 2.2);
  }

  grenadeMesh() {
    let m = this.grenadePool.pop();
    if (!m) {
      m = buildGun('grenade').group;
      m.scale.setScalar(1.4);
      m.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
    }
    m.visible = true;
    this.scene.add(m);
    return m;
  }

  releaseGrenade(m) {
    m.visible = false;
    this.scene.remove(m);
    this.grenadePool.push(m);
  }

  update(dt) {
    // particles
    const P = this.p;
    let i = 0;
    while (i < P.n) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        // swap-remove
        const last = --P.n;
        if (i !== last) {
          for (let k = 0; k < 3; k++) {
            P.pos[i * 3 + k] = P.pos[last * 3 + k];
            P.vel[i * 3 + k] = P.vel[last * 3 + k];
            P.col[i * 3 + k] = P.col[last * 3 + k];
          }
          P.life[i] = P.life[last];
          P.max[i] = P.max[last];
          P.size[i] = P.size[last];
          P.grav[i] = P.grav[last];
        }
        continue;
      }
      P.vel[i * 3 + 1] -= P.grav[i] * dt;
      const drag = 1 - 1.5 * dt;
      P.vel[i * 3] *= drag;
      P.vel[i * 3 + 2] *= drag;
      P.pos[i * 3] += P.vel[i * 3] * dt;
      P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt;
      P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
      if (P.pos[i * 3 + 1] < 0.01) {
        P.pos[i * 3 + 1] = 0.01;
        P.vel[i * 3 + 1] *= -0.3;
        P.vel[i * 3] *= 0.5;
        P.vel[i * 3 + 2] *= 0.5;
      }
      const s = P.size[i] * Math.min(1, (P.life[i] / P.max[i]) * 2);
      this._m.makeScale(s, s, s);
      this._m.setPosition(P.pos[i * 3], P.pos[i * 3 + 1], P.pos[i * 3 + 2]);
      this.pMesh.setMatrixAt(i, this._m);
      this.pMesh.setColorAt(i, this._c.setRGB(P.col[i * 3], P.col[i * 3 + 1], P.col[i * 3 + 2]));
      i++;
    }
    this.pMesh.count = P.n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // tracers: a short bright streak racing along the bullet path
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.t += dt * 420;
      const head = Math.min(tr.len, tr.t);
      const tail = Math.max(0, head - 5);
      if (tail >= tr.len) {
        tr.active = false;
        tr.mesh.visible = false;
        continue;
      }
      const m = tr.mesh;
      const dir = this._v.copy(tr.b).sub(tr.a).normalize();
      m.position.copy(tr.a).addScaledVector(dir, (head + tail) / 2);
      m.lookAt(this._s.copy(m.position).add(dir));
      m.scale.set(0.022, 0.022, Math.max(0.01, head - tail));
    }

    for (const l of this.lights) {
      if (l.t < l.max) {
        l.t += dt;
        l.light.intensity = l.peak * Math.max(0, 1 - l.t / l.max);
      } else l.light.intensity = 0;
    }

    for (const sp of this.sprites) {
      if (!sp.active) continue;
      sp.t += dt;
      const k = sp.t / sp.max;
      if (k >= 1) {
        sp.active = false;
        sp.s.visible = false;
        continue;
      }
      sp.s.position.addScaledVector(sp.vel, dt);
      sp.vel.multiplyScalar(1 - dt * 1.2);
      const sc = sp.s.scale.x + sp.grow * dt;
      sp.s.scale.setScalar(sc);
      sp.s.material.opacity = sp.fade * (1 - k);
    }
  }
}
