// ============================================================
// DOOMMAPS — HUD: DOOM status bar (canvas), pixel numbers,
// face, arms, keys, armor, messages, toasts
// ============================================================
import { WEAPON_DEFS } from "./weapons.js";

// ---------- blocky pixel digits ----------
const FONT = {
  "0": ["111", "101", "101", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["111", "001", "001", "111", "100", "100", "111"],
  "3": ["111", "001", "001", "111", "001", "001", "111"],
  "4": ["101", "101", "101", "111", "001", "001", "001"],
  "5": ["111", "100", "100", "111", "001", "001", "111"],
  "6": ["111", "100", "100", "111", "101", "101", "111"],
  "7": ["111", "001", "001", "010", "010", "010", "010"],
  "8": ["111", "101", "101", "111", "101", "101", "111"],
  "9": ["111", "101", "101", "111", "001", "001", "111"],
  "%": ["101", "001", "010", "010", "100", "101", "000"],
  "-": ["000", "000", "000", "111", "000", "000", "000"],
  "/": ["001", "001", "010", "010", "100", "100", "000"],
  "!": ["010", "010", "010", "010", "010", "000", "010"],
  ".": ["000", "000", "000", "000", "000", "010", "010"],
  " ": ["000", "000", "000", "000", "000", "000", "000"],
};
const digitCache = {};
function getDigit(ch, color, s = 2) {
  const key = ch + color + s;
  if (digitCache[key]) return digitCache[key];
  const rows = FONT[ch] || FONT[" "];
  const cv = document.createElement("canvas");
  cv.width = 3 * s; cv.height = 7 * s;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = color;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 3; x++) {
    if (rows[y][x] === "1") ctx.fillRect(x * s, y * s, s - (s > 1 ? 1 : 0), s - (s > 1 ? 1 : 0));
  }
  digitCache[key] = cv;
  return cv;
}
function drawNumber(ctx, x, y, text, color, s) {
  let cx = x;
  for (const ch of String(text)) {
    ctx.drawImage(getDigit(ch, color, s), cx, y);
    cx += 4 * s;
  }
  return cx;
}
function numWidth(text, s) { return String(text).length * 4 * s; }

// ---------------- HUD class ----------------
export class HUD {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.messages = [];       // {text, t}
    this.toast = null;        // {text, color, t, dur}
    this.faceRect = null;
    this.frame = 0;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    canvas.parentElement.addEventListener("mousedown", (e) => {
      if (this.faceRect) {
        const r = this.faceRect;
        if (e.clientX >= r.x && e.clientX <= r.x + r.w && e.clientY >= r.y && e.clientY <= r.y + r.h) {
          game.onFaceClick();
        }
      }
    });
  }
  resize() {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  }
  notify(text) {
    this.messages.push({ text, t: 4 });
    if (this.messages.length > 10) this.messages.shift();
  }
  announce(text, color = "#f7d84b", dur = 2.4) { this.toast = { text, color, t: dur, dur }; }
  triggerGrin(strong) { this.game.face.onGrin(strong); }

  draw(dt) {
    const { ctx, cv } = this;
    const game = this.game;
    const p = game.player;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (game.state !== "playing" && game.state !== "dead" && game.state !== "victory") return;
    this.frame++;

    const mode = game.settings.hudMode;
    // weapon view model (always, unless hud off)
    if (mode < 3 && !game.automapOpen) {
      game.weapons.draw(ctx, cv.width, cv.height, p, game.settings);
    }
    if (mode >= 3) return;

    // timers
    for (const m of this.messages) m.t -= dt;
    while (this.messages.length && this.messages[0].t <= 0) this.messages.shift();

    const scale = game.settings.hudScale;
    const full = mode === 0;

    if (mode <= 1) this.drawStatusBar(full, scale);
    else this.drawMinimal(scale);

    // message log
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `${7 * scale}px monospace`;
    let my = 10;
    for (const m of this.messages) {
      ctx.globalAlpha = Math.min(1, m.t);
      ctx.fillStyle = "#00000088";
      ctx.fillText(m.text, 11, my + 1);
      ctx.fillStyle = "#ffd94a";
      ctx.fillText(m.text, 10, my);
      my += 9 * scale;
    }
    ctx.globalAlpha = 1;

    // toast
    if (this.toast) {
      this.toast.t -= dt;
      if (this.toast.t <= 0) this.toast = null;
      else {
        const a = Math.min(1, this.toast.t / (this.toast.dur * 0.3));
        ctx.globalAlpha = a;
        ctx.font = `bold ${11 * scale}px monospace`;
        ctx.textAlign = "center";
        ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
        ctx.strokeText(this.toast.text, cv.width / 2, cv.height * 0.2);
        ctx.fillStyle = this.toast.color;
        ctx.fillText(this.toast.text, cv.width / 2, cv.height * 0.2);
        ctx.globalAlpha = 1;
      }
    }

    // face quip bubble
    if (game.face.quipT > 0 && this.faceRect) {
      ctx.font = `bold ${6 * scale}px monospace`;
      ctx.textAlign = "center";
      const qx = this.faceRect.x + this.faceRect.w / 2;
      const qy = this.faceRect.y - 10 * scale;
      const qw = ctx.measureText(game.face.quip).width + 12;
      ctx.fillStyle = "#000";
      ctx.fillRect(qx - qw / 2, qy - 8 * scale, qw, 9 * scale);
      ctx.strokeStyle = "#f7d84b";
      ctx.strokeRect(qx - qw / 2, qy - 8 * scale, qw, 9 * scale);
      ctx.fillStyle = "#f7d84b";
      ctx.fillText(game.face.quip, qx, qy - 4 * scale);
    }

    // crosshair
    if (game.settings.crosshair && !game.settings.classicCamera) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(cv.width / 2 - 1, cv.height / 2 - 1, 3, 3);
      ctx.fillRect(cv.width / 2 - 8, cv.height / 2, 5, 1);
      ctx.fillRect(cv.width / 2 + 4, cv.height / 2, 5, 1);
      ctx.fillRect(cv.width / 2, cv.height / 2 - 8, 1, 5);
      ctx.fillRect(cv.width / 2, cv.height / 2 + 4, 1, 5);
    }

    // berserk / powerup indicators (top right)
    let indY = 10;
    ctx.textAlign = "right";
    ctx.font = `${6 * scale}px monospace`;
    const ind = (txt, color) => {
      ctx.fillStyle = "#000000aa";
      ctx.fillText(txt, cv.width - 9, indY + 1);
      ctx.fillStyle = color;
      ctx.fillText(txt, cv.width - 10, indY);
      indY += 8 * scale;
    };
    if (p.berserkTintT > 0) ind("BERSERK " + Math.ceil(p.berserkTintT), "#ff4444");
    if (p.invulnT > 0) ind("INVULNERABLE " + Math.ceil(p.invulnT), "#7aff7a");
    if (p.radT > 0) ind("RAD-SUIT " + Math.ceil(p.radT), "#ffe86a");
    if (p.liteT > 0) ind("LIGHT-AMP " + Math.ceil(p.liteT), "#8ff8ff");
    if (p.invisT > 0) ind("PARTIAL INVIS " + Math.ceil(p.invisT), "#c0c0ff");
  }

  drawStatusBar(full, scale) {
    const { ctx, cv } = this;
    const game = this.game;
    const p = game.player;
    const barH = 32 * scale * (full ? 1.6 : 1.3);
    const y0 = cv.height - barH;
    const W = cv.width;

    // bar background — classic beveled gray
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, y0, W, barH);
    ctx.fillStyle = "#6b6b6b";
    ctx.fillRect(0, y0, W, 2);
    ctx.fillStyle = "#161616";
    ctx.fillRect(0, y0 + barH - 2, W, 2);
    // scanline texture
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    for (let y = y0 + 3; y < y0 + barH; y += 4) ctx.fillRect(0, y, W, 1);

    const seg = (x0, w, label) => {
      ctx.fillStyle = "#2c2c2c";
      ctx.fillRect(x0 + 2, y0 + 3, w - 4, barH - 6);
      ctx.fillStyle = "#0f0f0f";
      ctx.fillRect(x0 + 2, y0 + 3, w - 4, 1);
      ctx.fillRect(x0 + 2, y0 + 3, 1, barH - 6);
      if (label) {
        ctx.fillStyle = "#8b8b8b";
        ctx.font = `bold ${5 * scale}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(label, x0 + w / 2, y0 + 6 * scale * 0.9);
      }
    };

    const ammoColor = (n) => n < 10 && n > 0 ? (this.frame % 40 < 20 ? "#ff3222" : "#f7d84b") : n <= 0 ? "#ff3222" : "#f7d84b";
    const healthColor = (n) => n >= 50 ? "#f7d84b" : n >= 25 ? "#e8842c" : this.frame % 40 < 20 ? "#ff3222" : "#c01010";

    if (full) {
      const segments = 6;
      const w0 = W / segments;

      // AMMO
      const d = game.weapons.def;
      const cur = d.ammo ? (p.ammo[d.ammo] || 0) : "—";
      seg(0, w0, "AMMO");
      drawNumber(ctx, (w0 - numWidth(String(cur), scale * 1.7)) / 2, y0 + barH * 0.32, String(cur), ammoColor(d.ammo ? p.ammo[d.ammo] || 0 : 99), scale * 1.7);
      if (d.ammo) {
        ctx.fillStyle = "#8b8b8b";
        ctx.font = `${4.4 * scale}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(`${p.ammo[d.ammo]} / ${p.maxAmmo[d.ammo]}`, w0 / 2, y0 + barH * 0.8);
      }

      // ARMOR
      seg(w0, w0, "ARMOR");
      drawNumber(ctx, w0 + (w0 - numWidth(p.armor + "%", scale * 1.7)) / 2, y0 + barH * 0.32, p.armor + "%", p.armor > 0 ? healthColor(Math.max(10, p.armor)) : "#777", scale * 1.7);

      // FACE
      seg(w0 * 2, w0, null);
      const faceCv = game.face.getCanvas(p);
      const fh = barH * 0.92;
      const fw = fh * (46 / 52);
      const fx = w0 * 2 + (w0 - fw) / 2;
      const fy = y0 + (barH - fh) / 2 + 1;
      ctx.drawImage(faceCv, fx, fy, fw, fh);
      this.faceRect = { x: fx, y: fy, w: fw, h: fh };
      // frame rivets
      ctx.fillStyle = "#555";
      ctx.fillRect(fx - 3, fy - 2, 2, 2); ctx.fillRect(fx + fw + 1, fy - 2, 2, 2);
      ctx.fillRect(fx - 3, fy + fh - 1, 2, 2); ctx.fillRect(fx + fw + 1, fy + fh - 1, 2, 2);

      // HEALTH
      seg(w0 * 3, w0, "HEALTH");
      const hText = Math.max(0, Math.ceil(p.health)) + "%";
      drawNumber(ctx, w0 * 3 + (w0 - numWidth(hText, scale * 1.7)) / 2, y0 + barH * 0.32, hText, healthColor(p.health), scale * 1.7);

      // ARMS (weapon slots)
      seg(w0 * 4, w0, "ARMS");
      const slotOrder = [1, 2, 3, 4, 5, 6, 7];
      const slotW = (w0 - 16) / 7;
      for (const s of slotOrder) {
        const wname = Object.keys(WEAPON_DEFS).find(k => WEAPON_DEFS[k].slot === s);
        const owned = p.weapons.has(wname);
        const active = game.weapons.current === wname;
        const sx = w0 * 4 + 8 + (s - 1) * slotW;
        const sy = y0 + barH * 0.34;
        ctx.fillStyle = active ? "#e8e8e8" : owned ? "#8f8f8f" : "#3c3c3c";
        ctx.fillRect(sx, sy, slotW - 3, barH * 0.44);
        ctx.fillStyle = active ? "#111" : owned ? "#222" : "#2a2a2a";
        ctx.font = `bold ${(barH * 0.3) | 0}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(String(s), sx + (slotW - 3) / 2, sy + barH * 0.34);
      }

      // KEYS
      seg(w0 * 5, w0, "KEYS");
      const keyColors = { red: "#e02838", blue: "#2868f0", yellow: "#f0c828" };
      let ki = 0;
      for (const k of ["blue", "yellow", "red"]) {
        const owned = p.keys.has(k);
        const kx = w0 * 5 + w0 / 2 - (scale * 10) + ki * scale * 7;
        const ky = y0 + barH * 0.34;
        ctx.fillStyle = owned ? keyColors[k] : "#262626";
        ctx.fillRect(kx, ky, scale * 5, barH * 0.44);
        ctx.fillStyle = owned ? "#00000055" : "#151515";
        ctx.fillRect(kx + 1, ky + barH * 0.44 - 3, scale * 5 - 2, 2);
        if (owned && game.keyFlashT > 0 && game.keyFlashKey === k && this.frame % 20 < 10) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(kx, ky, scale * 5, barH * 0.44);
        }
        ki++;
      }
    } else {
      // compact bar: AMMO | FACE | HEALTH
      const w0 = W / 3;
      const d = game.weapons.def;
      const cur = d.ammo ? (p.ammo[d.ammo] || 0) : "—";
      seg(0, w0, "AMMO");
      drawNumber(ctx, (w0 - numWidth(String(cur), scale * 1.6)) / 2, y0 + barH * 0.36, String(cur), ammoColor(d.ammo ? p.ammo[d.ammo] || 0 : 99), scale * 1.6);
      seg(w0, w0, null);
      const faceCv = game.face.getCanvas(p);
      const fh = barH * 0.92, fw = fh * (46 / 52);
      ctx.drawImage(faceCv, w0 + (w0 - fw) / 2, y0 + (barH - fh) / 2 + 1, fw, fh);
      this.faceRect = { x: w0 + (w0 - fw) / 2, y: y0 + (barH - fh) / 2, w: fw, h: fh };
      const healthColor2 = (n) => n >= 50 ? "#f7d84b" : n >= 25 ? "#e8842c" : "#ff3222";
      seg(w0 * 2, w0, "HEALTH");
      const hText = Math.max(0, Math.ceil(p.health)) + "%";
      drawNumber(ctx, w0 * 2 + (w0 - numWidth(hText, scale * 1.6)) / 2, y0 + barH * 0.36, hText, healthColor2(p.health), scale * 1.6);
    }
  }

  drawMinimal(scale) {
    const { ctx, cv } = this;
    const p = this.game.player;
    const d = this.game.weapons.def;
    const cur = d.ammo ? (p.ammo[d.ammo] || 0) : "—";
    drawNumber(ctx, 14, cv.height - 30 * scale, String(cur), "#f7d84b", scale * 1.4);
    const hText = Math.max(0, Math.ceil(p.health)) + "%";
    drawNumber(ctx, cv.width - numWidth(hText, scale * 1.4) - 14, cv.height - 30 * scale, hText, p.health >= 25 ? "#f7d84b" : "#ff3222", scale * 1.4);
    const faceCv = this.game.face.getCanvas(p);
    const fh = 16 * scale;
    ctx.drawImage(faceCv, (cv.width - fh) / 2, cv.height - fh - 6, fh, fh * (52 / 46));
  }
}
