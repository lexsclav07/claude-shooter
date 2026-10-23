// Runtime side of destructible props: damage, smashing, wrecks, chain explosions,
// and putting everything back for the next match.

import * as THREE from 'three';
import { hideGroup, showGroup } from './builder.js';

const WRECK_MAT = new THREE.MeshLambertMaterial({ color: 0x2b2826 });
const BOX = new THREE.BoxGeometry(1, 1, 1);

export class Destruction {
  constructor(game) {
    this.game = game;
    this.groups = game.builder.groups;
    this.wrecks = [];
  }

  damage(g, amount, attacker, cause) {
    if (!g || g.destroyed) return;
    g.hp -= amount;
    if (g.hp <= 0) this.destroy(g, attacker, cause);
  }

  // Explosion damage to every prop in range.
  blast(pos, radius, amount, attacker) {
    const r2 = radius * radius;
    for (const g of this.groups) {
      if (g.destroyed) continue;
      // distance from the blast to the prop's bounding box
      const dx = Math.max(g.min[0] - pos.x, 0, pos.x - g.max[0]);
      const dy = Math.max(g.min[1] - pos.y, 0, pos.y - g.max[1]);
      const dz = Math.max(g.min[2] - pos.z, 0, pos.z - g.max[2]);
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const f = 1 - Math.sqrt(d2) / radius;
      this.damage(g, amount * (0.35 + 0.65 * f), attacker, 'blast');
    }
  }

  destroy(g, attacker, cause) {
    if (g.destroyed) return;
    const game = this.game;
    g.destroyed = true;
    g.hp = 0;
    hideGroup(g);
    for (const b of g.boxes) {
      game.world.remove(b);
      if (b.pane) b.pane.broken = true;
    }
    const c = new THREE.Vector3(...g.center);
    const size = Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1], g.max[2] - g.min[2]);
    game.fx.debris(c, size, g.debris);
    game.audio.play(g.debris === 'metal' ? 'smashMetal' : 'smash', { pos: c, volume: Math.min(1, 0.4 + size * 0.15) });
    if (g.wreck) this._wreck(g);
    const ex = g.explode;
    if (ex && (!ex.onlyIfBlown || cause !== 'crush')) {
      // tiny delay so chains of barrels go off one after another
      game.later(0.08 + Math.random() * 0.1, () => game.combat.explode(c, attacker, { radius: ex.radius, damage: ex.damage, vehicle: ex.vehicle, weapon: 'explosion' }));
    }
  }

  _wreck(g) {
    const h = g.wreck.h;
    const w = g.max[0] - g.min[0];
    const d = g.max[2] - g.min[2];
    const mesh = new THREE.Mesh(BOX, WRECK_MAT);
    mesh.scale.set(w * 0.98, h, d * 0.98);
    mesh.position.set(g.center[0], g.min[1] + h / 2, g.center[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    const box = this.game.world.add(g.min[0] + 0.05, g.min[1], g.min[2] + 0.05, g.max[0] - 0.05, g.min[1] + h, g.max[2] - 0.05, 'metal');
    this.wrecks.push({ mesh, box });
    this.game.fx.smokeColumn(new THREE.Vector3(g.center[0], g.min[1] + h, g.center[2]), 12);
  }

  // Rebuild everything for a fresh match (props, wrecks and windows).
  reset() {
    const world = this.game.world;
    for (const w of this.wrecks) {
      this.game.scene.remove(w.mesh);
      world.remove(w.box);
    }
    this.wrecks.length = 0;
    for (const g of this.groups) {
      if (!g.destroyed && g.hp === g.maxHp) continue;
      g.hp = g.maxHp;
      if (!g.destroyed) continue;
      g.destroyed = false;
      showGroup(g);
      g.boxes = g.specs.map((sp) => {
        const nb = world.add(sp.min[0], sp.min[1], sp.min[2], sp.max[0], sp.max[1], sp.max[2], sp.kind);
        nb.group = g;
        if (sp.pane) {
          nb.pane = sp.pane;
          sp.pane.box = nb;
          sp.pane.broken = false;
        }
        return nb;
      });
    }
    // windows that were shot out individually
    for (const p of this.game.builder.panes) {
      if (!p.broken) continue;
      const pos = p.geometry.attributes.position;
      pos.array.set(p.orig, p.start * 3);
      pos.needsUpdate = true;
      p.broken = false;
      const old = p.box;
      const nb = world.add(old.min[0], old.min[1], old.min[2], old.max[0], old.max[1], old.max[2], 'glass');
      nb.pane = p;
      p.box = nb;
      if (old.group) {
        nb.group = old.group;
        const i = old.group.boxes.indexOf(old);
        if (i >= 0) old.group.boxes[i] = nb;
      }
    }
  }
}
