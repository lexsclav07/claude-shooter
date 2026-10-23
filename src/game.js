// Ties everything together: world, actors, match rules, rendering.

import * as THREE from 'three';
import { CollisionWorld, nudgeBody, bodyFits } from './physics.js';
import { WorldBuilder } from './world/builder.js';
import { createMaterials } from './world/materials.js';
import { buildTown } from './world/map.js';
import { skyTexture } from './world/textures.js';
import { NavGraph } from './nav.js';
import { Effects } from './fx/effects.js';
import { GameAudio } from './fx/audio.js';
import { Combat } from './combat.js';
import { Viewmodel } from './weapons/viewmodel.js';
import { Pickups } from './pickups.js';
import { Input } from './input.js';
import { Actor } from './actors/actor.js';
import { BotBrain, randomLoadout } from './actors/bot.js';
import { PlayerController } from './actors/player.js';
import { Hud } from './ui/hud.js';
import { WEAPONS } from './weapons/defs.js';
import { BOT_NAMES, MAX_HEALTH, RESPAWN_TIME, SPAWN_PROTECT, PHYS } from './config.js';
import { damp } from './util.js';

const tmp = new THREE.Vector3();

export class Game {
  constructor(container, settings) {
    this.settings = settings;
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.autoClear = false;
    renderer.shadowMap.enabled = settings.shadows !== 'off';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.Fog(0xc9d1d9, 70, 340);
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(700, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x9a9070, 1.5));
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(-45, 80, 35);
    sun.target.position.set(0, 0, 0);
    scene.add(sun.target);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    Object.assign(sun.shadow.camera, { left: -78, right: 78, top: 78, bottom: -78, near: 10, far: 220 });
    scene.add(sun);
    this.sun = sun;
    this.applyShadowQuality();

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.06, 1500);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);

    // world
    const t0 = performance.now();
    this.world = new CollisionWorld();
    this.builder = new WorldBuilder(this.world, createMaterials());
    this.map = buildTown(this.builder);
    this.builder.finish(scene);
    this.nav = new NavGraph(this.world, this.map.bounds);
    const seeds = [...this.map.spawns[0], ...this.map.spawns[1]].map((s) => s.pos);
    this.navStats = this.nav.build(this.builder, seeds);
    this.loadMs = Math.round(performance.now() - t0);
    this.glassBackup = null;

    this.fx = new Effects(scene);
    this.audio = new GameAudio();
    this.audio.occlusion = (p) => !this.world.clearLine(this.camera.position.x, this.camera.position.y, this.camera.position.z, p.x, p.y + 0.3, p.z, 'bullet');
    this.combat = new Combat(this);
    this.viewmodel = new Viewmodel();
    this.pickups = new Pickups(this, this.map.pickups);
    this.input = new Input(renderer.domElement, settings);
    this.playerCtl = new PlayerController(this);
    this.hud = new Hud(this);

    this.actors = [];
    this.player = null;
    this.time = 0;
    this.timers = [];
    this.state = 'menu';
    this.intel = [new Map(), new Map()];
    this.match = null;
    this.slowmo = 1;
    this.menuT = 0;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.fps = 0;
    this.listeners = {};

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, ...args) {
    for (const fn of this.listeners[ev] || []) fn(...args);
  }

  applyShadowQuality() {
    const q = this.settings.shadows;
    const enabled = q !== 'off';
    const size = q === 'high' ? 4096 : 2048;
    if (this.renderer.shadowMap.enabled !== enabled) {
      this.renderer.shadowMap.enabled = enabled;
      this.scene.traverse((o) => {
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
        }
      });
    }
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
  }

  applySettings() {
    const s = this.settings;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * s.renderScale);
    this.applyShadowQuality();
    this.audio.setVolume({ master: s.masterVolume, sfx: s.sfxVolume, ambient: s.ambientVolume });
    this.hud.applySettings();
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1) * this.settings.renderScale);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(w / h);
    this.hud.resize(w, h);
  }

  later(delay, fn) {
    this.timers.push({ t: this.time + delay, fn });
  }

  // ------------------------------------------------------------------ match setup

  startMatch(ms) {
    this.clearMatch();
    this.match = {
      ...ms,
      scores: [0, 0],
      timeLeft: ms.timeLimit > 0 ? ms.timeLimit * 60 : Infinity,
      startAt: this.time + 3,
      over: false,
      winner: -1,
    };
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    let ni = 0;
    const pTeam = ms.playerTeam === 'auto' || ms.playerTeam === undefined ? (Math.random() < 0.5 ? 0 : 1) : ms.playerTeam;
    this.match.playerTeam = pTeam;
    const player = new Actor({ name: this.settings.playerName || 'You', team: pTeam, isPlayer: true });
    player.loadout = { ...this.settings.loadout };
    this.player = player;
    this.actors.push(player);
    for (let team = 0; team < 2; team++) {
      const count = ms.teamSize - (team === pTeam ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const a = new Actor({ name: names[ni++ % names.length], team });
        a.loadout = randomLoadout();
        a.bot = new BotBrain(this, a, team === pTeam ? ms.allyDifficulty : ms.enemyDifficulty);
        this.actors.push(a);
      }
    }
    for (const a of this.actors) {
      this.scene.add(a.model.root);
      a.model.marker.visible = !a.isPlayer && a.team === pTeam;
    }
    player.model.root.visible = false;
    for (const a of this.actors) this.respawn(a, true);
    this.pickups.reset();
    this.restoreGlass();
    this.playerCtl.reset();
    this.state = 'playing';
    this.hud.onMatchStart();
    this.audio.init();
    this.audio.startAmbience();
    this.applySettings();
  }

  clearMatch() {
    for (const a of this.actors) this.scene.remove(a.model.root);
    for (const n of this.combat.grenades) this.fx.releaseGrenade(n.mesh);
    this.combat.grenades.length = 0;
    this.actors = [];
    this.player = null;
    this.timers = [];
    this.intel = [new Map(), new Map()];
    this.match = null;
    this.slowmo = 1;
  }

  // Put every broken window back for a fresh match.
  restoreGlass() {
    for (const p of this.builder.panes) {
      if (!p.broken) continue;
      const pos = p.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = (p.start + i) * 3;
        pos.array[k] = p.orig[i * 3];
        pos.array[k + 1] = p.orig[i * 3 + 1];
        pos.array[k + 2] = p.orig[i * 3 + 2];
      }
      pos.needsUpdate = true;
      p.broken = false;
      const b = p.box;
      const nb = this.world.add(b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2], 'glass');
      nb.pane = p;
      p.box = nb;
    }
  }

  // Debug/testing: let a bot drive the player too.
  autoplay(level = 'normal') {
    if (this.player && !this.player.bot) this.player.bot = new BotBrain(this, this.player, level);
  }

  // Debug/testing: advance the simulation without rendering.
  simulate(seconds, step = 1 / 60) {
    const n = Math.round(seconds / step);
    for (let i = 0; i < n; i++) {
      if (this.state !== 'playing') break;
      this.update(step);
    }
  }

  setDifficulty(which, level) {
    if (!this.match) return;
    if (which === 'enemy') this.match.enemyDifficulty = level;
    else this.match.allyDifficulty = level;
    for (const a of this.actors) {
      if (!a.bot) continue;
      const isAlly = a.team === this.match.playerTeam;
      if ((which === 'enemy' && !isAlly) || (which === 'ally' && isAlly)) a.bot.setSkill(level);
    }
  }

  chooseSpawn(team) {
    const pts = this.map.spawns[team];
    let best = null;
    let bestScore = -Infinity;
    for (const s of pts) {
      let minD = Infinity;
      let seen = false;
      for (const a of this.actors) {
        if (!a.alive) continue;
        const d = Math.hypot(a.pos.x - s.pos[0], a.pos.z - s.pos[2]);
        if (a.team === team) {
          if (d < 1.2) minD = Math.min(minD, 0.5); // occupied
          continue;
        }
        minD = Math.min(minD, d);
        if (d < 50 && this.world.clearLine(a.pos.x, a.pos.y + 1.3, a.pos.z, s.pos[0], 1.3, s.pos[2])) seen = true;
      }
      const score = Math.min(minD, 60) - (seen ? 40 : 0) + Math.random() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  respawn(a, initial = false) {
    if (a.isPlayer && this.pendingLoadout) {
      a.loadout = { ...this.pendingLoadout };
      this.pendingLoadout = null;
    }
    if (a.bot && !initial && Math.random() < 0.3) a.loadout = randomLoadout();
    const s = this.chooseSpawn(a.team);
    a.spawn(s.pos, s.yaw + (Math.random() - 0.5) * 0.3);
    // nudge out of anything we spawned inside
    for (let k = 0; k < 8 && !bodyFits(this.world, a.pos, a.height); k++) {
      a.pos.x += (Math.random() - 0.5) * 1.2;
      a.pos.z += (Math.random() - 0.5) * 1.2;
    }
    a.spawnProtect = SPAWN_PROTECT;
    a.model.deathT = 0;
    a.model.root.rotation.x = 0;
    if (a.bot) a.bot.onSpawn();
    if (a.isPlayer) {
      a.model.root.visible = false;
      this.playerCtl.reset();
      this.hud.onRespawn();
      this.audio.play('spawn');
    } else {
      a.model.root.visible = true;
    }
  }

  // ------------------------------------------------------------------ combat events

  damage(target, amount, attacker, weaponId, zone, from) {
    if (!target.alive || !this.match || this.match.over) return;
    if (target.spawnProtect > 0) return;
    const ff = attacker && attacker !== target && attacker.team === target.team;
    if (ff && !this.match.friendlyFire) return;
    amount = Math.max(1, Math.round(amount));
    target.health -= amount;
    target.lastHurt = this.time;
    target.healT = -1;
    target.model.hit();
    if (attacker && attacker !== target) {
      attacker.damageDealt += amount;
      const rec = target.damageLog.get(attacker.id) || { dmg: 0, t: 0, actor: attacker };
      rec.dmg += amount;
      rec.t = this.time;
      target.damageLog.set(attacker.id, rec);
    }
    // aim punch for the victim
    target.recoilPitch += 0.012 + Math.random() * 0.01;
    if (target.bot) target.bot.onDamaged(attacker);
    if (target === this.player) {
      this.hud.damageFrom(from);
      this.audio.play('hurt');
      this.playerCtl.shake = Math.max(this.playerCtl.shake, 0.25);
    }
    const kill = target.health <= 0;
    if (attacker === this.player && attacker !== target) {
      this.hud.hitmarker(kill ? 'kill' : zone === 'head' ? 'head' : 'hit');
      this.audio.play(kill ? 'kill' : zone === 'head' ? 'headshot' : 'hit');
    }
    if (kill) this.kill(target, attacker, weaponId, zone, from);
  }

  kill(victim, killer, weaponId, zone, from) {
    victim.alive = false;
    victim.health = 0;
    victim.deaths++;
    victim.streak = 0;
    victim.diedAt = this.time;
    victim.respawnAt = this.time + RESPAWN_TIME;
    victim.healT = -1;
    victim.throwT = -1;
    victim.vel.set(0, 0, 0);
    victim.killedBy = killer;
    // fall away from the shot
    if (from) {
      const fx = -Math.sin(victim.yaw);
      const fz = -Math.cos(victim.yaw);
      victim.model.deathDir = (victim.pos.x - from.x) * fx + (victim.pos.z - from.z) * fz > 0 ? -1 : 1;
    }
    const m = this.match;
    const headshot = zone === 'head';
    if (killer && killer !== victim) {
      if (killer.team === victim.team) {
        m.scores[killer.team] = Math.max(0, m.scores[killer.team] - 1);
        killer.kills--;
      } else {
        m.scores[killer.team]++;
        killer.kills++;
        killer.streak++;
        if (headshot) killer.headshots++;
      }
    } else {
      // suicide (own grenade)
      m.scores[victim.team] = Math.max(0, m.scores[victim.team] - 1);
    }
    // assists
    for (const rec of victim.damageLog.values()) {
      if (rec.actor !== killer && rec.dmg >= 40 && this.time - rec.t < 10 && rec.actor.team !== victim.team) rec.actor.assists++;
    }
    const wname = weaponId === 'grenade' ? 'Grenade' : WEAPONS[weaponId]?.name ?? weaponId;
    this.hud.killfeed(killer, victim, wname, headshot);
    if (killer === this.player && victim !== this.player) this.hud.onKill(victim, headshot, killer.streak);
    if (victim === this.player) this.hud.onDeath(killer, wname, headshot);
    this.emitNoise(victim.pos, 8, victim, 'death');
    this.checkWin();
  }

  checkWin() {
    const m = this.match;
    if (!m || m.over) return;
    let winner = -1;
    if (m.scores[0] >= m.scoreLimit) winner = 0;
    else if (m.scores[1] >= m.scoreLimit) winner = 1;
    else if (m.timeLeft <= 0) winner = m.scores[0] === m.scores[1] ? 2 : m.scores[0] > m.scores[1] ? 0 : 1;
    if (winner >= 0) {
      m.over = true;
      m.winner = winner;
      this.slowmo = 0.3;
      this.later(1.0, () => {
        this.slowmo = 1;
        this.state = 'ended';
        this.input.unlock();
        this.emit('matchEnd', m);
      });
    }
  }

  emitNoise(pos, radius, source, kind) {
    for (const a of this.actors) {
      if (a.bot && a.alive && a !== source) a.bot.onNoise(pos, radius, source, kind);
    }
  }

  reportSighting(team, enemy) {
    this.intel[team].set(enemy.id, { pos: enemy.pos.clone(), time: this.time, actor: enemy });
  }

  freshIntel(team, maxAge) {
    let best = null;
    for (const v of this.intel[team].values()) {
      if (!v.actor.alive || this.time - v.time > maxAge) continue;
      if (!best || v.time > best.time) best = v;
    }
    return best;
  }

  isSpotted(enemy, team) {
    const v = this.intel[team].get(enemy.id);
    return !!(v && enemy.alive && this.time - v.time < 1.2);
  }

  nearestPickup(type, pos, maxDist) {
    return this.pickups.nearest(type, pos, maxDist);
  }

  onShot(a) {
    // gunfire briefly reveals the shooter to the other team's radar, CS-style "you heard that"
    if (a.team !== this.match?.playerTeam && a.pos.distanceTo(this.camera.position) < 30) this.intel[this.match.playerTeam].set(a.id, { pos: a.pos.clone(), time: this.time - 0.6, actor: a, heard: true });
  }

  playerMuzzle(out) {
    const vm = this.viewmodel;
    if (vm.gun) {
      vm.camera.updateMatrixWorld(true);
      vm.gun.muzzle.getWorldPosition(out);
      vm.camera.worldToLocal(out);
      this.camera.updateMatrixWorld();
      return this.camera.localToWorld(out);
    }
    return this.player.eye(out);
  }

  shake(amount) {
    this.playerCtl.shake = Math.max(this.playerCtl.shake, amount);
  }

  // ------------------------------------------------------------------ loop

  frame() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (this.state === 'playing') {
      if (this.input.enabled && this.input.hit('loadout') && !this.hud.loadoutOpen) this.emit('openLoadout');
      dt *= this.slowmo;
      // fixed-ish sub steps keep physics stable at low frame rates
      const steps = Math.ceil(dt / (1 / 60));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        this.update(h);
        // key/button presses only count once per frame, not once per sub-step
        if (i === 0) this.input.pressed.clear();
      }
    } else if (this.state === 'menu') {
      this.menuT += dt;
    }
    this.render(dt);
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    const m = this.match;
    const frozen = this.time < m.startAt;
    if (!frozen && !m.over) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) {
        m.timeLeft = 0;
        this.checkWin();
      }
    }
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.time >= this.timers[i].t) {
        const t = this.timers[i];
        this.timers.splice(i, 1);
        t.fn();
      }
    }

    // player input happens once per sub-step (mouse deltas are consumed on the first)
    if (!this.player.bot) this.playerCtl.update(dt, frozen || m.over);

    for (const a of this.actors) {
      if (!a.alive) {
        if (this.time >= a.respawnAt && !m.over) {
          if (!a.isPlayer || !this.hud.loadoutOpen) this.respawn(a);
        }
        continue;
      }
      if (a.bot) {
        if (frozen || m.over) {
          a.input.x = 0;
          a.input.z = 0;
        } else a.bot.update(dt);
      }
      const ev = a.move(this.world, dt);
      a.updateLean(this.world, a.input.lean, dt);
      if (ev.footstep && !a.crouching && !a.input.walk) {
        const surf = this.surfaceAt(a.pos);
        this.audio.play('step', { pos: a.isPlayer ? undefined : a.pos, volume: a.isPlayer ? 0.35 : 0.9, surface: surf, pitch: 0.9 + Math.random() * 0.2 });
        this.emitNoise(a.pos, a.sprinting ? 22 : 15, a, 'step');
      }
      if (ev.landed > 4) {
        this.audio.play('land', { pos: a.isPlayer ? undefined : a.pos, volume: Math.min(1, ev.landed / 9) });
        if (a.isPlayer) this.viewmodel.land(ev.landed);
        // fall damage from real drops only
        if (ev.landed > 13) this.damage(a, (ev.landed - 13) * 9, null, 'fall', 'body', null);
      }
      // regen option
      if (m.healthRegen && a.health < MAX_HEALTH && this.time - a.lastHurt > 6) a.health = Math.min(MAX_HEALTH, a.health + 12 * dt);
      // fell out of the world somehow
      if (a.pos.y < -5) this.respawn(a);
    }
    this.separateActors();
    this.combat.updateGrenades(dt);
    this.pickups.update(dt);
    this.fx.update(dt);
  }

  separateActors() {
    const A = this.actors;
    const minD = PHYS.radius * 2 * 0.95;
    for (let i = 0; i < A.length; i++) {
      const a = A[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        if (Math.abs(dx) > minD || Math.abs(dz) > minD) continue;
        if (a.pos.y + a.height < b.pos.y || b.pos.y + b.height < a.pos.y) continue;
        const d = Math.hypot(dx, dz) || 0.001;
        const push = (minD - d) / 2;
        if (push <= 0) continue;
        const nx = dx / d;
        const nz = dz / d;
        // the player gets shoved a bit less than bots
        const wa = a.isPlayer ? 0.4 : b.isPlayer ? 1.6 : 1;
        const wb = 2 - wa;
        nudgeBody(this.world, a, -nx * push * wa, -nz * push * wa);
        nudgeBody(this.world, b, nx * push * wb, nz * push * wb);
      }
    }
  }

  surfaceAt(p) {
    if (p.y > 0.13) {
      for (const f of this.builder.footprints) {
        if (f.type !== 'building' && f.type !== 'church') continue;
        if (p.x > f.x0 && p.x < f.x1 && p.z > f.z0 && p.z < f.z1) return 'wood';
      }
      return 'hard';
    }
    for (const s of this.builder.surfaces || []) {
      if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1) return s.mat === 'grass' ? 'grass' : 'hard';
    }
    return 'grass';
  }

  render(dt) {
    const cam = this.camera;
    const p = this.player;
    if (this.state === 'menu' || !p) {
      // slow fly-over of the town behind the menu
      const t = this.menuT * 0.05;
      cam.position.set(Math.cos(t) * 62, 26 + Math.sin(t * 0.7) * 4, Math.sin(t) * 46);
      cam.lookAt(0, 2, 0);
      if (cam.fov !== 60) {
        cam.fov = 60;
        cam.updateProjectionMatrix();
      }
    } else if (p.alive) {
      this.playerCtl.updateCamera(cam, dt);
    } else {
      // death cam: orbit the body and look at whoever got you
      const t = this.time - p.diedAt;
      const k = p.killedBy && p.killedBy !== p && p.killedBy.alive ? p.killedBy : null;
      const ang = p.yaw + Math.PI + t * 0.25;
      const want = tmp.set(p.pos.x + Math.sin(ang) * 3.2, p.pos.y + 2.4, p.pos.z + Math.cos(ang) * 3.2);
      // keep the camera out of walls
      const dir = want.clone().sub(p.pos).setY(0);
      const len = dir.length();
      dir.normalize();
      const hit = this.world.raycast(p.pos.x, p.pos.y + 2.2, p.pos.z, dir.x, 0, dir.z, len, 'move');
      if (hit) want.set(p.pos.x + dir.x * (hit.t - 0.3), p.pos.y + 2.2, p.pos.z + dir.z * (hit.t - 0.3));
      cam.position.lerp(want, damp(4, dt));
      const look = k ? new THREE.Vector3(k.pos.x, k.pos.y + 1, k.pos.z) : new THREE.Vector3(p.pos.x, p.pos.y + 0.4, p.pos.z);
      const m = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const q = new THREE.Quaternion().setFromRotationMatrix(m);
      cam.quaternion.slerp(q, damp(3, dt));
      cam.rotation.order = 'YXZ';
    }
    this.sky.position.copy(cam.position);
    // keep the shadow camera centred near the action for crisper shadows
    for (const a of this.actors) a.model.update(dt * (this.state === 'playing' ? this.slowmo : 1), a);
    this.audio.setListener(cam.position, p && p.alive ? p.yaw : Math.atan2(-cam.getWorldDirection(tmp).x, -tmp.z));

    const r = this.renderer;
    r.clear();
    r.render(this.scene, cam);
    if (p && p.alive && this.state !== 'menu') {
      this.viewmodel.update(dt, {
        actor: p,
        weapon: p.weapon,
        mouse: this.playerCtl.mouse,
        speed: Math.hypot(p.vel.x, p.vel.z),
        roll: cam.rotation.z,
        healProgress: p.healT,
        throwProgress: p.throwT >= 0 ? p.throwT / 0.6 : -1,
      });
      this.viewmodel.render(r);
    }
    if (this.state !== 'menu') this.hud.update(dt);
  }
}
