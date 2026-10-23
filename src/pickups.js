// Health packs and ammo crates placed around town. They respawn after being taken.

import * as THREE from 'three';
import { MAX_HEALTH } from './config.js';

const RESPAWN = { health: 25, ammo: 30 };
const HEAL = 45;

function healthMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f4f0, emissive: 0x202020 });
  const green = new THREE.MeshLambertMaterial({ color: 0x1aa04a, emissive: 0x0a4a20 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.34), white);
  g.add(box);
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.01), green);
    a.position.z = 0.171 * s;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.01), green);
    b.position.z = 0.171 * s;
    g.add(a, b);
  }
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), green);
  handle.position.y = 0.17;
  g.add(handle);
  return g;
}

function ammoMesh() {
  const g = new THREE.Group();
  const olive = new THREE.MeshLambertMaterial({ color: 0x4d5a3a });
  const brass = new THREE.MeshLambertMaterial({ color: 0xc8a040, emissive: 0x302008 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.3), olive));
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), brass);
    r.position.set(-0.15 + i * 0.1, 0.19, 0);
    g.add(r);
  }
  return g;
}

export class Pickups {
  constructor(game, defs) {
    this.game = game;
    this.items = defs.map((d) => {
      const mesh = d.type === 'health' ? healthMesh() : ammoMesh();
      mesh.traverse((o) => {
        if (o.isMesh) o.castShadow = true;
      });
      const pos = new THREE.Vector3(...d.pos);
      mesh.position.copy(pos);
      game.scene.add(mesh);
      // soft glow disc under it
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 20),
        new THREE.MeshBasicMaterial({ color: d.type === 'health' ? 0x40ff80 : 0xffd060, transparent: true, opacity: 0.25, depthWrite: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(pos.x, pos.y + 0.02, pos.z);
      game.scene.add(glow);
      return { type: d.type, pos, mesh, glow, active: true, respawnAt: 0, phase: Math.random() * 6 };
    });
  }

  reset() {
    for (const it of this.items) this._setActive(it, true);
  }

  _setActive(it, v) {
    it.active = v;
    it.mesh.visible = v;
    it.glow.visible = v;
  }

  nearest(type, pos, maxDist) {
    let best = null;
    let bd = maxDist;
    for (const it of this.items) {
      if (!it.active || it.type !== type) continue;
      const d = it.pos.distanceTo(pos);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  update(dt) {
    const g = this.game;
    for (const it of this.items) {
      if (!it.active) {
        if (g.time >= it.respawnAt) this._setActive(it, true);
        continue;
      }
      it.phase += dt;
      it.mesh.position.y = it.pos.y + 0.45 + Math.sin(it.phase * 2) * 0.07;
      it.mesh.rotation.y += dt * 1.4;
      for (const a of g.actors) {
        if (!a.alive || a.vehicle) continue;
        const dx = a.pos.x - it.pos.x;
        const dz = a.pos.z - it.pos.z;
        if (dx * dx + dz * dz > 1.1 || Math.abs(a.pos.y - it.pos.y) > 1.2) continue;
        if (it.type === 'health') {
          if (a.health >= MAX_HEALTH) continue;
          a.health = Math.min(MAX_HEALTH, a.health + HEAL);
        } else {
          let took = false;
          for (const s of ['primary', 'secondary', 'gadget', 'gadget2']) {
            const w = a.weapons[s];
            if (w && w.reserve < w.def.reserve) {
              w.reserve = w.def.reserve;
              took = true;
            }
          }
          if (a.frags < 1) {
            a.frags = 1;
            took = true;
          }
          if (!took) continue;
        }
        this._setActive(it, false);
        it.respawnAt = g.time + RESPAWN[it.type];
        g.audio.play('pickup', { pos: a === g.player ? undefined : a.pos });
        if (a === g.player) g.hud.toast(it.type === 'health' ? `+${HEAL} HEALTH` : 'AMMO REFILLED', it.type === 'health' ? '#5dff8a' : '#ffd060');
        break;
      }
    }
  }
}
