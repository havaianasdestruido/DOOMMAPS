// ============================================================
// DOOMMAPS — Exploding barrels: shootable, chain-reacting
// ============================================================
import * as THREE from "three";
import { rand, clamp } from "../config.js";
import { AUDIO } from "../core/audio.js";

function paintBarrel() {
  const cv = document.createElement("canvas");
  cv.width = 22; cv.height = 26;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  // body
  ctx.fillStyle = "#5a6652"; ctx.fillRect(3, 2, 16, 22);
  ctx.fillStyle = "#444e3e"; ctx.fillRect(3, 2, 16, 4);
  ctx.fillStyle = "#6e7a62"; ctx.fillRect(3, 8, 16, 3);
  ctx.fillStyle = "#444e3e"; ctx.fillRect(3, 15, 16, 3);
  ctx.fillStyle = "#6e7a62"; ctx.fillRect(3, 21, 16, 3);
  ctx.fillStyle = "#39412f"; ctx.fillRect(2, 24, 18, 2);
  ctx.fillStyle = "#7a8870"; ctx.fillRect(4, 2, 3, 22);       // highlight
  // biohazard glyph
  ctx.fillStyle = "#e8c81e";
  ctx.beginPath(); ctx.arc(11, 12, 5, 0, 7); ctx.fill();
  ctx.fillStyle = "#5a6652";
  for (let a = 0; a < 3; a++) {
    const ang = a * (Math.PI * 2 / 3) + Math.PI / 2;
    ctx.beginPath(); ctx.arc(11 + Math.cos(ang) * 3, 12 + Math.sin(ang) * 3, 1.8, 0, 7); ctx.fill();
  }
  ctx.fillStyle = "#e8c81e";
  ctx.beginPath(); ctx.arc(11, 12, 1.2, 0, 7); ctx.fill();
  return cv;
}

let BARREL_TEX = null;

export class Barrels {
  constructor(game) {
    this.game = game;
    this.list = [];
    this._queue = []; // chain-ignition queue
    if (!BARREL_TEX) {
      BARREL_TEX = new THREE.CanvasTexture(paintBarrel());
      BARREL_TEX.magFilter = THREE.NearestFilter; BARREL_TEX.minFilter = THREE.NearestFilter;
      BARREL_TEX.generateMipmaps = false; BARREL_TEX.colorSpace = THREE.SRGBColorSpace;
    }
  }

  spawn(x, z) {
    const mat = new THREE.MeshLambertMaterial({ map: BARREL_TEX, transparent: true, alphaTest: 0.3 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), mat);
    mesh.position.set(x, 0.575, z);
    this.game.engine.scene.add(mesh);
    const b = { x, z, mesh, hp: 20, dead: false, id: Math.random() };
    this.list.push(b);
    return b;
  }

  spawnSet(arr) { for (const p of arr) this.spawn(p.x, p.z); }

  raycast(ox, oy, oz, dirx, diry, dirz, maxDist = 200) {
    let best = null, bestT = maxDist;
    for (const b of this.list) {
      if (b.dead) continue;
      const ex = b.x - ox, ey = 0.6 - oy, ez = b.z - oz;
      const t = ex * dirx + ey * diry + ez * dirz;
      if (t < 0.3 || t > bestT) continue;
      const px = ox + dirx * t - b.x;
      const py = oy + diry * t - 0.6;
      const pz = oz + dirz * t - b.z;
      if (Math.abs(px) < 0.48 && Math.abs(py) < 0.62 && Math.abs(pz) < 0.48) {
        best = b; bestT = t;
      }
    }
    return best ? { barrel: best, dist: bestT } : null;
  }

  inSphere(x, y, z, r) {
    return this.list.filter(b => !b.dead && Math.hypot(b.x - x, b.z - z) < r);
  }

  damage(b, dmg) {
    if (b.dead) return;
    b.hp -= dmg;
    if (b.hp <= 0) this.ignite(b, 0);
    else this.game.effects.puff(b.x, 0.8, b.z);
  }

  ignite(b, delay = 0) {
    if (b.dead) return;
    this._queue.push({ b, t: delay });
  }

  explodeNear(x, y, z, r) {
    for (const b of this.inSphere(x, y, z, r)) this.ignite(b, 0.1 + Math.random() * 0.22);
  }

  _explode(b) {
    if (b.dead) return;
    b.dead = true;
    const game = this.game;
    game.engine.scene.remove(b.mesh);
    b.mesh.material.dispose();
    game.effects.explosion(b.x, 0.6, b.z, 5);
    game.effects.decal(b.x, b.z, 2.2);
    const dp = Math.hypot(game.player.pos.x - b.x, game.player.pos.z - b.z);
    AUDIO.explosion(dp);
    game.engine.addShake(clamp(1.2 - dp / 30, 0, 0.7));
    // hurt everything in radius
    for (const e of game.enemies.inSphere(b.x, 0.6, b.z, 5.2)) {
      const dd = Math.hypot(e.pos.x - b.x, e.pos.z - b.z);
      const dmg = Math.round(140 * clamp(1 - dd / 5.2, 0.15, 1));
      e.hurt(dmg, Math.atan2(e.pos.x - b.x, e.pos.z - b.z), game);
      game.effects.blood(e.pos.x, e.pos.y + 1, e.pos.z, 6, true);
    }
    if (dp < 4.6) {
      const dmg = Math.round(110 * clamp(1 - dp / 4.6, 0.1, 1));
      game.damagePlayer(dmg, { x: b.x, z: b.z }, "barrel");
    }
    // CHAIN REACTION
    for (const other of this.inSphere(b.x, 0.6, b.z, 5.5)) {
      if (other !== b) this.ignite(other, 0.08 + Math.random() * 0.25);
    }
    game.enemies.onNoise(b.x, b.z, 70);
  }

  update(dt) {
    for (let i = this._queue.length - 1; i >= 0; i--) {
      const q = this._queue[i];
      q.t -= dt;
      if (q.t <= 0) {
        this._queue.splice(i, 1);
        this._explode(q.b);
      }
    }
    // bob slight glow? keep static; billboard toward camera
    const cam = this.game.engine.camera;
    for (const b of this.list) {
      if (!b.dead) b.mesh.rotation.y = Math.atan2(cam.position.x - b.x, cam.position.z - b.z);
    }
  }

  dispose() {
    for (const b of this.list) {
      if (!b.dead) {
        this.game.engine.scene.remove(b.mesh);
        b.mesh.material.dispose();
        b.mesh.geometry.dispose();
      }
    }
    this.list = [];
    this._queue = [];
  }
}
