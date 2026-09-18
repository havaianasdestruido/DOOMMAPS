// ============================================================
// DOOMMAPS — Configuration, constants, landmarks, settings
// ============================================================

export const GOOGLE_API_KEY = "AIzaSyB8C7IfCz40W7Xsq8p_GuIlyEx-CcOaowg";

export const API = {
  GEOCODE: (q) => `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${GOOGLE_API_KEY}`,
  TILES3D_ROOT: `https://tile.googleapis.com/v1/3dtiles/root.json?key=${GOOGLE_API_KEY}`,
  STREETVIEW: (lat, lng, size = "640x360", fov = 100, heading = 0, pitch = 5) =>
    `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&fov=${fov}&heading=${heading}&pitch=${pitch}&key=${GOOGLE_API_KEY}`,
  OVERPASS: [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.nchc.org.tw/api/interpreter",
  ],
  NOMINATIM: (q) => `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
};

// Curated famous battlegrounds: [name, sub-name, lat, lng]
export const LANDMARKS = [
  ["DEMON SQUARE",      "Times Square, NYC",            40.7580, -73.9855],
  ["HELL PENTAGON",     "The Pentagon, Washington DC",  38.8719, -77.0563],
  ["INFERNO TOWER",     "Eiffel Tower, Paris",          48.8584,   2.2945],
  ["BLOOD COLOSSEUM",   "Colosseum, Rome",              41.8902,  12.4922],
  ["HELLGATE BRIDGE",   "Golden Gate, San Francisco",   37.8199, -122.4783],
  ["DOOM BRIDGE",       "Tower Bridge, London",         51.5055,  -0.0754],
  ["SHIBUYA CROSSFIRE", "Shibuya Crossing, Tokyo",      35.6595, 139.7005],
  ["CRIMSON OPERA",     "Sydney Opera House",          -33.8568, 151.2153],
  ["ABYSS OBELISK",     "Washington Monument",          38.8895, -77.0353],
  ["GATE OF SOULS",     "Brandenburg Gate, Berlin",     52.5163,  13.3777],
  ["SIN CITY STRIP",    "Las Vegas Strip",              36.1147, -115.1728],
  ["UNHOLY BASILICA",   "Sagrada Familia, Barcelona",   41.4036,   2.1744],
];

export const RANDOM_SPOTS = [
  [48.8530, 2.3499],   // Paris centre
  [40.7128, -74.0060], // NYC
  [51.5074, -0.1278],  // London
  [35.6762, 139.6503], // Tokyo
  [41.9028, 12.4964],  // Rome
  [52.5200, 13.4050],  // Berlin
  [-33.8688, 151.2093],// Sydney
  [37.7749, -122.4194],// SF
  [41.3851, 2.1734],   // Barcelona
  [55.7558, 37.6173],  // Moscow
  [-23.5505, -46.6333],// Sao Paulo
  [19.4326, -99.1332], // Mexico City
  [28.6139, 77.2090],  // Delhi
  [39.9042, 116.4074], // Beijing
  [41.0082, 28.9784],  // Istanbul
  [43.6532, -79.3832], // Toronto
];

// ---------------- Gameplay constants ----------------
export const DOOM = {
  EYE_HEIGHT: 1.62,
  PLAYER_RADIUS: 0.55,
  MOVE_SPEED: 13.5,          // DOOM's run is ~16 u/s scaled
  STRAFE_SPEED: 12.0,
  TURN_SPEED: 3.1,           // rad/s for key turning
  MAX_HEALTH: 100,
  MAX_HEALTH_SOUL: 200,
  CELL: 4,                   // meters per grid cell
  WALL_H: 7,                 // default building wall height (meters)
  CHUNK: 24,                 // cells per chunk side
  MAX_ENEMIES_CHUNK: 22,
  PAIN_CHANCE: 0.55,
  GRAVITY_NUDGE: 0,
};

export const WEAPON_SLOTS = {
  1: "fist", 2: "pistol", 3: "shotgun", 4: "supershotgun",
  5: "chaingun", 6: "rocket", 7: "plasma",
};

// Palette — demonified DOOM-ish ramp
export const PAL = {
  stoneDark:  0x3a3230, stone: 0x574b45, stoneLite: 0x6f6156,
  brick:      0x5f2f24, brickDark: 0x40201a,
  tech:       0x3b4648, techDark: 0x283032,
  hellRock:   0x4a1e1e, hellRockDark: 0x2e1212,
  floorA:     0x35302b, floorB: 0x2a2622,
  road:       0x232322, roadLine: 0x8a7a3a,
  blood:      0x6e1010, bloodDark: 0x400808,
  lava:       0xff5a18, lava2: 0xffb020,
  grassBlood: 0x4a2418, park: 0x33402a,
  rune:       0xff3311,
};

// Sector light levels (0..1)
export const LIGHT = { min: 0.28, max: 1.0 };

// ---------------- Settings (persisted) ----------------
const SETTINGS_KEY = "doommaps_settings_v1";

export const DEFAULT_SETTINGS = {
  classicCamera: true,      // locked horizon
  autoaim: true,
  jump: false,
  gore: 3,                  // 0..3  (DOOM)
  renderMode: "classic",    // classic | modern
  headBob: true,
  screenFlash: true,
  musicVol: 0.55,
  sfxVol: 0.9,
  midiMusic: true,
  enemyDensity: 2,          // 1 low, 2 medium, 3 high, 4 ultra
  mapRadius: 260,           // meters
  realTextures: true,
  crosshair: false,
  hudScale: 2,
  hudMode: 0,               // 0 full 1 status 2 minimal
  mouseSens: 1.0,
  use3DTiles: false,        // attempt Google photorealistic tiles
  showStreetPosters: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// ---------------- Utility ----------------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

// lat/lng → local meters (equirectangular, fine for <1km)
export function latLngToMeters(lat, lng, lat0, lng0) {
  const R = 6378137;
  const x = (lng - lng0) * (Math.PI / 180) * R * Math.cos(lat0 * Math.PI / 180);
  const y = (lat - lat0) * (Math.PI / 180) * R;
  return { x, y };
}
export function metersToLatLng(x, y, lat0, lng0) {
  const R = 6378137;
  const lat = lat0 + (y / R) * (180 / Math.PI);
  const lng = lng0 + (x / (R * Math.cos(lat0 * Math.PI / 180))) * (180 / Math.PI);
  return { lat, lng };
}
