// ============================================================
// DOOMMAPS — Effects: blood, gibs, explosions, tracers, decals
// ============================================================
import * as THREE from "three";
import { rand, choice } from "../config.js";
import { AUDIO } from "../core/audio.js";

function makeDotTexture(color1, color2, size = 16) {
  const cv = document.createElement("canvas");
  cv.width = size; cv.height = size;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  g.addColorStop(0, color1);
  g.addColorStop(0.5, color2);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

class Particle {
  constructor(scene, mat) {
    this.sprite = new THREE.Sprite(mat);
    this.sprite.visible = false;
    scene.add(this.sprite);
    this.vel = new THREE.Vector3();
    this.life = 0; this.maxLife = 0;
    this.grav = 0;
    this.startScale = 1;
    this.active = false;
  }
  start(x, y, z, vx, vy, vz, life, scale, grav = 10) {
    this.sprite.position.set(x, y, z);
    this.vel.set(vx, vy, vz);
    this.life = life; this.maxLife = life;
    this.grav = grav;
    this.startScale = scale;
    this.sprite.scale.set(scale, scale, 1);
    this.sprite.visible = true;
    this.active = true;
  }
  update(dt) {
    if (!this.active) return;
    this.life -= dt;
    if (this.life <= 0) { this.sprite.visible = false; this.active = false; return; }
    this.vel.y -= this.grav * dt;
    this.sprite.position.addScaledVector(this.vel, dt);
    if (this.sprite.position.y < 0.04 && this.grav > 0) {
      this.sprite.position.y = 0.04;
      this.vel.set(0, 0, 0); this.grav = 0;
    }
    const f = this.life / this.maxLife;
    const s = this.startScale * (0.4 + 0.6 * f);
    this.sprite.scale.set(s, s, 1);
    this.sprite.material.opacity = Math.min(1, f * 1.6);
  }
}

export class Effects {
  constructor(engine) {
    this.engine = engine;
    this.mats = {
      blood: new THREE.SpriteMaterial({ map: makeDotTexture("#c41818", "#6e0a0a"), transparent: true, depthWrite: false }),
      gib: new THREE.SpriteMaterial({ map: makeDotTexture("#a82418", "#520c08"), transparent: true, depthWrite: false }),
      fire: new THREE.SpriteMaterial({ map: makeDotTexture("#fff6a8", "#ff7a1400".slice(0, 7), 32).clone(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      fire2: new THREE.SpriteMaterial({ map: makeDotTexture("#ffd060", "#e84b10", 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      smoke: new THREE.SpriteMaterial({ map: makeDotTexture("#888888", "#333333", 32), transparent: true, depthWrite: false, opacity: 0.7 }),
      spark: new THREE.SpriteMaterial({ map: makeDotTexture("#ffe86a", "#ff9420", 16), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      plasma: new THREE.SpriteMaterial({ map: makeDotTexture("#c8f4ff", "#3a8cff", 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      green: new THREE.SpriteMaterial({ map: makeDotTexture("#d8ffd8", "#3aff6e", 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      dust: new THREE.SpriteMaterial({ map: makeDotTexture("#b09a80", "#5c4a3a", 32), transparent: true, depthWrite: false, opacity: 0.8 }),
      flash: new THREE.SpriteMaterial({ map: makeDotTexture("#ffffff", "#ffb020", 32), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    };
    // shared material per kind → clone per sprite to allow opacity
    this.pools = {};
    for (const kind of Object.keys(this.mats)) {
      this.pools[kind] = [];
      for (let i = 0; i < (kind === "blood" ? 60 : 40); i++) {
        this.pools[kind].push(new Particle(this.engine.scene, this.mats[kind].clone()));
      }
    }
    this.decals = [];
    this.decalMat = new THREE.MeshBasicMaterial({ color: 0x5c0a0a, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    this.decalGeo = new THREE.CircleGeometry(1, 10);
    this.maxDecals = 140;
  }

  _p(kind) {
    const pool = this.pools[kind];
    for (const p of pool) if (!p.active) return p;
    return pool[0]; // steal oldest
  }

  blood(x, y, z, amount = 8, big = false) {
    for (let i = 0; i < amount; i++) {
      const p = this._p("blood");
      p.start(
        x + rand(-0.3, 0.3), y + rand(-0.3, 0.5), z + rand(-0.3, 0.3),
        rand(-3.4, 3.4), rand(1, 5.2), rand(-3.4, 3.4),
        rand(0.35, 0.8), rand(0.14, big ? 0.34 : 0.24), 13
      );
    }
    // floor decal
    if (Math.random() < 0.6) this.decal(x, z, rand(0.5, 1.2));
  }

  gibs(x, y, z) {
    for (let i = 0; i < 14; i++) {
      const p = this._p("gib");
      p.start(x, y + 0.5, z, rand(-5, 5), rand(2, 8), rand(-5, 5), rand(0.6, 1.3), rand(0.25, 0.5), 14);
    }
    this.decal(x, z, rand(1.4, 2.2));
    AUDIO.gib();
  }

  puff(x, y, z) {
    const p = this._p("dust");
    p.start(x, y, z, rand(-0.4, 0.4), rand(0.6, 1.6), rand(-0.4, 0.4), 0.5, 0.3, 0.5);
    const s = this._p("spark");
    s.start(x, y, z, rand(-2, 2), rand(0, 2), rand(-2, 2), 0.2, 0.12, 4);
  }

  tracer(from, to) {
    // quick muzzle flash at source
    const p = this._p("flash");
    p.start(from.x, from.y + 0.9, from.z, 0, 0, 0, 0.09, 0.75, 0);
    this.pools["flash"][this.pools["flash"].indexOf(p)].sprite.material.opacity = 1;
  }

  explosion(x, y, z, r = 6) {
    // flames
    for (let i = 0; i < 16; i++) {
      const kind = i % 2 ? "fire" : "fire2";
      const p = this._p(kind);
      p.start(x + rand(-1, 1), y + rand(0, 1.5), z + rand(-1, 1),
        rand(-5, 5), rand(2, 8), rand(-5, 5), rand(0.4, 0.9), rand(0.7, 1.6), 6);
    }
    for (let i = 0; i < 8; i++) {
      const p = this._p("smoke");
      p.start(x + rand(-1.5, 1.5), y + rand(0.5, 2.4), z + rand(-1.5, 1.5),
        rand(-1.5, 1.5), rand(1.5, 4), rand(-1.5, 1.5), rand(0.7, 1.6), rand(0.8, 1.8), -1);
    }
    for (let i = 0; i < 10; i++) {
      const p = this._p("spark");
      p.start(x, y + 0.8, z, rand(-11, 11), rand(2, 10), rand(-11, 11), rand(0.25, 0.5), rand(0.15, 0.3), 12);
    }
    this.engine.flash(new THREE.Vector3(x, y + 1, z), 5, 0xff8420);
  }

  plasmaHit(x, y, z, green = false) {
    for (let i = 0; i < 6; i++) {
      const p = this._p(green ? "green" : "plasma");
      p.start(x, y, z, rand(-3, 3), rand(-1, 3), rand(-3, 3), rand(0.2, 0.45), rand(0.3, 0.55), 2);
    }
  }

  decal(x, z, scale) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x + rand(-0.4, 0.4), 0.02 + this.decals.length * 0.0001, z + rand(-0.4, 0.4));
    m.scale.set(scale, scale, 1);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.engine.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > this.maxDecals) {
      const old = this.decals.shift();
      this.engine.scene.remove(old);
    }
  }

  update(dt) {
    for (const kind of Object.keys(this.pools)) {
      for (const p of this.pools[kind]) if (p.active) p.update(dt);
    }
  }

  dispose() {
    for (const kind of Object.keys(this.pools)) {
      for (const p of this.pools[kind]) this.engine.scene.remove(p.sprite);
    }
    for (const d of this.decals) this.engine.scene.remove(d);
    this.decals = [];
  }
}
