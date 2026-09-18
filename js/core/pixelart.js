// ============================================================
// DOOMMAPS — Pixel art painter: ASCII grids → canvases/textures
// All sprites, textures and the famous face are generated here.
// ============================================================
import * as THREE from "three";

/**
 * Paint a pixel-art frame from rows of characters.
 * @param {string[]} rows  equal-length strings
 * @param {Object} pal     char → css color ("." or " " = transparent)
 * @param {number} scale   pixel scale
 */
export function paint(rows, pal, scale = 1) {
  const h = rows.length;
  const w = Math.max(...rows.map(r => r.length));
  const cv = document.createElement("canvas");
  cv.width = w * scale; cv.height = h * scale;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === "." || c === " ") continue;
      const col = pal[c];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return cv;
}

/** Create a THREE texture from a canvas (pixelated). */
export function tex(cv, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Grunge-noise overlay on a canvas region. */
export function grunge(cv, colors, density = 0.24, seed = 1) {
  const ctx = cv.getContext("2d");
  let s = seed * 1103515245 + 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      if (rnd() < density) {
        ctx.fillStyle = colors[(rnd() * colors.length) | 0];
        ctx.globalAlpha = 0.25 + rnd() * 0.5;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
  return cv;
}

/** Draw into a blank pixel canvas with helper API. */
export function makeCanvas(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return cv;
}

// ---------------- Procedural wall / floor textures ----------------
// Authentic demonified masonry, each 64x64.

function wallBase(fn, seed) {
  const cv = makeCanvas(64, 64);
  const ctx = cv.getContext("2d");
  let s = seed || 7;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  fn(ctx, rnd);
  return cv;
}

export function genWallTexture(type) {
  const cv = wallBase((ctx, rnd) => {
    if (type === "stone" || type === "hellrock") {
      const base = type === "stone" ? ["#57504a", "#4a423d", "#635a50"] : ["#4a1e1c", "#3a1614", "#57221e"];
      ctx.fillStyle = base[1]; ctx.fillRect(0, 0, 64, 64);
      // rough block pattern
      for (let by = 0; by < 8; by++) {
        const off = (by % 2) * 8;
        for (let bx = -1; bx < 5; bx++) {
          const x = bx * 16 + off, y = by * 8;
          ctx.fillStyle = base[(rnd() * base.length) | 0];
          ctx.fillRect(x + 1, y + 1, 14, 6);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x + 1, y + 6, 14, 1);
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(x + 1, y + 1, 14, 1);
        }
      }
      if (type === "hellrock") {
        // cracks of magma
        for (let i = 0; i < 7; i++) {
          let x = rnd() * 64, y = rnd() * 64;
          ctx.fillStyle = rnd() < 0.5 ? "#ff4a12" : "#ff8c20";
          for (let j = 0; j < 6; j++) {
            ctx.fillRect(x | 0, y | 0, 1 + (rnd() * 2 | 0), 1);
            x += (rnd() - 0.5) * 6; y += rnd() * 4 - 1;
          }
        }
      }
    } else if (type === "brick") {
      ctx.fillStyle = "#3d1d16"; ctx.fillRect(0, 0, 64, 64);
      const rows = 8, bh = 8, bw = 16;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * (bw / 2);
        for (let c = -1; c < 5; c++) {
          const shade = 0.75 + rnd() * 0.45;
          const rr = Math.min(255, 95 * shade), gg = Math.min(255, 48 * shade), bb = Math.min(255, 36 * shade);
          ctx.fillStyle = `rgb(${rr|0},${gg|0},${bb|0})`;
          ctx.fillRect(c * bw + off, r * bh, bw - 2, bh - 2);
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(c * bw + off, r * bh + bh - 3, bw - 2, 1);
        }
      }
    } else if (type === "tech") {
      ctx.fillStyle = "#2c3438"; ctx.fillRect(0, 0, 64, 64);
      // panels
      for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
        const x = px * 16, y = py * 16;
        const l = 0.8 + rnd() * 0.4;
        ctx.fillStyle = `rgb(${52*l|0},${62*l|0},${66*l|0})`;
        ctx.fillRect(x + 1, y + 1, 14, 14);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(x + 1, y + 13, 14, 2);
        ctx.fillRect(x + 13, y + 1, 2, 14);
        ctx.fillStyle = "rgba(180,220,255,0.10)";
        ctx.fillRect(x + 1, y + 1, 14, 1);
        // rivets
        ctx.fillStyle = "#1a2226";
        ctx.fillRect(x + 2, y + 2, 1, 1); ctx.fillRect(x + 12, y + 2, 1, 1);
        ctx.fillRect(x + 2, y + 12, 1, 1); ctx.fillRect(x + 12, y + 12, 1, 1);
      }
      // warning stripes / lights
      for (let i = 0; i < 3; i++) {
        const x = (rnd() * 56) | 0, y = (rnd() * 56) | 0;
        ctx.fillStyle = rnd() < 0.5 ? "#c8102a" : "#e8a020";
        ctx.fillRect(x, y, 6, 2);
      }
      // glowing vent slits
      ctx.fillStyle = "#ff5a18";
      ctx.fillRect(8, 52, 12, 1); ctx.fillRect(40, 24, 12, 1);
    } else if (type === "guts") {
      // demonic flesh wall
      ctx.fillStyle = "#4a1010"; ctx.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 60; i++) {
        const x = rnd() * 64, y = rnd() * 64, r = 2 + rnd() * 5;
        ctx.fillStyle = ["#5c1818", "#6e2020", "#3a0c0c", "#7a2820"][(rnd() * 4) | 0];
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 7); ctx.fill();
      }
      ctx.fillStyle = "#8c4030";
      for (let i = 0; i < 12; i++) {
        let x = rnd() * 64, y = rnd() * 64;
        for (let j = 0; j < 5; j++) { ctx.fillRect(x, y, 2, 1); x += (rnd() - .5) * 8; y += rnd() * 3; }
      }
    }
    // grime
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1 + (Math.random() * 2 | 0), 1);
    }
  });
  return cv;
}

export function genFloorTexture(type) {
  const cv = makeCanvas(64, 64);
  const ctx = cv.getContext("2d");
  if (type === "road") {
    ctx.fillStyle = "#232324"; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 200; i++) {
      const g = 26 + Math.random() * 26;
      ctx.fillStyle = `rgb(${g|0},${g|0},${g|0})`;
      ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1 + (Math.random() * 2 | 0), 1 + (Math.random() * 2 | 0));
    }
    // cracks
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      let x = Math.random() * 64, y = Math.random() * 64;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) { x += (Math.random() - .5) * 20; y += Math.random() * 14; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  } else if (type === "tiles") {
    ctx.fillStyle = "#2c2925"; ctx.fillRect(0, 0, 64, 64);
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
      const l = 0.85 + Math.random() * 0.3;
      ctx.fillStyle = `rgb(${52*l|0},${47*l|0},${42*l|0})`;
      ctx.fillRect(tx * 16 + 1, ty * 16 + 1, 14, 14);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(tx * 16 + 1, ty * 16 + 14, 14, 1);
      ctx.fillRect(tx * 16 + 14, ty * 16 + 1, 1, 14);
    }
  } else if (type === "blood") {
    ctx.fillStyle = "#4a140c"; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 64, y = Math.random() * 64, r = 2 + Math.random() * 8;
      ctx.fillStyle = ["#5c0c0c", "#6e1010", "#3a0808"][(Math.random() * 3) | 0];
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, Math.random() * 3, 0, 7); ctx.fill();
    }
  } else if (type === "park") {
    ctx.fillStyle = "#2e3820"; ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      const g = 40 + Math.random() * 40;
      ctx.fillStyle = `rgb(${(g * 0.8)|0},${g|0},${(g * 0.42)|0})`;
      ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1, 2);
    }
    // scorched patches
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = "rgba(20,10,8,0.55)";
      ctx.beginPath(); ctx.ellipse(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 6, 2 + Math.random() * 4, Math.random() * 3, 0, 7); ctx.fill();
    }
  }
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect((Math.random() * 64) | 0, (Math.random() * 64) | 0, 1 + (Math.random() * 2 | 0), 1);
  }
  return cv;
}

/** Lava / slime animated texture — returns canvases for 4 frames. */
export function genLavaFrames() {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const cv = makeCanvas(64, 64);
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#8c1a04"; ctx.fillRect(0, 0, 64, 64);
    let s = (f + 3) * 99991;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 46; i++) {
      const x = rnd() * 64, y = rnd() * 64, r = 2 + rnd() * 7;
      ctx.fillStyle = ["#e84b18", "#ff7a1c", "#ffb020", "#c22c04"][(rnd() * 4) | 0];
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, 7); ctx.fill();
    }
    for (let i = 0; i < 10; i++) {
      const x = rnd() * 64, y = rnd() * 64;
      ctx.fillStyle = "#ffe86a";
      ctx.beginPath(); ctx.ellipse(x, y, 1.5 + rnd() * 2, 1 + rnd(), 0, 0, 7); ctx.fill();
    }
    frames.push(cv);
  }
  return frames;
}

/** Glitchy "HELL" poster / billboard used when Street View is unavailable. */
export function genHellPoster(lines = ["YOU ARE", "HERE"], hue = 0) {
  const cv = makeCanvas(128, 64);
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#0e0806"; ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = "#5a2a14"; ctx.strokeRect(1, 1, 126, 62);
  ctx.strokeStyle = "#2a120a"; ctx.strokeRect(3, 3, 122, 58);
  ctx.font = "bold 20px monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = hue === 1 ? "#7ae84b" : "#ff3a12";
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
  lines.forEach((ln, i) => ctx.fillText(ln, 64, 22 + i * 22));
  ctx.shadowBlur = 0;
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect((Math.random() * 128) | 0, (Math.random() * 64) | 0, 2, 1);
  }
  return cv;
}

/** Compose several canvases at offsets into one canvas. */
export function compose(w, h, layers) {
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext("2d");
  for (const [src, x, y] of layers) ctx.drawImage(src, x || 0, y || 0);
  return cv;
}

/** Flip a canvas horizontally (for mirrored sprite frames). */
export function flipX(cv) {
  const out = makeCanvas(cv.width, cv.height);
  const ctx = out.getContext("2d");
  ctx.translate(cv.width, 0); ctx.scale(-1, 1);
  ctx.drawImage(cv, 0, 0);
  return out;
}
