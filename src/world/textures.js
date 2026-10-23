// Procedurally painted canvas textures, so the game ships with zero image assets.

import * as THREE from 'three';
import { mulberry32 } from '../util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function rgb(r, g, b) {
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function jitter(base, amt, rnd) {
  const d = (rnd() - 0.5) * 2 * amt;
  return [base[0] + d, base[1] + d * 0.9, base[2] + d * 0.8];
}

// Scatter of small dots, good for grit on most surfaces.
function speckle(ctx, w, h, count, rnd, colorFn, size = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colorFn(rnd);
    const s = size * (0.5 + rnd());
    ctx.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

// Soft blotchy value noise painted by upscaling a tiny random canvas.
function blotches(ctx, w, h, cells, rnd, alpha, light = [255, 255, 255], dark = [0, 0, 0]) {
  const small = canvas(cells, cells);
  const s = small.getContext('2d');
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const v = rnd();
      const c = v > 0.5 ? light : dark;
      s.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.abs(v - 0.5) * 2 * alpha})`;
      s.fillRect(x, y, 1, 1);
    }
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(small, 0, 0, w, h);
  // draw wrapped copies so the tile stays seamless-ish
  ctx.globalAlpha = 0.5;
  ctx.drawImage(small, -w / cells / 2, -h / cells / 2, w, h);
  ctx.globalAlpha = 1;
}

export function brickTexture(base = [150, 62, 45], mortar = [190, 180, 165], seed = 1) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = rgb(...mortar);
  ctx.fillRect(0, 0, W, H);
  const rows = 12;
  const cols = 8;
  const bh = H / rows;
  const bw = W / cols;
  const m = 2.5;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? bw / 2 : 0;
    for (let k = -1; k < cols + 1; k++) {
      const x = k * bw + off;
      const col = jitter(base, 22, rnd);
      if (rnd() < 0.08) {
        col[0] *= 0.72;
        col[1] *= 0.72;
        col[2] *= 0.75;
      }
      ctx.fillStyle = rgb(...col);
      ctx.fillRect(x + m / 2, r * bh + m / 2, bw - m, bh - m);
      // slight darker lower edge for depth
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + m / 2, r * bh + bh - m / 2 - 2, bw - m, 2);
    }
  }
  speckle(ctx, W, H, 2500, rnd, (r) => `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},${0.08 + r() * 0.12})`);
  return toTexture(c);
}

export function stoneTexture(seed = 3) {
  const W = 512;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = rgb(120, 118, 110);
  ctx.fillRect(0, 0, W, H);
  const rows = 4;
  const bh = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 60;
    while (x < W) {
      const w = 70 + rnd() * 90;
      const col = jitter([165, 160, 148], 18, rnd);
      ctx.fillStyle = rgb(...col);
      ctx.fillRect(x + 2, r * bh + 2, w - 4, bh - 4);
      x += w;
    }
  }
  blotches(ctx, W, H, 24, rnd, 0.25);
  speckle(ctx, W, H, 3000, rnd, (r) => `rgba(0,0,0,${r() * 0.15})`);
  return toTexture(c);
}

export function noiseTexture(base, { size = 256, speck = 3000, speckAlpha = 0.12, blot = 0.18, cells = 16, seed = 7 } = {}) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.fillStyle = rgb(...base);
  ctx.fillRect(0, 0, size, size);
  if (blot > 0) blotches(ctx, size, size, cells, rnd, blot);
  speckle(ctx, size, size, speck, rnd, (r) => (r() < 0.5 ? `rgba(0,0,0,${r() * speckAlpha})` : `rgba(255,255,255,${r() * speckAlpha})`));
  return toTexture(c);
}

export function tarmacTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(11);
  ctx.fillStyle = rgb(62, 63, 66);
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, 12, rnd, 0.12);
  speckle(ctx, 256, 256, 9000, rnd, (r) => {
    const v = 40 + r() * 90;
    return `rgba(${v},${v},${v + 4},0.6)`;
  }, 1.2);
  // a few patched repairs
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = 'rgba(30,30,32,0.25)';
    ctx.fillRect(rnd() * 256, rnd() * 256, 30 + rnd() * 60, 20 + rnd() * 40);
  }
  return toTexture(c);
}

export function pavingTexture(base = [168, 166, 160]) {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(13);
  ctx.fillStyle = rgb(110, 108, 104);
  ctx.fillRect(0, 0, 256, 256);
  const n = 3;
  const s = 256 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = rgb(...jitter(base, 10, rnd));
      ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
    }
  }
  speckle(ctx, 256, 256, 3000, rnd, (r) => `rgba(0,0,0,${r() * 0.12})`);
  if (rnd() < 2) {
    ctx.strokeStyle = 'rgba(40,40,40,0.35)';
    ctx.beginPath();
    ctx.moveTo(30, 100);
    ctx.lineTo(60, 120);
    ctx.lineTo(70, 150);
    ctx.stroke();
  }
  return toTexture(c);
}

export function grassTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(17);
  ctx.fillStyle = rgb(82, 118, 52);
  ctx.fillRect(0, 0, 256, 256);
  blotches(ctx, 256, 256, 10, rnd, 0.22, [150, 170, 80], [20, 50, 10]);
  for (let i = 0; i < 4500; i++) {
    const g = 90 + rnd() * 70;
    ctx.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.35},0.55)`;
    const x = rnd() * 256;
    const y = rnd() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 4);
    ctx.stroke();
  }
  return toTexture(c);
}

export function hedgeTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(19);
  ctx.fillStyle = rgb(30, 58, 24);
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1600; i++) {
    const g = 50 + rnd() * 70;
    ctx.fillStyle = `rgba(${g * 0.5},${g},${g * 0.35},0.8)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 256, rnd() * 256, 3 + rnd() * 4, 2 + rnd() * 2.5, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, 256, 256, 800, rnd, () => 'rgba(0,0,0,0.35)', 2.5);
  return toTexture(c);
}

export function leavesTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(23);
  ctx.fillStyle = rgb(48, 80, 30);
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const g = 60 + rnd() * 90;
    ctx.fillStyle = `rgba(${g * 0.55},${g},${g * 0.3},0.85)`;
    ctx.beginPath();
    ctx.ellipse(rnd() * 256, rnd() * 256, 4 + rnd() * 5, 2 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
}

export function barkTexture() {
  const c = canvas(128, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(29);
  ctx.fillStyle = rgb(78, 62, 48);
  ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 120; i++) {
    const v = 40 + rnd() * 60;
    ctx.strokeStyle = `rgba(${v},${v * 0.8},${v * 0.6},0.7)`;
    ctx.lineWidth = 1 + rnd() * 3;
    const x = rnd() * 128;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + rnd() * 10 - 5, 80, x + rnd() * 10 - 5, 170, x + rnd() * 6 - 3, 256);
    ctx.stroke();
  }
  return toTexture(c);
}

export function planksTexture(base = [150, 105, 66], horizontal = true, boards = 8, seed = 31) {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const s = 256 / boards;
  for (let i = 0; i < boards; i++) {
    const col = jitter(base, 16, rnd);
    ctx.fillStyle = rgb(...col);
    if (horizontal) ctx.fillRect(0, i * s, 256, s);
    else ctx.fillRect(i * s, 0, s, 256);
    // grain
    for (let g = 0; g < 14; g++) {
      ctx.strokeStyle = `rgba(60,35,15,${0.06 + rnd() * 0.1})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (horizontal) {
        const y = i * s + rnd() * s;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(80, y + rnd() * 4 - 2, 170, y + rnd() * 4 - 2, 256, y);
      } else {
        const x = i * s + rnd() * s;
        ctx.moveTo(x, 0);
        ctx.bezierCurveTo(x + rnd() * 4 - 2, 80, x + rnd() * 4 - 2, 170, x, 256);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,10,0,0.45)';
    if (horizontal) ctx.fillRect(0, i * s, 256, 2);
    else ctx.fillRect(i * s, 0, 2, 256);
  }
  return toTexture(c);
}

export function roofTexture(kind = 'slate') {
  const W = 256;
  const H = 256;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const rnd = mulberry32(kind === 'slate' ? 37 : 41);
  const base = kind === 'slate' ? [70, 74, 82] : [150, 72, 50];
  ctx.fillStyle = rgb(base[0] * 0.5, base[1] * 0.5, base[2] * 0.5);
  ctx.fillRect(0, 0, W, H);
  const rows = 8;
  const cols = kind === 'slate' ? 6 : 8;
  const rh = H / rows;
  const cw = W / cols;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? cw / 2 : 0;
    for (let k = -1; k <= cols; k++) {
      ctx.fillStyle = rgb(...jitter(base, kind === 'slate' ? 10 : 18, rnd));
      ctx.fillRect(k * cw + off + 1, r * rh, cw - 2, rh - 1);
      // shadow line along the bottom overlap
      const grad = ctx.createLinearGradient(0, r * rh, 0, r * rh + rh);
      grad.addColorStop(0, 'rgba(0,0,0,0.25)');
      grad.addColorStop(0.3, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(255,255,255,0.05)');
      ctx.fillStyle = grad;
      ctx.fillRect(k * cw + off + 1, r * rh, cw - 2, rh - 1);
    }
  }
  speckle(ctx, W, H, 1500, rnd, (r) => `rgba(${r() < 0.5 ? '0,0,0' : '200,200,180'},${r() * 0.15})`);
  // patches of moss on clay tiles
  if (kind !== 'slate') blotches(ctx, W, H, 8, rnd, 0.15, [90, 110, 40], [60, 40, 30]);
  return toTexture(c);
}

export function plainTexture(color = [255, 255, 255], noise = 0.05, seed = 43) {
  return noiseTexture(color, { size: 128, speck: 600, speckAlpha: noise, blot: noise, cells: 8, seed });
}

export function tileFloorTexture() {
  const c = canvas(256, 256);
  const ctx = c.getContext('2d');
  const n = 8;
  const s = 256 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#e8e4dc' : '#3a3c44';
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  const rnd = mulberry32(47);
  speckle(ctx, 256, 256, 1200, rnd, (r) => `rgba(0,0,0,${r() * 0.1})`);
  return toTexture(c);
}

export function carpetTexture() {
  return noiseTexture([235, 235, 235], { size: 128, speck: 5000, speckAlpha: 0.18, blot: 0.08, cells: 8, seed: 53 });
}

export function windowGridTexture() {
  // Used on distant backdrop buildings.
  const c = canvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a5a44';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#2b3440';
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) ctx.fillRect(16 + x * 64, 14 + y * 64, 30, 36);
  return toTexture(c);
}

export function signTexture(text, { bg = '#1f3b2c', fg = '#f1e6c8', font = 'bold 86px Georgia, serif', w = 1024, h = 160, border = '#c9a94b', sub = null } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 4, w - 60);
  if (sub) {
    ctx.font = `bold ${Math.round(h * 0.18)}px Arial, sans-serif`;
    ctx.fillText(sub, w / 2, h * 0.78, w - 60);
  }
  return toTexture(c, { repeat: false });
}

// Pub hanging sign: a painted red lion on a board.
export function pubSignTexture(name) {
  const c = canvas(256, 320);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(0, 0, 256, 320);
  ctx.fillStyle = '#e9dcb8';
  ctx.fillRect(12, 12, 232, 296);
  ctx.fillStyle = '#b3241f';
  // simple heraldic lion silhouette: body, head, mane, tail
  ctx.beginPath();
  ctx.ellipse(128, 170, 70, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(80, 125, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(70, 190, 16, 60);
  ctx.fillRect(170, 190, 16, 60);
  ctx.fillRect(110, 195, 14, 55);
  ctx.beginPath();
  ctx.moveTo(195, 160);
  ctx.quadraticCurveTo(240, 120, 215, 95);
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#b3241f';
  ctx.stroke();
  ctx.fillStyle = '#e9dcb8';
  ctx.beginPath();
  ctx.arc(70, 118, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a1a10';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), 128, 290, 220);
  return toTexture(c, { repeat: false });
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c, { repeat: false });
}

export function bulletHoleTexture() {
  const s = 64;
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(10,8,6,1)');
  g.addColorStop(0.22, 'rgba(20,16,12,0.95)');
  g.addColorStop(0.35, 'rgba(60,50,40,0.6)');
  g.addColorStop(1, 'rgba(60,50,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return toTexture(c, { repeat: false });
}

export function flashTexture() {
  const s = 128;
  const c = canvas(s, s);
  const ctx = c.getContext('2d');
  ctx.translate(s / 2, s / 2);
  for (let i = 0; i < 7; i++) {
    ctx.rotate((Math.PI * 2) / 7 + 0.3);
    const g = ctx.createLinearGradient(0, 0, s / 2, 0);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(s / 2, 0);
    ctx.lineTo(0, 6);
    ctx.fill();
  }
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 4);
  g2.addColorStop(0, 'rgba(255,255,230,1)');
  g2.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g2;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  return toTexture(c, { repeat: false });
}

export function skyTexture() {
  const W = 1024;
  const H = 512;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7f97b2');
  g.addColorStop(0.45, '#b4c3d2');
  g.addColorStop(0.5, '#cfd6dc');
  g.addColorStop(1, '#cfd6dc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry32(59);
  // soft overcast clouds
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = H * 0.08 + rnd() * H * 0.38;
    const rx = 40 + rnd() * 120;
    const ry = 12 + rnd() * 30;
    const v = 215 + rnd() * 35;
    const a = 0.08 + rnd() * 0.18;
    ctx.fillStyle = `rgba(${v},${v},${v + 4},${a})`;
    for (const dx of [-W, 0, W]) {
      ctx.beginPath();
      ctx.ellipse(x + dx, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return toTexture(c, { repeat: false });
}
