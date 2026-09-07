// Central configuration for Solar Odyssey.
// All gameplay tuning values live here so the game stays easy to adjust.

export const TIME = {
  // Simulation clock: how many "in-game seconds" advance per real second at 1x.
  // 60 => a real second = a game minute, orbits look alive without zooming.
  DEFAULT_SECONDS_PER_SECOND: 60,
  MIN: 0,
  MAX: 2000,
};

// Simplified orbital mechanics. Kepler-ish: orbital period scales with the
// semi-major axis to the 3/2 power, so inner planets lap the outer ones.
export const ORBIT = {
  POWER: 1.5, // exponent used for period = k * orbit^POWER
  // Angular speed of the reference orbit (orbit = 100 units). At the default
  // 60 sim-seconds per real second a planet at orbit=100 laps every ~8 real
  // minutes, keeping planetary motion gentle enough to fly between bodies
  // (the time-warp control spins the system up dramatically).
  ANGLES_PER_SECOND: (Math.PI * 2) / 28800,
  // Angular speed for a body at `orbit` distance, in rad / sim-second.
  speed: (orbit) => ORBIT.ANGLES_PER_SECOND * Math.pow(100 / Math.max(orbit, 1), ORBIT.POWER),
};

// Fake-but-consistent units. Planets are km-like scales, distances are
// compressed, and the ship feels like a fast interplanetary vehicle.
export const UNITS = {
  ASTRONOMICAL_UNIT: 280, // "1 AU" in world units
  ORBIT_KM: 500, // world-unit / km conversion for HUD distance display
  SHIP_RADIUS: 0.7,
  STAR_LIGHT: 1.65,
};

// Spacecraft (level-1 baseline values; levels modify them in upgrades.js).
export const SHIP = {
  FUEL_CAPACITY: 320,
  FUEL_USAGE: 0.5, // per 1 unit of throttle per second
  BOOST_MULT: 5.2,
  RCS_POWER: 60, // linear RCS accel (m/s^2 at mass 1)
  ANGULAR_SPEED: 1.35, // rad/s manual rotation
  ROTATE_TIME: 0.65, // seconds to rotate to face a target
  MIN_ENGAGE_DIST: 26, // auto-assist engages below this distance to target
  SHIELD_CAPACITY: 100,
  SHIELD_REGEN: 3.2, // per second, only while shield intact
  MAX_HULL: 100,
  COLLISION_DAMAGE: 30, // damage per hard impact
  COLLISION_SOFT: 150, // impact speed below this only scrapes the shield
  UPGRADE_COST_MULT: 1.6, // each level costs ~1.6x the previous
};

// Simplified physics for the ship.
export const PHYS = {
  MASS: 1,
  MAIN_ACCEL: 11, // forward thrust (units/s^2)
  RCS_ACCEL: 16, // strafe / vertical thrust
  BRAKE_ACCEL: 26, // retro burn
  BOOST_ACCEL: 58, // extra forward thrust while boosting
  CRUISE_CAP: 30, // soft speed cap without boost
  BOOST_CAP: 165, // soft speed cap while boosting
  SOFT_CAP_RATE: 5.5, // how quickly the soft cap pulls speed back
  GRAVITY_RANGE: 1400, // beyond this distance body gravity is ignored
  DRAG: 0.008, // linear dampening for space (momentum keeps you moving)
  ATMOS_BRAKE: 0.5, // exponential atmosphere braking factor
  ATMOS_RADIUS_FACTOR: 2.1, // braking starts at bodyRadius * this
  ATMOS_FULL_RADIUS_FACTOR: 1.35, // strongest braking below this altitude
};

// Surface gravity strength per body (units/s^2 at the surface), used to
// fake an inverse-square gravity field: g(d) = SURFACE_G * (R / d)^2.
export const BODY_GRAVITY = {
  sun: 48, mercury: 0.95, venus: 2.6, earth: 4.2, moon: 0.68,
  mars: 1.55, jupiter: 8.4, io: 0.5, europa: 0.42, ganymede: 0.48,
  callisto: 0.42, saturn: 7.4, titan: 0.58, enceladus: 0.11,
  uranus: 5.8, neptune: 6.3, triton: 0.32, phobos: 0.05, deimos: 0.03,
};

// Interactable objects: planets, moons, stations, asteroids.
export const INTERACT = {
  HUD_RANGE: 900, // how far the "TARGET: X — distance" line reaches
  PROMPT_RANGE: 46, // "Press E / [INTERACT]" prompt range
  ENTER_ORBIT_RANGE: 15, // enter-orbit range (in body radii)
  COLLISION_RADIUS_FACTOR: 0.95,
};

export const ORBIT_MODE = {
  RATE_MULT: 2.2, // how much faster than natural gravity orbit you go in orbit cam
  APPROACH_ALTITUDE: 2.2, // starting altitude in body radii
  DIST_FACTOR: 3.6, // camera distance = bodyRadius * this (scaled by radius)
};

export const FAST_TRAVEL = {
  SPEED: 1700, // world units / s
  START_ALT: 60, // distance from body surface before travel
  MIN_DISTANCE: 40,
  REVEAL_RADIUS: 350, // how close you must get to unlock fast-travel to a body
  ARRIVE_ALT: 40,
  FUEL_COST_PER_UNIT: 0.07, // fuel burned per world-unit of travel
};

export const STATION = {
  FEE_PER_TON: 1, // credits per unit of mined cargo sold
  RANGES: { DOCK: 22, PROMPT: 44 },
  REFUEL_RATE: 55, // fuel per second while docked
  REPAIR_RATE: 40, // hull per second while docked
};

export const ASTEROID = {
  BELT: { inner: 195, outer: 252, height: 26, target: 260 },
  MIN_RADIUS: 1.1,
  MAX_RADIUS: 4.6,
  ROT_SPEED: 0.5,
  // Belt density per quality tier. Phones default to LOW (see Settings.js),
  // so a 2 GB Android never pays for 210 rocks at boot.
  COUNT_LOW: 60,
  COUNT_MEDIUM: 120,
  COUNT_HIGH: 210,
  RESPAWN_DIST: 400, // waypoint asteroids respawn if you fly past them
  MINE_RADIUS: 16,
  MINE_RANGE: 10,
  ENERGY_PER_SEC: 18,
  SCAN_TIME: 1.7, // seconds of beam contact to complete one extract cycle
  CYCLE_YIELD: 3, // units of ore per completed cycle
  EMPTY_TIME: 5, // after depletion the rock is left alone a while
  EXHAUSTED_TIME: 120, // then it slowly re-charges so the field never dies
};

export const SCANNER = {
  RANGE: 220,
  TIME: 2.2, // seconds to complete a scan
  ENERGY_COST: 12,
  ENERGY_PER_SEC: 6,
};

export const MISSION = {
  APPROACH_RANGE: 1e3, // success proximity (world units)
  STATION_ORBIT_RANGE: 5, // "reach X system" success for stations
};

export const STARFIELD = {
  COUNT_LOW: 2500,
  COUNT_MEDIUM: 3750,
  COUNT_HIGH: 5000,
  // Phones get an even sparser sky in LOW — 5,000 points is wasted work on a
  // 2 GB Android device.
  COUNT_PHONE: 1600,
  SIZE: 3800,
  NEBULA_SIZE: 3400,
  NEBULA_COLORS: [
    [0.24, 0.2, 0.6], [0.05, 0.15, 0.45], [0.5, 0.12, 0.35],
    [0.06, 0.3, 0.28], [0.3, 0.18, 0.05],
  ],
};

// Map a star-density level ("low" | "medium" | "high") to a point count.
// Medium used to accidentally fall through to the HIGH count — anything that
// wasn't "low" got 5,000 stars.
export function starCountFor(level, phone = false) {
  if (level === "low") return phone ? STARFIELD.COUNT_PHONE : STARFIELD.COUNT_LOW;
  if (level === "high") return STARFIELD.COUNT_HIGH;
  return phone ? Math.round(STARFIELD.COUNT_PHONE * 1.5) : STARFIELD.COUNT_MEDIUM;
}

// Map a graphics-quality tier to an asteroid-belt count.
export function asteroidCountFor(quality) {
  if (quality === "low") return ASTEROID.COUNT_LOW;
  if (quality === "high") return ASTEROID.COUNT_HIGH;
  return ASTEROID.COUNT_MEDIUM;
}

// Procedural planet-texture sizes. BOOT sizes are what may be generated
// synchronously during the boot sequence (capped so slow devices reach the
// menu quickly); FULL sizes are generated later — one body per tick, after
// the game is running, or lazily when an undiscovered body is revealed.
export const TEX_SIZES_BOOT = { low: 128, medium: 256, high: 512 };
export const TEX_SIZES_FULL = { low: 256, medium: 512, high: 1024 };

// The single source of truth for per-tier renderer settings. _initRenderer()
// and applyGraphics() both read from here so the settings panel and the boot
// path can't drift apart again.
export const GRAPHICS_QUALITY = {
  HIGH: {
    shadows: true, shadowMap: 1024, bloom: true, dprCap: 2,
    stars: "high", planetQuality: "high", asteroids: "high",
  },
  MEDIUM: {
    shadows: true, shadowMap: 512, bloom: true, dprCap: 1.5,
    stars: "medium", planetQuality: "medium", asteroids: "medium",
  },
  LOW: {
    shadows: false, shadowMap: 0, bloom: false, dprCap: 1.15,
    stars: "low", planetQuality: "low", asteroids: "low",
  },
};

export function graphicsPreset(quality) {
  return GRAPHICS_QUALITY[String(quality).toUpperCase()] || GRAPHICS_QUALITY.MEDIUM;
}

// Boot behaviour tuning.
export const STARTUP = {
  // If staged initialization hasn't finished within this window, surface a
  // "startup is taking too long" panel with a low-graphics escape hatch.
  WATCHDOG_MS: 20000,
  // First lazy texture upgrade happens this long after the menu appears, so
  // the menu is visibly alive before any background work starts.
  UPGRADE_DELAY: 1.5,
  // Minimum gap between lazy texture jobs (one body per tick, never a batch).
  UPGRADE_INTERVAL: 0.6,
};

export const CAMERA = {
  FREE_FOV: 74,
  ZOOM: { min: 0.35, max: 60, step: 1.18 },
  ROTATE_SPEED: 0.0052,
  LERP: 7.0, // free-camera follow smoothing
  VIEW_LERP: 5.0,
};

export const LIMITS = {
  MIN_RADIUS: 0.4,
  MAX_DIST: 4000, // hard boundary for physics/ship position
};

export const FONT =
  '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONT_MONO =
  '"SFMono-Regular", ui-monospace, Menlo, Consolas, "Liberation Mono", monospace';
