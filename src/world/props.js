// Street furniture and garden props. Positions are in the builder's current
// frame; most props take a quarter-turn rotation r.

import * as THREE from 'three';

function place(B, x, z, r, fn) {
  B.withFrame(B.frame.sub(x, z, r), fn);
}

// ---------------------------------------------------------------- greenery

export function tree(B, x, z, s = 1, opt = {}) {
  const kind = opt.kind || 'oak';
  const trunkH = (kind === 'conifer' ? 1.6 : 2.6) * s;
  const tr = 0.22 * s;
  B.cylinder(x, 0, z, tr, trunkH + 0.6 * s, 'bark', { segments: 7, rTop: tr * 0.7, collide: true, kind: 'wood', cap: false });
  const tints = [0x6f9a4a, 0x5f8a3e, 0x7aa556, 0x547c38];
  const seed = Math.abs(Math.floor(x * 13.7 + z * 7.3));
  if (kind === 'conifer') {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.ConeGeometry((2.0 - i * 0.5) * s, 2.6 * s, 8);
      B.geometry(g, 'leaves', x, trunkH + (0.9 + i * 1.3) * s, z, { tint: 0x3e6a3a, uvScale: 3 });
    }
    return;
  }
  const blobs = opt.blobs || 6;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + seed;
    const rr = (i === 0 ? 0 : 1.3) * s;
    const g = new THREE.IcosahedronGeometry((1.5 + ((seed + i) % 3) * 0.3) * s, 1);
    B.geometry(g, 'leaves', x + Math.cos(a) * rr, trunkH + (1.4 + (i % 2) * 0.9) * s, z + Math.sin(a) * rr, {
      tint: tints[(seed + i) % tints.length],
      uvScale: 2,
      ry: a,
    });
  }
}

export function hedge(B, x0, z0, x1, z1, h = 1.6, opt = {}) {
  B.footprint(x0, z0, x1, z1, 'hedge', h);
  const ax = Math.min(x0, x1);
  const bx = Math.max(x0, x1);
  const az = Math.min(z0, z1);
  const bz = Math.max(z0, z1);
  const tint = opt.tint ?? 0xd8f0c8;
  // tall boundary hedges are solid; normal hedges can be blown through or flattened by tanks
  if (opt.solid || h > 2.5) {
    B.box(ax, 0, az, bx, h, bz, 'hedge', { kind: 'foliage', tint });
    return;
  }
  const alongX = bx - ax >= bz - az;
  const len = alongX ? bx - ax : bz - az;
  const n = Math.max(1, Math.round(len / 8));
  for (let i = 0; i < n; i++) {
    const s0 = (alongX ? ax : az) + (len * i) / n;
    const s1 = (alongX ? ax : az) + (len * (i + 1)) / n;
    B.destructible({ hp: 150, debris: 'foliage' }, () => {
      if (alongX) B.box(s0, 0, az, s1, h, bz, 'hedge', { kind: 'foliage', tint });
      else B.box(ax, 0, s0, bx, h, s1, 'hedge', { kind: 'foliage', tint });
    });
  }
}

// ---------------------------------------------------------------- boundaries

// Straight run along x (z0 == z1) or z (x0 == x1) with optional gate gaps.
function runSegments(a0, a1, gates) {
  const segs = [];
  let s = a0;
  const gs = (gates || []).map((g) => [g.at - g.w / 2, g.at + g.w / 2]).sort((p, q) => p[0] - q[0]);
  for (const [g0, g1] of gs) {
    if (g0 > s) segs.push([s, g0]);
    s = Math.max(s, g1);
  }
  if (s < a1) segs.push([s, a1]);
  return { segs, gaps: gs };
}

export function fence(B, x0, z0, x1, z1, opt = {}) {
  const h = opt.h ?? 1.8;
  const t = 0.05;
  const alongX = Math.abs(z1 - z0) < 1e-6;
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const c = alongX ? z0 : x0;
  const { segs, gaps } = runSegments(a0, a1, opt.gates);
  const mat = opt.mat || 'fence';
  for (const [s, e] of segs) {
    if (alongX) B.footprint(s, c - 0.05, e, c + 0.05, 'fence', h);
    else B.footprint(c - 0.05, s, c + 0.05, e, 'fence', h);
  }
  const post = (a) => {
    if (alongX) B.box(a - 0.05, 0, c - 0.06, a + 0.05, h + 0.05, c + 0.06, 'concrete', { collide: false });
    else B.box(c - 0.06, 0, a - 0.05, c + 0.06, h + 0.05, a + 0.05, 'concrete', { collide: false });
  };
  for (const [s, e] of segs) {
    const n = Math.max(1, Math.round((e - s) / 1.8));
    for (let i = 0; i < n; i++) {
      const p0 = s + ((e - s) * i) / n;
      const p1 = s + ((e - s) * (i + 1)) / n;
      B.destructible({ hp: 60 }, () => {
        if (alongX) B.box(p0, 0.05, c - t, p1, h, c + t, mat, { kind: 'wood', tint: opt.tint });
        else B.box(c - t, 0.05, p0, c + t, h, p1, mat, { kind: 'wood', tint: opt.tint });
        post(p0);
        if (i === n - 1) post(p1);
        // gravel board along the bottom
        if (alongX) B.box(p0, 0, c - 0.03, p1, 0.15, c + 0.03, 'concrete', { collide: false });
        else B.box(c - 0.03, 0, p0, c + 0.03, 0.15, p1, 'concrete', { collide: false });
      });
    }
  }
  for (const [g0, g1] of gaps) {
    const mid = (g0 + g1) / 2;
    if (alongX) B.portal(mid, 0, c, 0, 1);
    else B.portal(c, 0, mid, 1, 0);
    if (opt.gateLeaf !== false && g1 - g0 < 1.6) {
      // gate left ajar
      B.destructible({ hp: 40 }, () => {
        if (alongX) B.box(g0 + 0.02, 0.1, c, g0 + 0.06, h - 0.25, c + 0.85, 'fence', { kind: 'wood', tint: 0xa08060 });
        else B.box(c, 0.1, g0 + 0.02, c + 0.85, h - 0.25, g0 + 0.06, 'fence', { kind: 'wood', tint: 0xa08060 });
      });
    }
  }
}

export function wall(B, x0, z0, x1, z1, opt = {}) {
  const h = opt.h ?? 0.95;
  const t = (opt.t ?? 0.24) / 2;
  const alongX = Math.abs(z1 - z0) < 1e-6;
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const c = alongX ? z0 : x0;
  const { segs, gaps } = runSegments(a0, a1, opt.gates);
  const mat = opt.mat || 'brick';
  const cap = opt.cap ?? 'kerb';
  for (const [s, e] of segs) {
    if (alongX) B.footprint(s, c - t, e, c + t, 'wall', h);
    else B.footprint(c - t, s, c + t, e, 'wall', h);
  }
  for (const [s, e] of segs) {
    if (alongX) {
      B.box(s, 0, c - t, e, h, c + t, mat, { kind: opt.kind || 'solid', tint: opt.tint });
      if (cap) B.box(s - 0.02, h, c - t - 0.03, e + 0.02, h + 0.07, c + t + 0.03, cap, { collide: true });
    } else {
      B.box(c - t, 0, s, c + t, h, e, mat, { kind: opt.kind || 'solid', tint: opt.tint });
      if (cap) B.box(c - t - 0.03, h, s - 0.02, c + t + 0.03, h + 0.07, e + 0.02, cap, { collide: true });
    }
  }
  for (const [g0, g1] of gaps) {
    const mid = (g0 + g1) / 2;
    if (alongX) B.portal(mid, 0, c, 0, 1);
    else B.portal(c, 0, mid, 1, 0);
    if (opt.piers) {
      for (const a of [g0 - 0.2, g1]) {
        if (alongX) B.box(a, 0, c - t - 0.05, a + 0.2, h + 0.35, c + t + 0.05, mat, { tint: opt.tint });
        else B.box(c - t - 0.05, 0, a, c + t + 0.05, h + 0.35, a + 0.2, mat, { tint: opt.tint });
      }
    }
  }
}

// Invisible tall barrier keeping players inside the map.
export function clip(B, x0, z0, x1, z1, h = 30) {
  B.box(x0, -1, z0, x1, h, z1, null, { render: false, kind: 'clip' });
}

// ---------------------------------------------------------------- street furniture

export function lampPost(B, x, z, r = 0) {
  B.destructible({ hp: 120, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      B.cylinder(0, 0, 0, 0.12, 0.6, 'metal', { tint: 0x333638, segments: 8, collide: true, kind: 'metal' });
      B.cylinder(0, 0.6, 0, 0.07, 5.0, 'metal', { tint: 0x333638, segments: 8, collide: true, kind: 'metal', rTop: 0.05 });
      B.box(-0.04, 5.45, -1.0, 0.04, 5.55, 0, 'metal', { collide: false, tint: 0x333638 });
      B.box(-0.18, 5.3, -1.35, 0.18, 5.5, -0.85, 'metal', { collide: false, tint: 0x333638 });
      B.box(-0.14, 5.25, -1.3, 0.14, 5.3, -0.9, 'emissive', { collide: false, tint: 0xfff2c8 });
    });
  });
}

export function bench(B, x, z, r = 0, tint = 0x7a5232) {
  B.destructible({ hp: 60 }, () => {
    place(B, x, z, r, () => {
      for (let i = 0; i < 3; i++) B.box(-0.9, 0.42, -0.25 + i * 0.13, 0.9, 0.46, -0.16 + i * 0.13, 'wood', { collide: false, tint });
      for (let i = 0; i < 3; i++) B.box(-0.9, 0.55 + i * 0.12, 0.17, 0.9, 0.64 + i * 0.12, 0.2, 'wood', { collide: false, tint });
      for (const lx of [-0.8, 0.8]) B.box(lx - 0.04, 0, -0.25, lx + 0.04, 0.42, 0.2, 'metal', { collide: false, tint: 0x222222 });
      B.box(-0.9, 0, -0.25, 0.9, 0.46, 0.15, null, { render: false, kind: 'wood' });
      B.box(-0.9, 0, 0.15, 0.9, 0.9, 0.21, null, { render: false, kind: 'wood' });
    });
  });
}

const BIN_COLOURS = { black: 0x222426, green: 0x2d5a32, blue: 0x2a4a8a, brown: 0x5a3a22 };
export function wheelieBin(B, x, z, r = 0, colour = 'black') {
  B.destructible({ hp: 40, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      const c = BIN_COLOURS[colour] ?? colour;
      B.box(-0.29, 0.05, -0.36, 0.29, 1.0, 0.36, 'paint', { tint: c, kind: 'metal' });
      B.box(-0.31, 1.0, -0.4, 0.31, 1.06, 0.38, 'paint', { tint: c, collide: false });
      for (const lx of [-0.24, 0.24]) {
        B.geometry(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 10).rotateZ(Math.PI / 2), 'dark', lx, 0.1, 0.36, {});
      }
    });
  });
}

export function phoneBox(B, x, z, r = 0) {
  B.destructible({ hp: 250, debris: 'metal' }, () => {
    const red = 0xb5161b;
    place(B, x, z, r, () => {
      const s = 0.5;
      B.box(-s - 0.05, 0, -s - 0.05, s + 0.05, 0.12, s + 0.05, 'paint', { tint: red });
      for (const [px, pz] of [[-s, -s], [s - 0.1, -s], [-s, s - 0.1], [s - 0.1, s - 0.1]]) {
        B.box(px, 0.12, pz, px + 0.1, 2.3, pz + 0.1, 'paint', { tint: red, kind: 'metal' });
      }
      B.box(-s - 0.04, 2.3, -s - 0.04, s + 0.04, 2.45, s + 0.04, 'paint', { tint: red });
      B.box(-s + 0.05, 2.45, -s + 0.05, s - 0.05, 2.6, s - 0.05, 'paint', { tint: red, collide: false });
      // illuminated TELEPHONE strips
      B.box(-s + 0.1, 2.12, -s - 0.01, s - 0.1, 2.26, -s + 0.02, 'emissive', { collide: false, tint: 0xf4f4f0 });
      B.box(-s + 0.1, 2.12, s - 0.02, s - 0.1, 2.26, s + 0.01, 'emissive', { collide: false, tint: 0xf4f4f0 });
      B.box(-s - 0.01, 2.12, -s + 0.1, -s + 0.02, 2.26, s - 0.1, 'emissive', { collide: false, tint: 0xf4f4f0 });
      B.box(s - 0.02, 2.12, -s + 0.1, s + 0.01, 2.26, s - 0.1, 'emissive', { collide: false, tint: 0xf4f4f0 });
      // glass sides with the classic glazing bars
      const g0 = 0.2;
      const g1 = 2.05;
      B.pane(-s + 0.1, g0, -s + 0.03, s - 0.1, g1, -s + 0.06);
      B.pane(-s + 0.1, g0, s - 0.06, s - 0.1, g1, s - 0.03);
      B.pane(-s + 0.03, g0, -s + 0.1, -s + 0.06, g1, s - 0.1);
      B.pane(s - 0.06, g0, -s + 0.1, s - 0.03, g1, s - 0.1);
      for (let i = 0; i <= 6; i++) {
        const y = g0 + ((g1 - g0) * i) / 6;
        const bar = { collide: false, tint: red };
        B.box(-s + 0.1, y - 0.02, -s + 0.01, s - 0.1, y + 0.02, -s + 0.08, 'paint', bar);
        B.box(-s + 0.1, y - 0.02, s - 0.08, s - 0.1, y + 0.02, s - 0.01, 'paint', bar);
        B.box(-s + 0.01, y - 0.02, -s + 0.1, -s + 0.08, y + 0.02, s - 0.1, 'paint', bar);
        B.box(s - 0.08, y - 0.02, -s + 0.1, s - 0.01, y + 0.02, s - 0.1, 'paint', bar);
      }
      for (const a of [-0.13, 0.13]) {
        const bar = { collide: false, tint: red };
        B.box(a - 0.02, g0, -s + 0.01, a + 0.02, g1, -s + 0.08, 'paint', bar);
        B.box(a - 0.02, g0, s - 0.08, a + 0.02, g1, s - 0.01, 'paint', bar);
        B.box(-s + 0.01, g0, a - 0.02, -s + 0.08, g1, a + 0.02, 'paint', bar);
        B.box(s - 0.08, g0, a - 0.02, s - 0.01, g1, a + 0.02, 'paint', bar);
      }
      B.box(-0.15, 1.0, s - 0.3, 0.15, 1.4, s - 0.12, 'dark', { collide: false });
    });
  });
}

export function postBox(B, x, z) {
  const red = 0xc0161b;
  B.cylinder(x, 0, z, 0.27, 1.45, 'paint', { tint: red, segments: 14, collide: true, kind: 'metal' });
  B.cylinder(x, 1.45, z, 0.31, 0.08, 'paint', { tint: red, segments: 14 });
  B.geometry(new THREE.SphereGeometry(0.27, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'paint', x, 1.53, z, { tint: red });
  B.box(x - 0.13, 1.18, z - 0.285, x + 0.13, 1.22, z - 0.26, 'dark', { collide: false });
}

export function belisha(B, x, z) {
  B.destructible({ hp: 50, debris: 'metal' }, () => {
    for (let i = 0; i < 9; i++) {
      B.cylinder(x, i * 0.27, z, 0.055, 0.27, 'paint', { tint: i % 2 ? 0xf2f2f2 : 0x1a1a1a, segments: 8, cap: i === 8, collide: i === 0 });
    }
    B.box(x - 0.05, 0, z - 0.05, x + 0.05, 2.43, z + 0.05, null, { render: false, kind: 'metal' });
    B.geometry(new THREE.SphereGeometry(0.17, 12, 8), 'emissive', x, 2.6, z, { tint: 0xff9a1a });
  });
}

export function bollard(B, x, z) {
  B.destructible({ hp: 90, debris: 'metal' }, () => {
    B.cylinder(x, 0, z, 0.1, 0.9, 'paint', { tint: 0x1a1a1a, segments: 8, collide: true, kind: 'metal' });
    B.cylinder(x, 0.72, z, 0.105, 0.06, 'paint', { tint: 0xe8e8e8, segments: 8, cap: false });
  });
}

export function busShelter(B, x, z, r = 0) {
  B.destructible({ hp: 200, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      const w = 3.6;
      const h = 2.3;
      const frame = { tint: 0x2a2f3a, kind: 'metal' };
      for (const px of [-w / 2, w / 2 - 0.08]) {
        B.box(px, 0, 0.5, px + 0.08, h, 0.58, 'metal', frame);
        B.box(px, 0, -0.9, px + 0.08, h, -0.82, 'metal', frame);
      }
      B.box(-w / 2 - 0.1, h, -1.1, w / 2 + 0.1, h + 0.12, 0.7, 'metal', frame);
      B.pane(-w / 2 + 0.08, 0.15, 0.52, w / 2 - 0.08, h - 0.05, 0.56);
      B.pane(-w / 2 + 0.02, 0.15, -0.82, -w / 2 + 0.06, h - 0.05, 0.5);
      B.pane(w / 2 - 0.06, 0.15, -0.82, w / 2 - 0.02, h - 0.05, 0.5);
      B.box(-1.2, 0.45, 0.25, 1.2, 0.52, 0.5, 'metal', { tint: 0x9aa0a8, kind: 'metal' });
      // timetable board
      B.box(1.0, 1.2, 0.46, 1.6, 1.9, 0.5, 'white', { collide: false, tint: 0xf0f0e0 });
    });
  });
}

export function car(B, x, z, r = 0, colour = 0x8a1c1c, type = 'hatch') {
  B.destructible({ hp: 260, debris: 'metal', wreck: { h: 0.55 }, explode: { radius: 4.5, damage: 70, vehicle: 120, onlyIfBlown: true } }, () => {
    place(B, x, z, r, () => {
      const paint = { tint: colour, kind: 'metal' };
      const L = type === 'estate' ? 2.25 : 2.0;
      if (type === 'van') {
        B.box(-0.95, 0.35, -2.4, 0.95, 2.1, 2.4, 'paint', paint);
        B.box(-0.96, 1.25, -2.42, 0.96, 1.85, -1.5, 'dark', { collide: false, tint: 0x2c3a46 });
        B.box(-0.97, 0.35, 0.5, -0.95, 1.6, 2.2, 'white', { collide: false, tint: 0xe8e8e8 });
      } else {
        B.box(-0.86, 0.32, -L, 0.86, 0.95, L, 'paint', paint);
        const c0 = type === 'estate' ? -0.9 : -0.85;
        const c1 = type === 'estate' ? 2.05 : 1.15;
        B.box(-0.78, 0.95, c0, 0.78, 1.42, c1, 'dark', { tint: 0x2c3a46, kind: 'metal' });
        B.box(-0.8, 1.42, c0 + 0.08, 0.8, 1.49, c1 - 0.04, 'paint', { tint: colour, collide: false });
        // pillars
        for (const pz of [c0, c1 - 0.06]) {
          for (const px of [-0.8, 0.74]) B.box(px, 0.95, pz, px + 0.06, 1.44, pz + 0.06, 'paint', { tint: colour, collide: false });
        }
      }
      const zf = type === 'van' ? -2.4 : -L;
      const zr = type === 'van' ? 2.4 : L;
      // lights and plates (yellow at the back, white at the front)
      B.box(-0.8, 0.7, zf - 0.02, -0.5, 0.84, zf, 'emissive', { collide: false, tint: 0xf8f4e0 });
      B.box(0.5, 0.7, zf - 0.02, 0.8, 0.84, zf, 'emissive', { collide: false, tint: 0xf8f4e0 });
      B.box(-0.8, 0.7, zr, -0.55, 0.86, zr + 0.02, 'emissive', { collide: false, tint: 0xb01818 });
      B.box(0.55, 0.7, zr, 0.8, 0.86, zr + 0.02, 'emissive', { collide: false, tint: 0xb01818 });
      B.box(-0.26, 0.42, zf - 0.025, 0.26, 0.54, zf, 'white', { collide: false, tint: 0xf6f6f2 });
      B.box(-0.26, 0.5, zr, 0.26, 0.62, zr + 0.025, 'paint', { collide: false, tint: 0xf2c418 });
      B.box(-0.88, 0.3, zf - 0.04, 0.88, 0.45, zf + 0.1, 'dark', { collide: false });
      B.box(-0.88, 0.3, zr - 0.1, 0.88, 0.45, zr + 0.04, 'dark', { collide: false });
      const wz = type === 'van' ? 1.6 : L - 0.62;
      for (const wx of [-0.82, 0.82]) {
        for (const zz of [-wz, wz]) {
          B.geometry(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2), 'dark', wx, 0.32, zz, {});
        }
      }
    });
  });
}

export function shed(B, x, z, r = 0, w = 2.2, d = 2.6, tint = 0x8a6a48) {
  B.destructible({ hp: 220 }, () => {
    place(B, x, z, r, () => {
      B.box(0, 0, 0, w, 2.0, d, 'fence', { kind: 'wood', tint });
      B.box(-0.1, 2.0, -0.12, w + 0.1, 2.1, d + 0.12, 'dark', { tint: 0x3a3a3a });
      B.box(w * 0.5 - 0.4, 0.05, -0.02, w * 0.5 + 0.4, 1.85, 0, 'wood', { collide: false, tint: 0x6a4a30 });
      B.box(w - 0.02, 1.0, d * 0.3, w + 0.005, 1.5, d * 0.7, 'dark', { collide: false, tint: 0x40505a });
    });
  });
}

export function greenhouse(B, x, z, r = 0, w = 2.6, d = 3.6) {
  B.destructible({ hp: 120 }, () => {
    place(B, x, z, r, () => {
      const h = 1.9;
      const fr = { collide: false, tint: 0xe8e8e8 };
      B.box(0, 0, 0, w, 0.3, 0.06, 'brick', {});
      B.box(0, 0, d - 0.06, w, 0.3, d, 'brick', {});
      B.box(0, 0, 0, 0.06, 0.3, d, 'brick', {});
      B.box(w - 0.06, 0, 0, w, 0.3, d, 'brick', {});
      // glass walls (door gap on the front)
      B.pane(0.02, 0.3, 0.02, 0.04, h, d - 0.02);
      B.pane(w - 0.04, 0.3, 0.02, w - 0.02, h, d - 0.02);
      B.pane(0.04, 0.3, d - 0.04, w - 0.04, h, d - 0.02);
      B.pane(0.04, 0.3, 0.02, w * 0.5 - 0.45, h, 0.04);
      B.pane(w * 0.5 + 0.45, 0.3, 0.02, w - 0.04, h, 0.04);
      for (let i = 0; i <= 4; i++) {
        const zz = (d * i) / 4;
        B.box(-0.01, 0, zz - 0.03, 0.05, h, zz + 0.03, 'white', fr);
        B.box(w - 0.05, 0, zz - 0.03, w + 0.01, h, zz + 0.03, 'white', fr);
      }
      // ridge roof glass (visual only)
      const ry = h + 0.6;
      B.quad([[w, h, 0], [0, h, 0], [0, ry, d], [w, ry, d]], 'glass', {});
      B.quad([[0, h, d], [w, h, d], [w, ry, d], [0, ry, d]], 'glass', {});
      B.box(-0.02, h, -0.02, w + 0.02, h + 0.05, d + 0.02, null, { render: false });
      B.portal(w / 2, 0, 0, 0, 1, 0.8);
      // staging benches
      B.box(0.1, 0.75, 0.9, 0.6, 0.8, d - 0.15, 'wood', { tint: 0x9a7a52, kind: 'wood' });
      B.box(w - 0.6, 0.75, 0.9, w - 0.1, 0.8, d - 0.15, 'wood', { tint: 0x9a7a52, kind: 'wood' });
    });
  });
}

export function headstone(B, x, z, r = 0, seed = 0) {
  place(B, x, z, r, () => {
    const h = 0.7 + (seed % 3) * 0.15;
    const w = 0.5 + (seed % 2) * 0.12;
    B.box(-w / 2, 0, -0.06, w / 2, h, 0.06, 'stone', { kind: 'stone', tint: seed % 4 === 0 ? 0xb8b8b0 : 0xd8d8d0 });
    B.geometry(new THREE.CylinderGeometry(w / 2, w / 2, 0.12, 10, 1, false, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), 'stone', 0, h, 0, {
      tint: seed % 4 === 0 ? 0xb8b8b0 : 0xd8d8d0,
    });
  });
}

export function tomb(B, x, z, r = 0) {
  place(B, x, z, r, () => {
    B.box(-0.55, 0, -1.05, 0.55, 0.8, 1.05, 'stone', { kind: 'stone', tint: 0xc8c4b8 });
    B.box(-0.62, 0.8, -1.12, 0.62, 0.9, 1.12, 'stone', { kind: 'stone', tint: 0xb8b4a8 });
  });
}

export function memorial(B, x, z) {
  place(B, x, z, 0, () => {
    B.box(-1.6, 0, -1.6, 1.6, 0.25, 1.6, 'stone', { kind: 'stone' });
    B.box(-1.2, 0.25, -1.2, 1.2, 0.5, 1.2, 'stone', { kind: 'stone' });
    B.box(-0.7, 0.5, -0.7, 0.7, 1.7, 0.7, 'stone', { kind: 'stone', tint: 0xdcd8cc });
    B.box(-0.35, 1.7, -0.35, 0.35, 4.2, 0.35, 'stone', { kind: 'stone', tint: 0xe4e0d4 });
    B.box(-0.8, 3.4, -0.18, 0.8, 3.75, 0.18, 'stone', { kind: 'stone', tint: 0xe4e0d4 });
    // poppy wreaths
    for (const [wx, wz, ry] of [[0, -0.72, 0], [0, 0.72, 0], [-0.72, 0, Math.PI / 2], [0.72, 0, Math.PI / 2]]) {
      B.geometry(new THREE.TorusGeometry(0.28, 0.07, 6, 14), 'paint', wx, 1.1, wz, { tint: 0xc0181a, ry });
    }
  });
}

export function bandstand(B, x, z) {
  place(B, x, z, 0, () => {
    const R = 3.6;
    const h = 0.65;
    B.cylinder(0, 0, 0, R, h, 'floorboards', { segments: 8, tint: 0xd8c8a8 });
    const a = R * 0.924;
    const b = R * 0.383;
    const c = R * 0.653;
    B.box(-a, 0, -b, a, h, b, null, { render: false, kind: 'wood' });
    B.box(-b, 0, -a, b, h, a, null, { render: false, kind: 'wood' });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      B.box(Math.min(sx * b, sx * c), 0, Math.min(sz * b, sz * c), Math.max(sx * b, sx * c), h, Math.max(sz * b, sz * c), null, { render: false, kind: 'wood' });
    }
    // entrance steps on the south side
    B.box(-0.9, 0, a, 0.9, 0.32, a + 0.45, 'stone', { kind: 'stone' });
    B.portal(0, h, a - 0.2, 0, 1, 0.8);
    for (let i = 0; i < 8; i++) {
      const ang = ((i + 0.5) / 8) * Math.PI * 2;
      const px = Math.cos(ang) * (R - 0.25);
      const pz = Math.sin(ang) * (R - 0.25);
      B.cylinder(px, h, pz, 0.08, 2.7, 'paint', { tint: 0xf2f2ee, segments: 6, collide: true, kind: 'metal', cap: false });
      // railing between posts except at the entrance
      const nx = Math.cos(ang + Math.PI / 4) * (R - 0.25);
      const nz = Math.sin(ang + Math.PI / 4) * (R - 0.25);
      const midAng = ang + Math.PI / 8;
      const isEntrance = Math.abs(Math.sin(midAng) - 1) < 0.1;
      if (!isEntrance) {
        const g = new THREE.BoxGeometry(Math.hypot(nx - px, nz - pz), 0.08, 0.06);
        B.geometry(g, 'paint', (px + nx) / 2, h + 0.85, (pz + nz) / 2, { tint: 0x2a5a3a, ry: -Math.atan2(nz - pz, nx - px) });
      }
    }
    const roof = new THREE.ConeGeometry(R + 0.4, 1.6, 8, 1);
    roof.rotateY(Math.PI / 8);
    B.geometry(roof, 'tiles', 0, h + 2.7 + 0.8, 0, { tint: 0x7aa898, uvScale: 3 });
    B.geometry(new THREE.SphereGeometry(0.18, 8, 6), 'paint', 0, h + 2.7 + 1.65, 0, { tint: 0xd8b84a });
  });
}

export function picnicTable(B, x, z, r = 0) {
  B.destructible({ hp: 60 }, () => {
    place(B, x, z, r, () => {
      const t = { tint: 0x9a7a52, kind: 'wood' };
      B.box(-0.9, 0.72, -0.4, 0.9, 0.78, 0.4, 'wood', t);
      B.box(-0.9, 0.42, -0.8, 0.9, 0.46, -0.55, 'wood', t);
      B.box(-0.9, 0.42, 0.55, 0.9, 0.46, 0.8, 'wood', t);
      for (const lx of [-0.75, 0.7]) B.box(lx, 0, -0.75, lx + 0.06, 0.72, 0.75, 'wood', { ...t, collide: false });
      B.box(-0.9, 0, -0.8, 0.9, 0.42, 0.8, null, { render: false, kind: 'wood' });
    });
  });
}

export function raisedBed(B, x0, z0, x1, z1) {
  B.destructible({ hp: 60, debris: 'foliage' }, () => {
    B.box(x0, 0, z0, x1, 0.3, z1, 'wood', { tint: 0x7a5a3a, kind: 'wood', faces: { py: 'soil' } });
    // rows of veg
    const alongX = x1 - x0 > z1 - z0;
    const n = Math.floor((alongX ? x1 - x0 : z1 - z0) / 0.5);
    for (let i = 0; i < n; i++) {
      const a = (alongX ? x0 : z0) + 0.25 + i * 0.5;
      const g = new THREE.IcosahedronGeometry(0.16, 0);
      if (alongX) B.geometry(g, 'leaves', a, 0.38, (z0 + z1) / 2, { tint: 0x7ab04a });
      else B.geometry(g, 'leaves', (x0 + x1) / 2, 0.38, a, { tint: 0x7ab04a });
    }
  });
}

export function beanPoles(B, x, z, n = 4) {
  for (let i = 0; i < n; i++) {
    B.box(x + i * 0.45 - 0.02, 0, z - 0.02, x + i * 0.45 + 0.02, 1.9, z + 0.02, 'bark', { collide: false });
    B.geometry(new THREE.IcosahedronGeometry(0.22, 0), 'leaves', x + i * 0.45, 1.2, z, { tint: 0x5a9a3a, scale: [1, 2.6, 1] });
  }
}

export function compostBin(B, x, z) {
  B.destructible({ hp: 60 }, () => {
    B.box(x - 0.5, 0, z - 0.5, x + 0.5, 0.95, z + 0.5, 'fence', { kind: 'wood', tint: 0x7a5a3a });
  });
}

export function waterButt(B, x, z, tint = 0x2a4a2a) {
  B.destructible({ hp: 50, debris: 'metal' }, () => {
    B.cylinder(x, 0, z, 0.32, 1.05, 'paint', { tint, segments: 10, collide: true, kind: 'metal' });
  });
}

export function crate(B, x, z, s = 0.8, h = 0.8, y = 0) {
  B.destructible({ hp: 40 }, () => {
    B.box(x - s / 2, y, z - s / 2, x + s / 2, y + h, z + s / 2, 'wood', { kind: 'wood', tint: 0xb08a5a });
  });
}

export function bottleBank(B, x, z, r = 0, tint = 0x2d6a3a) {
  B.destructible({ hp: 200, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      B.box(-0.8, 0.1, -0.75, 0.8, 1.7, 0.75, 'paint', { tint, kind: 'metal' });
      B.box(-0.85, 1.7, -0.8, 0.85, 1.8, 0.8, 'paint', { tint, collide: false });
      for (const hx of [-0.4, 0.4]) B.cylinder(hx, 1.35, -0.76, 0.14, 0.02, 'dark', { segments: 10 });
    });
  });
}

export function goalPosts(B, x, z, r = 0) {
  B.destructible({ hp: 80, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      const t = { collide: true, kind: 'metal', tint: 0xf4f4f4 };
      B.box(-3.6, 0, -0.06, -3.48, 2.44, 0.06, 'white', t);
      B.box(3.48, 0, -0.06, 3.6, 2.44, 0.06, 'white', t);
      B.box(-3.6, 2.32, -0.06, 3.6, 2.44, 0.06, 'white', t);
    });
  });
}

export function swings(B, x, z, r = 0) {
  B.destructible({ hp: 100, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      const t = { tint: 0x2a6aa8, kind: 'metal' };
      for (const px of [-1.6, 1.6]) {
        B.box(px - 0.06, 0, -0.9, px + 0.06, 2.4, -0.78, 'paint', t);
        B.box(px - 0.06, 0, 0.78, px + 0.06, 2.4, 0.9, 'paint', t);
      }
      B.box(-1.7, 2.3, -0.06, 1.7, 2.45, 0.06, 'paint', { ...t, collide: false });
      for (const sx of [-0.7, 0.7]) {
        B.box(sx - 0.25, 0.45, -0.12, sx + 0.25, 0.5, 0.12, 'dark', { collide: false });
        B.box(sx - 0.22, 0.5, -0.01, sx - 0.2, 2.3, 0.01, 'metal', { collide: false });
        B.box(sx + 0.2, 0.5, -0.01, sx + 0.22, 2.3, 0.01, 'metal', { collide: false });
      }
    });
  });
}

export function slide(B, x, z, r = 0) {
  B.destructible({ hp: 100, debris: 'metal' }, () => {
    place(B, x, z, r, () => {
      B.box(-0.4, 0, -0.4, 0.4, 1.5, 0.4, 'paint', { tint: 0xd8a020, kind: 'metal' });
      B.box(-0.45, 1.5, -0.45, 0.45, 2.4, -0.4, 'paint', { tint: 0xd8a020, collide: false });
      const g = new THREE.BoxGeometry(0.55, 0.06, 2.6);
      B.geometry(g, 'paint', 0, 0.82, 1.45, { tint: 0xc83a2a, rx: -0.5 });
      B.box(-0.3, 0, 0.4, 0.3, 0.8, 1.6, null, { render: false, kind: 'metal' });
    });
  });
}

export function washingLine(B, x0, z0, x1, z1) {
  B.box(x0 - 0.04, 0, z0 - 0.04, x0 + 0.04, 1.9, z0 + 0.04, 'metal', { collide: false, tint: 0xcccccc });
  B.box(x1 - 0.04, 0, z1 - 0.04, x1 + 0.04, 1.9, z1 + 0.04, 'metal', { collide: false, tint: 0xcccccc });
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ang = Math.atan2(z1 - z0, x1 - x0);
  B.geometry(new THREE.BoxGeometry(len, 0.01, 0.01), 'white', (x0 + x1) / 2, 1.85, (z0 + z1) / 2, { ry: -ang });
  const cols = [0xe8e8f0, 0x5a7ab0, 0xd85a5a, 0xf0d070, 0x6ab07a];
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const g = new THREE.BoxGeometry(0.45, 0.6, 0.01);
    B.geometry(g, 'paint', x0 + (x1 - x0) * t, 1.52, z0 + (z1 - z0) * t, { ry: -ang, tint: cols[i % cols.length] });
  }
}

export function flowerTub(B, x, z, tint = 0xd84a7a) {
  B.destructible({ hp: 60, debris: 'stone' }, () => {
    B.cylinder(x, 0, z, 0.35, 0.45, 'stone', { segments: 10, collide: true, kind: 'stone', tint: 0xb8a890 });
    B.geometry(new THREE.IcosahedronGeometry(0.33, 1), 'leaves', x, 0.6, z, { tint: 0x4a8a3a, scale: [1, 0.6, 1] });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      B.geometry(new THREE.IcosahedronGeometry(0.07, 0), 'emissive', x + Math.cos(a) * 0.22, 0.75, z + Math.sin(a) * 0.22, { tint });
    }
  });
}

export function fingerpost(B, x, z, r = 0) {
  B.destructible({ hp: 50 }, () => {
    place(B, x, z, r, () => {
      B.box(-0.05, 0, -0.05, 0.05, 2.6, 0.05, 'white', { tint: 0xf0f0f0, kind: 'wood' });
      B.box(-0.9, 2.2, -0.03, 0.05, 2.38, 0.03, 'white', { collide: false });
      B.box(0, 1.9, -0.03, 0.9, 2.08, 0.03, 'white', { collide: false });
      B.box(-0.03, 2.4, -0.03, 0.03, 2.75, 0.03, 'white', { collide: false });
    });
  });
}

export function postBoxWall(B, x, z) {
  B.box(x - 0.25, 1.0, z, x + 0.25, 1.5, z + 0.12, 'paint', { tint: 0xc0161b, collide: false });
}

// Red fuel drum. Shoot it and it goes up.
export function barrel(B, x, z, tint = 0xb8261c) {
  B.destructible({ hp: 25, bullet: true, debris: 'metal', explode: { radius: 6, damage: 110, vehicle: 220 } }, () => {
    B.cylinder(x, 0, z, 0.3, 0.92, 'paint', { tint, segments: 10, collide: true, kind: 'metal' });
    B.cylinder(x, 0.3, z, 0.305, 0.04, 'dark', { segments: 10, cap: false });
    B.cylinder(x, 0.62, z, 0.305, 0.04, 'dark', { segments: 10, cap: false });
    B.box(x - 0.12, 0.93, z - 0.04, x + 0.12, 0.95, z + 0.04, 'white', { collide: false, tint: 0xf2c418 });
  });
}

// Round hay bale lying on its side (axis along local x when r = 0).
export function hayBale(B, x, z, r = 0) {
  B.destructible({ hp: 80, debris: 'hay' }, () => {
    place(B, x, z, r, () => {
      const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12).rotateZ(Math.PI / 2);
      B.geometry(g, 'gravel', 0, 0.75, 0, { tint: 0xe8c878, uvScale: 1.5 });
      B.box(-0.6, 0, -0.65, 0.6, 1.4, 0.65, null, { render: false, kind: 'foliage' });
    });
  });
}
