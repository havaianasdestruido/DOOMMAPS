// ============================================================
// DOOMMAPS — Player: DOOM-authentic movement, collision,
// health/armor, inventory, power-ups
// ============================================================
import * as THREE from "three";
import { DOOM, clamp } from "../config.js";
import { AUDIO } from "../core/audio.js";

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.angle = 0;            // yaw (radians, 0 = -Z)
    this.pitch = 0;            // only modern mode
    this.health = DOOM.MAX_HEALTH;
    this.armor = 0;
    this.armorGrade = 0;       // 0 none, 1 green, 2 blue
    this.keys = new Set();     // "red" | "blue" | "yellow"
    this.weapons = new Set(["fist", "pistol"]);
    this.currentWeapon = "pistol";
    this.ammo = { bullets: 50, shells: 0, rockets: 0, cells: 0 };
    this.maxAmmo = { bullets: 200, shells: 50, rockets: 50, cells: 300 };
    this.dead = false;
    this.god = false;
    this.noclip = false;
    this.invulnT = 0;
    this.berserkT = 0;    // DOOM rules: once picked up it never expires
    this.berserkTintT = 0;
    this.radT = 0;
    this.liteT = 0;
    this.invisT = 0;
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.deathT = 0;
    this.hurtDir = 0;      // direction damage came from (for face)
    this.painT = 0;
    this.lavaT = 0;
    this.stepT = 0;
    this.landed = true;
    this.vy = 0;
    this.flyY = 0;         // noclip vertical
    this.kills = 0;
    this.secretsFound = 0;
    this.moving = false;
    this.recentDamage = 0; // merciless combat detector
  }

  reset(spawn) {
    this.pos.set(spawn.x, DOOM.EYE_HEIGHT, spawn.z);
    this.vel.set(0, 0, 0);
    this.angle = spawn.angle ?? 0;
    this.pitch = 0;
    this.health = DOOM.MAX_HEALTH;
    this.armor = 0; this.armorGrade = 0;
    this.keys = new Set();
    this.weapons = new Set(["fist", "pistol"]);
    this.currentWeapon = "pistol";
    this.ammo = { bullets: 50, shells: 0, rockets: 0, cells: 0 };
    this.dead = false; this.deathT = 0;
    this.god = false; this.noclip = false;
    this.invulnT = 0; this.berserkT = 0; this.berserkTintT = 0;
    this.radT = 0; this.liteT = 0; this.invisT = 0;
    this.kills = 0; this.secretsFound = 0;
    this.painT = 0; this.recentDamage = 0;
  }

  get eyeY() { return this.pos.y; }

  update(dt, input, level, settings, engine, game) {
    if (this.dead) {
      this.deathT += dt;
      // death cam droop
      const targetY = Math.max(0.3, DOOM.EYE_HEIGHT - this.deathT * 1.4);
      this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 6);
      return;
    }

    // timers
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.radT = Math.max(0, this.radT - dt);
    this.liteT = Math.max(0, this.liteT - dt);
    this.invisT = Math.max(0, this.invisT - dt);
    this.berserkTintT = Math.max(0, this.berserkTintT - dt);
    this.painT = Math.max(0, this.painT - dt);
    this.recentDamage = Math.max(0, this.recentDamage - dt * 8);

    // --- look ---
    const { dx, dy } = input.pollMouse();
    this.angle -= dx;
    this.angle += input.turnKeys * DOOM.TURN_SPEED * dt;
    if (!settings.classicCamera) {
      this.pitch = clamp(this.pitch - dy * 0.85, -1.55, 1.55);
    } else {
      this.pitch *= 0.8;
    }
    if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;
    if (this.angle < 0) this.angle += Math.PI * 2;

    // --- move ---
    const fwd = input.moveForward;
    const strafe = input.moveStrafe;
    const sx = Math.sin(this.angle), sz = Math.cos(this.angle);
    // facing -Z when angle=0: forward vector = (-sin(angle), -cos(angle))... use -s, -c
    const fvx = -sx, fvz = -sz;
    const rvx = -sz, rvz = sx;
    let mx = fvx * fwd * DOOM.MOVE_SPEED + rvx * strafe * DOOM.STRAFE_SPEED;
    let mz = fvz * fwd * DOOM.MOVE_SPEED + rvz * strafe * DOOM.STRAFE_SPEED;
    this.moving = (fwd !== 0 || strafe !== 0);

    if (this.noclip) {
      const fly = (input.keys.has("Space") ? 8 : 0) + (input.keys.has("ShiftLeft") ? -8 : 0);
      this.pos.x += mx * dt * 1.6;
      this.pos.z += mz * dt * 1.6;
      this.pos.y = clamp(this.pos.y + fly * dt, 0.5, 60);
      this.bobAmount *= 0.9;
      return;
    }

    // axis-separated collision
    const r = DOOM.PLAYER_RADIUS;
    const nx = this.pos.x + mx * dt;
    if (!this.collides(level, nx, this.pos.z, r)) this.pos.x = nx;
    const nz = this.pos.z + mz * dt;
    if (!this.collides(level, this.pos.x, nz, r)) this.pos.z = nz;

    // --- floor / lava damage ---
    const fl = level.floorAtSafe(this.pos.x, this.pos.z);
    if (fl.lava && this.radT <= 0) {
      this.lavaT += dt;
      if (this.lavaT > 0.22) {
        this.lavaT = 0;
        game.damagePlayer(fl.damage, null, "lava");
      }
    } else this.lavaT = 0;

    // --- head bob ---
    if (this.moving && settings.headBob) {
      const speedNorm = Math.min(1, Math.hypot(mx, mz) / DOOM.MOVE_SPEED);
      this.bobPhase += dt * 10.5 * speedNorm;
      this.bobAmount += (speedNorm - this.bobAmount) * Math.min(1, dt * 8);
    } else {
      this.bobAmount *= Math.max(0, 1 - dt * 5);
    }
    // jump (modern opt-in)
    if (settings.jump && input.jumpKey && this.landed) {
      this.vy = 7.4; this.landed = false;
      AUDIO.grunt();
    }
    if (!this.landed) {
      this.vy -= 21 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= DOOM.EYE_HEIGHT) {
        this.pos.y = DOOM.EYE_HEIGHT;
        this.landed = true; this.vy = 0;
        AUDIO.landThud();
        engine.addShake(0.12);
      }
    }

    // footsteps
    if (this.moving) {
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.34;
        AUDIO.landThud();
      }
    }

    // invuln visual
    engine.setInvuln(this.invulnT > 0 ? 0.9 : 0);
  }

  collides(level, x, z, r) {
    // check 4 offsets of circle
    return (
      level.isSolid(x + r, z) || level.isSolid(x - r, z) ||
      level.isSolid(x, z + r) || level.isSolid(x, z - r) ||
      level.isSolid(x + r * 0.7, z + r * 0.7) || level.isSolid(x - r * 0.7, z - r * 0.7) ||
      level.isSolid(x + r * 0.7, z - r * 0.7) || level.isSolid(x - r * 0.7, z + r * 0.7)
    );
  }

  get bobY() { return Math.sin(this.bobPhase * 2) * 0.055 * this.bobAmount; }
  get bobX() { return Math.sin(this.bobPhase) * 0.04 * this.bobAmount; }

  giveAmmo(kind, n) {
    const before = this.ammo[kind] || 0;
    this.ammo[kind] = Math.min(this.maxAmmo[kind], before + n);
    return this.ammo[kind] > before;
  }

  heal(n) {
    if (this.health >= DOOM.MAX_HEALTH_SOUL) return false;
    const cap = this.health > DOOM.MAX_HEALTH ? DOOM.MAX_HEALTH_SOUL : DOOM.MAX_HEALTH;
    this.health = Math.min(cap, this.health + n);
    return true;
  }

  addArmor(n, grade) {
    if (this.armor >= n && this.armorGrade >= grade) return false;
    this.armor = Math.max(this.armor, n);
    this.armorGrade = Math.max(this.armorGrade, grade);
    return true;
  }

  /** returns actual damage dealt */
  takeDamage(amount, srcAngle) {
    if (this.dead || this.god || this.invulnT > 0) return 0;
    let dmg = amount;
    if (this.armor > 0) {
      const absorb = this.armorGrade >= 2 ? 0.5 : 0.33;
      const absorbed = Math.min(this.armor, Math.round(dmg * absorb));
      this.armor -= absorbed;
      dmg -= absorbed;
      if (this.armor <= 0) this.armorGrade = 0;
    }
    dmg = Math.max(1, Math.round(dmg));
    this.health -= dmg;
    this.painT = 0.5;
    this.recentDamage += dmg;
    if (srcAngle !== undefined && srcAngle !== null) {
      // relative direction for face: -1 left, 0 front, 1 right
      let rel = srcAngle - this.angle;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      this.hurtDir = rel;
    }
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.deathT = 0;
      AUDIO.playerDeath();
    } else {
      AUDIO.playerPain(this.health);
    }
    return dmg;
  }
}
