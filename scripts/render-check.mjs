// ASCII "render" of the procedural planet generators — lets us eyeball
// continent shapes / gas bands without a real canvas implementation.
const noop = () => {};
function makeCtx(canvas) {
  const gradient = { addColorStop: noop };
  return {
    canvas,
    fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1,
    font: "", textAlign: "", textBaseline: "", shadowColor: "", shadowBlur: 0,
    imageSmoothingEnabled: true, imageSmoothingQuality: "medium", lineWidth: 1,
    fillRect: noop, clearRect: noop, drawImage: noop, beginPath: noop, arc: noop,
    fill: noop, stroke: noop, moveTo: noop, lineTo: noop, closePath: noop, fillText: noop,
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: (t) => ({ width: (t || "").length * 8 }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { canvas._lastImage = img; },
  };
}
globalThis.document = {
  createElement: (tag) => {
    const c = { tagName: tag, width: 0, height: 0, style: {} };
    c.getContext = () => makeCtx(c);
    return c;
  },
  documentElement: { classList: { toggle: noop, contains: () => false } },
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop, key: () => null, length: 0 };
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

const { makeEarthTextures, makeGasTexture, makePlanetTexture, makeMoonTexture } =
  await import("../src/three-utils/assets.js");

function asciiMap(data, w, h, cols = 78, rows = 26) {
  const chars = " .:-=+*#%@";
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.floor((c / cols) * w), y = Math.floor((r / rows) * h);
      const i = (y * w + x) * 4;
      const lum = (data[i] * 0.3 + data[i + 1] * 0.5 + data[i + 2] * 0.2) / 255;
      out += chars[Math.min(9, Math.floor(lum * 10))];
    }
    out += "\n";
  }
  return out;
}

console.log("=== EARTH (day) 128px boot texture — # land, ~ ice, . ocean ===");
const e = makeEarthTextures(128);
{
  const d = e.day.image._lastImage.data;
  const w = 128, h = 128;
  const cols = 78, rows = 26;
  let out = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.floor((c / cols) * w), y = Math.floor((r / rows) * h);
      const i = (y * w + x) * 4;
      const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
      const ice = R > 200 && G > 210 && B > 220;
      const land = !ice && G >= R && G > 60;
      out += ice ? "~" : land ? "#" : ".";
    }
    out += "\n";
  }
  console.log(out);
}

console.log("=== MARS 128px ===");
const mars = makePlanetTexture({ id: "mars", color: "#c25b2e", accent: "#a2451f" }, 128, { continents: true });
console.log(asciiMap(mars.image._lastImage.data, 128, 128));

console.log("=== JUPITER bands 512x256 ===");
const jup = makeGasTexture({ id: "jupiter", bands: ["#c8a98a", "#efe0d0", "#a5714f", "#e4c6a8"], spot: true }, 512);
console.log(asciiMap(jup.image._lastImage.data, 512, 256));

console.log("=== MOON 256px (canvas-drawn: shape check only) ===");
const moon = makeMoonTexture({ id: "moon", color: "#9c9c9c" }, 256, true);
console.log("moon texture generated:", !!moon && moon.image.width === 256);
const moon2 = makeMoonTexture({ id: "moon", color: "#9c9c9c" }, 256, true);
console.log("moon is deterministic (same canvas size):", moon2.image.width === moon.image.width);
