// ============================================================
// DOOMMAPS — Level builder: geography → DOOM level.
// Rasterizes roads/buildings/parks/water onto a grid, bakes
// chunked geometry with sector lighting, synthesizes the hell
// fortress (exit), key doors, items, and enemy spawns.
// ============================================================
import * as THREE from "three";
import { PAL, DOOM, clamp, rand, randi, choice } from "../config.js";
import { genWallTexture, genFloorTexture, genLavaFrames, genHellPoster, tex } from "../core/pixelart.js";
import { API } from "../config.js";

const T_FLOOR = 0, T_WALL = 1;
const F_ROAD = 0, F_TILES = 1, F_BLOOD = 2, F_PARK = 3, F_LAVA = 4;

const WALL_TEX_IDS = { stone: 0, brick: 1, tech: 2, hellrock: 3, guts: 4 };
const WALL_TEX_NAMES = ["stone", "brick", "tech", "hellrock", "guts"];

const KEY_COLORS = { red: 0xff2233, blue: 0x2266ff, yellow: 0xffcc33 };

// ---------------- helpers ----------------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

class Grid {
  constructor(n, cell) {
    this.n = n; this.cell = cell;
    this.type = new Uint8Array(n * n).fill(T_FLOOR);
    this.floor = new Uint8Array(n * n);       // floor type
    this.wallTex = new Uint8Array(n * n);     // wall texture id
    this.light = new Float32Array(n * n).fill(0.8);
    this.wallH = new Float32Array(n * n);
    this.doorAt = new Map();                  // idx → door obj
    this.interior = new Uint8Array(n * n);    // fortress/chamber interior flag
  }
  idx(ix, iz) { return iz * this.n + ix; }
  inB(ix, iz) { return ix >= 0 && iz >= 0 && ix < this.n && iz < this.n; }
  // world → cell
  toCellX(x) { return Math.floor(x / this.cell + this.n / 2); }
  toCellZ(z) { return Math.floor(z / this.cell + this.n / 2); }
  // cell → world center
  toWorldX(ix) { return (ix - this.n / 2) * this.cell + this.cell / 2; }
  toWorldZ(iz) { return (iz - this.n / 2) * this.cell + this.cell / 2; }
}

// point-in-polygon scanline fill
function fillPolygon(grid, pts, cb) {
  if (pts.length < 3) return;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
  }
  const c = grid.cell;
  const ix0 = clamp(grid.toCellX(minX) - 1, 0, grid.n - 1), ix1 = clamp(grid.toCellX(maxX) + 1, 0, grid.n - 1);
  const iz0 = clamp(grid.toCellZ(minZ) - 1, 0, grid.n - 1), iz1 = clamp(grid.toCellZ(maxZ) + 1, 0, grid.n - 1);
  for (let iz = iz0; iz <= iz1; iz++) {
    const z = grid.toWorldZ(iz);
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = grid.toWorldX(ix);
      if (pointInPoly(x, z, pts)) cb(grid.idx(ix, iz), ix, iz);
    }
  }
}
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, zi = pts[i].y, xj = pts[j].x, zj = pts[j].y;
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) inside = !inside;
  }
  return inside;
}

// stamp a disc of floor (for roads)
function stampDisc(grid, x, z, r, type) {
  const c = grid.cell;
  const ix0 = clamp(grid.toCellX(x - r) - 1, 0, grid.n - 1), ix1 = clamp(grid.toCellX(x + r) + 1, 0, grid.n - 1);
  const iz0 = clamp(grid.toCellZ(z - r) - 1, 0, grid.n - 1), iz1 = clamp(grid.toCellZ(z + r) + 1, 0, grid.n - 1);
  for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
    const dx = grid.toWorldX(ix) - x, dz = grid.toWorldZ(iz) - z;
    if (dx * dx + dz * dz <= r * r + c * c * 0.6) {
      const i = grid.idx(ix, iz);
      grid.type[i] = T_FLOOR; grid.floor[i] = type; grid.interior[i] = 0;
    }
  }
}
function stampPolyline(grid, pts, halfW, type) {
  const step = grid.cell * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const dx = b.x - a.x, dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s <= n; s++) {
      stampDisc(grid, a.x + dx * (s / n), a.y + dz * (s / n), halfW, type);
    }
  }
}

function bfsDistances(grid, startIdx, lavaOK = false) {
  const dist = new Int32Array(grid.n * grid.n).fill(-1);
  const q = [startIdx];
  dist[startIdx] = 0;
  let head = 0;
  while (head < q.length) {
    const cur = q[head++];
    const cx = cur % grid.n, cz = (cur / grid.n) | 0;
    const d = dist[cur];
    const push = (ix, iz) => {
      if (!grid.inB(ix, iz)) return;
      const i = grid.idx(ix, iz);
      if (dist[i] !== -1) return;
      if (grid.type[i] !== T_FLOOR) return;
      if (!lavaOK && grid.floor[i] === F_LAVA) return;
      dist[i] = d + 1;
      q.push(i);
    };
    push(cx + 1, cz); push(cx - 1, cz); push(cx, cz + 1); push(cx, cz - 1);
  }
  return dist;
}

// ============================================================
// MAIN BUILDER
// ============================================================
export function buildLevel(osm, opts) {
  const radius = opts.radius;
  const cell = DOOM.CELL;
  const n = Math.ceil((radius * 2) / cell) + 4;
  const grid = new Grid(n, cell);
  const updaters = [];
  const group = new THREE.Group();

  // ---------- 1. rasterize ----------
  // base ground: blood earth (open hellscape guarantees connectivity)
  for (let i = 0; i < n * n; i++) {
    grid.floor[i] = F_BLOOD;
    grid.light[i] = 0.62 + rand(-0.1, 0.12);
  }
  // parks
  for (const p of osm.parks) fillPolygon(grid, p.pts, (i) => {
    grid.type[i] = T_FLOOR; grid.floor[i] = F_PARK; grid.light[i] = 0.5 + rand(-0.08, 0.1);
  });
  // water → lava (or lava channels for waterways)
  for (const w of osm.waters) {
    if (w.isLine) stampPolyline(grid, w.pts, 3.4, F_LAVA);
    else fillPolygon(grid, w.pts, (i) => { grid.type[i] = T_FLOOR; grid.floor[i] = F_LAVA; grid.light[i] = 1.0; });
  }
  // roads
  for (const r of osm.roads) {
    const half = Math.max(2, (r.width || 6) / 2);
    stampPolyline(grid, r.pts, half, r.kind === "pedestrian" || r.kind === "footway" ? F_TILES : F_ROAD);
  }
  // buildings → walls
  const buildingNames = [];
  for (let bi = 0; bi < osm.buildings.length; bi++) {
    const b = osm.buildings[bi];
    const seed = hashStr((b.name || "") + ":" + bi);
    let texName = "brick";
    const t = b.tags || {};
    if (b.keyDoor) texName = "tech";
    else if (t.amenity === "place_of_worship" || t.historic) texName = "stone";
    else if (seed % 100 < 12) texName = "guts";
    else if (seed % 100 < 30) texName = "hellrock";
    else if (seed % 100 < 52) texName = "tech";
    else texName = (seed % 2) ? "brick" : "stone";
    const h = b.height > 3 ? Math.min(b.height, 60) : DOOM.WALL_H * (0.75 + ((seed % 5) * 0.13));
    fillPolygon(grid, b.pts, (i) => {
      grid.type[i] = T_WALL; grid.wallH[i] = h; grid.wallTex[i] = WALL_TEX_IDS[texName];
    });
    if (b.name) {
      const c = centroid(b.pts);
      buildingNames.push({ name: b.name, x: c.x, z: c.y, keyDoor: b.keyDoor });
    }
  }

  // ---------- 2. hell fortress (exit arena) ----------
  const doorList = [];
  const itemSpawns = [];
  const enemySpawns = [];
  const secrets = [];

  const fortress = carveFortress(grid, doorList, "red");

  // ---------- 3. chambers (blue / yellow) ----------
  const chamberBlue = carveChamber(grid, doorList, "blue", [{ x: 0, y: 0 }, { x: fortress.x, y: fortress.z }], fortress.r + 26);
  const chamberYellow = carveChamber(grid, doorList, "yellow", [{ x: 0, y: 0 }, { x: fortress.x, y: fortress.z }, { x: chamberBlue.x, y: chamberBlue.z }], 30);

  // ---------- 4. border cliffs ----------
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    if (ix < 2 || iz < 2 || ix >= n - 2 || iz >= n - 2) {
      const i = grid.idx(ix, iz);
      grid.type[i] = T_WALL; grid.wallH[i] = 26; grid.wallTex[i] = WALL_TEX_IDS.hellrock;
    }
  }

  // ---------- 5. spawn + BFS for placement ----------
  // player start: a road-ish floor cell far from fortress
  const spawn = pickSpawn(grid, fortress);
  const dists = bfsDistances(grid, grid.idx(grid.toCellX(spawn.x), grid.toCellZ(spawn.z)));

  const farthest = (excludeR, ex, ez) => {
    let best = -1, bestIdx = -1;
    for (let i = 0; i < n * n; i++) {
      if (dists[i] < 0) continue;
      const ix = i % n, iz = (i / n) | 0;
      const wx = grid.toWorldX(ix), wz = grid.toWorldZ(iz);
      const dF = Math.hypot(wx - fortress.x, wz - fortress.z);
      const dE = Math.hypot(wx - ex, wz - ez);
      if (dF < excludeR || dE < 30) continue;
      if (dists[i] > best) { best = dists[i]; bestIdx = i; }
    }
    if (bestIdx < 0) return null;
    return { x: grid.toWorldX(bestIdx % n), z: grid.toWorldZ((bestIdx / n) | 0), d: best };
  };

  const redKeyPos = farthest(60, spawn.x, spawn.z) || { x: spawn.x + 40, z: spawn.z };
  const blueKeyPos = farthest(0, redKeyPos.x, redKeyPos.z) || { x: spawn.x - 40, z: spawn.z };
  const yellowKeyPos = farthest(0, blueKeyPos.x, blueKeyPos.z) || { x: spawn.x, z: spawn.z + 40 };

  itemSpawns.push({ type: "key_red", x: redKeyPos.x, z: redKeyPos.z });
  itemSpawns.push({ type: "medikit", x: redKeyPos.x + cell, z: redKeyPos.z });
  if (chamberBlue) itemSpawns.push({ type: "key_blue", x: blueKeyPos.x, z: blueKeyPos.z });
  if (chamberYellow) itemSpawns.push({ type: "key_yellow", x: yellowKeyPos.x, z: yellowKeyPos.z });

  // fortress interior loot + boss
  const fi = fortress;
  itemSpawns.push(
    { type: "medikit", x: fi.x + 6, z: fi.z + 4 },
    { type: "rockets", x: fi.x - 6, z: fi.z + 4 },
    { type: "cells", x: fi.x, z: fi.z + 8 },
    { type: "armor2", x: fi.x, z: fi.z - 8 },
  );
  enemySpawns.push({ type: "archdevil", x: fi.x, z: fi.z - 6, interior: true });
  enemySpawns.push({ type: "warlord", x: fi.x + 8, z: fi.z + 8, interior: true });
  enemySpawns.push({ type: "warlord", x: fi.x - 8, z: fi.z + 8, interior: true });
  enemySpawns.push({ type: "reaper", x: fi.x + 10, z: fi.z - 8, interior: true });

  if (chamberBlue) {
    itemSpawns.push(
      { type: "soulsphere", x: chamberBlue.x, z: chamberBlue.z },
      { type: "armor2", x: chamberBlue.x + 3, z: chamberBlue.z + 2 },
    );
    enemySpawns.push({ type: "reaper", x: chamberBlue.x - 3, z: chamberBlue.z, interior: true });
    enemySpawns.push({ type: "bruiser", x: chamberBlue.x + 3, z: chamberBlue.z - 2, interior: true });
  }
  if (chamberYellow) {
    itemSpawns.push(
      { type: "supershotgun", x: chamberYellow.x, z: chamberYellow.z },
      { type: "shellbox", x: chamberYellow.x + 3, z: chamberYellow.z + 2 },
    );
    enemySpawns.push({ type: "bruiser", x: chamberYellow.x - 3, z: chamberYellow.z, interior: true });
    enemySpawns.push({ type: "gunner", x: chamberYellow.x + 3, z: chamberYellow.z - 2, interior: true });
  }

  // ---------- 6. scatter world items ----------
  const floorCells = [];
  for (let i = 0; i < n * n; i++) {
    if (grid.type[i] !== T_FLOOR || grid.floor[i] === F_LAVA || grid.interior[i]) continue;
    if (dists[i] < 0) continue;
    floorCells.push(i);
  }
  const randFloorFar = (minD) => {
    for (let tries = 0; tries < 60; tries++) {
      const i = choice(floorCells);
      if (!i) continue;
      const wx = grid.toWorldX(i % n), wz = grid.toWorldZ((i / n) | 0);
      if (Math.hypot(wx - spawn.x, wz - spawn.z) < minD) continue;
      return { x: wx, z: wz };
    }
    return null;
  };
  const scatter = (type, count, minD = 20) => {
    for (let k = 0; k < count; k++) {
      const p = randFloorFar(minD);
      if (p) itemSpawns.push({ type, ...p });
    }
  };
  scatter("stimpack", 14, 12);
  scatter("medikit", 7, 30);
  scatter("healthbonus", 16, 8);
  scatter("armorbonus", 12, 8);
  scatter("bullets", 8); scatter("bulletbox", 4, 25);
  scatter("shells", 8, 22); scatter("shellbox", 4, 35);
  scatter("rockets", 5, 45); scatter("cells", 5, 45);
  scatter("armor1", 2, 60);
  scatter("shotgun", 1, 25);
  scatter("chaingun", 1, 60);
  scatter("rocketlauncher", 1, 80);
  scatter("plasma", 1, 100);
  scatter("berserk", 1, 70);
  scatter("invuln", 1, 90);
  scatter("radsuit", 2, 40);
  // secrets: carve 1-cell alcoves with good loot
  for (let s = 0; s < 3; s++) {
    const p = randFloorFar(60);
    if (!p) continue;
    itemSpawns.push({ type: "soulsphere", x: p.x, z: p.z, secret: true });
    secrets.push(p);
  }

  // ---------- 6b. exploding barrels (DOOM tradition) ----------
  const barrelSpawns = [];
  {
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 34; tries++) {
      const i = choice(floorCells);
      if (i === undefined) break;
      const wx = grid.toWorldX(i % n), wz = grid.toWorldZ((i / n) | 0);
      if (Math.hypot(wx - spawn.x, wz - spawn.z) < 22) continue;
      if (Math.hypot(wx - fortress.x, wz - fortress.z) < fortress.r + 8) continue;
      if (barrelSpawns.some(b => Math.hypot(b.x - wx, b.z - wz) < 9)) continue;
      // clusters of 1-3
      const cluster = Math.random() < 0.4 ? 3 : Math.random() < 0.5 ? 2 : 1;
      for (let c = 0; c < cluster && placed < 34; c++) {
        const ox = wx + rand(-3, 3), oz = wz + rand(-3, 3);
        const ci = grid.idx(grid.toCellX(ox), grid.toCellZ(oz));
        if (!grid.inB(grid.toCellX(ox), grid.toCellZ(oz))) continue;
        if (grid.type[ci] !== T_FLOOR || grid.floor[ci] === F_LAVA) continue;
        barrelSpawns.push({ x: ox, z: oz });
        placed++;
      }
    }
  }

  // ---------- 7. enemy scatter ----------
  const dens = opts.density || 2;
  const quota = Math.floor(floorCells.length * 0.0016 * dens) + 20;
  const tierRoll = () => {
    const r = Math.random();
    if (r < 0.32) return "shambler";
    if (r < 0.52) return "hellhound";
    if (r < 0.64) return "gunner";
    if (r < 0.78) return "bruiser";
    if (r < 0.86) return "wraith";
    if (r < 0.94) return "reaper";
    return "warlord";
  };
  for (let k = 0; k < quota; k++) {
    const p = randFloorFar(34);
    if (p) enemySpawns.push({ type: tierRoll(), x: p.x, z: p.z });
  }

  // ---------- 8. geometry ----------
  const bakeResult = bakeGeometry(grid, group, updaters, radius);

  // lava animation
  const lavaFrames = genLavaFrames();
  const lavaTex = new THREE.CanvasTexture(lavaFrames[0]);
  lavaTex.magFilter = THREE.NearestFilter; lavaTex.minFilter = THREE.NearestFilter;
  lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
  lavaTex.colorSpace = THREE.SRGBColorSpace;
  bakeResult.lavaMats.forEach(m => { m.map = lavaTex; m.needsUpdate = true; });
  let lavaF = 0, lavaT = 0;
  updaters.push((dt) => {
    lavaT += dt;
    if (lavaT > 0.26) {
      lavaT = 0; lavaF = (lavaF + 1) % 4;
      lavaTex.image = lavaFrames[lavaF];
      lavaTex.needsUpdate = true;
    }
  });

  // ---------- 9. doors ----------
  for (const door of doorList) buildDoorMesh(grid, group, updaters, door);

  // ---------- 10. portal ----------
  const portal = buildPortal(group, updaters, fortress);

  // ---------- 11. posters & POI signs ----------
  const posterSpots = bakeResult.posterSpots.slice(0, 7);
  if (opts.lat && opts.lng && opts.realTextures !== false) {
    posterSpots.forEach((spot, i) => {
      addPoster(group, updaters, spot, API.STREETVIEW(opts.lat, opts.lng, "480x240", 100, i * 90), i);
    });
  } else {
    posterSpots.forEach((spot, i) => addPoster(group, updaters, spot, null, i));
  }
  for (const b of buildingNames.slice(0, 14)) addPoiSign(group, b);

  // ---------- 12. torches along roads ----------
  addTorches(grid, group, updaters, floorCells);

  const solidCellAt = (wx, wz) => {
    const ix = grid.toCellX(wx), iz = grid.toCellZ(wz);
    if (!grid.inB(ix, iz)) return true;
    const i = grid.idx(ix, iz);
    if (grid.type[i] === T_WALL) return true;
    const d = grid.doorAt.get(i);
    return !!(d && d.state !== "open");
  };

  const roadNames = [...new Set(osm.roads.map(r => r.name).filter(Boolean))].slice(0, 8);

  return {
    grid, group, updaters, spawn, fortress, portal,
    doors: doorList, items: itemSpawns, enemySpawns, secrets, barrels: barrelSpawns,
    posterSpots, buildingNames, roads: osm.roads, roadNames,
    n, cell, radius,

    isSolid: solidCellAt,

    floorAtSafe(wx, wz) {
      const ix = grid.toCellX(wx), iz = grid.toCellZ(wz);
      if (!grid.inB(ix, iz)) return { damage: 0, lava: false, type: F_BLOOD };
      const i = grid.idx(ix, iz);
      const lava = grid.type[i] === T_FLOOR && grid.floor[i] === F_LAVA;
      return { damage: lava ? 10 : 0, lava, type: grid.floor[i] };
    },

    /** line of sight between two points (DDA) */
    los(x0, z0, x1, z1) {
      const dx = x1 - x0, dz = z1 - z0;
      const dist = Math.hypot(dx, dz);
      const steps = Math.ceil(dist / (grid.cell * 0.45)) + 1;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        if (solidCellAt(x0 + dx * t, z0 + dz * t)) return false;
      }
      return true;
    },

    /** raycast against walls, returns {dist, x, z} or null */
    raycastWall(x, z, dx, dz, maxDist) {
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const step = grid.cell * 0.4;
      for (let d = step; d < maxDist; d += step) {
        const px = x + dx * d, pz = z + dz * d;
        if (solidCellAt(px, pz)) {
          return { dist: d, x: px, z: pz };
        }
      }
      return null;
    },

    isSolid(wx, wz) {
      const ix = grid.toCellX(wx), iz = grid.toCellZ(wz);
      if (!grid.inB(ix, iz)) return true;
      const i = grid.idx(ix, iz);
      if (grid.type[i] === T_WALL) return true;
      const d = grid.doorAt.get(i);
      if (d && d.state !== "open") return true;
      return false;
    },
    floorAt(wx, wz) {
      const ix = grid.toCellX(wx), iz = grid.toCellZ(wz);
      if (!grid.inB(ix, iz)) return { damage: 0, lava: false, type: F_BLOOD };
      const i = grid.idx(ix, iz);
      const lava = grid.type[i] === T_FLOOR && grid.floor[i] === F_LAVA;
      return { damage: lava ? 10 : 0, lava, type: grid.floor[i] };
    },
    doorNear(wx, wz, range) {
      const ix = grid.toCellX(wx), iz = grid.toCellZ(wz);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const iix = ix + dx, iiz = iz + dz;
        if (iix < 0 || iiz < 0 || iix >= grid.n || iiz >= grid.n) continue;
        const d = grid.doorAt.get(grid.idx(iix, iiz));
        if (d) {
          const ddx = d.x - wx, ddz = d.z - wz;
          if (Math.hypot(ddx, ddz) <= range + grid.cell) return d;
        }
      }
      return null;
    },
  };
}

// ---------------- fortress / chambers ----------------
function findOpenSpot(grid, r, avoidPts = [], minDist = 0) {
  const n = grid.n;
  for (let tries = 0; tries < 400; tries++) {
    const ix = randi(Math.ceil(r / grid.cell) + 3, n - Math.ceil(r / grid.cell) - 4);
    const iz = randi(Math.ceil(r / grid.cell) + 3, n - Math.ceil(r / grid.cell) - 4);
    const wx = grid.toWorldX(ix), wz = grid.toWorldZ(iz);
    let ok = true;
    for (const p of avoidPts) {
      if (Math.hypot(wx - p.x, wz - p.y) < minDist) { ok = false; break; }
    }
    if (!ok) continue;
    // want ≥55% open ground in circle
    let open = 0, tot = 0;
    for (let dz = -r; dz <= r; dz += grid.cell) for (let dx = -r; dx <= r; dx += grid.cell) {
      if (dx * dx + dz * dz > r * r) continue;
      tot++;
      const i = grid.idx(grid.toCellX(wx + dx), grid.toCellZ(wz + dz));
      if (i >= 0 && grid.type[i] === T_FLOOR && grid.floor[i] !== F_LAVA) open++;
    }
    if (open / Math.max(1, tot) >= 0.55) return { x: wx, z: wz };
  }
  // fallback: map center
  return { x: 0, z: 0 };
}

function carveFortress(grid, doorList, key) {
  const r = 30;
  const c = findOpenSpot(grid, r);
  const inner = r - 7, outerR = r - 1;
  for (let dz = -outerR; dz <= outerR; dz += 1) {
    for (let dx = -outerR; dx <= outerR; dx += 1) {
      const d = Math.hypot(dx, dz);
      if (d > outerR) continue;
      const ix = grid.toCellX(c.x + dx), iz = grid.toCellZ(c.z + dz);
      if (!grid.inB(ix, iz)) continue;
      const i = grid.idx(ix, iz);
      if (d <= inner) {
        grid.type[i] = T_FLOOR; grid.floor[i] = F_TILES; grid.light[i] = 0.5;
        grid.interior[i] = 1;
      } else {
        grid.type[i] = T_WALL; grid.wallH[i] = 11; grid.wallTex[i] = WALL_TEX_IDS.hellrock;
      }
    }
  }
  // doorway: direction of biggest open ground beyond ring
  let bestAng = 0, bestScore = -1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
    const px = c.x + Math.cos(a) * (outerR + 14), pz = c.z + Math.sin(a) * (outerR + 14);
    let score = 0;
    for (let dz = -8; dz <= 8; dz += grid.cell / 2) for (let dx = -8; dx <= 8; dx += grid.cell / 2) {
      const i = grid.idx(grid.toCellX(px + dx), grid.toCellZ(pz + dz));
      if (i >= 0 && i < grid.n * grid.n && grid.type[i] === T_FLOOR && grid.floor[i] !== F_LAVA) score++;
    }
    if (score > bestScore) { bestScore = score; bestAng = a; }
  }
  // carve gap (2 cells wide along doorway tangent)
  const gapCells = [];
  const nx = Math.cos(bestAng), nz = Math.sin(bestAng);
  const tx = -nz, tz = nx;
  for (let along = -grid.cell * 0.9; along <= grid.cell * 0.9; along += grid.cell * 0.45) {
    for (let d = inner - grid.cell; d <= outerR + grid.cell; d += grid.cell * 0.5) {
      const ix = grid.toCellX(c.x + nx * d + tx * along);
      const iz = grid.toCellZ(c.z + nz * d + tz * along);
      if (!grid.inB(ix, iz)) continue;
      const i = grid.idx(ix, iz);
      grid.type[i] = T_FLOOR; grid.floor[i] = F_TILES; grid.light[i] = 0.6; grid.interior[i] = 0;
      gapCells.push(i);
    }
  }
  // door at mid-gap
  const doorX = c.x + nx * (inner + 2), doorZ = c.z + nz * (inner + 2);
  const door = { key, x: doorX, z: doorZ, angle: bestAng, state: "closed", openFrac: 0, cells: gapCells };
  for (const i of gapCells) grid.doorAt.set(i, door);
  doorList.push(door);
  return { x: c.x, z: c.z, doorAng: bestAng, r };
}

function carveChamber(grid, doorList, key, avoidPts = [], minDist = 30) {
  const r = 13;
  const c = findOpenSpot(grid, r, avoidPts, minDist);
  const inner = r - 5, outerR = r - 1;
  for (let dz = -outerR; dz <= outerR; dz += 1) {
    for (let dx = -outerR; dx <= outerR; dx += 1) {
      const d = Math.hypot(dx, dz);
      if (d > outerR) continue;
      const ix = grid.toCellX(c.x + dx), iz = grid.toCellZ(c.z + dz);
      if (!grid.inB(ix, iz)) continue;
      const i = grid.idx(ix, iz);
      if (d <= inner) {
        if (grid.type[i] !== T_WALL) { grid.floor[i] = F_TILES; }
        grid.type[i] = T_FLOOR; grid.light[i] = 0.42; grid.interior[i] = 1;
      } else {
        grid.type[i] = T_WALL; grid.wallH[i] = 9; grid.wallTex[i] = WALL_TEX_IDS.tech;
      }
    }
  }
  let bestAng = 0, bestScore = -1;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
    const px = c.x + Math.cos(a) * (outerR + 10), pz = c.z + Math.sin(a) * (outerR + 10);
    let score = 0;
    const i = grid.idx(grid.toCellX(px), grid.toCellZ(pz));
    if (i >= 0 && grid.type[i] === T_FLOOR) score = 10;
    score -= Math.hypot(px, pz) * 0.001; // prefer outward-ish
    if (score > bestScore) { bestScore = score; bestAng = a; }
  }
  const nx = Math.cos(bestAng), nz = Math.sin(bestAng);
  const gapCells = [];
  for (let along = -grid.cell * 0.45; along <= grid.cell * 0.45; along += grid.cell * 0.45) {
    for (let d = inner - grid.cell; d <= outerR + grid.cell; d += grid.cell * 0.5) {
      const ix = grid.toCellX(c.x + nx * d - nz * along);
      const iz = grid.toCellZ(c.z + nz * d + nx * along);
      if (!grid.inB(ix, iz)) continue;
      const i = grid.idx(ix, iz);
      grid.type[i] = T_FLOOR; grid.floor[i] = F_TILES; grid.light[i] = 0.5; grid.interior[i] = 0;
      gapCells.push(i);
    }
  }
  const door = { key, x: c.x + nx * (inner + 1.4), z: c.z + nz * (inner + 1.4), angle: bestAng, state: "closed", openFrac: 0, cells: gapCells };
  for (const i of gapCells) grid.doorAt.set(i, door);
  doorList.push(door);
  return { x: c.x, z: c.z, r };
}

// ---------------- spawn ----------------
function pickSpawn(grid, fortress) {
  const n = grid.n;
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 500; tries++) {
    const ix = randi(3, n - 4), iz = randi(3, n - 4);
    const i = grid.idx(ix, iz);
    if (grid.type[i] !== T_FLOOR || grid.floor[i] === F_LAVA || grid.interior[i]) continue;
    const wx = grid.toWorldX(ix), wz = grid.toWorldZ(iz);
    const dF = Math.hypot(wx - fortress.x, wz - fortress.z);
    if (dF < fortress.r + 40) continue;
    // prefer roads
    const onRoad = grid.floor[i] === F_ROAD ? 20 : 0;
    const score = dF + onRoad + rand(0, 30);
    if (score > bestScore) { bestScore = score; best = { x: wx, z: wz }; }
  }
  if (!best) best = { x: 0, z: 0 };
  best.angle = Math.atan2(fortress.z - best.z, fortress.x - best.x) + Math.PI;
  return best;
}

// ---------------- geometry baking ----------------
function bakeGeometry(grid, group, updaters, radius) {
  const n = grid.n, cell = grid.cell;
  const chunksPerSide = Math.ceil(n / DOOM.CHUNK);

  const wallMats = WALL_TEX_NAMES.map(name => {
    const t = tex(genWallTexture(name));
    return new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
  });
  const floorMats = {};
  for (const [name, ft] of [["road", F_ROAD], ["tiles", F_TILES], ["blood", F_BLOOD], ["park", F_PARK]]) {
    const t = tex(genFloorTexture(name));
    floorMats[ft] = new THREE.MeshLambertMaterial({ map: t, vertexColors: true });
  }
  const lavaMats = [new THREE.MeshBasicMaterial({ color: 0xffffff })];

  const posterSpots = [];

  for (let ciz = 0; ciz < chunksPerSide; ciz++) {
    for (let cix = 0; cix < chunksPerSide; cix++) {
      const wallGeo = new Map();  // texId → arrays
      const floorGeo = new Map(); // floorType → arrays

      const getArr = (map, k) => {
        if (!map.has(k)) map.set(k, { pos: [], nrm: [], uv: [], col: [], idx: [], vc: 0 });
        return map.get(k);
      };

      const x0 = cix * DOOM.CHUNK, x1 = Math.min(n, x0 + DOOM.CHUNK);
      const z0 = ciz * DOOM.CHUNK, z1 = Math.min(n, z0 + DOOM.CHUNK);

      for (let iz = z0; iz < z1; iz++) {
        for (let ix = x0; ix < x1; ix++) {
          const i = grid.idx(ix, iz);
          const wx = grid.toWorldX(ix), wz = grid.toWorldZ(iz);
          const isDoor = grid.doorAt.has(i);

          if (grid.type[i] === T_FLOOR) {
            // floor quad
            const ft = grid.floor[i];
            const arr = getArr(floorGeo, ft);
            const l = clamp(grid.light[i], 0.2, 1);
            const half = cell / 2;
            const base = arr.vc;
            const u0 = (wx - half) / cell, u1 = (wx + half) / cell;
            const v0 = (wz - half) / cell, v1 = (wz + half) / cell;
            arr.pos.push(
              wx - half, 0, wz - half, wx + half, 0, wz - half,
              wx + half, 0, wz + half, wx - half, 0, wz + half);
            for (let k = 0; k < 4; k++) { arr.nrm.push(0, 1, 0); arr.col.push(l, l, l); }
            arr.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
            arr.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
            arr.vc += 4;
          } else {
            // wall: add faces toward floor neighbors
            const h = grid.wallH[i] || DOOM.WALL_H;
            const texId = grid.wallTex[i];
            const half = cell / 2;
            const dirs = [
              [1, 0, wx + half, wz, 1], [-1, 0, wx - half, wz, -1],
              [0, 1, wx, wz + half, 1], [0, -1, wx, wz - half, -1],
            ];
            for (let d = 0; d < 4; d++) {
              const [dx, dz, fx, fz, sign] = dirs[d];
              const nix = ix + dx, niz = iz + dz;
              let openTo = false;
              if (!grid.inB(nix, niz)) openTo = false;
              else {
                const ni = grid.idx(nix, niz);
                openTo = grid.type[ni] === T_FLOOR && !grid.doorAt.has(ni);
              }
              if (!openTo) continue;
              const ni = grid.inB(nix, niz) ? grid.idx(nix, niz) : i;
              const l = clamp((grid.light[ni] || 0.7) * 0.95, 0.18, 1);
              const arr = getArr(wallGeo, texId);
              const base = arr.vc;
              const vh = h / cell;
              if (dx !== 0) {
                arr.pos.push(
                  fx, 0, wz - half, fx, 0, wz + half,
                  fx, h, wz + half, fx, h, wz - half);
                for (let k = 0; k < 4; k++) arr.nrm.push(-dx, 0, 0);
                arr.uv.push(0, 0, 1, 0, 1, vh, 0, vh);
                if (dx > 0) arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
                else arr.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
              } else {
                arr.pos.push(
                  wx - half, 0, fz, wx + half, 0, fz,
                  wx + half, h, fz, wx - half, h, fz);
                for (let k = 0; k < 4; k++) arr.nrm.push(0, 0, -dz);
                arr.uv.push(0, 0, 1, 0, 1, vh, 0, vh);
                if (dz > 0) arr.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
                else arr.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
              }
              const tint = 0.92 + ((i % 7) * 0.02);
              for (let k = 0; k < 4; k++) arr.col.push(l * tint, l, l * (0.92 + ((i % 5) * 0.02)));
              arr.vc += 4;

              // poster candidate: wall face next to road at head height
              if (grid.floor[ni] === F_ROAD && h >= 6 && Math.random() < 0.10) {
                posterSpots.push({ x: fx + dx * 0.06, y: 2.4, z: fz + dz * 0.06, nx: -dx, nz: -dz });
              }
            }
          }
        }
      }

      const buildMeshes = (geoMap, mats) => {
        geoMap.forEach((arr, k) => {
          if (arr.vc === 0) return;
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(arr.pos, 3));
          g.setAttribute("normal", new THREE.Float32BufferAttribute(arr.nrm, 3));
          g.setAttribute("uv", new THREE.Float32BufferAttribute(arr.uv, 2));
          g.setAttribute("color", new THREE.Float32BufferAttribute(arr.col, 3));
          g.setIndex(arr.idx);
          const mesh = new THREE.Mesh(g, mats[k]);
          mesh.matrixAutoUpdate = false;
          group.add(mesh);
        });
      };
      buildMeshes(wallGeo, wallMats);
      buildMeshes(floorGeo, { ...floorMats, [F_LAVA]: lavaMats[0] });
    }
  }

  return { posterSpots, lavaMats };
}

// ---------------- doors ----------------
function buildDoorMesh(grid, group, updaters, door) {
  const colorHex = KEY_COLORS[door.key] || 0x888888;
  const w = grid.cell * 1.9, h = 7.6, d = 1.6;
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshLambertMaterial({ color: 0x2c2126 });
  const mesh = new THREE.Mesh(geo, mat);
  const across = { x: -Math.sin(door.angle), z: Math.cos(door.angle) };
  mesh.rotation.y = Math.atan2(across.x, across.z);
  mesh.position.set(door.x, h / 2, door.z);
  group.add(mesh);

  // glowing key rune strips
  const stripGeo = new THREE.PlaneGeometry(w * 0.82, 0.5);
  const stripMat = new THREE.MeshBasicMaterial({ color: colorHex });
  const strip1 = new THREE.Mesh(stripGeo, stripMat);
  const strip2 = new THREE.Mesh(stripGeo, stripMat);
  strip1.position.set(0, 0.8, d / 2 + 0.02);
  strip2.position.set(0, 0.8, -d / 2 - 0.02);
  strip2.rotation.y = Math.PI;
  mesh.add(strip1, strip2);

  // skull emblem
  const skull = makeTextSprite(door.key.toUpperCase(), { color: "#" + colorHex.toString(16).padStart(6, "0"), fontSize: 34 });
  skull.position.set(0, 2.2, 0);
  skull.scale.set(3.2, 1.6, 1);
  mesh.add(skull);

  // frame columns
  const colGeo = new THREE.BoxGeometry(0.8, h + 1, 2.2);
  const colMat = new THREE.MeshLambertMaterial({ color: 0x3a1d1d });
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(door.x + across.x * s * (w / 2), (h + 1) / 2 - 0.5, door.z + across.z * s * (w / 2));
    group.add(col);
  }

  door.mesh = mesh;
  door.open = () => {
    if (door.state === "closed") door.state = "opening";
  };
  updaters.push((dt, t) => {
    if (door.state === "opening") {
      door.openFrac = Math.min(1, door.openFrac + dt / 1.4);
      mesh.position.y = h / 2 + door.openFrac * (h - 1.2);
      if (door.openFrac >= 1) door.state = "open";
    }
    stripMat.color.setHex(colorHex).multiplyScalar(0.75 + 0.25 * Math.sin(t * 3));
  });
}

// ---------------- exit portal ----------------
function buildPortal(group, updaters, fortress) {
  const geo = new THREE.CylinderGeometry(3.2, 3.2, 0.5, 24);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
  const base = new THREE.Mesh(geo, mat);
  base.position.set(fortress.x, 0.25, fortress.z);
  group.add(base);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.2, 0.22, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffaa22 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(fortress.x, 0.6, fortress.z);
  group.add(ring);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.6, 9, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff6622, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false })
  );
  column.position.set(fortress.x, 4.6, fortress.z);
  group.add(column);

  const sign = makeTextSprite("EXIT PORTAL", { color: "#ff8833", fontSize: 40 });
  sign.position.set(fortress.x, 8.4, fortress.z);
  sign.scale.set(7, 1.6, 1);
  group.add(sign);

  updaters.push((dt, t) => {
    ring.position.y = 0.6 + Math.sin(t * 2.2) * 0.25;
    ring.rotation.z = t * 0.9;
    column.rotation.y = t * 1.6;
    mat.color.setHSL(0.05 + 0.02 * Math.sin(t * 3), 1, 0.5);
  });
  return { x: fortress.x, z: fortress.z, r: 3.2 };
}

// ---------------- posters ("memories of Earth") ----------------
function addPoster(group, updaters, spot, url, idx) {
  const w = 3.4, h = 1.7;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const fallbackTex = tex(genHellPoster(idx % 2 ? ["MEMORIES", "OF EARTH"] : ["YOU ARE", "IN HELL"], idx % 2));
  mat.map = fallbackTex;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(spot.x, spot.y, spot.z);
  mesh.rotation.y = Math.atan2(spot.nx, spot.nz);
  group.add(mesh);

  if (url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const t = new THREE.CanvasTexture(img);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      mat.map = t; mat.needsUpdate = true;
    };
    img.onerror = () => { /* keep fallback */ };
    img.src = url;
  }
  // frame
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.08),
    new THREE.MeshLambertMaterial({ color: 0x201410 })
  );
  frame.position.copy(mesh.position);
  frame.position.x -= spot.nx * 0.06; frame.position.z -= spot.nz * 0.06;
  frame.rotation.y = mesh.rotation.y;
  group.add(frame);

  const flick = Math.random() * 10;
  updaters.push((dt, t) => {
    const v = 0.85 + 0.15 * Math.sin(t * 7 + flick) * Math.sin(t * 2.3 + flick);
    mat.color.setScalar(v);
  });
}

function makeTextSprite(text, { color = "#ffcc44", fontSize = 48, stroke = true } = {}) {
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  const pad = 12;
  ctx.font = `bold ${fontSize}px monospace`;
  const tw = ctx.measureText(text).width;
  cv.width = Math.ceil(tw + pad * 2);
  cv.height = fontSize + pad * 2;
  const c2 = cv.getContext("2d");
  c2.font = `bold ${fontSize}px monospace`;
  c2.textBaseline = "middle"; c2.textAlign = "center";
  if (stroke) {
    c2.strokeStyle = "#000"; c2.lineWidth = 5;
    c2.strokeText(text, cv.width / 2, cv.height / 2);
  }
  c2.fillStyle = color;
  c2.fillText(text, cv.width / 2, cv.height / 2);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  return new THREE.Sprite(mat);
}

function addPoiSign(group, b) {
  const s = makeTextSprite(b.name.replace(/^./, c => c.toUpperCase()), {
    color: b.keyDoor ? ({ red: "#ff2244", blue: "#3388ff", yellow: "#ffcc33" })[b.keyDoor] : "#c9a25a",
    fontSize: 26,
  });
  s.position.set(b.x, 11 + (hashStr(b.name) % 4), b.y);
  const w = Math.min(16, 3 + b.name.length * 0.34);
  s.scale.set(w, w * 0.18, 1);
  group.add(s);
}

// ---------------- torches ----------------
function addTorches(grid, group, updaters, floorCells) {
  // flame frames
  const frames = [];
  for (let f = 0; f < 3; f++) {
    const cv = document.createElement("canvas");
    cv.width = 16; cv.height = 24;
    const ctx = cv.getContext("2d");
    const flick = f * 0.7;
    const grad = ctx.createRadialGradient(8 + Math.sin(flick) * 1.5, 14, 1, 8, 16, 13);
    grad.addColorStop(0, "#fff6a8");
    grad.addColorStop(0.3, "#ffb020");
    grad.addColorStop(0.7, "#e84b1000".slice(0, 7));
    grad.addColorStop(1, "rgba(120,20,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(8 + Math.sin(flick * 2) * 1.2, 14 - f, 5.5, 9 + f, 0, 0, 7);
    ctx.fill();
    frames.push(cv);
  }
  const mats = frames.map(cv => {
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  });
  const sprites = [];
  let placed = 0;
  for (let tries = 0; tries < 800 && placed < 34; tries++) {
    const i = choice(floorCells);
    if (i === undefined) break;
    const ft = grid.floor[i];
    if (ft !== F_ROAD && ft !== F_TILES) continue;
    const ix = i % grid.n, iz = (i / grid.n) | 0;
    const wx = grid.toWorldX(ix), wz = grid.toWorldZ(iz);
    // too close to another torch?
    if (sprites.some(s => Math.hypot(s.position.x - wx, s.position.z - wz) < 26)) continue;
    const sp = new THREE.Sprite(choice(mats));
    sp.position.set(wx, 2.1, wz);
    sp.scale.set(1.4, 2.1, 1);
    sp.userData.frame = Math.floor(Math.random() * 3);
    sp.userData.t = Math.random();
    group.add(sp); sprites.push(sp); placed++;
    // brazier base
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2126 })
    );
    base.position.set(wx, 0.55, wz);
    group.add(base);
  }
  updaters.push((dt) => {
    for (const sp of sprites) {
      sp.userData.t += dt;
      if (sp.userData.t > 0.12) {
        sp.userData.t = 0;
        sp.userData.frame = (sp.userData.frame + 1) % 3;
        sp.material = mats[sp.userData.frame];
      }
    }
  });
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}
