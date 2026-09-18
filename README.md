# 🔥 DOOMMAPS

**Knee-deep in the real world.** A DOOM (1993)-faithful first-person shooter where every
battlefield is generated from **real-world geography**. Type any address, drop into a curated
hell-tainted landmark, use your GPS, or spin the Demon Roulette — the streets you fight on are
the streets of the actual place.

![engine](https://img.shields.io/badge/renderer-three.js%20webgl2-red) ![assets](https://img.shields.io/badge/assets-100%25%20procedural-orange) ![dependencies](https://img.shields.io/badge/dependencies-1%20cdn-yellow)

---

## ▶️ Play

Serve the folder statically and open it in a browser (must support WebGL + ES modules):

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# → http://localhost:8080
```

Everything (sprites, textures, sounds, the face) is generated procedurally at runtime.
The only external dependency is Three.js from a CDN. A Google Maps Platform API key in
`js/config.js` enables address geocoding and Street View posters; the game degrades
gracefully and stays fully playable if any external API is unreachable.

## 🗺️ Where the world comes from

| Source | Used for | Fallback |
|---|---|---|
| Google Geocoding API | "Invasion by address" resolution | OSM Nominatim |
| OpenStreetMap Overpass | Streets, buildings, parks, water → level geometry | Procedural demon-city |
| Google Street View Static | "Memories of Earth" wall posters | Glitched hell posters |
| Google Photorealistic 3D Tiles | *(diagnosed at runtime; offline in most demo keys)* | — |

Buildings become walls, roads become arena corridors, parks become blood-soaked combat
pits, water becomes lava. A **hell fortress** with the sealed **EXIT PORTAL** is raised in
the middle of your real streets. Go find the red keycard.

## 🎮 Controls

| Input | Action |
|---|---|
| `WASD` + mouse | Move / turn (run is default — DOOM rules) |
| `LMB` | Fire |
| `1–7` / wheel | Weapon select |
| `E` / `Space` | Open doors & gates |
| `F1` | Toggle **Classic** (locked horizon) / **Modern** (free look) camera |
| `F2` | Cycle HUD: full → status bar → minimal → off |
| `TAB` | Automap over the real road layout |
| `F5` | Screenshot · `ESC` pause · `~` console/cheat crib sheet |
| `IDDQD IDKFA IDCLIP IDDT IDBEHOLD IDGPS` | The classics. Typed in-game. |

## 👹 Objective

1. Explore the demonified location, find the **RED keycard**.
2. Optional: blue & yellow key cards open loot chambers (super shotgun, soulsphere…).
3. Kill through the red door, survive the **ARCHDEVIL**, and step into the **exit portal**.

## 🧱 Architecture

```
js/
  config.js          constants, key, landmarks, settings
  core/
    engine.js        WebGL pipeline, classic dither pass, hell sky, shake
    pixelart.js      ASCII/procedural → canvas sprites & textures
    audio.js         synthesized SFX + procedural metal/MIDI sequencer
    input.js         keyboard/mouse/pointer-lock(+fallback), cheats buffer
  world/
    osm.js           Overpass fetch + normalization
    procgen.js       offline city generator (same format)
    levelbuilder.js  geography → grid → chunked sector-lit geometry,
                     fortress/chambers/keydoors, spawns, posters, torches
  game/
    game.js          states, loop, cheats, doors, portal, loading
    player.js        DOOM movement, armor/health/inventory
    weapons.js       7 slots, painted view-models, autoaim
    enemies.js       procedural sprite rigs + AI (9 types, boss)
    projectiles.js   fireballs/rockets both ways, splash
    items.js         pickups/rules/icons
    effects.js       blood/gibs/explosions/decals
    hud.js           STBAR: ammo/armor/face/health/arms/keys
    face.js          the reactive doomguy face (25+ states, clickable)
    automap.js       revealed line map of the real streets
  ui/menus.js        title, location select, settings, pause, death, victory
test/                headless harness: logic suite, gameplay sim, sprite renderer
```

### Headless tests

```bash
node --import ./test/register.mjs test/run.mjs    # grid/level logic suite
node --import ./test/register.mjs test/sim.mjs    # full gameplay simulation
node --import ./test/register.mjs test/montage.mjs # renders all art → test/out/*.png
```

## ⚠️ Notes

- Google APIs are **client-side by design** and may be disabled on a demo key — the game
  detects and reports this on the location screen and keeps working.
- Overpass is a free community service; responses are cached per location in-session.
- GPS mode needs HTTPS + browser permission.
- The face watches you. Click it.
