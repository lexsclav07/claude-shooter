// Navigation graph for the bots. Generated automatically from the collision world:
//   * a 1 m grid of walkable points on every floor level (ground, upstairs, stages...)
//   * explicit nodes through every doorway / gate (portals) and up every staircase
// Edges are validated by "walking" a character-sized box along them, so anything
// the graph allows the physics can actually do.

import { PHYS } from './config.js';

const STEP = PHYS.stepHeight;
const NAV_R = 0.3;
const HEIGHT = PHYS.standHeight;

class MinHeap {
  constructor() {
    this.ids = [];
    this.keys = [];
  }
  get size() {
    return this.ids.length;
  }
  push(id, key) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop() {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop();
    const lastKey = keys.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

export class NavGraph {
  constructor(world, bounds) {
    this.world = world;
    this.bounds = bounds;
    this.x = [];
    this.y = [];
    this.z = [];
    this.adj = [];
    this.cell = 2;
  }

  clear(x, y, z, r = NAV_R) {
    return !this.world.overlaps(x - r, y + STEP, z - r, x + r, y + HEIGHT, z + r);
  }

  // Valid standing surfaces in a vertical column.
  _surfaces(x, z) {
    const tops = [];
    this.world.forEachNear(x, z, x, z, (b) => {
      if (!b.k.move || b.kind === 'glass' || b.kind === 'clip') return;
      if (x <= b.min[0] || x >= b.max[0] || z <= b.min[2] || z >= b.max[2]) return;
      if (b.max[1] > 8) return;
      tops.push(b.max[1]);
    });
    const out = [];
    for (const t of tops) {
      if (out.some((o) => Math.abs(o - t) < 0.05)) continue;
      if (this.world.pointInside(x, t + 0.02, z)) continue;
      if (!this.clear(x, t, z)) continue;
      out.push(t);
    }
    return out;
  }

  // Simulates walking from a to b. Returns true if a character fits the whole way.
  walk(ax, ay, az, bx, by, bz) {
    const dist = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(dist / 0.2));
    let y = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const ny = this.world.supportHeight(x, z, y + STEP + 0.01, y - 0.7);
      if (ny === null) return false;
      if (!this.clear(x, ny, z)) return false;
      y = ny;
    }
    return Math.abs(y - by) < 0.25;
  }

  _addNode(x, y, z) {
    this.x.push(x);
    this.y.push(y);
    this.z.push(z);
    this.adj.push([]);
    return this.x.length - 1;
  }

  _link(a, b) {
    if (a === b) return;
    if (this.adj[a].includes(b)) return;
    const c = Math.hypot(this.x[a] - this.x[b], (this.y[a] - this.y[b]) * 1.5, this.z[a] - this.z[b]);
    this.adj[a].push(b, c);
    this.adj[b].push(a, c);
  }

  _hash() {
    this.buckets = new Map();
    for (let i = 0; i < this.x.length; i++) {
      const k = this._key(this.x[i], this.z[i]);
      let l = this.buckets.get(k);
      if (!l) this.buckets.set(k, (l = []));
      l.push(i);
    }
  }

  _key(x, z) {
    return (Math.floor(x / this.cell) + 512) * 4096 + (Math.floor(z / this.cell) + 512);
  }

  // Indices of nodes within r (xz) of a point.
  near(x, z, r, out = []) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    const r2 = r * r;
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const l = this.buckets.get((i + 512) * 4096 + (j + 512));
        if (!l) continue;
        for (const n of l) {
          const dx = this.x[n] - x;
          const dz = this.z[n] - z;
          if (dx * dx + dz * dz <= r2) out.push(n);
        }
      }
    }
    return out;
  }

  build(builder, seeds) {
    const t0 = performance.now();
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const S = 1.0;
    const nx = Math.floor((maxX - minX) / S);
    const nz = Math.floor((maxZ - minZ) / S);
    const cols = new Array(nx * nz);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = minX + (i + 0.5) * S;
        const z = minZ + (j + 0.5) * S;
        const ids = [];
        for (const t of this._surfaces(x, z)) ids.push(this._addNode(x, t, z));
        cols[i * nz + j] = ids;
      }
    }
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        for (const a of cols[i * nz + j]) {
          for (const [di, dj] of dirs) {
            const ii = i + di;
            const jj = j + dj;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
            for (const b of cols[ii * nz + jj]) {
              if (Math.abs(this.y[a] - this.y[b]) > 1.2) continue;
              if (this.walk(this.x[a], this.y[a], this.z[a], this.x[b], this.y[b], this.z[b])) this._link(a, b);
            }
          }
        }
      }
    }
    const gridCount = this.x.length;

    // Extra nodes: doorways and stairs.
    const extra = [];
    const snap = (p) => {
      const y = this.world.supportHeight(p[0], p[2], p[1] + 0.5, p[1] - 0.8);
      if (y === null || !this.clear(p[0], y, p[2])) return -1;
      const id = this._addNode(p[0], y, p[2]);
      extra.push(id);
      return id;
    };
    const chainLink = (a, b) => {
      if (a < 0 || b < 0) return false;
      if (this.walk(this.x[a], this.y[a], this.z[a], this.x[b], this.y[b], this.z[b])) {
        this._link(a, b);
        return true;
      }
      return false;
    };
    this.badPortals = 0;
    for (const p of builder.portals) {
      const a = snap(p.a);
      const c = snap(p.c);
      const b = snap(p.b);
      const ok1 = chainLink(a, c);
      const ok2 = chainLink(c, b);
      if (!ok1 || !ok2) {
        this.badPortals++;
        (this.badList ||= []).push(p.c.map((v) => +v.toFixed(2)));
      }
    }
    this.badChains = 0;
    for (const chain of builder.navLinks) {
      const ids = chain.map(snap);
      for (let k = 0; k < ids.length - 1; k++) if (!chainLink(ids[k], ids[k + 1])) this.badChains++;
    }
    this._hash();
    const tmp = [];
    for (const e of extra) {
      for (const n of this.near(this.x[e], this.z[e], 1.6, tmp)) {
        if (n === e || Math.abs(this.y[n] - this.y[e]) > 0.6) continue;
        if (this.walk(this.x[e], this.y[e], this.z[e], this.x[n], this.y[n], this.z[n])) this._link(e, n);
      }
    }

    // Keep only what is reachable from the spawns.
    const reach = new Uint8Array(this.x.length);
    const queue = [];
    for (const s of seeds) {
      const n = this.nearest(s[0], s[1], s[2], 4, false);
      if (n >= 0 && !reach[n]) {
        reach[n] = 1;
        queue.push(n);
      }
    }
    while (queue.length) {
      const n = queue.pop();
      const a = this.adj[n];
      for (let k = 0; k < a.length; k += 2) {
        if (!reach[a[k]]) {
          reach[a[k]] = 1;
          queue.push(a[k]);
        }
      }
    }
    const remap = new Int32Array(this.x.length).fill(-1);
    const X = [];
    const Y = [];
    const Z = [];
    for (let i = 0; i < this.x.length; i++) {
      if (!reach[i]) continue;
      remap[i] = X.length;
      X.push(this.x[i]);
      Y.push(this.y[i]);
      Z.push(this.z[i]);
    }
    const adj = [];
    for (let i = 0; i < this.x.length; i++) {
      if (!reach[i]) continue;
      const a = this.adj[i];
      const out = [];
      for (let k = 0; k < a.length; k += 2) if (remap[a[k]] >= 0) out.push(remap[a[k]], a[k + 1]);
      adj.push(out);
    }
    const before = this.x.length;
    this.x = Float32Array.from(X);
    this.y = Float32Array.from(Y);
    this.z = Float32Array.from(Z);
    this.adj = adj;
    this.count = X.length;
    this._hash();
    this.g = new Float32Array(this.count);
    this.from = new Int32Array(this.count);
    this.seen = new Uint32Array(this.count);
    this.searchId = 0;

    // Spots worth holding (upstairs windows etc).
    this.spots = [];
    for (const s of builder.interest) {
      const n = this.nearest(s.pos[0], s.pos[1], s.pos[2], 1.5, false);
      if (n >= 0) this.spots.push({ node: n, dir: s.dir, kind: s.kind });
    }
    this.stats = {
      nodes: this.count,
      pruned: before - this.count,
      grid: gridCount,
      badPortals: this.badPortals,
      badList: this.badList,
      badChains: this.badChains,
      ms: Math.round(performance.now() - t0),
    };
    return this.stats;
  }

  // Nearest node to a position. If checkWalk, prefers nodes reachable in a straight line.
  nearest(x, y, z, r = 3, checkWalk = true) {
    const cand = this.near(x, z, r, []);
    let best = -1;
    let bestD = Infinity;
    const scored = [];
    for (const n of cand) {
      const dy = this.y[n] - y;
      if (dy > 1.2 || dy < -2.5) continue;
      const d = (this.x[n] - x) ** 2 + (this.z[n] - z) ** 2 + dy * dy * 4;
      scored.push([d, n]);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!checkWalk || best < 0) return best;
    scored.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < Math.min(6, scored.length); k++) {
      const n = scored[k][1];
      if (this.walk(x, y, z, this.x[n], this.y[n], this.z[n])) return n;
    }
    return best;
  }

  // A* between two node indices. Returns node index list or null.
  findPath(start, goal, maxIter = 30000) {
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [start];
    const id = ++this.searchId;
    const g = this.g;
    const from = this.from;
    const seen = this.seen;
    const gx = this.x[goal];
    const gy = this.y[goal];
    const gz = this.z[goal];
    const h = (n) => Math.hypot(this.x[n] - gx, (this.y[n] - gy) * 1.5, this.z[n] - gz);
    const open = new MinHeap();
    g[start] = 0;
    from[start] = -1;
    seen[start] = id;
    open.push(start, h(start));
    // closed flag: seen === id and g negative-tagged via a second stamp array
    const closed = this._closed && this._closed.length === this.count ? this._closed : (this._closed = new Uint32Array(this.count));
    let iter = 0;
    while (open.size && iter++ < maxIter) {
      const n = open.pop();
      if (closed[n] === id) continue;
      closed[n] = id;
      if (n === goal) {
        const out = [];
        for (let c = goal; c !== -1; c = from[c]) out.push(c);
        return out.reverse();
      }
      const a = this.adj[n];
      const gn = g[n];
      for (let k = 0; k < a.length; k += 2) {
        const m = a[k];
        if (closed[m] === id) continue;
        const ng = gn + a[k + 1];
        if (seen[m] !== id || ng < g[m]) {
          seen[m] = id;
          g[m] = ng;
          from[m] = n;
          open.push(m, ng + h(m));
        }
      }
    }
    return null;
  }

  pathBetween(ax, ay, az, bx, by, bz) {
    const s = this.nearest(ax, ay, az, 3, true);
    const e = this.nearest(bx, by, bz, 4, false);
    const nodes = this.findPath(s, e);
    if (!nodes) return null;
    return nodes.map((n) => [this.x[n], this.y[n], this.z[n]]);
  }

  randomNode(rnd = Math.random) {
    return Math.floor(rnd() * this.count);
  }

  pos(n) {
    return [this.x[n], this.y[n], this.z[n]];
  }
}
