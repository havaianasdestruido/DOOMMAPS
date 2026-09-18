import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./loader.mjs", import.meta.url), pathToFileURL("./"));

// --- DOM/canvas stubs for headless canvas painting ---
function makeCtx2D() {
  const gradient = { addColorStop() {} };
  return new Proxy({
    canvas: null,
    measureText: () => ({ width: 12 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeCanvas() {
  const cv = {
    width: 300, height: 150,
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    parentElement: { addEventListener() {} },
    requestPointerLock: () => Promise.resolve(),
    getContext: () => makeCtx2D(),
    toDataURL: () => "data:image/png;base64,",
    addEventListener() {}, removeEventListener() {},
  };
  return cv;
}

globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(16), 0);
globalThis.performance = globalThis.performance || { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.document = {
  createElement: (tag) => tag === "canvas" ? makeCanvas() : { style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild() {}, setAttribute() {}, getContext: () => makeCtx2D() },
  createElementNS: () => ({ style: {} }),
  getElementById: () => makeCanvas(),
  querySelector: () => null,
  addEventListener() {},
};
globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
