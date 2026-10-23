// Low-poly gun models built from boxes. Guns point down -Z with the origin at the grip.
// Returned info: group, muzzle (Object3D at the barrel tip), sightY (sight-line height),
// mag (Object3D animated during reloads), pump/bolt for action animations.

import * as THREE from 'three';

const M = {};
function mat(name, color, opts = {}) {
  if (!M[name]) M[name] = new THREE.MeshLambertMaterial({ color, ...opts });
  return M[name];
}
const steel = () => mat('steel', 0x2b2d31);
const steelLight = () => mat('steelLight', 0x55595f);
const wood = () => mat('wood', 0x8a4a24);
const polymer = () => mat('polymer', 0x1d1e20);
const olive = () => mat('olive', 0x4d5a3a);
const bladeMat = () => mat('blade', 0xb8bcc2);
const red = () => mat('reddot', 0xff2020, { emissive: 0xff2020 });

const BOX = new THREE.BoxGeometry(1, 1, 1);

function bx(parent, w, h, d, x, y, z, material, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(BOX, material);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function cyl(parent, r, len, x, y, z, material, axis = 'z', seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const m = new THREE.Mesh(g, material);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  else if (axis === 'x') m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function marker(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// Hollow optic housing so the camera can look through it when aiming.
function optic(parent, w, h, len, x, y, z, material) {
  const t = 0.008;
  bx(parent, w, t, len, x, y + h / 2, z, material);
  bx(parent, w, t, len, x, y - h / 2, z, material);
  bx(parent, t, h, len, x - w / 2, y, z, material);
  bx(parent, t, h, len, x + w / 2, y, z, material);
}

const BUILDERS = {
  ak(g) {
    bx(g, 0.058, 0.085, 0.4, 0, 0.03, -0.06, steel());
    bx(g, 0.05, 0.075, 0.3, 0, 0.0, 0.27, wood(), 0.12);
    bx(g, 0.038, 0.1, 0.05, 0, -0.065, 0.06, wood(), 0.35);
    const mag = new THREE.Group();
    mag.position.set(0, -0.02, -0.11);
    bx(mag, 0.036, 0.13, 0.06, 0, -0.06, 0, steel(), -0.18);
    bx(mag, 0.036, 0.1, 0.058, 0, -0.16, -0.035, steel(), -0.5);
    g.add(mag);
    bx(g, 0.056, 0.058, 0.2, 0, 0.018, -0.36, wood());
    bx(g, 0.03, 0.03, 0.2, 0, 0.068, -0.36, steel());
    bx(g, 0.022, 0.022, 0.26, 0, 0.03, -0.58, steel());
    bx(g, 0.01, 0.04, 0.012, 0, 0.068, -0.66, steel());
    bx(g, 0.03, 0.018, 0.03, 0, 0.082, -0.14, steel());
    bx(g, 0.012, 0.05, 0.03, 0.028, 0.02, -0.02, steelLight()); // charging handle
    return { muzzle: marker(g, 0, 0.03, -0.72), sightY: 0.092, mag, length: 0.9 };
  },
  l85(g) {
    bx(g, 0.06, 0.1, 0.6, 0, 0.025, 0.04, polymer());
    bx(g, 0.04, 0.11, 0.05, 0, -0.07, -0.05, polymer(), 0.3);
    const mag = new THREE.Group();
    mag.position.set(0, -0.03, 0.14);
    bx(mag, 0.034, 0.15, 0.065, 0, -0.07, 0, steel(), -0.1);
    g.add(mag);
    bx(g, 0.05, 0.06, 0.2, 0, 0.02, -0.28, polymer());
    bx(g, 0.024, 0.024, 0.18, 0, 0.03, -0.43, steel());
    bx(g, 0.032, 0.032, 0.05, 0, 0.03, -0.52, steel());
    // SUSAT optic on a mount
    bx(g, 0.03, 0.03, 0.12, 0, 0.088, -0.03, steel());
    optic(g, 0.05, 0.05, 0.16, 0, 0.13, -0.05, steel());
    const dot = bx(g, 0.004, 0.004, 0.002, 0, 0.13, -0.12, red());
    dot.material = red();
    bx(g, 0.05, 0.08, 0.06, 0, 0.0, 0.34, polymer()); // butt
    return { muzzle: marker(g, 0, 0.03, -0.55), sightY: 0.13, mag, length: 0.8 };
  },
  mp5(g) {
    bx(g, 0.05, 0.075, 0.3, 0, 0.03, -0.05, steel());
    bx(g, 0.036, 0.1, 0.045, 0, -0.06, 0.05, polymer(), 0.3);
    const mag = new THREE.Group();
    mag.position.set(0, -0.01, -0.1);
    bx(mag, 0.026, 0.14, 0.045, 0, -0.07, -0.01, steel(), -0.28);
    g.add(mag);
    bx(g, 0.055, 0.055, 0.15, 0, 0.02, -0.27, polymer());
    bx(g, 0.02, 0.02, 0.08, 0, 0.035, -0.38, steel());
    bx(g, 0.03, 0.04, 0.02, 0, 0.075, -0.33, steel()); // front sight hood
    bx(g, 0.02, 0.02, 0.025, 0, 0.078, 0.06, steel()); // rear drum
    bx(g, 0.01, 0.01, 0.24, 0.018, 0.04, 0.22, steel());
    bx(g, 0.01, 0.01, 0.24, -0.018, 0.04, 0.22, steel());
    bx(g, 0.05, 0.07, 0.02, 0, 0.02, 0.34, polymer());
    return { muzzle: marker(g, 0, 0.035, -0.43), sightY: 0.085, mag, length: 0.65 };
  },
  shotgun(g) {
    bx(g, 0.055, 0.08, 0.26, 0, 0.02, -0.04, steel());
    bx(g, 0.04, 0.1, 0.05, 0, -0.07, 0.07, wood(), 0.4);
    bx(g, 0.05, 0.09, 0.32, 0, -0.01, 0.28, wood(), 0.1);
    bx(g, 0.026, 0.026, 0.56, 0, 0.045, -0.44, steel());
    bx(g, 0.022, 0.022, 0.4, 0, 0.012, -0.36, steel());
    const pump = new THREE.Group();
    pump.position.set(0, 0.012, -0.34);
    bx(pump, 0.05, 0.05, 0.17, 0, 0, 0, wood());
    g.add(pump);
    bx(g, 0.008, 0.012, 0.008, 0, 0.064, -0.71, steelLight());
    return { muzzle: marker(g, 0, 0.045, -0.73), sightY: 0.066, mag: null, pump, length: 1.0 };
  },
  l96(g) {
    bx(g, 0.06, 0.09, 0.62, 0, 0.0, 0.05, olive());
    bx(g, 0.05, 0.12, 0.2, 0, -0.03, 0.32, olive(), 0.08);
    bx(g, 0.04, 0.09, 0.05, 0, -0.07, 0.04, olive(), 0.3);
    bx(g, 0.026, 0.026, 0.5, 0, 0.03, -0.48, steel());
    bx(g, 0.032, 0.032, 0.06, 0, 0.03, -0.75, steel());
    const mag = new THREE.Group();
    mag.position.set(0, -0.05, -0.05);
    bx(mag, 0.03, 0.06, 0.08, 0, -0.02, 0, steel());
    g.add(mag);
    cyl(g, 0.024, 0.34, 0, 0.1, -0.04, steel());
    cyl(g, 0.032, 0.07, 0, 0.1, -0.24, steel());
    cyl(g, 0.028, 0.05, 0, 0.1, 0.13, steel());
    bx(g, 0.02, 0.03, 0.04, 0, 0.065, -0.1, steel());
    bx(g, 0.02, 0.03, 0.04, 0, 0.065, 0.05, steel());
    const bolt = new THREE.Group();
    bolt.position.set(0.04, 0.04, 0.12);
    bx(bolt, 0.05, 0.012, 0.012, 0.02, 0, 0, steelLight());
    bx(bolt, 0.02, 0.02, 0.02, 0.05, 0, 0, steelLight());
    g.add(bolt);
    return { muzzle: marker(g, 0, 0.03, -0.79), sightY: 0.1, mag, bolt, length: 1.15 };
  },
  hipower(g) {
    bx(g, 0.03, 0.035, 0.19, 0, 0.035, -0.06, steel());
    bx(g, 0.028, 0.11, 0.052, 0, -0.035, 0.02, polymer(), 0.22);
    bx(g, 0.024, 0.02, 0.08, 0, 0.005, -0.08, steel());
    bx(g, 0.006, 0.012, 0.006, 0, 0.058, -0.145, steel());
    bx(g, 0.022, 0.01, 0.01, 0, 0.058, 0.025, steel());
    const mag = new THREE.Group();
    mag.position.set(0, -0.09, 0.03);
    bx(mag, 0.022, 0.02, 0.045, 0, 0, 0, steelLight(), 0.22);
    g.add(mag);
    return { muzzle: marker(g, 0, 0.035, -0.16), sightY: 0.064, mag, length: 0.22 };
  },
  webley(g) {
    bx(g, 0.022, 0.03, 0.16, 0, 0.045, -0.12, steel());
    bx(g, 0.012, 0.012, 0.16, 0, 0.022, -0.12, steel());
    cyl(g, 0.032, 0.055, 0, 0.032, -0.025, steelLight(), 'z', 8);
    bx(g, 0.026, 0.05, 0.06, 0, 0.03, 0.03, steel());
    bx(g, 0.03, 0.1, 0.045, 0, -0.04, 0.05, wood(), 0.35);
    bx(g, 0.006, 0.014, 0.008, 0, 0.066, -0.195, steel());
    bx(g, 0.014, 0.006, 0.01, 0, 0.066, 0.02, steel());
    return { muzzle: marker(g, 0, 0.045, -0.2), sightY: 0.072, mag: null, length: 0.3 };
  },
  knife(g) {
    bx(g, 0.026, 0.032, 0.11, 0, 0, 0.0, polymer());
    bx(g, 0.05, 0.012, 0.012, 0, 0, -0.06, steel());
    bx(g, 0.006, 0.032, 0.17, 0, 0.004, -0.15, bladeMat());
    bx(g, 0.005, 0.015, 0.05, 0, 0.022, -0.21, bladeMat(), 0.3);
    return { muzzle: marker(g, 0, 0, -0.24), sightY: 0.04, mag: null, length: 0.3 };
  },
  grenade(g) {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.036, 1), olive());
    body.scale.set(1, 1.15, 1);
    g.add(body);
    bx(g, 0.016, 0.03, 0.016, 0, 0.045, 0, steel());
    bx(g, 0.012, 0.06, 0.008, 0.012, 0.02, 0.02, steelLight(), 0.2);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 4, 10), steelLight());
    ring.position.set(-0.02, 0.055, 0);
    g.add(ring);
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 0.08 };
  },
  smokeGrenade(g) {
    cyl(g, 0.03, 0.11, 0, 0, 0, mat('smokeBody', 0x5a6a5a), 'y', 10);
    cyl(g, 0.031, 0.02, 0, 0.03, 0, mat('smokeBand', 0xe8e8e0), 'y', 10);
    bx(g, 0.016, 0.02, 0.016, 0, 0.065, 0, steel());
    bx(g, 0.012, 0.07, 0.008, 0.016, 0.03, 0.02, steelLight(), 0.15);
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 0.12 };
  },
  c4(g) {
    bx(g, 0.12, 0.05, 0.08, 0, 0, 0, mat('c4', 0xb8a878));
    bx(g, 0.122, 0.02, 0.03, 0, 0.0, 0, mat('c4tape', 0x2a2a2a));
    bx(g, 0.03, 0.02, 0.02, 0.03, 0.035, 0, mat('c4box', 0x1a1a1a));
    const led = bx(g, 0.008, 0.008, 0.008, 0.03, 0.05, 0.005, red());
    led.material = red();
    bx(g, 0.002, 0.002, 0.06, -0.03, 0.03, 0.02, mat('wireR', 0xc02020));
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 0.12 };
  },
  detonator(g) {
    bx(g, 0.04, 0.07, 0.025, 0, 0, 0, polymer());
    bx(g, 0.004, 0.06, 0.004, 0.012, 0.06, 0, steelLight());
    const b = bx(g, 0.014, 0.008, 0.014, 0, 0.038, -0.008, red());
    b.material = red();
    return { muzzle: marker(g, 0, 0, 0), sightY: 0.05, mag: null, length: 0.08 };
  },
  mine(g) {
    cyl(g, 0.17, 0.06, 0, 0.03, 0, olive(), 'y', 14);
    cyl(g, 0.06, 0.02, 0, 0.07, 0, steel(), 'y', 10);
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 0.34 };
  },
  nlaw(g) {
    // disposable anti-tank launcher carried on the shoulder
    cyl(g, 0.075, 1.0, 0, 0.06, -0.05, olive(), 'z', 12);
    cyl(g, 0.085, 0.12, 0, 0.06, -0.55, olive(), 'z', 12);
    cyl(g, 0.085, 0.12, 0, 0.06, 0.45, olive(), 'z', 12);
    bx(g, 0.04, 0.1, 0.05, 0, -0.04, 0.05, polymer(), 0.3);
    bx(g, 0.04, 0.09, 0.04, 0, -0.03, -0.28, polymer(), 0.2);
    // optic on the side
    optic(g, 0.045, 0.045, 0.12, -0.11, 0.1, -0.1, steel());
    bx(g, 0.04, 0.02, 0.06, -0.08, 0.08, -0.1, steel());
    return { muzzle: marker(g, 0, 0.06, -0.62), sightY: 0.1, sightX: -0.11, mag: null, length: 1.0 };
  },
  rocket(g) {
    cyl(g, 0.05, 0.7, 0, 0, 0, olive(), 'z', 8);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8), steel());
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -0.43;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const f = bx(g, 0.004, 0.12, 0.12, 0, 0, 0.3, steelLight());
      f.rotation.z = (i * Math.PI) / 2;
    }
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat('flame', 0xffb040, { emissive: 0xff8020 }));
    flame.scale.set(1, 1, 2.2);
    flame.position.z = 0.42;
    g.add(flame);
    return { muzzle: marker(g, 0, 0, -0.5), sightY: 0, mag: null, length: 0.8 };
  },
  shell(g) {
    cyl(g, 0.06, 0.55, 0, 0, 0, mat('brass', 0xc8a040), 'z', 8);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), steel());
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.36;
    g.add(tip);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat('tracer', 0xffd080, { emissive: 0xffa040 }));
    glow.position.z = 0.3;
    g.add(glow);
    return { muzzle: marker(g, 0, 0, -0.4), sightY: 0, mag: null, length: 0.7 };
  },
  bomb(g) {
    cyl(g, 0.18, 1.6, 0, 0, 0, mat('bomb', 0x4a5040), 'z', 10);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 6), mat('bomb', 0x4a5040));
    nose.scale.z = 1.6;
    nose.position.z = -0.8;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const f = bx(g, 0.01, 0.42, 0.4, 0, 0, 0.85, steelLight());
      f.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
    }
    bx(g, 0.37, 0.04, 0.05, 0, 0, -0.3, mat('bombBand', 0xd8b030));
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 1.9 };
  },
  medkit(g) {
    bx(g, 0.2, 0.13, 0.07, 0, 0, 0, mat('medGreen', 0x1f8a4a));
    bx(g, 0.07, 0.02, 0.072, 0, 0, 0, mat('medWhite', 0xf4f4f0));
    bx(g, 0.02, 0.07, 0.072, 0, 0, 0, mat('medWhite', 0xf4f4f0));
    bx(g, 0.06, 0.02, 0.02, 0, 0.075, 0, polymer());
    return { muzzle: marker(g, 0, 0, 0), sightY: 0, mag: null, length: 0.2 };
  },
};

export function buildGun(model) {
  const g = new THREE.Group();
  const info = (BUILDERS[model] || BUILDERS.ak)(g);
  info.group = g;
  return info;
}
