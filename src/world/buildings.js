// Generic building generator plus templates for the town's houses, shops and pub.
// Local frame: frontage runs along +x from 0..w, depth along +z from 0..d,
// the front face is at z = 0 and faces -z.

import * as THREE from 'three';
import { signTexture, pubSignTexture } from './textures.js';

const STAIR_W = 0.95;
const STAIR_RUN = 0.25;
const STAIR_STEPS = 14;
const HOLE_EXTRA = 0.4;

const SIDES = (w, d, T) => ({
  front: { axis: 'x', a0: 0, a1: w, c0: 0, c1: T, outer: 'nz', inner: 'pz', n: [0, -1], out: -1 },
  back: { axis: 'x', a0: 0, a1: w, c0: d - T, c1: d, outer: 'pz', inner: 'nz', n: [0, 1], out: 1 },
  left: { axis: 'z', a0: T, a1: d - T, c0: 0, c1: T, outer: 'nx', inner: 'px', n: [-1, 0], out: -1 },
  right: { axis: 'z', a0: T, a1: d - T, c0: w - T, c1: w, outer: 'px', inner: 'nx', n: [1, 0], out: 1 },
});

// Box in wall coordinates (a = along wall, c = across wall) -> local box.
function wallBox(B, side, a0, a1, y0, y1, c0, c1, mat, opts) {
  if (side.axis === 'x') return B.box(a0, y0, c0, a1, y1, c1, mat, opts);
  return B.box(c0, y0, a0, c1, y1, a1, mat, opts);
}

function wallPane(B, side, a0, a1, y0, y1, c0, c1) {
  if (side.axis === 'x') return B.pane(a0, y0, c0, a1, y1, c1);
  return B.pane(c0, y0, a0, c1, y1, a1);
}

// Subtract a set of vertical ranges from [y0, y1].
function subtractRanges(y0, y1, holes) {
  let spans = [[y0, y1]];
  for (const [h0, h1] of holes) {
    const next = [];
    for (const [s, e] of spans) {
      if (h1 <= s || h0 >= e) {
        next.push([s, e]);
        continue;
      }
      if (h0 > s) next.push([s, h0]);
      if (h1 < e) next.push([h1, e]);
    }
    spans = next;
  }
  return spans;
}

// Solid wall from side.a0..a1 with rectangular holes cut for openings.
export function wallWithOpenings(B, side, y0, y1, ops, ext, inner, opts = {}) {
  const cuts = new Set([side.a0, side.a1]);
  for (const o of ops) {
    cuts.add(Math.max(side.a0, Math.min(side.a1, o.a0)));
    cuts.add(Math.max(side.a0, Math.min(side.a1, o.a1)));
  }
  const xs = [...cuts].sort((a, b) => a - b);
  const c0 = opts.c0 ?? side.c0;
  const c1 = opts.c1 ?? side.c1;
  for (let i = 0; i < xs.length - 1; i++) {
    const s = xs[i];
    const e = xs[i + 1];
    if (e - s < 1e-4) continue;
    const holes = ops.filter((o) => o.a0 <= s + 1e-6 && o.a1 >= e - 1e-6).map((o) => [o.y0, o.y1]);
    for (const [sy, ey] of subtractRanges(y0, y1, holes)) {
      if (ey - sy < 1e-4) continue;
      const faces = {};
      const faceTint = {};
      if (inner) {
        faces[side.inner] = inner;
        if (opts.innerTint) faceTint[side.inner] = opts.innerTint;
      }
      if (opts.outerInner) {
        faces[side.outer] = opts.outerInner;
        if (opts.innerTint) faceTint[side.outer] = opts.innerTint;
      }
      wallBox(B, side, s, e, sy, ey, c0, c1, ext, { faces, faceTint, tint: opts.tint, kind: opts.kind || 'solid' });
    }
  }
}

function outerC(side) {
  return side.out < 0 ? side.c0 : side.c1;
}
function innerC(side) {
  return side.out < 0 ? side.c1 : side.c0;
}

// Fills an opening with glass, frames, sills and doors as appropriate.
function fillOpening(B, side, op, floorY, spec, exterior) {
  const cc = (side.c0 + side.c1) / 2;
  const oc = outerC(side);
  const ic = innerC(side);
  const outward = side.out;
  const frameMat = op.frameMat || spec.frameMat || 'white';
  const frameTint = op.frameTint ?? spec.frameTint;
  const ft = 0.06;
  const vis = { collide: false, tint: frameTint };
  const ca = (op.a0 + op.a1) / 2;
  if (op.kind === 'window' || op.kind === 'shop') {
    if (!op.open) wallPane(B, side, op.a0, op.a1, op.y0, op.y1, cc - 0.012, cc + 0.012);
    const f0 = cc - 0.05;
    const f1 = cc + 0.05;
    wallBox(B, side, op.a0, op.a0 + ft, op.y0, op.y1, f0, f1, frameMat, vis);
    wallBox(B, side, op.a1 - ft, op.a1, op.y0, op.y1, f0, f1, frameMat, vis);
    wallBox(B, side, op.a0, op.a1, op.y1 - ft, op.y1, f0, f1, frameMat, vis);
    wallBox(B, side, op.a0, op.a1, op.y0, op.y0 + ft, f0, f1, frameMat, vis);
    const wdt = op.a1 - op.a0;
    if (op.kind === 'window') {
      if (wdt > 1.05) wallBox(B, side, ca - ft / 2, ca + ft / 2, op.y0, op.y1, f0, f1, frameMat, vis);
      const ty = op.y0 + (op.y1 - op.y0) * 0.7;
      wallBox(B, side, op.a0, op.a1, ty - ft / 2, ty + ft / 2, f0, f1, frameMat, vis);
    } else {
      const n = Math.max(1, Math.round(wdt / 1.6));
      for (let i = 1; i < n; i++) {
        const a = op.a0 + (wdt * i) / n;
        wallBox(B, side, a - ft / 2, a + ft / 2, op.y0, op.y1, f0, f1, frameMat, vis);
      }
    }
    if (exterior) {
      // stone sill & lintel
      const sc0 = outward < 0 ? oc - 0.07 : oc - 0.02;
      const sc1 = outward < 0 ? oc + 0.02 : oc + 0.07;
      wallBox(B, side, op.a0 - 0.06, op.a1 + 0.06, op.y0 - 0.07, op.y0, sc0, sc1, 'kerb', { collide: false });
      if (spec.lintels !== false) {
        const lc0 = outward < 0 ? oc - 0.015 : oc - 0.01;
        const lc1 = outward < 0 ? oc + 0.01 : oc + 0.015;
        wallBox(B, side, op.a0 - 0.08, op.a1 + 0.08, op.y1, op.y1 + 0.16, lc0, lc1, spec.lintelMat || 'kerb', { collide: false });
      }
      // a spot to hold for bots, just inside the window
      if (op.kind === 'window' && spec.interior !== false && op.y0 - floorY < 1.3) {
        const sc = ic - outward * 0.75;
        if (side.axis === 'x') B.spot(ca, floorY, sc, side.n[0], side.n[1], floorY > 1 ? 'upper' : 'window');
        else B.spot(sc, floorY, ca, side.n[0], side.n[1], floorY > 1 ? 'upper' : 'window');
      }
    }
  } else if (op.kind === 'door') {
    const f0 = side.c0 - 0.01;
    const f1 = side.c1 + 0.01;
    const dm = op.frameMat || 'white';
    wallBox(B, side, op.a0, op.a0 + 0.07, op.y0, op.y1, f0, f1, dm, { collide: false, tint: op.frameTint });
    wallBox(B, side, op.a1 - 0.07, op.a1, op.y0, op.y1, f0, f1, dm, { collide: false, tint: op.frameTint });
    wallBox(B, side, op.a0, op.a1, op.y1 - 0.07, op.y1, f0, f1, dm, { collide: false, tint: op.frameTint });
    if (op.leaf !== false) {
      // door swung open against the inside of the wall
      const hinge = op.hinge === 'right';
      const la0 = hinge ? op.a1 - 0.12 : op.a0 + 0.07;
      const la1 = la0 + 0.05;
      const lc0 = outward < 0 ? ic : ic - (op.a1 - op.a0 - 0.12);
      const lc1 = outward < 0 ? ic + (op.a1 - op.a0 - 0.12) : ic;
      wallBox(B, side, la0, la1, op.y0 + 0.01, op.y1 - 0.08, lc0, lc1, 'wood', { kind: 'wood', tint: op.color ?? spec.doorColor ?? 0x2b4a7a });
    }
    if (exterior && floorY > 0.05 && op.step !== false) {
      const s0 = outward < 0 ? oc - 0.4 : oc;
      const s1 = outward < 0 ? oc : oc + 0.4;
      wallBox(B, side, op.a0 - 0.08, op.a1 + 0.08, 0, Math.min(0.1, floorY * 0.6), s0, s1, 'kerb', {});
    }
    if (side.axis === 'x') B.portal(ca, floorY, cc, side.n[0], side.n[1]);
    else B.portal(cc, floorY, ca, side.n[0], side.n[1]);
  } else if (op.kind === 'arch') {
    if (side.axis === 'x') B.portal(ca, floorY, cc, side.n[0], side.n[1]);
    else B.portal(cc, floorY, ca, side.n[0], side.n[1]);
  } else if (op.kind === 'blind') {
    // decorative dark window on a closed building
    const c0 = outward < 0 ? oc - 0.02 : oc;
    const c1 = outward < 0 ? oc : oc + 0.02;
    wallBox(B, side, op.a0, op.a1, op.y0, op.y1, c0, c1, 'dark', { collide: false, tint: 0x6a7a8a });
    wallBox(B, side, op.a0 - 0.05, op.a1 + 0.05, op.y0 - 0.06, op.y0, outward < 0 ? oc - 0.06 : oc, outward < 0 ? oc : oc + 0.06, 'kerb', { collide: false });
  }
}

const OPENING_DEFAULTS = {
  door: { w: 1.1, h: 2.1, sill: 0 },
  window: { w: 1.2, h: 1.25, sill: 0.95 },
  shop: { w: 3, h: 1.85, sill: 0.45 },
  arch: { w: 1.4, h: 2.3, sill: 0 },
  blind: { w: 1.1, h: 1.2, sill: 0.95 },
};

function resolveOpening(o, floorY) {
  const d = OPENING_DEFAULTS[o.kind];
  const w = o.w ?? d.w;
  const h = o.h ?? d.h;
  const sill = o.sill ?? d.sill;
  return { ...o, a0: o.at - w / 2, a1: o.at + w / 2, y0: floorY + sill, y1: floorY + sill + h, w, h };
}

// Main building generator.
export function building(B, s) {
  const T = s.T ?? 0.25;
  const fh = s.fh ?? 2.8;
  const base = s.base ?? 0.15;
  const { w, d } = s;
  const floors = s.floors ?? 2;
  const sides = SIDES(w, d, T);
  const wallMat = (f) => (Array.isArray(s.wall) ? s.wall[Math.min(f, s.wall.length - 1)] : s.wall);
  const innerTint = (f) => (Array.isArray(s.innerTint) ? s.innerTint[Math.min(f, s.innerTint.length - 1)] : s.innerTint);
  const floorMat = (f) => (Array.isArray(s.floorMat) ? s.floorMat[Math.min(f, s.floorMat.length - 1)] : s.floorMat || 'floorboards');
  const floorTint = (f) => (Array.isArray(s.floorTint) ? s.floorTint[Math.min(f, s.floorTint.length - 1)] : s.floorTint);
  const interior = s.interior !== false;
  const top = floors * fh;

  B.footprint(0, 0, w, d, s.radar || 'building', floors);

  for (let f = 0; f < floors; f++) {
    const y0 = f === 0 ? 0 : f * fh;
    const y1 = (f + 1) * fh;
    const floorY = f === 0 ? base : f * fh;
    for (const [name, side] of Object.entries(sides)) {
      const ops = (s.openings || [])
        .filter((o) => o.side === name && (o.floor ?? 0) === f)
        .map((o) => resolveOpening(o, floorY));
      const holes = ops.filter((o) => o.kind !== 'blind');
      const sideMat = s.sideWall && (name === 'left' || name === 'right') ? s.sideWall : wallMat(f);
      wallWithOpenings(B, side, y0, y1, holes, sideMat, interior ? s.inner || 'plaster' : null, {
        innerTint: innerTint(f),
        tint: s.wallTint,
      });
      for (const op of ops) fillOpening(B, side, op, floorY, s, true);
    }
  }

  // Floors, stairs and ceilings.
  let hole = null;
  let stairs = null;
  if (floors > 1 && s.stairs && interior) {
    stairs = stairLayout(s, w, d, T, fh, base);
    hole = stairs.hole;
  }
  if (interior) {
    B.box(T, 0, T, w - T, base, d - T, null, {
      faces: { py: floorMat(0) },
      faceTint: { py: floorTint(0) },
    });
    for (let f = 1; f < floors; f++) {
      const yb = f * fh - 0.22;
      const yt = f * fh;
      for (const r of rectMinus([T, T, w - T, d - T], f === 1 ? hole : null)) {
        B.box(r[0], yb, r[1], r[2], yt, r[3], 'plaster', {
          faces: { py: floorMat(f) },
          faceTint: { py: floorTint(f), ny: innerTint(f - 1) },
          tint: innerTint(f - 1),
        });
      }
    }
  }
  B.box(-0.02, top, -0.02, w + 0.02, top + 0.14, d + 0.02, wallMat(floors - 1), {
    faces: { ny: interior ? 'plaster' : wallMat(floors - 1), py: 'dark' },
    faceTint: { ny: innerTint(floors - 1) },
    tint: s.wallTint,
  });

  if (stairs) buildStairs(B, stairs, s, fh, base);

  if (interior) {
    for (const p of s.partitions || []) partition(B, p, s, floors, fh, base, T, innerTint);
  }

  // Ground-floor band between storeys for a bit of facade detail.
  if (floors > 1 && s.band !== false) {
    B.box(-0.03, fh - 0.08, -0.03, w + 0.03, fh + 0.06, 0, s.bandMat || 'kerb', { collide: false, tint: s.bandTint });
  }

  roof(B, s, w, d, top + 0.14);

  if (s.sign) shopSign(B, s, fh);
  if (s.furnish && interior) s.furnish(B, { w, d, T, fh, base, stairs });
}

function rectMinus(r, h) {
  if (!h) return [r];
  const [x0, z0, x1, z1] = r;
  const [hx0, hz0, hx1, hz1] = h;
  const out = [];
  if (hz0 > z0) out.push([x0, z0, x1, hz0]);
  if (hz1 < z1) out.push([x0, hz1, x1, z1]);
  if (hx0 > x0) out.push([x0, hz0, hx0, hz1]);
  if (hx1 < x1) out.push([hx1, hz0, x1, hz1]);
  return out.filter((q) => q[2] - q[0] > 1e-3 && q[3] - q[1] > 1e-3);
}

function stairLayout(s, w, d, T, fh, base) {
  const st = s.stairs;
  const left = st.side !== 'right';
  const sx0 = left ? T : w - T - STAIR_W;
  const sx1 = sx0 + STAIR_W;
  const L = STAIR_STEPS * STAIR_RUN;
  const toFront = st.dir !== 'back';
  let zb;
  let zt;
  if (toFront) {
    zt = st.top ?? T + 1.15;
    zb = zt + L;
  } else {
    zb = st.bottom ?? d - T - 1.15 - L;
    zt = zb + L;
  }
  const hx0 = left ? T : sx0 - HOLE_EXTRA;
  const hx1 = left ? sx1 + HOLE_EXTRA : w - T;
  const hz0 = Math.min(zb, zt);
  const hz1 = Math.max(zb, zt);
  return { left, sx0, sx1, zb, zt, toFront, hole: [hx0, hz0, hx1, hz1], rise: (fh - base) / STAIR_STEPS };
}

function buildStairs(B, st, s, fh, base) {
  const dir = st.toFront ? -1 : 1; // direction of travel going up, along z
  const tint = s.stairTint ?? 0xb08a62;
  for (let i = 0; i < STAIR_STEPS; i++) {
    const za = st.zb + dir * i * STAIR_RUN;
    const zc = st.zb + dir * (i + 1) * STAIR_RUN;
    const topY = base + (i + 1) * st.rise;
    B.box(st.sx0, 0, Math.min(za, zc), st.sx1, topY, Math.max(za, zc), 'wood', {
      faces: { py: 'floorboards' },
      tint,
    });
  }
  const cx = (st.sx0 + st.sx1) / 2;
  // banister around the stairwell on the upper floor
  const [hx0, hz0, hx1, hz1] = st.hole;
  const rail = { kind: 'wood', tint: 0x5a3a22 };
  const openX = st.left ? hx1 : hx0;
  B.box(openX - 0.03, fh, hz0, openX + 0.03, fh + 0.95, hz1, 'wood', rail);
  const endZ = st.toFront ? hz1 : hz0;
  B.box(hx0, fh, endZ - 0.03, hx1, fh + 0.95, endZ + 0.03, 'wood', rail);
  // nav chain from the bottom approach to the top landing
  const pts = [];
  pts.push([cx, base, st.zb - dir * 0.75]);
  for (let k = 0; k <= STAIR_STEPS; k += 2) {
    const z = st.zb + dir * (k * STAIR_RUN + STAIR_RUN * 0.5);
    const y = base + Math.min(STAIR_STEPS, k + 1) * st.rise;
    pts.push([cx, y, z]);
  }
  pts.push([cx, fh, st.zt + dir * 0.6]);
  // step off the landing into the room beside the stairwell
  const offX = st.left ? st.sx1 + HOLE_EXTRA + 0.75 : st.sx0 - HOLE_EXTRA - 0.75;
  pts.push([(cx + offX) / 2, fh, st.zt + dir * 0.6]);
  pts.push([offX, fh, st.zt + dir * 0.6]);
  B.navChain(pts);
}

function partition(B, p, s, floors, fh, base, T, innerTint) {
  const f = p.floor ?? 0;
  const floorY = f === 0 ? base : f * fh;
  const y0 = floorY;
  const y1 = f === floors - 1 ? floors * fh : (f + 1) * fh - 0.22;
  const th = 0.12;
  const dw = p.doorW ?? 1.05;
  let side;
  if (p.axis === 'z') {
    side = { axis: 'z', a0: p.from, a1: p.to, c0: p.at - th / 2, c1: p.at + th / 2, outer: 'nx', inner: 'px', n: [1, 0], out: -1 };
  } else {
    side = { axis: 'x', a0: p.from, a1: p.to, c0: p.at - th / 2, c1: p.at + th / 2, outer: 'nz', inner: 'pz', n: [0, 1], out: -1 };
  }
  const ops = p.door !== undefined && p.door !== null ? [{ a0: p.door - dw / 2, a1: p.door + dw / 2, y0: floorY, y1: floorY + 2.1, kind: 'door', leaf: false }] : [];
  wallWithOpenings(B, side, y0, y1, ops, 'plaster', 'plaster', { innerTint: innerTint(f), tint: innerTint(f), outerInner: 'plaster' });
  for (const op of ops) {
    const cc = p.at;
    const ca = (op.a0 + op.a1) / 2;
    if (side.axis === 'x') B.portal(ca, floorY, cc, 0, 1);
    else B.portal(cc, floorY, ca, 1, 0);
    wallBox(B, side, op.a0, op.a0 + 0.06, op.y0, op.y1, side.c0 - 0.01, side.c1 + 0.01, 'white', { collide: false });
    wallBox(B, side, op.a1 - 0.06, op.a1, op.y0, op.y1, side.c0 - 0.01, side.c1 + 0.01, 'white', { collide: false });
    wallBox(B, side, op.a0, op.a1, op.y1 - 0.06, op.y1, side.c0 - 0.01, side.c1 + 0.01, 'white', { collide: false });
  }
}

// Gable roof (ridge along x by default). For ridge 'z' the roof is built in a
// rotated sub-frame with the dimensions swapped.
function roof(B, s, w, d, Y) {
  const r = s.roof || {};
  if (r.type === 'none') return;
  if (r.type === 'flat') {
    B.box(-0.05, Y, -0.05, w + 0.05, Y + 0.25, d + 0.05, 'dark', { tint: 0x555555, faces: { py: 'dark' } });
    // coping along the edges
    B.box(-0.08, Y + 0.25, -0.08, w + 0.08, Y + 0.4, 0.12, 'kerb', { collide: false });
    B.box(-0.08, Y + 0.25, d - 0.12, w + 0.08, Y + 0.4, d + 0.08, 'kerb', { collide: false });
    return;
  }
  if (r.ridge === 'z') {
    B.withFrame(B.frame.sub(w, 0, 1), () => gable(B, s, r, d, w, Y, true));
  } else {
    gable(B, s, r, w, d, Y, false);
  }
}

function gable(B, s, r, w, d, Y, rotated) {
  const pitch = ((r.pitch ?? 38) * Math.PI) / 180;
  const o = r.overhang ?? 0.3;
  const og = r.gableOverhang ?? 0.15;
  const half = d / 2;
  const rh = Math.tan(pitch) * half;
  const yEave = Y - Math.tan(pitch) * o;
  const mat = r.mat || 'slate';
  const tint = r.tint;
  const wallMat = Array.isArray(s.wall) ? s.wall[s.wall.length - 1] : s.wall;
  const gableMat = r.gableMat || (rotated ? s.gableMat || wallMat : s.sideWall || s.gableMat || wallMat);
  const L = w + og * 2;
  const slopeLen = Math.hypot(half + o, rh + Y - yEave);
  const uv = (u0, u1, v0, v1) => {
    const t = B.mats[mat].tile;
    return [
      [u0 / t[0], v0 / t[1]],
      [u1 / t[0], v0 / t[1]],
      [u1 / t[0], v1 / t[1]],
      [u0 / t[0], v1 / t[1]],
    ];
  };
  // front slope
  B.quad(
    [
      [w + og, yEave, -o],
      [-og, yEave, -o],
      [-og, Y + rh, half],
      [w + og, Y + rh, half],
    ],
    mat,
    { uv: uv(0, L, 0, slopeLen), tint },
  );
  // back slope
  B.quad(
    [
      [-og, yEave, d + o],
      [w + og, yEave, d + o],
      [w + og, Y + rh, half],
      [-og, Y + rh, half],
    ],
    mat,
    { uv: uv(0, L, 0, slopeLen), tint },
  );
  // gable ends
  B.tri([[0, Y, 0], [0, Y, d], [0, Y + rh, half]], gableMat, { tint: s.wallTint });
  B.tri([[w, Y, d], [w, Y, 0], [w, Y + rh, half]], gableMat, { tint: s.wallTint });
  // undersides of the gable overhang so it does not look paper thin
  B.tri([[-og, Y, 0], [-og, Y + rh, half], [-og, Y, d]], gableMat, { tint: s.wallTint });
  B.tri([[w + og, Y, d], [w + og, Y + rh, half], [w + og, Y, 0]], gableMat, { tint: s.wallTint });
  // fascia boards and ridge
  const fasc = { collide: false, tint: r.fasciaTint ?? 0xf2f2ee };
  B.box(-og, yEave - 0.16, -o - 0.03, w + og, yEave + 0.02, -o + 0.02, 'white', fasc);
  B.box(-og, yEave - 0.16, d + o - 0.02, w + og, yEave + 0.02, d + o + 0.03, 'white', fasc);
  B.box(-og - 0.02, Y + rh - 0.06, half - 0.13, w + og + 0.02, Y + rh + 0.1, half + 0.13, r.ridgeMat || 'dark', {
    collide: false,
    tint: r.ridgeTint ?? 0x8a8a8a,
  });
  // invisible stepped colliders approximating the roof volume
  const steps = 3;
  for (let k = 0; k < steps; k++) {
    const inset = (half * k) / steps;
    B.box(0, Y + (rh * k) / steps, inset, w, Y + (rh * (k + 1)) / steps, d - inset, null, { render: false });
  }
  for (const cx of r.chimneys || []) chimney(B, cx, half, Y + rh, s);
}

function chimney(B, cx, cz, ridgeY, s) {
  const mat = s.chimneyMat || 'brick';
  B.box(cx - 0.35, ridgeY - 1.2, cz - 0.45, cx + 0.35, ridgeY + 0.95, cz + 0.45, mat, { tint: s.chimneyTint });
  B.box(cx - 0.42, ridgeY + 0.95, cz - 0.52, cx + 0.42, ridgeY + 1.05, cz + 0.52, 'kerb', { collide: false });
  B.cylinder(cx, ridgeY + 1.05, cz - 0.2, 0.11, 0.42, 'paint', { tint: 0xb35a3a, segments: 8, rTop: 0.09 });
  B.cylinder(cx, ridgeY + 1.05, cz + 0.2, 0.11, 0.36, 'paint', { tint: 0xa55236, segments: 8, rTop: 0.09 });
}

function shopSign(B, s, fh) {
  const sg = s.sign;
  const x0 = sg.x0 ?? 0.2;
  const x1 = sg.x1 ?? s.w - 0.2;
  const y0 = sg.y0 ?? fh - 0.42;
  const y1 = sg.y1 ?? fh + 0.32;
  B.box(x0, y0, -0.12, x1, y1, 0, 'paint', { tint: sg.board ?? 0x1f3b2c });
  const tex = signTexture(sg.text, { bg: sg.bg ?? '#1f3b2c', fg: sg.fg ?? '#f1e6c8', border: sg.border ?? '#c9a94b', font: sg.font, sub: sg.sub });
  const mat = new THREE.MeshLambertMaterial({ map: tex });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.06, y1 - y0 - 0.06), mat);
  plane.receiveShadow = true;
  B.mesh(plane, (x0 + x1) / 2, (y0 + y1) / 2, -0.125, Math.PI);
}

export function hangingSign(B, x, y, z, name) {
  // bracket out from the wall (wall face at local z = 0)
  B.box(x - 0.03, y + 0.55, -1.0, x + 0.03, y + 0.62, 0, 'dark', { collide: false });
  B.box(x - 0.02, y - 0.6, -0.95, x + 0.02, y + 0.55, -0.15, 'paint', { collide: false, tint: 0x2a1a10 });
  const tex = pubSignTexture(name);
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1.1), mat);
  B.mesh(plane, x + 0.025, y - 0.03, -0.55, Math.PI / 2);
  const plane2 = plane.clone();
  B.mesh(plane2, x - 0.025, y - 0.03, -0.55, -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Furniture helpers (all collide so they work as cover).
// ---------------------------------------------------------------------------

export function furn(B, x0, y0, z0, x1, y1, z1, mat, tint, kind = 'wood') {
  return B.box(x0, y0, z0, x1, y1, z1, mat, { tint, kind });
}

export function sofa(B, x0, z0, x1, z1, y, tint, backSide) {
  furn(B, x0, y, z0, x1, y + 0.45, z1, 'carpet', tint);
  const t = 0.22;
  if (backSide === 'pz') furn(B, x0, y + 0.45, z1 - t, x1, y + 0.9, z1, 'carpet', tint);
  if (backSide === 'nz') furn(B, x0, y + 0.45, z0, x1, y + 0.9, z0 + t, 'carpet', tint);
  if (backSide === 'px') furn(B, x1 - t, y + 0.45, z0, x1, y + 0.9, z1, 'carpet', tint);
  if (backSide === 'nx') furn(B, x0, y + 0.45, z0, x0 + t, y + 0.9, z1, 'carpet', tint);
}

export function table(B, x0, z0, x1, z1, y, h = 0.76, tint = 0x8a5a36) {
  B.box(x0, y + h - 0.05, z0, x1, y + h, z1, 'wood', { tint, kind: 'wood', collide: false });
  const l = 0.06;
  for (const [lx, lz] of [[x0, z0], [x1 - l, z0], [x0, z1 - l], [x1 - l, z1 - l]]) {
    B.box(lx, y, lz, lx + l, y + h - 0.05, lz + l, 'wood', { tint, collide: false });
  }
  // single low collider so bullets/players interact with the table top
  B.box(x0, y + h - 0.05, z0, x1, y + h, z1, null, { render: false, kind: 'wood' });
}

export function bed(B, x0, z0, x1, z1, y, tint, headSide = 'nz') {
  furn(B, x0, y, z0, x1, y + 0.32, z1, 'wood', 0x6a4a30);
  furn(B, x0 + 0.03, y + 0.32, z0 + 0.03, x1 - 0.03, y + 0.55, z1 - 0.03, 'carpet', tint);
  if (headSide === 'nz') furn(B, x0, y, z0, x1, y + 1.0, z0 + 0.08, 'wood', 0x6a4a30);
  else if (headSide === 'pz') furn(B, x0, y, z1 - 0.08, x1, y + 1.0, z1, 'wood', 0x6a4a30);
  else if (headSide === 'nx') furn(B, x0, y, z0, x0 + 0.08, y + 1.0, z1, 'wood', 0x6a4a30);
  else furn(B, x1 - 0.08, y, z0, x1, y + 1.0, z1, 'wood', 0x6a4a30);
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const DOOR_COLOURS = [0x1f3f73, 0x8c1c1c, 0x1d5a3a, 0x222222, 0x6b2a5e, 0x2e6e8e, 0xd7b043];
const FABRIC = [0x5b6e8c, 0x8c4a3a, 0x5a7a4a, 0x7a6a8a, 0x9a8a6a, 0x4a4a5a];
const WALLPAPER = [0xf0e6d2, 0xe6eef0, 0xf2e2e2, 0xe8f0e0, 0xf4ecd8, 0xe4e0f0];

export function pickFrom(arr, seed) {
  return arr[Math.abs(Math.floor(seed)) % arr.length];
}

// Two-storey terraced / semi-detached house (w ~ 6, d = 8).
export function terraceHouse(B, opt = {}) {
  const w = opt.w ?? 6;
  const d = opt.d ?? 8;
  const m = !!opt.mirror;
  const X = (x) => (m ? w - x : x);
  const seed = opt.seed ?? 0;
  const fabric = pickFrom(FABRIC, seed);
  const paper = [pickFrom(WALLPAPER, seed + 1), pickFrom(WALLPAPER, seed + 3)];
  const doorColor = opt.doorColor ?? pickFrom(DOOR_COLOURS, seed);
  const openings = [
    { side: 'front', kind: 'door', at: X(1.85), color: doorColor, hinge: m ? 'right' : 'left' },
    { side: 'front', kind: 'window', at: X(4.25), w: 1.6 },
    { side: 'front', kind: 'window', at: X(1.9), w: 1.0, floor: 1 },
    { side: 'front', kind: 'window', at: X(4.25), w: 1.4, floor: 1 },
    { side: 'back', kind: 'door', at: X(4.55), w: 1.0, color: 0xf0f0ea, hinge: m ? 'left' : 'right' },
    { side: 'back', kind: 'window', at: X(2.3), w: 1.2 },
    { side: 'back', kind: 'window', at: X(2.6), w: 1.1, floor: 1 },
    { side: 'back', kind: 'window', at: X(4.6), w: 0.9, floor: 1 },
  ];
  if (opt.sideWindows) {
    const side = m ? 'left' : 'right';
    openings.push({ side, kind: 'window', at: 2.3, w: 0.9, floor: 1 });
    openings.push({ side, kind: 'window', at: 6.2, w: 0.9 });
  }
  const xs = (a, b) => (m ? [w - b, w - a] : [a, b]);
  const [p0a, p0b] = xs(1.2, w - 0.25);
  const [p1a, p1b] = xs(1.66, w - 0.25);
  building(B, {
    w,
    d,
    floors: 2,
    wall: opt.wall ?? 'brick',
    wallTint: opt.wallTint,
    sideWall: opt.sideWall,
    innerTint: paper,
    floorMat: ['floorboards', 'carpet'],
    floorTint: [0xffffff, pickFrom([0xa08070, 0x7080a0, 0x80a080, 0xc0b0a0], seed + 2)],
    openings,
    stairs: { side: m ? 'right' : 'left', dir: 'front' },
    partitions: [
      { floor: 0, axis: 'x', at: 4.0, from: p0a, to: p0b, door: X(3.55) },
      { floor: 1, axis: 'x', at: 4.0, from: p1a, to: p1b, door: X(4.55) },
    ],
    roof: { mat: opt.roofMat ?? 'slate', pitch: 36, chimneys: opt.chimney === false ? [] : [X(0.55)] },
    band: opt.band,
    furnish: (B2, ctx) => {
      const by = ctx.base;
      const bx = (a, b) => xs(a, b);
      // front room
      const [sa, sb] = bx(4.95, 5.72);
      sofa(B2, sa, 1.3, sb, 3.2, by, fabric, m ? 'nx' : 'px');
      const [ta, tb] = bx(3.0, 3.9);
      table(B2, ta, 1.9, tb, 2.6, by, 0.42, 0x6a4a30);
      const [ua, ub] = bx(1.75, 2.35);
      furn(B2, ua, by, 3.35, ub + 0.5, by + 0.55, 3.92, 'wood', 0x3a2a20); // tv unit
      // kitchen
      const [ka, kb] = bx(5.12, 5.72);
      furn(B2, ka, by, 5.3, kb, by + 0.92, 7.72, 'wood', 0xe8e4dc);
      const [fa, fb] = bx(5.05, 5.72);
      furn(B2, fa, by, 4.12, fb, by + 1.75, 4.75, 'paint', 0xdedede, 'metal');
      const [ka2, kb2] = bx(2.2, 3.3);
      table(B2, ka2, 5.6, kb2, 6.5, by, 0.76, 0x9a7a52);
      // upstairs front bedroom
      const fy = ctx.fh;
      const [ba, bb] = bx(3.6, 5.6);
      bed(B2, ba, 1.0, bb, 3.0, fy, fabric, 'nz');
      const [wa, wb] = bx(1.75, 2.45);
      furn(B2, wa, fy, 3.2, wb, fy + 1.9, 3.92, 'wood', 0x7a5a3a);
      // upstairs back bedroom
      const [sa2, sb2] = bx(2.0, 3.0);
      bed(B2, sa2, 5.6, sb2, 7.6, fy, paper[1] - 0x202020, 'pz');
      const [da, db] = bx(5.1, 5.72);
      furn(B2, da, fy, 6.0, db, fy + 0.76, 7.4, 'wood', 0x9a7a52);
    },
  });
}

// Shop with a flat above (w ~ 8, d = 10).
export function shop(B, opt = {}) {
  const w = opt.w ?? 8;
  const d = opt.d ?? 10;
  const m = !!opt.mirror;
  const X = (x) => (m ? w - x : x);
  const xs = (a, b) => (m ? [w - b, w - a] : [a, b]);
  const seed = opt.seed ?? 0;
  const frame = opt.frameTint ?? 0x1f3b2c;
  const shopW = w - 2.55;
  const openings = [
    { side: 'front', kind: 'door', at: X(1.35), w: 1.1, color: frame, frameMat: 'paint', frameTint: frame },
    { side: 'front', kind: 'shop', at: X(2.2 + shopW / 2), w: shopW, frameMat: 'paint', frameTint: frame },
    { side: 'front', kind: 'window', at: X(2.0), w: 1.3, floor: 1 },
    { side: 'front', kind: 'window', at: X(w - 2.1), w: 1.3, floor: 1 },
    { side: 'back', kind: 'door', at: X(1.8), w: 1.05, color: 0x666666 },
    { side: 'back', kind: 'window', at: X(w * 0.54), w: 1.2 },
    { side: 'back', kind: 'window', at: X(2.0), w: 1.1, floor: 1 },
    { side: 'back', kind: 'window', at: X(w * 0.58), w: 1.1, floor: 1 },
  ];
  if (opt.sideWindow) openings.push({ side: m ? 'left' : 'right', kind: 'window', at: 2.5, w: 1.1, floor: 1 });
  const [pa, pb] = xs(0.25, w - 0.25);
  building(B, {
    w,
    d,
    floors: 2,
    wall: opt.wall ?? 'brick',
    wallTint: opt.wallTint,
    innerTint: [opt.inside ?? 0xf4f0e6, pickFrom(WALLPAPER, seed)],
    floorMat: [opt.floor ?? 'lino', 'carpet'],
    floorTint: [0xffffff, pickFrom([0xa08070, 0x7080a0, 0x80a080], seed)],
    openings,
    stairs: { side: m ? 'left' : 'right', dir: 'back', bottom: d - 0.25 - 1.15 - STAIR_STEPS * STAIR_RUN },
    partitions: [{ floor: 1, axis: 'x', at: 4.6, from: pa, to: pb, door: X(3.2) }],
    roof: { mat: opt.roofMat ?? 'slate', pitch: 34, chimneys: [X(w - 0.6)] },
    sign: { text: opt.name ?? 'SHOP', sub: opt.sub, bg: opt.signBg, fg: opt.signFg, board: frame, border: opt.border },
    band: false,
    furnish: (B2, ctx) => {
      const by = ctx.base;
      const fy = ctx.fh;
      // counter
      const [ca, cb] = xs(0.25, 0.85);
      furn(B2, ca, by, 3.2, cb, by + 1.0, 6.4, 'wood', opt.counter ?? 0x7a4a2a);
      // shelving aisles
      const shelf = opt.shelf ?? 0xe0e0e0;
      const [sa, sb] = xs(2.9, w - 2.8);
      furn(B2, sa, by, 2.4, sb, by + 1.65, 2.85, 'paint', shelf, 'metal');
      furn(B2, sa, by, 4.4, sb, by + 1.65, 4.85, 'paint', shelf, 'metal');
      if (opt.fridges !== false) {
        const [fa, fb] = xs(2.6, w - 3.6);
        furn(B2, fa, by, d - 0.85, fb, by + 1.9, d - 0.25, 'paint', 0xdde4ea, 'metal');
      }
      // flat above
      const [sofaA, sofaB] = xs(0.3, 2.4);
      sofa(B2, sofaA, 0.3, sofaB, 1.15, fy, pickFrom(FABRIC, seed + 1), 'nz');
      const [ta, tb] = xs(w * 0.42, w * 0.42 + 1.2);
      table(B2, ta, 2.2, tb, 3.2, fy);
      const [ba, bb] = xs(0.3, 2.2);
      bed(B2, ba, 6.8, bb, 9.0, fy, pickFrom(FABRIC, seed + 2), m ? 'px' : 'nx');
      if (opt.extra) opt.extra(B2, ctx, xs, X);
    },
  });
}

// The pub: wide two-storey with mock-Tudor upper floor (w = 14, d = 11).
export function pub(B, opt = {}) {
  const w = 14;
  const d = 11;
  const name = opt.name ?? 'The Red Lion';
  building(B, {
    w,
    d,
    floors: 2,
    wall: ['brickDark', 'render'],
    innerTint: [0xe8d8b8, 0xf0e8d8],
    floorMat: ['floorboards', 'carpet'],
    floorTint: [0xb08860, 0x8a2a2a],
    frameTint: 0x2a2a2a,
    openings: [
      { side: 'front', kind: 'door', at: 3.2, w: 1.25, color: 0x5a1a14 },
      { side: 'front', kind: 'door', at: 10.8, w: 1.25, color: 0x5a1a14 },
      { side: 'front', kind: 'window', at: 1.3, w: 1.3 },
      { side: 'front', kind: 'window', at: 5.6, w: 1.8 },
      { side: 'front', kind: 'window', at: 8.4, w: 1.8 },
      { side: 'front', kind: 'window', at: 12.7, w: 1.3 },
      { side: 'front', kind: 'window', at: 2.0, w: 1.3, floor: 1 },
      { side: 'front', kind: 'window', at: 5.4, w: 1.3, floor: 1 },
      { side: 'front', kind: 'window', at: 8.6, w: 1.3, floor: 1 },
      { side: 'front', kind: 'window', at: 12.0, w: 1.3, floor: 1 },
      { side: 'back', kind: 'door', at: 11.8, w: 1.2, color: 0x5a1a14 },
      { side: 'back', kind: 'door', at: 2.8, w: 1.2, color: 0x5a1a14 },
      { side: 'back', kind: 'window', at: 4.4, w: 1.2 },
      { side: 'back', kind: 'window', at: 9.6, w: 1.2 },
      { side: 'back', kind: 'window', at: 4.0, w: 1.2, floor: 1 },
      { side: 'back', kind: 'window', at: 7.5, w: 1.2, floor: 1 },
      { side: 'back', kind: 'window', at: 11.5, w: 1.2, floor: 1 },
      { side: opt.sideOpen ?? 'right', kind: 'window', at: 3.0, w: 1.2, floor: 1 },
      { side: opt.sideOpen ?? 'right', kind: 'door', at: 8.0, w: 1.15, color: 0x5a1a14 },
    ],
    stairs: { side: 'left', dir: 'back', bottom: 5.4 },
    partitions: [],
    roof: { mat: 'tiles', pitch: 40, chimneys: [1.0, 13.0] },
    bandMat: 'dark',
    bandTint: 0x2a2018,
    sign: { text: name.toUpperCase(), bg: '#1b1b1b', fg: '#e9d9a6', board: 0x1b1b1b, border: '#9a7a3a', x0: 2.2, x1: 11.8, font: 'bold 96px Georgia, serif' },
    furnish: (B2, ctx) => {
      const by = ctx.base;
      const fy = ctx.fh;
      // bar counter
      furn(B2, 4.2, by, 7.0, 10.2, by + 1.08, 7.6, 'wood', 0x5a3420);
      furn(B2, 9.6, by, 7.6, 10.2, by + 1.08, 9.2, 'wood', 0x5a3420);
      furn(B2, 5.0, by, 10.15, 8.6, by + 1.9, 10.75, 'wood', 0x3a2414); // back shelves
      // tables
      for (const [tx, tz] of [[2.6, 2.0], [6.0, 2.4], [8.6, 2.4], [12.0, 2.0], [12.0, 4.8], [6.8, 4.8], [2.6, 4.8]]) {
        table(B2, tx - 0.45, tz - 0.45, tx + 0.45, tz + 0.45, by, 0.76, 0x4a2c18);
      }
      // fireplace on the left wall
      furn(B2, 0.25, 0, 2.4, 0.9, 2.6, 4.0, 'brickDark', null, 'solid');
      // upstairs function room: pool table + seating
      furn(B2, 5.6, fy, 3.6, 8.4, fy + 0.85, 5.2, 'paint', 0x1f6a3a);
      sofa(B2, 10.2, 0.3, 13.6, 1.1, fy, 0x6a2a2a, 'nz');
      table(B2, 2.4, 2.0, 3.4, 3.0, fy);
      table(B2, 11.0, 7.4, 12.0, 8.4, fy);
      furn(B2, 9.0, fy, 10.2, 12.6, fy + 1.1, 10.75, 'wood', 0x3a2414);
    },
  });
  // mock tudor beams on the upper floor
  const fh = 2.8;
  const beam = { collide: false, tint: 0x2a2018 };
  for (const x of [0.05, 3.5, 7.0, 10.5, 13.95]) {
    B.box(x - 0.08, fh, -0.04, x + 0.08, 2 * fh, 0, 'dark', beam);
    B.box(x - 0.08, fh, d, x + 0.08, 2 * fh, d + 0.04, 'dark', beam);
  }
  B.box(0, 2 * fh - 0.15, -0.04, w, 2 * fh, 0, 'dark', beam);
  hangingSign(B, 0.8, 3.15, 0, name);
}

// Single-storey bungalow (w = 9, d = 8).
export function bungalow(B, opt = {}) {
  const w = 9;
  const d = 8;
  const m = !!opt.mirror;
  const X = (x) => (m ? w - x : x);
  const xs = (a, b) => (m ? [w - b, w - a] : [a, b]);
  const seed = opt.seed ?? 0;
  const [pa, pb] = xs(0.25, w - 0.25);
  building(B, {
    w,
    d,
    floors: 1,
    base: 0.15,
    wall: opt.wall ?? 'pebbledash',
    wallTint: opt.wallTint,
    innerTint: [pickFrom(WALLPAPER, seed)],
    floorMat: ['carpet'],
    floorTint: [pickFrom([0x9a8a7a, 0x7a8a9a, 0x8a9a7a], seed)],
    openings: [
      { side: 'front', kind: 'door', at: X(4.6), color: opt.doorColor ?? pickFrom(DOOR_COLOURS, seed + 2) },
      { side: 'front', kind: 'window', at: X(2.0), w: 1.8 },
      { side: 'front', kind: 'window', at: X(7.2), w: 1.8 },
      { side: 'back', kind: 'door', at: X(2.2), w: 1.0, color: 0xf0f0ea },
      { side: 'back', kind: 'window', at: X(3.8), w: 1.0 },
      { side: 'back', kind: 'window', at: X(7.0), w: 1.4 },
      { side: m ? 'right' : 'left', kind: 'window', at: 2.2, w: 1.0 },
      { side: m ? 'left' : 'right', kind: 'window', at: 6.0, w: 1.0 },
    ],
    partitions: [
      { floor: 0, axis: 'x', at: 4.2, from: pa, to: pb, door: X(4.0) },
      { floor: 0, axis: 'z', at: X(5.2), from: 4.26, to: d - 0.25, door: 5.6 },
    ],
    roof: { mat: opt.roofMat ?? 'tiles', pitch: 32, chimneys: [X(6.0)], tint: opt.roofTint },
    furnish: (B2, ctx) => {
      const by = ctx.base;
      const [sa, sb] = xs(0.3, 2.6);
      sofa(B2, sa, 3.3, sb, 4.12, by, pickFrom(FABRIC, seed), 'pz');
      const [aa, ab] = xs(6.6, 7.6);
      sofa(B2, aa, 2.8, ab, 3.8, by, pickFrom(FABRIC, seed + 3), 'pz');
      const [ta, tb] = xs(3.0, 3.9);
      table(B2, ta, 1.6, tb, 2.3, by, 0.42, 0x6a4a30);
      // kitchen units (back left room)
      const [ka, kb] = xs(0.28, 0.9);
      furn(B2, ka, by, 4.4, kb, by + 0.92, 7.72, 'wood', 0xe8e4dc);
      // bedroom (back right room)
      const [ba, bb] = xs(6.2, 8.7);
      bed(B2, ba, 5.0, bb, 7.0, by, pickFrom(FABRIC, seed + 1), m ? 'nx' : 'px');
    },
  });
}

// Small single-storey building with a big open interior (village hall / pavilion).
export function hall(B, opt = {}) {
  const w = opt.w ?? 14;
  const d = opt.d ?? 9;
  building(B, {
    w,
    d,
    floors: 1,
    fh: opt.fh ?? 3.4,
    wall: opt.wall ?? 'brickBuff',
    wallTint: opt.wallTint,
    innerTint: [opt.inside ?? 0xeae2cc],
    floorMat: ['floorboards'],
    floorTint: [0xc09a6a],
    openings: opt.openings,
    roof: opt.roof ?? { mat: 'slate', pitch: 30 },
    lintels: opt.lintels,
    radar: opt.radar,
    sign: opt.sign,
    furnish: opt.furnish,
    frameTint: opt.frameTint,
  });
}

// St Mary's church: tall stone nave plus a square tower.
export function church(B, w = 16) {
  const d = 8.5;
  const fh = 6;
  building(B, {
    w,
    d,
    floors: 1,
    fh,
    T: 0.45,
    wall: 'stone',
    innerTint: [0xe8e2d4],
    floorMat: ['paving'],
    lintelMat: 'stone',
    frameMat: 'dark',
    frameTint: 0x3a3a3a,
    radar: 'church',
    openings: [
      { side: 'front', kind: 'door', at: 7.0, w: 1.5, h: 2.6, color: 0x4a2a14, frameMat: 'stone' },
      { side: 'back', kind: 'door', at: 10.5, w: 1.5, h: 2.6, color: 0x4a2a14, frameMat: 'stone' },
      { side: 'front', kind: 'window', at: 3.0, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'front', kind: 'window', at: 10.5, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'front', kind: 'window', at: w - 2.2, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'back', kind: 'window', at: 3.0, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'back', kind: 'window', at: 7.0, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'back', kind: 'window', at: w - 2.2, w: 1.1, h: 2.8, sill: 2.0 },
      { side: 'right', kind: 'window', at: d / 2, w: 2.2, h: 3.2, sill: 1.8 },
    ],
    roof: { mat: 'slate', pitch: 48, overhang: 0.35, gableOverhang: 0.2 },
    band: false,
    furnish: (B2, ctx) => {
      const by = ctx.base;
      // pews either side of the aisle
      const rows = Math.floor((w - 6.4) / 1.75);
      for (let i = 0; i < rows; i++) {
        const x = 3.0 + i * 1.75;
        for (const [z0, z1] of [[1.6, 3.3], [5.2, 6.9]]) {
          furn(B2, x, by, z0, x + 0.45, by + 0.48, z1, 'wood', 0x5a3a22);
          furn(B2, x + 0.38, by, z0, x + 0.5, by + 0.95, z1, 'wood', 0x5a3a22);
        }
      }
      // altar on a raised step
      furn(B2, w - 2.8, by, 1.0, w - 0.45, by + 0.3, d - 1.0, 'stone', null, 'stone');
      furn(B2, w - 1.6, by + 0.3, 3.0, w - 0.8, by + 1.3, 5.5, 'stone', 0xf0ece0, 'stone');
    },
  });
  // tower at the west (local left) end
  B.withFrame(B.frame.sub(-5, 1.75), () => {
    const tw = 5;
    const td = 5;
    const th = 13;
    building(B, {
      w: tw,
      d: td,
      floors: 1,
      fh: th,
      T: 0.5,
      wall: 'stone',
      interior: false,
      radar: 'church',
      openings: [
        { side: 'front', kind: 'blind', at: 2.5, w: 0.8, h: 1.6, sill: 8.5 },
        { side: 'back', kind: 'blind', at: 2.5, w: 0.8, h: 1.6, sill: 8.5 },
        { side: 'left', kind: 'blind', at: 2.5, w: 0.8, h: 1.6, sill: 8.5 },
        { side: 'left', kind: 'blind', at: 2.5, w: 1.0, h: 2.2, sill: 2.0 },
      ],
      roof: { type: 'none' },
      band: false,
    });
    // battlements
    for (let i = 0; i < 5; i++) {
      const a = 0.25 + i * 1.1;
      B.box(a, 13.14, -0.05, a + 0.6, 13.85, 0.4, 'stone', { collide: false });
      B.box(a, 13.14, td - 0.4, a + 0.6, 13.85, td + 0.05, 'stone', { collide: false });
      B.box(-0.05, 13.14, a, 0.4, 13.85, a + 0.6, 'stone', { collide: false });
      B.box(tw - 0.4, 13.14, a, tw + 0.05, 13.85, a + 0.6, 'stone', { collide: false });
    }
    // clock face
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#1a2a3a';
    g.beginPath();
    g.arc(64, 64, 62, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d8b84a';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#d8b84a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.fillRect(64 + Math.cos(a) * 50 - 3, 64 + Math.sin(a) * 50 - 3, 6, 6);
    }
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(64, 64);
    g.lineTo(64, 24);
    g.moveTo(64, 64);
    g.lineTo(92, 70);
    g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshLambertMaterial({ map: tex }));
    B.mesh(clock, 2.5, 10.6, -0.02, Math.PI);
  });
}
