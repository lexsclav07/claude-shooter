// Low-poly vehicle models: a Challenger 2 style tank and a Eurofighter Typhoon style
// jet. Both point down -Z. A little Clawd rides in the tank hatch / jet cockpit.

import * as THREE from 'three';
import { TEAMS } from '../config.js';
import { CLAUDE_ORANGE } from '../actors/mascot.js';
import { bakeInto } from '../util3d.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const M = {};
function mat(key, color, opts = {}) {
  if (!M[key]) M[key] = new THREE.MeshLambertMaterial({ color, ...opts });
  return M[key];
}

function bx(parent, w, h, d, x, y, z, material, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(parent, r0, r1, len, x, y, z, material, axis = 'z', seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, seg), material);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

// Flat polygon (x, z points) extruded upwards by `thick`.
function plate(parent, pts, thick, y, material) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2);
  g.translate(0, y + thick, 0);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Small Clawd head and shoulders that pops out of hatches and cockpits.
function miniClawd(parent, team) {
  const g = new THREE.Group();
  const body = mat('clawd', CLAUDE_ORANGE);
  bx(g, 0.62, 0.42, 0.42, 0, 0.21, 0, body);
  bx(g, 0.09, 0.17, 0.02, -0.14, 0.27, -0.215, mat('eye', 0x161412));
  bx(g, 0.09, 0.17, 0.02, 0.14, 0.27, -0.215, mat('eye', 0x161412));
  bx(g, 0.66, 0.1, 0.46, 0, 0.47, 0, mat(`teamhat${team}`, TEAMS[team].dark));
  parent.add(g);
  return g;
}

function flagTexture(team) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 40;
  const x = c.getContext('2d');
  x.fillStyle = TEAMS[team].color;
  x.fillRect(0, 0, 64, 40);
  x.fillStyle = '#d97757';
  x.fillRect(22, 10, 20, 14);
  x.fillStyle = '#111';
  x.fillRect(26, 13, 3, 6);
  x.fillRect(35, 13, 3, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- tank

export const TANK_DIMS = { halfW: 1.75, halfL: 3.75, hullTop: 1.7, turretY: 1.7 };

export function buildTank(team) {
  const root = new THREE.Group();
  const hullMat = mat(`tankHull${team}`, team === 0 ? 0x5c6442 : 0x6e6446);
  const darkMat = mat(`tankDark${team}`, team === 0 ? 0x434a30 : 0x524a32);
  const trackMat = mat('track', 0x262624);
  const wheelMat = mat('wheel', 0x3a3a36);
  const teamMat = mat(`tankTeam${team}`, TEAMS[team].hex);
  const black = mat('tankBlack', 0x141414);
  const glass = mat('tankGlass', 0x203040, { emissive: 0x0a1018 });

  const hull = new THREE.Group();
  root.add(hull);
  // tracks and running gear
  for (const s of [-1, 1]) {
    bx(hull, 0.72, 0.95, 7.3, s * 1.36, 0.5, 0, trackMat);
    for (let i = 0; i < 6; i++) {
      const w = cyl(hull, 0.36, 0.36, 0.1, s * 1.74, 0.42, -2.6 + i * 1.04, wheelMat, 'x', 12);
      w.castShadow = false;
    }
    cyl(hull, 0.3, 0.3, 0.12, s * 1.72, 0.72, -3.45, wheelMat, 'x', 10);
    cyl(hull, 0.3, 0.3, 0.12, s * 1.72, 0.72, 3.45, wheelMat, 'x', 10);
    // side skirts
    bx(hull, 0.1, 0.55, 6.6, s * 1.79, 1.05, -0.2, hullMat);
    bx(hull, 0.06, 0.5, 1.1, s * 1.85, 1.0, 1.6, teamMat);
  }
  // hull body, sloped glacis and engine deck
  bx(hull, 2.5, 0.8, 6.4, 0, 1.25, 0.25, hullMat);
  bx(hull, 2.5, 0.12, 1.5, 0, 1.25, -3.25, hullMat, -0.42);
  bx(hull, 2.5, 0.5, 0.6, 0, 1.0, -3.0, darkMat);
  bx(hull, 2.2, 0.1, 2.2, 0, 1.68, 2.3, darkMat);
  for (let i = 0; i < 5; i++) bx(hull, 2.0, 0.03, 0.1, 0, 1.74, 1.4 + i * 0.4, black);
  bx(hull, 2.6, 0.3, 0.2, 0, 1.45, 3.45, darkMat);
  // driver's hatch and periscope
  bx(hull, 0.6, 0.08, 0.5, 0, 1.68, -2.45, darkMat);
  bx(hull, 0.3, 0.08, 0.06, 0, 1.73, -2.7, glass);
  // tow cables / stowage
  bx(hull, 0.3, 0.25, 1.4, -1.0, 1.78, 2.5, mat('stow', 0x4a4a32));
  bx(hull, 0.3, 0.25, 1.4, 1.0, 1.78, 2.5, mat('stow2', 0x5a5236));

  // turret
  const turret = new THREE.Group();
  turret.position.set(0, TANK_DIMS.turretY, -0.2);
  root.add(turret);
  bx(turret, 2.5, 0.72, 3.2, 0, 0.36, 0.25, hullMat);
  bx(turret, 2.1, 0.62, 0.9, 0, 0.32, -1.65, hullMat, 0.18);
  bx(turret, 2.3, 0.3, 1.0, 0, 0.6, 2.2, darkMat);
  // team panels on both turret sides
  bx(turret, 0.04, 0.42, 1.2, -1.27, 0.38, 0.4, teamMat);
  bx(turret, 0.04, 0.42, 1.2, 1.27, 0.38, 0.4, teamMat);
  // commander's cupola + sights
  cyl(turret, 0.38, 0.42, 0.28, 0.55, 0.86, 0.3, darkMat, 'y', 12);
  bx(turret, 0.4, 0.3, 0.4, -0.6, 0.86, -0.4, darkMat);
  bx(turret, 0.3, 0.18, 0.04, -0.6, 0.9, -0.62, glass);
  // smoke dischargers
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) cyl(turret, 0.06, 0.06, 0.3, s * (0.95 + i * 0.12), 0.65, -1.15, black, 'z', 6);
  }
  // radio aerial with a team pennant
  const aerial = cyl(turret, 0.012, 0.012, 2.4, -0.9, 1.9, 1.4, black, 'y', 4);
  aerial.castShadow = false;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshLambertMaterial({ map: flagTexture(team), side: THREE.DoubleSide }));
  flag.position.set(-0.9, 2.9, 1.66);
  flag.rotation.y = Math.PI / 2;
  turret.add(flag);

  // gun (pitch pivot at the mantlet)
  const gun = new THREE.Group();
  gun.position.set(0, 0.38, -1.95);
  turret.add(gun);
  bx(gun, 0.7, 0.55, 0.5, 0, 0, 0, darkMat);
  const barrel = mat('barrel', 0x2c3024);
  cyl(gun, 0.17, 0.17, 1.6, 0, 0, -1.0, barrel, 'z', 12);
  cyl(gun, 0.11, 0.11, 3.8, 0, 0, -3.6, barrel, 'z', 10);
  cyl(gun, 0.16, 0.16, 0.7, 0, 0, -3.0, barrel, 'z', 10);
  cyl(gun, 0.13, 0.13, 0.3, 0, 0, -5.4, black, 'z', 10);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0, -5.6);
  gun.add(muzzle);
  const coax = new THREE.Object3D();
  coax.position.set(0.38, 0.05, -0.4);
  gun.add(coax);
  cyl(gun, 0.03, 0.03, 0.4, 0.38, 0.05, -0.3, black, 'z', 6);

  // Clawd in the commander's hatch
  const crew = miniClawd(turret, team);
  crew.position.set(0.55, 0.95, 0.3);

  // bake each moving part into a single mesh (a few draw calls per tank)
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  bakeInto(hull, vc);
  bakeInto(gun, vc);
  bakeInto(crew, vc);
  bakeInto(turret, vc, { skip: [gun, crew], filter: (o) => !o.material.map });
  return { root, hull, turret, gun, muzzle, coax, crew };
}

// ---------------------------------------------------------------- jet

export function buildJet(team) {
  const root = new THREE.Group();
  const grey = mat('jetGrey', 0x8a9098);
  const greyDark = mat('jetGreyDark', 0x6a7078);
  const black = mat('jetBlack', 0x1a1c1e);
  const teamMat = mat(`jetTeam${team}`, TEAMS[team].hex);
  const canopy = mat('canopy', 0x2a3a48, { emissive: 0x0a1018, transparent: true, opacity: 0.75 });

  const body = new THREE.Group();
  root.add(body);
  // fuselage
  cyl(body, 0.82, 0.7, 9.5, 0, 0, 0.8, grey, 'z', 12);
  cyl(body, 0.82, 0.05, 4.2, 0, 0, -6.05, grey, 'z', 12);
  cyl(body, 0.7, 0.62, 1.8, 0, 0.05, 6.4, greyDark, 'z', 12);
  // chin intake
  bx(body, 1.7, 0.85, 3.6, 0, -0.75, -0.9, greyDark);
  bx(body, 1.5, 0.6, 0.1, 0, -0.75, -2.72, black);
  // spine
  bx(body, 0.9, 0.5, 6.0, 0, 0.6, 1.5, grey);
  // cockpit canopy with Clawd at the controls
  const can = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), canopy);
  can.scale.set(0.9, 0.85, 2.6);
  can.position.set(0, 0.68, -3.4);
  body.add(can);
  const pilot = miniClawd(body, team);
  pilot.scale.setScalar(0.78);
  pilot.position.set(0, 0.25, -3.45);

  // delta wings
  const wingPts = (s) => [
    [s * 0.7, -1.6],
    [s * 5.4, 3.6],
    [s * 5.4, 4.5],
    [s * 0.7, 5.0],
  ];
  plate(body, wingPts(1), 0.16, -0.2, grey);
  plate(body, wingPts(-1), 0.16, -0.2, grey);
  // wingtip pods, team colours
  bx(body, 0.2, 0.25, 1.8, 5.4, -0.12, 3.9, teamMat);
  bx(body, 0.2, 0.25, 1.8, -5.4, -0.12, 3.9, teamMat);
  // canards
  plate(body, [[0.75, -4.6], [2.1, -3.7], [2.1, -3.35], [0.75, -3.5]], 0.08, 0.15, greyDark);
  plate(body, [[-0.75, -4.6], [-2.1, -3.7], [-2.1, -3.35], [-0.75, -3.5]], 0.08, 0.15, greyDark);
  // fin
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(3.4, 0);
  fin.lineTo(4.4, 3.6);
  fin.lineTo(3.4, 3.6);
  fin.closePath();
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.12, bevelEnabled: false });
  fg.rotateY(-Math.PI / 2);
  const finMesh = new THREE.Mesh(fg, grey);
  finMesh.position.set(0.06, 0.8, 3.2);
  finMesh.castShadow = true;
  body.add(finMesh);
  bx(body, 0.14, 1.2, 1.0, 0, 3.5, 7.2, teamMat);
  // twin engines and afterburner glow
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const glows = [];
  for (const s of [-1, 1]) {
    cyl(body, 0.48, 0.44, 1.1, s * 0.5, -0.1, 7.6, black, 'z', 10);
    const gl = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.5, 10, 1, true), glowMat);
    gl.rotation.x = Math.PI / 2;
    gl.position.set(s * 0.5, -0.1, 9.2);
    body.add(gl);
    glows.push(gl);
  }
  // pylons with rockets and bombs hang under the wings
  const stores = [];
  for (const s of [-1, 1]) {
    bx(body, 0.12, 0.3, 1.0, s * 2.4, -0.4, 2.0, greyDark);
    const pod = cyl(body, 0.24, 0.24, 1.6, s * 2.4, -0.68, 1.9, mat('pod', 0x4a5040), 'z', 8);
    stores.push(pod);
    bx(body, 0.12, 0.3, 1.0, s * 3.8, -0.38, 3.2, greyDark);
    const bomb = cyl(body, 0.24, 0.24, 2.0, s * 3.8, -0.7, 3.1, mat('bombMat', 0x4a5040), 'z', 8);
    stores.push(bomb);
  }
  const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
  bakeInto(pilot, vc, { shadow: false });
  bakeInto(body, vc, { skip: [pilot], filter: (o) => !glows.includes(o) && !stores.includes(o) && o.material !== canopy });
  return { root, body, glows, stores, pilot };
}
