// ============================================================
// DOOMMAPS — Game orchestrator: states, loop, combat wiring,
// cheats, doors, portal, HUD callbacks, level loading
// ============================================================
import * as THREE from "three";
import { DOOM, clamp, rand } from "../config.js";
import { INPUT } from "../core/input.js";
import { AUDIO } from "../core/audio.js";
import { Player } from "./player.js";
import { EnemyManager } from "./enemies.js";
import { Items } from "./items.js";
import { Effects } from "./effects.js";
import { Projectiles } from "./projectiles.js";
import { Barrels } from "./barrels.js";
import { Weapons } from "./weapons.js";
import { HUD } from "./hud.js";
import { FaceController } from "./face.js";
import { Automap } from "./automap.js";
import { fetchOSM } from "../world/osm.js";
import { generateCity } from "../world/procgen.js";
import { buildLevel } from "../world/levelbuilder.js";

const LEVEL_CACHE = new Map();

export class Game {
  constructor(engine, settings) {
    this.engine = engine;
    this.settings = settings;
    this.state = "menu";
    this.player = new Player();
    this.face = new FaceController();
    this.enemies = new EnemyManager(this);
    this.items = new Items(this);
    this.effects = new Effects(engine);
    this.projectiles = new Projectiles(this);
    this.barrels = new Barrels(this);
    this.weapons = new Weapons(this);
    this.hud = new HUD(document.getElementById("hud-canvas"), this);
    this.automap = new Automap(document.getElementById("automap-canvas"), this);
    this.automapOpen = false;
    this.level = null;
    this.locationName = "";
    this.lat = 0; this.lng = 0;
    this.levelTime = 0;
    this.revealed = new Set();
    this.revealT = 0;
    this.cheatMap = false;
    this.hasMap = false;
    this.keyFlashT = 0;
    this.keyFlashKey = null;
    this.deathScreenShown = false;
    this.paused = false;
    this.suppressPauseOnUnlock = false;
    this.onStateChange = null;      // hook for menus
    this._vignetteEl = document.getElementById("damage-vignette");
    this._clock = 0;
    this._lastT = 0;
    this._raf = null;
    this.audioUnlockHooked = false;
    this._bindInput();
  }

  // ================= INPUT ACTIONS =================
  _bindInput() {
    INPUT.onAction((act) => {
      if (this.state === "playing" || this.state === "dead") {
        switch (act) {
          case "weapon1": case "weapon2": case "weapon3": case "weapon4":
          case "weapon5": case "weapon6": case "weapon7": {
            const slotOrder = ["fist", "pistol", "shotgun", "supershotgun", "chaingun", "rocket", "plasma"];
            this.weapons.requestSwitch(slotOrder[parseInt(act.slice(-1)) - 1]);
            break;
          }
          case "wheelNext": this.weapons.cycle(1); break;
          case "wheelPrev": this.weapons.cycle(-1); break;
          case "toggleCamera":
            this.settings.classicCamera = !this.settings.classicCamera;
            this.announce(this.settings.classicCamera ? "CLASSIC CAMERA — HORIZON LOCKED" : "MODERN CAMERA — FREE LOOK", "#8ff8ff", 1.6);
            break;
          case "toggleHud":
            this.settings.hudMode = (this.settings.hudMode + 1) % 4;
            this.notify(["HUD: FULL", "HUD: STATUS BAR", "HUD: MINIMAL", "HUD: OFF"][this.settings.hudMode]);
            break;
          case "automap": this.toggleAutomap(); break;
          case "console": {
            const el = document.getElementById("console-log");
            el.classList.toggle("hidden");
            if (!el.classList.contains("hidden")) {
              el.textContent = (window.__errorLog.length ? window.__errorLog.slice(-10) : ["— console —", "cheats: IDDQD · IDKFA · IDCLIP · IDDT · IDBEHOLD · IDGPS"]).join("\n");
            }
            break;
          }
          case "use": this.tryUse(); break;
          case "screenshot": this.screenshot(); break;
          case "toggleMusic": AUDIO.setMusic(AUDIO.musicMode === "off" ? "explore" : "off"); break;
        }
      }
    });
  }

  handleAction(act) { /* external (menus) can forward */ }

  toggleAutomap() {
    if (this.state !== "playing") return;
    this.automapOpen = !this.automapOpen;
    const cv = this.automap.cv;
    cv.classList.toggle("visible", this.automapOpen);
    AUDIO.doorOpen();
  }

  tryUse() {
    const p = this.player;
    if (p.dead || !this.level) return;
    const d = this.level.doorNear(p.pos.x, p.pos.z, 3.4);
    if (d && d.state === "closed") {
      if (p.keys.has(d.key)) {
        d.open();
        AUDIO.doorOpen(0, 0);
        this.announce(`${d.key.toUpperCase()} DOOR OPENED`, { red: "#ff4455", blue: "#4488ff", yellow: "#ffcc33" }[d.key], 2);
        this.enemies.onNoise(d.x, d.z, 70);
      } else {
        AUDIO.doorLocked();
        this.announce(`YOU NEED A ${d.key.toUpperCase()} KEYCARD`, "#ff8822", 2);
        p.hurtDir = 0;
      }
    }
  }

  screenshot() {
    try {
      this.engine.render();
      const url = this.engine.canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `doommaps_${Date.now()}.png`;
      a.click();
      this.notify("Screenshot saved.");
    } catch (e) { console.warn(e); }
  }

  // ================= LEVEL LOADING =================
  async startRun(loc, onProgress) {
    this.state = "loading";
    this.paused = false;
    this.lat = loc.lat; this.lng = loc.lng;
    this.locationName = loc.name || "UNKNOWN SECTOR";
    AUDIO.init(); AUDIO.resume();
    AUDIO.setMusic("explore");

    const progress = onProgress || (() => {});
    progress(0.1, "CONSULTING THE ORACLES…");

    // fetch geography (cached)
    const cacheKey = `${loc.lat.toFixed(4)},${loc.lng.toFixed(4)},${this.settings.mapRadius}`;
    let osm = LEVEL_CACHE.get(cacheKey);
    let usedProcgen = false;
    if (!osm) {
      progress(0.25, "SUMMONING STREET DATA…");
      osm = await fetchOSM(loc.lat, loc.lng, this.settings.mapRadius);
      if (!osm) {
        progress(0.4, "ORACLE SILENT — RAISING PROCEDURAL HELL…");
        osm = generateCity(this.settings.mapRadius);
        usedProcgen = true;
        LEVEL_CACHE.set(cacheKey, osm);
      } else {
        LEVEL_CACHE.set(cacheKey, osm);
      }
      await new Promise(r => setTimeout(r, 60));
    }
    progress(0.55, usedProcgen ? "DEMONIFYING AI-GENERATED CITY…" : `DEMONIFYING ${osm.buildings.length} BUILDINGS, ${osm.roads.length} STREETS…`);
    await new Promise(r => setTimeout(r, 30));

    // dispose old level
    this.disposeLevel();

    // build
    this.level = buildLevel(osm, {
      radius: this.settings.mapRadius,
      density: this.settings.enemyDensity,
      lat: loc.lat, lng: loc.lng,
      realTextures: this.settings.realTextures && this.settings.showStreetPosters,
    });
    this.engine.scene.add(this.level.group);

    progress(0.85, "DEPLOYING DEMONS…");
    await new Promise(r => setTimeout(r, 30));

    // spawn actors
    this.enemies.spawnSet(this.level.enemySpawns);
    this.items.spawnSet(this.level.items);
    this.barrels.spawnSet(this.level.barrels);
    this._revealQueue = [];
    this.automap.build();

    // sky flavor by hash
    this.engine.setSkyMode([0, 1, 2][Math.abs(hashCode(this.locationName)) % 3]);

    progress(1, "READY. RIP AND TEAR.");
    this.player.reset(this.level.spawn);
    this.weapons.current = "pistol";
    this.weapons.state = "idle";
    this.revealed = new Set();
    this.cheatMap = false;
    this.hasMap = false;
    this.levelTime = 0;
    this.automapOpen = false;
    this.automap.cv.classList.remove("visible");
    this.face.quipT = 0;

    this.state = "playing";
    this.deathScreenShown = false;
    this.notify(`SIEGE ZONE: ${this.locationName}`);
    this.announce("FIND THE EXIT PORTAL — IT'S SEALED", "#f7d84b", 3.2);
    INPUT.enabled = true;
    INPUT.cheatBuffer = "";
    INPUT.requestLock();
    setTimeout(() => {
      if (this.state === "playing" && INPUT.lockSupported && !INPUT.locked) {
        this.notify("CLICK to capture the mouse");
      }
    }, 900);
  }

  disposeLevel() {
    if (this.level) {
      this.engine.scene.remove(this.level.group);
      this.level.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      this.level = null;
    }
    this.enemies.dispose();
    this.items.dispose();
    this.barrels.dispose();
    this.projectiles.dispose();
    this.effects.dispose();
  }

  // ================= LOOP =================
  start() {
    const loop = (t) => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (t - this._lastT) / 1000 || 0.016);
      this._lastT = t;
      this._clock += dt;
      this.update(dt);
      this.engine.render();
      this.hud.draw(dt);
      if (this.automapOpen) this.automap.draw(dt);
    };
    this._raf = requestAnimationFrame(loop);
  }

  update(dt) {
    const t = this._clock;
    // ambience even in menus
    if (this.level) {
      for (const u of this.level.updaters) u(dt, t);
    }
    this.face.update(dt);
    this.effects.update(dt);
    this.keyFlashT = Math.max(0, this.keyFlashT - dt);

    if (this.state === "menu" || this.state === "loading" || this.paused) return;

    this.levelTime += dt;

    // cheats
    this.checkCheats();

    // input → player (also drives the death-cam droop when dead)
    this.player.update(dt, INPUT, this.level, this.settings, this.engine, this);

    // camera from player
    const cam = this.engine.camera;
    cam.position.set(
      this.player.pos.x + this.player.bobX * 0.5,
      this.player.pos.y + this.player.bobY,
      this.player.pos.z
    );
    cam.rotation.set(this.player.pitch + this.engine.shakeVec.y, this.player.angle + this.engine.shakeVec.x, 0);

    // death handling
    if (this.player.dead && this.state === "playing") {
      this.state = "dead";
      INPUT.releaseLock();
      AUDIO.setMusic("off");
      setTimeout(() => {
        if (this.state === "dead" && this.onStateChange) this.onStateChange("dead");
      }, 1700);
    }

    if (!this.player.dead) {
      this.weapons.update(dt, INPUT);
      // holding use for doors
      if (INPUT.useKey) this._useHeldT = (this._useHeldT || 0) + dt; else this._useHeldT = 0;
      if (this._useHeldT > 0 && this._useHeldT < dt * 1.5) this.tryUse();
    }
    this.enemies.update(dt);
    this.projectiles.update(dt);
    this.items.update(dt);
    this.barrels.update(dt);

    // portal victory
    if (!this.player.dead) {
      const po = this.level.portal;
      const dP = Math.hypot(this.player.pos.x - po.x, this.player.pos.z - po.z);
      if (dP < po.r) this.victory();
      else if (dP < po.r + 8 && this.frameTick(0.5)) AUDIO.teleport();
    }

    // map reveal
    this.revealT -= dt;
    if (this.revealT <= 0) {
      this.revealT = 0.22;
      const g = this.level.grid;
      const cix = g.toCellX(this.player.pos.x), ciz = g.toCellZ(this.player.pos.z);
      const R = 8;
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const ix = cix + dx, iz = ciz + dz;
        if (ix < 0 || iz < 0 || ix >= g.n || iz >= g.n) continue;
        if (dx * dx + dz * dz > R * R) continue;
        const ci = g.idx(ix, iz);
        if (!this.revealed.has(ci)) {
          this.revealed.add(ci);
          this._revealQueue.push(ci);
        }
      }
    }

    // automap zoom controls
    if (this.automapOpen) {
      if (INPUT.keys.has("Equal")) this.automap.zoom = clamp(this.automap.zoom * (1 + dt * 2), 0.5, 6);
      if (INPUT.keys.has("Minus")) this.automap.zoom = clamp(this.automap.zoom / (1 + dt * 2), 0.5, 6);
      this.automap.followPlayer = !INPUT.keys.has("KeyF");
    }

    // music state
    this.updateMusic();

    // engine update
    this.engine.update(dt, t, this.player.pos);

    // vignette decay
    if (this._vign > 0) {
      this._vign = Math.max(0, this._vign - dt * 1.4);
      this._applyVignette(this._vign);
    }
    // persistent low-hp vignette
    if (this.player.health < 25 && !this.player.dead) {
      const base = (25 - this.player.health) / 25 * 0.4 * (0.7 + 0.3 * Math.sin(t * 5));
      this._vignetteEl.style.boxShadow = `inset 0 0 120px ${60 + base * 60}px rgba(180, 0, 0, ${0.35 + base})`;
    }
  }

  frameTick(period) {
    this._frameTickAcc = (this._frameTickAcc || 0) + 0.016;
    if (this._frameTickAcc >= period) { this._frameTickAcc = 0; return true; }
    return false;
  }

  updateMusic() {
    if (AUDIO.musicMode === "off") return;
    const p = this.player;
    let mode = "explore";
    let combat = false, boss = false;
    for (const e of this.enemies.list) {
      if (!e.awake || e.state === "dying") continue;
      const d = e.pos.distanceTo(p.pos);
      if (d < 55) combat = true;
      if (e.def.boss && d < 80) boss = true;
      if (combat && boss) break;
    }
    if (boss) mode = "boss";
    else if (p.health < 30 && combat) mode = "lowhp";
    else if (combat || p.recentDamage > 0) mode = "combat";
    AUDIO.setMusic(mode);
  }

  // ================= DAMAGE / NOTIFICATIONS =================
  damagePlayer(amount, srcPos, kind) {
    if (this.state !== "playing") return;
    let srcAngle = null;
    if (srcPos) {
      srcAngle = Math.atan2(
        -(srcPos.x - this.player.pos.x),
        -(srcPos.z - this.player.pos.z)
      );
    }
    const dmg = this.player.takeDamage(amount, srcAngle);
    if (dmg <= 0) return;
    this.engine.hurt(clamp(dmg / 40, 0.25, 0.9));
    this.engine.addShake(clamp(dmg / 90, 0.1, 0.5));
    this._vign = Math.min(1, (this._vign || 0) + dmg / 55);
    this._applyVignette(this._vign);
    this.face.onPain(this.player.hurtDir);
  }
  _applyVignette(v) {
    if (v <= 0.01 && this.player.health >= 25) {
      this._vignetteEl.style.boxShadow = "inset 0 0 120px 60px rgba(180,0,0,0)";
    } else {
      this._vignetteEl.style.boxShadow = `inset 0 0 120px ${60 + v * 50}px rgba(180, 0, 0, ${0.3 + v * 0.5})`;
    }
  }

  notify(text) { this.hud.notify(text); }
  announce(text, color, dur) { this.hud.announce(text, color, dur); }
  flashPickup(color) { this.keyFlashT = 1.2; this.keyFlashKey = this.player.keys.size ? [...this.player.keys].pop() : null; }
  removeItem(item) { this.items.remove(item); }

  onEnemyKilled(enemy) {
    this.player.kills++;
    if (enemy.type === "archdevil") {
      this.announce("THE ARCHDEVIL IS DESTROYED", "#7ae84b", 3);
    }
    // bloodbath intensity
    this.frameTick(0);
  }

  onFaceClick() {
    if (this.state !== "playing") return;
    this.face.onClick();
    AUDIO.faceQuip();
  }

  victory() {
    if (this.state !== "playing") return;
    this.state = "victory";
    AUDIO.powerup();
    AUDIO.setMusic("off");
    INPUT.releaseLock();
    INPUT.enabled = false;
    setTimeout(() => {
      if (this.onStateChange) this.onStateChange("victory");
    }, 600);
  }

  // ================= CHEATS =================
  checkCheats() {
    if (INPUT.cheatBuffer.length < 5) return;
    const buf = INPUT.consumeCheats();
    const p = this.player;
    if (buf.endsWith("IDDQD")) {
      p.god = !p.god;
      this.announce(p.god ? "GOD MODE — DEGREELESSNESS ENABLED" : "GOD MODE OFF", p.god ? "#7aff7a" : "#ff8855", 2);
    } else if (buf.endsWith("IDKFA")) {
      ["shotgun", "supershotgun", "chaingun", "rocket", "plasma"].forEach(w => p.weapons.add(w));
      p.ammo = { bullets: p.maxAmmo.bullets, shells: p.maxAmmo.shells, rockets: p.maxAmmo.rockets, cells: p.maxAmmo.cells };
      p.keys = new Set(["red", "blue", "yellow"]);
      this.announce("VERY HAPPY AMMO + FULL ARSENAL", "#f7d84b", 2);
      AUDIO.powerup();
    } else if (buf.endsWith("IDCLIP") || buf.endsWith("IDSPISPOPD")) {
      p.noclip = !p.noclip;
      this.announce(p.noclip ? "NO CLIPPING MODE ON" : "NO CLIPPING MODE OFF", "#8ff8ff", 1.6);
    } else if (buf.endsWith("IDDT")) {
      this.cheatMap = !this.cheatMap;
      this.announce(this.cheatMap ? "FULL MAP REVEALED" : "MAP HIDDEN", "#c0c0ff", 1.6);
    } else if (buf.endsWith("IDBEHOLD")) {
      p.invulnT = Math.max(p.invulnT, 30);
      this.announce("POWER OF T — INVULNERABILITY", "#7aff7a", 1.6);
    } else if (buf.endsWith("IDCHOPPERS")) {
      p.berserkTintT = 30; p.berserkT = 1;
      this.announce("BERSERK RAGE", "#ff4444", 1.6);
    } else if (buf.endsWith("IDCLEV")) {
      this.announce("IDCLEV: USE THE MAP MENU TO TRAVEL", "#8ff8ff", 1.8);
    } else if (buf.endsWith("IDGPS")) {
      this.onStateChange && this.onStateChange("gotoGPS");
    } else {
      INPUT.cheatBuffer = buf.slice(-5);
    }
  }

  setPaused(v) {
    this.paused = v;
    if (v) {
      INPUT.enabled = false;
      INPUT.releaseLock();
    } else if (this.state === "playing") {
      INPUT.enabled = true;
      INPUT.requestLock();
    }
  }
}

function hashCode(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
