// Bot drivers for tanks and jets, plus the coarse grid tanks path-find on.

import * as THREE from 'three';
import { DIFFICULTY } from '../config.js';
import { PROJECTILES } from '../combat.js';
import { TANK } from './tank.js';
import { clamp, wrapAngle, gaussian, rand, DEG, yawTo } from '../util.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

// ---------------------------------------------------------------- tank nav grid

// 4 m cells marked drivable if a tank fits there. Crushable props (fences, hedges,
// cars) cost more so tanks prefer roads and fields but will still plough through.
export class TankNav {
  constructor(world, bounds, cs = 4) {
    this.world = world;
    this.cs = cs;
    this.minX = bounds.minX;
    this.minZ = bounds.minZ;
    this.nx = Math.ceil((bounds.maxX - bounds.minX) / cs);
    this.nz = Math.ceil((bounds.maxZ - bounds.minZ) / cs);
    this.cost = new Float32Array(this.nx * this.nz);
    const m = 2.15;
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const cx = this.minX + (ix + 0.5) * cs;
        const cz = this.minZ + (iz + 0.5) * cs;
        let cost = 1;
        if (cx < bounds.minX + 8 || cx > bounds.maxX - 8 || cz < bounds.minZ + 8 || cz > bounds.maxZ - 8) cost = 0;
        else {
          world.forEachNear(cx - m, cz - m, cx + m, cz + m, (b) => {
            if (!b.k.move || b.removed) return false;
            if (b.max[0] <= cx - m || b.min[0] >= cx + m || b.max[2] <= cz - m || b.min[2] >= cz + m) return false;
            if (b.max[1] <= TANK.climb || b.min[1] >= 2.8) return false;
            if (b.group && b.group.crush) {
              cost = Math.max(cost, 3);
              return false;
            }
            cost = 0;
            return true;
          });
        }
        this.cost[iz * this.nx + ix] = cost;
      }
    }
    this.heap = new Int32Array(this.nx * this.nz * 2);
    this.g = new Float32Array(this.nx * this.nz);
    this.from = new Int32Array(this.nx * this.nz);
    this.seen = new Uint32Array(this.nx * this.nz);
    this.stamp = 0;
  }

  cell(x, z) {
    const ix = Math.floor((x - this.minX) / this.cs);
    const iz = Math.floor((z - this.minZ) / this.cs);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }

  center(i, out = []) {
    out[0] = this.minX + ((i % this.nx) + 0.5) * this.cs;
    out[1] = this.minZ + (Math.floor(i / this.nx) + 0.5) * this.cs;
    return out;
  }

  passable(x, z) {
    const i = this.cell(x, z);
    return i >= 0 && this.cost[i] > 0;
  }

  // Closest drivable cell to a point (spiral search).
  nearestFree(x, z, maxR = 8) {
    const c = this.cell(x, z);
    if (c >= 0 && this.cost[c] > 0) return c;
    const ix = Math.floor((x - this.minX) / this.cs);
    const iz = Math.floor((z - this.minZ) / this.cs);
    for (let r = 1; r <= maxR; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const jx = ix + dx;
          const jz = iz + dz;
          if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
          const j = jz * this.nx + jx;
          if (this.cost[j] <= 0) continue;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  randomFree(filter) {
    for (let k = 0; k < 200; k++) {
      const i = (Math.random() * this.cost.length) | 0;
      if (this.cost[i] !== 1) continue;
      const c = this.center(i);
      if (!filter || filter(c[0], c[1])) return c;
    }
    return null;
  }

  // A* (8-connected). Returns [[x, z], ...] or null.
  findPath(sx, sz, gx, gz, maxIter = 12000) {
    const s = this.nearestFree(sx, sz);
    const goal = this.nearestFree(gx, gz);
    if (s < 0 || goal < 0) return null;
    const nx = this.nx;
    const st = ++this.stamp;
    const G = this.g;
    const heap = this.heap;
    const fScore = new Map();
    let hn = 0;
    const gxI = goal % nx;
    const gzI = Math.floor(goal / nx);
    const h = (i) => {
      const dx = Math.abs((i % nx) - gxI);
      const dz = Math.abs(Math.floor(i / nx) - gzI);
      return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
    };
    const push = (i, f) => {
      fScore.set(i, f);
      let k = hn++;
      heap[k] = i;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (fScore.get(heap[p]) <= f) break;
        heap[k] = heap[p];
        heap[p] = i;
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap[--hn];
      let k = 0;
      const f = fScore.get(last);
      for (;;) {
        const l = k * 2 + 1;
        if (l >= hn) break;
        const r = l + 1;
        const c = r < hn && fScore.get(heap[r]) < fScore.get(heap[l]) ? r : l;
        if (fScore.get(heap[c]) >= f) break;
        heap[k] = heap[c];
        k = c;
      }
      heap[k] = last;
      return top;
    };
    G[s] = 0;
    this.seen[s] = st;
    this.from[s] = -1;
    push(s, h(s));
    const closed = new Set();
    let iter = 0;
    let found = false;
    while (hn > 0 && iter++ < maxIter) {
      const cur = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % nx;
      const cz = Math.floor(cur / nx);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const jx = cx + dx;
          const jz = cz + dz;
          if (jx < 0 || jz < 0 || jx >= nx || jz >= this.nz) continue;
          const j = jz * nx + jx;
          const c = this.cost[j];
          if (c <= 0) continue;
          if (dx && dz && (this.cost[cz * nx + jx] <= 0 || this.cost[jz * nx + cx] <= 0)) continue;
          const ng = G[cur] + c * (dx && dz ? 1.414 : 1);
          if (this.seen[j] === st && ng >= G[j]) continue;
          this.seen[j] = st;
          G[j] = ng;
          this.from[j] = cur;
          push(j, ng + h(j));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goal; i >= 0; i = this.from[i]) cells.push(i);
    cells.reverse();
    // string-pull: skip cells while the straight line stays on cheap cells
    const out = [];
    let a = 0;
    out.push(this.center(cells[0]));
    while (a < cells.length - 1) {
      let b = Math.min(cells.length - 1, a + 12);
      while (b > a + 1 && !this._straight(cells[a], cells[b])) b--;
      out.push(this.center(cells[b]));
      a = b;
    }
    out[out.length - 1] = [gx, gz];
    return out;
  }

  _straight(i, j) {
    const a = this.center(i);
    const b = this.center(j);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(d / (this.cs * 0.5));
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const c = this.cell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
      if (c < 0 || this.cost[c] !== 1) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------- shared helpers

function skillOf(actor) {
  return DIFFICULTY[actor.bot?.level] || DIFFICULTY.normal;
}

// Can `eye` see the target (vehicle or soldier) through walls and smoke?
function canSee(game, eye, t, tp) {
  if (!game.world.clearLine(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z, 'sight')) return false;
  return !game.combat.smokeBlocks(eye.x, eye.y, eye.z, tp.x, tp.y, tp.z);
}

function aimPointOf(t, out) {
  if (t.vehicle) {
    out.copy(t.vehicle.pos);
    if (t.vehicle.kind === 'tank') out.y += 1.3;
  } else out.set(t.pos.x, t.pos.y + 0.95 - 0.35 * t.crouchT, t.pos.z);
  return out;
}

// ---------------------------------------------------------------- tank brain

export class TankBrain {
  constructor(game, actor, tank) {
    this.game = game;
    this.a = actor;
    this.v = tank;
    this.s = skillOf(actor);
    this.path = null;
    this.pathIdx = 0;
    this.goal = null;
    this.target = null;
    this.senseT = 0;
    this.repathT = 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.lastPos = tank.pos.clone();
    this.progressT = 0;
    this.errYaw = 0;
    this.errPitch = 0;
    this.reactT = 0;
    this.mgBurst = 0;
    this.holdT = 0;
    this.seenT = 0;
  }

  update(dt, frozen) {
    const v = this.v;
    if (!v.alive) return;
    this.s = skillOf(this.a);
    const inp = v.input;
    inp.fire = false;
    inp.mg = false;
    if (frozen) {
      inp.throttle = 0;
      inp.steer = 0;
      return;
    }
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.3;
      this._sense();
    }
    this._drive(dt);
    this._gun(dt);
  }

  _sense() {
    const g = this.game;
    const v = this.v;
    const eye = tmp.copy(v.pos);
    eye.y += 2.6;
    let best = null;
    let bestScore = Infinity;
    const range = this.s.sight * 2.4;
    for (const e of g.actors) {
      if (!e.alive || e.team === v.team) continue;
      if (e.vehicle && e.vehicle.kind === 'jet') continue;
      const tp = aimPointOf(e, tmp2);
      const d = tp.distanceTo(eye);
      if (d > (e.vehicle ? range * 1.4 : range)) continue;
      if (!canSee(g, eye, e, tp)) continue;
      g.reportSighting(v.team, e);
      // other tanks are the real threat
      const score = d * (e.vehicle ? 0.35 : 1) * (e === this.target ? 0.7 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best !== this.target) {
      this.target = best;
      if (best) {
        this.reactT = this.s.reaction * rand(1.2, 2);
        const e = this.s.aimError * DEG * 0.6;
        this.errYaw = gaussian() * e;
        this.errPitch = gaussian() * e * 0.4;
      }
    }
    if (best) this.seenT = g.time;
  }

  _chooseGoal() {
    const g = this.game;
    const v = this.v;
    const nav = g.tankNav;
    const side = v.team === 0 ? 1 : -1;
    // head for recent intel, otherwise roam the countryside and town edges
    const intel = g.freshIntel(v.team, 10);
    if (intel && Math.random() < 0.6) {
      const p = intel.pos;
      this._setGoal(p.x, p.z);
      return;
    }
    const c = nav.randomFree((x, z) => {
      const fwd = x * side;
      if (fwd < -140 || fwd > 150) return false;
      // stay off the narrow town lanes most of the time
      if (Math.abs(x) < 60 && Math.abs(z) > 8 && Math.abs(z) < 46 && Math.random() < 0.85) return false;
      return Math.hypot(x - v.pos.x, z - v.pos.z) > 40;
    });
    if (c) this._setGoal(c[0], c[1]);
  }

  _setGoal(x, z) {
    const v = this.v;
    const p = this.game.tankNav.findPath(v.pos.x, v.pos.z, x, z);
    this.goal = [x, z];
    this.path = p;
    this.pathIdx = 1;
    this.repathT = 8;
  }

  _drive(dt) {
    const v = this.v;
    const inp = v.input;
    const t = this.target;
    // engaging: hold at a comfortable range, keep crawling if infantry is close
    let hold = false;
    if (t && t.alive) {
      const d = aimPointOf(t, tmp2).distanceTo(v.pos);
      if (t.vehicle ? d < 110 : d > 18 && d < 80) hold = true;
    }
    this.repathT -= dt;
    if (!this.path || this.pathIdx >= this.path.length || this.repathT <= 0) {
      if (this.holdT > 0) this.holdT -= dt;
      else {
        this._chooseGoal();
        this.holdT = rand(1, 4);
      }
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = -1;
      inp.steer = this.reverseSteer;
      return;
    }
    if (hold || !this.path || this.pathIdx >= this.path.length) {
      inp.throttle = 0;
      // swing the hull to face a tank target (front armour forward)
      if (t && t.vehicle) {
        const want = yawTo(t.vehicle.pos.x - v.pos.x, t.vehicle.pos.z - v.pos.z);
        const diff = wrapAngle(want - v.yaw);
        inp.steer = Math.abs(diff) > 0.25 ? Math.sign(diff) : 0;
      } else inp.steer = 0;
      this.progressT = 0;
      return;
    }
    // pure pursuit along the path
    let wp = this.path[this.pathIdx];
    while (this.pathIdx < this.path.length - 1 && Math.hypot(wp[0] - v.pos.x, wp[1] - v.pos.z) < 7) {
      this.pathIdx++;
      wp = this.path[this.pathIdx];
    }
    const dist = Math.hypot(wp[0] - v.pos.x, wp[1] - v.pos.z);
    if (this.pathIdx === this.path.length - 1 && dist < 6) {
      this.path = null;
      return;
    }
    const want = yawTo(wp[0] - v.pos.x, wp[1] - v.pos.z);
    const diff = wrapAngle(want - v.yaw);
    inp.steer = clamp(diff * 2.2, -1, 1);
    inp.throttle = Math.abs(diff) > 1.0 ? 0 : Math.abs(diff) > 0.45 ? 0.45 : 1;
    if (t && t.alive && !t.vehicle) inp.throttle *= 0.6;
    // stuck? back up and try again
    this.progressT += dt;
    if (this.progressT > 1.5) {
      const moved = this.lastPos.distanceTo(v.pos);
      this.lastPos.copy(v.pos);
      this.progressT = 0;
      if (moved < 1.2 && inp.throttle > 0) {
        this.stuckT++;
        if (this.stuckT >= 2) {
          this.reverseT = rand(1.2, 2.2);
          this.reverseSteer = Math.random() < 0.5 ? -1 : 1;
          this.stuckT = 0;
          this.repathT = 2.5;
        }
      } else this.stuckT = 0;
    }
  }

  _gun(dt) {
    const g = this.game;
    const v = this.v;
    const inp = v.input;
    const t = this.target;
    if (!t || !t.alive || g.time - this.seenT > 2.5) {
      // look where we're going
      const yaw = v.yaw + Math.sin(g.time * 0.3 + this.a.id) * 0.6;
      v.aimYaw = yaw;
      v.aimPitch = 0;
      return;
    }
    const muzzle = v.muzzleWorld(new THREE.Vector3());
    const tp = aimPointOf(t, new THREE.Vector3());
    const dist = tp.distanceTo(muzzle);
    const useMg = !t.vehicle && dist < 70 && (v.reload > 0.6 || dist < 35);
    // lead and drop for the shell
    if (!useMg) {
      const pd = PROJECTILES.shell;
      const tt = dist / pd.speed;
      const tv = t.vehicle ? (t.vehicle.kind === 'tank' ? t.vehicle.forwardDir.clone().multiplyScalar(t.vehicle.speed) : t.vehicle.vel) : t.vel;
      tp.addScaledVector(tv, tt);
      tp.y += 0.5 * pd.gravity * tt * tt;
    }
    const settle = Math.exp(-dt / Math.max(0.2, this.s.settle * 2));
    this.errYaw *= settle;
    this.errPitch *= settle;
    v.aimAt(tp);
    v.aimYaw += this.errYaw;
    v.aimPitch += this.errPitch;
    this.reactT -= dt;
    if (this.reactT > 0) return;
    const gd = v.gunDir(new THREE.Vector3());
    const to = tp.clone().sub(muzzle).normalize();
    const off = Math.acos(clamp(gd.dot(to), -1, 1));
    const tol = Math.atan2(t.vehicle ? 1.6 : 1.1, dist) + this.s.aimError * DEG * 0.3;
    if (off > tol) return;
    if (!g.world.clearLine(muzzle.x, muzzle.y, muzzle.z, tp.x, tp.y, tp.z, 'bullet')) return;
    // don't shell your own side
    for (const o of g.actors) {
      if (!o.alive || o.team !== v.team || o === this.a || o.vehicle) continue;
      if (o.pos.distanceTo(tp) < 6) return;
    }
    if (useMg) {
      this.mgBurst -= dt;
      if (this.mgBurst < -0.5) this.mgBurst = rand(0.6, 1.4);
      inp.mg = this.mgBurst > 0;
    } else if (v.reload <= 0) {
      inp.fire = true;
      this.reactT = rand(0.2, 0.6);
    }
  }
}

// ---------------------------------------------------------------- jet brain

export class JetBrain {
  constructor(game, actor, jet) {
    this.game = game;
    this.a = actor;
    this.v = jet;
    this.s = skillOf(actor);
    this.mode = 'patrol';
    this.target = null;
    this.thinkT = 0;
    this.recoverT = 0;
    this.attackKind = 'dive';
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.patrolAlt = rand(160, 230);
    this.noise = new THREE.Vector3();
    this.noiseT = 0;
  }

  update(dt, frozen) {
    const g = this.game;
    const v = this.v;
    if (!v.alive) return;
    this.s = skillOf(this.a);
    const inp = v.input;
    inp.fire = false;
    inp.fire2 = false;
    inp.roll = 0;
    inp.yaw = 0;
    inp.boost = false;
    inp.throttle = 0;
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 1;
      this._think();
    }
    const aim = this._steer(dt);
    // don't fly into other jets
    for (const o of g.vehicles) {
      if (o === v || o.kind !== 'jet' || !o.alive) continue;
      const rel = tmp.copy(o.pos).sub(v.pos);
      const d = rel.length();
      if (d > 90 || (this.mode === 'dogfight' && o.team !== v.team && d > 30)) continue;
      const closing = -rel.dot(tmp2.copy(o.vel).sub(v.vel)) / (d || 1);
      if (closing < 5 && d > 25) continue;
      // steer away from it, preferring up if it's below us
      aim.addScaledVector(rel.normalize(), -1.2 * (1 - d / 90));
      aim.y += rel.y < 0 ? 0.4 : -0.2;
      aim.normalize();
    }
    // aim wobble scaled by skill
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 0.4;
      const e = this.s.aimError * DEG * 0.35;
      this.noise.set(gaussian() * e, gaussian() * e, gaussian() * e);
    }
    v.aimDir.copy(aim).add(this.noise).normalize();
    // throttle management
    const wantSpeed = this.mode === 'attack' && this.attackKind === 'bomb' ? 95 : this.mode === 'dogfight' ? 130 : 105;
    v.throttle = clamp(v.throttle + (wantSpeed > v.speed ? 1 : -1) * dt * 0.5, 0.25, 1);
    inp.boost = this.mode === 'dogfight' && v.speed < 110;
    if (frozen) {
      inp.fire = false;
      inp.fire2 = false;
    }
  }

  _think() {
    const g = this.game;
    const v = this.v;
    if (this.mode === 'recover') return;
    // enemy jets first (sometimes), then tanks, then soldiers out in the open
    let best = null;
    let bestScore = Infinity;
    for (const e of g.actors) {
      if (!e.alive || e.team === v.team) continue;
      const tp = aimPointOf(e, tmp2);
      const d = tp.distanceTo(v.pos);
      let score;
      if (e.vehicle && e.vehicle.kind === 'jet') {
        // dogfight only when the other jet is close; ground targets matter more
        if (d > 500) continue;
        score = d * 1.3;
      } else if (e.vehicle) {
        if (d > 1100) continue;
        score = d * 0.4;
      } else {
        if (d > 900 || e.pos.y > 1.5) continue;
        // indoors? skip
        if (!g.world.clearLine(tp.x, tp.y + 0.5, tp.z, tp.x, tp.y + 40, tp.z, 'bullet')) continue;
        let near = 0;
        for (const o of g.actors) if (o.alive && o.team === e.team && !o.vehicle && o.pos.distanceTo(e.pos) < 12) near++;
        score = d * (1.4 - Math.min(0.6, near * 0.15));
      }
      if (e === this.target) score *= 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best !== this.target) {
      this.target = best;
      const jet = best && best.vehicle && best.vehicle.kind === 'jet';
      if (best && !jet) this.attackKind = best.vehicle && v.bombs > 0 && Math.random() < 0.5 ? 'bomb' : 'dive';
    }
    if (!best) this.mode = 'patrol';
    else this.mode = best.vehicle && best.vehicle.kind === 'jet' ? 'dogfight' : 'attack';
    v.secondary = this.attackKind === 'bomb' ? 1 : 0;
  }

  _steer(dt) {
    const v = this.v;
    const inp = v.input;
    const out = new THREE.Vector3();
    const F = tmp.set(0, 0, -1).applyQuaternion(v.quat).clone();
    // terrain avoidance always wins (the faster we're sinking, the earlier we pull out)
    const floor = 40 + Math.max(0, -v.vel.y) * 0.9;
    if (this.mode === 'recover' || v.pos.y < floor) {
      if (this.mode !== 'recover') {
        this.mode = 'recover';
        this.recoverT = rand(2.5, 3.5);
      }
      this.recoverT -= dt;
      if (this.recoverT <= 0 && v.pos.y > 70) this.mode = 'patrol';
      return out.set(F.x, 0, F.z).normalize().setY(0.65).normalize();
    }
    const t = this.target;
    if (this.mode === 'patrol' || !t || !t.alive) {
      // fly a lazy circle over the map
      const ang = Math.atan2(v.pos.z, v.pos.x) + this.circleDir * 0.35;
      const r = 300;
      const px = Math.cos(ang) * r;
      const pz = Math.sin(ang) * r;
      return out.set(px - v.pos.x, this.patrolAlt - v.pos.y, pz - v.pos.z).normalize();
    }
    const tp = aimPointOf(t, new THREE.Vector3());
    const d = tp.distanceTo(v.pos);
    const hd = Math.hypot(tp.x - v.pos.x, tp.z - v.pos.z);
    if (this.mode === 'dogfight') {
      out.copy(tp).sub(v.pos);
      // don't chase each other into the stratosphere
      if (v.pos.y > 320) out.y = Math.min(out.y, -0.2 * out.length());
      out.normalize();
      const off = Math.acos(clamp(F.dot(out), -1, 1));
      if (d < 600 && off < 3 * DEG && this._clear(tp)) inp.fire = true;
      return out;
    }
    if (this.attackKind === 'bomb') {
      // level pass at ~70 m, release when the predicted impact is on the target
      const alt = 75;
      if (hd > 700) return out.set(tp.x - v.pos.x, alt + 40 - v.pos.y, tp.z - v.pos.z).normalize();
      const pip = v.predictBomb(tmp2);
      const miss = Math.hypot(pip.x - tp.x, pip.z - tp.z);
      if (miss < 14 && v.bombs > 0) inp.fire2 = true;
      // steer so the pipper slides onto the target
      const aheadX = tp.x - (pip.x - v.pos.x);
      const aheadZ = tp.z - (pip.z - v.pos.z);
      if (hd < 120 && this._overshot(tp, F)) this._breakOff();
      return out.set(aheadX - v.pos.x, alt - v.pos.y, aheadZ - v.pos.z).normalize();
    }
    // dive attack: approach high, then point the nose at the target
    if (hd > 650 && v.pos.y < 150) return out.set(tp.x - v.pos.x, 190 - v.pos.y, tp.z - v.pos.z).normalize();
    const lead = d / (PROJECTILES.jetRocket.speed + v.speed);
    const tv = t.vehicle ? (t.vehicle.kind === 'tank' ? t.vehicle.forwardDir.clone().multiplyScalar(t.vehicle.speed) : t.vehicle.vel) : t.vel;
    const aimP = tp.clone().addScaledVector(tv, lead);
    aimP.y += 0.5 * PROJECTILES.jetRocket.gravity * lead * lead;
    out.copy(aimP).sub(v.pos).normalize();
    const off = Math.acos(clamp(F.dot(out), -1, 1));
    if (off < 3.5 * DEG && d < 420 && this._clear(tp)) {
      if (t.vehicle && v.rockets > 0) inp.fire2 = true;
      inp.fire = true;
    }
    if (d < 140) this._breakOff();
    return out;
  }

  _clear(tp) {
    const v = this.v;
    // no friendlies right next to the target
    for (const o of this.game.actors) {
      if (!o.alive || o.team !== v.team || o === this.a) continue;
      if (o.pos.distanceTo(tp) < 9) return false;
    }
    return true;
  }

  _overshot(tp, F) {
    return (tp.x - this.v.pos.x) * F.x + (tp.z - this.v.pos.z) * F.z < 0;
  }

  _breakOff() {
    this.mode = 'recover';
    this.recoverT = rand(3, 4.5);
    this.target = null;
  }
}
