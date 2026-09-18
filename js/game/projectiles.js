// ============================================================
// DOOMMAPS — Projectiles: fireballs, plasma, rockets (both ways)
// ============================================================
import * as THREE from "three";
import { rand, clamp } from "../config.js";
import { AUDIO } from "../core/audio.js";

const DEFS = {
  impball:      { color: 0xff8c1c, core: "#fff6a8", size: 0.62, enemy: true, splash: 0,   gravity: 0 },
  plasmaball:   { color: 0x66ccff, core: "#e8ffff", size: 0.72, enemy: true, splash: 0,   gravity: 0 },
  baronball:    { color: 0x33ff66, core: "#eaffea", size: 0.85, enemy: true, splash: 2.5, gravity: 0 },
  devilrocket:  { color: 0xff5522, core: "#ffe86a", size: 0.5,  enemy: true, splash: 4.5, gravity: 0, rocket: true },
  playerRocket: { color: 0xffaa33, core: "#fff6c8", size: 0.55, enemy: false, splash: 6,  gravity: 0, rocket: true },
  playerPlasma: { color: 0x66aaff, core: "#ffffff", size: 0.6,  enemy: false, splash: 0,  gravity: 0 },
};

function projTexture(def) {
  const size = 24;
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d");
  const hex = "#" + def.color.toString(16).padStart(6, "0");
  const g = ctx.createRadialGradient(12, 12, 1, 12, 12, 12);
  g.addColorStop(0, def.core);
  g.addColorStop(0.45, hex);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(12, 12, 12, 0, 7); ctx.fill();
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEXCACHE = {};

export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  _tex(def) {
    if (!TEXCACHE[def.color]) TEXCACHE[def.color] = projTexture(def);
    return TEXCACHE[def.color];
  }

  /** fire from an enemy at the player (leads slightly) */
  fire(enemy, defName, dmg, speed) {
    const def = DEFS[defName];
    const p = this.game.player;
    const from = new THREE.Vector3(
      enemy.pos.x + Math.sin(enemy.moveAngle) * enemy.def.w * 0.6,
      1.1 + (enemy.def.fly || 0),
      enemy.pos.z + Math.cos(enemy.moveAngle) * enemy.def.w * 0.6,
    );
    // aim at player chest with slight spread
    const target = new THREE.Vector3(p.pos.x, p.pos.y - 0.4, p.pos.z);
    if (!def.rocket) {
      target.x += rand(-1.5, 1.5); target.z += rand(-1.5, 1.5);
    }
    const dir = target.sub(from).normalize();
    this._spawn(defName, from, dir, speed, dmg, true);
  }

  /** fire from the player (hitscan weapons don't come here) */
  firePlayer(defName, origin, dir, speed, dmg) {
    this._spawn(defName, origin.clone().addScaledVector(dir, 0.8), dir.clone().normalize(), speed, dmg, false);
  }

  _spawn(defName, pos, dir, speed, dmg, isEnemy) {
    const def = DEFS[defName];
    const mat = new THREE.SpriteMaterial({
      map: this._tex(def), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xffffff,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(def.rocket ? 0.4 : def.size, def.rocket ? 0.4 : def.size, 1);
    this.game.engine.scene.add(sprite);
    this.list.push({
      defName, def, sprite, pos: sprite.position,
      vel: dir.multiplyScalar(speed), dmg, isEnemy,
      life: 6, trailT: 0,
    });
    if (!isEnemy) this.game.engine.flash(pos, 1.6, def.color);
  }

  update(dt) {
    const game = this.game;
    const p = game.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      pr.life -= dt;
      const step = pr.vel.length() * dt;
      pr.pos.addScaledVector(pr.vel, dt);

      // rocket trail
      if (pr.def.rocket) {
        pr.trailT -= dt;
        if (pr.trailT <= 0) {
          pr.trailT = 0.02;
          game.effects._p("smoke").start(pr.pos.x, pr.pos.y, pr.pos.z, rand(-0.3, 0.3), rand(0.5, 1.2), rand(-0.3, 0.3), rand(0.4, 0.9), 0.4, -1.5);
        }
        // orient sprite stretch toward travel is not possible for Sprite; add tiny fire behind
        game.effects._p("fire").start(pr.pos.x, pr.pos.y, pr.pos.z, 0, 0, 0, 0.14, 0.35, 0);
      }

      let dead = pr.life <= 0;
      let exploded = false;

      // wall hit
      if (!dead && game.level.isSolid(pr.pos.x, pr.pos.z)) { dead = true; exploded = true; }
      if (!dead && pr.pos.y <= 0.1) { dead = true; exploded = true; }

      // entity hits
      if (!dead) {
        if (pr.isEnemy) {
          const dx = pr.pos.x - p.pos.x, dy = pr.pos.y - (p.pos.y - 0.3), dz = pr.pos.z - p.pos.z;
          if (!p.dead && dx * dx + dz * dz < 0.85 && Math.abs(dy) < 1.6) {
            game.damagePlayer(pr.dmg * rand(0.9, 1.2), pr.pos, pr.defName);
            dead = true; exploded = pr.def.splash > 0;
            if (!exploded) game.effects.plasmaHit(pr.pos.x, pr.pos.y, pr.pos.z, pr.defName === "baronball");
          }
        } else {
          const hit = game.enemies.inSphere(pr.pos.x, pr.pos.y, pr.pos.z, 0.9 + pr.def.size * 0.3);
          if (hit.length) {
            if (!pr.def.rocket) {
              hit[0].hurt(pr.dmg * rand(0.9, 1.3), Math.atan2(pr.vel.x, pr.vel.z), game);
              game.effects.plasmaHit(pr.pos.x, pr.pos.y, pr.pos.z);
            }
            dead = true;
            exploded = pr.def.splash > 0;
          }
        }
      }

      if (dead) {
        if (exploded) this._explode(pr);
        else if (pr.life <= 0) { /* fizzle */ }
        game.engine.scene.remove(pr.sprite);
        pr.sprite.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  _explode(pr) {
    const game = this.game;
    const { x, y, z } = pr.pos;
    if (pr.def.splash > 0) {
      game.effects.explosion(x, y, z, pr.def.splash);
      const dP = Math.hypot(x - game.player.pos.x, z - game.player.pos.z);
      AUDIO.explosion(dP);
      game.engine.addShake(clamp(1.4 - dP / 40, 0, 0.8));
      // splash damage
      if (pr.isEnemy) {
        if (dP < pr.def.splash * 1.2) {
          game.damagePlayer(pr.dmg * clamp(1 - dP / (pr.def.splash * 1.4), 0.3, 1), pr.pos, pr.defName);
        }
      } else {
        // player rockets: hurt enemies in radius + self-damage
        for (const e of game.enemies.inSphere(x, y, z, pr.def.splash * 1.5)) {
          const dd = Math.hypot(e.pos.x - x, e.pos.z - z);
          e.hurt(pr.dmg * clamp(1.4 - dd / pr.def.splash, 0.35, 1.4) * 3, Math.atan2(e.pos.x - x, e.pos.z - z), game);
          game.effects.blood(e.pos.x, e.pos.y + 1, e.pos.z, 6);
        }
        if (dP < pr.def.splash * 1.2) {
          game.damagePlayer(pr.dmg * 0.5 * clamp(1 - dP / (pr.def.splash * 1.4), 0, 1), pr.pos, "rocket");
        }
      }
    } else {
      game.effects.plasmaHit(x, y, z, pr.defName === "baronball");
    }
  }

  dispose() {
    for (const pr of this.list) {
      this.game.engine.scene.remove(pr.sprite);
      pr.sprite.material.dispose();
    }
    this.list = [];
  }
}
