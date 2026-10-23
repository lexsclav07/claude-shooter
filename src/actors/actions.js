// Weapon handling shared by the player and the bots: firing, reloading, switching,
// aiming, healing and grenade throws. The caller fills in a command each frame.

import * as THREE from 'three';
import { MEDKIT_HEAL, MEDKIT_TIME, MAX_HEALTH } from '../config.js';
import { DEG, clamp, approach } from '../util.js';

const tmpO = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpR = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpM = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export function makeCommand() {
  return { fire: false, firePressed: false, ads: false, reload: false, slot: null, grenade: false, heal: false };
}

function spreadDir(base, angle, out) {
  if (angle <= 0) return out.copy(base);
  const th = angle * Math.sqrt(Math.random());
  const ph = Math.random() * Math.PI * 2;
  tmpR.crossVectors(base, UP);
  if (tmpR.lengthSq() < 1e-6) tmpR.set(1, 0, 0);
  tmpR.normalize();
  tmpU.crossVectors(tmpR, base).normalize();
  const t = Math.tan(th);
  return out
    .copy(base)
    .addScaledVector(tmpR, Math.cos(ph) * t)
    .addScaledVector(tmpU, Math.sin(ph) * t)
    .normalize();
}

export function updateActions(game, a, cmd, dt) {
  if (!a.alive) return;
  const w = a.weapon;
  const isPlayer = a === game.player;
  const sndPos = isPlayer ? undefined : a.pos;

  a.switchT = Math.max(0, a.switchT - dt);
  a.spawnProtect = Math.max(0, a.spawnProtect - dt);
  a.sprintOut = a.sprinting ? 0.14 : Math.max(0, (a.sprintOut ?? 0) - dt);

  for (const slot of ['primary', 'secondary', 'melee']) {
    const ws = a.weapons[slot];
    if (!ws) continue;
    const ev = ws.update(slot === a.slot ? dt : 0);
    if (slot === a.slot && ev) {
      if (ev === 'shell') game.audio.play('shell', { pos: sndPos });
      else if (ev === 'done') game.audio.play(ws.def.shellReload ? 'pump' : 'magIn', { pos: sndPos });
    }
  }
  // recoil recovery
  if (w) {
    const rec = w.def.recoil.recover;
    if (w.sinceShot > 0.07) {
      const k = Math.exp(-rec * dt);
      a.recoilPitch *= k;
      a.recoilYaw *= k;
    }
  }

  // healing channel
  if (a.healT >= 0) {
    a.healT += dt;
    if (cmd.firePressed || cmd.slot) {
      a.healT = -1;
    } else if (a.healT >= MEDKIT_TIME) {
      a.healT = -1;
      a.medkits--;
      a.health = Math.min(MAX_HEALTH, a.health + MEDKIT_HEAL);
      game.audio.play('healDone', { pos: sndPos });
      a.switchT = w ? w.def.draw * 0.5 : 0;
    }
  } else if (cmd.heal && a.medkits > 0 && a.health < MAX_HEALTH && a.throwT < 0) {
    a.healT = 0;
    if (w) w.cancelReload();
    a.adsT = 0;
    game.audio.play('heal', { pos: sndPos });
  }

  // grenade throw
  if (a.throwT >= 0) {
    const prev = a.throwT;
    a.throwT += dt;
    if (prev < 0.32 && a.throwT >= 0.32) {
      game.combat.throwGrenade(a, cmd.throwScale ?? 1);
      a.grenades--;
    }
    if (a.throwT >= 0.6) {
      a.throwT = -1;
      a.switchT = w ? w.def.draw * 0.5 : 0;
    }
  } else if (cmd.grenade && a.grenades > 0 && a.healT < 0) {
    a.throwT = 0;
    if (w) w.cancelReload();
    a.adsT = 0;
    game.audio.play('pin', { pos: sndPos });
  }

  const busy = a.healT >= 0 || a.throwT >= 0;

  // weapon switching
  if (cmd.slot && !busy) {
    if (a.switchTo(cmd.slot)) game.audio.play('draw', { pos: sndPos, volume: 0.6 });
  }

  if (!w) return;
  const def = w.def;

  // aim down sights
  const canAds = !busy && !a.sprinting && a.switchT <= 0 && w.reloadT <= 0 && a.slideT <= 0 && w.boltT <= 0;
  const target = cmd.ads && canAds ? 1 : 0;
  a.adsT = approach(a.adsT, target, dt / def.adsTime);

  // reload
  if (cmd.reload && !busy && w.startReload()) {
    a.adsT = Math.min(a.adsT, 0.2);
    game.audio.play('magOut', { pos: sndPos });
  }

  // fire
  if (busy || a.switchT > 0 || a.sprintOut > 0) return;
  if (w.reloadT > 0) {
    // shotguns can interrupt a shell-by-shell reload
    if (def.shellReload && cmd.firePressed && w.ammo > 0) w.cancelReload();
    else return;
  }
  if (w.cooldown > 0 || w.boltT > 0) return;
  const wants = def.auto ? cmd.fire : cmd.firePressed;
  if (!wants) return;
  if (def.mag > 0 && w.ammo <= 0) {
    if (cmd.firePressed) game.audio.play('click', { pos: sndPos });
    if (w.reserve > 0 && w.startReload()) game.audio.play('magOut', { pos: sndPos });
    return;
  }
  shoot(game, a, w);
}

export function shoot(game, a, w) {
  const def = w.def;
  const isPlayer = a === game.player;
  a.spawnProtect = 0;
  a.lastShotTime = game.time;
  if (def.cls === 'melee') {
    w.cooldown = 60 / def.rpm;
    w.sinceShot = 0;
    game.audio.play('knife', { pos: isPlayer ? undefined : a.pos });
    if (isPlayer) game.viewmodel.swing();
    // the hit lands a moment into the swing
    game.later(0.12, () => {
      if (a.alive) game.combat.melee(a, def);
    });
    return;
  }
  const origin = a.eye(tmpO);
  const base = a.aimDir(tmpD).clone();
  const inacc = w.inaccuracy(a) * DEG;
  const pellets = def.pellets || 1;
  // muzzle position for tracers
  if (isPlayer) game.playerMuzzle(tmpM);
  else a.model.muzzleWorld(tmpM);
  const dir = new THREE.Vector3();
  for (let i = 0; i < pellets; i++) {
    spreadDir(base, inacc + (pellets > 1 ? def.pelletSpread * DEG : 0), dir);
    const end = game.combat.fireBullet(a, origin, dir, def);
    const tracerChance = isPlayer ? (pellets > 1 ? 0.25 : 0.45) : pellets > 1 ? 0.2 : 0.6;
    if (Math.random() < tracerChance) game.fx.tracer(tmpM, end);
  }
  w.onFired();
  const [up, side] = w.kick();
  const k = a.crouching ? 0.85 : 1;
  a.recoilPitch = clamp(a.recoilPitch + up * DEG * k, -0.6, 0.6);
  a.recoilYaw = clamp(a.recoilYaw + side * DEG * k, -0.4, 0.4);
  if (def.scope) a.adsT = 0; // bolt-action: drops out of the scope until the bolt is cycled
  game.audio.play(def.sound, { pos: isPlayer ? undefined : a.pos });
  if (def.cls === 'sniper') game.later(0.45, () => game.audio.play('bolt', { pos: isPlayer ? undefined : a.pos }));
  if (def.cls === 'shotgun') game.later(0.3, () => game.audio.play('pump', { pos: isPlayer ? undefined : a.pos }));
  game.fx.flashLight(tmpM, isPlayer ? 3 : 5, 0.05);
  if (isPlayer) game.viewmodel.fire(def);
  else a.model.muzzleFlash();
  game.emitNoise(origin, 70, a, 'shot');
  game.onShot(a);
}
