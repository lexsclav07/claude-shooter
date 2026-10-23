// Geometry baking: merges many small coloured meshes into one vertex-coloured
// mesh so characters and vehicles cost a handful of draw calls instead of dozens.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const inv = new THREE.Matrix4();
const rel = new THREE.Matrix4();

// Removes every mesh under `root` that passes `filter` (and isn't inside a
// skipped subtree) and returns one merged geometry in root's local space, with
// each mesh's material colour baked into a `color` attribute.
export function bakeGeometry(root, filter = () => true, skip = []) {
  root.updateMatrixWorld(true);
  inv.copy(root.matrixWorld).invert();
  const geos = [];
  const taken = [];
  const visit = (o) => {
    if (skip.includes(o)) return;
    if (o.isMesh && filter(o)) {
      const src = o.geometry;
      const g = src.index ? src.toNonIndexed() : src.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      rel.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(rel);
      const c = o.material.color || new THREE.Color(1, 1, 1);
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r;
        col[i * 3 + 1] = c.g;
        col[i * 3 + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geos.push(g);
      taken.push(o);
    }
    for (const ch of o.children) visit(ch);
  };
  visit(root);
  for (const o of taken) o.parent.remove(o);
  return geos.length ? mergeGeometries(geos) : null;
}

// Bakes `root` in place: its meshes are replaced by a single mesh using `material`.
export function bakeInto(root, material, { filter, skip, shadow = true } = {}) {
  const geo = bakeGeometry(root, filter, skip);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  root.add(m);
  return m;
}
