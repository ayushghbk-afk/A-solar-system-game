// Simplified flight physics: momentum + inverse-square gravity (clamped),
// RCS translation, soft speed caps, atmosphere braking near landable worlds.
// One integrator class used both for the free-fly ship and (with different
// inputs) for cinematic autopilot segments.
import * as THREE from "three";
import { PHYS, BODY_GRAVITY, SHIP } from "../game/config.js";

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class ShipPhysics {
  constructor(ship, solar) {
    this.ship = ship;
    this.solar = solar;
    this.nearestGravity = null; // { body, dist }
  }

  // Add gravity from every body within range (clamped per body).
  _gravityAccel(dt, out) {
    out.set(0, 0, 0);
    const pos = this.ship.pos;
    let best = null;
    let bestD = Infinity;
    for (const b of this.solar.bodies.values()) {
      if (!b.group.visible) continue;
      this.solar.getBodyPosition(b.id, tmpV);
      const dx = tmpV.x - pos.x;
      const dy = tmpV.y - pos.y;
      const dz = tmpV.z - pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > PHYS.GRAVITY_RANGE * PHYS.GRAVITY_RANGE) continue;
      const d = Math.sqrt(d2);
      if (d > bestD) {
        // only the closest body matters for the "you are near X" hint
      }
      const surfG = BODY_GRAVITY[b.id];
      if (surfG === undefined) continue;
      // clamp distance so the surface singularity never explodes
      const dc = Math.max(d, b.radius * 0.6 + 0.4);
      const a = surfG * (b.radius * b.radius) / (dc * dc);
      const inv = 1 / d;
      out.x += (dx * inv) * a;
      out.y += (dy * inv) * a;
      out.z += (dz * inv) * a;
      if (d < bestD) { bestD = d; best = b; }
    }
    this.nearestGravity = best ? { body: best, dist: bestD } : null;
    return out;
  }

  // Atmosphere braking for bodies flagged landable (visual atmosphere bodies
  // with an atmosphere string): adds drag that grows as you descend.
  _atmosphereBrake(dt) {
    const ship = this.ship;
    const best = this.solar.nearestBody(ship.pos, PHYS.GRAVITY_RANGE * 2);
    if (!best || !best.def || !best.def.atmosphere) return;
    const center = this.solar.getBodyPosition(best.id, tmpV);
    const d = center.distanceTo(ship.pos);
    const r = best.radius;
    const altFactor = (d / r);
    if (altFactor > PHYS.ATMOS_RADIUS_FACTOR) return;
    // k grows from ~0 at the edge of the atmosphere to ~1 near the ground
    const k = 1 - (altFactor - PHYS.ATMOS_FULL_RADIUS_FACTOR) / (PHYS.ATMOS_RADIUS_FACTOR - PHYS.ATMOS_FULL_RADIUS_FACTOR);
    const strength = Math.max(0, Math.min(1, k)) * PHYS.ATMOS_BRAKE;
    ship.vel.multiplyScalar(Math.exp(-strength * dt));
    // rotate toward the planet's frame is handled by the pilot
  }

  // One simulation step. `ctl` provides: forward(-1..1 incl. reverse),
  // strafe, up, down, boost, brake. dt is in real seconds.
  step(dt, ctl, extra = {}) {
    const ship = this.ship;
    if (ship.dead) return;
    const thrustMult = extra.thrustMult || 1;
    const capMult = extra.capMult || 1;
    const boost = !!ctl.boost && ship.fuel > 0;
    const throttle = THREE.MathUtils.clamp(ctl.throttle ?? (ctl.forward ? 1 : 0), 0, 1);

    // --- thrust (in ship local space) ---
    const fwd = tmpV.set(0, 0, -1).applyQuaternion(ship.group.quaternion);
    const up = tmpV2.set(0, 1, 0).applyQuaternion(ship.group.quaternion);

    const fwdAccel = throttle * (PHYS.MAIN_ACCEL + (boost ? PHYS.BOOST_ACCEL : 0)) * thrustMult;
    ship.accel.set(0, 0, 0).addScaledVector(fwd, fwdAccel);

    const strafe = (ctl.strafe || 0);
    const vert = (ctl.up || 0) - (ctl.down || 0);
    if (strafe) {
      const right = tmpV2.set(1, 0, 0).applyQuaternion(ship.group.quaternion);
      ship.accel.addScaledVector(right, strafe * PHYS.RCS_ACCEL);
    }
    if (vert) ship.accel.addScaledVector(up, vert * PHYS.RCS_ACCEL);

    // braking: burn opposite the velocity
    if (ctl.brake || (ctl.throttle != null && ctl.throttle < 0)) {
      const spd = ship.vel.length();
      if (spd > 0.05) {
        const dir = tmpV2.copy(ship.vel).multiplyScalar(-1 / spd);
        ship.accel.addScaledVector(dir, PHYS.BRAKE_ACCEL);
      }
    }

    // --- gravity ---
    this._gravityAccel(dt, tmpV2);
    ship.gravityAccel.copy(tmpV2);
    ship.accel.add(tmpV2);

    // --- integrate (semi-implicit) ---
    ship.vel.addScaledVector(ship.accel, dt);
    const cap = (boost ? PHYS.BOOST_CAP : PHYS.CRUISE_CAP) * capMult;
    this._applySoftCap(ship.vel, cap, dt);

    // momentum dampening in open space
    if (throttle === 0 && !vert && !strafe && !ctl.brake) {
      ship.vel.multiplyScalar(Math.max(0, 1 - PHYS.DRAG * dt));
    }
    ship.pos.addScaledVector(ship.vel, dt);
    this._atmosphereBrake(dt);

    // fuel
    let fuelUsed = 0;
    if (throttle > 0.01 && ship.fuel > 0) {
      fuelUsed = (throttle * (boost ? 3.2 : 1) * SHIP.FUEL_USAGE + (boost ? 0.6 : 0)) * dt;
    }
    return { fuelUsed, boost, throttle };
  }

  _applySoftCap(vel, cap, dt) {
    const spd = vel.length();
    if (spd > cap) {
      const scale = 1 - Math.min(1, PHYS.SOFT_CAP_RATE * dt * ((spd / cap) - 1) * 0.5);
      vel.multiplyScalar(Math.max(cap / spd, scale));
    }
  }

  // Checks if the ship nose is roughly pointing toward a point (cosine test).
  noseToward(targetPos, threshold = 0.985) {
    tmpV.subVectors(targetPos, this.ship.pos).normalize();
    const f = this.ship.forward(tmpV2);
    return f.dot(tmpV) > threshold;
  }
}

// Circular orbit speed around `body` at distance `r` from its centre, in
// world units / second (gives a naturally stable playable orbit).
export function orbitSpeedFor(body, r) {
  const surfG = BODY_GRAVITY[body.id] ?? 0;
  return Math.sqrt(Math.max(0, surfG * body.radius * body.radius / Math.max(r, 0.01)));
}

// Horizontal tangent direction to the orbit at the ship's position
// (counter-clockwise viewed from above, so it matches planet spin).
export function orbitTangent(bodyPos, shipPos, out = new THREE.Vector3()) {
  const toCenter = out.subVectors(shipPos, bodyPos);
  toCenter.y = 0;
  const r = Math.max(toCenter.length(), 0.01);
  if (r < 0.05) return out.set(1, 0, 0);
  toCenter.multiplyScalar(1 / r);
  const tangent = new THREE.Vector3(-toCenter.z, 0, toCenter.x);
  if (tangent.lengthSq() < 1e-6) return out.set(1, 0, 0);
  return tangent.normalize();
}
