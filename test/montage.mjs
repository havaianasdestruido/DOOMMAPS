// Renders all procedural art to PNG montages for visual review
import { writeFileSync, mkdirSync } from "node:fs";
import { RealCanvas, installRealCanvas } from "./raster.mjs";

installRealCanvas();
mkdirSync("test/out", { recursive: true });

const { __test } = await import("../js/game/enemies.js");
const { faceCanvas } = await import("../js/game/face.js");
const { __buildViews } = await import("../js/game/weapons.js");
const { __ICONS } = await import("../js/game/items.js");
const { genWallTexture, genFloorTexture, genLavaFrames, genHellPoster } = await import("../js/core/pixelart.js");

function montage(panels, path, scale = 3, pad = 6, cols = 0) {
  panels = panels.filter(Boolean);
  cols = cols || Math.ceil(Math.sqrt(panels.length));
  const cellW = Math.max(...panels.map(p => p.width));
  const cellH = Math.max(...panels.map(p => p.height));
  const rows = Math.ceil(panels.length / cols);
  const out = new RealCanvas(cols * (cellW + pad) + pad, rows * (cellH + pad) + pad);
  const ctx = out.getContext();
  ctx.fillStyle = "#181820";
  ctx.fillRect(0, 0, out.width, out.height);
  panels.forEach((p, i) => {
    const cx = pad + (i % cols) * (cellW + pad);
    const cy = pad + Math.floor(i / cols) * (cellH + pad);
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      const si = (y * p.width + x) * 4;
      if (p.data[si + 3] === 0) continue;
      ctx.fillStyle = `rgba(${p.data[si]},${p.data[si + 1]},${p.data[si + 2]},${p.data[si + 3] / 255})`;
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  });
  // upscale
  const big = new RealCanvas(out.width * scale, out.height * scale);
  const bctx = big.getContext();
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(out, 0, 0, big.width, big.height);
  writeFileSync(path, big.toBuffer());
  console.log("wrote", path);
}

// Enemies: 4 key poses each
const types = ["shambler", "hellhound", "bruiser", "wraith", "gunner", "reaper", "warlord", "archdevil", "hellweaver"];
montage(types.flatMap(t => [
  __test.drawEnemy(t, {}),
  __test.drawEnemy(t, { leg: 0.8, mouth: true }),
  __test.drawEnemy(t, { armUp: 1, mouth: true, muzzle: true }),
  __test.drawEnemy(t, { death: 3 }),
]), "test/out/enemies.png", 2, 6, 4);

// Face: expr × blood
const exprs = ["normal", "pain", "grin", "rage", "glow", "dead"];
const faces = [];
for (const b of [0, 1, 2, 3, 4]) for (const e of exprs) faces.push(faceCanvas({ look: b === 1 ? 1 : 0, blink: false, blood: b, expr: e }, 1));
// hardcode scale=1 canvases are 46x52 * s
montage(faces, "test/out/faces.png", 3, 3, 6);

// Weapons
const views = __buildViews();
montage(Object.entries(views).filter(([k]) => k !== "_built").flatMap(([k, arr]) => arr.slice(0, 2)), "test/out/weapons.png", 2, 6, 4);

// Items
montage(Object.keys(__ICONS).map(k => __ICONS[k]()), "test/out/items.png", 4, 4, 6);

// Textures
montage(["stone", "brick", "tech", "hellrock", "guts"].map(t => genWallTexture(t)), "test/out/walls.png", 3, 6, 5);
montage(["road", "tiles", "blood", "park"].map(t => genFloorTexture(t)).concat(genLavaFrames()), "test/out/floors.png", 3, 6, 4);
montage([genHellPoster(["YOU ARE", "IN HELL"]), genHellPoster(["MEMORIES", "OF EARTH"], 1)], "test/out/posters.png", 3, 6, 2);
console.log("DONE");
