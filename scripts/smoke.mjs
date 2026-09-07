// Smoke test for the boot pipeline. Runs the real game modules
// (SolarSystem, PlanetFactory, Starfield, AsteroidField, Effects, assets)
// under Node with minimal DOM/canvas stubs — no browser needed.
//
//   node scripts/smoke.mjs
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
    const c = { tagName: tag, width: 0, height: 0, style: {}, getContext: () => makeCtx(c) };
    return c;
  },
  documentElement: { classList: { toggle: noop, contains: () => false } },
};
globalThis.localStorage = {
  _s: {},
  getItem(k) { return this._s[k] ?? null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
  get length() { return Object.keys(this._s).length; },
  key(i) { return Object.keys(this._s)[i] ?? null; },
};
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.error("  ✗ FAIL: " + name); }
}

const { SolarSystem } = await import("../src/game/SolarSystem.js");
const { PlanetFactory } = await import("../src/three-utils/PlanetFactory.js");
const { Starfield } = await import("../src/three-utils/Starfield.js");
const { AsteroidField } = await import("../src/game/AsteroidField.js");
const { Effects } = await import("../src/world/Effects.js");
const { PLANET_DEFS, KNOWN_BODIES } = await import("../src/game/bodyData.js");
const { makeEarthTextures } = await import("../src/three-utils/assets.js");
const THREE = await import("three");

const settings = {
  quality: "medium", planetQuality: "medium", shadows: true, bloom: true,
  stars: "medium", particles: true, phone: false,
};
const discovery = {
  known: new Set(KNOWN_BODIES),
  isKnown(id) { return this.known.has(id); },
};

console.log("— staged solar system build —");
const scene = new THREE.Scene();
const solar = new SolarSystem(scene, settings, discovery);
const stages = [];
await solar.build((label) => stages.push(label));
check("build yields between stages (>= 5)", stages.length >= 5);
console.log("    stages:", stages.join(" | "));
check("19 bodies built", solar.bodies.size === 19);
const earth = solar.bodies.get("earth");
const jupiter = solar.bodies.get("jupiter");
const moon = solar.bodies.get("moon");
const phobos = solar.bodies.get("phobos");
check("earth has a surface texture at boot", !!earth.mesh.material.map);
check("earth has cloud + night layers", !!earth.extras.clouds && !!earth.extras.night);
check("moon (known) has a texture", !!moon.mesh.material.map);
check("jupiter (unknown) is a deferred placeholder", jupiter.deferredTexture && !jupiter.mesh.material.map);
check("phobos (unknown moon) is a deferred placeholder", phobos.deferredTexture && !phobos.mesh.material.map);
check("unknown bodies hidden, known visible",
  jupiter.group.visible === false && earth.group.visible === true);

console.log("— lazy detailing on discovery —");
solar.reveal("jupiter");
check("revealed jupiter got a boot texture immediately", !jupiter.deferredTexture && !!jupiter.mesh.material.map);
check("jupiter full-quality upgrade queued", solar.factory.hasQueuedTextures());
let pumped = 0;
while (solar.factory.pumpTextures()) pumped++;
check("texture queue drains one job per pump (1 job)", pumped === 1);
check("jupiter marked full after pump", jupiter.texSizeKey === "full");

console.log("— boot->full upgrade of known bodies —");
const factory = new PlanetFactory(scene, settings);
const fEarth = factory.makePlanet(PLANET_DEFS.find((p) => p.id === "earth"));
check("factory body starts at boot size", fEarth.texSizeKey === "boot");
factory.detailBody(fEarth, "full");
check("upgrade swaps in a new texture", fEarth.texSizeKey === "full" && fEarth.mesh.material.map !== null);
check("boot-size cache entry evicted on upgrade",
  ![...factory._cache.keys()].some((k) => k.startsWith("earth|") && k.endsWith("boot")));

console.log("— determinism: same seed, same pixels —");
const a = makeEarthTextures(64), b = makeEarthTextures(64);
const da = a.day.image._lastImage.data, db = b.day.image._lastImage.data;
let same = true;
for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) { same = false; break; }
check("earth texture generation is deterministic", same);
const big = makeEarthTextures(128);
const dBig = big.day.image._lastImage.data;
// same continents: land/ocean classification must match at the same UV
let consistent = true;
for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
  const i0 = (y * 64 + x) * 4;
  const i1 = (y * 2 * 128 + x * 2) * 4;
  const isLandA = da[i0 + 1] > da[i0]; // green dominant on land, blue on ocean
  const isLandB = dBig[i1 + 1] > dBig[i1];
  if (isLandA !== isLandB) { consistent = false; }
}
check("64px and 128px earth share the same continents (UV-stable noise)", consistent);

console.log("— starfield counts —");
const s1 = new Starfield(scene, "low", true);
check("phone+low = 1600 stars", s1.points.geometry.attributes.position.count === 1600);
const s2 = new Starfield(scene, "medium", false);
check("medium = 3750 stars (was 5000 before the fix)", s2.points.geometry.attributes.position.count === 3750);
const s3 = new Starfield(scene, "high", false);
check("high = 5000 stars", s3.points.geometry.attributes.position.count === 5000);

console.log("— asteroid field —");
const af = new AsteroidField(scene, 120);
check("asteroid field has 120 + 3 waypoint rocks", af.rocks.length === 123);
check("asteroid geometry is shared (5 cached geos)", af._geoCache.length === 5 && af.rocks.every((r) => af._geoCache.includes(r.mesh.geometry)));

console.log("— lazy effects —");
const fx = new Effects(scene);
fx.update(0.016);
check("effects update() is a no-op before first burst (no pool)", fx._init === false);
fx.burst(new THREE.Vector3(), 0xff0000, { count: 4 });
check("first burst lazily allocates the pool", fx._init === true);
fx.update(0.016);
check("particles decay without errors", true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
