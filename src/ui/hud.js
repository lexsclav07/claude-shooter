// In-game HUD: health, ammo, crosshair, radar, kill feed, scoreboard, messages.

import { TEAMS, MAX_HEALTH, DIFFICULTY } from '../config.js';
import { formatTime, clamp, DEG } from '../util.js';
import { keyLabel } from '../settings.js';

const HTML = `
<div id="hud-crosshair"><i class="ch t"></i><i class="ch b"></i><i class="ch l"></i><i class="ch r"></i><i class="ch dot"></i></div>
<div id="hud-hitmarker"><i></i><i></i><i></i><i></i></div>
<canvas id="hud-dmg" width="320" height="320"></canvas>
<div id="hud-vignette"></div>
<div id="hud-flash"></div>
<div id="hud-scope"><div class="lens"></div><i class="h"></i><i class="v"></i></div>
<div id="hud-top">
  <div class="team t0"><span class="name"></span><span class="score">0</span></div>
  <div class="mid"><div class="timer">10:00</div><div class="limit"></div></div>
  <div class="team t1"><span class="score">0</span><span class="name"></span></div>
</div>
<div id="hud-feed"></div>
<div id="hud-radar"><canvas width="200" height="200"></canvas><div class="loc"></div></div>
<div id="hud-health">
  <div class="row"><span class="cross">✚</span><span class="num">100</span>
  <div class="bar"><div class="fill"></div><div class="ghost"></div></div></div>
  <div class="items"><span class="med"></span><span class="nade"></span></div>
</div>
<div id="hud-ammo"><div class="wname"></div><div class="row"><span class="mag">30</span><span class="res">/ 90</span></div><div class="reload"><div></div></div></div>
<div id="hud-center"></div>
<div id="hud-kill"></div>
<div id="hud-toast"></div>
<div id="hud-heal"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" class="bg"/><circle cx="20" cy="20" r="16" class="fg"/></svg><span>HEALING</span></div>
<div id="hud-protect">SPAWN PROTECTION</div>
<div id="hud-nade">⚠ GRENADE</div>
<div id="hud-death"><div class="by"></div><div class="wpn"></div><div class="timer"></div><div class="tip"></div></div>
<div id="hud-board"></div>
<div id="hud-fps"></div>
`;

export class Hud {
  constructor(game) {
    this.g = game;
    let root = document.getElementById('hud');
    if (!root) {
      root = document.createElement('div');
      root.id = 'hud';
      document.body.appendChild(root);
    }
    root.innerHTML = HTML;
    this.root = root;
    const $ = (s) => root.querySelector(s);
    this.el = {
      cross: $('#hud-crosshair'),
      hit: $('#hud-hitmarker'),
      dmg: $('#hud-dmg'),
      vig: $('#hud-vignette'),
      flash: $('#hud-flash'),
      scope: $('#hud-scope'),
      t0s: $('#hud-top .t0 .score'),
      t1s: $('#hud-top .t1 .score'),
      t0n: $('#hud-top .t0 .name'),
      t1n: $('#hud-top .t1 .name'),
      timer: $('#hud-top .timer'),
      limit: $('#hud-top .limit'),
      feed: $('#hud-feed'),
      radar: $('#hud-radar canvas'),
      loc: $('#hud-radar .loc'),
      hpNum: $('#hud-health .num'),
      hpFill: $('#hud-health .fill'),
      hpGhost: $('#hud-health .ghost'),
      health: $('#hud-health'),
      med: $('#hud-health .med'),
      nade: $('#hud-health .nade'),
      wname: $('#hud-ammo .wname'),
      mag: $('#hud-ammo .mag'),
      res: $('#hud-ammo .res'),
      reload: $('#hud-ammo .reload'),
      reloadBar: $('#hud-ammo .reload div'),
      center: $('#hud-center'),
      kill: $('#hud-kill'),
      toast: $('#hud-toast'),
      heal: $('#hud-heal'),
      healFg: $('#hud-heal .fg'),
      protect: $('#hud-protect'),
      nadeWarn: $('#hud-nade'),
      death: $('#hud-death'),
      board: $('#hud-board'),
      fps: $('#hud-fps'),
    };
    this.el.t0n.textContent = TEAMS[0].name;
    this.el.t1n.textContent = TEAMS[1].name;
    this.dctx = this.el.dmg.getContext('2d');
    this.rctx = this.el.radar.getContext('2d');
    this.hitT = 0;
    this.flashT = 0;
    this.dmgDirs = [];
    this.ghostHp = MAX_HEALTH;
    this.killT = 0;
    this.toastT = 0;
    this.feedItems = [];
    this.boardT = 0;
    this.loadoutOpen = false;
    this.lastCount = -1;
    this.visible(false);
    this._buildRadarMap();
    this.applySettings();
  }

  visible(v) {
    this.root.style.display = v ? 'block' : 'none';
  }

  applySettings() {
    const c = this.g.settings.crosshair;
    const s = this.root.style;
    s.setProperty('--ch-color', c.color);
    s.setProperty('--ch-size', `${c.size}px`);
    s.setProperty('--ch-thick', `${c.thickness}px`);
    s.setProperty('--ch-outline', c.outline ? '0 0 0 1px rgba(0,0,0,0.85)' : 'none');
    this.el.cross.querySelector('.dot').style.display = c.dot ? 'block' : 'none';
    this.el.fps.style.display = this.g.settings.showFps ? 'block' : 'none';
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
  }

  _buildRadarMap() {
    const { minX, maxX, minZ, maxZ } = this.g.map.bounds;
    const S = 3;
    this.rScale = S;
    const c = document.createElement('canvas');
    c.width = (maxX - minX) * S;
    c.height = (maxZ - minZ) * S;
    const x = c.getContext('2d');
    const X = (v) => (v - minX) * S;
    const Z = (v) => (v - minZ) * S;
    x.fillStyle = '#2f4426';
    x.fillRect(0, 0, c.width, c.height);
    const colors = { tarmac: '#4a4c50', gravel: '#6a6458', paving: '#7a7a76', concrete: '#6a6a68', grass: '#3a5a2e' };
    for (const s of this.g.builder.surfaces || []) {
      x.fillStyle = colors[s.mat] || '#555';
      x.fillRect(X(s.x0), Z(s.z0), (s.x1 - s.x0) * S, (s.z1 - s.z0) * S);
    }
    for (const f of this.g.builder.footprints) {
      if (f.x1 < minX || f.x0 > maxX || f.z1 < minZ || f.z0 > maxZ) continue;
      if (f.type === 'building' || f.type === 'church') {
        x.fillStyle = f.type === 'church' ? '#a8a49a' : f.height > 1 ? '#b8b0a4' : '#a09888';
        x.fillRect(X(f.x0), Z(f.z0), (f.x1 - f.x0) * S, (f.z1 - f.z0) * S);
        x.strokeStyle = '#1e1e1e';
        x.lineWidth = 1;
        x.strokeRect(X(f.x0) + 0.5, Z(f.z0) + 0.5, (f.x1 - f.x0) * S - 1, (f.z1 - f.z0) * S - 1);
      } else {
        x.fillStyle = f.type === 'hedge' ? '#1d3316' : f.height > 1.3 ? '#2a2a2a' : '#5a5a55';
        x.fillRect(X(f.x0), Z(f.z0), Math.max(1, (f.x1 - f.x0) * S), Math.max(1, (f.z1 - f.z0) * S));
      }
    }
    this.radarMap = c;
  }

  onMatchStart() {
    this.visible(true);
    this.el.feed.innerHTML = '';
    this.feedItems = [];
    this.el.death.style.display = 'none';
    this.el.board.style.display = 'none';
    const m = this.g.match;
    this.el.limit.textContent = `FIRST TO ${m.scoreLimit}`;
  }

  onRespawn() {
    this.el.death.style.display = 'none';
    this.ghostHp = MAX_HEALTH;
    this.dmgDirs.length = 0;
  }

  onDeath(killer, wname, hs) {
    this.killT = 0;
    this.el.kill.classList.remove('show');
    const e = this.el.death;
    e.style.display = 'block';
    const self = !killer || killer === this.g.player;
    e.querySelector('.by').innerHTML = self ? 'YOU DIED' : `KILLED BY <span style="color:${TEAMS[killer.team].color}">${esc(killer.name)}</span>`;
    e.querySelector('.wpn').textContent = self ? '' : `${wname}${hs ? ' · HEADSHOT' : ''}${killer.alive ? ` · they have ${Math.round(killer.health)} HP left` : ''}`;
    e.querySelector('.tip').textContent = `Press ${keyLabel(this.g.settings.keys.loadout[0])} to change loadout`;
  }

  onKill(victim, hs, streak) {
    const names = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'RAMPAGE', 5: 'UNSTOPPABLE', 6: 'GODLIKE' };
    const st = streak >= 2 ? `<div class="streak">${names[Math.min(6, streak)]}</div>` : '';
    this.el.kill.innerHTML = `<div class="k">${hs ? '<span class="hs">◎</span> ' : ''}ELIMINATED <b>${esc(victim.name)}</b> <span class="pts">+${hs ? 125 : 100}</span></div>${st}`;
    this.el.kill.classList.remove('show');
    void this.el.kill.offsetWidth;
    this.el.kill.classList.add('show');
    this.killT = 2.2;
  }

  hitmarker(kind) {
    this.hitT = kind === 'kill' ? 0.4 : 0.22;
    this.el.hit.className = kind;
  }

  damageFrom(from) {
    this.flashT = 0.25;
    if (from) this.dmgDirs.push({ x: from.x, z: from.z, t: 1.4 });
    if (this.dmgDirs.length > 6) this.dmgDirs.shift();
  }

  toast(text, color = '#fff') {
    this.el.toast.textContent = text;
    this.el.toast.style.color = color;
    this.toastT = 1.8;
  }

  centerMessage(text) {
    this.el.center.innerHTML = text;
  }

  killfeed(killer, victim, wname, hs) {
    const div = document.createElement('div');
    div.className = 'item';
    const p = this.g.player;
    if (killer === p || victim === p) div.classList.add('me');
    const kn = killer && killer !== victim ? `<span style="color:${TEAMS[killer.team].color}">${esc(killer.name)}</span>` : '';
    div.innerHTML = `${kn}<span class="w">${esc(wname)}${hs ? ' ◎' : ''}</span><span style="color:${TEAMS[victim.team].color}">${esc(victim.name)}</span>`;
    this.el.feed.prepend(div);
    this.feedItems.push({ div, t: 6 });
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
  }

  _scoreboard() {
    const g = this.g;
    const m = g.match;
    const rows = (team) =>
      g.actors
        .filter((a) => a.team === team)
        .map((a) => ({ a, score: a.kills * 100 + a.assists * 50 + a.headshots * 25 }))
        .sort((x, y) => y.score - x.score)
        .map(
          ({ a, score }) =>
            `<tr class="${a === g.player ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}${a.bot ? `<small>${DIFFICULTY[a.bot.level].label}</small>` : ''}</td><td>${a.weapons.primary ? a.weapons.primary.def.name : ''}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.assists}</td><td>${score}</td></tr>`,
        )
        .join('');
    const table = (team) => `
      <div class="side t${team}">
        <div class="hdr"><span>${TEAMS[team].name}</span><span class="sc">${m.scores[team]}</span></div>
        <table><tr><th>PLAYER</th><th>WEAPON</th><th>K</th><th>D</th><th>A</th><th>SCORE</th></tr>${rows(team)}</table>
      </div>`;
    return `<div class="title">TEAM DEATHMATCH · LITTLE CLAWDINGTON</div>${table(0)}${table(1)}`;
  }

  scoreboardHTML() {
    return this._scoreboard();
  }

  update(dt) {
    const g = this.g;
    const p = g.player;
    const m = g.match;
    if (!p || !m) return;
    const el = this.el;

    // top bar
    el.t0s.textContent = m.scores[0];
    el.t1s.textContent = m.scores[1];
    el.timer.textContent = m.timeLeft === Infinity ? '∞' : formatTime(m.timeLeft);
    el.timer.classList.toggle('low', m.timeLeft < 30);
    const tm = m.playerTeam;
    el.t0n.parentElement.classList.toggle('mine', tm === 0);
    el.t1n.parentElement.classList.toggle('mine', tm === 1);

    // start countdown
    const cd = m.startAt - g.time;
    if (cd > 0) this.centerMessage(`<div class="count">${Math.ceil(cd)}</div><div class="sub">TEAM DEATHMATCH · FIRST TO ${m.scoreLimit}</div>`);
    else if (cd > -0.8) this.centerMessage('<div class="count go">GO!</div>');
    else this.centerMessage('');

    // health
    const hp = Math.max(0, Math.ceil(p.health));
    el.hpNum.textContent = hp;
    el.hpFill.style.width = `${(hp / MAX_HEALTH) * 100}%`;
    this.ghostHp += (hp - this.ghostHp) * Math.min(1, dt * (hp > this.ghostHp ? 20 : 2.5));
    el.hpGhost.style.width = `${(this.ghostHp / MAX_HEALTH) * 100}%`;
    el.health.classList.toggle('low', hp <= 30);
    el.health.classList.toggle('mid', hp > 30 && hp <= 60);
    el.med.innerHTML = `<b>${keyLabel(g.settings.keys.heal[0])}</b> ✚ ${p.medkits}`;
    el.nade.innerHTML = `<b>${keyLabel(g.settings.keys.grenade[0])}</b> ● ${p.grenades}`;
    el.med.classList.toggle('empty', p.medkits <= 0);
    el.nade.classList.toggle('empty', p.grenades <= 0);

    // ammo
    const w = p.weapon;
    if (w) {
      el.wname.textContent = w.def.name;
      if (w.def.mag > 0) {
        el.mag.textContent = w.ammo;
        el.res.textContent = `/ ${w.reserve}`;
        el.mag.classList.toggle('low', w.ammo <= Math.ceil(w.def.mag * 0.25));
      } else {
        el.mag.textContent = '∞';
        el.res.textContent = '';
        el.mag.classList.remove('low');
      }
      const rl = w.reloadT > 0;
      el.reload.style.display = rl ? 'block' : 'none';
      if (rl) el.reloadBar.style.width = `${(1 - w.reloadT / (w.def.shellReload ? w.def.reload : w.def.reload)) * 100}%`;
    }

    // crosshair
    const ads = p.adsT;
    const scoped = w && w.def.scope && ads > 0.92;
    el.scope.style.display = scoped ? 'block' : 'none';
    const c = g.settings.crosshair;
    const showCross = p.alive && ads < 0.55 && !(w && w.def.scope) && p.healT < 0 && p.throwT < 0 && !p.sprinting;
    el.cross.style.display = showCross || (w && w.def.scope && ads < 0.4 && p.alive) ? 'block' : 'none';
    if (w) {
      const inacc = w.inaccuracy(p) + (w.def.pellets ? w.def.pelletSpread : 0);
      const vfov = (g.camera.fov * DEG) / 2;
      const px = (Math.tan(inacc * DEG) / Math.tan(vfov)) * (this.h / 2);
      const gap = c.gap + (c.dynamic ? Math.min(90, px) : 0);
      el.cross.style.setProperty('--ch-gap', `${gap}px`);
    }

    // hitmarker
    this.hitT -= dt;
    el.hit.style.opacity = this.hitT > 0 ? Math.min(1, this.hitT * 6) : 0;

    // vignette + damage flash
    const low = clamp((45 - hp) / 45, 0, 1);
    el.vig.style.opacity = p.alive ? low * (0.55 + Math.sin(g.time * 5) * 0.12) : 0;
    this.flashT -= dt;
    el.flash.style.opacity = Math.max(0, this.flashT * 2.2);

    // damage direction arcs + grenade warning
    this._drawDamage(dt, p);

    // heal ring
    if (p.healT >= 0) {
      el.heal.style.display = 'flex';
      const f = clamp(p.healT / 2.2, 0, 1);
      el.healFg.style.strokeDashoffset = `${100.5 * (1 - f)}`;
    } else el.heal.style.display = 'none';
    el.protect.style.display = p.alive && p.spawnProtect > 0 ? 'block' : 'none';

    // kill notice / toast
    this.killT -= dt;
    if (this.killT <= 0) el.kill.classList.remove('show');
    this.toastT -= dt;
    el.toast.style.opacity = this.toastT > 0 ? Math.min(1, this.toastT * 2) : 0;

    // killfeed aging
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.t -= dt;
      if (f.t < 0.5) f.div.style.opacity = Math.max(0, f.t * 2);
      if (f.t <= 0) {
        f.div.remove();
        this.feedItems.splice(i, 1);
      }
    }

    // death screen timer
    if (!p.alive) {
      const left = Math.max(0, p.respawnAt - g.time);
      el.death.querySelector('.timer').textContent = m.over ? '' : left > 0 ? `Respawning in ${left.toFixed(1)}` : 'Respawning...';
    }

    // scoreboard while Tab is held
    const show = g.input.held('scoreboard') && g.state === 'playing';
    el.board.style.display = show ? 'block' : 'none';
    if (show) {
      this.boardT -= dt;
      if (this.boardT <= 0) {
        this.boardT = 0.25;
        el.board.innerHTML = this._scoreboard();
      }
    } else this.boardT = 0;

    this._radar(p);
    if (g.settings.showFps) el.fps.textContent = `${g.fps} FPS`;
  }

  _drawDamage(dt, p) {
    const ctx = this.dctx;
    const W = 320;
    ctx.clearRect(0, 0, W, W);
    for (let i = this.dmgDirs.length - 1; i >= 0; i--) {
      const d = this.dmgDirs[i];
      d.t -= dt;
      if (d.t <= 0) {
        this.dmgDirs.splice(i, 1);
        continue;
      }
      const ang = this._relAngle(p, d.x, d.z);
      ctx.strokeStyle = `rgba(255,40,30,${Math.min(1, d.t) * 0.85})`;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(W / 2, W / 2, 120, ang - Math.PI / 2 - 0.28, ang - Math.PI / 2 + 0.28);
      ctx.stroke();
    }
    // nearby grenade
    let warn = false;
    for (const n of this.g.combat.grenades) {
      const dist = Math.hypot(n.pos.x - p.pos.x, n.pos.z - p.pos.z);
      if (dist > 9 || !p.alive) continue;
      warn = true;
      const ang = this._relAngle(p, n.pos.x, n.pos.z) - Math.PI / 2;
      const r = 100;
      ctx.fillStyle = 'rgba(255,190,40,0.95)';
      ctx.beginPath();
      ctx.arc(W / 2 + Math.cos(ang) * r, W / 2 + Math.sin(ang) * r, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', W / 2 + Math.cos(ang) * r, W / 2 + Math.sin(ang) * r + 5);
    }
    this.el.nadeWarn.style.display = warn ? 'block' : 'none';
  }

  // Angle of a world point relative to where the player is facing (0 = ahead, clockwise).
  _relAngle(p, x, z) {
    const dx = x - p.pos.x;
    const dz = z - p.pos.z;
    const world = Math.atan2(-dx, -dz); // yaw that would face it
    let rel = p.yaw - world;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    return rel;
  }

  _radar(p) {
    const ctx = this.rctx;
    const W = 200;
    const g = this.g;
    const { minX, minZ } = g.map.bounds;
    const zoom = 1.0;
    const S = this.rScale * zoom;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1a2416';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(p.yaw);
    ctx.drawImage(this.radarMap, -(p.pos.x - minX) * S, -(p.pos.z - minZ) * S, this.radarMap.width * zoom, this.radarMap.height * zoom);
    // other players
    for (const a of g.actors) {
      if (a === p || !a.alive) continue;
      const ally = a.team === p.team;
      if (!ally && !g.isSpotted(a, p.team)) continue;
      const x = (a.pos.x - p.pos.x) * S;
      const z = (a.pos.z - p.pos.z) * S;
      ctx.fillStyle = ally ? TEAMS[a.team].color : '#ff3a30';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      const dy = a.pos.y - p.pos.y;
      ctx.beginPath();
      if (dy > 2) {
        ctx.moveTo(x, z - 5);
        ctx.lineTo(x + 5, z + 4);
        ctx.lineTo(x - 5, z + 4);
        ctx.closePath();
      } else if (dy < -2) {
        ctx.moveTo(x, z + 5);
        ctx.lineTo(x + 5, z - 4);
        ctx.lineTo(x - 5, z - 4);
        ctx.closePath();
      } else ctx.arc(x, z, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // pickups
    for (const it of g.pickups.items) {
      if (!it.active || it.type !== 'health') continue;
      const x = (it.pos.x - p.pos.x) * S;
      const z = (it.pos.z - p.pos.z) * S;
      ctx.fillStyle = '#5dff8a';
      ctx.fillRect(x - 3, z - 1, 6, 2);
      ctx.fillRect(x - 1, z - 3, 2, 6);
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2, W / 2 - 7);
    ctx.lineTo(W / 2 + 5, W / 2 + 5);
    ctx.lineTo(W / 2, W / 2 + 2);
    ctx.lineTo(W / 2 - 5, W / 2 + 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // north marker
    const na = p.yaw;
    const nx = W / 2 + Math.sin(-na) * -88;
    const nz = W / 2 + Math.cos(-na) * -88;
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', nx, nz + 4);
    // location callout
    let best = null;
    let area = Infinity;
    for (const zn of g.map.zones) {
      if (p.pos.x < zn.x0 || p.pos.x > zn.x1 || p.pos.z < zn.z0 || p.pos.z > zn.z1) continue;
      const ar = (zn.x1 - zn.x0) * (zn.z1 - zn.z0);
      if (ar < area) {
        area = ar;
        best = zn;
      }
    }
    const name = best ? best.name + (p.pos.y > 2 ? ' · Upstairs' : '') : '';
    if (this.el.loc.textContent !== name) this.el.loc.textContent = name;
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}
