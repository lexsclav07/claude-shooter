// The countryside around Little Clawdington: a ring road, fields with hedgerows,
// farms, a fuel station, woods, a WW2 pillbox and each team's vehicle depot.
// Like the town, the north half is authored once and rotated 180 degrees for the
// south half, so both teams get the same ground.

import * as THREE from 'three';
import { Frame } from './builder.js';
import { terraceHouse, pub, hall, building, furn, table } from './buildings.js';
import * as P from './props.js';
import { mulberry32 } from '../util.js';
import { signTexture } from './textures.js';
import { TEAMS } from '../config.js';

export const MAP_BOUNDS = { minX: -200, maxX: 200, minZ: -150, maxZ: 150 };
export const TOWN_BOUNDS = { minX: -63, maxX: 63, minZ: -47, maxZ: 47 };

function flat(B, x0, z0, x1, z1, mat, y = 0.006, tint) {
  B.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], mat, { tint });
  if (!mat.startsWith('line')) B.surface(x0, z0, x1, z1, mat);
}

// Road along x (horizontal) or z with edge lines and a dashed centre line.
function road(B, x0, z0, x1, z1) {
  flat(B, x0, z0, x1, z1, 'tarmac', 0.005);
  const alongX = x1 - x0 > z1 - z0;
  if (alongX) {
    const c = (z0 + z1) / 2;
    for (let x = x0 + 2; x < x1 - 3; x += 6) flat(B, x, c - 0.06, Math.min(x + 3, x1), c + 0.06, 'lineWhite', 0.012);
    flat(B, x0, z0 + 0.3, x1, z0 + 0.42, 'lineWhite', 0.012);
    flat(B, x0, z1 - 0.42, x1, z1 - 0.3, 'lineWhite', 0.012);
  } else {
    const c = (x0 + x1) / 2;
    for (let z = z0 + 2; z < z1 - 3; z += 6) flat(B, c - 0.06, z, c + 0.06, Math.min(z + 3, z1), 'lineWhite', 0.012);
    flat(B, x0 + 0.3, z0, x0 + 0.42, z1, 'lineWhite', 0.012);
    flat(B, x1 - 0.42, z0, x1 - 0.3, z1, 'lineWhite', 0.012);
  }
}

const SIDES = {
  north: { farm: 'Clawdington Farm', wood: 'Bluebell Wood', fuel: 'Clawd Fuel', fields: 'North Fields', pillbox: 'Pillbox Field', pubName: 'The Plough', cottages: 'Rose Cottages', ring: 'North Ring Road', seed: 3 },
  south: { farm: 'Manor Farm', wood: 'Hollow Wood', fuel: 'Opus Petroleum', fields: 'South Fields', pillbox: 'Bunker Field', pubName: 'The Wheatsheaf', cottages: 'Mill Cottages', ring: 'South Ring Road', seed: 11 },
};

export function buildCountryside(B, zone) {
  B.withFrame(new Frame(0, 0, 0), () => side(B, SIDES.north, zone));
  B.withFrame(new Frame(0, 0, 2), () => side(B, SIDES.south, zone));
  // the High Street becomes the main road out to each depot
  road(B, -260, -3.5, -63, 3.5);
  road(B, 63, -3.5, 260, 3.5);
  B.withFrame(new Frame(0, 0, 0), () => depot(B, 0, zone));
  B.withFrame(new Frame(0, 0, 2), () => depot(B, 1, zone));
  mapEdge(B);
}

// ---------------------------------------------------------------- one half

function side(B, S, zone) {
  const rnd = mulberry32(S.seed);
  // ring road (with the rotated copy this closes the loop)
  road(B, -144, -99, 144, -91);
  road(B, -144, -91, -136, -3.5);
  road(B, 136, -91, 144, -3.5);
  // Church Lane carries on north to meet the ring road
  flat(B, -26, -91, -20, -47, 'tarmac', 0.005);
  zone(S.ring, -144, -99, 144, -91);
  zone('Ring Road', -144, -91, -136, 0);
  zone('Ring Road', 136, -91, 144, 0);
  zone(S.fields, -136, -91, 136, -47);

  farm(B, S, zone, rnd);
  fuelStation(B, S, zone);
  wood(B, S, zone, rnd);
  fields(B, S, zone, rnd);
  pillbox(B, S, zone);
  countryPub(B, S, zone);
  cottages(B, S, zone);
  outerFields(B, S, zone, rnd);
}

function farm(B, S, zone, rnd) {
  zone(S.farm, -134, -146, -58, -100);
  flat(B, -120, -128, -62, -104, 'concrete', 0.006, 0xd8d0c0);
  // farmhouse, front facing the ring road
  B.withFrame(B.frame.sub(-104, -106, 2), () => terraceHouse(B, { w: 7, d: 8, wall: 'stone', roofMat: 'slate', seed: 31 }));
  // big open-fronted barn - wide enough to park a tank in
  B.withFrame(B.frame.sub(-70, -129, 2), () => {
    building(B, {
      w: 18,
      d: 11,
      floors: 1,
      fh: 6,
      T: 0.3,
      base: 0.05,
      wall: 'fence',
      wallTint: 0x8a3a2a,
      inner: 'fence',
      innerTint: 0x8a3a2a,
      floorMat: ['concrete'],
      lintels: false,
      openings: [{ side: 'front', kind: 'arch', at: 9, w: 14, h: 4.8 }],
      roof: { mat: 'slate', pitch: 22, tint: 0x9aa0a8 },
      band: false,
      furnish: (B2) => {
        for (const [bx, bz] of [[2, 9.4], [3.4, 9.4], [4.8, 9.4], [15.5, 9.4], [14.1, 9.4]]) P.hayBale(B2, bx, bz, 0);
        P.crate(B2, 16.5, 2.0, 1.1, 1.0);
      },
    });
  });
  // grain silo
  B.cylinder(-60, 0, -138, 2.6, 12, 'metal', { tint: 0xc8ccd0, segments: 14, collide: true });
  B.geometry(new THREE.ConeGeometry(2.8, 2, 14), 'metal', -60, 13, -138, { tint: 0xb8bcc0 });
  // dry stone walls round the yard, with gateways wide enough for a tank
  const stone = { h: 1.05, mat: 'stone', cap: 'stone', kind: 'stone' };
  P.wall(B, -122, -129, -90, -129, { ...stone, gates: [{ at: -108, w: 8 }] });
  P.wall(B, -122, -129, -122, -102, { ...stone, gates: [{ at: -116, w: 8 }] });
  // tractor
  B.destructible({ hp: 300, debris: 'metal', wreck: { h: 0.8 } }, () => {
    const x = -92;
    const z = -118;
    B.box(x - 1.0, 0.7, z - 1.6, x + 1.0, 1.9, z + 0.6, 'paint', { tint: 0x2a7a3a, kind: 'metal' });
    B.box(x - 0.8, 1.9, z - 0.2, x + 0.8, 3.0, z + 0.8, 'dark', { tint: 0x3a4a50, kind: 'metal' });
    for (const [wx, wz, r] of [[-1.05, 0.4, 0.85], [1.05, 0.4, 0.85], [-0.95, -1.4, 0.5], [0.95, -1.4, 0.5]]) {
      B.geometry(new THREE.CylinderGeometry(r, r, 0.45, 12).rotateZ(Math.PI / 2), 'dark', x + wx, r, z + wz, {});
    }
  });
  for (const [x, z] of [[-112, -122], [-74, -112], [-70, -114]]) P.hayBale(B, x, z, (x | 0) % 2);
  P.barrel(B, -108, -124);
  P.barrel(B, -107.2, -124.5);
  P.waterButt(B, -96, -113);
  // fields north of the farm
  for (let i = 0; i < 9; i++) P.hayBale(B, -134 + rnd() * 40, -146 + rnd() * 12, i % 2);
  for (const x of [-132, -126, -100]) P.tree(B, x, -140 + rnd() * 4, 1.1);
}

function fuelStation(B, S, zone) {
  zone(S.fuel, 36, -126, 70, -99);
  flat(B, 36, -126, 70, -99, 'concrete', 0.006, 0xd0d0cc);
  // canopy on four pillars
  const top = 5.2;
  for (const [x, z] of [[44, -103], [62, -103], [44, -111], [62, -111]]) B.box(x - 0.25, 0, z - 0.25, x + 0.25, top, z + 0.25, 'white', { tint: 0xe8e8e8 });
  B.box(42, top, -113, 64, top + 0.6, -101, 'white', { tint: 0xf4f4f0 });
  B.box(41.9, top + 0.1, -101.05, 64.1, top + 0.5, -100.95, 'paint', { collide: false, tint: 0xd97757 });
  const tex = signTexture(S.fuel.toUpperCase(), { bg: '#d97757', fg: '#1b120e', border: null, font: 'bold 100px Arial, sans-serif' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.42), new THREE.MeshBasicMaterial({ map: tex }));
  B.mesh(sign, 53, top + 0.3, -100.92, 0);
  // pumps blow up if you shoot them enough
  for (const x of [48, 53, 58]) {
    B.destructible({ hp: 90, bullet: true, debris: 'metal', explode: { radius: 7, damage: 120, vehicle: 250 } }, () => {
      B.box(x - 0.5, 0, -107.6, x + 0.5, 0.25, -106.4, 'concrete', {});
      B.box(x - 0.4, 0.25, -107.4, x + 0.4, 1.9, -106.6, 'paint', { tint: 0xe8e8e0, kind: 'metal' });
      B.box(x - 0.41, 1.4, -107.41, x + 0.41, 1.8, -106.59, 'paint', { collide: false, tint: 0xd97757 });
    });
  }
  // kiosk
  B.withFrame(B.frame.sub(58, -115, 2), () => {
    hall(B, {
      w: 12,
      d: 8,
      fh: 3.2,
      wall: 'render',
      wallTint: 0xf0f0ea,
      inside: 0xf4f4f0,
      lintels: false,
      frameTint: 0x2a2a2a,
      openings: [
        { side: 'front', kind: 'door', at: 3, w: 1.4, color: 0x2a2a2a },
        { side: 'front', kind: 'shop', at: 8, w: 6, sill: 0.4 },
        { side: 'back', kind: 'door', at: 1.6, w: 1.1, color: 0x666666 },
        { side: 'left', kind: 'window', at: 4, w: 1.4 },
      ],
      roof: { type: 'flat' },
      furnish: (B2, ctx) => {
        const by = ctx.base;
        furn(B2, 0.3, by, 4.5, 4.5, by + 1.0, 5.2, 'wood', 0x5a3a22);
        furn(B2, 6.5, by, 2.4, 10.5, by + 1.6, 2.9, 'paint', 0xe0e0e0, 'metal');
        furn(B2, 6.5, by, 4.6, 10.5, by + 1.6, 5.1, 'paint', 0xe0e0e0, 'metal');
        furn(B2, 8, by, 7.1, 11.7, by + 1.9, 7.7, 'paint', 0xdde4ea, 'metal');
      },
    });
  });
  for (const [x, z] of [[38, -124], [38.8, -124.4], [38.2, -123.2], [69, -118], [68.4, -118.6]]) P.barrel(B, x, z);
  // fuel tanker lorry: a very large bang
  B.destructible({ hp: 220, bullet: true, debris: 'metal', wreck: { h: 0.9 }, explode: { radius: 11, damage: 160, vehicle: 450 } }, () => {
    const z = -125;
    const x = -16; // parked west of the forecourt
    B.box(x + 40, 0.4, z - 1.3, x + 42.8, 3.0, z + 1.3, 'paint', { tint: 0x2a4a8a, kind: 'metal' });
    B.box(x + 40.3, 1.9, z - 1.31, x + 42.5, 2.7, z + 1.31, 'dark', { collide: false, tint: 0x334455 });
    B.geometry(new THREE.CylinderGeometry(1.25, 1.25, 8.6, 14).rotateZ(Math.PI / 2), 'metal', x + 47.6, 1.75, z, { tint: 0xe0e0e0 });
    B.box(x + 43.2, 0.5, z - 1.25, x + 52, 3.0, z + 1.25, null, { render: false, kind: 'metal' });
    for (const wx of [x + 41.4, x + 45, x + 50.5]) {
      for (const sgn of [-1, 1]) B.geometry(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12).rotateX(Math.PI / 2), 'dark', wx, 0.5, z + sgn * 1.25, {});
    }
  });
  P.lampPost(B, 37, -100.2, 2);
  P.lampPost(B, 69, -100.2, 2);
}

function wood(B, S, zone, rnd) {
  zone(S.wood, 76, -147, 136, -102);
  const pts = [];
  for (let k = 0; k < 400 && pts.length < 46; k++) {
    const x = 78 + rnd() * 56;
    const z = -145 + rnd() * 41;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 5.2)) continue;
    pts.push([x, z]);
  }
  pts.forEach(([x, z], i) => P.tree(B, x, z, 0.9 + rnd() * 0.6, { kind: i % 4 === 0 ? 'conifer' : 'oak' }));
  for (let i = 0; i < 14; i++) {
    const x = 80 + rnd() * 52;
    const z = -144 + rnd() * 38;
    if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) continue;
    P.hedge(B, x - 1, z - 0.8, x + 1, z + 0.8, 1.2, { tint: 0xb8d8a8 });
  }
  flat(B, 104, -146, 106, -99, 'gravel', 0.006);
  P.bench(B, 103, -120, 1);
}

function fields(B, S, zone, rnd) {
  // patchwork of fields between the town and the ring road
  for (const [x0, z0, x1, z1, tint] of [
    [-136, -90, -64, -48, 0xe8f0c8],
    [-60, -90, -30, -48, 0xf0e8b8],
    [30, -90, 64, -48, 0xe8f0c8],
    [64, -90, 136, -48, 0xf0e8b8],
  ]) {
    B.grass(x0, z0, x1, z1);
    // ploughed strips for a bit of texture
    if (tint === 0xf0e8b8) for (let x = x0 + 2; x < x1 - 2; x += 4) flat(B, x, z0 + 2, x + 2.2, z1 - 2, 'soil', 0.004, 0xa89070);
  }
  // hedgerows with gaps (gateways) for tanks and people
  const hedgeRun = (x0, z0, x1, z1, gaps) => {
    const alongX = x1 - x0 > z1 - z0;
    const a0 = alongX ? x0 : z0;
    const a1 = alongX ? x1 : z1;
    let s = a0;
    for (const [g0, g1] of gaps) {
      if (g0 > s) alongX ? P.hedge(B, s, z0, g0, z1, 1.9) : P.hedge(B, x0, s, x1, g0, 1.9);
      s = g1;
    }
    if (s < a1) alongX ? P.hedge(B, s, z0, a1, z1, 1.9) : P.hedge(B, x0, s, x1, a1, 1.9);
  };
  hedgeRun(-100.5, -90, -99.5, -48, [[-74, -64]]);
  hedgeRun(-136, -70.5, -64, -69.5, [[-124, -116], [-88, -80]]);
  hedgeRun(99.5, -90, 100.5, -48, [[-70, -60]]);
  hedgeRun(64, -70.5, 136, -69.5, [[76, -68], [112, -104]].map(([a, b]) => [Math.min(a, b), Math.max(a, b)]));
  hedgeRun(-64.5, -90, -63.5, -48, [[-80, -72], [-60, -52]]);
  hedgeRun(63.5, -90, 64.5, -48, [[-80, -72], [-60, -52]]);
  // hay bales and lone trees for cover
  for (let i = 0; i < 18; i++) {
    const x = (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 62);
    const z = -86 + rnd() * 34;
    P.hayBale(B, x, z, i % 2);
  }
  for (const [x, z] of [[-120, -56], [-80, -84], [-45, -60], [42, -84], [88, -56], [120, -80], [-130, -86], [130, -52]]) P.tree(B, x, z, 1.0 + rnd() * 0.5);
}

function pillbox(B, S, zone) {
  zone(S.pillbox, -18, -90, 30, -48);
  // squat concrete WW2 pillbox with firing slits
  B.withFrame(B.frame.sub(6, -64, 2), () => {
    building(B, {
      w: 6,
      d: 6,
      floors: 1,
      fh: 2.4,
      T: 0.45,
      base: 0.05,
      wall: 'concrete',
      inner: 'concrete',
      innerTint: 0xb8b8b0,
      floorMat: ['concrete'],
      lintels: false,
      openings: [
        { side: 'front', kind: 'window', at: 3, w: 1.6, h: 0.32, sill: 1.05, open: true, frameMat: 'concrete' },
        { side: 'left', kind: 'window', at: 3, w: 1.6, h: 0.32, sill: 1.05, open: true, frameMat: 'concrete' },
        { side: 'right', kind: 'window', at: 3, w: 1.6, h: 0.32, sill: 1.05, open: true, frameMat: 'concrete' },
        { side: 'back', kind: 'door', at: 3, w: 1.1, h: 1.9, leaf: false, frameMat: 'concrete' },
      ],
      roof: { type: 'flat' },
      band: false,
    });
  });
  for (const [x, z] of [[-2, -58], [1, -57], [14, -59]]) {
    B.destructible({ hp: 120, debris: 'hay' }, () => B.box(x - 1.2, 0, z - 0.4, x + 1.2, 0.9, z + 0.4, 'gravel', { tint: 0xb8a070, kind: 'foliage' }));
  }
  P.crate(B, 10, -70, 1.0, 0.9);
  P.tree(B, 20, -82, 1.2);
  P.tree(B, -12, -76, 1.0);
}

function countryPub(B, S, zone) {
  // pub on the main road east of town
  zone(S.pubName, 92, -30, 112, -4);
  B.withFrame(B.frame.sub(110, -8, 2), () => pub(B, { name: S.pubName, sideOpen: 'right' }));
  flat(B, 112, -30, 130, -6, 'tarmac', 0.004, 0xd0d0d0);
  P.car(B, 118, -12, 0, 0x6a6a8a, 'estate');
  P.car(B, 124, -18, 0, 0xc8b888, 'hatch');
  for (const [x, z] of [[96, -24], [101, -26], [106, -24]]) P.picnicTable(B, x, z, 0);
  P.fence(B, 92, -30, 112, -30, { h: 1.1, gates: [{ at: 102, w: 2 }], gateLeaf: false });
  P.fence(B, 92, -30, 92, -19, { h: 1.1 });
}

function cottages(B, S, zone) {
  // a pair of whitewashed cottages on the main road west of town
  zone(S.cottages, -108, -30, -80, -4);
  for (const [x0, seed, mirror] of [[-106, 41, false], [-92, 43, true]]) {
    B.withFrame(B.frame.sub(x0 + 6.5, -9, 2), () => terraceHouse(B, { w: 6.5, d: 8, wall: 'render', wallTint: 0xf4f2ea, roofMat: 'tiles', seed, mirror, sideWindows: true }));
    P.wall(B, x0 - 1, -8.6, x0 + 7.5, -8.6, { h: 0.8, mat: 'stone', cap: 'stone', kind: 'stone', gates: [{ at: mirror ? x0 + 1.85 : x0 + 4.65, w: 1.3 }] });
    B.grass(x0 - 1, -26, x0 + 7.5, -17);
    P.fence(B, x0 - 1, -26, x0 - 1, -17, { h: 1.2 });
    P.fence(B, x0 + 7.5, -26, x0 + 7.5, -17, { h: 1.2 });
    P.fence(B, x0 - 1, -26, x0 + 7.5, -26, { h: 1.2, gates: [{ at: x0 + 3, w: 1.1 }] });
    P.shed(B, x0 + 4.8, -25.5, 0, 2.2, 2.2);
  }
  P.busShelter(B, -80, -5.3, 2);
  P.postBox(B, -86, -4.6);
  P.tree(B, -84, -22, 1.1);
}

function outerFields(B, S, zone, rnd) {
  // beyond the ring road: open grazing land, a few copses
  for (const [cx, cz, n] of [[-170, -120, 12], [168, -110, 10], [-168, -60, 6], [170, -55, 7]]) {
    for (let i = 0; i < n; i++) P.tree(B, cx + (rnd() - 0.5) * 24, cz + (rnd() - 0.5) * 22, 0.9 + rnd() * 0.6, { kind: i % 3 === 0 ? 'conifer' : 'oak' });
  }
  for (let i = 0; i < 10; i++) P.hayBale(B, (i % 2 ? 1 : -1) * (152 + rnd() * 42), -140 + rnd() * 100, i % 2);
  P.hedge(B, -196, -92, -146, -91.2, 1.9);
  P.hedge(B, 146, -92, 196, -91.2, 1.9);
  zone('Outer Fields', -200, -150, -144, -30);
  zone('Outer Fields', 144, -150, 200, -30);
}

// ---------------------------------------------------------------- team depots

function depot(B, team, zone) {
  // authored for the west (Opus) depot; the east one is the same plan rotated
  const T = TEAMS[team];
  zone(`${T.name} Depot`, -200, -30, -146, 30);
  flat(B, -198, -28, -150, -3.5, 'concrete', 0.006, 0xc8c8c0);
  flat(B, -198, 3.5, -150, 28, 'concrete', 0.006, 0xc8c8c0);
  // two open-fronted hangars facing the road
  for (const zf of [-14, 14]) {
    const r = zf < 0 ? 2 : 0;
    B.withFrame(B.frame.sub(zf < 0 ? -158 : -186, zf, r), () => {
      building(B, {
        w: 28,
        d: 12,
        floors: 1,
        fh: 6.5,
        T: 0.3,
        base: 0.05,
        wall: 'metal',
        wallTint: 0x6a7058,
        inner: 'metal',
        innerTint: 0x7a8068,
        floorMat: ['concrete'],
        lintels: false,
        openings: [{ side: 'front', kind: 'arch', at: 14, w: 24, h: 5.5 }],
        roof: { mat: 'slate', pitch: 14, tint: 0x6a7058 },
        band: false,
        furnish: (B2) => {
          P.crate(B2, 2, 10.5, 1.2, 1.2);
          P.crate(B2, 3.4, 10.5, 1.2, 1.2);
          P.crate(B2, 2.7, 10.5, 1.0, 1.0, 1.2);
          for (const x of [24, 25, 26]) P.barrel(B2, x, 10.8);
        },
      });
    });
  }
  // sandbag walls
  for (const [x0, z0, x1, z1] of [[-150, -28, -150, -12], [-150, 12, -150, 28], [-176, -8, -170, -8], [-176, 8, -170, 8]]) {
    const alongX = x1 - x0 > z1 - z0;
    const len = alongX ? x1 - x0 : z1 - z0;
    for (let i = 0; i < Math.ceil(len / 3); i++) {
      const a = (alongX ? x0 : z0) + i * 3;
      const b = Math.min(alongX ? x1 : z1, a + 3);
      B.destructible({ hp: 180, debris: 'hay' }, () => {
        if (alongX) B.box(a, 0, z0 - 0.45, b, 1.1, z0 + 0.45, 'gravel', { tint: 0xb8a070, kind: 'foliage' });
        else B.box(x0 - 0.45, 0, a, x0 + 0.45, 1.1, b, 'gravel', { tint: 0xb8a070, kind: 'foliage' });
      });
    }
  }
  // flag pole in team colours
  B.cylinder(-160, 0, -6, 0.08, 9, 'metal', { tint: 0xd8d8d8, segments: 6, collide: true });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshLambertMaterial({ color: T.hex, side: THREE.DoubleSide }));
  B.mesh(flag, -158.8, 8.2, -6, 0);
  for (const [x, z] of [[-196, -26], [-195.2, -26.4], [-196, 26], [-152, -26], [-152.6, -26.6]]) P.barrel(B, x, z);
}

// ---------------------------------------------------------------- the edge of the map

function mapEdge(B) {
  const { minX, maxX, minZ, maxZ } = MAP_BOUNDS;
  P.hedge(B, minX - 1, minZ - 1, maxX + 1, minZ, 3.6, { solid: true });
  P.hedge(B, minX - 1, maxZ, maxX + 1, maxZ + 1, 3.6, { solid: true });
  P.hedge(B, minX - 1, minZ, minX, -4, 3.6, { solid: true });
  P.hedge(B, minX - 1, 4, minX, maxZ, 3.6, { solid: true });
  P.hedge(B, maxX, minZ, maxX + 1, -4, 3.6, { solid: true });
  P.hedge(B, maxX, 4, maxX + 1, maxZ, 3.6, { solid: true });
  for (const s of [-1, 1]) {
    const x = s * (maxX + 0.5);
    for (let z = -3.4; z < 3.4; z += 1.7) {
      B.box(x - 0.1, 0.25, z, x + 0.1, 0.95, z + 1.5, 'paint', { tint: 0xd82020, kind: 'metal' });
      B.box(x - 0.11, 0.5, z + 0.3, x + 0.11, 0.7, z + 1.2, 'white', { collide: false });
    }
  }
  P.clip(B, minX - 2, minZ - 5, minX - 1, maxZ + 5, 40);
  P.clip(B, maxX + 1, minZ - 5, maxX + 2, maxZ + 5, 40);
  P.clip(B, minX - 5, minZ - 2, maxX + 5, minZ - 1, 40);
  P.clip(B, minX - 5, maxZ + 1, maxX + 5, maxZ + 2, 40);
}
