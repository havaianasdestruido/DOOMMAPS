// ============================================================
// DOOMMAPS — THE FACE. Reactive doomguy status-bar face.
// Procedurally drawn: look dir, blink, blood tiers, grimaces,
// grins, god-mode glow eyes, berserk rage, death.
// ============================================================

const SKIN = ["#e0a880", "#c89060", "#b07848", "#985c34"]; // healthy → pale tiers
const SKIN_D = ["#b07850", "#98683e", "#8a5a30", "#6e4422"];
const HAIR = "#5c3a1c";

const cache = new Map();

/**
 * state = {
 *   look: -1|0|1, blink: bool, blood: 0..4,
 *   expr: 'normal'|'pain'|'grin'|'rage'|'glow'|'dead'
 * }
 */
export function faceCanvas(state, scale = 3) {
  const key = `${state.look}|${state.blink}|${state.blood}|${state.expr}`;
  if (cache.has(key)) return cache.get(key);

  const W = 46, H = 52;
  const cv = document.createElement("canvas");
  cv.width = W * scale; cv.height = H * scale;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const S = scale;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * S, y * S, w * S, h * S); };

  const skin = SKIN[Math.min(state.blood, 3)];
  const skinD = SKIN_D[Math.min(state.blood, 3)];
  const hurt = state.expr === "pain";
  const dead = state.expr === "dead";

  // head shape
  R(8, 2, 30, 6, HAIR);            // hair top
  R(6, 6, 34, 8, HAIR);
  R(4, 14, 3, 26, HAIR);           // sideburns L
  R(39, 14, 3, 26, HAIR);          // sideburns R
  R(6, 8, 34, 30, skin);           // face block
  R(10, 38, 26, 8, skin);          // jaw
  R(12, 46, 22, 4, skin);          // chin
  // ears
  R(3, 20, 4, 8, skinD); R(39, 20, 4, 8, skinD);
  // shading
  R(6, 8, 4, 30, skinD);           // left shade
  R(36, 8, 3, 30, skinD);          // right shade
  R(10, 40, 26, 3, skinD);         // jaw shade
  R(10, 8, 26, 2, "rgba(255,255,255,0.14)"); // forehead light

  const eyeY = 22;
  const look = state.look || 0;
  const paler = state.blood >= 2;

  if (state.expr === "glow") {
    // god mode — golden blazing eyes
    R(10, eyeY, 10, 5, "#fff6a8");
    R(26, eyeY, 10, 5, "#fff6a8");
    R(11, eyeY + 1, 8, 3, "#ffcc22");
    R(27, eyeY + 1, 8, 3, "#ffcc22");
    // glow streaks
    R(12, eyeY - 3, 6, 2, "#ffcc22");
    R(28, eyeY - 3, 6, 2, "#ffcc22");
  } else if (dead) {
    // X X eyes
    for (const ex of [11, 27]) {
      R(ex, eyeY, 2, 2, "#3a2020"); R(ex + 2, eyeY + 2, 2, 2, "#3a2020"); R(ex + 4, eyeY + 4, 2, 2, "#3a2020");
      R(ex + 4, eyeY, 2, 2, "#3a2020"); R(ex + 2, eyeY + 2, 2, 2, "#3a2020"); R(ex, eyeY + 4, 2, 2, "#3a2020");
    }
  } else if (state.blink) {
    R(10, eyeY + 1, 10, 3, skinD);
    R(26, eyeY + 1, 10, 3, skinD);
  } else {
    // whites
    R(10, eyeY, 10, dead ? 2 : 5, paler ? "#d8cfc0" : "#f0e8dc");
    R(26, eyeY, 10, dead ? 2 : 5, paler ? "#d8cfc0" : "#f0e8dc");
    // pupils
    const px = look * 2;
    R(12 + 3 + px, eyeY + 1, 4, 4, "#1d1410");
    R(28 + 3 + px, eyeY + 1, 4, 4, "#1d1410");
    if (hurt || state.expr === "rage") {
      R(12 + 3 + px, eyeY, 4, 2, "#4a1008"); // bloodshot top
      R(28 + 3 + px, eyeY, 4, 2, "#4a1008");
    }
  }

  // brows
  const browY = hurt ? 19 : state.expr === "rage" ? 18 : 17;
  if (hurt || state.expr === "rage") {
    // angry tilted brows
    R(10, browY, 8, 2, HAIR); R(10, browY + 2, 4, 2, HAIR);
    R(28, browY, 8, 2, HAIR); R(32, browY + 2, 4, 2, HAIR);
  } else if (state.expr === "grin") {
    R(10, 16, 10, 2, HAIR); R(26, 16, 10, 2, HAIR);
  } else {
    R(10, 17, 10, 3, HAIR); R(26, 17, 10, 3, HAIR);
  }

  // nose
  R(21, 26, 4, 6, skinD);
  R(20, 31, 6, 2, skinD);

  // mouth
  switch (state.expr) {
    case "pain":
      R(15, 36, 16, 7, "#3a1408");
      for (let i = 0; i < 4; i++) R(16 + i * 4, 37, 2, 2, "#e8dcc8"); // gritted teeth
      for (let i = 0; i < 4; i++) R(16 + i * 4, 40, 2, 2, "#c8b8a0");
      break;
    case "grin":
      R(13, 35, 20, 5, "#582810");
      for (let i = 0; i < 6; i++) R(14 + i * 3, 36, 2, 3, "#f0e8d8");
      R(13, 34, 20, 1, skinD);
      break;
    case "rage":
      R(14, 36, 18, 6, "#4a1808");
      for (let i = 0; i < 5; i++) R(15 + i * 3, 37, 2, 4, "#e0d0b8");
      break;
    case "dead":
      R(17, 37, 12, 7, "#38140c");
      R(19, 44, 8, 2, "#28100a"); // slack jaw
      break;
    case "glow":
      R(13, 35, 20, 4, "#582810");
      for (let i = 0; i < 6; i++) R(14 + i * 3, 36, 2, 2, "#f0e8d8");
      break;
    default:
      if (state.blood >= 2) { R(16, 36, 14, 4, "#4a1c0c"); R(17, 37, 12, 2, "#38140c"); }
      else { R(16, 35, 14, 3, "#7a4020"); R(18, 36, 10, 1, "#5c2e14"); }
  }

  // ---- blood overlays by tier ----
  const blood = "#8c1212";
  if (state.blood >= 1) {
    // hairline cut
    R(9, 10, 3, 2, blood); R(9, 12, 2, 6, blood); R(9, 12, 1, 10, "#6e0c0c");
  }
  if (state.blood >= 2) {
    // nose bleed + cheek gash
    R(20, 32, 2, 4, blood); R(24, 32, 2, 4, blood);
    R(30, 28, 5, 2, blood); R(31, 30, 2, 7, "#6e0c0c");
  }
  if (state.blood >= 3) {
    R(7, 16, 2, 12, blood);               // streaming from hair
    R(14, 42, 4, 6, "#6e0c0c");           // chin drip
    R(33, 20, 3, 10, blood);
    R(26, 44, 3, 5, blood);
  }
  if (state.blood >= 4 || dead) {
    // barely conscious — heavy mask of blood
    R(6, 8, 6, 30, "rgba(120,12,12,0.75)");
    R(30, 12, 8, 26, "rgba(110,10,10,0.7)");
    R(12, 40, 22, 8, "rgba(100,8,8,0.6)");
    R(10, eyeY + 6, 4, 8, "#7e0e0e");    // eye streaming
  }
  cache.set(key, cv);
  return cv;
}

/** Interactive face controller used by HUD */
export class FaceController {
  constructor() {
    this.look = 0;
    this.blink = false;
    this.blinkT = 2.5;
    this.lookT = 1.2;
    this.painT = 0;
    this.grinT = 0;
    this.hurtDir = 0;
    this.quips = [
      "HRNGH!", "LET'S RIP!", "LOCKED & LOADED", "I AM BECOME DOOM",
      "HELL WAITS", "RIP AND TEAR", "*GRRRRR*", "DEMONS? WHERE?",
    ];
    this.quipT = 0;
    this.quip = "";
  }

  onPain(hurtDir) {
    this.painT = 0.55;
    this.hurtDir = hurtDir < -0.6 ? 1 : hurtDir > 0.6 ? -1 : 0;
  }
  onGrin(strong) { this.grinT = strong ? 1.2 : 0.7; }
  onClick() {
    this.painT = 0.3;
    this.grinT = 1.4;
    this.quipT = 2.2;
    this.quip = this.quips[Math.floor(Math.random() * this.quips.length)];
  }

  update(dt) {
    this.painT = Math.max(0, this.painT - dt);
    this.grinT = Math.max(0, this.grinT - dt);
    this.quipT = Math.max(0, this.quipT - dt);
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = true; this._blinkReset = 0.12; this.blinkT = 3 + Math.random() * 5; }
    if (this.blink) { this._blinkReset -= dt; if (this._blinkReset <= 0) this.blink = false; }
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.look = [-1, 0, 0, 1][Math.floor(Math.random() * 4)];
      this.lookT = 0.8 + Math.random() * 2.6;
    }
  }

  /** player → face state */
  getState(player) {
    const blood = player.health > 75 ? 0 : player.health > 50 ? 1 : player.health > 30 ? 2 : player.health > 10 ? 3 : 4;
    let expr = "normal";
    if (player.dead) expr = "dead";
    else if (this.painT > 0) expr = "pain";
    else if (player.invulnT > 0 || player.god) expr = "glow";
    else if (player.berserkTintT > 0) expr = "rage";
    else if (this.grinT > 0) expr = "grin";
    const look = this.painT > 0 ? this.hurtDir : this.look;
    return { look, blink: this.blink && expr !== "dead", blood, expr };
  }

  getCanvas(player) { return faceCanvas(this.getState(player)); }
}
