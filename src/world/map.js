// "Little Clawdington" - a small British town centre.
//
// Layout (x east, z south, metres):
//   West car park (Opus spawn) | High Street with shops, pub & terraces | Rec ground (Sonnet spawn)
//   Behind each side of the High Street: back gardens, a back lane, then a fringe
//   (allotments / church / bungalows to the north, playground / village green /
//   bungalows to the south). The north half is authored once and the south half
//   is the same plan rotated 180 degrees with different buildings, so neither
//   team gets an advantage.

import * as THREE from 'three';
import { Frame } from './builder.js';
import { terraceHouse, shop, pub, bungalow, hall, church, building, furn, table } from './buildings.js';
import * as P from './props.js';
import { mulberry32 } from '../util.js';
import { buildCountryside, MAP_BOUNDS, TOWN_BOUNDS } from './countryside.js';

export const BOUNDS = MAP_BOUNDS;
export const TOWN = TOWN_BOUNDS;
const TOWN_EDGE = { minX: -62, maxX: 62, minZ: -46, maxZ: 46 };

export function buildTown(B) {
  const zones = [];
  const zone = (name, x0, z0, x1, z1) => {
    const wb = B.worldBox(x0, 0, z0, x1, 0, z1);
    zones.push({ name, x0: wb[0], z0: wb[2], x1: wb[3], z1: wb[5] });
  };

  ground(B);
  highStreet(B, zone);

  // North half in its own frame, south half rotated 180 degrees.
  B.withFrame(new Frame(0, 0, 0), () => townSide(B, NORTH, zone));
  B.withFrame(new Frame(0, 0, 2), () => townSide(B, SOUTH, zone));

  westSpawn(B, zone);
  eastSpawn(B, zone);
  B.withFrame(new Frame(0, 0, 0), () => townHedge(B));
  B.withFrame(new Frame(0, 0, 2), () => townHedge(B));
  buildCountryside(B, zone);
  backdrop(B);

  const pickups = [
    { type: 'health', pos: [0, 0.15, 11.5] }, // pharmacy
    { type: 'health', pos: [0, 2.8, -12.0] }, // chippy flat
    { type: 'health', pos: [-15.5, 0.15, -9.5] }, // pub
    { type: 'health', pos: [15.5, 0.15, 9.5] }, // post office
    { type: 'health', pos: [-4.0, 0.15, -37.5] }, // church
    { type: 'health', pos: [-2.0, 0.66, 40.0] }, // bandstand
    { type: 'health', pos: [-36.0, 0.0, -36.5] }, // allotments
    { type: 'health', pos: [35.7, 0.15, 39.3] }, // village hall
    { type: 'ammo', pos: [0, 0, -28] },
    { type: 'ammo', pos: [0, 0, 28] },
    { type: 'ammo', pos: [-23, 0, -40] },
    { type: 'ammo', pos: [23, 0, 40] },
  ];
  // countryside pickups, mirrored for the other half
  for (const [type, x, y, z] of [
    ['health', -108.4, 0.15, -107], // farmhouse
    ['health', 53, 0.15, -121], // fuel station kiosk
    ['health', 100.5, 0.15, -11.5], // country pub
    ['ammo', 3, 0.05, -67], // pillbox
    ['ammo', -80, 0.05, -136], // barn
    ['ammo', -165, 0.05, -20], // depot hangar
    ['health', -180, 0.05, -20], // depot hangar
  ]) {
    pickups.push({ type, pos: [x, y, z] });
    pickups.push({ type, pos: [-x, y, -z] });
  }

  const spawns = [[], []];
  // face each spawn towards the nearest way into town (high street or a back lane)
  const exits = [[-46, 0], [-46, -28], [-46, 28]];
  for (let i = 0; i < 12; i++) {
    const z = -18 + (i % 6) * 7.2 + (i < 6 ? 0 : 3.6);
    const x = i < 6 ? -55.5 : -52.5;
    const [ex, ez] = exits.reduce((b, e) => (Math.hypot(e[0] - x, e[1] - z) < Math.hypot(b[0] - x, b[1] - z) ? e : b));
    const yaw = Math.atan2(-(ex - x), -(ez - z));
    spawns[0].push({ pos: [x, 0, z], yaw });
    spawns[1].push({ pos: [-x, 0, -z], yaw: yaw + Math.PI });
  }

  // vehicles start at each team's depot; jets start already airborne
  const vehicleSpawns = [
    { tank: [{ pos: [-168, 0, -5], yaw: -Math.PI / 2 }, { pos: [-168, 0, 5], yaw: -Math.PI / 2 }], jet: [{ pos: [-330, 150, -25], yaw: -Math.PI / 2 }, { pos: [-330, 165, 25], yaw: -Math.PI / 2 }] },
    { tank: [{ pos: [168, 0, 5], yaw: Math.PI / 2 }, { pos: [168, 0, -5], yaw: Math.PI / 2 }], jet: [{ pos: [330, 150, 25], yaw: Math.PI / 2 }, { pos: [330, 165, -25], yaw: Math.PI / 2 }] },
  ];

  return { zones, pickups, spawns, vehicleSpawns, bounds: BOUNDS, town: TOWN, hills: B.hills || [] };
}

// ---------------------------------------------------------------- ground & roads

function ground(B) {
  // collision ground for the whole playable area (and well beyond, for low-flying jets)
  B.box(-1000, -1, -1000, 1000, 0, 1000, null, { render: false, kind: 'ground' });
  // visual ground plane stretching out to the horizon (slightly sunk to avoid z-fighting)
  B.quad([[-1600, -0.015, 1600], [1600, -0.015, 1600], [1600, -0.015, -1600], [-1600, -0.015, -1600]], 'ground', { tint: 0xe8f0d8 });
}

function flat(B, x0, z0, x1, z1, mat, y = 0.006, tint) {
  B.quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], mat, { tint });
  if (!mat.startsWith('line')) B.surface(x0, z0, x1, z1, mat);
}

function pavement(B, x0, z0, x1, z1, kerbSide) {
  B.surface(x0, z0, x1, z1, 'paving');
  B.box(x0, 0, z0, x1, 0.12, z1, 'paving', { kind: 'stone', faces: kerbSide ? { [kerbSide]: 'kerb', px: 'kerb', nx: 'kerb' } : {} });
}

function highStreet(B, zone) {
  flat(B, -63, -3.5, 63, 3.5, 'tarmac', 0.004);
  // pavements with gaps at the side-road mouths
  pavement(B, -48, -6, -26, -3.5, 'pz');
  pavement(B, -20, -6, 48, -3.5, 'pz');
  pavement(B, -48, 3.5, 20, 6, 'nz');
  pavement(B, 26, 3.5, 48, 6, 'nz');
  // centre line dashes, broken at the zebra crossing
  for (let x = -60; x < 60; x += 6) {
    if (Math.abs(x + 1.5) < 6) continue;
    flat(B, x, -0.06, x + 3, 0.06, 'lineWhite', 0.012);
  }
  // double yellow lines along stretches of kerb
  for (const [x0, x1] of [[-46, -27], [-19, -8], [8, 19], [27, 46]]) {
    for (const s of [-1, 1]) {
      flat(B, x0, s * 3.38 - 0.05, x1, s * 3.38 + 0.05, 'lineYellow', 0.012);
      flat(B, x0, s * 3.2 - 0.05, x1, s * 3.2 + 0.05, 'lineYellow', 0.012);
    }
  }
  // zebra crossing + beacons
  for (let z = -3.25; z < 3.3; z += 1.0) flat(B, -1.6, z, 1.6, z + 0.5, 'lineWhite', 0.012);
  for (const sx of [-2.1, 2.1]) {
    flat(B, sx - 0.06, -3.5, sx + 0.06, 3.5, 'lineWhite', 0.012);
  }
  P.belisha(B, -1.9, -4.1);
  P.belisha(B, 1.9, 4.1);
  P.belisha(B, 1.9, -4.1);
  P.belisha(B, -1.9, 4.1);
  zone('High Street', -48, -6, 48, 6);
  zone('Zebra Crossing', -4, -3.5, 4, 3.5);

  // parked cars along the kerbs (cover in the street)
  const cars = [
    [-36, -2.45, 1, 0x2a4a8a, 'hatch'],
    [-12, -2.45, 1, 0xd8d8d0, 'estate'],
    [14, -2.45, 1, 0x1a1a1a, 'hatch'],
    [31, -2.45, 1, 0x6a8a3a, 'van'],
    [36, 2.45, 3, 0x8a1c1c, 'hatch'],
    [12, 2.45, 3, 0x9aa0a8, 'estate'],
    [-14, 2.45, 3, 0x2a6a8a, 'hatch'],
    [-31, 2.45, 3, 0xe8e0c8, 'van'],
  ];
  for (const [x, z, r, c, t] of cars) P.car(B, x, z, r, c, t);
}

// ---------------------------------------------------------------- one side of town

const NORTH = {
  name: 'North',
  row: [
    { x0: -46, W: 8, type: 'shop', name: 'VILLAGE STORES', sub: 'GROCERIES · NEWS · OFF LICENCE', signBg: '#1d3f6e', board: 0x1d3f6e, wall: 'brickBuff', seed: 1 },
    { x0: -38, W: 6, type: 'terrace', seed: 2, mirror: false },
    { x0: -32, W: 6, type: 'terrace', seed: 3, mirror: true, sideWindows: true },
    { x0: -20, W: 14, type: 'pub' },
    { x0: -4, W: 8, type: 'shop', name: 'THE CODFATHER', sub: 'FISH & CHIPS', signBg: '#0f4a6a', board: 0x0f4a6a, wall: 'render', wallTint: 0xd8e8f0, seed: 4, mirror: true },
    { x0: 4, W: 6, type: 'terrace', seed: 5 },
    { x0: 10, W: 6, type: 'terrace', seed: 6, mirror: true, wall: 'brickDark' },
    { x0: 16, W: 6, type: 'terrace', seed: 7 },
    { x0: 24, W: 6.5, type: 'terrace', seed: 8, wall: 'pebbledash', mirror: true, sideWindows: true },
    { x0: 30.5, W: 6.5, type: 'terrace', seed: 9, wall: 'pebbledash' },
    { x0: 37, W: 9, type: 'shop', name: "BOB'S NEWS", sub: 'PAPERS · SWEETS · LOTTERY', signBg: '#6a1a1a', board: 0x6a1a1a, seed: 10, mirror: true },
  ],
  fences: [
    // x, from (building back), kind, height
    [-46, -16, 'wall', 1.8],
    [-38, -16, 'fence', 1.8],
    [-32, -14, 'fence', 1.8],
    [-26, -14, 'wall', 1.8],
    [-20, -17, 'wall', 1.1],
    [-6, -17, 'fence', 1.1],
    [-4, -16, 'fence', 1.8],
    [4, -16, 'fence', 1.8],
    [10, -14, 'fence', 1.8],
    [16, -14, 'fence', 1.2],
    [22, -14, 'fence', 1.8],
    [24, -14, 'fence', 1.8],
    [30.5, -14, 'fence', 1.2],
    [37, -16, 'fence', 1.8],
    [46, -16, 'wall', 1.8],
  ],
  backs: [
    // x0, x1, gate centre, kind, height, garden type
    [-46, -38, -42, 'wall', 1.8, 'yard'],
    [-38, -32, -35, 'fence', 1.8, 'lawn'],
    [-32, -26, -29, 'fence', 1.8, 'lawn'],
    [-20, -6, -13, 'wall', 1.1, 'beer'],
    [-4, 4, 0, 'wall', 1.8, 'yard'],
    [4, 10, 7, 'fence', 1.8, 'lawn'],
    [10, 16, 13, 'fence', 1.8, 'shed'],
    [16, 22, 19, 'fence', 1.2, 'lawn'],
    [24, 30.5, 27.25, 'fence', 1.8, 'greenhouse'],
    [30.5, 37, 33.75, 'fence', 1.2, 'lawn'],
    [37, 46, 41.5, 'wall', 1.8, 'yard'],
  ],
  lane: 'Church Lane',
  fringe: northFringe,
};

const SOUTH = {
  name: 'South',
  row: [
    { x0: -46, W: 8, type: 'shop', name: 'COPPER KETTLE', sub: 'TEAROOM · CAKES · CREAM TEAS', signBg: '#5a3a1a', board: 0x5a3a1a, wall: 'render', wallTint: 0xf0e0c8, seed: 11, counter: 0xd8c8a8 },
    { x0: -38, W: 6, type: 'terrace', seed: 12, mirror: true, wall: 'brickDark' },
    { x0: -32, W: 6, type: 'terrace', seed: 13, sideWindows: true },
    { x0: -20, W: 7, type: 'shop', name: 'POST OFFICE', sub: 'STAMPS · PARCELS · CASH', signBg: '#b81c1c', board: 0xb81c1c, border: '#f2c418', seed: 14, sideWindow: true, mirror: true },
    { x0: -13, W: 7, type: 'shop', name: 'CRUST & CRUMB', sub: 'BAKERS SINCE 1923', signBg: '#3a2a1a', board: 0x3a2a1a, wall: 'brickBuff', seed: 15 },
    { x0: -4, W: 8, type: 'shop', name: 'PHARMACY', sub: 'PRESCRIPTIONS · FIRST AID', signBg: '#127a3a', board: 0x127a3a, border: '#e8f0e8', wall: 'brick', seed: 16, shelf: 0xf4f8f4 },
    { x0: 4, W: 6, type: 'terrace', seed: 17, mirror: true },
    { x0: 10, W: 6, type: 'terrace', seed: 18, wall: 'render', wallTint: 0xf0e8d0 },
    { x0: 16, W: 6, type: 'terrace', seed: 19, mirror: true },
    { x0: 24, W: 6.5, type: 'terrace', seed: 20, wall: 'brickBuff', sideWindows: true, mirror: true },
    { x0: 30.5, W: 6.5, type: 'terrace', seed: 21, wall: 'brickBuff' },
    { x0: 37, W: 9, type: 'shop', name: 'SHORT BACK & SIDES', sub: 'GENTS BARBER', signBg: '#1a1a1a', board: 0x1a1a1a, border: '#d8d8d8', seed: 22, mirror: true, fridges: false },
  ],
  fences: [
    [-46, -16, 'wall', 1.8],
    [-38, -16, 'fence', 1.8],
    [-32, -14, 'fence', 1.2],
    [-26, -14, 'wall', 1.8],
    [-20, -16, 'wall', 1.8],
    [-13, -16, 'wall', 1.8],
    [-6, -16, 'wall', 1.8],
    [-4, -16, 'fence', 1.8],
    [4, -16, 'fence', 1.8],
    [10, -14, 'fence', 1.2],
    [16, -14, 'fence', 1.8],
    [22, -14, 'fence', 1.8],
    [24, -14, 'fence', 1.8],
    [30.5, -14, 'fence', 1.8],
    [37, -16, 'fence', 1.2],
    [46, -16, 'wall', 1.8],
  ],
  backs: [
    [-46, -38, -42, 'wall', 1.8, 'yard'],
    [-38, -32, -35, 'fence', 1.8, 'shed'],
    [-32, -26, -29, 'fence', 1.2, 'lawn'],
    [-20, -13, -16.5, 'wall', 1.8, 'yard'],
    [-13, -6, -9.5, 'wall', 1.8, 'yard'],
    [-4, 4, 0, 'wall', 1.8, 'yard'],
    [4, 10, 7, 'fence', 1.8, 'lawn'],
    [10, 16, 13, 'fence', 1.2, 'greenhouse'],
    [16, 22, 19, 'fence', 1.8, 'shed'],
    [24, 30.5, 27.25, 'fence', 1.8, 'lawn'],
    [30.5, 37, 33.75, 'fence', 1.8, 'shed'],
    [37, 46, 41.5, 'wall', 1.8, 'yard'],
  ],
  lane: 'Station Road',
  fringe: southFringe,
};

function townSide(B, cfg, zone) {
  const isSouth = cfg === SOUTH;
  for (const p of cfg.row) {
    B.withFrame(B.frame.sub(p.x0 + p.W, -6, 2), () => {
      if (p.type === 'terrace') {
        terraceHouse(B, { w: p.W, mirror: p.mirror, seed: p.seed, wall: p.wall, wallTint: p.wallTint, sideWindows: p.sideWindows, roofMat: p.seed % 3 === 0 ? 'tiles' : 'slate' });
      } else if (p.type === 'shop') {
        shop(B, {
          w: p.W,
          name: p.name,
          sub: p.sub,
          signBg: p.signBg,
          frameTint: p.board,
          border: p.border,
          wall: p.wall,
          wallTint: p.wallTint,
          seed: p.seed,
          mirror: p.mirror,
          sideWindow: p.sideWindow,
          counter: p.counter,
          shelf: p.shelf,
          fridges: p.fridges,
        });
      } else if (p.type === 'pub') {
        pub(B, { name: 'The Red Lion', sideOpen: 'right' });
      }
    });
  }
  // Buildings' names for the location readout.
  for (const p of cfg.row) {
    if (p.type === 'pub') zone('Red Lion', p.x0, -17, p.x0 + p.W, -6);
    else if (p.type === 'shop') zone(titleCase(p.name), p.x0, -16, p.x0 + p.W, -6);
    else zone(`${cfg.name} Terraces`, p.x0, -14, p.x0 + p.W, -6);
  }
  zone(`${cfg.name} Gardens`, -46, -26, 46, -14);
  if (!isSouth) zone('Beer Garden', -20, -26, -6, -17);

  // garden boundaries
  for (const [x, from, kind, h] of cfg.fences) {
    if (kind === 'wall') P.wall(B, x, from, x, -26, { h, mat: 'brick' });
    else P.fence(B, x, from, x, -26, { h });
  }
  for (const [x0, x1, gate, kind, h, type] of cfg.backs) {
    const gates = [{ at: gate, w: type === 'beer' ? 2.2 : 1.15 }];
    if (kind === 'wall') P.wall(B, x0, -26, x1, -26, { h, mat: type === 'beer' ? 'brickDark' : 'brick', gates, piers: type === 'beer' });
    else P.fence(B, x0, -26, x1, -26, { h, gates });
    garden(B, x0, x1, type, gate, isSouth);
  }

  // ginnels: paved paths between the rows
  for (const [x0, x1] of [[-6, -4], [22, 24]]) flat(B, x0, -26, x1, -6, 'paving', 0.006);
  zone('Ginnel', -6, -26, -4, -6);
  zone('Ginnel', 22, -26, 24, -6);

  // side road
  flat(B, -26, -47, -20, -3.5, 'tarmac', 0.005);
  for (let z = -44; z < -8; z += 5) flat(B, -23.06, z, -22.94, z + 2.5, 'lineWhite', 0.012);
  zone(cfg.lane, -26, -46, -20, -6);
  // back lane
  flat(B, -46, -30, -26, -26, 'gravel', 0.005);
  flat(B, -20, -30, 46, -26, 'gravel', 0.005);
  zone(`${cfg.name} Back Lane`, -46, -30, 46, -26);

  // street furniture on this side's pavement (pavement is z -6..-3.5 here)
  for (const x of [-42, -30, -16, -2, 12, 26, 40]) P.lampPost(B, x, -3.85, 2);
  if (!isSouth) {
    P.phoneBox(B, -27.4, -5.0, 0);
    P.postBox(B, 5.0, -4.3);
    P.bench(B, 18.5, -5.3, 2);
    P.wheelieBin(B, -5.5, -5.4, 0, 'green');
    P.fingerpost(B, -20.4, -4.0, 0);
    P.bollard(B, -25.7, -3.9);
    P.bollard(B, -20.3, -3.9);
  } else {
    P.busShelter(B, -33.8, -4.75, 2);
    P.postBox(B, -9.0, -4.3);
    P.bench(B, 8.0, -5.3, 2);
    P.wheelieBin(B, 23.3, -5.4, 0, 'blue');
    P.bollard(B, -25.7, -3.9);
    P.bollard(B, -20.3, -3.9);
    for (const x of [-18.5, -11.5]) P.flowerTub(B, x, -4.2, 0xd84a4a);
  }
  if (!isSouth) for (const x of [-18.6, -7.4]) P.flowerTub(B, x, -4.2, 0xe8c84a);

  // back lane clutter (cover)
  const r = mulberry32(isSouth ? 77 : 33);
  for (const x of [-40.5, -34, -28, 1.8, 9, 15.5, 29, 35.5]) {
    P.wheelieBin(B, x + (r() - 0.5), -26.55, 0, r() < 0.5 ? 'black' : 'green');
  }
  // a builder's skip
  const sx = isSouth ? 12 : -15.5;
  B.box(sx - 1.75, 0, -29.6, sx + 1.75, 1.1, -27.9, 'paint', { tint: 0xd8a818, kind: 'metal' });
  B.box(sx - 1.6, 0.9, -29.45, sx + 1.6, 1.0, -28.05, 'soil', { collide: false });

  cfg.fringe(B, zone);
}

function titleCase(s) {
  return s
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    .replace("'S", "'s");
}

function garden(B, x0, x1, type, gate, isSouth) {
  const r = mulberry32(Math.floor((x0 + 100) * 7 + (isSouth ? 1 : 0)));
  const back = type === 'yard' ? -16 : type === 'beer' ? -17 : -14;
  if (type === 'yard') {
    flat(B, x0, -26, x1, back, 'concrete', 0.006);
    P.wheelieBin(B, x0 + 0.6, -24.9, 0, 'black');
    P.wheelieBin(B, x0 + 1.3, -24.9, 0, 'green');
    P.crate(B, x1 - 1.0, -24.5, 1.0, 1.0);
    P.crate(B, x1 - 1.0, -24.5, 0.8, 0.8, 1.0);
    P.crate(B, x1 - 2.2, -22.5, 1.2, 0.9);
    B.box(x0 + 1.0, 0, -21.5, x0 + 2.2, 0.15, -20.3, 'wood', { tint: 0xb89a6a, kind: 'wood' }); // pallet
    return;
  }
  if (type === 'beer') {
    flat(B, x0, -26, x1, back, 'paving', 0.006, 0xd8d0c0);
    for (const [px, pz] of [[x0 + 2.5, -20], [x0 + 7, -20.5], [x0 + 11.5, -20], [x0 + 4.5, -23.8], [x0 + 9.5, -23.8]]) {
      P.picnicTable(B, px, pz, 0);
    }
    P.flowerTub(B, x0 + 0.6, -25.4, 0xd84a7a);
    P.flowerTub(B, x1 - 0.6, -25.4, 0xd84a7a);
    return;
  }
  // lawns
  B.grass(x0, -26, x1, back);
  flat(B, x0, back - 2.4, x1, back, 'paving', 0.006, 0xe0d8c8);
  flat(B, gate - 0.5, -26, gate + 0.5, back - 2.4, 'paving', 0.006, 0xd0c8b8);
  P.wheelieBin(B, x0 + 0.45, back - 0.45, 0, r() < 0.5 ? 'black' : 'blue');
  if (type === 'shed' || r() < 0.4) {
    const left = gate > (x0 + x1) / 2;
    P.shed(B, left ? x0 + 0.3 : x1 - 2.5, -25.6, 0, 2.2, 2.4, [0x8a6a48, 0x5a7a5a, 0x6a5a4a][Math.floor(r() * 3)]);
  }
  if (type === 'greenhouse') P.greenhouse(B, x1 - 3.0, -21.5, 0, 2.6, 3.4);
  if (r() < 0.7) P.washingLine(B, x0 + 1.0, back - 3.5, x1 - 1.0, back - 5.5);
  if (r() < 0.5) P.tree(B, x0 + 1.4 + r() * (x1 - x0 - 2.8), -24.6, 0.6);
  else P.hedge(B, x0 + 0.1, -25.9, x0 + 1.3, -23.5, 1.4);
}

// ---------------------------------------------------------------- north fringe

function northFringe(B, zone) {
  // ---- allotments
  zone('Allotments', -46, -46, -26, -30);
  P.fence(B, -46, -30, -26, -30, { h: 1.1, gates: [{ at: -40, w: 1.6 }, { at: -31, w: 1.6 }], gateLeaf: false });
  P.fence(B, -26, -46, -26, -30, { h: 1.1, gates: [{ at: -38, w: 1.6 }], gateLeaf: false });
  P.fence(B, -46, -46, -46, -30, { h: 1.1, gates: [{ at: -36, w: 1.8 }], gateLeaf: false });
  flat(B, -46, -38.6, -26, -37.4, 'gravel', 0.006);
  flat(B, -36.6, -46, -35.4, -30, 'gravel', 0.006);
  for (const [x0, z0] of [[-45, -36.6], [-41, -36.6], [-34.6, -36.6], [-30.6, -36.6], [-45, -33.4], [-30.6, -33.4]]) {
    P.raisedBed(B, x0, z0, x0 + 3.2, z0 + 1.4);
  }
  P.raisedBed(B, -34.6, -45.2, -31.4, -43.8);
  P.raisedBed(B, -45.2, -42.0, -42.0, -40.6);
  P.beanPoles(B, -41.0, -32.0, 5);
  P.beanPoles(B, -33.8, -31.8, 4);
  P.shed(B, -40.6, -45.6, 0, 2.2, 2.4, 0x5a7a5a);
  P.shed(B, -29.0, -45.6, 0, 2.2, 2.4, 0x8a6a48);
  P.shed(B, -33.0, -41.6, 0, 2.0, 2.4, 0x6a5a6a);
  P.greenhouse(B, -41.9, -45.5, 1, 2.6, 3.6);
  P.compostBin(B, -27.0, -40.0);
  P.compostBin(B, -27.0, -41.1);
  P.waterButt(B, -37.2, -40.0);
  P.waterButt(B, -34.8, -34.0, 0x1a1a1a);
  P.crate(B, -37.5, -41.5, 0.9, 0.9);

  // ---- St Mary's churchyard
  zone("St Mary's", -20, -46, 8, -30);
  P.wall(B, -20, -30, 8, -30, { h: 1.0, mat: 'stone', cap: 'stone', kind: 'stone', gates: [{ at: -10, w: 1.8 }, { at: 2, w: 1.8 }], piers: true });
  P.wall(B, -20, -46, -20, -30, { h: 1.0, mat: 'stone', cap: 'stone', kind: 'stone', gates: [{ at: -37.5, w: 1.6 }] });
  P.wall(B, 8, -46, 8, -30, { h: 1.0, mat: 'stone', cap: 'stone', kind: 'stone', gates: [{ at: -36, w: 1.6 }] });
  lychgate(B, -10, -30);
  B.withFrame(B.frame.sub(-12, -43, 0), () => church(B, 16));
  zone("St Mary's Church", -17, -43, 4, -34.5);
  flat(B, -10.9, -34.5, -9.1, -30, 'paving', 0.006, 0xd0ccc0);
  flat(B, 1.1, -34.5, 2.9, -30, 'paving', 0.006, 0xd0ccc0);
  const rnd = mulberry32(5);
  let seed = 0;
  for (const z of [-32.6, -31.2]) {
    for (let x = -18.6; x < 7.5; x += 1.45) {
      if (Math.abs(x + 10) < 1.4 || Math.abs(x - 2) < 1.4) continue;
      if (rnd() < 0.25) continue;
      P.headstone(B, x + (rnd() - 0.5) * 0.3, z, 0, seed++);
    }
  }
  for (const x of [5.2, 6.8]) for (let z = -44.5; z < -35; z += 1.6) if (rnd() < 0.7) P.headstone(B, x, z, 1, seed++);
  for (let x = -16; x < 3; x += 1.8) if (rnd() < 0.6) P.headstone(B, x, -44.8, 0, seed++);
  P.tomb(B, -14.5, -32.2, 1);
  P.tomb(B, 5.8, -32.5, 0);
  P.tomb(B, -18.6, -44.4, 0);
  P.tree(B, -18.6, -36.0, 0.9, { kind: 'conifer' });
  P.tree(B, 6.4, -43.8, 0.85, { kind: 'conifer' });
  P.bench(B, -4.0, -30.7, 0);

  // ---- bungalows on the far side of the back lane
  zone(`North Bungalows`, 8, -46, 46, -30);
  const bung = [
    { x0: 11, seed: 3, wall: 'pebbledash' },
    { x0: 23, seed: 6, wall: 'render', mirror: true, wallTint: 0xf0f0e8 },
    { x0: 35, seed: 9, wall: 'brickBuff' },
  ];
  bung.forEach((b, i) => bungalowPlot(B, b, i === bung.length - 1));
  P.fence(B, 46, -46, 46, -30, { h: 1.2, gates: [{ at: -34, w: 1.6 }] });
  P.tree(B, 9.5, -32.5, 0.8);
  P.tree(B, 44.5, -36.0, 0.9);
}

function lychgate(B, x, z) {
  const t = { tint: 0x4a3420, kind: 'wood' };
  for (const dx of [-1.0, 0.85]) {
    for (const dz of [-0.6, 0.45]) B.box(x + dx, 0, z + dz, x + dx + 0.15, 2.3, z + dz + 0.15, 'wood', t);
  }
  B.withFrame(B.frame.sub(x - 1.3, z - 1.0, 0), () => {
    const w = 2.6;
    const d = 2.0;
    const Y = 2.3;
    B.quad([[w, Y, 0], [0, Y, 0], [0, Y + 1.0, d / 2], [w, Y + 1.0, d / 2]], 'tiles', {});
    B.quad([[0, Y, d], [w, Y, d], [w, Y + 1.0, d / 2], [0, Y + 1.0, d / 2]], 'tiles', {});
  });
}

function bungalowPlot(B, b, last) {
  const W = 9;
  B.withFrame(B.frame.sub(b.x0 + W, -31.5, 2), () => bungalow(B, { mirror: b.mirror, seed: b.seed, wall: b.wall, wallTint: b.wallTint }));
  const doorX = b.mirror ? b.x0 + 4.6 : b.x0 + W - 4.6;
  P.wall(B, b.x0 - 1.4, -30.25, b.x0 + W + 1.4, -30.25, { h: 0.7, mat: 'brick', gates: [{ at: doorX, w: 1.3 }] });
  flat(B, doorX - 0.6, -31.5, doorX + 0.6, -30.25, 'paving', 0.006);
  // back garden
  B.grass(b.x0 - 1.5, -46, b.x0 + W + 1.5, -39.5);
  P.fence(B, b.x0 - 1.5, -46, b.x0 - 1.5, -39.5, { h: 1.8 });
  if (!last) P.fence(B, b.x0 + W + 1.5, -46, b.x0 + W + 1.5, -39.5, { h: 1.8 });
  // side passages with gates into the back gardens
  P.fence(B, b.x0 - 1.5, -39.5, b.x0, -39.5, { h: 1.8, gates: [{ at: b.x0 - 0.75, w: 1.2 }] });
  P.fence(B, b.x0 + W, -39.5, b.x0 + W + 1.5, -39.5, { h: 1.8, gates: [{ at: b.x0 + W + 0.75, w: 1.2 }] });
  P.shed(B, b.x0 + 0.5, -45.6, 0, 2.2, 2.4, 0x7a6a4a);
  P.washingLine(B, b.x0 + 3.5, -42, b.x0 + 8, -44);
  P.wheelieBin(B, b.x0 + W - 0.6, -40.2, 0, 'black');
  if (b.seed % 2) P.tree(B, b.x0 + 7.5, -44.5, 0.7);
}

// ---------------------------------------------------------------- south fringe (authored in north coordinates)

function southFringe(B, zone) {
  // ---- playground and village hall (mirrors the allotments)
  zone('Playground', -46, -46, -26, -30);
  P.fence(B, -46, -30, -26, -30, { h: 1.1, mat: 'paint', tint: 0x2a5a3a, gates: [{ at: -40, w: 1.8 }, { at: -29, w: 1.8 }], gateLeaf: false });
  P.hedge(B, -26.5, -46, -25.5, -39, 1.3);
  P.hedge(B, -26.5, -37, -25.5, -30.5, 1.3);
  P.fence(B, -46, -46, -46, -30, { h: 1.1, mat: 'paint', tint: 0x2a5a3a, gates: [{ at: -36, w: 1.8 }], gateLeaf: false });
  B.withFrame(B.frame.sub(-31, -36, 2), () => {
    hall(B, {
      w: 13,
      d: 9,
      wall: 'brickBuff',
      radar: 'building',
      openings: [
        { side: 'front', kind: 'door', at: 3.0, w: 1.3, color: 0x1d3f6e },
        { side: 'front', kind: 'window', at: 6.2, w: 1.6, h: 1.4 },
        { side: 'front', kind: 'window', at: 10.0, w: 1.6, h: 1.4 },
        { side: 'back', kind: 'window', at: 10.5, w: 1.4, h: 1.2, sill: 1.4 },
        { side: 'back', kind: 'window', at: 3.5, w: 1.6, h: 1.4 },
        { side: 'back', kind: 'window', at: 7.0, w: 1.6, h: 1.4 },
        { side: 'left', kind: 'door', at: 3.0, w: 1.2, color: 0x1d3f6e },
        { side: 'right', kind: 'door', at: 4.5, w: 1.2, color: 0x1d3f6e },
      ],
      roof: { mat: 'slate', pitch: 28, chimneys: [] },
      sign: { text: 'VILLAGE HALL', sub: 'BINGO TUESDAYS · JUMBLE SALE SAT', bg: '#1d3f6e', board: 0x1d3f6e, x0: 4.2, x1: 12.6, y0: 2.45, y1: 3.15 },
      furnish: (B2, ctx) => {
        const by = ctx.base;
        // stage at the far end with steps
        furn(B2, 0.25, 0, 6.2, 8.5, by + 0.55, 8.75, 'floorboards', 0x8a6a4a);
        furn(B2, 5.5, 0, 5.8, 7.5, by + 0.27, 6.2, 'floorboards', 0x8a6a4a);
        for (const [tx, tz] of [[3.0, 2.2], [6.5, 2.2], [10.0, 2.2], [3.0, 4.4], [10.0, 4.4]]) table(B2, tx - 0.9, tz - 0.45, tx + 0.9, tz + 0.45, by, 0.74, 0xc8c0b0);
        furn(B2, 11.4, by, 0.3, 12.7, by + 1.4, 1.0, 'paint', 0x6a6a6a, 'metal'); // stacked chairs
      },
    });
  });
  P.swings(B, -40, -33.2, 0);
  P.slide(B, -34, -33.6, 0);
  B.cylinder(-29, 0, -34.5, 1.3, 0.35, 'paint', { tint: 0xc83a2a, segments: 12, collide: true, kind: 'metal' });
  B.cylinder(-29, 0.35, -34.5, 0.08, 0.9, 'paint', { tint: 0xd8a020, segments: 6, collide: false });
  P.bench(B, -44.5, -35.5, 3);
  P.bench(B, -27.6, -42.5, 1);
  P.tree(B, -28.5, -44.5, 0.9);

  // ---- village green (mirrors the churchyard)
  zone('Village Green', -20, -46, 8, -30);
  P.hedge(B, -20, -30.6, -11, -29.8, 1.1);
  P.hedge(B, -8.5, -30.6, 0.5, -29.8, 1.1);
  P.hedge(B, 3.5, -30.6, 8, -29.8, 1.1);
  P.hedge(B, -20.4, -46, -19.6, -39, 1.2);
  P.hedge(B, -20.4, -36.5, -19.6, -30.6, 1.2);
  P.hedge(B, 7.6, -46, 8.4, -38, 1.4);
  P.hedge(B, 7.6, -35.5, 8.4, -30.6, 1.4);
  P.memorial(B, -6, -37.5);
  P.bandstand(B, 2, -40);
  // duck pond
  B.cylinder(-14, 0, -40.5, 3.2, 0.02, 'water', { segments: 16, tint: 0xa8c8d0 });
  B.cylinder(-14, -0.02, -40.5, 3.45, 0.06, 'stone', { segments: 16, cap: false });
  for (const [tx, tz, s] of [[-17.5, -35, 1.1], [-9.5, -44.5, 1.0], [5.5, -33.5, 0.9], [-1.5, -33.0, 0.75], [-12.5, -34.5, 0.8]]) P.tree(B, tx, tz, s);
  for (const [bx, bz, r] of [[-6, -33.5, 0], [-10, -37.5, 1], [-2, -37.5, 3], [-14, -36.6, 0]]) P.bench(B, bx, bz, r);
  flat(B, -9.25, -36.0, -2.75, -30, 'gravel', 0.006);

  // ---- bungalows
  zone('South Bungalows', 8, -46, 46, -30);
  const bung = [
    { x0: 11, seed: 4, wall: 'brick' },
    { x0: 23, seed: 7, wall: 'pebbledash', mirror: true },
    { x0: 35, seed: 1, wall: 'render', wallTint: 0xe8e0d0 },
  ];
  bung.forEach((b, i) => bungalowPlot(B, b, i === bung.length - 1));
  P.fence(B, 46, -46, 46, -30, { h: 1.2, gates: [{ at: -34, w: 1.6 }] });
  P.tree(B, 9.5, -32.5, 0.8);
  P.tree(B, 44.5, -36.0, 0.9);
}

// ---------------------------------------------------------------- spawns

function westSpawn(B, zone) {
  zone('Car Park', -62, -46, -46, 46);
  flat(B, -61, -24, -47, -3.5, 'tarmac', 0.004, 0xd8d8d8);
  flat(B, -61, 3.5, -47, 24, 'tarmac', 0.004, 0xd8d8d8);
  // bay markings
  for (let z = -22; z <= 22; z += 2.8) {
    if (Math.abs(z) < 4.5) continue;
    flat(B, -61, z - 0.05, -56.5, z + 0.05, 'lineWhite', 0.012);
    flat(B, -51.5, z - 0.05, -47.5, z + 0.05, 'lineWhite', 0.012);
  }
  const cars = [
    [-58.8, -19.6, 3, 0x3a3a6a, 'hatch'],
    [-58.8, -11.2, 3, 0xb8b8b0, 'estate'],
    [-58.8, 8.4, 3, 0x6a1a1a, 'hatch'],
    [-58.8, 16.8, 3, 0x2a5a2a, 'van'],
    [-49.5, -16.8, 1, 0xd8c8a0, 'hatch'],
    [-49.5, 11.2, 1, 0x1a1a1a, 'estate'],
  ];
  for (const [x, z, r, c, t] of cars) P.car(B, x, z, r, c, t);
  // public toilets block (closed)
  B.withFrame(B.frame.sub(-61, 27, 0), () => {
    building(B, {
      w: 6,
      d: 4,
      floors: 1,
      fh: 2.6,
      wall: 'brickDark',
      interior: false,
      openings: [
        { side: 'back', kind: 'blind', at: 1.5, w: 1.0, h: 2.0, sill: 0 },
        { side: 'back', kind: 'blind', at: 4.5, w: 1.0, h: 2.0, sill: 0 },
      ],
      roof: { type: 'flat' },
      band: false,
    });
  });
  P.bottleBank(B, -60.3, -22.8, 0, 0x2d6a3a);
  P.bottleBank(B, -58.4, -22.8, 0, 0x2a4a8a);
  P.bottleBank(B, -56.5, -22.8, 0, 0x6a6a6a);
  // pay & display
  B.box(-53.8, 0, 4.6, -53.3, 1.5, 5.0, 'paint', { tint: 0x2a4a8a, kind: 'metal' });
  for (const [x, z] of [[-54, -40], [-58, -32], [-50, -36], [-52, 34], [-58, 40], [-48.5, 40]]) P.tree(B, x, z, 0.9 + ((x * z) % 3) * 0.1);
  P.hedge(B, -61.5, -24.6, -57, -24, 1.0);
  P.hedge(B, -54, -24.6, -48.5, -24, 1.0);
  P.hedge(B, -61.5, 24, -57, 24.6, 1.0);
  P.hedge(B, -54, 24, -48.5, 24.6, 1.0);
  P.bench(B, -55, -30, 0);
  P.bench(B, -55, 31, 2);
  P.picnicTable(B, -51, -42, 1);
  P.picnicTable(B, -51, 43, 1);
  // planters at the car park entrance
  for (const z of [-4.6, 4.6]) {
    B.box(-47.6, 0, z - 0.6, -46.4, 0.6, z + 0.6, 'brick', {});
    B.geometry(new THREE.IcosahedronGeometry(0.6, 1), 'leaves', -47, 0.95, z, { tint: 0x5a9a4a });
  }
  // sign
  P.fingerpost(B, -47.5, -7.0, 0);
}

function eastSpawn(B, zone) {
  zone('Rec Ground', 46, -46, 62, 46);
  B.withFrame(B.frame.sub(55, 37, 3), () => {
    hall(B, {
      w: 10,
      d: 6,
      fh: 3.0,
      wall: 'render',
      wallTint: 0xf6f4ee,
      inside: 0xf0ead8,
      frameTint: 0x2a5a3a,
      lintels: false,
      openings: [
        { side: 'front', kind: 'door', at: 5.0, w: 1.4, color: 0x2a5a3a, frameMat: 'paint', frameTint: 0x2a5a3a },
        { side: 'front', kind: 'window', at: 2.2, w: 2.0, h: 1.3 },
        { side: 'front', kind: 'window', at: 7.8, w: 2.0, h: 1.3 },
        { side: 'back', kind: 'door', at: 8.0, w: 1.1, color: 0x2a5a3a },
        { side: 'left', kind: 'window', at: 3.0, w: 1.2 },
        { side: 'right', kind: 'window', at: 3.0, w: 1.2 },
      ],
      roof: { mat: 'tiles', pitch: 30, tint: 0x9ab09a },
      sign: { text: 'CRICKET CLUB', sub: 'EST. 1887', bg: '#2a5a3a', board: 0x2a5a3a, x0: 3.0, x1: 7.0, y0: 2.45, y1: 2.95 },
      furnish: (B2, ctx) => {
        const by = ctx.base;
        table(B2, 3.5, 2.5, 6.5, 3.5, by, 0.76, 0x9a7a52);
        furn(B2, 0.3, by, 4.8, 3.0, by + 0.9, 5.7, 'wood', 0x7a5a3a);
      },
    });
    // veranda
    for (const x of [0.2, 3.4, 6.6, 9.6]) B.box(x, 0, -1.9, x + 0.15, 2.9, -1.75, 'white', { kind: 'wood' });
    B.box(-0.2, 2.9, -2.2, 10.2, 3.05, 0, 'white', { tint: 0xe8e8e0 });
    B.box(-0.2, 0, -2.2, 10.2, 0.15, 0, 'floorboards', { tint: 0x9a8a6a });
  });
  // sightscreen (big white cover board) and other cover
  B.box(58.5, 0, -10, 59.0, 2.6, -5, 'white', { kind: 'wood' });
  B.box(58.5, 0, 6, 59.0, 2.6, 11, 'white', { kind: 'wood' });
  P.hedge(B, 48.5, 24, 54, 24.6, 1.0);
  P.hedge(B, 57, 24, 61.5, 24.6, 1.0);
  P.hedge(B, 48.5, -24.6, 54, -24, 1.0);
  P.hedge(B, 57, -24.6, 61.5, -24, 1.0);
  P.hedge(B, 49.5, -14, 51.5, -10, 1.6);
  P.hedge(B, 49.5, 10, 51.5, 14, 1.6);
  P.shed(B, 57.5, -21.5, 0, 3.0, 2.6, 0x3a5a3a);
  B.cylinder(54, 0.35, -19.5, 0.35, 1.4, 'metal', { segments: 10, collide: false, tint: 0x4a6a4a });
  B.box(53.3, 0, -20.0, 54.7, 0.7, -19.0, null, { render: false, kind: 'metal' });
  P.goalPosts(B, 60.5, 0, 1);
  for (const [x, z] of [[54, -40], [58, -32], [50, -36], [52, 38], [58, 42], [48.5, 34]]) P.tree(B, x, z, 0.9 + ((x * z) % 3) * 0.1);
  P.bench(B, 55, -30, 0);
  P.bench(B, 53, 33, 2);
  P.picnicTable(B, 51, -42, 1);
  P.picnicTable(B, 51, 43, 1);
  for (const [x, z, r, c, t] of [[50.0, -2.45, 1, 0x5a5a8a, 'hatch'], [58.5, 2.45, 3, 0xa8a8a0, 'estate']]) P.car(B, x, z, r, c, t);
  for (const z of [-4.6, 4.6]) {
    B.box(46.4, 0, z - 0.6, 47.6, 0.6, z + 0.6, 'brick', {});
    B.geometry(new THREE.IcosahedronGeometry(0.6, 1), 'leaves', 47, 0.95, z, { tint: 0x5a9a4a });
  }
}

// ---------------------------------------------------------------- boundary & horizon

// Tall hedge round the town, with gaps wide enough for tanks where roads and
// field gateways lead out into the countryside. Authored for the west and north
// edges; the rotated copy does the east and south.
function townHedge(B) {
  const { minX, maxX, minZ, maxZ } = TOWN_EDGE;
  const run = (x0, z0, x1, z1, gaps) => {
    const alongX = x1 - x0 > z1 - z0;
    let s0 = alongX ? x0 : z0;
    const end = alongX ? x1 : z1;
    for (const [g0, g1] of gaps) {
      if (g0 > s0) alongX ? P.hedge(B, s0, z0, g0, z1, 3.2) : P.hedge(B, x0, s0, x1, g0, 3.2);
      s0 = g1;
    }
    if (s0 < end) alongX ? P.hedge(B, s0, z0, end, z1, 3.2) : P.hedge(B, x0, s0, x1, end, 3.2);
  };
  run(minX - 0.8, minZ - 0.8, maxX + 0.8, minZ, [[-58, -50], [-28, -18], [50, 58]]);
  run(minX - 0.8, minZ, minX, maxZ, [[-40, -32], [-7, 7], [32, 40]]);
}

function backdrop(B) {
  const rnd = mulberry32(99);
  // rolling hills
  B.hills = [];
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + rnd() * 0.2;
    const d = 560 + rnd() * 160;
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const rx = 110 + rnd() * 90;
    const h = 30 + rnd() * 45;
    const rz = 110 + rnd() * 90;
    const x = Math.cos(a) * d * 1.15;
    const z = Math.sin(a) * d;
    B.geometry(g, 'grass', x, -2, z, {
      scale: [rx, h, rz],
      tint: [0.75 + rnd() * 0.2, 0.85 + rnd() * 0.1, 0.65 + rnd() * 0.1],
      uvScale: 30,
    });
    B.hills.push({ x, z, rx, rz, h: h - 2 });
  }
  // tree lines and copses around the edge of town
  for (let i = 0; i < 170; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 200 + rnd() * 260;
    const x = Math.cos(a) * d * 1.2;
    const z = Math.sin(a) * d;
    if (Math.abs(x) < 212 && Math.abs(z) < 162) continue;
    const s = 1.0 + rnd() * 1.4;
    B.geometry(new THREE.IcosahedronGeometry(3.2 * s, 1), 'leaves', x, 3.0 * s, z, { tint: [0.55 + rnd() * 0.2, 0.75 + rnd() * 0.15, 0.45 + rnd() * 0.1], uvScale: 3 });
    B.cylinder(x, 0, z, 0.4 * s, 2.0 * s, 'bark', { segments: 5, cap: false });
  }
  // distant rows of houses
  const rows = [
    [-330, -240, 0, 14],
    [60, -250, 0, 12],
    [-260, 240, 2, 12],
    [140, 250, 2, 14],
    [-300, -90, 3, 8],
    [300, 60, 1, 8],
  ];
  for (const [ox, oz, r, n] of rows) {
    B.withFrame(new Frame(ox, oz, r), () => {
      for (let i = 0; i < n; i++) {
        const x = i * 7;
        const h = 5.4 + (i % 3) * 0.3;
        const tint = [0.85 + rnd() * 0.15, 0.8 + rnd() * 0.1, 0.75 + rnd() * 0.1];
        B.box(x, 0, 0, x + 6.6, h, 8, i % 4 === 0 ? 'render' : 'brick', { collide: false, tint });
        B.quad([[x + 6.6, h, 0], [x, h, 0], [x, h + 3, 4], [x + 6.6, h + 3, 4]], 'slate', {});
        B.quad([[x, h, 8], [x + 6.6, h, 8], [x + 6.6, h + 3, 4], [x, h + 3, 4]], 'slate', {});
        B.tri([[x, h, 0], [x, h, 8], [x, h + 3, 4]], 'brick', {});
        B.tri([[x + 6.6, h, 8], [x + 6.6, h, 0], [x + 6.6, h + 3, 4]], 'brick', {});
      }
    });
  }
  // a church spire on the hill
  B.withFrame(new Frame(-400, 330, 0), () => {
    B.box(0, 8, 0, 6, 26, 6, 'stone', { collide: false });
    B.geometry(new THREE.ConeGeometry(4.2, 18, 4).rotateY(Math.PI / 4), 'slate', 3, 35, 3, {});
  });
}
