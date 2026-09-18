// Minimal software 2D canvas (subset used by the game's painters) → PNG
import zlib from "node:zlib";

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
export function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4);
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// color parse: #rgb? (no), #rrggbb, rgb(), rgba(), named few
function parseColor(c) {
  if (!c) return [0, 0, 0, 255];
  if (typeof c === "object") {
    if (c.stops && c.stops.length) return c.stops[Math.min(1, c.stops.length - 1)][1];
    return [128, 128, 128, 255];
  }
  if (c.startsWith("#")) {
    const n = parseInt(c.slice(1), 16);
    if (c.length === 9) return [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(",").map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? Math.round(p[3] * 255) : 255];
  }
  const named = { white: [255,255,255,255], black: [0,0,0,255], red: [255,0,0,255], transparent: [0,0,0,0] };
  return named[c] || [0, 0, 0, 255];
}

export class RealCanvas {
  constructor(w, h) {
    this._w = w; this._h = h;
    this.data = Buffer.alloc(w * h * 4);
  }
  get width() { return this._w; }
  set width(v) { this._w = v; this.data = Buffer.alloc(v * this._h * 4); }
  get height() { return this._h; }
  set height(v) { this._h = v; this.data = Buffer.alloc(this._w * v * 4); }
  getContext() { return new RealCtx(this); }
  toBuffer() { return encodePNG(this._w, this._h, this.data); }
}

export class RealCtx {
  constructor(cv) {
    this.canvas = cv;
    this._stack = [];
    this.fillStyle = "#000";
    this.strokeStyle = "#000";
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
  }
  _px(x, y, [r, g, b, a]) {
    const { width, height, data } = this.canvas;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    a = Math.min(255, a * this.globalAlpha) / 255;
    const i = (y * width + x) * 4;
    if (this.globalCompositeOperation === "source-atop") {
      if (data[i + 3] === 0) return;
    }
    data[i] = data[i] * (1 - a) + r * a;
    data[i + 1] = data[i + 1] * (1 - a) + g * a;
    data[i + 2] = data[i + 2] * (1 - a) + b * a;
    data[i + 3] = Math.min(255, data[i + 3] + a * 255);
  }
  fillRect(x, y, w, h) {
    RealCtx.__dbg = (RealCtx.__dbg || 0) + 1;
    globalThis.__dbgLast = [x, y, w, h, this.fillStyle];
    const c = parseColor(this.fillStyle);
    if (this.globalCompositeOperation === "source-atop") {
      // apply as overlay over existing opaque pixels
      for (let yy = y | 0; yy < y + h; yy++) for (let xx = x | 0; xx < x + w; xx++) this._px(xx, yy, c);
      return;
    }
    if (c[3] === 255 && this.globalAlpha === 1) {
      const d = this.canvas.data, W = this.canvas.width;
      for (let yy = Math.max(0, y | 0); yy < Math.min(this.canvas.height, y + h); yy++)
        for (let xx = Math.max(0, x | 0); xx < Math.min(W, x + w); xx++) {
          const i = (yy * W + xx) * 4;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
      return;
    }
    for (let yy = y | 0; yy < y + h; yy++) for (let xx = x | 0; xx < x + w; xx++) this._px(xx, yy, c);
  }
  strokeRect(x, y, w, h) {
    // approximate with thin rects
    const save = this.fillStyle;
    this.fillStyle = this.strokeStyle;
    const lw = this.lineWidth;
    this.fillRect(x, y, w, lw); this.fillRect(x, y + h - lw, w, lw);
    this.fillRect(x, y, lw, h); this.fillRect(x + w - lw, y, lw, h);
    this.fillStyle = save;
  }
  beginPath() { this._path = []; }
  moveTo(x, y) { this._path.push(["M", x, y]); }
  lineTo(x, y) { this._path.push(["L", x, y]); }
  ellipse(cx, cy, rx, ry, rot, s, e) { this._path.push(["E", cx, cy, rx, ry]); }
  arc(cx, cy, r) { this._path.push(["E", cx, cy, r, r]); }
  fill() {
    const c = parseColor(this.fillStyle);
    for (const seg of this._path) {
      if (seg[0] === "E") {
        const [, cx, cy, rx, ry] = seg;
        for (let y = (cy - ry) | 0; y <= cy + ry; y++) {
          for (let x = (cx - rx) | 0; x <= cx + rx; x++) {
            const dx = (x - cx) / (rx || 1), dy = (y - cy) / (ry || 1);
            if (dx * dx + dy * dy <= 1) this._px(x, y, c);
          }
        }
      }
    }
  }
  stroke() {
    const c = parseColor(this.strokeStyle);
    let cur = null;
    for (const seg of this._path) {
      if (seg[0] === "M") cur = [seg[1], seg[2]];
      else if (seg[0] === "L" && cur) {
        const [x1, y1] = cur, x2 = seg[1], y2 = seg[2];
        const len = Math.hypot(x2 - x1, y2 - y1) | 0;
        for (let i = 0; i <= len; i++) {
          const t = len ? i / len : 0;
          this._px(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, c);
        }
        cur = [x2, y2];
      }
    }
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return {
      stops: [],
      addColorStop(off, col) { this.stops.push([off, parseColor(col)]); },
    };
  }
  createLinearGradient() { return { stops: [], addColorStop(off, col) { this.stops.push([off, parseColor(col)]); } }; }
  measureText(t) { return { width: String(t).length * 8 }; }
  fillText() {} // text is only used for posters/signs (cosmetic in tests)
  strokeText() {}
  drawImage(src, dx, dy, dw, dh) {
    const sw = src.width, sh = src.height;
    dw = dw || sw; dh = dh || sh;
    const sd = src.data || (src.canvas && src.canvas.data);
    if (!sd) return;
    const srcW = sw;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx2 = Math.min(sw - 1, (x / dw * sw) | 0);
        const sy2 = Math.min(sh - 1, (y / dh * sh) | 0);
        const si = (Math.floor(sy2) * srcW + Math.floor(sx2)) * 4;
        if (sd[si + 3] === 0) continue;
        this._px(dx + x, dy + y, [sd[si], sd[si + 1], sd[si + 2], sd[si + 3]]);
      }
    }
  }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const si = ((y + yy) * this.canvas.width + (x + xx)) * 4;
      const di = (yy * w + xx) * 4;
      out[di] = this.canvas.data[si]; out[di + 1] = this.canvas.data[si + 1];
      out[di + 2] = this.canvas.data[si + 2]; out[di + 3] = this.canvas.data[si + 3];
    }
    return { data: out, width: w, height: h };
  }
  save() { this._stack.push([this.fillStyle, this.globalAlpha, this.globalCompositeOperation]); }
  restore() { const s = this._stack.pop(); if (s) [this.fillStyle, this.globalAlpha, this.globalCompositeOperation] = s; }
  translate() {} rotate() {} scale() {} // painters don't rely on transform persistence beyond save/restore blocks
}

// install into the test environment
export function installRealCanvas() {
  globalThis.document.createElement = (tag) => {
    if (tag !== "canvas") return { style: {}, classList: { add() {} } };
    return new RealCanvas(64, 64); // painters re-set width/height
  };
  globalThis.Image = class { set src(v) {} };
}
