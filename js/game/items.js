// ============================================================
// DOOMMAPS — Items: pickups with procedural icons + rules
// ============================================================
import * as THREE from "three";
import { rand } from "../config.js";
import { AUDIO } from "../core/audio.js";

// ---------------- icon painters (24x24 unless noted) ----------------
function C(w = 24, h = 24) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx };
}
function rr(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

const ICONS = {
  stimpack() { const { cv, ctx } = C(); rr(ctx, 4, 7, 16, 12, "#d8d8d0"); rr(ctx, 4, 7, 16, 12, "#d8d8d0"); rr(ctx, 10, 9, 4, 8, "#c41818"); rr(ctx, 8, 11, 8, 4, "#c41818"); rr(ctx, 4, 7, 16, 3, "#ffffff"); return cv; },
  medikit() { const { cv, ctx } = C(); rr(ctx, 2, 5, 20, 15, "#e8e8e0"); rr(ctx, 10, 7, 4, 11, "#b01010"); rr(ctx, 6, 10, 12, 4, "#b01010"); rr(ctx, 2, 5, 20, 4, "#ffffff"); rr(ctx, 2, 18, 20, 2, "#9a9a90"); return cv; },
  healthbonus() { const { cv, ctx } = C(16, 20); rr(ctx, 6, 2, 4, 3, "#888"); rr(ctx, 4, 5, 8, 13, "#3a6ae8"); rr(ctx, 5, 6, 3, 10, "#7ab2ff"); rr(ctx, 9, 6, 2, 3, "#1c3a8c"); return cv; },
  armorbonus() { const { cv, ctx } = C(20, 16); rr(ctx, 2, 6, 16, 8, "#8b8b8b"); rr(ctx, 4, 2, 12, 6, "#a8a8a8"); rr(ctx, 4, 8, 12, 3, "#666"); rr(ctx, 6, 3, 8, 2, "#d0d0d0"); return cv; },
  soulsphere() { const { cv, ctx } = C(28, 28); const g = ctx.createRadialGradient(14, 14, 2, 14, 14, 13); g.addColorStop(0, "#e8ffff"); g.addColorStop(0.35, "#3a8cff"); g.addColorStop(1, "rgba(10,20,90,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(14, 14, 13, 0, 7); ctx.fill(); rr(ctx, 10, 8, 8, 5, "#0a2a70"); rr(ctx, 12, 16, 4, 6, "#0a2a70"); return cv; },
  invuln() { const { cv, ctx } = C(28, 28); const g = ctx.createRadialGradient(14, 14, 2, 14, 14, 13); g.addColorStop(0, "#f0fff0"); g.addColorStop(0.4, "#5aff5a"); g.addColorStop(1, "rgba(0,80,10,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(14, 14, 13, 0, 7); ctx.fill(); return cv; },
  berserk() { const { cv, ctx } = C(); rr(ctx, 2, 5, 20, 15, "#181818"); rr(ctx, 10, 7, 4, 11, "#c41818"); rr(ctx, 6, 10, 12, 4, "#c41818"); rr(ctx, 2, 5, 20, 3, "#444"); rr(ctx, 2, 20, 20, 2, "#8c2a2a"); return cv; },
  armor1() { const { cv, ctx } = C(26, 26); rr(ctx, 5, 4, 16, 6, "#2a6e2a"); rr(ctx, 3, 9, 20, 13, "#3a8c3a"); rr(ctx, 11, 3, 4, 18, "#1c4a1c"); rr(ctx, 5, 12, 16, 2, "#57b257"); return cv; },
  armor2() { const { cv, ctx } = C(26, 26); rr(ctx, 5, 4, 16, 6, "#2a4a9e"); rr(ctx, 3, 9, 20, 13, "#3a5ac8"); rr(ctx, 11, 3, 4, 18, "#1c2c6e"); rr(ctx, 5, 12, 16, 2, "#6a8cf0"); return cv; },
  radsuit() { const { cv, ctx } = C(26, 28); rr(ctx, 7, 3, 12, 10, "#c8b028"); rr(ctx, 9, 6, 8, 4, "#282018"); rr(ctx, 6, 12, 14, 12, "#a89020"); rr(ctx, 5, 24, 6, 4, "#88701a"); rr(ctx, 15, 24, 6, 4, "#88701a"); return cv; },
  liteamp() { const { cv, ctx } = C(26, 16); rr(ctx, 2, 4, 22, 8, "#2c2c34"); rr(ctx, 4, 6, 8, 5, "#50ff90"); rr(ctx, 14, 6, 8, 5, "#50ff90"); rr(ctx, 12, 7, 2, 3, "#1c1c24"); return cv; },
  map() { const { cv, ctx } = C(26, 20); rr(ctx, 2, 3, 22, 14, "#c8b890"); rr(ctx, 4, 5, 8, 3, "#8c7a5c"); rr(ctx, 14, 6, 8, 2, "#8c7a5c"); rr(ctx, 4, 10, 18, 1, "#8c7a5c"); rr(ctx, 4, 13, 8, 2, "#8c7a5c"); return cv; },
  key_red() { return keycard("#e82838"); },
  key_blue() { return keycard("#2868f0"); },
  key_yellow() { return keycard("#f0c828"); },
  bullets() { const { cv, ctx } = C(20, 16); rr(ctx, 2, 8, 16, 7, "#6b4a20"); for (let i = 0; i < 5; i++) { rr(ctx, 3 + i * 3, 3, 2, 6, "#d8a83a"); rr(ctx, 3 + i * 3, 2, 2, 2, "#f0d060"); } return cv; },
  bulletbox() { const { cv, ctx } = C(24, 18); rr(ctx, 2, 6, 20, 11, "#4a3a1c"); rr(ctx, 2, 6, 20, 4, "#5c4a26"); rr(ctx, 4, 2, 16, 5, "#d8a83a"); return cv; },
  shells() { const { cv, ctx } = C(20, 16); for (let i = 0; i < 2; i++) { rr(ctx, 3 + i * 7, 4, 5, 10, "#c42020"); rr(ctx, 3 + i * 7, 2, 5, 3, "#d8a83a"); rr(ctx, 3 + i * 7, 13, 5, 2, "#d8d8d0"); } return cv; },
  shellbox() { const { cv, ctx } = C(24, 18); rr(ctx, 2, 6, 20, 11, "#5c2020"); rr(ctx, 2, 6, 20, 4, "#6e2a2a"); for (let i = 0; i < 6; i++) rr(ctx, 4 + i * 3, 2, 2, 5, "#c42020"); return cv; },
  rockets() { const { cv, ctx } = C(20, 20); rr(ctx, 6, 2, 8, 14, "#8c2a1a"); rr(ctx, 7, 3, 2, 12, "#c8542a"); rr(ctx, 5, 0, 10, 3, "#d8d8d0"); rr(ctx, 4, 16, 2, 4, "#666"); rr(ctx, 14, 16, 2, 4, "#666"); return cv; },
  cells() { const { cv, ctx } = C(24, 18); rr(ctx, 3, 4, 8, 13, "#2a682a"); rr(ctx, 13, 4, 8, 13, "#2a682a"); rr(ctx, 4, 6, 6, 3, "#6ee86e"); rr(ctx, 14, 6, 6, 3, "#6ee86e"); rr(ctx, 3, 4, 8, 2, "#d8d8d0"); rr(ctx, 13, 4, 8, 2, "#d8d8d0"); return cv; },
  shotgun() { return gunIcon("#7a4a22", 3); },
  supershotgun() { return gunIcon("#5c3a1a", 2); },
  chaingun() { return gunIcon("#4a4a52", 4); },
  rocketlauncher() { return gunIcon("#3e4a3e", 5, true); },
  plasma() { return gunIcon("#2a3a5c", 6, true); },
};
function keycard(color) { const { cv, ctx } = C(20, 26); rr(ctx, 3, 3, 14, 20, "#c9b458"); rr(ctx, 5, 5, 10, 6, color); rr(ctx, 5, 13, 10, 2, "#8c7a3c"); rr(ctx, 5, 17, 6, 2, "#8c7a3c"); rr(ctx, 3, 3, 14, 20, "rgba(0,0,0,0)"); ctx.strokeStyle = "#4a3e1e"; ctx.strokeRect(3.5, 3.5, 13, 19); return cv; }
function gunIcon(color, len = 3, wide = false) {
  const { cv, ctx } = C(34, 18);
  rr(ctx, 2, 8, 22 + len, wide ? 6 : 4, color);
  rr(ctx, 6, 10, 6, 6, "#241c14");
  rr(ctx, 16, 11, 4, 5, "#241c14");
  rr(ctx, 24, 6, 8, 3, "#111");
  rr(ctx, 3, 7, 20, 2, "rgba(255,255,255,0.25)");
  return cv;
}

// ---------------- item definitions ----------------
export const ITEM_DEFS = {
  stimpack: { w: 0.55, h: 0.42, bob: 0.12, msg: "Picked up a stimpack.", cat: "health", pickup: (g) => g.player.heal(10) },
  medikit: { w: 0.7, h: 0.5, bob: 0.12, msg: "Picked up a medikit.", cat: "health", pickup: (g) => g.player.heal(25) },
  healthbonus: { w: 0.34, h: 0.42, bob: 0.16, msg: "+1 Health bonus", cat: "health", pickup: (g) => { const p = g.player; if (p.health >= 200) return false; p.health = Math.min(200, p.health + 1); return true; } },
  soulsphere: { w: 0.85, h: 0.85, bob: 0.3, msg: "SOULSPHERE! Health +100%", cat: "power", pickup: (g) => { const p = g.player; if (p.health >= 200) return false; p.health = Math.min(200, p.health + 100); return true; }, sound: "powerup" },
  invuln: { w: 0.85, h: 0.85, bob: 0.3, msg: "INVULNERABILITY!", cat: "power", pickup: (g) => { g.player.invulnT = 60; return true; }, sound: "powerup" },
  berserk: { w: 0.7, h: 0.5, bob: 0.12, msg: "BERSERK! Rage through them with your FISTS", cat: "power", pickup: (g) => { const p = g.player; p.health = Math.max(p.health, 100); p.berserkT = 1; p.berserkTintT = 20; return true; }, sound: "powerup" },
  armor1: { w: 0.8, h: 0.7, bob: 0.14, msg: "Picked up the green armor.", cat: "armor", pickup: (g) => g.player.addArmor(100, 1) },
  armor2: { w: 0.8, h: 0.7, bob: 0.14, msg: "You got the MEGAARMOR!", cat: "armor", pickup: (g) => g.player.addArmor(200, 2) },
  armorbonus: { w: 0.45, h: 0.35, bob: 0.16, msg: "+1 Armor bonus", cat: "armor", pickup: (g) => { const p = g.player; if (p.armor >= 200) return false; p.armor = Math.min(200, p.armor + 1); if (p.armorGrade === 0) p.armorGrade = 1; return true; } },
  radsuit: { w: 0.7, h: 0.75, bob: 0.14, msg: "Radiation shielding suit", cat: "power", pickup: (g) => { g.player.radT = 60; return true; }, sound: "powerup" },
  liteamp: { w: 0.7, h: 0.4, bob: 0.14, msg: "Light amplification visor", cat: "power", pickup: (g) => { g.player.liteT = 120; return true; }, sound: "powerup" },
  map: { w: 0.7, h: 0.5, bob: 0.14, msg: "Computer area map!", cat: "power", pickup: (g) => { g.hasMap = true; return true; }, sound: "powerup" },
  key_red: { w: 0.5, h: 0.62, bob: 0.3, msg: "You pick up a RED keycard", cat: "key", pickup: (g) => { g.player.keys.add("red"); return true; }, sound: "keyPickup" },
  key_blue: { w: 0.5, h: 0.62, bob: 0.3, msg: "You pick up a BLUE keycard", cat: "key", pickup: (g) => { g.player.keys.add("blue"); return true; }, sound: "keyPickup" },
  key_yellow: { w: 0.5, h: 0.62, bob: 0.3, msg: "You pick up a YELLOW keycard", cat: "key", pickup: (g) => { g.player.keys.add("yellow"); return true; }, sound: "keyPickup" },
  bullets: { w: 0.45, h: 0.3, bob: 0.1, msg: "Picked up a clip.", cat: "ammo", pickup: (g) => g.player.giveAmmo("bullets", 10) },
  bulletbox: { w: 0.6, h: 0.4, bob: 0.1, msg: "Picked up a box of bullets.", cat: "ammo", pickup: (g) => g.player.giveAmmo("bullets", 50) },
  shells: { w: 0.45, h: 0.3, bob: 0.1, msg: "Picked up 4 shotgun shells.", cat: "ammo", pickup: (g) => g.player.giveAmmo("shells", 4) },
  shellbox: { w: 0.6, h: 0.4, bob: 0.1, msg: "Picked up a box of shells.", cat: "ammo", pickup: (g) => g.player.giveAmmo("shells", 20) },
  rockets: { w: 0.5, h: 0.5, bob: 0.1, msg: "Picked up 5 rockets.", cat: "ammo", pickup: (g) => g.player.giveAmmo("rockets", 5) },
  cells: { w: 0.6, h: 0.4, bob: 0.1, msg: "Picked up an energy cell.", cat: "ammo", pickup: (g) => g.player.giveAmmo("cells", 20) },
  shotgun: { w: 1.1, h: 0.4, bob: 0.14, msg: "You got the SHOTGUN!", cat: "weapon", pickup: (g) => pickupWeapon(g, "shotgun", "shells", 8), sound: "weaponPickup" },
  supershotgun: { w: 1.1, h: 0.45, bob: 0.14, msg: "You got the SUPER SHOTGUN!", cat: "weapon", pickup: (g) => pickupWeapon(g, "supershotgun", "shells", 8), sound: "weaponPickup" },
  chaingun: { w: 1.1, h: 0.45, bob: 0.14, msg: "You got the CHAINGUN!", cat: "weapon", pickup: (g) => pickupWeapon(g, "chaingun", "bullets", 20), sound: "weaponPickup" },
  rocketlauncher: { w: 1.2, h: 0.45, bob: 0.14, msg: "You got the ROCKET LAUNCHER!", cat: "weapon", pickup: (g) => pickupWeapon(g, "rocketlauncher", "rockets", 2), sound: "weaponPickup" },
  plasma: { w: 1.1, h: 0.45, bob: 0.14, msg: "You got the PLASMA RIFLE!", cat: "weapon", pickup: (g) => pickupWeapon(g, "plasma", "cells", 40), sound: "weaponPickup" },
};

function pickupWeapon(g, weapon, ammoKind, ammoN) {
  const p = g.player;
  if (p.weapons.has(weapon)) return p.giveAmmo(ammoKind, ammoN * 2);
  p.weapons.add(weapon);
  p.giveAmmo(ammoKind, ammoN);
  g.weapons.requestSwitch(weapon);
  return true;
}

const TEXCACHE = {};

class Item {
  constructor(type, x, z, secret, game) {
    this.type = type;
    this.def = ITEM_DEFS[type];
    this.secret = secret;
    if (!TEXCACHE[type]) {
      const t = new THREE.CanvasTexture(ICONS[type]());
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
      TEXCACHE[type] = t;
    }
    const mat = new THREE.SpriteMaterial({ map: TEXCACHE[type], transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(mat);
    const glowy = this.def.cat !== "ammo";
    this.sprite.scale.set(this.def.w, this.def.h, 1);
    this.baseY = 0.32 + this.def.bob;
    this.sprite.position.set(x, this.baseY, z);
    this.t = rand(0, 6);
    this.x = x; this.z = z;
    game.engine.scene.add(this.sprite);
    if (this.def.cat === "key" || itemIsPower(type)) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: TEXCACHE[type], transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.4, color: 0xffcc66,
      }));
      halo.scale.set(this.def.w * 1.8, this.def.h * 1.8, 1);
      this.sprite.add(halo);
      this.halo = halo;
    }
  }
  update(dt, game) {
    this.t += dt;
    this.sprite.position.y = this.baseY + Math.sin(this.t * 2.4) * this.def.bob;
    if (this.halo) this.halo.material.opacity = 0.3 + 0.2 * Math.sin(this.t * 5);
    const p = game.player;
    if (p.dead) return;
    const dx = p.pos.x - this.x, dz = p.pos.z - this.z;
    if (dx * dx + dz * dz < 1.7) {
      if (this.def.pickup(game)) {
        if (this.secret) { AUDIO.secret(); game.announce("A SECRET IS REVEALED!", "#7ae84b", 3); p.secretsFound++; }
        else {
          const fn = this.def.sound || (this.def.cat === "health" ? "healthPickup" : "itemPickup");
          AUDIO[fn]();
        }
        if (this.def.msg) game.notify(this.def.msg);
        if (this.def.cat === "key") game.flashPickup("#ffd94a");
        game.hud.triggerGrin(this.def.cat === "weapon");
        game.removeItem(this);
      }
    }
  }
}
function itemIsPower(t) { return ["soulsphere", "invuln", "berserk"].includes(t); }

export class Items {
  constructor(game) {
    this.game = game;
    this.list = [];
  }
  spawn(type, x, z, secret = false) {
    if (!ITEM_DEFS[type]) return null;
    const it = new Item(type, x, z, secret, this.game);
    this.list.push(it);
    return it;
  }
  spawnSet(arr) {
    for (const s of arr) this.spawn(s.type, s.x, s.z, s.secret);
  }
  remove(item) {
    const i = this.list.indexOf(item);
    if (i >= 0) {
      this.game.engine.scene.remove(item.sprite);
      this.list.splice(i, 1);
    }
  }
  update(dt) {
    for (const it of [...this.list]) it.update(dt, this.game);
  }
  dispose() {
    for (const it of this.list) this.game.engine.scene.remove(it.sprite);
    this.list = [];
  }
}
