// Procedural asteroid field. Rocks orbit the sun slowly, spin, and can be
// mined. Uses shared geometries + materials; object-pooled per difficulty.
import * as THREE from "three";
import { ASTEROID, ORBIT } from "./config.js";
import { mulberry } from "../three-utils/assets.js";
import { RESOURCE_IDS } from "./bodyData.js";

const TAU = Math.PI * 2;

// Resource weighting used when randomizing asteroids.
const RESOURCE_WEIGHTS = [
  { id: "iron", w: 3.4 },
  { id: "nickel", w: 2.2 },
  { id: "ice", w: 0.8 },
  { id: "water", w: 0.5 },
  { id: "rare", w: 0.18 },
];

function pickResource() {
  let total = 0;
  for (const r of RESOURCE_WEIGHTS) total += r.w;
  let roll = Math.random() * total;
  for (const r of RESOURCE_WEIGHTS) {
    roll -= r.w;
    if (roll <= 0) return r.id;
  }
  return "iron";
}

// One deterministic "asteroid number -> pseudo random" per asteroid index so a
// respawned rock looks the same (keeps the field stable between sessions).
function astroRand(index) {
  return mulberry((index * 2654435761) >>> 0);
}

export class AsteroidField {
  constructor(scene, count) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Asteroid field";
    scene.add(this.group);
    this.rocks = [];
    this._timer = 0;
    this._count = count;

    const geoCache = [];
    for (let i = 0; i < 5; i++) {
      geoCache.push(this._makeGeometry(100 + i * 17));
    }
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8a8478, roughness: 0.95, metalness: 0.05,
    });
    const mat2 = new THREE.MeshStandardMaterial({
      color: 0x5c564c, roughness: 1.0, metalness: 0.0,
    });
    this._geoCache = geoCache;
    this._mats = [mat, mat2];
    this._spawnInitial();
  }

  // Returns a deformed rock geometry with mean radius ~1.
  _makeGeometry(seed) {
    const rnd = mulberry(seed >>> 0);
    const verts = [];
    const idx = [];
    const sub = 5;
    const grid = [];
    for (let y = 0; y <= sub; y++) {
      const row = [];
      for (let x = 0; x <= sub * 2; x++) {
        const u = x / (sub * 2), v = y / sub;
        const theta = u * TAU;
        const phi = v * Math.PI;
        const bump =
          Math.abs(Math.sin(u * (5 + rnd() * 4) + rnd() * 4) * Math.cos(v * 4 + rnd() * 3));
        const r = 0.62 + bump * 0.3 + rnd() * 0.12;
        verts.push(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi) * 0.85,
          r * Math.sin(phi) * Math.sin(theta),
        );
        row.push(verts.length / 3 - 1);
      }
      grid.push(row);
    }
    for (let y = 0; y < sub; y++) {
      for (let x = 0; x < sub * 2; x++) {
        const a = grid[y][x], b = grid[y][x + 1], c = grid[y + 1][x], d = grid[y + 1][x + 1];
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  _spawnInitial() {
    const rnd = mulberry(20260906);
    for (let i = 0; i < this._count; i++) {
      const a = this._makeRock(i, rnd());
      this.rocks.push(a);
      this.group.add(a.mesh);
    }
    this._waypointCount = 0;
    for (let w = 0; w < 3; w++) this._spawnWaypointAsteroid();
  }

  _makeRock(i, rSeed, waypoint) {
    const rnd = astroRand(i);
    const radius = waypoint
      ? ASTEROID.MAX_RADIUS + 1.6
      : ASTEROID.MIN_RADIUS + rnd() * (ASTEROID.MAX_RADIUS - ASTEROID.MIN_RADIUS);
    const geo = this._geoCache[Math.min(this._geoCache.length - 1, Math.floor(rSeed * 5))];
    const mat = this._mats[i % 2];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(radius);
    mesh.rotation.set(rnd() * TAU, rnd() * TAU, rnd() * TAU);

    const beltInner = ASTEROID.BELT.inner;
    const beltWidth = ASTEROID.BELT.outer - beltInner;
    const orbit = beltInner + rnd() * beltWidth;
    const angle = rnd() * TAU;
    const height = (rnd() - 0.5) * ASTEROID.BELT.height;
    const speed = ORBIT.speed(orbit) * 0.95;
    const spin = (rnd() - 0.5) * 2 * ASTEROID.ROT_SPEED;

    const resA = RESOURCE_IDS;
    const primary = pickResource();
    const sec = pickResource();
    const comp = {};
    let pool = 100;
    const share = 0.35 + rnd() * 0.3;
    comp[primary] = share;
    pool -= share;
    if (sec !== primary) {
      const s2 = pool * 0.5;
      comp[sec] = s2;
      pool -= s2;
    }
    comp.other = pool;

    const meshC = mesh;
    const rock = {
      id: "ast" + i,
      mesh: meshC,
      radius,
      orbit,
      angle,
      height,
      speed,
      spin,
      phase: rnd() * TAU,
      y: 0,
      rotSpeed: spin,
      ore: comp,
      amount: Math.round((18 + rnd() * 70) * (waypoint ? 2.2 : 1)),
      waypoint: !!waypoint,
      alive: true,
      respawnTimer: 0,
      miningProgress: 0,
      _rand: rnd,
    };
    return rock;
  }

  _spawnWaypointAsteroid() {
    if (this._waypointCount >= 3) return;
    // Bigger, richer rocks in the Earth–Mars corridor: visible mining targets
    const rnd = mulberry(777 + this._waypointCount * 131);
    const rock = this._makeRock(9000 + this._waypointCount, 0.7, true);
    rock.orbit = 152 + rnd() * 14;
    rock.angle = rnd() * TAU;
    rock.height = 2 + rnd() * 4;
    rock.radius = ASTEROID.MAX_RADIUS + 2.2;
    rock.mesh.scale.setScalar(rock.radius);
    rock.waypoint = true;
    this.rocks.push(rock);
    this.group.add(rock.mesh);
    this._waypointCount++;
  }

  active() {
    return this.rocks.filter((r) => r.alive);
  }

  setEnabled(on) {
    this.group.visible = on;
  }

  // Remove & (later) respawn a mined-out rock.
  deplete(rock) {
    rock.alive = false;
    rock.respawnTimer = ASTEROID.EXHAUSTED_TIME + Math.random() * 60;
    rock.mesh.visible = false;
    // Waypoint rocks always come back as a fresh target nearby.
    if (rock.waypoint) {
      rock.respawnTimer = 10 + Math.random() * 30;
      rock.amount = 140 + Math.random() * 60;
      rock.miningProgress = 0;
      this._resetOre(rock);
    }
  }

  _resetOre(rock) {
    const primary = pickResource();
    rock.ore = { [primary]: 0.5, other: 0.5 };
  }

  respawn() {
    for (const r of this.rocks) {
      r.respawnTimer = Math.random() * 20;
      r.alive = false;
      r.mesh.visible = false;
    }
  }

  count() {
    return this.rocks.filter((r) => r.alive).length;
  }

  update(dt) {
    this._timer += dt;
    for (const r of this.rocks) {
      if (!r.alive) {
        if (r.respawnTimer > 0) {
          r.respawnTimer -= dt;
          if (r.respawnTimer <= 0) {
            // reset at a fresh belt position (unless the player is there)
            r.angle = Math.random() * TAU;
            r.orbit = ASTEROID.BELT.inner + Math.random() * (ASTEROID.BELT.outer - ASTEROID.BELT.inner);
            r.alive = true;
            r.mesh.visible = true;
            r.amount = r.waypoint ? 140 + Math.random() * 60 : 18 + Math.random() * 70;
            r.miningProgress = 0;
            this._resetOre(r);
          }
        }
        continue;
      }
      r.angle += r.speed * this._dtRate(dt);
      const x = Math.cos(r.angle) * r.orbit;
      const z = Math.sin(r.angle) * r.orbit;
      const y = r.height + Math.sin(this._timer * 0.2 + r.phase) * 1.2;
      r.mesh.position.set(x, y, z);
      r.mesh.rotation.x += r.spin * dt;
      r.mesh.rotation.y += r.spin * 1.3 * dt;
    }
  }

  // Asteroid belt orbits at the simulation clock speed (so boosting time
  // warp spins up the field too).
  _dtRate(dt) {
    return dt * 0.5;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const g of this._geoCache) g.dispose();
    for (const m of this._mats) m.dispose();
    this.rocks.length = 0;
  }
}
