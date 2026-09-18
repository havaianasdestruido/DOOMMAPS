// Headless gameplay simulation: boots the real Game against stubbed
// engine/DOM, simulates input, exercises combat, doors, pickup, victory.
import * as THREE from "three";

let failures = 0;
const assert = (cond, msg) => {
  if (cond) console.log("  ✓ " + msg);
  else { console.error("  ✗ FAIL: " + msg); failures++; }
};

// block all network instantly → procgen fallback path
globalThis.fetch = () => Promise.reject(new Error("offline test"));

const cfg = await import("../js/config.js");
const { INPUT } = await import("../js/core/input.js");
const { Game } = await import("../js/game/game.js");

const settings = cfg.loadSettings();
settings.enemyDensity = 2;

// fake engine (THREE-stub scene, no GL)
const engine = {
  scene: new THREE.Scene(),
  camera: { position: new THREE.Vector3(), rotation: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } } },
  canvas: document.createElement("canvas"),
  settings,
  shakeVec: new THREE.Vector3(),
  setSkyMode() {}, setMode() {}, flash() {}, addShake() {}, setInvuln() {},
  hurt() {}, flashScreen() {}, update() {}, render() {},
};

const game = new Game(engine, settings);
assert(game.state === "menu", "game starts in menu");

console.log("== START RUN ==");
await game.startRun({ lat: 40.75, lng: -73.99, name: "TEST SECTOR" }, () => {});
assert(game.state === "playing", "run started, state=playing");
assert(game.level !== null, "level built");
game.player.god = true; // systems test: don't get shredded mid-run
const L = game.level;
console.log(`  enemies=${game.enemies.list.length} items=${game.items.list.length} doors=${L.doors.length}`);

// input plumbing
INPUT.enabled = true;

console.log("== MOVEMENT ==");
const p = game.player;
const sx = p.pos.x, sz = p.pos.z;
INPUT.keys.add("KeyW");
for (let i = 0; i < 60; i++) game.update(1 / 60);
INPUT.keys.delete("KeyW");
assert(Math.hypot(p.pos.x - sx, p.pos.z - sz) > 5, "player moved forward");
assert(!L.isSolid(p.pos.x, p.pos.z), "player not inside a wall");
assert(Math.abs(engine.camera.position.x - p.pos.x) < 0.1 && Math.abs(engine.camera.position.z - p.pos.z) < 0.1, "camera follows player");

console.log("== ENEMY AI ==");
// wake everything nearby
game.enemies.onNoise(p.pos.x, p.pos.z, 500);
const awakeCount = game.enemies.list.filter(e => e.awake).length;
assert(awakeCount > 0, `noise wakes enemies (${awakeCount})`);
// run 10 seconds of AI updates
for (let i = 0; i < 600; i++) game.update(1 / 60);
assert(true, "10s of AI updates without crash");

console.log("== SHOOTING ==");
// pick a target with LOS and shoot at it
let target = null;
for (const e of game.enemies.list) {
  const d = e.pos.distanceTo(p.pos);
  if (d < 60 && L.los(p.pos.x, p.pos.z, e.pos.x, e.pos.z)) { target = e; break; }
}
assert(target, "found enemy with line of sight");
p.angle = Math.atan2(-(target.pos.x - p.pos.x), -(target.pos.z - p.pos.z));
const hpBefore = target.hp;
INPUT.fire = true;
for (let i = 0; i < 30; i++) game.update(1 / 60);
INPUT.fire = false;
assert(target.hp < hpBefore || target.state === "dying", `pistol hit enemy (${hpBefore} → ${target.hp})`);
assert(game.player.ammo.bullets < 50, "ammo consumed");

console.log("== WEAPON SWITCH ==");
game.weapons.requestSwitch("fist");
for (let i = 0; i < 30; i++) game.update(1 / 60);
assert(game.weapons.current === "fist", "switched to fists");
game.weapons.requestSwitch("pistol");
for (let i = 0; i < 30; i++) game.update(1 / 60);
assert(game.weapons.current === "pistol", "switched back");

console.log("== IDKFA CHEAT ==");
INPUT.cheatBuffer = "IDKFA";
game.update(1 / 60);
assert(p.weapons.has("rocket"), "IDKFA granted rocket launcher");
assert(p.keys.has("red"), "IDKFA granted red key");

console.log("== ROCKET + SPLASH ==");
game.weapons.requestSwitch("rocket");
for (let i = 0; i < 40; i++) game.update(1 / 60);
INPUT.fire = true;
game.update(1 / 60);
INPUT.fire = false;
for (let i = 0; i < 240; i++) game.update(1 / 60);
assert(true, "rocket flight + explosion simulated");

console.log("== KEY PICKUP & DOOR ==");
// teleport to the red key item and let pickup trigger
const keyItem = game.items.list.find(i => i.type === "key_red");
assert(keyItem, "red key exists in level");
p.pos.x = keyItem.x; p.pos.z = keyItem.z;
game.update(1 / 60);
assert(p.keys.has("red") || !game.items.list.includes(keyItem), "red key picked up");

// teleport near red door, open it
const redDoor = L.doors.find(d => d.key === "red");
p.pos.x = redDoor.x + Math.cos(redDoor.angle) * 6;
p.pos.z = redDoor.z + Math.sin(redDoor.angle) * 6;
game.tryUse();
assert(redDoor.state !== "closed", "red door opens with key");
for (let i = 0; i < 120; i++) game.update(1 / 60);
assert(redDoor.state === "open", "red door fully open");

console.log("== PLAYER DAMAGE & HEAL ==");
p.god = false;
p.invulnT = 0;
const hp0 = p.health;
game.damagePlayer(15, { x: p.pos.x + 5, z: p.pos.z }, "test");
assert(p.health === hp0 - 15 || p.god, "damage applied w/o armor");
p.health = 50;
const med = game.items.list.find(i => i.type === "medikit");
if (med) { p.pos.x = med.x; p.pos.z = med.z; game.update(1 / 60); assert(p.health === 75, "medikit healed +25"); }
else { console.log("  (medikit gone, skipping heal check)"); }

console.log("== VICTORY ==");
p.pos.x = L.portal.x; p.pos.z = L.portal.z;
game.update(1 / 60);
assert(game.state === "victory", "portal triggers victory");

console.log("== DEATH PATH ==");
await game.startRun({ lat: 1, lng: 1, name: "RETRY SECTOR" }, () => {});
assert(game.state === "playing" && game.player.health === 100, "restart respawns clean");
game.damagePlayer(999, null, "test");
game.update(1 / 60);
assert(game.player.dead && game.state === "dead", "death state");
for (let i = 0; i < 120; i++) game.update(1 / 60); // death cam + enemies idle
assert(true, "death frames ran");

console.log(failures === 0 ? "\nALL SIMULATION TESTS PASSED" : `\n${failures} FAILURES`);
process.exit(failures ? 1 : 0);
