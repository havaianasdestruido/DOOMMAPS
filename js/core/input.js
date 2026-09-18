// ============================================================
// DOOMMAPS — Input: keyboard, mouse (pointer lock w/ fallback),
// cheat-code buffer, discrete action dispatch
// ============================================================

const ACTION_KEYS = {
  Digit1: "weapon1", Digit2: "weapon2", Digit3: "weapon3", Digit4: "weapon4",
  Digit5: "weapon5", Digit6: "weapon6", Digit7: "weapon7",
  F1: "toggleCamera", F2: "toggleHud", Tab: "automap", Escape: "pause",
  KeyE: "use", Space: "use", F5: "screenshot", Backquote: "console",
  F9: "debugLog", KeyM: "toggleMusic", Enter: "confirm",
};

class InputSystem {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.fire = false;
    this.altFire = false;
    this.useHeld = false;
    this.locked = false;
    this.lockSupported = true;
    this._dragging = false;
    this._lastX = 0; this._lastY = 0;
    this.cheatBuffer = "";
    this.actionHandler = null;
    this.anyKeyHandler = null;
    this.enabled = false;
    this.sens = 1.0;
  }

  init(canvas) {
    this.canvas = canvas;

    window.addEventListener("keydown", (e) => {
      if (e.code === "Tab") e.preventDefault();
      if (e.code === "F5") e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.anyKeyHandler) this.anyKeyHandler(e);
      // cheat buffer (only while gameplay enabled)
      if (this.enabled && e.code.startsWith("Key")) {
        this.cheatBuffer = (this.cheatBuffer + e.code.slice(3)).slice(-16);
      }
      const act = ACTION_KEYS[e.code];
      if (act && this.actionHandler) {
        if ((act === "use" || act === "pause" || act === "automap" || act === "confirm") ||
            this.enabled || act === "pause" || act === "debugLog") {
          if (act === "automap" || act === "screenshot") e.preventDefault();
          this.actionHandler(act);
        }
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener("blur", () => { this.keys.clear(); this.fire = false; this.altFire = false; });

    canvas.addEventListener("mousedown", (e) => {
      if (!this.enabled) return;
      if (!this.locked && this.lockSupported) {
        this.requestLock();
      } else if (!this.locked) {
        this._dragging = true; this._lastX = e.clientX; this._lastY = e.clientY;
      }
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.altFire = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.altFire = false;
      this._dragging = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("mousemove", (e) => {
      if (!this.enabled) return;
      if (this.locked) {
        this.mouseDX += e.movementX * 0.0022 * this.sens;
        this.mouseDY += e.movementY * 0.0022 * this.sens;
      } else if (this._dragging) {
        this.mouseDX += (e.clientX - this._lastX) * 0.006 * this.sens;
        this.mouseDY += (e.clientY - this._lastY) * 0.006 * this.sens;
        this._lastX = e.clientX; this._lastY = e.clientY;
      }
    });

    canvas.addEventListener("wheel", (e) => {
      if (!this.enabled || !this.actionHandler) return;
      this.actionHandler(e.deltaY > 0 ? "wheelNext" : "wheelPrev");
    }, { passive: true });

    // touch (basic dual-zone: left = move, right = look/fire)
    canvas.addEventListener("touchstart", (e) => this._touch(e, "start"), { passive: false });
    canvas.addEventListener("touchmove", (e) => this._touch(e, "move"), { passive: false });
    canvas.addEventListener("touchend", (e) => this._touch(e, "end"), { passive: false });
    this._touchMove = null; this._touchLook = null;

    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked && this.enabled && this.actionHandler) {
        this.actionHandler("lockLost");
      }
    });
  }

  requestLock() {
    if (!this.lockSupported) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        try {
          const p2 = this.canvas.requestPointerLock();
          if (p2 && p2.catch) p2.catch(() => { this.lockSupported = false; });
        } catch (e2) { this.lockSupported = false; }
      });
    } catch (e) {
      try {
        const p2 = this.canvas.requestPointerLock();
        if (p2 && p2.catch) p2.catch(() => { this.lockSupported = false; });
      } catch (e2) { this.lockSupported = false; }
    }
  }
  releaseLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* noop */ }
  }

  _touch(e, phase) {
    if (!this.enabled) return;
    e.preventDefault();
    const w = window.innerWidth, h = window.innerHeight;
    for (const t of e.changedTouches) {
      if (phase === "start") {
        if (t.clientX < w * 0.45 && !this._touchMove) {
          this._touchMove = { id: t.identifier, x0: t.clientX, y0: t.clientY, dx: 0, dy: 0 };
        } else if (!this._touchLook) {
          this._touchLook = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now() };
        }
      } else if (phase === "move") {
        if (this._touchMove && t.identifier === this._touchMove.id) {
          this._touchMove.dx = (t.clientX - this._touchMove.x0) / (w * 0.12);
          this._touchMove.dy = (t.clientY - this._touchMove.y0) / (h * 0.16);
        }
        if (this._touchLook && t.identifier === this._touchLook.id) {
          this.mouseDX += (t.clientX - this._touchLook.x) * 0.005 * this.sens;
          this.mouseDY += (t.clientY - this._touchLook.y) * 0.005 * this.sens;
          this._touchLook.x = t.clientX; this._touchLook.y = t.clientY;
        }
      } else {
        if (this._touchMove && t.identifier === this._touchMove.id) this._touchMove = null;
        if (this._touchLook && t.identifier === this._touchLook.id) {
          if (performance.now() - this._touchLook.t0 < 220) this.fire = true;
          setTimeout(() => this.fire = false, 90);
          this._touchLook = null;
        }
      }
    }
    // virtual keys from move stick
    if (this._touchMove) {
      const m = this._touchMove;
      this._setVK("KeyW", m.dy < -0.25); this._setVK("KeyS", m.dy > 0.25);
      this._setVK("KeyA", m.dx < -0.25); this._setVK("KeyD", m.dx > 0.25);
    } else {
      ["KeyW", "KeyS", "KeyA", "KeyD"].forEach(k => this.keys.delete(k));
    }
  }
  _setVK(code, on) { if (on) this.keys.add(code); else this.keys.delete(code); }

  // ------- per-frame polled state -------
  get moveForward() { return (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0) + (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? -1 : 0); }
  get moveStrafe()  { return (this.keys.has("KeyD") ? 1 : 0) + (this.keys.has("KeyA") ? -1 : 0); }
  get turnKeys()    { return (this.keys.has("ArrowLeft") ? -1 : 0) + (this.keys.has("ArrowRight") ? 1 : 0); }
  get useKey()      { return this.keys.has("KeyE") || this.keys.has("Space"); }
  get jumpKey()     { return this.keys.has("KeyJ"); }
  get runKey()      { return true; } // run is default

  pollMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeCheats() {
    const buf = this.cheatBuffer;
    this.cheatBuffer = "";
    return buf;
  }

  onAction(fn) { this.actionHandler = fn; }
  onAnyKey(fn) { this.anyKeyHandler = fn; }
}

export const INPUT = new InputSystem();
