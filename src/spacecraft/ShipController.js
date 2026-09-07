// Reads keyboard / gamepad / touch input and turns it into control intent.
// Keeps rotation logic (look + auto-assist + autopilot) separate from the
// force integrator in ShipPhysics.
import * as THREE from "three";

export class ShipController {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    // touch joysticks (fed by MobileControls)
    this.moveAxis = { x: 0, y: 0 }; // y>0 = forward
    this.lookAxis = { x: 0, y: 0 };
    this.touchBoost = false;
    this.touchBrake = false;
    this.touchUp = false;
    this.touchDown = false;

    // look state
    this.pointerLock = false;
    this._lockX = 0;
    this._lockY = 0;
    this.lookSens = 1;

    // autopilot / target assist
    this.assist = null; // { pos: Vector3, rotateOnly?: bool, kill?: bool }
    this.lookTarget = null; // cinematic look-at position (vector or body)

    // input listeners
    this._onKeyDown = (e) => this._key(e, true);
    this._onKeyUp = (e) => this._key(e, false);
    this._onMouseMove = (e) => this._mouseMove(e);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("mousemove", this._onMouseMove);
  }

  _key(e, down) {
    // ignore if typing in an input
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const k = e.code;
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    // prevent page scroll with space / arrows
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(k)) {
      e.preventDefault();
    }
  }

  _mouseMove(e) {
    if (!this.pointerLock) return;
    this._lockX += e.movementX || 0;
    this._lockY += e.movementY || 0;
  }

  clearKeys() {
    this.keys.clear();
    this.touchBoost = this.touchBrake = this.touchUp = this.touchDown = false;
    this.moveAxis.x = this.moveAxis.y = 0;
    this.lookAxis.x = this.lookAxis.y = 0;
  }

  setPointerLock(on) {
    this.pointerLock = on;
    if (!on) {
      this._lockX = 0;
      this._lockY = 0;
    }
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("mousemove", this._onMouseMove);
  }

  /* ---------------- buttons ---------------- */

  forward() {
    return (this.keys.has("KeyW") || this.moveAxis.y > 0.05) ? 1 : 0;
  }
  back() {
    return this.keys.has("KeyS") || this.moveAxis.y < -0.05;
  }
  strafeLeft() {
    return (this.keys.has("KeyA") ? 1 : 0) + Math.max(0, -this.moveAxis.x);
  }
  strafeRight() {
    return (this.keys.has("KeyD") ? 1 : 0) + Math.max(0, this.moveAxis.x);
  }
  up() {
    return (this.keys.has("Space") || this.touchUp ? 1 : 0);
  }
  down() {
    return (this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.touchDown ? 1 : 0);
  }
  boostHeld() {
    return this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") || this.touchBoost;
  }
  brakeHeld() {
    return this.touchBrake || this.keys.has("KeyB");
  }
  interactPressed() {
    return this.keys.has("KeyE");
  }
  scanPressed() {
    return this.keys.has("KeyR");
  }

  consumeKey(code) {
    if (this.keys.has(code)) {
      this.keys.delete(code);
      return true;
    }
    return false;
  }

  /* ---------------- rotation ---------------- */

  // Frame-rate independent look rotation from mouse/right joystick.
  look(dt, ship) {
    let yaw = 0;
    let pitch = 0;
    if (this.pointerLock) {
      yaw = -this._lockX * 0.00225 * this.lookSens;
      pitch = -this._lockY * 0.0021 * this.lookSens;
      this._lockX = 0;
      this._lockY = 0;
    } else if (Math.abs(this.lookAxis.x) > 0.015 || Math.abs(this.lookAxis.y) > 0.015) {
      yaw = -this.lookAxis.x * 2.6 * dt;
      pitch = -this.lookAxis.y * 2.1 * dt;
    } else {
      return false;
    }
    if (yaw || pitch) {
      ship.group.rotateY(yaw);
      ship.group.rotateX(pitch);
      clampPitch(ship.group);
    }
    return true;
  }

  // Smoothly rotate the ship toward `assist` (target point) using slerp.
  // Returns true once the nose is essentially on target.
  assistRotation(dt, ship) {
    if (!this.assist) return false;
    const targetDir = tmpVec.subVectors(this.assist.pos, ship.pos);
    if (targetDir.lengthSq() < 1e-6) return true;
    targetDir.normalize();
    const qTarget = tmpQuat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), targetDir);
    const t = 1 - Math.exp(-dt * 3.4);
    ship.group.quaternion.slerp(qTarget, t);
    const dot = ship.group.quaternion.dot(qTarget);
    if (dot > 0.9999) {
      ship.group.quaternion.copy(qTarget);
      return true;
    }
    return false;
  }

  clearAssist() {
    this.assist = null;
  }
}

export function clampPitch(obj) {
  // keep the ship roughly upright-feeling but allow full rolls
  const e = obj.rotation;
  if (Math.abs(e.z) < Math.PI / 2) {
    e.z = THREE.MathUtils.clamp(e.z, -0.45, 0.45);
  }
}

const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
