// Headless logic test: procgen → level build → sanity assertions
import { generateCity } from "../js/world/procgen.js";
import { buildLevel } from "../js/world/levelbuilder.js";

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log("  ✓ " + msg);
  else { console.error("  ✗ FAIL: " + msg); failures++; }
};

console.log("== PROCEDURAL CITY → LEVEL ==");
const radius = 260;
const osm = generateCity(radius);
console.log(`city: ${osm.roads.length} roads, ${osm.buildings.length} buildings`);
assert(osm.roads.length > 5, "city has roads");
assert(osm.buildings.length > 20, "city has buildings");

const t0 = Date.now();
const level = buildLevel(osm, { radius, density: 2, lat: null, lng: null, realTextures: false });
console.log(`built in ${Date.now() - t0}ms — enemies ${level.enemySpawns.length}, items ${level.items.length}, doors ${level.doors.length}`);

assert(!Number.isNaN(level.spawn.x) && !Number.isNaN(level.spawn.z), "spawn is a number");
assert(!level.isSolid(level.spawn.x, level.spawn.z), "spawn is on open floor");
assert(!level.isSolid(level.portal.x, level.portal.z), "portal is on open floor");
assert(level.doors.length === 3, "3 key doors exist");
assert(level.doors.every(d => d.state === "closed"), "doors start closed");
assert(level.enemySpawns.length > 40, "enemies spawned: " + level.enemySpawns.length);
assert(level.items.length > 50, "items spawned: " + level.items.length);
assert(level.enemySpawns.some(e => e.type === "archdevil"), "boss present");

// fortress sealed: no LOS from spawn to portal (door closed)
const sealed = level.los(level.spawn.x, level.spawn.z, level.portal.x, level.portal.z);
assert(!sealed, "fortress portal is sealed from spawn");

// red key reachable from spawn on foot?
const keyTypes = level.items.filter(i => i.type.startsWith("key_"));
assert(keyTypes.length === 3, "3 keys placed");
const g = level.grid;
const BFS = () => {
  const startIdx = g.idx(g.toCellX(level.spawn.x), g.toCellZ(level.spawn.z));
  const dist = new Int32Array(g.n * g.n).fill(-1);
  const q = [startIdx]; dist[startIdx] = 0;
  let h = 0;
  while (h < q.length) {
    const c = q[h++];
    const cx = c % g.n, cz = (c / g.n) | 0;
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ix = cx + dx, iz = cz + dz;
      if (ix < 0 || iz < 0 || ix >= g.n || iz >= g.n) continue;
      const i = g.idx(ix, iz);
      if (dist[i] !== -1 || g.type[i] !== 0 || g.floor[i] === 4) continue;
      const d = g.doorAt.get(i);
      if (d && d.state !== "open") continue; // closed doors block
      dist[i] = dist[c] + 1; q.push(i);
    }
  }
  return dist;
};
const dist = BFS();
for (const k of keyTypes) {
  const ki = g.idx(g.toCellX(k.x), g.toCellZ(k.z));
  assert(dist[ki] >= 0, `${k.type} reachable from spawn (d=${dist[ki]})`);
}
// portal cell NOT reachable before door opens
const pi = g.idx(g.toCellX(level.portal.x), g.toCellZ(level.portal.z));
assert(dist[pi] === -1, "portal sealed until red door");

// LOS / raycast sanity
const hit = level.raycastWall(level.spawn.x, level.spawn.z, 1, 0, 60);
assert(hit === null || hit.dist > 0.5, "raycast wall works: " + (hit ? hit.dist.toFixed(1) + "m" : "none"));

// door mechanics: open red door → portal reachable
const redDoor = level.doors.find(d => d.key === "red");
redDoor.open();
for (let i = 0; i < 400 && redDoor.state !== "open"; i++) {
  for (const u of level.updaters) u(1 / 30, i / 30);
}
assert(redDoor.state === "open", "red door opens after use");

console.log("== ENEMY SPRITE RIG ==");
const { ENEMY_DEFS } = await import("../js/game/enemies.js");
assert(Object.keys(ENEMY_DEFS).length >= 9, "all enemy types defined: " + Object.keys(ENEMY_DEFS).length);

console.log("== ITEM DEFS ==");
const { ITEM_DEFS } = await import("../js/game/items.js");
const expected = ["stimpack","medikit","soulsphere","berserk","armor1","armor2","key_red","key_blue","key_yellow","shotgun","supershotgun","chaingun","rocketlauncher","plasma","invuln","radsuit","shells","shellbox","bullets","cells","rockets","healthbonus","armorbonus"];
const missing = expected.filter(t => !ITEM_DEFS[t]);
assert(missing.length === 0, "all item types present" + (missing.length ? " MISSING: " + missing : ""));

console.log("== WEAPON VIEWMODELS ==");
const { WEAPON_DEFS } = await import("../js/game/weapons.js");
assert(Object.keys(WEAPON_DEFS).length === 7, "7 weapons");

console.log(failures === 0 ? "\nALL HEADLESS TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
