// ============================================================
// DOOMMAPS — Automap (TAB): DOOM-style line map of the real
// geography. Cached static layer + fog-of-war erasure; only
// actors are redrawn per frame.
// ============================================================
import { clamp } from "../config.js";

const CPC = 3; // canvas px per grid cell

export class Automap {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.zoom = 1;
    this.followPlayer = true;
    this.staticCv = null;
    this.fogCv = null;
    this.fogCtx = null;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  }

  /** (Re)build the cached static layer for the current level. */
  build() {
    const g = this.game.level.grid;
    const n = g.n;
    this.staticCv = document.createElement("canvas");
    this.staticCv.width = n * CPC; this.staticCv.height = n * CPC;
    const ctx = this.staticCv.getContext("2d");
    // floors
    ctx.fillStyle = "#13131c";
    ctx.fillRect(0, 0, n * CPC, n * CPC);
    for (let iz = 0; iz < n; iz++) {
      const row = iz * n;
      for (let ix = 0; ix < n; ix++) {
        const i = row + ix;
        if (g.type[i] !== 0) continue;
        if (g.floor[i] === 4) ctx.fillStyle = "#5a1404";
        else if (g.floor[i] === 0) ctx.fillStyle = "#20202c"; // roads slightly lifted
        else ctx.fillStyle = "#17171f";
        ctx.fillRect(ix * CPC, iz * CPC, CPC, CPC);
      }
    }
    // walls: white lines along wall/floor borders
    ctx.strokeStyle = "#d8d8e0";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let iz = 0; iz < n; iz++) {
      const row = iz * n;
      for (let ix = 0; ix < n; ix++) {
        const i = row + ix;
        if (g.type[i] !== 1) continue;
        const x = ix * CPC, y = iz * CPC;
        if (ix > 0 && g.type[i - 1] === 0) { ctx.moveTo(x, y); ctx.lineTo(x, y + CPC); }
        if (ix < n - 1 && g.type[i + 1] === 0) { ctx.moveTo(x + CPC, y); ctx.lineTo(x + CPC, y + CPC); }
        if (iz > 0 && g.type[i - n] === 0) { ctx.moveTo(x, y); ctx.lineTo(x + CPC, y); }
        if (iz < n - 1 && g.type[i + n] === 0) { ctx.moveTo(x, y + CPC); ctx.lineTo(x + CPC, y + CPC); }
      }
    }
    ctx.stroke();

    // fog layer: opaque black, erased incrementally as cells are revealed
    this.fogCv = document.createElement("canvas");
    this.fogCv.width = n * CPC; this.fogCv.height = n * CPC;
    this.fogCtx = this.fogCv.getContext("2d");
    this.fogCtx.fillStyle = "#0a0a12";
    this.fogCtx.fillRect(0, 0, n * CPC, n * CPC);
    this.fogCtx.globalCompositeOperation = "destination-out";
  }

  _consumeReveals() {
    const game = this.game;
    if (!this.fogCtx || !game._revealQueue || game._revealQueue.length === 0) return;
    const g = game.level.grid;
    for (const i of game._revealQueue) {
      const ix = i % g.n, iz = (i / g.n) | 0;
      this.fogCtx.fillRect(ix * CPC - 1, iz * CPC - 1, CPC + 2, CPC + 2);
    }
    game._revealQueue.length = 0;
  }

  draw(dt) {
    const { ctx, cv } = this;
    const game = this.game;
    const level = game.level;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!level || !this.staticCv) return;

    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, cv.width, cv.height);

    this._consumeReveals();

    const g = level.grid;
    const worldSize = g.n * g.cell;
    const fit = Math.min(cv.width, cv.height) / (worldSize * 1.06);
    const scale = fit * this.zoom;
    const pxPerCell = scale * g.cell;
    const pxPerMapPx = scale * g.cell / CPC; // screen px per static-canvas px

    const p = game.player;
    const cx = this.followPlayer ? p.pos.x : 0;
    const cz = this.followPlayer ? p.pos.z : 0;
    // world → screen
    const W2S = (wx, wz) => [cv.width / 2 + (wx - cx) * scale, cv.height / 2 + (wz - cz) * scale];

    // top-left of static canvas in world coords
    const wx0 = -worldSize / 2, wz0 = -worldSize / 2;
    const [sx, sy] = W2S(wx0, wz0);
    const dstW = this.staticCv.width * pxPerMapPx;
    const dstH = this.staticCv.height * pxPerMapPx;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.staticCv, sx, sy, dstW, dstH);
    // fog unless full reveal
    if (!(game.cheatMap || game.hasMap)) {
      ctx.drawImage(this.fogCv, sx, sy, dstW, dstH);
    }

    const toMap = W2S;
    const cellPx = pxPerCell;

    // doors — colored thick lines
    for (const d of level.doors) {
      const tx = -Math.sin(d.angle), tz = Math.cos(d.angle);
      const L = g.cell * 1.1;
      const [ax, ay] = toMap(d.x + tx * L, d.z + tz * L);
      const [bx, by] = toMap(d.x - tx * L, d.z - tz * L);
      ctx.strokeStyle = d.state === "open" ? "#3a8c3a" : ({ red: "#e02838", blue: "#2868f0", yellow: "#f0c828" })[d.key];
      ctx.lineWidth = Math.max(2, cellPx * 0.5);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }

    // exit portal
    const [px, py] = toMap(level.portal.x, level.portal.z);
    ctx.fillStyle = "#ff7a14";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(5, cellPx), 0, 7);
    ctx.fill();
    ctx.fillStyle = "#ffd86a";
    ctx.font = `${Math.max(9, cellPx * 0.9)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("EXIT", px, py - Math.max(7, cellPx));

    // items when map powerup / cheat
    if (game.hasMap || game.cheatMap) {
      for (const b of game.barrels.list) {
        if (b.dead) continue;
        const [bx, by] = toMap(b.x, b.z);
        ctx.fillStyle = "#c08418";
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, 7); ctx.fill();
      }
      for (const it of game.items.list) {
        if (it.def.cat === "key") {
          const [kx, ky] = toMap(it.x, it.z);
          ctx.fillStyle = it.type.includes("red") ? "#e02838" : it.type.includes("blue") ? "#2868f0" : "#f0c828";
          ctx.beginPath(); ctx.arc(kx, ky, 4.5, 0, 7); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        } else if (it.def.cat === "weapon" || it.def.cat === "power") {
          const [kx, ky] = toMap(it.x, it.z);
          ctx.fillStyle = "#3ac85a";
          ctx.fillRect(kx - 2.5, ky - 2.5, 5, 5);
        }
      }
    }
    // enemies when cheat
    if (game.cheatMap) {
      ctx.fillStyle = "#ff3232";
      for (const e of game.enemies.list) {
        if (e.state === "dying" || e.state === "dead") continue;
        const [ex, ey] = toMap(e.pos.x, e.pos.z);
        ctx.beginPath();
        ctx.moveTo(ex, ey - 5); ctx.lineTo(ex + 4, ey + 3); ctx.lineTo(ex - 4, ey + 3);
        ctx.closePath(); ctx.fill();
      }
    }

    // player arrow
    const [pxx, pyy] = toMap(p.pos.x, p.pos.z);
    ctx.save();
    ctx.translate(pxx, pyy);
    ctx.rotate(-p.angle + Math.PI);
    ctx.fillStyle = "#e8ffe8";
    ctx.strokeStyle = "#0a0a12";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.restore();

    // ---- legend / info ----
    ctx.imageSmoothingEnabled = true;
    ctx.textAlign = "left";
    ctx.fillStyle = "#d8c887";
    ctx.font = "bold 15px monospace";
    ctx.fillText(game.locationName || "UNKNOWN SECTOR", 16, 26);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#8a7a5a";
    ctx.fillText(`LAT ${game.lat.toFixed(5)}  LNG ${game.lng.toFixed(5)}`, 16, 42);
    if (level.roadNames.length) {
      ctx.fillText("SECTORS: " + level.roadNames.slice(0, 5).join(" · "), 16, 58);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#8a7a5a";
    ctx.fillText(`KILLS ${game.player.kills}/${game.enemies.totalSpawned}   SECRETS ${game.player.secretsFound}/${game.level.secrets.length}`, cv.width - 16, 26);
    ctx.fillText(`TIME ${fmtTime(game.levelTime)}`, cv.width - 16, 42);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b5b3a";
    ctx.fillText("+/- ZOOM · F FOLLOW · TAB CLOSE", cv.width / 2, cv.height - 14);
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
