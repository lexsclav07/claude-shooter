// Material palette for the town. Each entry has a THREE material plus the size in
// metres that one texture repeat covers, used for world-space UV mapping.

import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials() {
  const defs = {
    brick: { map: T.brickTexture([148, 64, 46], [186, 176, 160], 1), tile: [1.8, 0.9] },
    brickDark: { map: T.brickTexture([110, 52, 40], [150, 140, 128], 2), tile: [1.8, 0.9] },
    brickBuff: { map: T.brickTexture([196, 160, 110], [210, 200, 182], 4), tile: [1.8, 0.9] },
    render: { map: T.noiseTexture([232, 224, 204], { speck: 4000, speckAlpha: 0.1, blot: 0.08, seed: 61 }), tile: [2, 2] },
    pebbledash: { map: T.noiseTexture([196, 186, 166], { speck: 14000, speckAlpha: 0.35, blot: 0.1, seed: 67 }), tile: [1.2, 1.2] },
    stone: { map: T.stoneTexture(3), tile: [3.2, 1.6] },
    slate: { map: T.roofTexture('slate'), tile: [1.6, 1.6], side: THREE.DoubleSide },
    tiles: { map: T.roofTexture('clay'), tile: [1.6, 1.6], side: THREE.DoubleSide },
    tarmac: { map: T.tarmacTexture(), tile: [5, 5] },
    paving: { map: T.pavingTexture(), tile: [1.8, 1.8] },
    kerb: { map: T.plainTexture([175, 172, 166], 0.1), tile: [1, 1] },
    concrete: { map: T.noiseTexture([150, 148, 142], { speck: 5000, seed: 71 }), tile: [3, 3] },
    gravel: { map: T.noiseTexture([140, 130, 115], { speck: 16000, speckAlpha: 0.4, blot: 0.1, seed: 73 }), tile: [2, 2] },
    grass: { map: T.grassTexture(), tile: [4, 4] },
    hedge: { map: T.hedgeTexture(), tile: [1.6, 1.6] },
    leaves: { map: T.leavesTexture(), tile: [1.5, 1.5], side: THREE.DoubleSide },
    bark: { map: T.barkTexture(), tile: [1, 2] },
    fence: { map: T.planksTexture([128, 86, 52], true, 10, 79), tile: [1.8, 1.8] },
    wood: { map: T.planksTexture([200, 200, 200], false, 6, 83), tile: [1.2, 1.2] },
    floorboards: { map: T.planksTexture([168, 122, 80], true, 10, 89), tile: [1.6, 1.6] },
    carpet: { map: T.carpetTexture(), tile: [1, 1] },
    lino: { map: T.tileFloorTexture(), tile: [2.4, 2.4] },
    plaster: { map: T.plainTexture([238, 234, 226], 0.06, 97), tile: [2, 2] },
    paint: { map: T.plainTexture([255, 255, 255], 0.04, 101), tile: [1, 1] },
    metal: { map: T.plainTexture([90, 92, 96], 0.12, 103), tile: [1, 1] },
    white: { map: T.plainTexture([245, 245, 242], 0.03, 107), tile: [1, 1] },
    dark: { map: T.plainTexture([40, 40, 44], 0.05, 109), tile: [1, 1] },
    lineWhite: { map: T.plainTexture([230, 230, 225], 0.08, 113), tile: [1, 1], offset: true },
    lineYellow: { map: T.plainTexture([228, 190, 40], 0.08, 127), tile: [1, 1], offset: true },
    soil: { map: T.noiseTexture([92, 70, 50], { speck: 9000, speckAlpha: 0.3, seed: 131 }), tile: [2, 2] },
    water: { map: T.noiseTexture([70, 96, 100], { speck: 1000, speckAlpha: 0.08, seed: 137 }), tile: [3, 3] },
  };
  // the endless ground plane is pushed back in depth so roads and paths drawn just
  // above it never flicker, even seen from a jet at altitude
  defs.ground = { map: defs.grass.map, tile: [4, 4], pushBack: true };
  const out = {};
  for (const [name, d] of Object.entries(defs)) {
    const m = new THREE.MeshLambertMaterial({
      map: d.map,
      vertexColors: true,
      side: d.side || THREE.FrontSide,
    });
    if (d.offset) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
    if (d.pushBack) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = 4;
      m.polygonOffsetUnits = 16;
    }
    m.name = name;
    out[name] = { material: m, tile: d.tile };
  }
  out.glass = {
    material: new THREE.MeshPhongMaterial({
      color: 0x9fb8c8,
      specular: 0xffffff,
      shininess: 90,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexColors: true,
    }),
    tile: [1, 1],
  };
  out.emissive = {
    material: new THREE.MeshBasicMaterial({ vertexColors: true, map: T.plainTexture([255, 255, 255], 0.02) }),
    tile: [1, 1],
  };
  return out;
}
