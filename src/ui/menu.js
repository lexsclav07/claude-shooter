// Main menu, match setup, loadout, settings, pause and end-of-match screens.

import { DIFFICULTY, DIFFICULTY_ORDER, TEAMS } from '../config.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../weapons/defs.js';
import { ACTIONS, DEFAULT_KEYS, keyLabel, saveSettings } from '../settings.js';

const LOGO = (() => {
  const rows = ['.XXXXXXXXX.', '.XX.XXX.XX.', 'XXXXXXXXXXX', '.XXXXXXXXX.', '.X.X...X.X.'];
  let r = '';
  rows.forEach((row, y) => [...row].forEach((c, x) => (c === 'X' ? (r += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`) : null)));
  return `<svg class="clawd" viewBox="0 0 11 5" shape-rendering="crispEdges"><g fill="#d97757">${r}</g></svg>`;
})();

function statBars(def) {
  const dps = (def.damage * (def.pellets || 1) * def.rpm) / 60;
  const stats = [
    ['Damage', Math.min(1, (def.damage * (def.pellets || 1)) / 120)],
    ['Fire rate', Math.min(1, def.rpm / 850)],
    ['Accuracy', Math.max(0.05, 1 - (def.spread.base + def.recoil.up * 0.6) / 4.5)],
    ['Range', Math.min(1, Math.pow(def.range, 4) * (def.cls === 'sniper' ? 1 : 0.92))],
    ['Mobility', Math.min(1, (def.speed - 0.7) / 0.35)],
  ];
  return (
    stats.map(([n, v]) => `<div class="stat"><span>${n}</span><div class="sbar"><div style="width:${Math.round(v * 100)}%"></div></div></div>`).join('') +
    `<div class="meta">${def.mag} rounds · ${Math.round(dps)} dps · ${def.head}× head</div>`
  );
}

export class Menu {
  constructor(game) {
    this.g = game;
    this.s = game.settings;
    this.root = document.getElementById('menu');
    this.screen = null;
    this.stack = [];
    this.rebinding = null;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        this.g.audio.init();
        this.g.audio.play('ui');
        this.act(b.dataset.act, b);
      }
    });
    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('change', (e) => this.onInput(e));
    this.show('main');
  }

  save() {
    saveSettings(this.s);
  }

  show(name) {
    this.screen = name;
    this.root.style.display = name ? 'flex' : 'none';
    if (!name) {
      this.root.innerHTML = '';
      return;
    }
    this.root.className = `screen-${name}`;
    this.root.innerHTML = this[`_${name}`]();
  }

  // ------------------------------------------------------------------ screens

  _main() {
    return `
    <div class="panel main">
      <div class="logo">${LOGO}<div><h1>CLAWD STRIKE</h1><div class="tag">Team Deathmatch in Little Clawdington</div></div></div>
      <button class="big primary" data-act="setup">PLAY</button>
      <button class="big" data-act="loadout">LOADOUT</button>
      <button class="big" data-act="settings">SETTINGS</button>
      <button class="big" data-act="howto">HOW TO PLAY</button>
      <div class="foot">Map built: ${this.g.world.boxes.length} boxes · ${this.g.nav.count} nav nodes · ${this.g.loadMs} ms</div>
    </div>`;
  }

  _setup() {
    const m = this.s.match;
    const diff = (key) =>
      DIFFICULTY_ORDER.map((d) => `<button class="seg ${m[key] === d ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${d}">${DIFFICULTY[d].label}</button>`).join('');
    const opts = (key, vals, fmt = (v) => v) =>
      vals.map((v) => `<button class="seg ${m[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}">${fmt(v)}</button>`).join('');
    return `
    <div class="panel setup">
      <h2>MATCH SETUP</h2>
      <div class="field"><label>Enemy bots</label><div class="segs">${diff('enemyDifficulty')}</div></div>
      <div class="field"><label>Teammate bots</label><div class="segs">${diff('allyDifficulty')}</div></div>
      <div class="hint">${DIFFICULTY[m.enemyDifficulty].label}: ${this._diffBlurb(m.enemyDifficulty)}</div>
      <div class="field"><label>Players per team <b id="ts-val">${m.teamSize}v${m.teamSize}</b></label><input type="range" min="1" max="8" step="1" value="${m.teamSize}" data-k="teamSize" class="match-range"></div>
      <div class="field"><label>Score limit</label><div class="segs">${opts('scoreLimit', [20, 30, 40, 50, 75, 100])}</div></div>
      <div class="field"><label>Time limit</label><div class="segs">${opts('timeLimit', [5, 10, 15, 20, 0], (v) => (v ? `${v} min` : '∞'))}</div></div>
      <div class="field"><label>Your team</label><div class="segs">${opts('playerTeam', [0, 1, 'auto'], (v) => (v === 'auto' ? 'Random' : `<span style="color:${TEAMS[v].color}">${TEAMS[v].name}</span>`))}</div></div>
      <div class="field"><label>Friendly fire</label><div class="segs">${opts('friendlyFire', [false, true], (v) => (v ? 'On' : 'Off'))}</div></div>
      <div class="field"><label>Health regen</label><div class="segs">${opts('healthRegen', [false, true], (v) => (v ? 'On' : 'Off (medkits only)'))}</div></div>
      <div class="field"><label>Loadout</label><div class="loadline">${WEAPONS[this.s.loadout.primary].name} + ${WEAPONS[this.s.loadout.secondary].name} <button class="small" data-act="loadout">CHANGE</button></div></div>
      <div class="row"><button class="big" data-act="back">BACK</button><button class="big primary" data-act="start">START MATCH</button></div>
    </div>`;
  }

  _diffBlurb(d) {
    return {
      easy: 'slow to react, sprays everywhere. Good for learning the map.',
      normal: 'decent aim, will strafe and chase sounds.',
      hard: 'quick reactions, controls recoil, throws grenades.',
      expert: 'near-instant reactions, loves headshots. Good luck.',
    }[d];
  }

  _loadout() {
    const card = (id, slot) => {
      const d = WEAPONS[id];
      const on = this.s.loadout[slot] === id;
      return `<div class="card ${on ? 'on' : ''}" data-act="pick" data-slot="${slot}" data-id="${id}">
        <div class="cname">${d.name}<span class="cls">${d.cls.toUpperCase()}</span></div>
        <div class="cdesc">${d.desc}</div>${statBars(d)}</div>`;
    };
    const ingame = this.stack.includes('pause') || this.stack.includes('game');
    const note = ingame ? `<div class="hint">${this.g.player && this.g.player.alive && this.g.player.spawnProtect > 0 ? 'Applied now (you are still in spawn).' : 'Your new loadout is applied when you next respawn.'}</div>` : '';
    return `
    <div class="panel loadout">
      <h2>LOADOUT</h2>
      <h3>Primary</h3><div class="cards">${PRIMARIES.map((id) => card(id, 'primary')).join('')}</div>
      <h3>Pistol</h3><div class="cards">${SECONDARIES.map((id) => card(id, 'secondary')).join('')}</div>
      <div class="hint">Everyone also carries a knife, ${1} frag grenade and 2 medkits per life.</div>
      ${note}
      <div class="row"><button class="big primary" data-act="back">DONE</button></div>
    </div>`;
  }

  _settings() {
    const s = this.s;
    const tab = this.tab || 'controls';
    const tabs = ['controls', 'keys', 'video', 'audio', 'crosshair']
      .map((t) => `<button class="tab ${tab === t ? 'on' : ''}" data-act="tab" data-v="${t}">${t.toUpperCase()}</button>`)
      .join('');
    const slider = (k, label, min, max, step, fmt = (v) => v) =>
      `<div class="field"><label>${label} <b data-out="${k}">${fmt(s[k])}</b></label><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-k="${k}" class="set-range"></div>`;
    const toggle = (k, label) => `<div class="field"><label>${label}</label><div class="segs"><button class="seg ${!s[k] ? 'on' : ''}" data-act="sset" data-k="${k}" data-v="false">Off</button><button class="seg ${s[k] ? 'on' : ''}" data-act="sset" data-k="${k}" data-v="true">On</button></div></div>`;
    let body = '';
    if (tab === 'controls') {
      body = `${slider('sensitivity', 'Mouse sensitivity', 0.1, 5, 0.05, (v) => (+v).toFixed(2))}
        ${slider('adsSensitivity', 'Aim-down-sights sensitivity', 0.2, 1.5, 0.05, (v) => (+v).toFixed(2))}
        ${toggle('invertY', 'Invert mouse Y')}
        ${toggle('toggleCrouch', 'Toggle crouch (instead of hold)')}
        ${toggle('toggleAds', 'Toggle aim (instead of hold)')}
        <div class="field"><label>Your name</label><input type="text" maxlength="14" value="${escAttr(s.playerName)}" data-k="playerName" class="set-text"></div>`;
    } else if (tab === 'keys') {
      body = `<div class="keys">${ACTIONS.map(
        ([k, label]) =>
          `<div class="keyrow"><span>${label}</span><button class="key ${this.rebinding === k ? 'wait' : ''}" data-act="rebind" data-k="${k}">${this.rebinding === k ? 'press a key…' : s.keys[k].map(keyLabel).join(' / ')}</button></div>`,
      ).join('')}</div>
        <div class="hint">Fire = left mouse · Aim = right mouse · Wheel switches weapons. Binding Ctrl to crouch works best in fullscreen (Ctrl+W can close the tab otherwise).</div>
        <div class="row"><button class="small" data-act="resetkeys">RESET TO DEFAULTS</button></div>`;
    } else if (tab === 'video') {
      body = `${slider('fov', 'Field of view (horizontal)', 70, 110, 1, (v) => `${v}°`)}
        <div class="field"><label>Shadows</label><div class="segs">${['off', 'medium', 'high'].map((v) => `<button class="seg ${s.shadows === v ? 'on' : ''}" data-act="sset" data-k="shadows" data-v="${v}">${v}</button>`).join('')}</div></div>
        ${slider('renderScale', 'Render scale', 0.5, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
        ${toggle('showFps', 'Show FPS')}
        ${toggle('fullscreen', 'Go fullscreen when a match starts')}`;
    } else if (tab === 'audio') {
      body = `${slider('masterVolume', 'Master volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
        ${slider('sfxVolume', 'Effects', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}
        ${slider('ambientVolume', 'Ambience', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`)}`;
    } else {
      const c = s.crosshair;
      const cs = (k, label, min, max, step) =>
        `<div class="field"><label>${label} <b data-out="ch.${k}">${c[k]}</b></label><input type="range" min="${min}" max="${max}" step="${step}" value="${c[k]}" data-ck="${k}" class="ch-range"></div>`;
      const ct = (k, label) => `<div class="field"><label>${label}</label><div class="segs"><button class="seg ${!c[k] ? 'on' : ''}" data-act="cset" data-k="${k}" data-v="false">Off</button><button class="seg ${c[k] ? 'on' : ''}" data-act="cset" data-k="${k}" data-v="true">On</button></div></div>`;
      const colors = ['#4dff6a', '#ffffff', '#00e5ff', '#ffe14d', '#ff4dd2', '#ff3b3b'];
      body = `<div class="ch-preview" style="--ch-color:${c.color};--ch-size:${c.size}px;--ch-thick:${c.thickness}px;--ch-gap:${c.gap}px;--ch-outline:${c.outline ? '0 0 0 1px rgba(0,0,0,0.85)' : 'none'}"><div class="xh"><i class="ch t"></i><i class="ch b"></i><i class="ch l"></i><i class="ch r"></i>${c.dot ? '<i class="ch dot"></i>' : ''}</div></div>
        <div class="field"><label>Colour</label><div class="segs">${colors.map((col) => `<button class="seg swatch ${c.color === col ? 'on' : ''}" style="background:${col}" data-act="cset" data-k="color" data-v="${col}"></button>`).join('')}</div></div>
        ${cs('size', 'Length', 2, 16, 1)}${cs('gap', 'Gap', 0, 14, 1)}${cs('thickness', 'Thickness', 1, 5, 1)}
        ${ct('dot', 'Centre dot')}${ct('dynamic', 'Dynamic (shows spread)')}${ct('outline', 'Outline')}`;
    }
    return `
    <div class="panel settings">
      <h2>SETTINGS</h2>
      <div class="tabs">${tabs}</div>
      <div class="tabbody">${body}</div>
      <div class="row"><button class="big primary" data-act="back">BACK</button></div>
    </div>`;
  }

  _howto() {
    const k = (a) => `<kbd>${this.s.keys[a].map(keyLabel).join(' / ')}</kbd>`;
    return `
    <div class="panel howto">
      <h2>HOW TO PLAY</h2>
      <p>Two teams of Clawds — <span style="color:${TEAMS[0].color}">OPUS</span> and <span style="color:${TEAMS[1].color}">SONNET</span> — fight through the high street, back gardens and terraced houses of Little Clawdington. Every kill scores a point for your team. First team to the score limit (or ahead when time runs out) wins.</p>
      <div class="cols">
        <div>
          <div class="ctrl">${k('forward')}${k('left')}${k('back')}${k('right')} move</div>
          <div class="ctrl">${k('sprint')} sprint · ${k('walk')} walk quietly</div>
          <div class="ctrl">${k('crouch')} crouch · sprint + crouch to slide</div>
          <div class="ctrl">${k('jump')} jump (crouch mid-air to jump higher)</div>
          <div class="ctrl">${k('leanLeft')} ${k('leanRight')} lean / peek round corners</div>
          <div class="ctrl"><kbd>Mouse 1</kbd> fire · <kbd>Mouse 2</kbd> aim down sights</div>
        </div>
        <div>
          <div class="ctrl">${k('reload')} reload · ${k('inspect')} inspect</div>
          <div class="ctrl">${k('primary')} ${k('secondary')} ${k('melee')} weapons · ${k('lastWeapon')} last weapon</div>
          <div class="ctrl">${k('grenade')} throw frag grenade</div>
          <div class="ctrl">${k('heal')} use medkit (+50 HP, 2 per life)</div>
          <div class="ctrl">${k('scoreboard')} scoreboard · ${k('loadout')} loadout · <kbd>Esc</kbd> pause</div>
        </div>
      </div>
      <h3>Tips</h3>
      <ul>
        <li>Like CS, you're most accurate standing still — tap or burst at range, crouch to steady your spray, and pull down against recoil.</li>
        <li>Heal with medkits, or grab the green first-aid boxes (the Pharmacy always has one). Yellow crates refill ammo and grenades.</li>
        <li>Windows are breakable glass. Wooden fences, sheds and doors can be shot through; brick and stone stop bullets.</li>
        <li>Bots hear footsteps and gunfire. Walk or crouch to sneak. Upstairs windows make great (and dangerous) sniper nests.</li>
        <li>Change bot difficulty any time from the pause menu.</li>
      </ul>
      <div class="row"><button class="big primary" data-act="back">BACK</button></div>
    </div>`;
  }

  _pause() {
    const m = this.g.match;
    const diff = (which, cur) =>
      DIFFICULTY_ORDER.map((d) => `<button class="seg ${cur === d ? 'on' : ''}" data-act="pdiff" data-w="${which}" data-v="${d}">${DIFFICULTY[d].label}</button>`).join('');
    return `
    <div class="panel pause">
      <h2>PAUSED</h2>
      <button class="big primary" data-act="resume">RESUME</button>
      <div class="field"><label>Enemy bots</label><div class="segs">${diff('enemy', m.enemyDifficulty)}</div></div>
      <div class="field"><label>Teammate bots</label><div class="segs">${diff('ally', m.allyDifficulty)}</div></div>
      <button class="big" data-act="loadout">LOADOUT</button>
      <button class="big" data-act="settings">SETTINGS</button>
      <button class="big" data-act="howto">CONTROLS</button>
      <button class="big danger" data-act="quit">LEAVE MATCH</button>
      <div class="board-mini">${this.g.hud.scoreboardHTML()}</div>
    </div>`;
  }

  _end() {
    const m = this.g.match;
    const p = this.g.player;
    const won = m.winner === p.team;
    const title = m.winner === 2 ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    const best = [...this.g.actors].sort((a, b) => b.kills * 100 + b.assists * 50 + b.headshots * 25 - (a.kills * 100 + a.assists * 50 + a.headshots * 25))[0];
    const acc = p.kills + p.deaths > 0 ? (p.kills / Math.max(1, p.deaths)).toFixed(2) : '0.00';
    return `
    <div class="panel end">
      <h1 class="${m.winner === 2 ? '' : won ? 'win' : 'lose'}">${title}</h1>
      <div class="final"><span style="color:${TEAMS[0].color}">${TEAMS[0].name} ${m.scores[0]}</span> — <span style="color:${TEAMS[1].color}">${m.scores[1]} ${TEAMS[1].name}</span></div>
      <div class="mvp">MVP: <b style="color:${TEAMS[best.team].color}">${escAttr(best.name)}</b> · ${best.kills} kills</div>
      <div class="you">You: ${p.kills} kills · ${p.deaths} deaths · ${p.assists} assists · ${p.headshots} headshots · K/D ${acc} · ${Math.round(p.damageDealt)} damage</div>
      <div class="board-mini">${this.g.hud.scoreboardHTML()}</div>
      <div class="row"><button class="big" data-act="menu">MAIN MENU</button><button class="big primary" data-act="again">PLAY AGAIN</button></div>
    </div>`;
  }

  // ------------------------------------------------------------------ actions

  act(a, b) {
    const s = this.s;
    switch (a) {
      case 'setup':
      case 'settings':
      case 'howto':
      case 'loadout':
        this.stack.push(this.screen);
        this.rebinding = null;
        this.show(a);
        break;
      case 'back': {
        this.rebinding = null;
        this.g.input.onKeyCapture = null;
        const prev = this.stack.pop() || 'main';
        if (prev === 'game') this.closeIngame();
        else this.show(prev);
        break;
      }
      case 'set': {
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        else if (v !== 'auto' && !Number.isNaN(+v) && b.dataset.k !== 'enemyDifficulty' && b.dataset.k !== 'allyDifficulty') v = +v;
        s.match[b.dataset.k] = v;
        this.save();
        this.show('setup');
        break;
      }
      case 'start':
        this.save();
        this.show(null);
        this.g.emit('start', { ...s.match });
        break;
      case 'pick':
        s.loadout[b.dataset.slot] = b.dataset.id;
        this.save();
        this.g.emit('loadoutChanged', { ...s.loadout });
        this.show('loadout');
        break;
      case 'tab':
        this.tab = b.dataset.v;
        this.rebinding = null;
        this.show('settings');
        break;
      case 'sset': {
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        s[b.dataset.k] = v;
        this.save();
        this.g.applySettings();
        this.show('settings');
        break;
      }
      case 'cset': {
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        s.crosshair[b.dataset.k] = v;
        this.save();
        this.g.applySettings();
        this.show('settings');
        break;
      }
      case 'rebind': {
        const k = b.dataset.k;
        this.rebinding = k;
        this.show('settings');
        this.g.input.onKeyCapture = (code) => {
          this.g.input.onKeyCapture = null;
          this.rebinding = null;
          if (code !== 'Escape') {
            // a key can only do one thing
            for (const [act, keys] of Object.entries(s.keys)) s.keys[act] = keys.filter((c) => c !== code);
            s.keys[k] = [code, ...(DEFAULT_KEYS[k].length > 1 ? s.keys[k].slice(0, 1) : [])].filter((v, i, arr) => arr.indexOf(v) === i);
            if (s.keys[k].length === 0) s.keys[k] = [code];
            this.save();
          }
          this.show('settings');
        };
        break;
      }
      case 'resetkeys':
        s.keys = structuredClone(DEFAULT_KEYS);
        this.save();
        this.show('settings');
        break;
      case 'resume':
        this.g.emit('resume');
        break;
      case 'pdiff':
        this.g.setDifficulty(b.dataset.w, b.dataset.v);
        if (b.dataset.w === 'enemy') s.match.enemyDifficulty = b.dataset.v;
        else s.match.allyDifficulty = b.dataset.v;
        this.save();
        this.show('pause');
        break;
      case 'quit':
      case 'menu':
        this.g.emit('quit');
        break;
      case 'again':
        this.show(null);
        this.g.emit('start', { ...s.match });
        break;
      default:
        break;
    }
  }

  onInput(e) {
    const t = e.target;
    const s = this.s;
    if (t.classList.contains('match-range')) {
      s.match[t.dataset.k] = +t.value;
      const out = this.root.querySelector('#ts-val');
      if (out) out.textContent = `${t.value}v${t.value}`;
      this.save();
    } else if (t.classList.contains('set-range')) {
      s[t.dataset.k] = +t.value;
      const out = this.root.querySelector(`[data-out="${t.dataset.k}"]`);
      if (out) {
        const v = +t.value;
        out.textContent = t.dataset.k.includes('olume') || t.dataset.k === 'renderScale' ? `${Math.round(v * 100)}%` : t.dataset.k === 'fov' ? `${v}°` : v.toFixed(2);
      }
      this.save();
      if (e.type === 'change' || t.dataset.k.includes('olume')) this.g.applySettings();
    } else if (t.classList.contains('ch-range')) {
      s.crosshair[t.dataset.ck] = +t.value;
      const out = this.root.querySelector(`[data-out="ch.${t.dataset.ck}"]`);
      if (out) out.textContent = t.value;
      const prev = this.root.querySelector('.ch-preview');
      if (prev) {
        prev.style.setProperty('--ch-size', `${s.crosshair.size}px`);
        prev.style.setProperty('--ch-gap', `${s.crosshair.gap}px`);
        prev.style.setProperty('--ch-thick', `${s.crosshair.thickness}px`);
      }
      this.save();
      this.g.applySettings();
    } else if (t.classList.contains('set-text')) {
      s[t.dataset.k] = t.value.trim().slice(0, 14) || 'You';
      this.save();
    }
  }

  openIngame(name) {
    this.stack = ['game'];
    this.show(name);
  }

  showRoot(name) {
    this.stack = [];
    this.show(name);
  }

  closeIngame() {
    this.show(null);
    this.g.emit('resume');
  }
}

function escAttr(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
