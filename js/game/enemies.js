// ============================================================
// DOOMMAPS — Enemies: procedurally-drawn billboard pixel demons
// + AI (wake, chase, attack, pain, death), pack behavior
// ============================================================
import * as THREE from "three";
import { clamp, rand, choice } from "../config.js";
import { AUDIO } from "../core/audio.js";

// ---------------- enemy stat table ----------------
export const ENEMY_DEFS = {
  shambler: {
    name: "SHAMBLER", hp: 25, speed: 2.4, w: 0.95, h: 1.85, pain: 0.6,
    attack: { kind: "hitscan", dmg: 5, spread: 0.24, range: 60, cd: 1.3 },
    legacy: "zombie",
  },
  hellhound: {
    name: "HELLHOUND", hp: 42, speed: 3.1, w: 1.05, h: 1.95, pain: 0.45,
    attack: { kind: "projectile", proj: "impball", dmg: 9, speed: 11, range: 70, cd: 1.9 },
  },
  bruiser: {
    name: "BRUISER", hp: 95, speed: 4.6, w: 1.4, h: 1.9, pain: 0.3,
    attack: { kind: "melee", dmg: 16, range: 2.6, cd: 0.9 },
  },
  wraith: {
    name: "WRAITH", hp: 95, speed: 4.9, w: 1.4, h: 1.9, pain: 0.3, alpha: 0.45,
    attack: { kind: "melee", dmg: 16, range: 2.6, cd: 0.8 },
  },
  gunner: {
    name: "GUNNER", hp: 38, speed: 2.8, w: 0.95, h: 1.85, pain: 0.55,
    attack: { kind: "hitscan", dmg: 14, spread: 0.3, range: 55, cd: 2.2, burst: 3 },
    drop: "shells",
  },
  reaper: {
    name: "REAPER", hp: 120, speed: 3.4, w: 1.6, h: 1.6, pain: 0.25, fly: 2.4,
    attack: { kind: "projectile", proj: "plasmaball", dmg: 14, speed: 13, range: 80, cd: 2.4 },
  },
  warlord: {
    name: "WARLORD", hp: 320, speed: 3.8, w: 1.7, h: 2.5, pain: 0.12, boss: true,
    attack: { kind: "projectile", proj: "baronball", dmg: 24, speed: 15, range: 90, cd: 2.0 },
  },
  archdevil: {
    name: "ARCHDEVIL", hp: 4000, speed: 2.6, w: 2.7, h: 4.3, pain: 0.03, boss: true, big: true,
    attack: { kind: "rocketSalvo", dmg: 20, speed: 16, range: 120, cd: 2.6 },
  },
  hellweaver: {
    name: "HELLWEAVER", hp: 2500, speed: 1.9, w: 3.1, h: 2.6, pain: 0.05, boss: true, big: true,
    attack: { kind: "hitscan", dmg: 6, spread: 0.35, range: 90, cd: 0.35, burst: 6 },
  },
};

// ============================================================
// Procedural monster painter
// ============================================================
const PX = 2; // pixel size unit

function makeCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx };
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x / PX) * PX, Math.round(y / PX) * PX, Math.ceil(w / PX) * PX, Math.ceil(h / PX) * PX); }
function ellipse(ctx, cx, cy, rx, ry, c) {
  ctx.fillStyle = c; ctx.beginPath();
  ctx.ellipse(Math.round(cx / PX) * PX, Math.round(cy / PX) * PX, rx, ry, 0, 0, 7);
  ctx.fill();
}

const STYLES = {
  shambler:  { skin: "#8a9a70", skinD: "#5c684a", shirt: "#4a4438", shirtD: "#332e26", pants: "#3a3230", eye: "#ffcc33", acc: "#6b3a2a" },
  hellhound: { skin: "#c98858", skinD: "#96582e", shirt: "#a06a3a", shirtD: "#77492a", pants: "#8a5a30", eye: "#ff5522", acc: "#5c3418", horns: true },
  bruiser:   { skin: "#c97878", skinD: "#9a4e4e", shirt: "#b06060", shirtD: "#7e3e3e", pants: "#8a4444", eye: "#ffee66", acc: "#4a1e1e", bull: true },
  wraith:    { skin: "#c97878", skinD: "#9a4e4e", shirt: "#b06060", shirtD: "#7e3e3e", pants: "#8a4444", eye: "#88ffee", acc: "#4a1e1e", bull: true },
  gunner:    { skin: "#8a9a70", skinD: "#5c684a", shirt: "#3a4a3c", shirtD: "#28332a", pants: "#2c2c34", eye: "#ff4444", acc: "#1e1e26", gun: true },
  reaper:    { skin: "#c44a3a", skinD: "#8c2e22", shirt: "#a83a2c", shirtD: "#722418", pants: "#6e2018", eye: "#ffee44", acc: "#3a0e0a", float: true, jaw: true },
  warlord:   { skin: "#9a8a5a", skinD: "#6e5f3c", shirt: "#7e6f47", shirtD: "#574a2e", pants: "#5c3a2e", eye: "#33ff88", acc: "#2e2018", horns: true, hooves: true },
  archdevil: { skin: "#b8b0a0", skinD: "#847c6c", shirt: "#4a3a3c", shirtD: "#322628", pants: "#5c5c64", eye: "#ff3322", acc: "#8c2424", cyber: true },
  hellweaver:{ skin: "#8c4a5a", skinD: "#5e2e3a", shirt: "#6e3644", shirtD: "#482430", pants: "#3c2028", eye: "#ffcc22", acc: "#240e14", spider: true },
};

/** Draw one frame of an enemy. pose: { leg, armUp, mouth, hunch, tint, death: 0..3 } */
function drawEnemy(type, pose) {
  const st = STYLES[type];
  const W = type === "archdevil" ? 100 : type === "hellweaver" ? 120 : type === "reaper" ? 92 : 64;
  const H = type === "archdevil" ? 110 : type === "hellweaver" ? 84 : 80;
  const { cv, ctx } = makeCanvas(W, H);
  const cx = W / 2;
  const d = pose.death || 0;

  if (d >= 3) { // corpse: pool + flattened mass
    ellipse(ctx, cx, H - 6, W * 0.36, 8, "#6e1010");
    ellipse(ctx, cx - W * 0.1, H - 9, W * 0.2, 6, st.skinD);
    ellipse(ctx, cx + W * 0.08, H - 8, W * 0.16, 5, st.skin);
    // bones
    rect(ctx, cx - W * 0.2, H - 12, 8, 4, "#d8d0c0");
    rect(ctx, cx + W * 0.14, H - 14, 10, 4, "#d8d0c0");
    ellipse(ctx, cx + W * 0.22, H - 12, 5, 4, st.shirtD);
    return cv;
  }

  const fall = d === 1 ? 0.22 : d === 2 ? 0.65 : 0;
  const sink = d * H * 0.13;
  const rot = fall * 0.5;

  ctx.save();
  ctx.translate(cx, H - 4);
  ctx.rotate(rot);
  ctx.translate(-cx, -(H - 4));

  const baseY = H - 4 + sink;
  const legH = st.float ? 6 : 26;
  const torsoH = st.big ? 34 : 26;
  const headS = st.big ? 22 : 16;
  const torsoW = st.big ? 44 : type === "bruiser" || type === "wraith" ? 40 : 30;
  const hunch = (pose.hunch || 0) * 6;
  const legPhase = pose.leg || 0;

  // blood splats for death 1-2
  if (d >= 1) {
    ellipse(ctx, cx - 14, baseY - 4, 12, 5, "#7e1414");
    ellipse(ctx, cx + 12, baseY - 2, 9, 4, "#5c0c0c");
    if (d === 2) ellipse(ctx, cx, baseY - 8, 18, 7, "#6e1010");
  }

  // ---- legs ----
  if (st.float) {
    // floating bottom wisp
    ellipse(ctx, cx, baseY - 6, torsoW * 0.34, 10, st.shirtD);
  } else if (st.spider) {
    // mechanical legs
    for (let i = -1; i <= 1; i++) {
      const off = i * 26;
      const lift = i === 0 ? 0 : (legPhase > 0.5 ? 4 : 0);
      ctx.strokeStyle = st.pants; ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx + off * 0.6, baseY - torsoH - 6);
      ctx.lineTo(cx + off, baseY - 10 - lift);
      ctx.lineTo(cx + off * 1.35, baseY);
      ctx.stroke();
    }
  } else if (st.cyber) {
    // one cyber leg
    rect(ctx, cx - 16, baseY - legH, 10, legH - (legPhase > 0.5 ? 4 : 0), "#5c646e");
    rect(ctx, cx - 18, baseY - 6, 14, 6, "#3c444e");
    rect(ctx, cx + 8, baseY - legH, 10, legH - (legPhase > 0.5 ? 0 : 4), st.pants);
    rect(ctx, cx + 6, baseY - 6, 14, 6, st.skinD);
  } else {
    const l1 = legPhase > 0.5 ? 5 : 0;
    const l2 = legPhase > 0.5 ? 0 : 5;
    rect(ctx, cx - 13, baseY - legH, 10, legH - l1, st.pants);
    rect(ctx, cx + 3, baseY - legH, 10, legH - l2, st.pants);
    // feet
    rect(ctx, cx - 15, baseY - 6 - l1, 14, 6 + l1, st.skinD);
    rect(ctx, cx + 1, baseY - 6 - l2, 14, 6 + l2, st.skinD);
    if (st.hooves) {
      rect(ctx, cx - 15, baseY - 8 - l1, 14, 6, "#241a14");
      rect(ctx, cx + 1, baseY - 8 - l2, 14, 6, "#241a14");
    }
  }

  // ---- torso ----
  const ty = baseY - legH - torsoH;
  rect(ctx, cx - torsoW / 2, ty + hunch * 0.3, torsoW, torsoH, st.shirt);
  rect(ctx, cx - torsoW / 2, ty + hunch * 0.3, torsoW, 6, st.shirtD);          // shoulders shadow
  rect(ctx, cx - torsoW / 2, ty + torsoH - 5 + hunch * 0.3, torsoW, 5, st.shirtD); // belt
  // muscle shading
  rect(ctx, cx - torsoW * 0.25, ty + 10, torsoW * 0.18, torsoH - 16, st.shirtD);
  rect(ctx, cx + torsoW * 0.08, ty + 10, torsoW * 0.18, torsoH - 16, st.shirtD);
  // wounds on pain/death
  if (pose.tint || d >= 1) {
    ellipse(ctx, cx - torsoW * 0.2, ty + 12, 4, 4, "#a01010");
    ellipse(ctx, cx + torsoW * 0.25, ty + 18, 3, 4, "#7e0c0c");
  }
  if (type === "archdevil") {
    // shoulder missile pod
    rect(ctx, cx - torsoW / 2 - 8, ty - 2, 12, 14, "#4a545e");
    rect(ctx, cx + torsoW / 2 - 4, ty - 2, 12, 14, "#4a545e");
    rect(ctx, cx - torsoW / 2 - 5, ty + 1, 6, 3, "#8892a0");
    rect(ctx, cx + torsoW / 2 - 1, ty + 1, 6, 3, "#8892a0");
  }

  // ---- arms ----
  const armUp = pose.armUp || 0;
  const ay = ty + 8 + hunch * 0.3;
  if (st.gun) {
    // boomstick
    rect(ctx, cx - torsoW / 2 - 4, ay - 2, 10, 8, st.skin);
    rect(ctx, cx - torsoW / 2 + 2, ay - armUp * 8, 26, 7, "#241c18");
    rect(ctx, cx - torsoW / 2 + 16, ay - armUp * 8 - 2, 14, 4, "#14100c");
    if (pose.muzzle) { ellipse(ctx, cx + torsoW / 2 + 14, ay + 1 - armUp * 8, 7, 7, "#ffe86a"); }
    rect(ctx, cx + torsoW / 2 - 2, ay - 2, 12, 6, st.skin);
  } else if (st.float || type === "hellhound" || type === "warlord" || st.cyber || st.spider) {
    const armY = ay - armUp * 12;
    rect(ctx, cx - torsoW / 2 - 8, armY, 10, 18, st.skin);
    rect(ctx, cx + torsoW / 2 - 2, armY - armUp * 6, 10, 18, st.skin);
    // claws
    rect(ctx, cx - torsoW / 2 - 10, armY + 16, 14, 5, st.acc);
    rect(ctx, cx + torsoW / 2 - 4, armY + 16 - armUp * 6, 14, 5, st.acc);
    if (pose.muzzle) { // ball of flame in hands
      ellipse(ctx, cx + torsoW / 2 + 6, armY + 6 - armUp * 6, 9, 9, type === "warlord" ? "#5aff8c" : "#ff8c1c");
      ellipse(ctx, cx + torsoW / 2 + 6, armY + 6 - armUp * 6, 5, 5, "#fff6a8");
    }
  } else {
    rect(ctx, cx - torsoW / 2 - 6, ay, 9, 20, st.shirt);
    rect(ctx, cx + torsoW / 2 - 3, ay, 9, 20, st.shirt);
    rect(ctx, cx - torsoW / 2 - 7, ay + 17, 10, 8, st.skin);
    rect(ctx, cx + torsoW / 2 - 3, ay + 17, 10, 8, st.skin);
    if (type === "shambler") { // pistol
      rect(ctx, cx + torsoW / 2 - 1, ay + 12 - armUp * 8, 16, 5, "#241c18");
      if (pose.muzzle) ellipse(ctx, cx + torsoW / 2 + 16, ay + 14 - armUp * 8, 6, 6, "#ffe86a");
    }
  }

  // ---- head ----
  const hy = ty - headS + hunch * 0.3;
  if (st.jaw) {
    // reaper: huge mouth head
    ellipse(ctx, cx, hy + headS * 0.6, headS * 1.5, headS * 1.05, st.skin);
    ellipse(ctx, cx, hy + headS * 0.8, headS * 1.1, headS * (pose.mouth ? 0.75 : 0.4), "#200404");
    if (pose.mouth) {
      ellipse(ctx, cx, hy + headS * 0.9, headS * 0.7, headS * 0.45, "#5c0c0c");
      // teeth
      for (let t2 = -3; t2 <= 3; t2++) {
        rect(ctx, cx + t2 * 7 - 1, hy + headS * 0.5, 3, 5, "#e8dcc8");
        rect(ctx, cx + t2 * 7 - 1, hy + headS * 1.05, 3, 5, "#e8dcc8");
      }
    }
    ellipse(ctx, cx - headS * 0.7, hy + headS * 0.1, 4, 4, st.eye);
    ellipse(ctx, cx + headS * 0.7, hy + headS * 0.1, 4, 4, st.eye);
  } else {
    rect(ctx, cx - headS / 2, hy, headS, headS, st.skin);
    rect(ctx, cx - headS / 2, hy + headS - 5, headS, 5, st.skinD); // jaw shade
    // brow
    rect(ctx, cx - headS / 2, hy + 3, headS, 4, st.skinD);
    // eyes
    const eyeY = hy + 6, eGlow = d >= 1 ? "#401010" : st.eye;
    rect(ctx, cx - headS * 0.32, eyeY, 4, 3, eGlow);
    rect(ctx, cx + headS * 0.12, eyeY, 4, 3, eGlow);
    // mouth
    if (pose.mouth) rect(ctx, cx - headS * 0.3, hy + headS - 7, headS * 0.6, 5, "#280404");
    else rect(ctx, cx - headS * 0.25, hy + headS - 6, headS * 0.5, 2, "#3e2818");
    if (st.horns) {
      rect(ctx, cx - headS / 2 - 4, hy - 6, 6, 12, "#d8cfc0");
      rect(ctx, cx + headS / 2 - 2, hy - 6, 6, 12, "#d8cfc0");
      rect(ctx, cx - headS / 2 - 3, hy - 9, 4, 5, "#b8ac9c");
      rect(ctx, cx + headS / 2 - 1, hy - 9, 4, 5, "#b8ac9c");
    }
    if (type === "archdevil") {
      // mechanical jaw plate
      rect(ctx, cx - headS / 2, hy + headS - 8, headS, 8, "#7c858e");
      rect(ctx, cx - 2, hy + headS - 6, 4, 4, "#ff3322");
    }
  }

  ctx.restore();

  // pain flash
  if (pose.tint && !d) {
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = "rgba(255,30,30,0.45)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }
  return cv;
}

// build texture set per enemy type
const TEXSETS = {};
export const __test = { drawEnemy };
function getTexSet(type) {
  if (TEXSETS[type]) return TEXSETS[type];
  const mk = (pose) => {
    const t = new THREE.CanvasTexture(drawEnemy(type, pose));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = {
    idle: mk({}),
    walkA: mk({ leg: 0.2 }),
    walkB: mk({ leg: 0.8 }),
    attackA: mk({ armUp: 0.6, mouth: true }),
    attackB: mk({ armUp: 1, mouth: true, muzzle: true }),
    pain: mk({ tint: true, mouth: true, hunch: 1 }),
    die1: mk({ death: 1, mouth: true }),
    die2: mk({ death: 2, tint: true }),
    die3: mk({ death: 3 }),
  };
  TEXSETS[type] = set;
  return set;
}

// ============================================================
// Enemy entity + manager
// ============================================================
let NEXT_ID = 1;

export class Enemy {
  constructor(type, x, z, interior, game) {
    this.id = NEXT_ID++;
    this.type = type;
    this.def = ENEMY_DEFS[type];
    this.pos = new THREE.Vector3(x, this.def.fly || 0, z);
    this.hp = this.def.hp;
    this.state = "idle";
    this.stateT = 0;
    this.attackCd = rand(0.4, 1.4);
    this.frameT = 0;
    this.frameIdx = 0;
    this.awake = false;
    this.interior = interior;
    this.burstLeft = 0;
    this.salvoLeft = 0;
    this.moveAngle = rand(0, Math.PI * 2);
    this.strafeDir = choice([-1, 1]);
    this.game = game;

    const set = getTexSet(type);
    this.texset = set;
    const geo = new THREE.PlaneGeometry(this.def.w, this.def.h);
    const mat = new THREE.MeshLambertMaterial({
      map: set.idle, transparent: true, alphaTest: 0.35,
      emissive: 0x201008, emissiveMap: set.idle,
    });
    if (this.def.alpha) {
      mat.opacity = this.def.alpha; mat.depthWrite = false; mat.alphaTest = 0.1;
    }
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, this.def.h / 2 + (this.def.fly ? this.def.fly - 1 : 0), z);
    game.engine.scene.add(this.mesh);
    this.baseY = this.def.h / 2 + (this.def.fly ? this.def.fly - 1 : 0);
    this.deathDone = false;
  }

  setFrame(name) {
    if (this._frame === name) return;
    this._frame = name;
    this.mesh.material.map = this.texset[name];
    this.mesh.material.emissiveMap = this.texset[name];
  }

  wake(silent = false) {
    if (this.awake || this.state === "dying" || this.state === "dead") return;
    this.awake = true;
    this.state = "chase";
    const game = this.game;
    const d = this.pos.distanceTo(game.player.pos);
    const pan = worldPan(game, this.pos);
    if (!silent) AUDIO.alert(this.type, d, pan);
  }

  hurt(dmg, srcAngle, game) {
    if (this.state === "dying" || this.state === "dead") return false;
    this.hp -= dmg;
    this.wake(true);
    const d = this.pos.distanceTo(game.player.pos);
    const pan = worldPan(game, this.pos);
    if (this.hp <= 0) {
      this.die(game);
      return true;
    }
    if (Math.random() < this.def.pain + (dmg > 30 ? 0.35 : 0)) {
      this.state = "pain";
      this.stateT = 0;
      AUDIO.enemyPain(d, pan);
    }
    return false;
  }

  die(game, gib = false) {
    this.state = "dying";
    this.stateT = 0;
    this.deathFrame = 0;
    game.onEnemyKilled(this);
    const d = this.pos.distanceTo(game.player.pos);
    AUDIO.enemyDeath(this.type, d, worldPan(game, this.pos));
    if (this.def.drop) {
      game.items.spawn(this.def.drop, this.pos.x, this.pos.z);
    } else if (this.type === "shambler" && Math.random() < 0.4) {
      game.items.spawn("bullets", this.pos.x, this.pos.z);
    }
  }

  canSee(game) {
    const p = game.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 100) return false;
    return game.level.los(this.pos.x, this.pos.z, p.x, p.z);
  }

  update(dt, game) {
    const p = game.player;
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    this.stateT += dt;
    this.frameT += dt;

    // billboard face
    this.mesh.rotation.y = Math.atan2(game.engine.camera.position.x - this.pos.x, game.engine.camera.position.z - this.pos.z);

    switch (this.state) {
      case "idle": {
        this.setFrame("idle");
        // wake check
        if (this.frameT > 0.4) {
          this.frameT = 0;
          if (!p.dead && dist < (game.player.invisT > 0 ? 18 : 85) && !this.interior) {
            if (this.canSee(game)) this.wake();
          }
        }
        break;
      }
      case "pain": {
        this.setFrame("pain");
        if (this.stateT > 0.32) { this.state = this.awake ? "chase" : "idle"; }
        break;
      }
      case "dying": {
        const seq = ["die1", "die1", "die2", "die3"];
        const idx = Math.min(seq.length - 1, Math.floor(this.stateT / 0.22));
        this.setFrame(seq[idx]);
        // sink into ground slightly
        this.mesh.position.y = this.baseY - this.stateT * 0.2;
        if (this.stateT > 0.66 && !this.deathDone) {
          this.deathDone = true;
          this.mesh.position.y = this.def.h * 0.32; // flattened-ish billboard low
          this.mesh.scale.set(1.15, 0.55, 1);
        }
        return;
      }
      case "chase": {
        if (p.dead) { this.setFrame("idle"); break; }
        // walk animation
        this.setFrame(this.frameIdx === 0 ? "walkA" : "walkB");
        if (this.frameT > 0.24) { this.frameT = 0; this.frameIdx = 1 - this.frameIdx; }

        if (game.player.invisT > 0 && Math.random() < 0.02) {
          this.moveAngle = rand(0, Math.PI * 2); // confused
        } else {
          this.moveAngle = Math.atan2(dx, dz);
        }
        // strafing ranged enemies
        const def = this.def;
        let ang = this.moveAngle;
        if (def.attack.kind !== "melee" && dist < 20 && Math.random() < 0.25) {
          ang += this.strafeDir * Math.PI / 2;
          if (Math.random() < 0.02) this.strafeDir *= -1;
        }
        // melee: keep charging
        if (dist > this.def.attack.range * 0.8 || this.def.attack.kind === "melee") {
          const sp = def.speed * (this.type === "bruiser" && dist < 12 ? 1.8 : 1);
          const vx = Math.sin(ang) * sp * dt;
          const vz = Math.cos(ang) * sp * dt;
          this.tryMove(game, vx, vz);
        }
        // float bob
        if (def.fly) {
          this.baseY = def.h / 2 + def.fly - 1 + Math.sin(performance.now() * 0.0016 + this.id) * 0.35;
          this.mesh.position.y = this.baseY;
        }
        // attack?
        this.attackCd -= dt;
        const at = this.def.attack;
        const inRange = dist < at.range;
        if (this.attackCd <= 0 && inRange && (at.kind === "melee" ? dist < at.range : this.canSee(game))) {
          this.state = "attack";
          this.stateT = 0;
          this.fired = false;
        }
        break;
      }
      case "attack": {
        const at = this.def.attack;
        const mid = 0.38;
        this.setFrame(this.stateT < mid ? "attackA" : "attackB");
        // melee lunges
        if (at.kind === "melee") {
          const vx = Math.sin(this.moveAngle) * at.cd * 6 * dt;
          const vz = Math.cos(this.moveAngle) * at.cd * 6 * dt;
          this.tryMove(game, vx, vz);
        }
        if (!this.fired && this.stateT >= mid) {
          this.fired = true;
          this.executeAttack(game, dist);
        }
        if (this.stateT > 0.62) {
          this.state = "chase";
          this.attackCd = at.cd * rand(0.8, 1.3);
        }
        break;
      }
    }

    // separation from other live enemies
    if (this.state === "chase") {
      game.enemies.separate(this, dt);
    }

    this.mesh.position.x = this.pos.x;
    this.mesh.position.z = this.pos.z;
    if (!this.def.fly) this.mesh.position.y = this.baseY;
  }

  executeAttack(game, dist) {
    const at = this.def.attack;
    const p = game.player;
    const pan = worldPan(game, this.pos);
    switch (at.kind) {
      case "melee": {
        if (dist < at.range + 0.8) {
          game.damagePlayer(at.dmg + rand(-4, 6), this.pos, this.type);
        }
        AUDIO.punch(dist < at.range + 0.8);
        break;
      }
      case "hitscan": {
        AUDIO[dist > 25 ? "enemyShot" : (this.def === ENEMY_DEFS.gunner ? "enemyShotgun" : "enemyShot")](dist, pan);
        // chance to hit falls with distance & spread
        const acc = clamp(1 - dist / at.range * at.spread * 2.2, 0.08, 0.9);
        if (Math.random() < acc) {
          const dmg = Math.round(at.dmg * rand(0.7, 1.4));
          game.damagePlayer(dmg, this.pos, this.type);
        } else {
          game.effects.puff(p.pos.x + rand(-2, 2), rand(0.4, 1.8), p.pos.z + rand(-2, 2));
        }
        game.effects.tracer(this.pos, p.pos);
        if (at.burst && this.burstLeft < at.burst - 1 && Math.random() < 0.7) {
          this.burstLeft++;
          this.stateT = 0.3;
          this.fired = false;
        } else this.burstLeft = 0;
        break;
      }
      case "projectile": {
        AUDIO.fireball(dist, pan);
        game.projectiles.fire(this, at.proj, at.dmg, at.speed);
        break;
      }
      case "rocketSalvo": {
        game.projectiles.fire(this, "devilrocket", at.dmg, at.speed);
        if (this.salvoLeft < 2) { this.salvoLeft++; this.stateT = 0.28; this.fired = false; }
        else this.salvoLeft = 0;
        break;
      }
    }
  }

  tryMove(game, vx, vz) {
    const r = this.def.w * 0.38;
    const nx = this.pos.x + vx, nz = this.pos.z + vz;
    const solid = (x, z) =>
      game.level.isSolid(x + r, z) || game.level.isSolid(x - r, z) ||
      game.level.isSolid(x, z + r) || game.level.isSolid(x, z - r);
    if (!solid(nx, this.pos.z)) this.pos.x = nx;
    if (!solid(this.pos.x, nz)) this.pos.z = nz;
    // discouraged from lava
    const fl = game.level.floorAtSafe(this.pos.x, this.pos.z);
    if (fl.lava) { this.pos.x -= vx * 1.5; this.pos.z -= vz * 1.5; }
  }

  dispose() {
    this.game.engine.scene.remove(this.mesh);
    this.mesh.material.dispose();
  }
}

// ============================================================
export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  spawn(type, x, z, interior = false) {
    const e = new Enemy(type, x, z, interior, this.game);
    this.list.push(e);
    return e;
  }

  spawnSet(spawns) {
    for (const s of spawns) this.spawn(s.type, s.x, s.z, s.interior);
  }

  get aliveCount() { return this.list.filter(e => e.state !== "dying" && e.state !== "dead").length; }
  get totalSpawned() { return this.list.length; }

  separate(e, dt) {
    for (const o of this.list) {
      if (o === e || o.state === "dying" || o.state === "dead") continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      const min = (e.def.w + o.def.w) * 0.42;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        e.pos.x += (dx / d) * push;
        e.pos.z += (dz / d) * push;
      }
    }
  }

  onNoise(x, z, radius = 55) {
    for (const e of this.list) {
      if (e.awake || e.state === "dying") continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < radius) {
        e.wake();
        // pack behavior: wake neighbors
        for (const o of this.list) {
          if (o.awake || o === e) continue;
          if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) < 16) o.wake(true);
        }
      }
    }
  }

  /** hitscan against enemies: returns closest hit within ray */
  raycast(ox, oy, oz, dirx, diry, dirz, maxDist = 200) {
    let best = null, bestT = maxDist;
    for (const e of this.list) {
      if (e.state === "dying" || e.state === "dead") continue;
      const ex = e.pos.x - ox, ey = (e.pos.y + e.def.h / 2) - oy, ez = e.pos.z - oz;
      const t = ex * dirx + ey * diry + ez * dirz;
      if (t < 0.3 || t > bestT) continue;
      const px = ox + dirx * t - e.pos.x;
      const py = oy + diry * t - (e.pos.y + e.def.h / 2);
      const pz = oz + dirz * t - e.pos.z;
      const rx = e.def.w * 0.55, ry = e.def.h * 0.55;
      if (Math.abs(px) < rx && Math.abs(py) < ry && Math.abs(pz) < rx) {
        best = e; bestT = t;
      }
    }
    return best ? { enemy: best, dist: bestT } : null;
  }

  /** enemies within sphere (splash) */
  inSphere(x, y, z, r) {
    const out = [];
    for (const e of this.list) {
      if (e.state === "dying" || e.state === "dead") continue;
      const dx = e.pos.x - x, dy = (e.pos.y + e.def.h / 2) - y, dz = e.pos.z - z;
      if (dx * dx + dy * dy + dz * dz < r * r) out.push(e);
    }
    return out;
  }

  update(dt) {
    for (const e of this.list) e.update(dt, this.game);
  }

  dispose() {
    for (const e of this.list) e.dispose();
    this.list = [];
  }
}

function worldPan(game, pos) {
  const p = game.player;
  const ang = Math.atan2(pos.x - p.pos.x, pos.z - p.pos.z);
  let rel = ang - p.angle + Math.PI;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  return clamp(rel / 1.5, -1, 1);
}
