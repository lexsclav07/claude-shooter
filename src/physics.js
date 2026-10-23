// Static collision world made of axis-aligned boxes, plus the character
// movement solver shared by the player and the bots.

import { PHYS } from './config.js';

// Collision behaviour per surface kind.
//   move   blocks characters        bullet  stops / slows bullets
//   sight  blocks bot line of sight pen     damage multiplier after passing through (0 = impenetrable)
export const KINDS = {
  solid: { move: true, bullet: true, sight: true, pen: 0, impact: 'brick' },
  stone: { move: true, bullet: true, sight: true, pen: 0, impact: 'stone' },
  ground: { move: true, bullet: true, sight: true, pen: 0, impact: 'dirt' },
  wood: { move: true, bullet: true, sight: true, pen: 0.62, impact: 'wood' },
  metal: { move: true, bullet: true, sight: true, pen: 0.45, impact: 'metal' },
  glass: { move: true, bullet: true, sight: false, pen: 0.92, impact: 'glass' },
  foliage: { move: true, bullet: true, sight: true, pen: 0.8, impact: 'foliage' },
  clip: { move: true, bullet: false, sight: false, pen: 1, impact: 'none' },
};

export class Box {
  constructor(min, max, kind = 'solid') {
    this.min = min;
    this.max = max;
    this.kind = kind;
    this.k = KINDS[kind] || KINDS.solid;
    this.stamp = 0;
    this.removed = false;
    this.onBreak = null; // glass panes set this
  }
}

const EPS = 0.001;

export class CollisionWorld {
  constructor(minX = -80, minZ = -70, maxX = 80, maxZ = 70, cellSize = 2) {
    this.minX = minX;
    this.minZ = minZ;
    this.cs = cellSize;
    this.nx = Math.ceil((maxX - minX) / cellSize);
    this.nz = Math.ceil((maxZ - minZ) / cellSize);
    this.cells = new Array(this.nx * this.nz);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.boxes = [];
    this.stamp = 1;
  }

  add(x0, y0, z0, x1, y1, z1, kind = 'solid') {
    const b = new Box(
      [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)],
      [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)],
      kind,
    );
    this.boxes.push(b);
    const [ax, az, bx, bz] = this._cellRange(b.min[0], b.min[2], b.max[0], b.max[2]);
    for (let z = az; z <= bz; z++) for (let x = ax; x <= bx; x++) this.cells[z * this.nx + x].push(b);
    return b;
  }

  remove(b) {
    if (b.removed) return;
    b.removed = true;
    const [ax, az, bx, bz] = this._cellRange(b.min[0], b.min[2], b.max[0], b.max[2]);
    for (let z = az; z <= bz; z++) {
      for (let x = ax; x <= bx; x++) {
        const c = this.cells[z * this.nx + x];
        const i = c.indexOf(b);
        if (i >= 0) c.splice(i, 1);
      }
    }
  }

  _cellRange(x0, z0, x1, z1) {
    const cs = this.cs;
    const clampX = (v) => Math.max(0, Math.min(this.nx - 1, v));
    const clampZ = (v) => Math.max(0, Math.min(this.nz - 1, v));
    return [
      clampX(Math.floor((x0 - this.minX) / cs)),
      clampZ(Math.floor((z0 - this.minZ) / cs)),
      clampX(Math.floor((x1 - this.minX) / cs)),
      clampZ(Math.floor((z1 - this.minZ) / cs)),
    ];
  }

  // Calls fn(box) for every box whose XZ footprint touches the given rectangle (deduplicated).
  forEachNear(x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    const [ax, az, bx, bz] = this._cellRange(x0, z0, x1, z1);
    for (let z = az; z <= bz; z++) {
      for (let x = ax; x <= bx; x++) {
        const c = this.cells[z * this.nx + x];
        for (let i = 0; i < c.length; i++) {
          const b = c[i];
          if (b.stamp === st) continue;
          b.stamp = st;
          if (fn(b) === true) return true;
        }
      }
    }
    return false;
  }

  // True if the AABB overlaps any movement-blocking box.
  overlaps(x0, y0, z0, x1, y1, z1) {
    return this.forEachNear(x0, z0, x1, z1, (b) => {
      if (!b.k.move) return false;
      return (
        b.min[0] < x1 && b.max[0] > x0 && b.min[1] < y1 && b.max[1] > y0 && b.min[2] < z1 && b.max[2] > z0
      );
    });
  }

  // Highest walkable surface under (x, z) whose top is within [minY, maxY], or null.
  supportHeight(x, z, maxY, minY = -5, r = 0) {
    let best = null;
    this.forEachNear(x - r, z - r, x + r, z + r, (b) => {
      if (!b.k.move) return;
      if (b.max[0] <= x - r || b.min[0] >= x + r || b.max[2] <= z - r || b.min[2] >= z + r) return;
      if (r === 0 && (x <= b.min[0] || x >= b.max[0] || z <= b.min[2] || z >= b.max[2])) return;
      const top = b.max[1];
      if (top <= maxY + EPS && top >= minY && (best === null || top > best)) best = top;
    });
    return best;
  }

  pointInside(x, y, z) {
    return this.forEachNear(x, z, x, z, (b) => {
      if (!b.k.move) return false;
      return x > b.min[0] && x < b.max[0] && y > b.min[1] && y < b.max[1] && z > b.min[2] && z < b.max[2];
    });
  }

  // Walks the grid cells along a ray (XZ DDA). visit(cellBoxes) returns false to stop.
  // The callback receives the t at which the ray leaves the current cell.
  _traverse(ox, oz, dx, dz, maxT, visit) {
    const cs = this.cs;
    let gx = (ox - this.minX) / cs;
    let gz = (oz - this.minZ) / cs;
    // Clip the start into the grid if the origin lies outside it.
    let t0 = 0;
    if (gx < 0 || gz < 0 || gx >= this.nx || gz >= this.nz) {
      let tmin = 0;
      let tmax = maxT;
      const lo = [0, 0];
      const hi = [this.nx, this.nz];
      const o = [gx, gz];
      const d = [dx / cs, dz / cs];
      for (let i = 0; i < 2; i++) {
        if (Math.abs(d[i]) < 1e-12) {
          if (o[i] < lo[i] || o[i] >= hi[i]) return;
        } else {
          let ta = (lo[i] - o[i]) / d[i];
          let tb = (hi[i] - o[i]) / d[i];
          if (ta > tb) [ta, tb] = [tb, ta];
          tmin = Math.max(tmin, ta);
          tmax = Math.min(tmax, tb);
        }
      }
      if (tmin > tmax) return;
      t0 = tmin + 1e-6;
      gx += (dx / cs) * t0;
      gz += (dz / cs) * t0;
    }
    let cx = Math.min(this.nx - 1, Math.max(0, Math.floor(gx)));
    let cz = Math.min(this.nz - 1, Math.max(0, Math.floor(gz)));
    const stepX = dx > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-12 ? cs / Math.abs(dx) : Infinity;
    const tDZ = Math.abs(dz) > 1e-12 ? cs / Math.abs(dz) : Infinity;
    let tMX = Math.abs(dx) > 1e-12 ? t0 + ((dx > 0 ? cx + 1 - gx : gx - cx) * cs) / Math.abs(dx) : Infinity;
    let tMZ = Math.abs(dz) > 1e-12 ? t0 + ((dz > 0 ? cz + 1 - gz : gz - cz) * cs) / Math.abs(dz) : Infinity;
    for (let guard = 0; guard < 4096; guard++) {
      const tExit = Math.min(tMX, tMZ);
      if (visit(this.cells[cz * this.nx + cx], tExit) === false) return;
      if (tExit > maxT) return;
      if (tMX < tMZ) {
        cx += stepX;
        tMX += tDX;
        if (cx < 0 || cx >= this.nx) return;
      } else {
        cz += stepZ;
        tMZ += tDZ;
        if (cz < 0 || cz >= this.nz) return;
      }
    }
  }

  // Nearest hit along a normalised ray. mode: 'bullet' | 'sight' | 'move'.
  // Returns { t, box, axis, sign } or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT, mode = 'bullet', ignore = null) {
    const st = ++this.stamp;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    let best = maxT;
    let hit = null;
    this._traverse(ox, oz, dx, dz, maxT, (cell, tExit) => {
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.stamp === st) continue;
        b.stamp = st;
        if (!b.k[mode] || b === ignore) continue;
        const r = rayBox(ox, oy, oz, ix, iy, iz, b);
        if (r && r.t0 < best) {
          best = r.t0;
          hit = { t: r.t0, tOut: r.t1, box: b, axis: r.axis, sign: r.sign };
        }
      }
      return tExit < best;
    });
    return hit;
  }

  // All bullet-blocking boxes along the ray, sorted by distance, stopping after the
  // first impenetrable one. Used for wall penetration.
  raycastAll(ox, oy, oz, dx, dy, dz, maxT) {
    const st = ++this.stamp;
    const ix = 1 / dx;
    const iy = 1 / dy;
    const iz = 1 / dz;
    const hits = [];
    let stopT = maxT;
    this._traverse(ox, oz, dx, dz, maxT, (cell, tExit) => {
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.stamp === st) continue;
        b.stamp = st;
        if (!b.k.bullet) continue;
        const r = rayBox(ox, oy, oz, ix, iy, iz, b);
        if (r && r.t0 < stopT) {
          hits.push({ t: r.t0, tOut: r.t1, box: b, axis: r.axis, sign: r.sign });
          if (b.k.pen === 0) stopT = r.t0;
        }
      }
      return tExit < stopT;
    });
    hits.sort((a, b) => a.t - b.t);
    const out = [];
    for (const h of hits) {
      if (h.t > stopT) break;
      out.push(h);
      if (h.box.k.pen === 0) break;
    }
    return out;
  }

  // Line of sight between two points (ignores glass and clip brushes).
  clearLine(ax, ay, az, bx, by, bz, mode = 'sight') {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, mode) === null;
  }
}

// Slab test. Returns entry/exit distances plus the axis and sign of the entry face.
export function rayBox(ox, oy, oz, ix, iy, iz, b) {
  let t0 = -Infinity;
  let t1 = Infinity;
  let axis = 0;
  let sign = 0;
  // X
  let ta = (b.min[0] - ox) * ix;
  let tb = (b.max[0] - ox) * ix;
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    if (ox < b.min[0] || ox > b.max[0]) return null;
  } else {
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) {
      t0 = ta;
      axis = 0;
      sign = ix > 0 ? -1 : 1;
    }
    if (tb < t1) t1 = tb;
  }
  // Y
  ta = (b.min[1] - oy) * iy;
  tb = (b.max[1] - oy) * iy;
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    if (oy < b.min[1] || oy > b.max[1]) return null;
  } else {
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) {
      t0 = ta;
      axis = 1;
      sign = iy > 0 ? -1 : 1;
    }
    if (tb < t1) t1 = tb;
  }
  // Z
  ta = (b.min[2] - oz) * iz;
  tb = (b.max[2] - oz) * iz;
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    if (oz < b.min[2] || oz > b.max[2]) return null;
  } else {
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    if (ta > t0) {
      t0 = ta;
      axis = 2;
      sign = iz > 0 ? -1 : 1;
    }
    if (tb < t1) t1 = tb;
  }
  if (t1 < Math.max(t0, 0)) return null;
  if (t0 < 0) {
    // Ray starts inside the box.
    return { t0: 0, t1, axis, sign };
  }
  return { t0, t1, axis, sign };
}

// ---------------------------------------------------------------------------
// Character movement
// ---------------------------------------------------------------------------

// Moves body.pos along one axis by delta, stopping at the first box in the way.
// Returns true if blocked.
function sweepAxis(world, body, axis, delta) {
  if (delta === 0) return false;
  const r = PHYS.radius;
  const p = body.pos;
  const min = [p.x - r, p.y, p.z - r];
  const max = [p.x + r, p.y + body.height, p.z + r];
  const smin = min.slice();
  const smax = max.slice();
  if (delta > 0) smax[axis] += delta;
  else smin[axis] += delta;
  let allowed = delta;
  const o1 = (axis + 1) % 3;
  const o2 = (axis + 2) % 3;
  world.forEachNear(smin[0], smin[2], smax[0], smax[2], (b) => {
    if (!b.k.move) return;
    if (b.max[o1] <= min[o1] + EPS || b.min[o1] >= max[o1] - EPS) return;
    if (b.max[o2] <= min[o2] + EPS || b.min[o2] >= max[o2] - EPS) return;
    if (delta > 0) {
      if (b.min[axis] >= max[axis] - EPS && b.min[axis] < max[axis] + allowed) {
        allowed = Math.max(0, b.min[axis] - max[axis] - EPS * 0.5);
      }
    } else if (b.max[axis] <= min[axis] + EPS && b.max[axis] > min[axis] + allowed) {
      allowed = Math.min(0, b.max[axis] - min[axis] + EPS * 0.5);
    }
  });
  if (axis === 0) p.x += allowed;
  else if (axis === 1) p.y += allowed;
  else p.z += allowed;
  return allowed !== delta;
}

export function bodyFits(world, pos, height) {
  const r = PHYS.radius;
  return !world.overlaps(pos.x - r, pos.y + 0.01, pos.z - r, pos.x + r, pos.y + height, pos.z + r);
}

// Integrates velocity with collision, step-up and ground snapping.
// body: { pos: Vector3, vel: Vector3, height, grounded }
export function moveBody(world, body, dt) {
  const p = body.pos;
  const v = body.vel;
  const dx = v.x * dt;
  const dz = v.z * dt;
  const sx = p.x;
  const sy = p.y;
  const sz = p.z;

  // Horizontal move with sliding.
  let bx = sweepAxis(world, body, 0, dx);
  let bz = sweepAxis(world, body, 2, dz);

  if ((bx || bz) && body.grounded) {
    // Try stepping up onto the obstacle.
    const ax = p.x;
    const az = p.z;
    p.set(sx, sy, sz);
    const y0 = p.y;
    sweepAxis(world, body, 1, PHYS.stepHeight);
    const lifted = p.y - y0;
    const sbx = sweepAxis(world, body, 0, dx);
    const sbz = sweepAxis(world, body, 2, dz);
    const landed = sweepAxis(world, body, 1, -(lifted + 0.02));
    const prog1 = (ax - sx) ** 2 + (az - sz) ** 2;
    const prog2 = (p.x - sx) ** 2 + (p.z - sz) ** 2;
    if (lifted > 0.01 && landed && prog2 > prog1 + 1e-6) {
      bx = sbx;
      bz = sbz;
      body.stepped = p.y - sy;
    } else {
      p.set(ax, sy, az);
    }
  }
  if (bx) v.x = 0;
  if (bz) v.z = 0;

  // Vertical.
  v.y -= PHYS.gravity * dt;
  if (v.y < -40) v.y = -40;
  if (body.grounded && v.y <= 0) {
    const y0 = p.y;
    if (sweepAxis(world, body, 1, -PHYS.stepHeight)) {
      v.y = 0;
      body.grounded = true;
      if (p.y < y0 - 0.01) body.stepped = p.y - y0;
    } else {
      p.y = y0;
      body.grounded = false;
      sweepAxis(world, body, 1, v.y * dt);
    }
  } else {
    const hit = sweepAxis(world, body, 1, v.y * dt);
    if (hit) {
      if (v.y < 0) body.grounded = true;
      v.y = 0;
    } else {
      body.grounded = false;
    }
  }
  return bx || bz;
}

// Small horizontal push with collision (used to separate overlapping characters).
export function nudgeBody(world, body, dx, dz) {
  sweepAxis(world, body, 0, dx);
  sweepAxis(world, body, 2, dz);
}
