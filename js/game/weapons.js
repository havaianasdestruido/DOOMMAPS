// ============================================================
// DOOMMAPS — Weapons: 7 slots, painted view-models, firing,
// autoaim, raise/lower animations, weapon bob
// ============================================================
import * as THREE from "three";
import { clamp, rand } from "../config.js";
import { AUDIO } from "../core/audio.js";

export const WEAPON_DEFS = {
  fist: {
    slot: 1, name: "FISTS", ammo: null, per: 0, dmg: [2, 20], pellets: 1,
    spread: 0, rate: 0.42, kind: "melee", range: 2.6,
  },
  pistol: {
    slot: 2, name: "PISTOL", ammo: "bullets", per: 1, dmg: [5, 15], pellets: 1,
    spread: 0.02, rate: 0.24, kind: "hitscan",
  },
  shotgun: {
    slot: 3, name: "SHOTGUN", ammo: "shells", per: 1, dmg: [5, 15], pellets: 7,
    spread: 0.09, rate: 0.9, kind: "hitscan", pump: 0.5,
  },
  supershotgun: {
    slot: 4, name: "SUPER SHOTGUN", ammo: "shells", per: 2, dmg: [5, 15], pellets: 14,
    spread: 0.16, rate: 1.6, kind: "hitscan", pump: 0.9, heavy: true,
  },
  chaingun: {
    slot: 5, name: "CHAINGUN", ammo: "bullets", per: 1, dmg: [5, 15], pellets: 1,
    spread: 0.05, rate: 0.085, kind: "hitscan", spin: true,
  },
  rocket: {
    slot: 6, name: "ROCKET LAUNCHER", ammo: "rockets", per: 1, dmg: [80, 160], pellets: 1,
    spread: 0, rate: 0.55, kind: "projectile", proj: "playerRocket", speed: 24,
  },
  plasma: {
    slot: 7, name: "PLASMA RIFLE", ammo: "cells", per: 1, dmg: [8, 24], pellets: 1,
    spread: 0.02, rate: 0.1, kind: "projectile", proj: "playerPlasma", speed: 42,
  },
};

// ---------------- view model painters (160x120) ----------------
function VC() {
  const cv = document.createElement("canvas");
  cv.width = 160; cv.height = 120;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx };
}
function R(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w, h); }
function shade(ctx, x, y, w, h, base, steps = 4) {
  // vertical gradient via strips
  for (let i = 0; i < steps; i++) {
    ctx.fillStyle = shadeColor(base, 1 - i * 0.18);
    ctx.fillRect(x | 0, (y + (h / steps) * i) | 0, w, Math.ceil(h / steps));
  }
}
function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * f, 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * f, 0, 255) | 0;
  const b = clamp((n & 255) * f, 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}
function muzzleFlash(ctx, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#fff6c8";
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    ctx.fillRect(-2 * s, -14 * s, 4 * s, 12 * s);
  }
  ctx.fillStyle = "#ffb020";
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3 + 0.4);
    ctx.fillRect(-1.5 * s, -10 * s, 3 * s, 8 * s);
  }
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(0, 0, 4 * s, 0, 7); ctx.fill();
  ctx.restore();
}
function gunHand(ctx, x, y, skinTone = "#c89878") {
  shade(ctx, x, y, 26, 60, skinTone);
  R(ctx, x, y, 26, 10, shadeColor(skinTone, 0.75));
  R(ctx, x + 2, y + 12, 22, 6, shadeColor(skinTone, 0.85));
  R(ctx, x + 2, y + 20, 22, 6, shadeColor(skinTone, 0.8));
  // sleeve
  R(ctx, x - 6, y + 54, 38, 26, "#6e6e58");
  R(ctx, x - 6, y + 54, 38, 5, "#8c8c70");
}

const VIEWS = {};
export function __buildViews() { buildViewModels(); return VIEWS; }

function buildViewModels() {
  // ---- FIST ----
  VIEWS.fist = [punchView(0), punchView(1)];
  function punchView(mode) {
    const { cv, ctx } = VC();
    if (mode === 0) {
      // knuckles up
      shade(ctx, 62, 40, 40, 34, "#c89878");
      for (let i = 0; i < 4; i++) { R(ctx, 64 + i * 9, 42, 7, 12, "#b08868"); R(ctx, 64 + i * 9, 42, 7, 4, "#d8b090"); }
      R(ctx, 62, 66, 40, 10, "#9a7050");
      R(ctx, 58, 74, 46, 46, "#6e6e58");
      R(ctx, 58, 74, 46, 6, "#8c8c70");
    } else {
      // punched forward (big fist bottom-left)
      shade(ctx, 30, 52, 52, 44, "#c89878");
      for (let i = 0; i < 4; i++) { R(ctx, 34 + i * 12, 54, 9, 15, "#b08868"); R(ctx, 34 + i * 12, 54, 9, 5, "#d8b090"); }
      R(ctx, 84, 88, 30, 32, "#6e6e58");
    }
    return cv;
  }
  // ---- PISTOL ----
  VIEWS.pistol = [pistolView(false), pistolView(true)];
  function pistolView(fire) {
    const { cv, ctx } = VC();
    shade(ctx, 74, 20, 14, 40, "#3c3c44", 5);          // slide
    R(ctx, 74, 20, 14, 8, "#565660");
    R(ctx, 76, 14, 4, 8, "#2a2a30");                     // front sight
    R(ctx, 74, 54, 14, 8, "#2c2c33");
    shade(ctx, 70, 60, 22, 34, "#4a3a26", 4);            // grip
    gunHand(ctx, 66, 62);
    if (fire) muzzleFlash(ctx, 81, 12, 1.0);
    return cv;
  }
  // ---- SHOTGUN ----
  VIEWS.shotgun = [shotgunView(0), shotgunView(1), shotgunView(2)];
  function shotgunView(mode) {
    const { cv, ctx } = VC();
    const dy = mode === 1 ? 14 : 0;
    shade(ctx, 72, 6 + dy, 12, 58, "#4e3a24", 5);        // barrel-stock
    R(ctx, 72, 6 + dy, 12, 10, "#6a5236");
    R(ctx, 70, 2 + dy, 16, 8, "#241c12");                // muzzle
    shade(ctx, 66, 60 + dy, 30, 40, "#7a5a34", 4);       // stock
    gunHand(ctx, 62 + (mode === 1 ? -8 : 4), 66, "#c89878");
    if (mode === 2 || mode === 1) muzzleFlash(ctx, 78, 0 + (mode === 1 ? 14 : 2), 1.3);
    return cv;
  }
  // ---- SUPER SHOTGUN ----
  VIEWS.supershotgun = [ssgView(0), ssgView(1), ssgView(2)];
  function ssgView(mode) {
    const { cv, ctx } = VC();
    if (mode === 2) { // broken open reload
      shade(ctx, 56, 40, 20, 56, "#5c4426", 5);
      shade(ctx, 82, 40, 20, 56, "#5c4426", 5);
      R(ctx, 52, 34, 28, 10, "#241c12");
      R(ctx, 78, 34, 28, 10, "#241c12");
      gunHand(ctx, 64, 76);
      return cv;
    }
    shade(ctx, 62, 2, 16, 66, "#5c4426", 5);
    shade(ctx, 80, 2, 16, 66, "#5c4426", 5);
    R(ctx, 62, 2, 16, 8, "#241c12");
    R(ctx, 80, 2, 16, 8, "#241c12");
    shade(ctx, 58, 64, 44, 42, "#7a5a34", 4);
    gunHand(ctx, 64, 70);
    if (mode === 1) { muzzleFlash(ctx, 70, -2, 1.4); muzzleFlash(ctx, 88, -2, 1.4); }
    return cv;
  }
  // ---- CHAINGUN ----
  VIEWS.chaingun = [chaingunView(0), chaingunView(1), chaingunView(2)];
  function chaingunView(mode) {
    const { cv, ctx } = VC();
    // rotating barrels
    shade(ctx, 66, 6, 30, 46, "#3e3e46", 4);
    const barrels = [[74, 14], [84, 18], [88, 30], [84, 42], [74, 46], [70, 30]];
    for (let i = 0; i < 6; i++) {
      const [bx, by] = barrels[(i + mode) % 6];
      R(ctx, bx - 3, by - 3, 7, 7, i % 2 ? "#20202a" : "#565660");
    }
    R(ctx, 64, 50, 34, 16, "#2c2c34");
    shade(ctx, 60, 64, 42, 40, "#4a3a26", 4);
    gunHand(ctx, 64, 70);
    if (mode === 2) muzzleFlash(ctx, 81, 2, 1.15);
    return cv;
  }
  // ---- ROCKET LAUNCHER ----
  VIEWS.rocket = [rocketView(false), rocketView(true)];
  function rocketView(fire) {
    const { cv, ctx } = VC();
    // looking down the bore of a shoulder launcher
    shade(ctx, 30, 14, 26, 90, "#3e4a3e", 6);            // left shoulder
    shade(ctx, 104, 14, 26, 90, "#3e4a3e", 6);           // right shoulder
    shade(ctx, 56, 20, 48, 74, "#4a584a", 5);            // tube body
    R(ctx, 56, 20, 48, 10, "#6a7a6a");                   // top rim highlight
    // bore mouth
    R(ctx, 62, 26, 36, 30, "#141a14");
    R(ctx, 66, 30, 28, 22, "#090d09");
    // rocket nose visible in the bore
    R(ctx, 74, 34, 12, 13, "#8c2a1a");
    R(ctx, 77, 32, 6, 4, "#d8d0c8");
    // rails / sights
    R(ctx, 58, 60, 10, 34, "#2a332a");
    R(ctx, 92, 60, 10, 34, "#2a332a");
    R(ctx, 58, 60, 44, 8, "#1c241c");
    gunHand(ctx, 32, 60);
    gunHand(ctx, 102, 60);
    if (fire) muzzleFlash(ctx, 80, 40, 2.0);
    return cv;
  }
  // ---- PLASMA ----
  VIEWS.plasma = [plasmaView(false, 0), plasmaView(false, 1), plasmaView(true, 1)];
  function plasmaView(fire, glow) {
    const { cv, ctx } = VC();
    shade(ctx, 60, 20, 44, 50, "#2a3242", 4);
    R(ctx, 60, 20, 44, 10, "#3c4a5e");
    R(ctx, 70, 8, 8, 16, "#181e28");                     // front barrel
    R(ctx, 84, 8, 8, 16, "#181e28");
    const g = glow ? "#8ff8ff" : "#36b8d8";
    R(ctx, 66, 34, 8, 26, g);
    R(ctx, 78, 34, 8, 26, g);
    R(ctx, 90, 34, 8, 26, g);
    gunHand(ctx, 64, 66);
    R(ctx, 88, 66, 24, 34, "#241c14");
    if (fire) { muzzleFlash(ctx, 74, 6, 1.0); muzzleFlash(ctx, 88, 6, 1.0); }
    return cv;
  }
}

// ============================================================
export class Weapons {
  constructor(game) {
    this.game = game;
    if (!VIEWS._built) { buildViewModels(); VIEWS._built = true; }
    this.current = "pistol";
    this.state = "idle";       // idle | fire | lower | raise | pump
    this.stateT = 0;
    this.pendingSwitch = null;
    this.cooldown = 0;
    this.fireHeld = false;
    this.pumpQueued = false;
    this.flashT = 0;
    this.spinHeat = 0;
  }

  get def() { return WEAPON_DEFS[this.current]; }

  hasWeapon(name) { return this.game.player.weapons.has(name); }
  ammoFor(name) {
    const d = WEAPON_DEFS[name];
    if (!d.ammo) return Infinity;
    return this.game.player.ammo[d.ammo] || 0;
  }

  requestSwitch(name) {
    if (!this.hasWeapon(name) || name === this.current) return;
    if (this.state === "lower" || this.state === "raise") { this.pendingSwitch = name; return; }
    this.pendingSwitch = name;
    this.state = "lower";
    this.stateT = 0;
  }
  cycle(dir) {
    const order = ["fist", "pistol", "shotgun", "supershotgun", "chaingun", "rocket", "plasma"];
    const owned = order.filter(w => this.hasWeapon(w));
    if (owned.length < 2) return;
    const i = owned.indexOf(this.current);
    const next = owned[(i + dir + owned.length) % owned.length];
    this.requestSwitch(next);
  }

  onFirePressed() { this.fireHeld = true; }
  onFireReleased() { this.fireHeld = false; }

  update(dt, input) {
    const p = this.game.player;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.spinHeat = Math.max(0, this.spinHeat - dt * 2);
    this.stateT += dt;

    if (p.dead) { this.state = "idle"; return; }

    switch (this.state) {
      case "lower":
        if (this.stateT > 0.16) {
          this.current = this.pendingSwitch || this.current;
          p.currentWeapon = this.current;
          this.state = "raise"; this.stateT = 0;
          AUDIO.noAmmo(); // click
        }
        break;
      case "raise":
        if (this.stateT > 0.2) { this.state = "idle"; this.pendingSwitch = null; this.stateT = 0; }
        break;
    }

    // firing
    const wantFire = input.fire;
    if (wantFire && !this.fireHeld) this.onFirePressed();
    if (!wantFire) this.onFireReleased();

    if (this.fireHeld && this.cooldown <= 0 && this.state !== "lower" && this.state !== "raise") {
      this.tryShoot();
    }
    if (this.state === "fire" && this.stateT > this.fireAnimTime) {
      this.state = "idle";
    }
  }

  tryShoot() {
    const d = this.def;
    const p = this.game.player;
    if (d.ammo && (p.ammo[d.ammo] || 0) < d.per) {
      AUDIO.noAmmo();
      this.cooldown = 0.3;
      this.fireHeld = false;
      // auto-switch to something usable
      const order = ["supershotgun", "shotgun", "chaingun", "plasma", "pistol"];
      for (const w of order) {
        if (this.hasWeapon(w) && this.ammoFor(w) >= (WEAPON_DEFS[w].per || 1)) { this.requestSwitch(w); break; }
      }
      return;
    }

    const game = this.game;
    const e = game.engine;

    if (d.kind === "melee") {
      const berserk = p.berserkT > 0;
      const ang = p.angle;
      // find enemy in arc
      const hit = game.enemies.raycast(p.pos.x, p.pos.y, p.pos.z, -Math.sin(ang), 0, -Math.cos(ang), d.range + 1);
      AUDIO.punch(!!hit);
      if (hit) {
        const dmg = berserk ? rand(20, 200) : rand(d.dmg[0], d.dmg[1]);
        const killed = hit.enemy.hp - dmg <= 0;
        hit.enemy.hurt(dmg, ang, game);
        game.effects.blood(hit.enemy.pos.x, hit.enemy.pos.y + hit.enemy.def.h * 0.6, hit.enemy.pos.z, 8, true);
        if (killed && berserk) game.effects.gibs(hit.enemy.pos.x, hit.enemy.pos.y, hit.enemy.pos.z);
        e.addShake(berserk ? 0.35 : 0.15);
      }
      this.state = "fire"; this.stateT = 0;
      this.fireAnimTime = 0.22;
      this.cooldown = d.rate;
      return;
    }

    // consume ammo
    p.ammo[d.ammo] -= d.per;
    this.state = "fire"; this.stateT = 0;
    this.fireAnimTime = d.spin ? 0.08 : 0.16;
    this.cooldown = d.rate;
    this.flashT = 0.12;
    this.spinHeat = Math.min(1, this.spinHeat + 0.3);
    this.pumpQueued = !!d.pump;

    // sound
    const sndMap = { pistol: "pistol", shotgun: "shotgun", supershotgun: "superShotgun", chaingun: "chaingun", rocket: "rocketFire", plasma: "plasma" };
    if (this.current === "chaingun" && this.spinHeat < 0.2) AUDIO.chainSpin();
    AUDIO[sndMap[this.current]]();
    if (d.pump) setTimeout(() => AUDIO.pump(), 320);

    // visuals
    const eye = p.pos.clone();
    e.flash(eye, d.heavy ? 4 : 1.8, 0xffaa33);
    e.addShake(d.heavy ? 0.5 : this.current === "chaingun" ? 0.12 : 0.2);
    if (d.heavy && game.settings.screenFlash) e.hurt(0.12);

    // aim direction with autoaim
    const dir = this.computeAim();

    if (d.kind === "projectile") {
      game.projectiles.firePlayer(d.proj, eye, dir, d.speed, rand(d.dmg[0], d.dmg[1]));
    } else {
      // hitscan pellets
      for (let i = 0; i < d.pellets; i++) {
        const pdir = dir.clone();
        pdir.x += rand(-d.spread, d.spread);
        pdir.y += rand(-d.spread * 0.7, d.spread * 0.7);
        pdir.z += rand(-d.spread, d.spread);
        pdir.normalize();
        this.firePellet(eye, pdir, rand(d.dmg[0], d.dmg[1]));
      }
    }
    // noise alerts enemies
    game.enemies.onNoise(p.pos.x, p.pos.z, d.heavy ? 80 : 55);
  }

  computeAim() {
    const p = this.game.player;
    const game = this.game;
    const yaw = p.angle;
    const pitch = game.settings.classicCamera ? 0 : p.pitch;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    // forward (-Z at yaw 0)
    const dir = new THREE.Vector3(-sy * cp, sp, -cy * cp);

    if (game.settings.autoaim) {
      // find enemy within cone
      let best = null, bestScore = 0.10; // ~5.7°
      for (const e of game.enemies.list) {
        if (e.state === "dying" || e.state === "dead") continue;
        const ex = e.pos.x - p.pos.x, ez = e.pos.z - p.pos.z;
        const dist = Math.hypot(ex, ez);
        if (dist > 95 || dist < 0.5) continue;
        const ey = (e.pos.y + e.def.h * 0.55) - p.pos.y;
        const en = Math.hypot(ex, ey, ez);
        const dot = (ex / en) * dir.x + (ey / en) * dir.y + (ez / en) * dir.z;
        const angDiff = Math.acos(clamp(dot, -1, 1));
        if (angDiff < bestScore && game.level.los(p.pos.x, p.pos.z, e.pos.x, e.pos.z)) {
          bestScore = angDiff;
          best = { ex: ex / en, ey: ey / en, ez: ez / en };
        }
      }
      if (best) return new THREE.Vector3(best.ex, best.ey, best.ez);
    }
    return dir;
  }

  firePellet(eye, dir, dmg) {
    const game = this.game;
    const maxDist = 200;
    // candidates: enemy, barrel, wall — nearest wins
    const eh = game.enemies.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, maxDist);
    const bh = game.barrels.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, maxDist);
    const wh = game.level.raycastWall(eye.x, eye.z, dir.x, dir.z, maxDist);
    const wDist = wh ? wh.dist : Infinity;
    const nearest = (eh && eh.dist < wDist && (!bh || eh.dist < bh.dist)) ? "enemy"
      : (bh && bh.dist < wDist) ? "barrel"
      : wh ? "wall" : null;

    if (nearest === "barrel") {
      game.barrels.damage(bh.barrel, dmg);
    } else if (nearest === "enemy") {
      const e = eh.enemy;
      e.hurt(dmg, Math.atan2(dir.x, dir.z), game);
      game.effects.blood(
        eye.x + dir.x * eh.dist, eye.y + dir.y * eh.dist, eye.z + dir.z * eh.dist,
        this.current === "supershotgun" ? 7 : 4, dmg > 20
      );
      if (e.hp <= 0 && (dmg > 45 || this.current === "supershotgun") && !e.def.boss) {
        game.effects.gibs(e.pos.x, e.pos.y, e.pos.z);
      }
    } else if (nearest === "wall") {
      game.effects.puff(wh.x + dir.x * 0.1, clamp(eye.y + dir.y * wh.dist, 0.3, 6), wh.z + dir.z * 0.1);
      AUDIO.ricochet();
    }
  }

  /** draw view model into the HUD canvas */
  draw(ctx, W, H, player, settings) {
    const views = VIEWS[this.current] || VIEWS.pistol;
    let frame = 0;
    if (this.state === "fire") {
      frame = this.current === "chaingun" ? (this.stateT % 0.14 < 0.07 ? 2 : 1) : 1;
    } else if (this.current === "chaingun" && this.spinHeat > 0.3) {
      frame = 1;
    } else if (this.current === "supershotgun" && this.pumpQueued && this.cooldown > 1.0) {
      frame = 2;
    } else if (this.current === "shotgun" && this.cooldown > 0.3) {
      frame = 2;
    } else if (this.current === "fist" && player.berserkT > 0 && Math.sin(performance.now() * 0.004) > 0.6) {
      frame = 1;
    }
    const cv = views[Math.min(frame, views.length - 1)];

    // position: bottom-center with bob + raise/lower slide
    const scale = Math.max(2, Math.round(H / 260)) * (settings.hudScale / 2);
    const vw = 160 * scale, vh = 120 * scale;
    let oy = 0;
    if (this.state === "lower") oy = (this.stateT / 0.16) * vh;
    else if (this.state === "raise") oy = (1 - this.stateT / 0.2) * vh;
    // recoil kick
    if (this.state === "fire") oy += 10 * scale * (1 - this.stateT / this.fireAnimTime);
    const bobX = player.bobX * 120 * scale * 0.35;
    const bobY = Math.abs(player.bobY) * 90 * scale * 0.4;
    const x = (W - vw) / 2 + bobX;
    const y = H - vh + bobY + oy;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(cv, x, y, vw, vh);

    // berserk rage tint
    if (this.current === "fist" && player.berserkT > 0) {
      ctx.fillStyle = "rgba(200, 20, 10, 0.14)";
      ctx.fillRect(x, y, vw, vh);
    }
  }
}
