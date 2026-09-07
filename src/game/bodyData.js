// Solar-system body definitions: the central table used by PlanetFactory.
//
// Units are game units (km * 0.1 roughly). Distances between bodies are
// compressed a lot compared to reality, while relative sizes are kept
// visually believable. `orbit` numbers are world units (see UNITS.AU).
// Colors here are fallbacks AND the key to the generated surface textures.

export const MOON_DEFS = {
  moon: { name: "Moon", color: "#9c9c9c", radius: 1.0, orbit: 10, periodDays: 27.3, atmosphere: null, landing: true },
  phobos: { name: "Phobos", color: "#9a8571", radius: 0.34, orbit: 3.7, periodDays: 0.32, atmosphere: null, landing: false },
  deimos: { name: "Deimos", color: "#a99c8e", radius: 0.26, orbit: 4.5, periodDays: 1.26, atmosphere: null, landing: false },
  io: { name: "Io", color: "#d8c25a", radius: 0.85, orbit: 13.0, periodDays: 1.77, atmosphere: "SO₂", landing: false },
  europa: { name: "Europa", color: "#c8b8a8", radius: 0.78, orbit: 15.4, periodDays: 3.55, atmosphere: null, landing: false },
  ganymede: { name: "Ganymede", color: "#9a958c", radius: 1.32, orbit: 18.2, periodDays: 7.15, atmosphere: null, landing: false },
  callisto: { name: "Callisto", color: "#7c7466", radius: 1.2, orbit: 21.6, periodDays: 16.7, atmosphere: null, landing: false },
  titan: { name: "Titan", color: "#c9a13f", radius: 1.34, orbit: 22.0, periodDays: 15.9, atmosphere: "N₂/CH₄", landing: false },
  enceladus: { name: "Enceladus", color: "#e6e8ea", radius: 0.5, orbit: 14.5, periodDays: 1.37, atmosphere: null, landing: false },
  triton: { name: "Triton", color: "#c3c9c9", radius: 0.95, orbit: 12.0, periodDays: 5.88, atmosphere: "N₂", landing: false },
};

export const PLANET_DEFS = [
  {
    id: "sun", name: "Sun", star: true, orbit: 0,
    color: "#ffc84a", accent: "#ff7b00", radius: 15,
    atmosphere: null, rings: null, moons: [],
    type: "G-type star", tilt: 0.08,
    data: {
      type: "G2V Yellow Dwarf Star",
      radius: "695,700 km", distance: "0 km", gravity: "274 m/s² (27.9 G)",
      day: "~27 Earth days", year: "—", moons: "8 planets",
      temp: "5,505 °C surface", atmosphere: "Hydrogen / Helium plasma",
      composition: ["Hydrogen (73%)", "Helium (25%)", "Trace elements"],
      facts: "The Sun holds 99.8% of the Solar System's mass. A million Earths could fit inside it. Every second it fuses ~600 million tons of hydrogen.",
    },
  },
  {
    id: "mercury", name: "Mercury", color: "#9c8e82", accent: "#6d5f53", radius: 2.0, orbit: 60,
    periodYears: 0.241, atmosphere: "Exosphere", rings: null, moons: [], landing: false, tilt: 0.03,
    type: "Terrestrial planet",
    data: {
      type: "Terrestrial Planet", radius: "2,440 km", distance: "57.9 M km", gravity: "3.7 m/s² (0.38 G)",
      day: "59 Earth days", year: "88 Earth days", moons: "0", temp: "-173 to 427 °C",
      atmosphere: "None (wispy exosphere)", composition: ["Iron (70%)", "Silicates", "Sulfur"],
      facts: "The closest planet to the Sun and the smallest. Its surface is heavily cratered — scorching by day and freezing by night, with no atmosphere to trap heat.",
    },
  },
  {
    id: "venus", name: "Venus", color: "#d8a84e", accent: "#e6c25e", radius: 3.5, orbit: 86,
    periodYears: 0.615, atmosphere: "Dense CO₂", rings: null, moons: [], landing: false, tilt: 2.64,
    type: "Terrestrial planet",
    data: {
      type: "Terrestrial Planet (runaway greenhouse)", radius: "6,052 km", distance: "108.2 M km", gravity: "8.87 m/s² (0.9 G)",
      day: "243 Earth days (retrograde)", year: "225 Earth days", moons: "0", temp: "464 °C average",
      atmosphere: "CO₂ (96.5%), N₂ (3.5%)", composition: ["CO₂ atmosphere", "Sulfuric acid clouds", "Basalt crust"],
      facts: "Earth's toxic twin. Its crushing CO₂ atmosphere and sulfuric-acid clouds trap heat so effectively that Venus is the hottest planet in the Solar System.",
    },
  },
  {
    id: "earth", name: "Earth", color: "#2f6fd0", accent: "#3e9c4a", radius: 3.8, orbit: 122,
    periodYears: 1, atmosphere: "N₂/O₂", rings: null, moons: ["moon"], landing: true, tilt: 0.41,
    type: "Terrestrial planet", isEarth: true,
    data: {
      type: "Terrestrial Planet — homeworld", radius: "6,371 km", distance: "149.6 M km", gravity: "9.81 m/s² (1 G)",
      day: "23.9 hours", year: "365.25 days", moons: "1 — The Moon", temp: "15 °C average",
      atmosphere: "Nitrogen (78%), Oxygen (21%)", composition: ["Iron core", "Silicate mantle", "Water oceans"],
      facts: "The only known world with liquid surface water and life. Its oxygen-rich atmosphere and protective magnetic field make it the launch point of every mission.",
    },
  },
  {
    id: "mars", name: "Mars", color: "#c25b2e", accent: "#a2451f", radius: 2.6, orbit: 165,
    periodYears: 1.881, atmosphere: "Thin CO₂", rings: null, moons: ["phobos", "deimos"], landing: true, tilt: 0.44,
    type: "Terrestrial planet",
    data: {
      type: "Terrestrial Planet", radius: "3,390 km", distance: "227.9 M km", gravity: "3.71 m/s² (0.38 G)",
      day: "24.6 hours", year: "687 Earth days", moons: "2 — Phobos & Deimos", temp: "-63 °C average",
      atmosphere: "CO₂ (95%), N₂, Ar", composition: ["Iron oxide dust", "Basalt", "Water ice", "CO₂ ice"],
      facts: "The Red Planet. Rust-colored iron-oxide dust covers vast deserts, giant volcanoes and canyons. It holds water ice at its poles and under its surface.",
    },
  },
  {
    id: "jupiter", name: "Jupiter", color: "#c58c6a", accent: "#e8d8c0", radius: 9.5, orbit: 226,
    periodYears: 11.86, atmosphere: "H₂/He", rings: null, moons: ["io", "europa", "ganymede", "callisto"], landing: false, tilt: 0.05,
    type: "Gas giant",
    data: {
      type: "Gas Giant", radius: "69,911 km", distance: "778.5 M km", gravity: "24.8 m/s² (2.5 G)",
      day: "9.9 hours", year: "11.9 Earth years", moons: "95 known", temp: "-108 °C cloud tops",
      atmosphere: "Hydrogen (90%), Helium (10%)", composition: ["Hydrogen/helium envelope", "Rocky core", "Metallic hydrogen"],
      facts: "The king of planets — more than twice the mass of everything else combined. The Great Red Spot is a storm wider than Earth that has raged for centuries.",
    },
  },
  {
    id: "saturn", name: "Saturn", color: "#d8bd84", accent: "#efe0b8", radius: 8.2, orbit: 305,
    periodYears: 29.45, atmosphere: "H₂/He", rings: "smooth", moons: ["titan", "enceladus"], landing: false, tilt: 0.47,
    type: "Gas giant",
    data: {
      type: "Gas Giant (ringed)", radius: "58,232 km", distance: "1.43 B km", gravity: "10.4 m/s² (1.1 G)",
      day: "10.7 hours", year: "29.4 Earth years", moons: "146 known", temp: "-139 °C cloud tops",
      atmosphere: "Hydrogen (96%), Helium", composition: ["Hydrogen envelope", "Icy ring material", "Rocky core"],
      facts: "Famous for its dazzling rings of ice and rock, which span 280,000 km yet are often only ~10 m thick. Saturn is so light it would float in water.",
    },
  },
  {
    id: "uranus", name: "Uranus", color: "#7fd4d4", accent: "#a8e8e8", radius: 5.6, orbit: 390,
    periodYears: 84.0, atmosphere: "H₂/He/CH₄", rings: "thin", moons: [], landing: false, tilt: 1.71,
    type: "Ice giant",
    data: {
      type: "Ice Giant", radius: "25,362 km", distance: "2.87 B km", gravity: "8.69 m/s² (0.89 G)",
      day: "17.2 hours (retrograde)", year: "84 Earth years", moons: "28 known", temp: "-197 °C",
      atmosphere: "Hydrogen, Helium, Methane", composition: ["Methane haze (blue)", "Water/ammonia interior", "Rocky core"],
      facts: "An ice giant tipped completely on its side — it rolls around the Sun. Methane in its atmosphere absorbs red light, giving Uranus its pale cyan color.",
    },
  },
  {
    id: "neptune", name: "Neptune", color: "#3a4fd0", accent: "#5f7af0", radius: 5.4, orbit: 470,
    periodYears: 164.8, atmosphere: "H₂/He/CH₄", rings: null, moons: ["triton"], landing: false, tilt: 0.49,
    type: "Ice giant",
    data: {
      type: "Ice Giant", radius: "24,622 km", distance: "4.5 B km", gravity: "11.2 m/s² (1.1 G)",
      day: "16.1 hours", year: "165 Earth years", moons: "16 known", temp: "-201 °C",
      atmosphere: "Hydrogen, Helium, Methane", composition: ["Methane clouds", "Water/ammonia interior", "Rocky core"],
      facts: "The windiest world in the Solar System — supersonic gusts reach 2,100 km/h. It was the first planet found by mathematics before it was seen through a telescope.",
    },
  },
];

// Bodies the game starts knowing about vs. discoveries (see DiscoveryManager).
export const KNOWN_BODIES = ["sun", "mercury", "venus", "earth", "moon", "mars"];
export const DISCOVERABLE_BODIES = ["phobos", "deimos", "jupiter", "io", "europa", "ganymede", "callisto", "saturn", "titan", "enceladus", "uranus", "neptune", "triton"];

// Readable resource catalog: mined from asteroids + planet surface data.
export const RESOURCES = {
  iron: { name: "Iron", price: 10, color: "#b8b0a0" },
  nickel: { name: "Nickel", price: 14, color: "#c8d0c8" },
  water: { name: "Water", price: 25, color: "#4aa8ff" },
  ice: { name: "Ice", price: 18, color: "#cfeaff" },
  rare: { name: "Rare Mineral", price: 250, color: "#d45fe0" },
};
export const RESOURCE_IDS = Object.keys(RESOURCES);

export const STATION_DEFS = [
  { id: "station-earth", name: "Earth Station", color: "#9ad0ff", bodyId: "earth", angle: 2.2, alt: 6, ring: true },
  { id: "station-mars", name: "Mars Station", color: "#ffb08a", bodyId: "mars", angle: 4.6, alt: 5, ring: false },
  { id: "station-jupiter", name: "Jupiter Station", color: "#ffd9a8", bodyId: "jupiter", angle: 0.8, alt: 11, ring: false },
  { id: "station-saturn", name: "Saturn Station", color: "#fff0cc", bodyId: "saturn", angle: 3.9, alt: 10, ring: true },
];

// Helper to look up a body definition by id.
export function findBody(id) {
  if (!id) return null;
  if (id.startsWith("station-")) return STATION_DEFS.find((s) => s.id === id);
  return PLANET_DEFS.find((p) => p.id === id) || (MOON_DEFS[id] ? { id, ...MOON_DEFS[id] } : null);
}

export function bodyDisplayName(id) {
  const b = findBody(id);
  return b ? b.name : id;
}
