// ============================================================
// DOOMMAPS — Menus: title, location select, settings, help,
// pause, death, victory, loading (DOM-driven, DOM-free HUD)
// ============================================================
import { LANDMARKS, RANDOM_SPOTS, API, GOOGLE_API_KEY, saveSettings, choice } from "../config.js";
import { AUDIO } from "../core/audio.js";
import { INPUT } from "../core/input.js";

export class Menus {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById("ui-overlay");
    this.current = null;
    this._bindState();
    INPUT.onAnyKey(() => {
      // menu keyboard helpers
      if (this.current === "pause" && this.game.state === "playing") {
        // Esc handled via action→pause
      }
    });
  }

  _bindState() {
    const g = this.game;
    g.onStateChange = (ev) => {
      if (ev === "dead") this.showDeath();
      else if (ev === "victory") this.showVictory();
      else if (ev === "gotoGPS") { this.hideAll(); this._startGPS(); }
    };
    // Esc handling: game forwards "pause" action
    g.pauseRequested = () => {
      if (g.state === "playing" && !g.paused) this.showPause();
    };
  }

  hideAll() {
    this.root.innerHTML = "";
    this.root.classList.remove("visible");
    this.current = null;
  }

  _screen(cls = "") {
    this.root.innerHTML = "";
    this.root.classList.add("visible");
    const s = document.createElement("div");
    s.className = "menu-screen " + cls;
    this.root.appendChild(s);
    return s;
  }

  _footer(s, text) {
    const f = document.createElement("div");
    f.className = "menu-footer";
    f.textContent = text;
    s.appendChild(f);
  }

  _items(s, items) {
    const list = document.createElement("div");
    list.className = "menu-list";
    s.appendChild(list);
    items.forEach((it, i) => {
      if (!it) { const sep = document.createElement("div"); sep.style.height = "10px"; list.appendChild(sep); return; }
      const el = document.createElement("div");
      el.className = "menu-item" + (it.disabled ? " disabled" : "");
      const left = document.createElement("span");
      left.innerHTML = `<span class="skull">☠</span>${it.label}`;
      el.appendChild(left);
      if (it.value !== undefined) {
        const v = document.createElement("span");
        v.className = "val";
        v.textContent = it.value();
        el.appendChild(v);
        it._el = v;
      }
      el.addEventListener("mouseenter", () => { list.querySelectorAll(".menu-item").forEach(x => x.classList.remove("selected")); el.classList.add("selected"); AUDIO.init(); AUDIO.resume(); });
      el.addEventListener("click", (e) => {
        AUDIO.init(); AUDIO.resume();
        it.onClick(e, it);
      });
      if (i === 0) el.classList.add("selected");
      list.appendChild(el);
    });
    return list;
  }

  // ================= TITLE =================
  showTitle() {
    this.current = "title";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = "DOOMMAPS";
    s.appendChild(t);
    const st = document.createElement("div");
    st.className = "menu-subtitle";
    st.textContent = "KNEE-DEEP IN THE REAL WORLD";
    s.appendChild(st);

    this._items(s, [
      { label: "INVASION — CHOOSE BATTLEFIELD", onClick: () => this.showLocationSelect() },
      { label: "GPS SIEGE — FIGHT WHERE YOU STAND", onClick: () => this._startGPS() },
      { label: "DEMON ROULETTE — RANDOM CITY", onClick: () => this._startRandom() },
      null,
      { label: "SETTINGS", onClick: () => this.showSettings(() => this.showTitle()) },
      { label: "HOW TO PLAY", onClick: () => this.showHelp() },
    ]);

    // quick diagnostics
    const diag = document.createElement("div");
    diag.className = "diag-line";
    diag.innerHTML = "probing hell-gates…";
    s.appendChild(diag);
    this._diagnostics(diag);

    this._footer(s, "CLICK = enabled audio  ·  WASD + MOUSE  ·  F1 camera  ·  TAB automap  ·  built on real-world geography");
    AUDIO.setMusic("title");
  }

  async _diagnostics(el) {
    const probe = async (url, mode = "GET") => {
      try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(url, { method: mode, signal: ctrl.signal });
        return r.ok || r.status === 403 || r.status === 400;
      } catch (e) { return false; }
    };
    const [geo, over, tiles] = await Promise.all([
      fetch(API.GEOCODE("New York")).then(r => r.json()).then(j => j.status !== "REQUEST_DENIED").catch(() => null),
      fetch(API.OVERPASS[0] + "?status", { method: "GET" }).then(r => r.ok).catch(() => false),
      fetch(`https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`)
        .then(r => r.ok ? "ok" : (r.status === 403 ? "noapi" : String(r.status))).catch(() => null),
    ]);
    const gTxt = geo === true ? "<b style=color:#7ae84b>MAPS API: ONLINE</b>" : geo === false ? "<b style=color:#ff8855>MAPS API: DENIED (fallback active)</b>" : "<b style=color:#ff8855>MAPS API: UNREACHABLE</b>";
    const oTxt = over ? "<b style=color:#7ae84b>STREET DATA: ONLINE</b>" : "<b style=color:#ff8855>STREET DATA: OFFLINE (procedural fallback)</b>";
    const tTxt = tiles === "ok" ? "<b style=color:#7ae84b>3D TILES: KEY AUTHORIZED</b>"
      : tiles === "noapi" ? "<b style=color:#ff8855>3D TILES: KEY LACKS API (satellite/OSM geometry in use)</b>"
      : "<b style=color:#ff8855>3D TILES: UNREACHABLE</b>";
    el.innerHTML = gTxt + " &nbsp;·&nbsp; " + oTxt + "<br>" + tTxt;
  }

  // ================= LOCATION SELECT =================
  showLocationSelect() {
    this.current = "locate";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.style.fontSize = "clamp(20px,4vw,44px)";
    t.textContent = "CHOOSE BATTLEFIELD";
    s.appendChild(t);
    const st = document.createElement("div");
    st.className = "menu-subtitle";
    st.textContent = "ANY REAL PLACE BECOMES A DEMON WARZONE";
    s.appendChild(st);

    const panel = document.createElement("div");
    panel.className = "loc-panel";
    s.appendChild(panel);

    const input = document.createElement("input");
    input.placeholder = "ENTER AN ADDRESS, CITY, OR PLACE ON EARTH…";
    panel.appendChild(input);
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") this._geocodeGo(input.value); });
    input.focus();

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    panel.appendChild(btnRow);
    const mkBtn = (label, fn) => {
      const b = document.createElement("div");
      b.className = "menu-item";
      b.style.padding = "6px 16px";
      b.style.fontSize = "14px";
      b.innerHTML = `<span class="skull">☠</span>` + label;
      b.addEventListener("click", () => { AUDIO.init(); AUDIO.resume(); fn(); });
      btnRow.appendChild(b);
      return b;
    };
    mkBtn("INVADE", () => this._geocodeGo(input.value));
    mkBtn("MY GPS", () => this._startGPS());
    mkBtn("ROULETTE", () => this._startRandom());
    mkBtn("BACK", () => this.showTitle());

    const grid = document.createElement("div");
    grid.className = "landmark-grid";
    panel.appendChild(grid);
    for (const [name, sub, lat, lng] of LANDMARKS) {
      const b = document.createElement("div");
      b.className = "landmark-btn";
      b.innerHTML = `${name}<span class="lm-loc">${sub}</span>`;
      b.addEventListener("click", () => {
        AUDIO.init(); AUDIO.resume();
        this._begin({ lat, lng, name });
      });
      grid.appendChild(b);
    }
    this._footer(s, "Type anywhere — 1600 Pennsylvania Ave, Tokyo Tower, your school, Area 51. Real streets, real demons.");
  }

  async _geocodeGo(query) {
    if (!query || !query.trim()) return;
    this.showLoading("LOCATING TARGET…");
    let loc = null;
    // Google Geocoding first
    try {
      const r = await fetch(API.GEOCODE(query));
      const j = await r.json();
      if (j.status === "OK" && j.results[0]) {
        const g = j.results[0].geometry.location;
        loc = { lat: g.lat, lng: g.lng, name: j.results[0].formatted_address.split(",")[0].toUpperCase() };
      }
    } catch (e) { /* fall through */ }
    // Nominatim fallback
    if (!loc) {
      try {
        const r = await fetch(API.NOMINATIM(query), { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        if (j && j[0]) loc = { lat: +j[0].lat, lng: +j[0].lon, name: (j[0].display_name || query).split(",")[0].toUpperCase() };
      } catch (e) { /* fall through */ }
    }
    if (!loc) {
      this.showLoading("TARGET NOT FOUND — COURSE TO HELL SET BY DEFAULT");
      setTimeout(() => this._startRandom(), 1200);
      return;
    }
    this._begin(loc);
  }

  _startGPS() {
    this.showLoading("TRIANGULATING YOUR SOUL…");
    if (!navigator.geolocation) {
      this.showLoading("GPS DENIED — ROULETTE IT IS");
      setTimeout(() => this._startRandom(), 1200);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => this._begin({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: "YOUR TURF" }),
      (err) => {
        console.warn("GPS error", err);
        this.showLoading("GPS DENIED — ROULETTE IT IS");
        setTimeout(() => this._startRandom(), 1200);
      },
      { timeout: 9000, maximumAge: 60000 }
    );
  }

  _startRandom() {
    const [lat, lng] = choice(RANDOM_SPOTS);
    const jx = () => (Math.random() - 0.5) * 0.02;
    this._begin({ lat: lat + jx(), lng: lng + jx(), name: "DEMON ROULETTE" });
  }

  // ================= RUN =================
  _begin(loc) {
    this.showLoading();
    this.game.startRun(loc, (p, msg) => this._loadingProgress(p, msg)).then(() => {
      this.hideAll();
    }).catch((err) => {
      console.error(err);
      this.showLoading("THE RITUAL FAILED: " + (err && err.message ? err.message : "unknown"));
      setTimeout(() => this.showTitle(), 2200);
    });
  }

  showLoading(msg = "OPENING THE GATE…") {
    this.current = "loading";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.style.fontSize = "clamp(18px,3.4vw,38px)";
    t.textContent = "DOOMMAPS";
    s.appendChild(t);
    this._loadStatus = document.createElement("div");
    this._loadStatus.className = "menu-subtitle";
    this._loadStatus.textContent = msg;
    s.appendChild(this._loadStatus);
    const bar = document.createElement("div");
    bar.className = "boot-bar";
    this._loadBar = document.createElement("div");
    this._loadBar.style.cssText = "height:100%;width:0%;background:linear-gradient(90deg,#7a1010,#e84b18,#f7d84b);transition:width .3s";
    bar.appendChild(this._loadBar);
    s.appendChild(bar);
    this._footer(s, "TIP: SHOOT BARRELS OF INFORMATION. LAVA IS BAD FOR YOUR SKIN.");
  }
  _loadingProgress(p, msg) {
    if (this._loadBar) this._loadBar.style.width = Math.round(p * 100) + "%";
    if (this._loadStatus && msg) this._loadStatus.textContent = msg;
  }

  // ================= PAUSE =================
  showPause() {
    this.current = "pause";
    this.game.setPaused(true);
    const s = this._screen();
    const tint = document.createElement("div");
    tint.className = "pause-tint";
    s.insertBefore(tint, s.firstChild);
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = "PAUSED";
    s.appendChild(t);
    this._items(s, [
      { label: "RESUME CARNAGE", onClick: () => this.resume() },
      { label: "RESTART THIS SIEGE", onClick: () => this._begin({ lat: this.game.lat, lng: this.game.lng, name: this.game.locationName }) },
      null,
      { label: "SETTINGS", onClick: () => this.showSettings(() => this.showPause()) },
      { label: "ABANDON SIEGE (TITLE)", onClick: () => { this.game.setPaused(false); this.showTitle(); this.game.state = "menu"; INPUT.enabled = false; } },
    ]);
    this._footer(s, "KILLS " + this.game.player.kills + "  ·  " + fmtTime(this.game.levelTime));
  }

  resume() {
    this.hideAll();
    this.game.setPaused(false);
  }

  // ================= DEATH =================
  showDeath() {
    this.current = "dead";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "death-title";
    t.textContent = "YOU DIED";
    s.appendChild(t);
    const st = document.createElement("div");
    st.className = "menu-subtitle";
    st.textContent = this.game.locationName + " KEEPS YOUR BONES";
    s.appendChild(st);
    this._items(s, [
      { label: "RISE AGAIN — RESTART SIEGE", onClick: () => this._begin({ lat: this.game.lat, lng: this.game.lng, name: this.game.locationName }) },
      { label: "NEW BATTLEFIELD", onClick: () => this.showLocationSelect() },
      { label: "TITLE", onClick: () => { this.game.state = "menu"; INPUT.enabled = false; this.showTitle(); } },
    ]);
    this._footer(s, `KILLS ${this.game.player.kills} · SURVIVED ${fmtTime(this.game.levelTime)}`);
  }

  // ================= VICTORY =================
  showVictory() {
    this.current = "victory";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.textContent = "SIEGE WON";
    s.appendChild(t);
    const st = document.createElement("div");
    st.className = "menu-subtitle";
    st.textContent = `${this.game.locationName} IS CLEANSED`;
    s.appendChild(st);

    const killPct = this.game.enemies.totalSpawned ? Math.round(this.game.player.kills / this.game.enemies.totalSpawned * 100) : 100;
    const stats = document.createElement("div");
    stats.className = "menu-hint";
    stats.style.fontSize = "16px";
    stats.style.color = "#e8d88a";
    const par = this.game.parTime || 360;
    const beat = this.game.levelTime <= par;
    stats.innerHTML =
      `☠ &nbsp;KILLS: <b style="color:#f7d84b">${this.game.player.kills} / ${this.game.enemies.totalSpawned}</b> (${killPct}%)<br>` +
      `⚿ &nbsp;SECRETS: <b style="color:#7ae84b">${this.game.player.secretsFound} / ${this.game.level.secrets.length}</b><br>` +
      `⌛ &nbsp;TIME: <b style="color:#8ff8ff">${fmtTime(this.game.levelTime)}</b> &nbsp;PAR ${fmtTime(par)} &nbsp;<b style="color:${beat ? "#7ae84b" : "#ff8855"}">${beat ? "UNDER PAR — BRUTAL" : "OVER PAR"}</b>`;
    s.appendChild(stats);

    this._items(s, [
      { label: "NEXT BATTLEFIELD", onClick: () => this.showLocationSelect() },
      { label: "RE-DEMONIZE THIS PLACE", onClick: () => this._begin({ lat: this.game.lat, lng: this.game.lng, name: this.game.locationName }) },
      { label: "TITLE", onClick: () => { this.game.state = "menu"; INPUT.enabled = false; this.showTitle(); } },
    ]);
    AUDIO.setMusic("title");
    this._footer(s, "THE DEMONS WILL REMEMBER YOU.");
  }

  // ================= SETTINGS =================
  showSettings(back) {
    this.current = "settings";
    const st = this.game.settings;
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.style.fontSize = "clamp(18px,3.6vw,40px)";
    t.textContent = "SETTINGS";
    s.appendChild(t);

    const toggle = (k) => () => { st[k] = !st[k]; saveSettings(st); this._sync(); this.showSettings(back); };
    const cycle = (k, arr) => () => {
      const i = arr.indexOf(st[k]);
      st[k] = arr[(i + 1) % arr.length];
      saveSettings(st); this._sync(); this.showSettings(back);
    };
    const onoff = (v) => v ? "ON" : "OFF";

    this._items(s, [
      { label: "CAMERA MODE", value: () => st.classicCamera ? "CLASSIC DOOM" : "MODERN FREE-LOOK", onClick: toggle("classicCamera") },
      { label: "AUTOAIM", value: () => onoff(st.autoaim), onClick: toggle("autoaim") },
      { label: "JUMP", value: () => onoff(st.jump), onClick: toggle("jump") },
      { label: "GORE LEVEL", value: () => ["OFF", "LOW", "MEDIUM", "DOOM"][st.gore], onClick: cycle("gore", [0, 1, 2, 3]) },
      null,
      { label: "RENDER MODE", value: () => st.renderMode.toUpperCase(), onClick: () => { st.renderMode = st.renderMode === "classic" ? "modern" : "classic"; saveSettings(st); this._sync(); this.showSettings(back); } },
      { label: "HEAD BOB", value: () => onoff(st.headBob), onClick: toggle("headBob") },
      { label: "SCREEN FLASH", value: () => onoff(st.screenFlash), onClick: toggle("screenFlash") },
      { label: "CROSSHAIR", value: () => onoff(st.crosshair), onClick: toggle("crosshair") },
      { label: "HUD SCALE", value: () => ["1x", "2x", "3x"][st.hudScale - 1] || "2x", onClick: cycle("hudScale", [1, 2, 3]) },
      null,
      { label: "MUSIC VOLUME", value: () => Math.round(st.musicVol * 10) + "/10", onClick: cycle("musicVol", [0, .2, .4, .55, .7, .85, 1]) },
      { label: "SFX VOLUME", value: () => Math.round(st.sfxVol * 10) + "/10", onClick: cycle("sfxVol", [0, .3, .5, .7, .9, 1]) },
      null,
      { label: "DEMON DENSITY", value: () => ["LOW", "MEDIUM", "HIGH", "ULTRA"][st.enemyDensity - 1], onClick: cycle("enemyDensity", [1, 2, 3, 4]) },
      { label: "SIEGE RADIUS", value: () => st.mapRadius + "m", onClick: cycle("mapRadius", [180, 260, 380, 520]) },
      { label: "STREET VIEW POSTERS", value: () => onoff(st.realTextures && st.showStreetPosters), onClick: toggle("showStreetPosters") },
      null,
      { label: "MOUSE SENSITIVITY", value: () => st.mouseSens.toFixed(1), onClick: cycle("mouseSens", [0.4, 0.7, 1.0, 1.4, 1.8, 2.4]) },
      null,
      { label: "← BACK", onClick: () => back() },
    ]);
    this._footer(s, "Classic camera + status bar are the authentic DOOM defaults. Modern features are opt-in, per tradition.");
  }
  _sync() {
    const st = this.game.settings;
    this.game.engine.setMode(st.renderMode);
    INPUT.sens = st.mouseSens;
    AUDIO.setVolumes(st.musicVol, st.sfxVol);
  }

  // ================= HELP =================
  showHelp() {
    this.current = "help";
    const s = this._screen();
    const t = document.createElement("div");
    t.className = "menu-title";
    t.style.fontSize = "clamp(18px,3.4vw,38px)";
    t.textContent = "FIELD MANUAL";
    s.appendChild(t);
    const hint = document.createElement("div");
    hint.className = "menu-hint";
    hint.innerHTML = [
      "<b style='color:#f7d84b'>MOVE</b> — W A S D · <b>TURN</b> — MOUSE · <b>FIRE</b> — LEFT CLICK",
      "<b style='color:#f7d84b'>DOORS</b> — E / SPACE · <b>WEAPONS</b> — 1–7 / WHEEL · <b>AUTOMAP</b> — TAB",
      "<b style='color:#f7d84b'>F1</b> — CLASSIC/MODERN CAMERA · <b>F2</b> — HUD MODES · <b>F5</b> — SCREENSHOT · <b>ESC</b> — PAUSE",
      "",
      "<b style='color:#ff8855'>OBJECTIVE:</b> Locate the <b>EXIT PORTAL</b> inside the hell-fortress.",
      "The portal is sealed by a <b style='color:#ff4455'>RED DOOR</b>. Find the <b style='color:#ff4455'>RED KEYCARD</b> first.",
      "Blue & yellow chambers hide secret armaments. Lava burns. Demons outnumber you.",
      "",
      "CHEATS: IDDQD · IDKFA · IDCLIP · IDDT — old gods approve.",
      "The face watches you. Click it.",
    ].join("<br>");
    s.appendChild(hint);
    this._items(s, [{ label: "← BACK", onClick: () => this.showTitle() }]);
    this._footer(s, "RIP AND TEAR, UNTIL IT IS DONE.");
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
