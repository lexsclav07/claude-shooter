// Turns keyboard/mouse into actor intent + weapon commands, and drives the camera.

import { makeCommand, updateActions } from './actions.js';
import { PHYS } from '../config.js';
import { clamp, damp, lerp, DEG } from '../util.js';

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.cmd = makeCommand();
    this.crouchToggled = false;
    this.adsToggled = false;
    this.eyeY = null;
    this.mouse = { x: 0, y: 0 };
    this.shake = 0;
    this.fovKick = 0;
  }

  reset() {
    this.crouchToggled = false;
    this.adsToggled = false;
    this.eyeY = null;
  }

  update(dt, frozen) {
    const g = this.game;
    const a = g.player;
    const inp = g.input;
    const S = g.settings;
    const cmd = this.cmd;
    const m = inp.takeMouse();
    this.mouse.x = m.x;
    this.mouse.y = m.y;
    if (!a.alive) {
      inp.takeWheel();
      return;
    }

    // mouse look, slower while zoomed so aim feels consistent
    const w = a.weapon;
    const zoom = w ? lerp(1, w.def.zoom, a.adsT) : 1;
    const adsK = lerp(1, S.adsSensitivity, Math.min(1, a.adsT * 1.5));
    const sens = 0.0011 * S.sensitivity * adsK / zoom;
    a.yaw -= m.x * sens;
    a.pitch -= m.y * sens * (S.invertY ? -1 : 1);
    a.pitch = clamp(a.pitch, -1.53, 1.53);

    // movement
    const f = (inp.held('forward') ? 1 : 0) - (inp.held('back') ? 1 : 0);
    const s = (inp.held('right') ? 1 : 0) - (inp.held('left') ? 1 : 0);
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    const rx = Math.cos(a.yaw);
    const rz = -Math.sin(a.yaw);
    let x = fx * f + rx * s;
    let z = fz * f + rz * s;
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    if (frozen) {
      x = 0;
      z = 0;
    }
    a.input.x = x;
    a.input.z = z;
    a.input.forward = f > 0;
    a.input.jump = !frozen && inp.held('jump');
    a.input.walk = inp.held('walk');
    if (inp.hit('crouch')) this.crouchToggled = !this.crouchToggled;
    a.input.crouchPressed = !frozen && inp.hit('crouch');
    a.input.crouch = S.toggleCrouch ? this.crouchToggled : inp.held('crouch');
    const fireHeld = inp.mouseHeld(0);
    a.input.sprint = inp.held('sprint') && f > 0 && !fireHeld;
    a.input.lean = (inp.held('leanRight') ? 1 : 0) - (inp.held('leanLeft') ? 1 : 0);

    // weapon commands
    cmd.fire = !frozen && fireHeld;
    cmd.firePressed = !frozen && inp.mouseHit(0);
    if (inp.mouseHit(2)) this.adsToggled = !this.adsToggled;
    cmd.ads = S.toggleAds ? this.adsToggled : inp.mouseHeld(2);
    if (a.sprinting && cmd.ads) a.input.sprint = false;
    cmd.reload = inp.hit('reload');
    cmd.slot = null;
    if (inp.hit('primary')) cmd.slot = 'primary';
    if (inp.hit('secondary')) cmd.slot = 'secondary';
    if (inp.hit('melee')) cmd.slot = 'melee';
    if (inp.hit('lastWeapon')) cmd.slot = a.lastSlot;
    const wheel = inp.takeWheel();
    if (wheel !== 0) {
      const order = ['primary', 'secondary', 'melee'];
      const i = order.indexOf(a.slot);
      cmd.slot = order[(i + (wheel > 0 ? 1 : -1) + 3) % 3];
    }
    if (cmd.slot) this.adsToggled = false;
    cmd.grenade = !frozen && inp.hit('grenade');
    cmd.heal = inp.hit('heal');
    if (inp.hit('inspect')) g.viewmodel.inspect();
    if (frozen) {
      cmd.reload = false;
      cmd.heal = false;
    }
    updateActions(g, a, cmd, dt);
  }

  // Positions the main camera at the player's eye.
  updateCamera(camera, dt) {
    const g = this.game;
    const a = g.player;
    const S = g.settings;
    const target = a.pos.y + a.eyeHeight();
    // smooth out stair steps but follow jumps / falls immediately
    if (this.eyeY === null || !a.grounded || Math.abs(target - this.eyeY) > 1) this.eyeY = target;
    else this.eyeY += (target - this.eyeY) * damp(16, dt);
    const lean = a.lean * PHYS.leanDist * (a.leanClamp ?? 1);
    camera.position.set(a.pos.x + Math.cos(a.yaw) * lean, this.eyeY, a.pos.z - Math.sin(a.yaw) * lean);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    const sh = this.shake * this.shake;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(
      a.pitch + a.recoilPitch + (Math.random() - 0.5) * sh * 0.06,
      a.yaw + a.recoilYaw + (Math.random() - 0.5) * sh * 0.06,
      -a.lean * PHYS.leanAngle * DEG * (a.leanClamp ?? 1),
    );
    // field of view: zoom when aiming, widen slightly when sprinting / sliding
    const w = a.weapon;
    const zoom = w && a.alive ? lerp(1, w.def.zoom, a.adsT * a.adsT * (3 - 2 * a.adsT)) : 1;
    const hfov = S.fov * DEG;
    const baseV = 2 * Math.atan(Math.tan(hfov / 2) * (9 / 16));
    const kick = (a.sprinting ? 0.05 : 0) + (a.slideT > 0 ? 0.08 : 0);
    this.fovKick += (kick - this.fovKick) * damp(6, dt);
    const v = (2 * Math.atan(Math.tan(baseV / 2) / zoom) + this.fovKick) / DEG;
    if (Math.abs(camera.fov - v) > 0.01) {
      camera.fov = v;
      camera.updateProjectionMatrix();
    }
  }
}
