// Player settings, persisted to localStorage.

import { MATCH_DEFAULTS } from './config.js';

export const ACTIONS = [
  ['forward', 'Move forward'],
  ['back', 'Move back'],
  ['left', 'Strafe left'],
  ['right', 'Strafe right'],
  ['jump', 'Jump'],
  ['crouch', 'Crouch / slide'],
  ['sprint', 'Sprint'],
  ['walk', 'Walk (quiet)'],
  ['leanLeft', 'Lean / peek left'],
  ['leanRight', 'Lean / peek right'],
  ['reload', 'Reload'],
  ['primary', 'Primary weapon'],
  ['secondary', 'Pistol'],
  ['melee', 'Knife'],
  ['lastWeapon', 'Last weapon'],
  ['gadget', 'Class gadget 1'],
  ['gadget2', 'Class gadget 2'],
  ['grenade', 'Throw frag grenade'],
  ['smoke', 'Throw smoke grenade'],
  ['heal', 'Use medkit'],
  ['inspect', 'Inspect weapon'],
  ['scoreboard', 'Scoreboard'],
  ['loadout', 'Change loadout'],
];

export const DEFAULT_KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['KeyC'],
  sprint: ['ShiftLeft'],
  walk: ['KeyZ'],
  leanLeft: ['KeyQ'],
  leanRight: ['KeyE'],
  reload: ['KeyR'],
  primary: ['Digit1'],
  secondary: ['Digit2'],
  melee: ['Digit3'],
  lastWeapon: ['KeyX'],
  gadget: ['Digit4'],
  gadget2: ['Digit5'],
  grenade: ['KeyG'],
  smoke: ['KeyT'],
  heal: ['KeyH'],
  inspect: ['KeyF'],
  scoreboard: ['Tab'],
  loadout: ['KeyB'],
};

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0,
  adsSensitivity: 0.75,
  invertY: false,
  fov: 85,
  toggleCrouch: false,
  toggleAds: false,
  masterVolume: 0.8,
  sfxVolume: 1.0,
  ambientVolume: 0.5,
  shadows: 'medium',
  renderScale: 1,
  showFps: false,
  fullscreen: false,
  crosshair: { color: '#4dff6a', size: 7, gap: 4, thickness: 2, dot: false, dynamic: true, outline: true },
  keys: DEFAULT_KEYS,
  match: { ...MATCH_DEFAULTS },
  loadout: { cls: 'rifleman', primary: 'ak47', secondary: 'hipower' },
  playerName: 'You',
  version: 2,
};

const KEY = 'clawd-strike-settings-v1';

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    saved = {};
  }
  const s = structuredClone(DEFAULT_SETTINGS);
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in s)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(s[k], v);
    else s[k] = v;
  }
  // version 1 bound 4 and 5 to medkit / grenade; those are class gadgets now
  if ((saved.version ?? 1) < 2) {
    s.keys = structuredClone(DEFAULT_KEYS);
    s.match = { ...MATCH_DEFAULTS, enemyDifficulty: s.match.enemyDifficulty, allyDifficulty: s.match.allyDifficulty };
    s.version = 2;
  }
  return s;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode etc) - settings just won't persist
  }
}

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = {
    Space: 'Space',
    ShiftLeft: 'L-Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl',
    ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt',
    Tab: 'Tab',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Mouse0: 'Mouse 1',
    Mouse1: 'Mouse 3',
    Mouse2: 'Mouse 2',
    Mouse3: 'Mouse 4',
    Mouse4: 'Mouse 5',
  };
  return names[code] || code;
}
