// Procedural texture generation. All art is generated on a small 2D canvas —
// no image downloads, fast on GitHub Pages, tiny footprint.
import * as THREE from "three";
import { FONT_MONO } from "../game/config.js";

const TAU = Math.PI * 2;

function makeCanvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  return { c, ctx };
}

// Deterministic hash in [0,1)
export function hash01(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

function speckle(ctx, s, base, count, amt, alpha = 1, rnd = Math.random) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const x = rnd() * s, y = rnd() * s;
    const r = 0.3 + rnd() * 1.8;
    ctx.fillStyle = rnd() < 0.5 ? shade(base, amt) : shade(base, -amt);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Gaussian-ish blur by drawing the image scaled down and up several times.
function blurPass(ctx, c, size, amount) {
  for (let i = 0; i < amount; i++) {
    const small = Math.max(4, size / 4);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(c, 0, 0, size, size, size / 2 - small / 2, size / 2 - small / 2, small, small);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(c, 0, 0, small, small, 0, 0, size, size);
  }
}

function toTexture(c, size) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/* ---------------- planet surface (equirectangular) ---------------- */

// Stable 32-bit seed from a string (body id) — every body generates the same
// world every session, and its low-res boot texture matches its high-res
// upgrade because the noise grid is seeded identically.
export function seedFromString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Value-noise helper on the unit square. Coordinates are UV (0..1), NOT
// pixels, so the pattern is identical at any texture resolution — a 128px
// boot texture and its 512px upgrade show the same continents. X wraps for a
// seamless equirect texture.
function valueNoise2(cells, rng) {
  const n = Math.max(2, cells | 0);
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (u, v) => {
    const fx = u * n, fy = v * n;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = (x0 + 1) % n, y1 = Math.min(y0 + 1, n - 1);
    x0 = ((x0 % n) + n) % n;
    y0 = Math.min(y0, n - 1);
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v00 = g[x0 + y0 * n], v10 = g[x1 + y0 * n];
    const v01 = g[x0 + Math.min(y1, n - 1) * n], v11 = g[x1 + Math.min(y1, n - 1) * n];
    const a = v00 + (v10 - v00) * sx, b = v01 + (v11 - v01) * sx;
    return a + (b - a) * sy;
  };
}

// Fractal noise sampled in UV space. Integer lacunarity keeps every octave
// seamless across the u=0/u=1 wrap.
function fbm2(octaves, seed, baseCells = 6) {
  const base = valueNoise2(baseCells, mulberry(seed));
  return (u, v) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += base(u * freq, v * freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };
}

// Generic rocky / colored surface: continents + fine speckle.
export function makePlanetTexture(def, size = 512, opts = {}) {
  const { c, ctx } = makeCanvas(size);
  const base = def.color || "#888";
  const accent = def.accent || shade(base, -30);
  const fbm = fbm2(4, seedFromString(def.id || "planet"));
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const hasContinents = opts.continents && base !== accent;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size);
      let t = 0;
      if (hasContinents) {
        t = Math.sin((n - 0.5) * Math.PI) * 0.5 + 0.5; // island mask
        t = Math.pow(Math.max(0, Math.min(1, t * 1.9 - 0.45)), 1.4);
      }
      const mixC = hasContinents
        ? lerpColor(base, accent, t)
        : lerpColor(base, accent, n * 0.6);
      const jitter = (hash01(n * 1000) - 0.5) * 0.22;
      const r = Math.max(0, Math.min(255, mixC[0] * (1 + jitter)));
      const g = Math.max(0, Math.min(255, mixC[1] * (1 + jitter)));
      const b = Math.max(0, Math.min(255, mixC[2] * (1 + jitter)));
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, size);
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, ((n >> 8) & 255) & 255, n & 255];
}

// Earth look: blue oceans + green/brown continents. Uses per-pixel noise
// so the cloud and night-light maps line up with the land pattern.
export function makeEarthTextures(size = 512) {
  const mk = (mode) => {
    const { c, ctx } = makeCanvas(size);
    const fbm = fbm2(4, seedFromString("earth"));
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const oceanDeep = [8, 30, 78];
    const oceanShallow = [34, 118, 180];
    const grass = [66, 128, 62];
    const land = [128, 106, 70];
    const sand = [184, 162, 122];
    const ice = [238, 246, 252];
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        const n = fbm(u, v);
        // continental mask
        let landF = Math.sin((n - 0.5) * Math.PI) * 0.5 + 0.5;
        landF = Math.pow(Math.max(0, Math.min(1, landF * 2.0 - 0.5)), 1.3);
        const lat = Math.abs(v - 0.5) * 2; // 0 equator, 1 pole
        const jitter = (hash01(n * 1000 + u) - 0.5) * 0.1;
        let r, g, b;
        if (mode === "day") {
          let c3;
          if (landF > 0.06) {
            const wet = Math.min(1, Math.max(0, landF - 0.06) * 6); // coastline is moist
            let base = mix3(grass, land, Math.max(0, lat * 1.6 - 0.55));
            base = mix3(base, sand, wet * 0.35 + Math.max(0, landF - 0.75) * 0.5);
            // latitude: poles ice up
            const poleIce = Math.max(0, lat - 0.78) / 0.22;
            const mountainIce = Math.max(0, landF - 0.86) * 4;
            base = mix3(base, ice, Math.min(1, poleIce * 0.9 + mountainIce));
            c3 = base;
          } else {
            const depth = Math.min(1, Math.abs(landF - 0.06) * 3.2);
            c3 = mix3(oceanShallow, oceanDeep, depth);
            const poleIce = Math.max(0, lat - 0.82) / 0.18;
            c3 = mix3(c3, ice, Math.min(1, poleIce));
          }
          r = c3[0] * (1 + jitter); g = c3[1] * (1 + jitter); b = c3[2] * (1 + jitter);
        } else if (mode === "night") {
          // city lights on land, sparser toward poles and inland. The light
          // grid is in UV units so it survives resolution upgrades.
          const grid = hash01(Math.floor(u * 128) * 73856093 ^ Math.floor(v * 64) * 19349663);
          let light = 0;
          if (landF > 0.14 && grid > 0.986 - landF * 0.012 && lat < 0.72 && hash01(u * 1300 + v * 700) > 0.2) {
            light = 0.55 + grid * 0.45;
          }
          r = light * 255; g = light * 230; b = light * 140;
        } else {
          // elevation map
          r = g = b = Math.round(landF * 255);
        }
        const i = (y * size + x) * 4;
        d[i] = Math.max(0, Math.min(255, r));
        d[i + 1] = Math.max(0, Math.min(255, g));
        d[i + 2] = Math.max(0, Math.min(255, b));
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (mode === "night") {
      // bloom the lights a bit
      blurPass(ctx, c, size, 1);
    }
    return toTexture(c, size);
  };
  return {
    day: mk("day"),
    night: mk("night"),
    elev: mk("elev"),
  };
}

export function makeCloudTexture(size = 256, amount = 0.55) {
  const { c, ctx } = makeCanvas(size);
  const fbm = fbm2(4, seedFromString("earth-clouds"));
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size);
      const swirl = 0.5 + 0.5 * Math.sin((x / size) * 6 + n * 5);
      let v = Math.max(0, n * 1.5 - 0.55) * swirl * 2.2 * amount;
      v = Math.min(1, v);
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = Math.round(v * 255);
      d[i + 3] = Math.round(v * 200);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Banded gas-giant look with optional storm spot.
export function makeGasTexture(def, size = 1024) {
  const { c, ctx } = makeCanvas(size);
  const w = size, h = Math.floor(size / 2);
  const fbm = fbm2(3, seedFromString(def.id || "gas"));
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const bandColors = def.bands || [def.color, def.accent, shade(def.color, 25), shade(def.accent, -25)];
  const hasSpot = !!def.spot && def.id !== "uranus";
  const spotX = def.id === "jupiter" ? 0.28 : 0.5 + hash01(5) * 0.3;
  const spotY = def.id === "jupiter" ? 0.62 : 0.3 + hash01(9) * 0.4;
  const spotR = def.id === "jupiter" ? 0.085 : 0.05;
  // band frequency is in UV units so the stripe count is identical at every
  // texture resolution
  const BAND_FREQ = Math.PI * 2 * 10;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const n1 = fbm(u, v);
      const n2 = fbm(u + 0.33, v + 0.87);
      const band = Math.sin(v * BAND_FREQ * (1 + n1 * 0.3) + n2 * 2.2) * 0.5 + 0.5;
      const bandIdx = Math.floor(band * bandColors.length) % bandColors.length;
      let col = hexToRgb(bandColors[bandIdx]);
      col = [
        col[0] + (n1 - 0.5) * 42,
        col[1] + (n1 - 0.5) * 42,
        col[2] + (n1 - 0.5) * 42,
      ];
      if (hasSpot) {
        const dx = (u - spotX) / spotR, dy = (v - spotY) / spotR;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) {
          // storm interior: swirl + warm core
          const swirl = 0.5 + 0.5 * Math.sin(dist * 40 - u * 18 + n2 * 8);
          const inner = dist < 0.55 ? [170 + n1 * 30, 96 + n1 * 20, 70] : [205 + n1 * 20, 150, 110];
          const mixT = 0.35 + 0.65 * (dist * dist);
          col = [
            inner[0] * (1 - mixT) + (swirl * 200 + 55) * mixT,
            inner[1] * (1 - mixT) + (swirl * 160 + 50) * mixT,
            inner[2] * (1 - mixT) + (swirl * 130 + 40) * mixT,
          ];
          // soften outer rim so it blends
          if (dist > 0.88) {
            const rim = 1 - (dist - 0.88) / 0.12;
            col = [col[0] * rim + 205 * (1 - rim), col[1] * rim + 150 * (1 - rim), col[2] * rim + 110 * (1 - rim)];
          }
        }
      }
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, col[0]));
      d[i + 1] = Math.max(0, Math.min(255, col[1]));
      d[i + 2] = Math.max(0, Math.min(255, col[2]));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // pole darkening
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.18, "rgba(0,0,0,0.12)");
  grad.addColorStop(0.5, "rgba(0,0,0,0)");
  grad.addColorStop(0.82, "rgba(0,0,0,0.12)");
  grad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  return toTexture(c, w);
}

/* ---------------- moons / rocky moons ---------------- */

// Speckled sphere texture + (optionally) crater dimples via normal-ish shading.
// Everything is drawn from a per-body seeded RNG so a moon looks the same
// every session and at every texture size.
export function makeMoonTexture(def, size = 512, craters = false) {
  const { c, ctx } = makeCanvas(size);
  const base = def.color || "#aaa";
  const rnd = mulberry(seedFromString(def.id || "moon"));
  const h = Math.floor(size / 2);
  ctx.fillStyle = shade(base, -18);
  ctx.fillRect(0, 0, size, h);
  speckle(ctx, size, base, 5000, 34, 0.9, rnd);
  if (craters || def.craters) {
    const count = 60 + Math.floor(size / 6);
    for (let i = 0; i < count; i++) {
      const x = rnd() * size, y = rnd() * h;
      const r = 1 + Math.pow(rnd(), 2.2) * size * 0.045;
      ctx.fillStyle = shade(base, -46);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = shade(base, -70);
      ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = shade(base, 30);
      ctx.beginPath();
      ctx.arc(x + r * 0.2, y + r * 0.2, r * 0.7, Math.PI * 0.7, Math.PI * 1.7);
      ctx.fill();
    }
  }
  speckle(ctx, size, base, 900, -55, 0.6, rnd);
  return toTexture(c, size);
}

/* ---------------- sun ---------------- */

export function makeSunTexture(size = 512) {
  const { c, ctx } = makeCanvas(size);
  const h = Math.floor(size / 2);
  const fbm = fbm2(5, seedFromString("sun"));
  const img = ctx.createImageData(size, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const n = fbm(u, y / h);
      const gran = n * 1.6 - 0.3;
      const flare = 0.5 + 0.5 * Math.sin(u * 176 + n * 20);
      let r = 240 + gran * 60 + flare * 15;
      let g = 150 + gran * 70 + flare * 30;
      let b = 40 + gran * 40;
      r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Soft radial glow sprite used for sun/moon halos and station beacons.
export function makeGlowTexture(inner = "rgba(255,220,150,1)", outer = "rgba(255,120,30,0)") {
  const size = 128;
  const { c, ctx } = makeCanvas(size);
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, inner.replace(/1\)$/, "0.55)"));
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeStarTexture() {
  const size = 32;
  const { c, ctx } = makeCanvas(size);
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// Ring texture (banded alpha strip).
export function makeRingTexture(colors, size = 512) {
  const w = size, h = 4;
  const { c, ctx } = makeCanvas(w);
  ctx.clearRect(0, 0, w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const band = Math.sin(u * 90) * 0.5 + 0.5;
      let r = 190, g = 176, b = 150, a = 235;
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Wraps a canvas so poles (top/bottom of an equirect image) can also tile.
export function textureFromCanvas(c, srgb = true) {
  return toTexture(c, c.width);
}

export function makeTextureCache() {
  return new Map();
}

export function disposeTexture(tex) {
  if (tex && tex.isTexture) tex.dispose();
}

export function disposeMaterial(mat) {
  if (!mat) return;
  const list = Array.isArray(mat) ? mat : [mat];
  for (const m of list) {
    if (m) {
      for (const k of ["map", "nightMap", "cloudMap", "elevMap", "alphaMap", "emissiveMap", "specularMap", "bumpMap"]) {
        if (m[k]) m[k].dispose();
      }
      m.dispose();
    }
  }
}

/* ---------------- 2D world-map for codex ---------------- */

export function makeWorldMapTexture(def, size = 192) {
  const { c, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const fbm = fbm2(3, seedFromString((def.id || "world") + "-map"));
  const base = hexToRgb(def.color || "#aaa");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x / size, y / size);
      const t = Math.sin((n - 0.5) * Math.PI) * 0.5 + 0.5;
      const v = Math.max(0.35, Math.min(1, t * 0.9 + 0.25));
      const i = (y * size + x) * 4;
      d[i] = base[0] * v; d[i + 1] = base[1] * v; d[i + 2] = base[2] * v; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, size);
}

/* ---------------- landing surface tiles ---------------- */

// A tile painted with dark terrain + craters/rocks + a landing marker zone.
export function makeGroundTile(baseColor, palette, seed) {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const rnd = mulberry(seed);
  // base fill with vertical-ish noise banding so tiles vary smoothly
  const grad = ctx.createLinearGradient(0, 0, size, size);
  const dark = shade(baseColor, -90), light = shade(baseColor, 30);
  grad.addColorStop(0, dark);
  grad.addColorStop(0.5, light);
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  // large blotches (low-frequency detail)
  for (let i = 0; i < 26; i++) {
    const x = rnd() * size, y = rnd() * size, r = 20 + rnd() * 110;
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
    g2.addColorStop(0, shade(baseColor, rnd() * 60 - 30));
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // craters
  const craterCount = 6 + Math.floor(rnd() * 8);
  for (let i = 0; i < craterCount; i++) {
    const x = 40 + rnd() * (size - 80), y = 40 + rnd() * (size - 80);
    const r = 8 + rnd() * 34;
    ctx.fillStyle = shade(baseColor, -90);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = shade(baseColor, -50);
    ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(baseColor, 26);
    ctx.lineWidth = 3 + rnd() * 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  // rocks + speckle
  speckle(ctx, size, baseColor, 1400, -60, 0.8, rnd);
  for (let i = 0; i < 40; i++) {
    const x = rnd() * size, y = rnd() * size, s = 2 + rnd() * 7;
    ctx.fillStyle = shade(palette[Math.floor(rnd() * palette.length)], -40);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * (1 + rnd()), y + rnd() * s);
    ctx.lineTo(x - rnd() * s, y + s * 1.3);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Label sprite (canvas text) for stations — rendered in a sprite so it
// always faces the camera.
export function makeLabelSprite(text, color = "#cfe6ff", scale = 8) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const pad = 16;
  ctx.font = `700 ${34}px ${FONT_MONO}`;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = 54;
  c.width = w; c.height = h;
  const ctx2 = c.getContext("2d");
  ctx2.font = `700 34px ${FONT_MONO}`;
  ctx2.textAlign = "center";
  ctx2.textBaseline = "middle";
  ctx2.shadowColor = "rgba(0,0,0,0.9)";
  ctx2.shadowBlur = 14;
  ctx2.fillStyle = color;
  ctx2.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, fog: false,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = c.width / c.height;
  sprite.scale.set(aspect * scale, scale, 1);
  sprite.center.set(0.5, 0.5);
  return sprite;
}
