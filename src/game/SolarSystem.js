// Runtime solar system: owns orbital motion of every body, space stations,
// and the asteroid field. Planets live at their own "anchor" groups that the
// orbit update moves around the sun.
import * as THREE from "three";
import { PlanetFactory } from "../three-utils/PlanetFactory.js";
import { makeLabelSprite } from "../three-utils/assets.js";
import { ORBIT, UNITS, FAST_TRAVEL } from "../game/config.js";
import { STATION_DEFS } from "../game/bodyData.js";
import { AsteroidField } from "./AsteroidField.js";

export class SolarSystem {
  constructor(scene, settings, discovery, asteroidCount) {
    this.scene = scene;
    this.settings = settings;
    this.discovery = discovery;
    this.factory = new PlanetFactory(scene, settings);
    this.bodies = this.factory.makeAll();
    this.byId = this.bodies;
    this.stations = [];
    this.asteroidField = null;
    this._orbital = new Map();
    this._pivots = [];
    this._makePivots();
    this._makeStations();
    // visible state is driven by discovery; discovered set may already hold items
    this.applyDiscoveryVis();
  }

  getBody(id) {
    return this.bodies.get(id) || null;
  }

  // Freeze one body (used while the player is on its surface). Its moons and
  // stations are hidden together with it so the surface view is clean.
  holdBody(id) {
    if (!this.held) this.held = new Set();
    if (this.held.has(id)) return;
    this.held.add(id);
    const b = this.bodies.get(id);
    if (b) {
      b._wasVisible = b.group.visible;
      b.group.visible = false;
    }
    for (const st of this.stations) {
      if (st.host.id === id) { st._heldHidden = true; st.group.visible = false; }
    }
  }

  releaseHeld(id) {
    if (!this.held) return;
    this.held.delete(id);
    const b = this.bodies.get(id);
    if (b) b.group.visible = b._wasVisible !== false;
    for (const st of this.stations) {
      if (st.host.id === id) { st.group.visible = true; st._heldHidden = false; }
    }
  }

  releaseAllHeld() {
    if (!this.held) return;
    for (const id of [...this.held]) this.releaseHeld(id);
  }

  isHeld(id) {
    return !!this.held && this.held.has(id);
  }

  // Current world position of a body's group (handles moon anchors).
  getBodyPosition(id, out = new THREE.Vector3()) {
    const b = this.bodies.get(id);
    if (!b) return out.set(0, 0, 0);
    b.group.getWorldPosition(out);
    return out;
  }

  getStation(id) {
    return this.stations.find((s) => s.id === id) || null;
  }

  /* ---------------- construction ---------------- */

  _makePivots() {
    // Each planet gets a pivot group centred on the sun; moons are children
    // of the host planet group with their own small pivot.
    for (const b of this.bodies.values()) {
      if (b.parentPlanet) continue;
      if (b.orbitRadius <= 0) {
        // the sun: static at origin
        this.factory.addToWorld(b);
        b.group.position.set(0, 0, 0);
        this._orbital.set(b.id, { body: b, anchor: null });
        continue;
      }
      const pivot = new THREE.Group();
      pivot.name = `${b.name} orbit pivot`;
      this.scene.add(pivot);
      b.pivot = pivot;
      // small inclination so the plane feels 3D but stays tidy
      pivot.rotation.z = (Math.sin(b.phase * 3.7) * 0.5 + (b.id === "mercury" ? 0.9 : 0)) * 0.045;
      this.factory.addToWorld(b);
      pivot.add(b.group);
      this._orbital.set(b.id, { body: b, anchor: pivot, sun: true });
      this._pivots.push(pivot);
      b.group.position.set(b.orbitRadius, 0, 0);
    }
    // moons: revolve around their host planet (host group is already placed
    // on the planet's orbit pivot), so they travel along with the planet.
    for (const b of this.bodies.values()) {
      if (!b.parentPlanet) continue;
      this.factory.addToWorld(b);
      this._orbital.set(b.id, { body: b, moon: true });
      b.orbitRadius = Math.max(0.01, b.def.orbit || 3);
    }
  }

  _makeStations() {
    for (const def of STATION_DEFS) {
      const host = this.bodies.get(def.bodyId);
      if (!host) continue;
      const group = new THREE.Group();
      const radius = host.radius * 0.16 + 0.35;
      const bodyMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(def.color).multiplyScalar(0.9),
        metalness: 0.65, roughness: 0.35, emissive: new THREE.Color(def.color).multiplyScalar(0.06),
      });
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, radius * 3.4, 8), bodyMat);
      hull.rotation.x = Math.PI / 2;
      group.add(hull);
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x99aabb, metalness: 0.9, roughness: 0.3, emissive: 0x223344,
      });
      const torus = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.5, radius * 0.28, 6, 18), ringMat);
      torus.rotation.x = Math.PI / 2;
      group.add(torus);
      if (def.ring) {
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.15, radius * 0.16, 6, 16), ringMat);
        ring2.rotation.x = Math.PI / 2;
        group.add(ring2);
      }
      // solar panels
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0x2a4a8a, metalness: 0.2, roughness: 0.5, emissive: 0x101d3a,
      });
      for (let side = 0; side < 2; side++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.06, radius * 1.2), panelMat);
        panel.position.x = (side === 0 ? -1 : 1) * radius * 1.7;
        group.add(panel);
      }
      const blink = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xff5544 }),
      );
      blink.position.y = radius * 1.9;
      blink.userData.stationId = def.id;
      group.add(blink);
      group.userData.stationId = def.id;
      this.scene.add(group);

      const label = makeLabelSprite(def.name.toUpperCase(), "#ffd97a", 7);
      label.position.y = host.radius * 0.6 + 3.2;
      group.add(label);
      label.visible = false;

      const station = {
        id: def.id,
        def,
        group,
        host,
        label,
        altitude: def.alt,
        angle: def.angle,
        name: def.name,
        position: new THREE.Vector3(),
      };
      this.stations.push(station);
    }
  }

  createAsteroidField(count) {
    if (this.asteroidField) {
      this.scene.remove(this.asteroidField.group);
      this.asteroidField.dispose();
    }
    this.asteroidField = new AsteroidField(this.scene, count);
    return this.asteroidField;
  }

  /* ---------------- discovery visibility ---------------- */

  setBodyVisible(id, visible) {
    const b = this.bodies.get(id);
    if (b) b.group.visible = visible;
    const st = this.stations.find((s) => s.id === id);
    if (st) st.group.visible = visible;
  }

  // Applies current discovery state: unknown bodies hidden, known shown.
  applyDiscoveryVis() {
    for (const b of this.bodies.values()) {
      const known = this.discovery.isKnown(b.id);
      b.group.visible = known;
    }
    for (const s of this.stations) {
      s.group.visible = this.discovery.isKnown(s.id);
    }
    if (this.asteroidField) this.asteroidField.setEnabled(true);
  }

  // Called when a body is discovered mid-game: reveal + flash effect handled
  // by the caller; we just flip visibility here.
  reveal(id) {
    const b = this.bodies.get(id);
    if (b) b.group.visible = true;
    const st = this.stations.find((s) => s.id === id);
    if (st) st.group.visible = true;
  }

  /* ---------------- per-frame update ---------------- */

  update(dt, simTimeSec) {
    for (const { body, anchor, moon } of this._orbital.values()) {
      if (this.isHeld(body.id)) continue;
      if (moon) {
        // moon: revolve around its host (host group is translated already)
        const host = body.parentPlanet;
        if (!host || !host.group.visible) continue;
        const speed = TAU / Math.max(1, body.periodDays * 120); // rad per sim-second
        const ang = body.phase + simTimeSec * speed;
        const r = body.orbitRadius;
        body.group.position.set(Math.cos(ang) * r, Math.sin(ang * 1.15) * r * 0.18, Math.sin(ang) * r * 0.96);
      } else if (anchor && anchor.parent) {
        const speed = ORBIT.speed(body.orbitRadius) * (body.id === "mercury" ? 1.35 : 1);
        const ang = body.phase + simTimeSec * speed;
        body.group.position.set(Math.cos(ang) * body.orbitRadius, 0, Math.sin(ang) * body.orbitRadius);
        body.angle = ang;
      }
      // self rotation (axial tilt is pre-baked on the mesh)
      const rotPerSec = body.def ? this._rotationSpeed(body) : 0;
      if (rotPerSec) {
        body.rotY += dt * rotPerSec;
        body.mesh.rotation.y = body.rotY;
        if (body.extras.clouds) {
          body.extras.clouds.rotation.y = body.rotY * 1.06 + 0.5;
        }
        if (body.extras.night) {
          body.extras.night.rotation.y = body.rotY;
        }
        if (body.extras.rings) {
          // ring tilt is part of the group look; give the ring its own axis
        }
      }
    }
    // stations keep pace with their host planet
    for (const st of this.stations) {
      const hostPos = this.getBodyPosition(st.host.id, tmpVec);
      st.group.position.copy(hostPos);
      const hostB = this.bodies.get(st.host.id);
      const alt = hostB ? hostB.radius * 1 + st.altitude : st.altitude;
      st.position.set(
        hostPos.x + Math.cos(st.angle) * alt,
        hostPos.y * 0.05,
        hostPos.z + Math.sin(st.angle) * alt,
      );
      st.group.position.copy(st.position);
      st.group.rotation.y += dt * 0.12;
    }
    if (this.asteroidField) this.asteroidField.update(dt);
    // body labels fade in based on camera distance handled by game
  }

  _rotationSpeed(body) {
    // rotation speeds per real-world-ish values, played at game cadence
    const DAYS = {
      sun: 27, mercury: 59, venus: -243, earth: 1, moon: 27.3, mars: 1.03,
      jupiter: 0.41, saturn: 0.45, uranus: -0.72, neptune: 0.67,
      io: 1.77, europa: 3.55, ganymede: 7.15, callisto: 16.7,
      phobos: 0.32, deimos: 1.26, titan: 15.9, enceladus: 1.37, triton: 5.88,
    };
    const d = DAYS[body.id];
    if (!d) return 0.03;
    const radPerDay = (TAU / Math.max(0.1, d)) * (d < 0 ? 1 : 1); // retrograde by negative days
    return radPerDay / 1200; // tidied so a planet day is ~a few seconds at 1x
  }

  // distance from a world-space point to the given body center, minus radius
  distanceFromSurface(pos, bodyId) {
    const b = this.bodies.get(bodyId);
    if (!b) return Infinity;
    const c = this.getBodyPosition(bodyId, tmpVec);
    return Math.max(0, c.distanceTo(pos) - b.radius);
  }

  // All bodies + stations + asteroids as flat object list for targeting etc.
  getAllBodies() {
    const list = [];
    for (const b of this.bodies.values()) list.push(b);
    for (const s of this.stations) list.push(s);
    return list;
  }

  nearestBody(pos, maxDist = Infinity) {
    let best = null;
    let bestD = maxDist;
    for (const b of this.bodies.values()) {
      if (b.isStar) continue;
      if (!b.group.visible) continue;
      this.getBodyPosition(b.id, tmpVec);
      const d = tmpVec.distanceTo(pos) - b.radius;
      if (d < bestD) { bestD = d; best = b; }
    }
    for (const s of this.stations) {
      if (!s.group.visible) continue;
      const d = s.position.distanceTo(pos);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // Everything close enough to trigger prompt/interactions.
  nearbyObjects(pos, range) {
    const out = [];
    const d2 = range * range;
    for (const b of this.bodies.values()) {
      if (!b.group.visible) continue;
      this.getBodyPosition(b.id, tmpVec);
      const dd = Math.max(0, tmpVec.distanceTo(pos) - b.radius);
      if (dd <= range) out.push({ type: "body", body: b, distance: dd });
    }
    for (const s of this.stations) {
      if (!s.group.visible) continue;
      const dd = s.position.distanceTo(pos);
      if (dd <= range) out.push({ type: "station", station: s, distance: dd });
    }
    if (this.asteroidField) {
      for (const a of this.asteroidField.active()) {
        const dd = a.mesh.position.distanceTo(pos);
        if (dd <= range) out.push({ type: "asteroid", asteroid: a, distance: dd });
      }
    }
    out.sort((a, b) => a.distance - b.distance);
    return out;
  }
}

const tmpVec = new THREE.Vector3();
const TAU = Math.PI * 2;
