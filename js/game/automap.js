// ============================================================
// DOOMMAPS — Automap (TAB): DOOM-style line map of the real
// geography; explored reveal, player arrow, keys & doors
// ============================================================
import { clamp } from "../config.js";

export class Automap {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.game = game;
    this.zoom = 1;          // 0.4..4 multiplier over fit-to-screen
    this.followPlayer = true;
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }
  resize() {
    this.cv.width = window.innerWidth;
    this.cv.height = window.innerHeight;
  }

  draw(dt) {
    const { ctx, cv } = this;
    const game = this.game;
    const level = game.level;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!level) return;

    // bg
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, cv.width, cv.height);

    const g = level.grid;
    const worldSize = g.n * g.cell;
    const fit = Math.min(cv.width, cv.height) / (worldSize * 1.06);
    const scale = fit * this.zoom;

    const p = game.player;
    // focus point
    const cx = this.followPlayer ? p.pos.x : 0;
    const cz = this.followPlayer ? p.pos.z : 0;
    const toMap = (wx, wz) => [
      cv.width / 2 + (wx - cx) * scale,
      cv.height / 2 + (wz - cz) * scale,
    ];

    const cellPx = g.cell * scale;
    const revealed = game.revealed;
    const revealAll = game.cheatMap || game.hasMap;

    // floor areas (revealed) — dim, so walls pop
    ctx.fillStyle = "#17171f";
    for (let iz = 0; iz < g.n; iz++) {
      const row = iz * g.n;
      for (let ix = 0; ix < g.n; ix++) {
        const i = row + ix;
        if (g.type[i] !== 0) continue;
        if (!revealAll && !revealed.has(i)) continue;
        if (g.floor[i] === 4) continue; // lava drawn later
        const [mx, my] = toMap(g.toWorldX(ix) - g.cell / 2, g.toWorldZ(iz) - g.cell / 2);
        if (mx < -cellPx || my < -cellPx || mx > cv.width || my > cv.height) continue;
        ctx.fillRect(mx, my, cellPx + 0.6, cellPx + 0.6);
      }
    }
    // lava
    ctx.fillStyle = "#5a1404";
    for (let iz = 0; iz < g.n; iz++) {
      const row = iz * g.n;
      for (let ix = 0; ix < g.n; ix++) {
        const i = row + ix;
        if (g.type[i] !== 0 || g.floor[i] !== 4) continue;
        if (!revealAll && !revealed.has(i)) continue;
        const [mx, my] = toMap(g.toWorldX(ix) - g.cell / 2, g.toWorldZ(iz) - g.cell / 2);
        ctx.fillRect(mx, my, cellPx + 0.6, cellPx + 0.6);
      }
    }

    // walls — white lines on floor/wall borders
    ctx.strokeStyle = "#d8d8e0";
    ctx.lineWidth = Math.max(1, cellPx * 0.24);
    ctx.beginPath();
    for (let iz = 0; iz < g.n; iz++) {
      const row = iz * g.n;
      for (let ix = 0; ix < g.n; ix++) {
        const i = row + ix;
        if (g.type[i] !== 1) continue;
        const wx0 = g.toWorldX(ix) - g.cell / 2, wz0 = g.toWorldZ(iz) - g.cell / 2;
        const [mx, my] = toMap(wx0, wz0);
        if (mx < -cellPx * 2 || my < -cellPx * 2 || mx > cv.width + cellPx || my > cv.height + cellPx) continue;
        // check explored neighbor
        const nb = [
          [i - 1, ix > 0], [i + 1, ix < g.n - 1], [i - g.n, iz > 0], [i + g.n, iz < g.n - 1],
        ];
        let shown = false, sides = [0, 0, 0, 0];
        for (let s = 0; s < 4; s++) {
          if (nb[s][1] && g.type[nb[s][0]] === 0 && (revealAll || revealed.has(nb[s][0]))) {
            shown = true; sides[s] = 1;
          }
        }
        if (!shown) continue;
        if (sides[0]) { ctx.moveTo(mx, my); ctx.lineTo(mx, my + cellPx); }
        if (sides[1]) { ctx.moveTo(mx + cellPx, my); ctx.lineTo(mx + cellPx, my + cellPx); }
        if (sides[2]) { ctx.moveTo(mx, my); ctx.lineTo(mx + cellPx, my); }
        if (sides[3]) { ctx.moveTo(mx, my + cellPx); ctx.lineTo(mx + cellPx, my + cellPx); }
      }
    }
    ctx.stroke();

    // doors — colored thick lines
    for (const d of level.doors) {
      const [mx, my] = toMap(d.x, d.z);
      const tx = -Math.sin(d.angle), tz = Math.cos(d.angle);
      const L = g.cell * 1.1;
      const [ax, ay] = toMap(d.x + tx * L, d.z + tz * L);
      const [bx, by] = toMap(d.x - tx * L, d.z - tz * L);
      ctx.strokeStyle = d.state === "open" ? "#3a8c3a" : ({ red: "#e02838", blue: "#2868f0", yellow: "#f0c828" })[d.key];
      ctx.lineWidth = Math.max(2, cellPx * 0.65);
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

    // keys + items when map powerup / cheat
    if (game.hasMap || game.cheatMap) {
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
    ctx.textAlign = "left";
    ctx.fillStyle = "#d8c887";
    ctx.font = "bold 15px monospace";
    ctx.fillText(game.locationName || "UNKNOWN SECTOR", 16, 26);
    ctx.font = "11px monospace";
    ctx.fillStyle = "#8a7a5a";
    ctx.fillText(`LAT ${game.lat.toFixed(5)}  LNG ${game.lng.toFixed(5)}`, 16, 42);
    if (game.level && game.level.roadNames.length) {
      ctx.fillText("SECTORS: " + game.level.roadNames.slice(0, 5).join(" · "), 16, 58);
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#8a7a5a";
    ctx.fillText(`KILLS ${game.player.kills}/${game.enemies.totalSpawned}   SECRETS ${game.player.secretsFound}/${game.level.secrets.length}`, cv.width - 16, 26);
    ctx.fillText(`TIME ${fmtTime(game.levelTime)}`, cv.width - 16, 42);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b5b3a";
    ctx.fillText("+/- ZOOM  ·  TAB CLOSE  ·  ARROW = YOU", cv.width / 2, cv.height - 14);
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
