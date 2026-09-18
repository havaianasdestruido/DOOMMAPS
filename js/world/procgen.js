// ============================================================
// DOOMMAPS — Procedural fallback city (used when OSM is offline
// or the area has no data). Emits the same normalized format.
// ============================================================
import { rand, randi, choice } from "../config.js";

const STREET_NAMES = ["DOOM AVE", "HELL ST", "PHOBOS BLVD", "DEIMOS WAY", "GIB ALLEY",
  "BERSERK RD", "STROGG ST", "INFERNO LN", "PENTAGRAM PL", "SHAMBURGER ST", "RIP AND TEAR TER"];

export function generateCity(radius) {
  const roads = [], buildings = [], parks = [], waters = [], pois = [];
  const R = radius;

  // main cross streets
  roads.push({ pts: [{ x: -R, y: 0 }, { x: R, y: 0 }], width: 12, kind: "primary", name: choice(STREET_NAMES) });
  roads.push({ pts: [{ x: 0, y: -R }, { x: 0, y: R }], width: 12, kind: "primary", name: choice(STREET_NAMES) });

  // grid streets with jitter
  const step = randi(38, 52);
  const xs = [], ys = [];
  for (let x = -R + step * 0.5; x < R; x += step) xs.push(x + rand(-8, 8));
  for (let y = -R + step * 0.5; y < R; y += step) ys.push(y + rand(-8, 8));
  for (const x of xs) {
    if (Math.abs(x) < 10) continue;
    roads.push({ pts: [{ x, y: -R }, { x: x + rand(-14, 14), y: R }], width: rand(5, 9), kind: "residential", name: choice(STREET_NAMES) });
  }
  for (const y of ys) {
    if (Math.abs(y) < 10) continue;
    roads.push({ pts: [{ x: -R, y }, { x: R, y: y + rand(-14, 14) }], width: rand(5, 9), kind: "residential", name: choice(STREET_NAMES) });
  }

  // a diagonal boulevard
  roads.push({
    pts: [{ x: -R, y: -R * 0.7 }, { x: -R * 0.2, y: -R * 0.1 }, { x: R * 0.3, y: R * 0.2 }, { x: R, y: R * 0.75 }],
    width: 10, kind: "secondary", name: choice(STREET_NAMES),
  });

  // buildings between streets
  const rect = (cx, cy, w, d) => ([
    { x: cx - w / 2, y: cy - d / 2 }, { x: cx + w / 2, y: cy - d / 2 },
    { x: cx + w / 2, y: cy + d / 2 }, { x: cx - w / 2, y: cy + d / 2 },
  ]);
  for (let i = 0; i < 150; i++) {
    const cx = rand(-R + 15, R - 15), cy = rand(-R + 15, R - 15);
    // keep clear of main roads
    if (Math.abs(cx) < 12 || Math.abs(cy) < 12) continue;
    let tooClose = false;
    for (const x of xs) if (Math.abs(cx - x) < 10) { tooClose = true; break; }
    for (const y of ys) if (Math.abs(cy - y) < 10) { tooClose = true; break; }
    if (tooClose) continue;
    const w = rand(10, 26), d = rand(10, 26);
    buildings.push({
      pts: rect(cx, cy, w, d),
      name: null,
      height: Math.random() < 0.25 ? rand(12, 26) : rand(6, 12),
      keyDoor: null, tags: {},
    });
  }

  // a few landmark-ish notable buildings (used for key doors flavor)
  const notable = [
    { name: "HELL ADMINISTRATION", key: "red", x: rand(-R * 0.6, R * 0.6), y: -R * 0.55 },
    { name: "ST. SHAMBLES HOSPITAL", key: "blue", x: R * 0.5, y: rand(-R * 0.3, R * 0.3) },
    { name: "DOOM MART", key: "yellow", x: -R * 0.5, y: rand(-R * 0.3, R * 0.3) },
  ];
  for (const n of notable) {
    buildings.push({ pts: rect(n.x, n.y, 22, 18), name: n.name, height: 10, keyDoor: n.key, tags: { name: n.name } });
    pois.push({ name: n.name, x: n.x, y: n.y });
  }

  // park
  const px = rand(-R * 0.4, R * 0.4), py = rand(R * 0.4, R * 0.7);
  parks.push({ pts: rect(px, py, 46, 34) });
  // lava lake
  waters.push({ pts: rect(rand(-R * 0.5, R * 0.5), rand(-R * 0.7, -R * 0.4), 40, 26), isLine: false });

  return { roads, buildings, parks, waters, pois };
}
