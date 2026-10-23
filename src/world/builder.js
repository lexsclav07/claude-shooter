// Builds the static world. Geometry is batched into one mesh per material and every
// solid box can also register a collider, so visuals and physics always line up.
// Shapes are given in a local "frame" (origin + quarter-turn rotation) so buildings
// can be authored once and dropped anywhere facing any of the four directions.

import * as THREE from 'three';

const ROT_THETA = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
// Where each local face ends up after a quarter-turn rotation.
const FACE_MAP = [
  { px: 'px', nx: 'nx', pz: 'pz', nz: 'nz' },
  { px: 'pz', nx: 'nz', pz: 'nx', nz: 'px' },
  { px: 'nx', nx: 'px', pz: 'nz', nz: 'pz' },
  { px: 'nz', nx: 'pz', pz: 'px', nz: 'nx' },
];

export class Frame {
  constructor(ox = 0, oz = 0, r = 0, oy = 0) {
    this.ox = ox;
    this.oz = oz;
    this.oy = oy;
    this.r = ((r % 4) + 4) % 4;
    this.theta = ROT_THETA[this.r];
  }

  toWorld(lx, lz) {
    switch (this.r) {
      case 0:
        return [this.ox + lx, this.oz + lz];
      case 1:
        return [this.ox - lz, this.oz + lx];
      case 2:
        return [this.ox - lx, this.oz - lz];
      default:
        return [this.ox + lz, this.oz - lx];
    }
  }

  // Local direction -> world direction.
  dir(dx, dz) {
    switch (this.r) {
      case 0:
        return [dx, dz];
      case 1:
        return [-dz, dx];
      case 2:
        return [-dx, -dz];
      default:
        return [dz, -dx];
    }
  }

  face(localFace) {
    if (localFace === 'py' || localFace === 'ny') return localFace;
    return FACE_MAP[this.r][localFace];
  }

  // Child frame offset in this frame's local space.
  sub(lx, lz, r = 0, ly = 0) {
    const [wx, wz] = this.toWorld(lx, lz);
    return new Frame(wx, wz, this.r + r, this.oy + ly);
  }
}

class Batch {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.count = 0;
  }

  quad(p, n, uv, c) {
    const b = this.count;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(c[0], c[1], c[2]);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    this.count += 4;
    return b;
  }

  tri(p, n, uv, c) {
    const b = this.count;
    for (let i = 0; i < 3; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
      this.col.push(c[0], c[1], c[2]);
    }
    this.idx.push(b, b + 1, b + 2);
    this.count += 3;
    return b;
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Face definitions: origin corner, U edge, V edge (U x V points outward).
function faceQuad(face, x0, y0, z0, x1, y1, z1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  switch (face) {
    case 'px':
      return { o: [x1, y0, z1], u: [0, 0, -dz], v: [0, dy, 0], n: [1, 0, 0], uh: [0, 0, -1], vh: [0, 1, 0] };
    case 'nx':
      return { o: [x0, y0, z0], u: [0, 0, dz], v: [0, dy, 0], n: [-1, 0, 0], uh: [0, 0, 1], vh: [0, 1, 0] };
    case 'pz':
      return { o: [x0, y0, z1], u: [dx, 0, 0], v: [0, dy, 0], n: [0, 0, 1], uh: [1, 0, 0], vh: [0, 1, 0] };
    case 'nz':
      return { o: [x1, y0, z0], u: [-dx, 0, 0], v: [0, dy, 0], n: [0, 0, -1], uh: [-1, 0, 0], vh: [0, 1, 0] };
    case 'py':
      return { o: [x0, y1, z1], u: [dx, 0, 0], v: [0, 0, -dz], n: [0, 1, 0], uh: [1, 0, 0], vh: [0, 0, -1] };
    default:
      return { o: [x0, y0, z0], u: [dx, 0, 0], v: [0, 0, dz], n: [0, -1, 0], uh: [1, 0, 0], vh: [0, 0, 1] };
  }
}

const FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const WHITE = [1, 1, 1];

function toColor(c) {
  if (!c) return WHITE;
  if (Array.isArray(c)) return c;
  const col = new THREE.Color(c);
  // Vertex colours are multiplied in linear space; convert from sRGB hex.
  return [col.r, col.g, col.b];
}

export class WorldBuilder {
  constructor(world, materials) {
    this.world = world;
    this.mats = materials;
    this.batches = new Map();
    this.frame = new Frame();
    this.group = new THREE.Group();
    this.panes = [];
    this.portals = [];
    this.navLinks = [];
    this.interest = [];
    this.footprints = [];
    this.grassRects = [];
    this.lights = [];
  }

  batch(name) {
    let b = this.batches.get(name);
    if (!b) {
      if (!this.mats[name]) throw new Error(`Unknown material ${name}`);
      b = new Batch();
      this.batches.set(name, b);
    }
    return b;
  }

  withFrame(frame, fn) {
    const prev = this.frame;
    this.frame = frame;
    try {
      fn(frame);
    } finally {
      this.frame = prev;
    }
  }

  // Converts a local box to a world AABB.
  worldBox(x0, y0, z0, x1, y1, z1) {
    const f = this.frame;
    const [ax, az] = f.toWorld(x0, z0);
    const [bx, bz] = f.toWorld(x1, z1);
    return [Math.min(ax, bx), Math.min(y0, y1) + f.oy, Math.min(az, bz), Math.max(ax, bx), Math.max(y0, y1) + f.oy, Math.max(az, bz)];
  }

  // Axis aligned box in local coordinates.
  // opts: collide (default true), render (default true), kind, faces {localFace: mat},
  //       skip [localFaces], tint, faceTint {localFace: tint}, uvOffset [u,v]
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const wb = this.worldBox(x0, y0, z0, x1, y1, z1);
    if (opts.render !== false && (mat || opts.faces)) {
      const skip = new Set();
      if (opts.skip) for (const s of opts.skip) skip.add(this.frame.face(s));
      if (wb[1] <= 0.0005 && opts.keepBottom !== true) skip.add('ny');
      const worldFaces = {};
      if (opts.faces) for (const [k, v] of Object.entries(opts.faces)) worldFaces[this.frame.face(k)] = v;
      const worldTints = {};
      if (opts.faceTint) for (const [k, v] of Object.entries(opts.faceTint)) worldTints[this.frame.face(k)] = v;
      const tint = toColor(opts.tint);
      for (const f of FACES) {
        if (skip.has(f)) continue;
        const m = worldFaces[f] ?? mat;
        if (!m) continue;
        this._faceQuad(m, f, wb, worldTints[f] ? toColor(worldTints[f]) : tint, opts.uvOffset);
      }
    }
    if (opts.collide !== false) {
      return this.world.add(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], opts.kind || 'solid');
    }
    return null;
  }

  _faceQuad(mat, face, wb, color, uvOffset) {
    const q = faceQuad(face, wb[0], wb[1], wb[2], wb[3], wb[4], wb[5]);
    const tile = this.mats[mat].tile;
    const p0 = q.o;
    const p1 = [p0[0] + q.u[0], p0[1] + q.u[1], p0[2] + q.u[2]];
    const p2 = [p1[0] + q.v[0], p1[1] + q.v[1], p1[2] + q.v[2]];
    const p3 = [p0[0] + q.v[0], p0[1] + q.v[1], p0[2] + q.v[2]];
    const ou = uvOffset ? uvOffset[0] : 0;
    const ov = uvOffset ? uvOffset[1] : 0;
    const uvOf = (p) => [
      (p[0] * q.uh[0] + p[1] * q.uh[1] + p[2] * q.uh[2]) / tile[0] + ou,
      (p[0] * q.vh[0] + p[1] * q.vh[1] + p[2] * q.vh[2]) / tile[1] + ov,
    ];
    return this.batch(mat).quad([p0, p1, p2, p3], q.n, [uvOf(p0), uvOf(p1), uvOf(p2), uvOf(p3)], color);
  }

  // Arbitrary quad given in local coordinates (counter-clockwise seen from the front).
  // uvMode 'auto' projects along the dominant normal axis; or pass explicit uvs.
  quad(pts, mat, opts = {}) {
    const f = this.frame;
    const w = pts.map(([x, y, z]) => {
      const [wx, wz] = f.toWorld(x, z);
      return [wx, y + f.oy, wz];
    });
    const n = normalOf(w[0], w[1], w[2]);
    const uv = opts.uv || autoUV(w, n, this.mats[mat].tile);
    this.batch(mat).quad(w, n, uv, toColor(opts.tint));
    if (opts.doubleSided) {
      const r = [w[3], w[2], w[1], w[0]];
      this.batch(mat).quad(r, [-n[0], -n[1], -n[2]], [uv[3], uv[2], uv[1], uv[0]], toColor(opts.tint));
    }
  }

  tri(pts, mat, opts = {}) {
    const f = this.frame;
    const w = pts.map(([x, y, z]) => {
      const [wx, wz] = f.toWorld(x, z);
      return [wx, y + f.oy, wz];
    });
    const n = normalOf(w[0], w[1], w[2]);
    const uv = opts.uv || autoUV(w, n, this.mats[mat].tile);
    this.batch(mat).tri(w, n, uv, toColor(opts.tint));
  }

  // Vertical cylinder (optionally capped) in local coordinates.
  cylinder(cx, y0, cz, r, h, mat, opts = {}) {
    const seg = opts.segments || 10;
    const f = this.frame;
    const [wx, wz] = f.toWorld(cx, cz);
    const y = y0 + f.oy;
    const tile = this.mats[mat].tile;
    const b = this.batch(mat);
    const c = toColor(opts.tint);
    const r1 = opts.rTop ?? r;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const pA = [wx + Math.cos(a0) * r, y, wz + Math.sin(a0) * r];
      const pB = [wx + Math.cos(a1) * r, y, wz + Math.sin(a1) * r];
      const pC = [wx + Math.cos(a1) * r1, y + h, wz + Math.sin(a1) * r1];
      const pD = [wx + Math.cos(a0) * r1, y + h, wz + Math.sin(a0) * r1];
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am), 0, Math.sin(am)];
      const u0 = (a0 * r) / tile[0];
      const u1 = (a1 * r) / tile[0];
      // order so the face points outward
      b.quad([pB, pA, pD, pC], n, [[u1, y / tile[1]], [u0, y / tile[1]], [u0, (y + h) / tile[1]], [u1, (y + h) / tile[1]]], c);
      if (opts.cap !== false) {
        b.tri([[wx, y + h, wz], pC, pD], [0, 1, 0], [[0.5, 0.5], [0.5 + Math.cos(a1) * 0.5, 0.5 + Math.sin(a1) * 0.5], [0.5 + Math.cos(a0) * 0.5, 0.5 + Math.sin(a0) * 0.5]], c);
      }
    }
    if (opts.collide) {
      const rr = Math.max(r, r1) * 0.85;
      return this.world.add(wx - rr, y, wz - rr, wx + rr, y + h, wz + rr, opts.kind || 'solid');
    }
    return null;
  }

  // Merges an arbitrary THREE geometry into a batch at a local position.
  geometry(geo, mat, lx, ly, lz, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const uvA = g.attributes.uv;
    const f = this.frame;
    const [wx, wz] = f.toWorld(lx, lz);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(opts.rx || 0, f.theta + (opts.ry || 0), opts.rz || 0, 'YXZ'));
    const s = opts.scale ?? 1;
    const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    m.compose(new THREE.Vector3(wx, ly + f.oy, wz), q, sv);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    const n = new THREE.Vector3();
    const b = this.batch(mat);
    const c = toColor(opts.tint);
    const uvScale = opts.uvScale ?? 1;
    for (let i = 0; i < pos.count; i += 3) {
      const ps = [];
      const ns = [];
      const us = [];
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, i + k).applyMatrix4(m);
        n.fromBufferAttribute(nrm, i + k).applyMatrix3(nm).normalize();
        ps.push([v.x, v.y, v.z]);
        ns.push([n.x, n.y, n.z]);
        us.push(uvA ? [uvA.getX(i + k) * uvScale, uvA.getY(i + k) * uvScale] : [0, 0]);
      }
      const base = b.count;
      for (let k = 0; k < 3; k++) {
        b.pos.push(...ps[k]);
        b.nrm.push(...ns[k]);
        b.uv.push(...us[k]);
        b.col.push(c[0], c[1], c[2]);
      }
      b.idx.push(base, base + 1, base + 2);
      b.count += 3;
    }
  }

  // Breakable glass pane. Thin box; only the two big faces are drawn.
  pane(x0, y0, z0, x1, y1, z1) {
    const wb = this.worldBox(x0, y0, z0, x1, y1, z1);
    const sx = wb[3] - wb[0];
    const sz = wb[5] - wb[2];
    const faces = sx < sz ? ['px', 'nx'] : ['pz', 'nz'];
    const b = this.batch('glass');
    const start = b.count;
    for (const f of faces) this._faceQuad('glass', f, wb, WHITE);
    const box = this.world.add(wb[0], wb[1], wb[2], wb[3], wb[4], wb[5], 'glass');
    const pane = { box, start, count: b.count - start, geometry: null, broken: false };
    box.pane = pane;
    this.panes.push(pane);
    return pane;
  }

  // Navigation hint through a narrow opening: centre at (lx, ly, lz) with the
  // opening's normal along local (nx, nz). Adds nodes either side.
  portal(lx, ly, lz, nx, nz, depth = 0.7) {
    const f = this.frame;
    const [wx, wz] = f.toWorld(lx, lz);
    const [dx, dz] = f.dir(nx, nz);
    this.portals.push({
      a: [wx - dx * depth, ly + f.oy, wz - dz * depth],
      b: [wx + dx * depth, ly + f.oy, wz + dz * depth],
      c: [wx, ly + f.oy, wz],
    });
  }

  // Explicit nav chain (stairs). Points are local.
  navChain(points) {
    const f = this.frame;
    this.navLinks.push(
      points.map(([x, y, z]) => {
        const [wx, wz] = f.toWorld(x, z);
        return [wx, y + f.oy, wz];
      }),
    );
  }

  // A spot worth holding (e.g. a window). (dx,dz) is the local look direction.
  spot(lx, ly, lz, dx, dz, kind = 'window') {
    const f = this.frame;
    const [wx, wz] = f.toWorld(lx, lz);
    const [wdx, wdz] = f.dir(dx, dz);
    this.interest.push({ pos: [wx, ly + f.oy, wz], dir: [wdx, wdz], kind });
  }

  footprint(x0, z0, x1, z1, type, height = 0) {
    const wb = this.worldBox(x0, 0, z0, x1, 0, z1);
    this.footprints.push({ x0: wb[0], z0: wb[2], x1: wb[3], z1: wb[5], type, height });
  }

  surface(x0, z0, x1, z1, mat) {
    const wb = this.worldBox(x0, 0, z0, x1, 0, z1);
    (this.surfaces ||= []).push({ x0: wb[0], z0: wb[2], x1: wb[3], z1: wb[5], mat });
  }

  grass(x0, z0, x1, z1) {
    const wb = this.worldBox(x0, 0, z0, x1, 0, z1);
    this.grassRects.push([wb[0], wb[2], wb[3], wb[5]]);
  }

  // Adds a standalone mesh positioned in local coordinates.
  mesh(obj, lx, ly, lz, ry = 0) {
    const f = this.frame;
    const [wx, wz] = f.toWorld(lx, lz);
    obj.position.set(wx, ly + f.oy, wz);
    obj.rotation.y = f.theta + ry;
    this.group.add(obj);
    return obj;
  }

  finish(scene, { shadows = true } = {}) {
    for (const [name, b] of this.batches) {
      if (b.count === 0) continue;
      const geo = b.geometry();
      const mesh = new THREE.Mesh(geo, this.mats[name].material);
      mesh.name = `batch:${name}`;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (name === 'glass') {
        mesh.renderOrder = 2;
        const pos = geo.attributes.position.array;
        for (const p of this.panes) {
          p.geometry = geo;
          p.orig = pos.slice(p.start * 3, (p.start + p.count) * 3);
        }
      } else if (shadows) {
        mesh.castShadow = !name.startsWith('line') && name !== 'grass' && name !== 'tarmac' && name !== 'paving' && name !== 'water';
        mesh.receiveShadow = true;
      }
      this.group.add(mesh);
    }
    scene.add(this.group);
    return this.group;
  }
}

export function breakPane(pane) {
  if (pane.broken || !pane.geometry) return false;
  pane.broken = true;
  const pos = pane.geometry.attributes.position;
  for (let i = pane.start; i < pane.start + pane.count; i++) pos.setXYZ(i, 0, -1000, 0);
  pos.needsUpdate = true;
  return true;
}

function normalOf(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function autoUV(pts, n, tile) {
  const ax = Math.abs(n[0]);
  const ay = Math.abs(n[1]);
  const az = Math.abs(n[2]);
  return pts.map((p) => {
    if (ay >= ax && ay >= az) return [p[0] / tile[0], -p[2] / tile[1]];
    if (ax >= az) return [p[2] / tile[0], p[1] / tile[1]];
    return [p[0] / tile[0], p[1] / tile[1]];
  });
}
