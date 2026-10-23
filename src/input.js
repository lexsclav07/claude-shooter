// Keyboard + mouse input with pointer lock and rebindable actions.

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.down = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.onLockChange = null;
    this.onKeyCapture = null; // used by the key rebinding UI

    window.addEventListener('keydown', (e) => {
      if (this.onKeyCapture) {
        e.preventDefault();
        this.onKeyCapture(e.code);
        return;
      }
      if (!this.enabled) return;
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (this.onKeyCapture) {
        e.preventDefault();
        this.onKeyCapture(`Mouse${e.button}`);
        return;
      }
      if (!this.enabled) return;
      const c = `Mouse${e.button}`;
      this.down.add(c);
      this.pressed.add(c);
    });
    window.addEventListener('mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    window.addEventListener('contextmenu', (e) => {
      if (this.enabled || this.locked) e.preventDefault();
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.enabled) this.wheel += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignore the occasional giant spike some browsers emit on lock
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      if (was !== this.locked && this.onLockChange) this.onLockChange(this.locked);
    });
  }

  _isGameKey(code) {
    for (const keys of Object.values(this.settings.keys)) if (keys.includes(code)) return true;
    return code === 'Tab' || code === 'Space';
  }

  async lock() {
    try {
      await this.canvas.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try {
        await this.canvas.requestPointerLock();
      } catch {
        return false;
      }
    }
    return true;
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  held(action) {
    const keys = this.settings.keys[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }

  hit(action) {
    const keys = this.settings.keys[action];
    if (!keys) return false;
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }

  mouseHeld(b) {
    return this.down.has(`Mouse${b}`);
  }

  mouseHit(b) {
    return this.pressed.has(`Mouse${b}`);
  }

  takeMouse() {
    const d = { x: this.dx, y: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  endFrame() {
    this.pressed.clear();
  }
}
