// ============================================================
// DOOMMAPS — Bootstrap. Loads modules, wires game + menus,
// handles pause flow and graceful CDN failure.
// ============================================================

const boot = document.getElementById("boot");
const bootStatus = document.getElementById("boot-status");
const bootLog = document.getElementById("boot-log");
const bootFill = document.getElementById("boot-bar-fill");

function setBoot(p, msg) {
  if (bootFill) bootFill.style.width = Math.round(p * 100) + "%";
  if (bootLog && msg) bootLog.textContent = msg;
}

async function run() {
  setBoot(0.1, "LOADING HELL ENGINE…");

  let Engine, Game, Menus, CONFIG, INPUT, AUDIO;
  try {
    const [cfg, engineMod, gameMod, menusMod, inputMod, audioMod] = await Promise.all([
      import("./config.js"),
      import("./core/engine.js"),
      import("./game/game.js"),
      import("./ui/menus.js"),
      import("./core/input.js"),
      import("./core/audio.js"),
    ]);
    CONFIG = cfg;
    ({ Engine } = engineMod);
    ({ Game } = gameMod);
    ({ Menus } = menusMod);
    ({ INPUT } = inputMod);
    ({ AUDIO } = audioMod);
  } catch (err) {
    console.error(err);
    setBoot(0, "FAILED TO LOAD THE ENGINE — the Three.js CDN may be unreachable.\nCheck your connection and reload.\n\n" + (err && err.message));
    if (bootStatus) bootStatus.textContent = "SUMMON FAILED";
    const btn = document.createElement("div");
    btn.className = "menu-item";
    btn.style.margin = "18px auto 0";
    btn.style.display = "inline-block";
    btn.textContent = "RETRY";
    btn.onclick = () => location.reload();
    document.querySelector(".boot-inner").appendChild(btn);
    return;
  }
  setBoot(0.35, "ENGINE LOADED — BINDING PORTALS…");

  const settings = CONFIG.loadSettings();
  INPUT.sens = settings.mouseSens;

  const canvas = document.getElementById("game-canvas");
  let engine;
  try {
    engine = new Engine(canvas, settings);
    engine.setMode(settings.renderMode);
  } catch (err) {
    console.error(err);
    setBoot(0, "WEBGL UNAVAILABLE: " + err.message);
    if (bootStatus) bootStatus.textContent = "NO GATEWAY TO HELL";
    return;
  }

  setBoot(0.6, "CALIBRATING RIP-AND-TEAR INDEX…");

  const game = new Game(engine, settings);
  const menus = new Menus(game);
  menus._sync();

  INPUT.init(canvas);

  // pause / lock plumbing
  INPUT.onAction && (() => {
    const prev = INPUT.actionHandler;
    INPUT.onAction((act) => {
      if (act === "pause") {
        if (game.state === "playing") {
          if (game.paused) menus.resume();
          else menus.showPause();
        }
        return;
      }
      if (act === "lockLost") {
        if (game.state === "playing" && !game.paused && INPUT.enabled) {
          menus.showPause();
        }
        return;
      }
      if (act === "debugLog") {
        const el = document.getElementById("console-log");
        el.classList.toggle("hidden");
        if (!el.classList.contains("hidden")) {
          el.textContent = (window.__errorLog.length ? window.__errorLog.slice(-10) : ["no errors logged"]).join("\n");
        }
        return;
      }
      prev && prev(act);
    });
  })();

  // audio unlock on first interaction anywhere
  const unlock = () => { AUDIO.init(); AUDIO.resume(); AUDIO.setVolumes(settings.musicVol, settings.sfxVol); };
  window.addEventListener("mousedown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true });

  setBoot(0.85, "WARMING UP THE HELLFIRE…");
  // warm frame so first paints are clean
  engine.update(0.016, 0, { x: 0, y: 0, z: 0 });
  engine.render();

  game.start();

  setBoot(1, "READY.");
  setTimeout(() => {
    boot.classList.add("hidden");
    menus.showTitle();
  }, 350);
}

run();
