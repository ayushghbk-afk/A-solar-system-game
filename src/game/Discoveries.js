// Discovery tracking: what the pilot has seen/scanned, what codex entries are
// unlocked, and the "fact sheets" used by the scanner + planet info screens.
import { KNOWN_BODIES, DISCOVERABLE_BODIES, PLANET_DEFS, RESOURCES } from "./bodyData.js";

export class DiscoveryManager {
  constructor() {
    // bodies that have been *seen* (spotted with your own eyes)
    this.discovered = new Set(KNOWN_BODIES);
    this.scanned = new Set();
    this.stationsFound = new Set(["station-earth"]);
    // codex section flags
    this.codex = { planets: [], moons: [], resources: [], stations: [], scannedAnomaly: false };
    this.achievements = [];
    this._initCodexDefaults();
  }

  _initCodexDefaults() {
    // default-unlocked codex knowledge for the home system
    this.codex.planets = ["sun", "mercury", "venus", "earth", "mars"];
    this.codex.moons = ["moon"];
  }

  /* ------- knowledge queries ------- */

  isKnown(id) {
    if (id && id.startsWith("station-")) return this.stationsFound.has(id);
    return this.discovered.has(id);
  }

  isScanned(id) {
    return this.scanned.has(id);
  }

  codexUnlocks() {
    // a list of ids unlocked in each codex section (bodies)
    const planets = PLANET_DEFS.filter((p) => this.codex.planets.includes(p.id)).map((p) => p.id);
    const moons = this.codex.moons.slice();
    return {
      planets,
      moons,
      resources: Object.keys(RESOURCES).filter((r) => this.codex.resources.includes(r)),
      stations: this.codex.stations.slice(),
      anomalies: this.codex.scannedAnomaly ? ["anomaly-1"] : [],
    };
  }

  /* ------- discovery events ------- */

  // Called when a body becomes visible in the view (Game rays each frame).
  reveal(id) {
    if (!id || id.startsWith("station-")) return false;
    if (!this.discovered.has(id) && id !== "sun") {
      this.discovered.add(id);
      this.codex.planets.push(id); // rough: moons land in planets list too
      this._sortCodex();
      return true; // newly discovered
    }
    return false;
  }

  markScanned(id) {
    this.scanned.add(id);
    if (id.startsWith("station-")) {
      if (!this.stationsFound.has(id)) {
        this.stationsFound.add(id);
        this.codex.stations.push(id);
      }
      return true;
    }
    this.reveal(id);
    if (PLANET_DEFS.find((p) => p.id === id)) {
      if (!this.codex.planets.includes(id)) this.codex.planets.push(id);
    } else if (!this.codex.moons.includes(id)) {
      this.codex.moons.push(id);
    }
    this._sortCodex();
    return true;
  }

  unlockResource(id) {
    if (!this.codex.resources.includes(id)) this.codex.resources.push(id);
  }

  _sortCodex() {
    const order = ["sun", "mercury", "venus", "earth", "moon", "mars", "phobos", "deimos",
      "jupiter", "io", "europa", "ganymede", "callisto", "saturn", "titan", "enceladus",
      "uranus", "neptune", "triton"];
    this.codex.planets.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    this.codex.moons.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  /* ------- achievements ------- */

  grant(id) {
    if (!this.achievements.includes(id)) {
      this.achievements.push(id);
      return true;
    }
    return false;
  }

  has(id) {
    return this.achievements.includes(id);
  }

  toSave() {
    return {
      discovered: [...this.discovered],
      scanned: [...this.scanned],
      stations: [...this.stationsFound],
      codex: this.codex,
      achievements: this.achievements,
    };
  }

  static fromSave(s) {
    const d = new DiscoveryManager();
    if (!s) return d;
    if (Array.isArray(s.discovered)) d.discovered = new Set(s.discovered);
    if (Array.isArray(s.scanned)) d.scanned = new Set(s.scanned);
    if (Array.isArray(s.stations)) d.stationsFound = new Set(s.stations);
    if (s.codex) {
      d.codex.planets = s.codex.planets || d.codex.planets;
      d.codex.moons = s.codex.moons || d.codex.moons;
      d.codex.resources = s.codex.resources || [];
      d.codex.stations = s.codex.stations || [];
    }
    if (Array.isArray(s.achievements)) d.achievements = s.achievements;
    d._sortCodex();
    return d;
  }
}

export const ACHIEVEMENTS = [
  { id: "first-orbit", name: "FIRST ORBIT", icon: "🌍", desc: "Enter your first planetary orbit." },
  { id: "moonwalker", name: "MOONWALKER", icon: "🌙", desc: "Reach the Moon." },
  { id: "red-planet", name: "RED PLANET", icon: "🔴", desc: "Reach Mars." },
  { id: "giant-step", name: "GIANT STEP", icon: "🪐", desc: "Reach Jupiter." },
  { id: "ring-world", name: "RING WORLD", icon: "💍", desc: "Visit Saturn." },
  { id: "solar-explorer", name: "SOLAR EXPLORER", icon: "☀️", desc: "Reach every planet." },
  { id: "scanner", name: "SCIENTIST", icon: "📡", desc: "Complete your first scan." },
  { id: "miner", name: "ROCKHOUND", icon: "⛏️", desc: "Mine your first asteroid." },
  { id: "trader", name: "TRADER", icon: "💰", desc: "Sell cargo at a station." },
  { id: "upgrader", name: "TUNER", icon: "🔧", desc: "Buy your first ship upgrade." },
  { id: "deep-space", name: "DEEP SPACE", icon: "🌌", desc: "Fly beyond the asteroid belt." },
];

export function getBodyFactSheet(id, solar) {
  // Rich data card for the scanner / planet info / codex
  const body = solar.getBody(id);
  const def = body ? body.def : null;
  if (!def) return null;
  const data = def.data || {};
  const knownComposition =
    (data.composition || []).map((s) => s.split(" (")[0]).join(", ");
  const resources = [];
  if (data.resources) resources.push(...data.resources);
  else if (def.star) resources.push("Plasma", "Fusion energy");
  else if (def.type === "Gas giant") resources.push("Helium-3 (trace)", "Hydrogen");
  else resources.push("Regolith", "Silicates", "Iron");
  if (data.composition && /ice/i.test(data.composition.join(" "))) resources.push("Water ice");
  return {
    id: def.id,
    name: def.name,
    body,
    def,
    data,
    composition: data.composition || [],
    resources,
    atmosphere: data.atmosphere || (def.atmosphere ? def.atmosphere : "None"),
    temp: data.temp || "—",
    gravity: data.gravity || "—",
    type: data.type || def.type || "Celestial body",
    radius: data.radius || "—",
    distance: data.distance || "—",
    life: def.id === "earth" ? "YES — abundant" : def.id === "mars" || def.id === "titan" ? "Unknown — possible microbial" : def.id === "sun" ? "No" : "Unknown / none detected",
  };
}

export function getStationFactSheet(stationId, solar) {
  const st = solar.getStation(stationId);
  if (!st) return null;
  return {
    id: st.id, name: st.name, station: st,
    type: "Orbital station",
    orbit: `Orbiting ${st.host.name}`,
    services: ["Refuel", "Repair", "Sell cargo", "Ship upgrades"],
  };
}
