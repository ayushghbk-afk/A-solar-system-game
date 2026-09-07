// Game.js — the orchestrator. Owns the renderer, the simulation loop and
// every mode transition. Kept UI-free: Screens/HUD read game state.
import * as THREE from "three";
import { Starfield } from "../three-utils/Starfield.js";
import { Effects } from "../world/Effects.js";
import { LandingZone } from "../world/LandingZone.js";
import { SolarSystem } from "./SolarSystem.js";
import { Ship } from "../spacecraft/Ship.js";
import { ShipController } from "../spacecraft/ShipController.js";
import { ShipPhysics, orbitSpeedFor, orbitTangent } from "../spacecraft/ShipPhysics.js";
import { Profile } from "./Profile.js";
import { MissionManager } from "./Missions.js";
import { DiscoveryManager, ACHIEVEMENTS } from "./Discoveries.js";
import { AudioManager } from "../audio/AudioManager.js";
import { SaveSystem } from "../save/SaveSystem.js";
import { SettingsManager } from "./Settings.js";
import { HUD } from "../ui/HUD.js";
import { Screens } from "../ui/screens.js";
import { Toasts } from "../ui/Toasts.js";
import { MobileControls } from "../ui/MobileControls.js";
import { detectPhone, el, fmtKm, fmtNum } from "../ui/dom.js";
import {
  TIME, UNITS, SHIP, FAST_TRAVEL, ASTEROID, SCANNER,
} from "./config.js";

const TAU = Math.PI * 2;

export class Game {
  constructor() {
    this.ready = false;
    this.failed = null;
    this.settingsMgr = new SettingsManager();
    this.settings = this.settingsMgr.s;
    this.save = new SaveSystem();
    this.profile = Profile.fromJSON(this.save.load("profile"));
    this.shipState = this.save.load("shipState");
    this.discovery = DiscoveryManager.fromSave(this.save.load("discoveries"));
    this.audio = new AudioManager();

    // UI refs (filled on DOMContentLoaded)
    this.canvas = null;
    this.uiRoot = null;
    this.boot = null;

    // three
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();

    // world
    this.solar = null;
    this.starfield = null;
    this.effects = null;
    this.ship = null;
    this.shipPhysics = null;
    this.controller = null;
    this.landingZone = new LandingZone(null); // scene set in init

    // meta
    this.missions = MissionManager.fromSave(this.save.load("missions"), this.profile, (ev, def) => this._missionEvent(ev, def));
    this.hudState = {};
    this.hud = null;
    this.screens = null;
    this.toasts = null;
    this.mobile = null;

    // sim state
    this.simTime = (this.save.load("simTime") || 0) * 1;
    this.speedScale = 0; // 0 = default (see timeScaleFor)
    this.playing = false;
    this.paused = false;
    this.mode = "boot"; // boot | menu | flight | landed
    this.cameraMode = "chase"; // chase | cockpit | free
    this._camFree = { yaw: 0, pitch: 0.3, dist: 9 };
    this.autoOrbit = null; // body being auto-orbited
    this.orbitAngle = 0;
    this.targetBody = "earth";
    this.prompt = null;
    this.activity = null; // {kind:'scan'|'mine'|'warp', ...}
    this.missionPending = null;
    this.dockedStation = null;
    this.nearStation = null;
    this._message = "";
    this._toMenuAfterLeave = false;
    this._lastFuelWarn = 0;
    this._scanTick = 0;
    this._mineTick = 0;
    this._bootLog = [];
    this._warp = null; // fast travel state
    this._landed = null; // landing session
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
    this.arrivedFlash = 0;
    this._nearestBodyLabel = null;
    this._pendingInfoId = null;
    this._saveTimer = 30;
  }

  /* ================= boot ================= */

  log(msg) {
    this._bootLog.push(msg);
    const el = this.boot && this.boot.querySelector("#boot-log");
    if (el) el.textContent = msg;
  }

  async init() {
    this.detectUI();
    this.log("Initializing rendering…");
    await this._initRenderer();
    this.log("Building star field…");
    this.starfield = new Starfield(this.scene, this.settings.stars);
    this.log("Generating solar system…");
    const texSize = this.settings.planetQuality === "high" ? 1024 : this.settings.planetQuality === "low" ? 256 : 512;
    this.solar = new SolarSystem(this.scene, this.settings, this.discovery, 0);
    // asteroid count depends on stars setting quality
    const astCount = this.settings.stars === "low" ? ASTEROID.COUNT_LOW : ASTEROID.COUNT_HIGH;
    this.solar.createAsteroidField(astCount);
    this.log("Wiring ships & systems…");
    this.ship = new Ship(this.scene);
    this.shipPhysics = new ShipPhysics(this.ship, this.solar);
    this.effects = new Effects(this.scene);
    this.landingZone.scene = this.scene;
    this._makeLights();
    this.log("Applying discovery state…");
    this.solar.applyDiscoveryVis();
    this._bindGlobalKeys();
    this._bindPick();
    this.ready = true;
  }

  _bindGlobalKeys() {
    // unlock the audio context on the first user gesture anywhere
    const unlock = () => this.audio.ensure();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("resize", () => {
      if (!this.camera || !this.renderer) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener("pointerlockchange", () => {
      this.controller.setPointerLock(document.pointerLockElement === this.canvas);
    });
    document.addEventListener("keydown", (e) => {
      if (e.code !== "Escape") return;
      if (this.mode !== "flight" && this.mode !== "landed") return;
      if (this.screens && this.screens.modalLayer && this.screens.modalLayer.children.length) {
        e.preventDefault();
        this.screens.closeModals();
        this.onModalOpen(false);
        if (this.dockedStation) this.exitDock();
        return;
      }
      e.preventDefault();
      this.togglePause();
    });
    // click to (re)lock pointer when playing on desktop
    this.canvas.addEventListener("mousedown", () => {
      if (this.mode !== "flight" || this.settings.phone) return;
      if (this.paused || this.dockedStation) return;
      if (this.screens.modalLayer.children.length) return;
      if (document.pointerLockElement !== this.canvas) {
        try { this.canvas.requestPointerLock(); } catch (err) { /* ignore */ }
      }
    });
  }

  _bindPick() {
    let down = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    this.canvas.addEventListener("pointerup", (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const held = performance.now() - down.t;
      down = null;
      if (moved > 8 || held > 450) return; // drag or long-press: not a tap
      if (document.pointerLockElement === this.canvas) return;
      if (this.mode !== "flight" && this.mode !== "menu") return;
      if (this.paused && this.screens.modalLayer.children.length) return;
      const id = this.pickBody(e.clientX, e.clientY);
      if (id && this.discovery.isKnown(id)) {
        this.audio.ensure();
        this.audio.play("click");
        if (this.mode === "flight") this.openBodyInfo(id);
      }
    });
  }

  detectUI() {
    this.canvas = document.getElementById("scene");
    this.uiRoot = document.getElementById("ui-root");
    this.boot = document.getElementById("boot");
    const isPhone = detectPhone();
    if (isPhone) this.settings.phone = true;
    this.controller = new ShipController(this.canvas);
    // Screens first: builds the DOM shell (#screen-hud, modal/toast/mobile
    // layers). HUD, toasts and touch controls mount into that shell.
    this.screens = new Screens(this, this.uiRoot);
    this.hud = new HUD(this.screens.hudRoot, () => {});
    this.toasts = new Toasts(this.screens.toastLayer);
    this.mobile = new MobileControls(this.screens.mobileLayer, this.controller, this);
  }

  async _initRenderer() {
    const w = window.innerWidth, hh = window.innerHeight;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.settings.quality !== "low", powerPreference: "high-performance" });
    } catch (e) {
      this.fail("WebGL could not start. Your browser or device may not support WebGL — try a desktop browser.");
      throw e;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, hh);
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.fog = new THREE.Fog(0x02030a, 400, 3400);
    this.camera = new THREE.PerspectiveCamera(60, w / hh, 0.02, 20000);
    this.camera.position.set(130, 14, -20);
  }

  _makeLights() {
    // The sun itself is emissive; add a dim ambient so night sides aren't
    // pure black. Decay 0 keeps sunlight even across the compressed system.
    const amb = new THREE.AmbientLight(0x22304a, 0.45);
    this.scene.add(amb);
    const sunLight = new THREE.PointLight(0xfff2dd, 1.5, 0, 0);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);
    this.sunLight = sunLight;
  }

  fail(msg) {
    this.failed = msg;
    const layer = document.getElementById("error-layer");
    if (layer) {
      layer.hidden = false;
      layer.innerHTML = `<div class="error-card"><h2>⚠ SYSTEM FAULT</h2><p>${msg}</p><p class="hint">Reload the page to try again.</p></div>`;
    }
    if (this.boot) this.boot.classList.add("failed");
  }

  /* ================= loop ================= */

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, this.clock.getDelta());
      this.update(dt);
      this.render();
      this._fpsCount(dt);
    };
    loop();
  }

  _fpsCount(dt) {
    this._fpsTime += dt;
    this._frameCount++;
    if (this._fpsTime >= 0.5) {
      this._fps = Math.round(this._frameCount / this._fpsTime);
      this._fpsTime = 0;
      this._frameCount = 0;
    }
  }

  timeScaleFor() {
    // 0 => default warp
    if (this.settings.timeScale > 0) return this.settings.timeScale;
    return TIME.DEFAULT_SECONDS_PER_SECOND;
  }

  update(dt) {
    const t = this.simTime;
    // pause handling
    if (this.paused) {
      this.audio.updateEngine(0, false, dt);
      this.render();
      return;
    }
    if (this.mode === "menu") {
      this._updateMenuScene(dt);
      return;
    }
    if (this.mode === "boot") return;
    // sim time always advances in flight
    const scale = this.timeScaleFor();
    this.simTime += dt * scale;

    // sim solar system keeps moving while orbiting and warping (planets move)
    if (this._warp) {
      this._updateWarp(dt);
      this.solar.update(dt, this.simTime);
    } else if (this.mode === "landed") {
      this._updateLanded(dt); // world frozen under the astronaut
    } else {
      this.solar.update(dt, this.simTime);
      this._updateFlight(dt);
      this._updateScan(dt);
      this._updateMining(dt);
    }
    this.starfield.update(this.camera.position);
    this.effects.update(dt);
    this._updateLabels();
    this._checkDiscoveries();
    this._missionProximity();
    this._proximityAchievements();
    this._regenShield(dt);
    this._autoSave(dt);
    this._updateNearest();
    this._handleModeKeys();
    this.composeHud();
    this.hud.render(this.hudState);
  }

  _updateMenuScene(dt) {
    // slow cinematic pan around Earth
    const earth = this.solar.bodies.get("earth");
    if (earth) {
      const p = this.solar.getBodyPosition("earth");
      const a = this.simTime * 0.06;
      const dist = 34 + Math.sin(this.simTime * 0.02) * 6;
      this.camera.position.set(p.x + Math.cos(a) * dist, p.y + Math.sin(this.simTime * 0.05) * 6, p.z + Math.sin(a) * dist);
      this.camera.lookAt(p);
    }
    this.solar.update(dt, this.simTime + dt * 40);
    this.ship.group.visible = false;
    this.effects.update(dt);
    this.starfield.update(this.camera.position);
    this._updateLabels();
  }

  render() {
    if (!this.renderer) return;
    this.renderer.render(this.scene, this.camera);
  }

  /* ================= flight ================= */

  startFlight() {
    if (!this.ready) return;
    this.audio.ensure();
    this.mode = "flight";
    this.screens.hideMenu();
    this.screens.closeModals();
    this.hud.setVisible(true);
    this.ship.group.visible = true;
    this.paused = false;
    this.mobile.setActive(!!this.settings.phone);
    this.landingZone.dispose();
    this.solar.releaseAllHeld();
    // spawn or resume
    this._spawnShip();
    // onboarding: give a fresh pilot the first objectives automatically
    if (this.profile.visited.length === 0 && this.missions.accepted.length === 0) {
      for (const mid of ["first-flight", "lunar-visit", "first-ore"]) this.missions.accept(mid);
      this.saveGame(false);
      setTimeout(() => this.toast("🛰 OBJECTIVE: break Earth orbit (fly away from Earth)", "good", 4200), 1600);
      setTimeout(() => this.toast("Use W to thrust · mouse to look · SHIFT to boost", "", 3600), 4600);
    }
    this._enterPointerLock();
  }

  _spawnShip() {
    this.solar.releaseAllHeld();
    const earthP = this.solar.getBodyPosition("earth", tmpVec);
    const earthR = this.solar.bodies.get("earth").radius;
    const n = tmpVec2.copy(earthP).normalize();
    // park on Earth's sun-facing side, a little above the "atmosphere"
    const defaultPos = tmpVec.copy(earthP).addScaledVector(n, -(earthR + 2.6));
    defaultPos.y += 1.2;
    let pos = defaultPos.clone();
    let quat = null;
    let savedVel = null;
    if (this.shipState && this.shipState.pos) {
      const v = new THREE.Vector3(this.shipState.pos.x, this.shipState.pos.y, this.shipState.pos.z);
      // safety: reject positions inside a planet or far outside the system
      let bad = v.length() > 950;
      for (const b of this.solar.bodies.values()) {
        const c = this.solar.getBodyPosition(b.id, tmpVec2);
        if (c.distanceTo(v) < b.radius * 1.25) { bad = true; break; }
      }
      if (!bad) {
        pos = v;
        if (this.shipState.quat) quat = new THREE.Quaternion(...this.shipState.quat);
        if (this.shipState.vel) savedVel = new THREE.Vector3(...this.shipState.vel);
      }
    }
    if (!quat) {
      // face the Moon by default so the tutorial flight is natural
      const moonP = this.solar.bodies.get("moon") ? this.solar.getBodyPosition("moon", tmpVec2) : null;
      let dir = tmpVec2.copy(earthP).negate().add(pos).normalize();
      if (moonP && moonP.distanceTo(pos) < 200) dir = moonP.clone().sub(pos).normalize();
      quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    }
    this.ship.resetPose(pos, quat);
    if (savedVel) this.ship.vel.copy(savedVel);
    this.ship.fuel = this.profile.maxFuel * 0.9;
    this.ship.hull = this.profile.maxHull;
    this.ship.shield = this.profile.maxShield;
    this.ship.energy = this.profile.maxEnergy;
    this.autoOrbit = null;
    this.targetBody = null;
    // camera behind the ship
    const back = new THREE.Vector3(0, 0, 5.2).applyQuaternion(quat);
    const upV = new THREE.Vector3(0, 1.2, 0).applyQuaternion(quat);
    this.camera.position.copy(this.ship.pos).add(back).add(upV);
    this.camera.lookAt(this.ship.pos);
    this._camFree = { yaw: 0, pitch: 0.3, dist: 9 };
    this.ship.clearTrail();
  }

  _enterPointerLock() {
    try {
      if (!this.settings.phone && this.canvas.requestPointerLock && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    } catch (e) { /* pointer lock may be blocked; fine */ }
  }

  toMenu() {
    this.paused = false;
    this.playing = false;
    this.mode = "menu";
    this.ship.group.visible = false;
    this.hud.setVisible(false);
    this.mobile.setActive(false);
    this.screens.closeModals();
    this.screens.showMenu();
    this.screens.refreshMenuFoot();
    if (document.pointerLockElement) document.exitPointerLock();
    this._releaseAutoOrbit();
    this.landingZone.dispose();
    this._landed = null;
    this.solar.releaseAllHeld && this.solar.releaseAllHeld();
    this.audio.stopEngine();
    this.simTime = 0;
  }

  togglePause() {
    if (this.mode !== "flight") return;
    this.paused = !this.paused;
    if (this.paused) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.screens.showPause();
      this.audio.stopEngine();
    } else {
      this.screens.hidePause();
      this._enterPointerLock();
    }
  }

  /* ------- flight update ------- */

  _updateFlight(dt) {
    const ship = this.ship;
    const ctl = this.controller;
    const physics = this.shipPhysics;

    // handle auto-orbit state
    if (this.autoOrbit) {
      const res = this._updateAutoOrbit(dt);
      if (res === "exit") { this._releaseAutoOrbit(); }
      if (this.autoOrbit) {
        this._flyCamera(dt);
        this._interactFlight(dt);
        return;
      }
    }

    // rotation: look first, then auto-assist (assist skipped while free-cam)
    let looked = false;
    if (this.cameraMode !== "free") {
      if (ctl.look(dt, ship)) {
        this._releaseAutoOrbit();
        looked = true;
      }
    } else {
      // free camera consumes the mouse deltas to orbit around the ship
      this._camFree.yaw -= this.controller._lockX * 0.0032;
      this._camFree.pitch = THREE.MathUtils.clamp(this._camFree.pitch + this.controller._lockY * 0.0032, -1.1, 1.1);
      this.controller._lockX = 0;
      this.controller._lockY = 0;
    }
    if (!looked && this.prompt && ["orbit", "land", "approach"].includes(this.prompt.type) && this.prompt.body) {
      const tp = this._bodyCenter(this.prompt.body.id, tmpVec);
      const d = tp.distanceTo(ship.pos);
      if (d > 2.5 && (ctl.forward() || ctl.boostHeld())) {
        ctl.assist = { pos: tp };
        ctl.assistRotation(dt, ship);
      } else ctl.clearAssist();
    } else if (!looked) ctl.clearAssist();

    // input -> physics (engine levels scale thrust & cruise cap)
    const throttle = ctl.forward() - (ctl.back() ? 0.6 : 0);
    const boost = ctl.boostHeld();
    const strafe = (ctl.strafeRight() - ctl.strafeLeft());
    const up = ctl.up();
    const down = ctl.down();
    const brake = ctl.brakeHeld() || (ctl.back() && ship.speed() > 1);
    const res = physics.step(dt, { forward: ctl.forward(), throttle, strafe, up, down, boost, brake }, {
      thrustMult: this.profile.engineThrustMult,
      capMult: this.profile.engineCapMult,
    });

    // fuel/energy
    const fuelUsed = res ? res.fuelUsed : 0;
    if (fuelUsed > 0) ship.fuel = Math.max(0, ship.fuel - fuelUsed);
    if (ship.fuel <= 0) {
      ship.fuel = 0;
      this._warnFuel(dt);
    }

    ship.throttle = ctl.forward() ? 1 : 0;
    ship.boost = boost && ship.fuel > 0 ? 1 : 0;
    ship.setEngineVisual(ship.throttle, ship.boost);
    ship.updateTrail(dt, ship.vel.lengthSq());
    this.audio.updateEngine(ship.throttle, ship.boost, dt);
    if (ship.boost && ship.fuel > 0) ship.energy = Math.max(0, ship.energy - dt * 1.2);
    if (!ship.boost) ship.energy = Math.min(this.profile.maxEnergy, ship.energy + dt * 2.2);

    this._flightCollisions(dt);
    this._flyCamera(dt);
    this._interactFlight(dt);
  }

  _warnFuel(dt) {
    if (performance.now() - this._lastFuelWarn > 4000) {
      this._lastFuelWarn = performance.now();
      this.audio.play("alarm");
      this.toast("⚠ FUEL DEPLETED — find a station or drift!", "warn", 4000);
    }
  }

  _flightCollisions(dt) {
    const ship = this.ship;
    for (const b of this.solar.bodies.values()) {
      if (b.isStar) continue;
      if (!b.group.visible) continue;
      const c = this._bodyCenter(b.id);
      const d = c.distanceTo(ship.pos);
      const minD = b.radius * 0.9;
      if (d < minD) {
        // collision with planet: severe
        const spd = ship.vel.length();
        ship.pos.copy(c).add(tmpVec.subVectors(ship.pos, c).normalize().multiplyScalar(minD + 0.1));
        ship.vel.multiplyScalar(-0.12);
        const dmg = Math.min(60, spd * 0.5 + 10);
        this._damageHull(dmg);
        this.audio.play("crash");
        this.effects.burst(ship.pos, 0xff8844, { count: 20, speed: 4 });
        this.toast("⚠ HULL IMPACT — " + Math.round(dmg) + " damage", "warn", 3000);
        if (ship.hull <= 0) this._shipDestroyed();
        return;
      }
    }
    // asteroid collisions
    if (this.solar.asteroidField) {
      for (const a of this.solar.asteroidField.active()) {
        const d = a.mesh.position.distanceTo(ship.pos);
        if (d < a.radius + 1.0 && ship.vel.lengthSq() > 4) {
          const spd = ship.vel.length();
          this.effects.burst(ship.pos, 0xffaa66, { count: 14, speed: 3 });
          const dmg = Math.min(45, spd * 0.35);
          this._damageHull(dmg);
          this.audio.play("crash");
          // knock ship away
          ship.vel.addScaledVector(tmpVec.subVectors(ship.pos, a.mesh.position).normalize(), 6);
          ship.pos.copy(tmpVec.copy(a.mesh.position).add(tmpVec2.subVectors(ship.pos, a.mesh.position).normalize().multiplyScalar(a.radius + 1.2)));
          if (ship.hull <= 0) this._shipDestroyed();
          return;
        }
      }
    }
  }

  _damageHull(amount) {
    const ship = this.ship;
    if (ship.shield > 0) {
      ship.shield = Math.max(0, ship.shield - amount * 0.8);
      if (ship.shield <= 0) this.toast("SHIELD DOWN", "warn", 2000);
    } else {
      ship.hull = Math.max(0, ship.hull - amount);
    }
  }

  _shipDestroyed() {
    this.audio.play("crash");
    this.effects.burst(this.ship.pos, 0xffaa33, { count: 60, speed: 12, life: 2.2 });
    this.ship.group.visible = false;
    this.ship.dead = true;
    this.paused = true;
    const self = this;
    setTimeout(async () => {
      const yes = await self.screens.confirm({
        title: "SHIP DESTROYED",
        body: "Your hull was breached. The escape pod returns you to Earth orbit. Upgrades and credits are kept.",
        ok: "RESPAWN",
      });
      if (yes || true) {
        self.profile.credits = Math.floor(self.profile.credits * 0.85);
        self.ship.group.visible = true;
        self.ship.dead = false;
        self.shipState = null;
        self.mode = "menu";
        self._spawnShip();
        self.mode = "flight";
        self.paused = false;
        self.startFlight();
      }
    }, 800);
  }

  _regenShield(dt) {
    const ship = this.ship;
    if (ship.shield > 0 && ship.shield < this.profile.maxShield) {
      ship.shield = Math.min(this.profile.maxShield, ship.shield + SHIP.SHIELD_REGEN * dt);
    } else if (ship.shield <= 0) {
      // shield recharges after a short delay handled by damage flow; keep 0
    }
  }

  /* ------- auto orbit ------- */

  requestOrbit(bodyId) {
    const body = this.solar.getBody(bodyId);
    if (!body || body.isStar) return;
    const d = this._bodyCenter(bodyId).distanceTo(this.ship.pos) - body.radius;
    if (d > 200 && !this.autoOrbit) {
      this.toast(body.name.toUpperCase() + " is too far — use the map (M) for fast travel", "warn");
      return;
    }
    if (this.autoOrbit) this._releaseAutoOrbit();
    this._orbitPrevC = this._bodyCenter(bodyId, tmpVec).clone();
    this.autoOrbit = body;
    this.targetBody = bodyId;
    // seed velocity with circular orbit at current distance
    this._snapToOrbitVelocity(body);
    this.profile.markVisited(bodyId);
    if (this.discovery.grant("first-orbit")) {
      this._achievement("first-orbit");
    }
    // missions that require reaching / orbiting this body complete on entry
    const doneOrbit = this.missions.report("orbit", { body: bodyId });
    doneOrbit.forEach((d) => this._missionEvent("mission-complete", d));
    const doneMulti = this.missions.report("multi", { body: bodyId });
    doneMulti.forEach((d) => this._missionEvent("mission-complete", d));
    this.audio.play("arrive");
    this.toast("ORBIT established around " + body.name.toUpperCase(), "good");
  }

  _snapToOrbitVelocity(body) {
    const c = this._bodyCenter(body.id);
    const r = Math.max(c.distanceTo(this.ship.pos), body.radius * 1.05 + 0.5);
    const v = orbitSpeedFor(body, r);
    const t = orbitTangent(c, this.ship.pos, tmpVec2);
    this.ship.vel.copy(t).multiplyScalar(v);
    this._orientAlongVel();
  }

  _orientAlongVel() {
    if (this.ship.vel.lengthSq() < 1) return;
    const dir = this.ship.vel.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    this.ship.group.quaternion.slerp(q, 0.5);
  }

  _updateAutoOrbit(dt) {
    const body = this.autoOrbit;
    const c = this._bodyCenter(body.id);
    // follow the body's own motion (planets travel along their orbits)
    if (this._orbitPrevC) {
      this.ship.pos.add(tmpVec2.copy(c).sub(this._orbitPrevC));
    }
    this._orbitPrevC = c.clone();
    const r = Math.max(c.distanceTo(this.ship.pos), body.radius * 1.02 + 0.4);
    const vTarget = orbitSpeedFor(body, r);
    // current radial velocity
    const toC = tmpVec.subVectors(c, this.ship.pos).normalize();
    const radial = this.ship.vel.dot(toC);
    const tan = orbitTangent(c, this.ship.pos, tmpVec2);
    const tanV = this.ship.vel.dot(tan);
    // blend toward circular
    const blend = 1 - Math.exp(-dt * 1.6);
    this.ship.vel.addScaledVector(tan, (vTarget - tanV) * blend);
    this.ship.vel.addScaledVector(toC, -radial * Math.min(1, blend * 1.6));
    // altitude control with W/S
    const ctl = this.controller;
    const dAlt = (ctl.forward() ? 1 : 0) - (ctl.back() ? 1 : 0);
    if (dAlt) {
      const dir = tmpVec2.copy(this.ship.pos).sub(c).normalize();
      this.ship.pos.addScaledVector(dir, dAlt * 6 * dt);
      this.ship.vel.addScaledVector(dir, dAlt * 1.6 * dt);
    }
    if (ctl.brakeHeld() || ctl.strafeLeft() || ctl.strafeRight() || ctl.up() || ctl.down() || ctl.boostHeld()) {
      // any heavy control cancels orbit assist
      return "exit";
    }
    this._orientAlongVel();
    shipThrottleVisual(this.ship, ctl);
    this.audio.updateEngine(0, false, dt);
    return null;
  }

  _releaseAutoOrbit() {
    this.autoOrbit = null;
    this.audio.stopEngine();
  }

  /* ------- camera ------- */

  _flyCamera(dt) {
    const cam = this.camera;
    const ship = this.ship;
    if (this.cameraMode === "cockpit") {
      const fwd = ship.forward(tmpVec);
      const up = ship.up(tmpVec2);
      cam.position.copy(ship.pos).addScaledVector(fwd, 0.1).addScaledVector(up, 0.35);
      // face forward
      const look = tmpVec.clone().add(cam.position);
      cam.lookAt(ship.pos.clone().add(fwd.clone().multiplyScalar(30)));
      return;
    }
    if (this.cameraMode === "free") {
      // free-orbit camera around the ship, drag to look (mouse not locked)
      this._camFree.dist *= Math.pow(0.98, 1); // damping handled by wheel
      const pos = ship.pos.clone().add(tmpVec.set(
        Math.cos(this._camFree.yaw) * Math.cos(this._camFree.pitch) * this._camFree.dist,
        Math.sin(this._camFree.pitch) * this._camFree.dist,
        Math.sin(this._camFree.yaw) * Math.cos(this._camFree.pitch) * this._camFree.dist,
      ));
      cam.position.lerp(pos, 1 - Math.exp(-dt * 8));
      cam.lookAt(ship.pos);
      return;
    }
    // chase: behind the ship
    const back = new THREE.Vector3(0, 0, 4.6).applyQuaternion(ship.group.quaternion);
    const upV = new THREE.Vector3(0, 1, 0).applyQuaternion(ship.group.quaternion);
    const desired = ship.pos.clone().add(back).addScaledVector(upV, 1.15);
    const k = 1 - Math.exp(-dt * 7);
    cam.position.lerp(desired, k);
    const lookT = ship.pos.clone().addScaledVector(ship.forward(tmpVec), 14);
    cam.lookAt(lookT);
  }

  cycleCamera() {
    const modes = ["chase", "cockpit", "free"];
    const i = modes.indexOf(this.cameraMode);
    this.cameraMode = modes[(i + 1) % modes.length];
    this.toast("CAMERA: " + this.cameraMode.toUpperCase(), "", 1200);
  }

  setCameraFreeFromMouse(dx, dy) {
    if (this.cameraMode === "free") {
      this._camFree.yaw -= dx * 0.005;
      this._camFree.pitch = Math.max(-1.2, Math.min(1.2, this._camFree.pitch - dy * 0.005));
    }
  }

  /* ------- target / prompt / interact ------- */

  _bodyCenter(id, out = new THREE.Vector3()) {
    const b = this.solar.getBody(id);
    if (b) return this.solar.getBodyPosition(id, out);
    const st = this.solar.getStation(id);
    if (st) return out.copy(st.position);
    return out.set(0, 0, 0);
  }

  setTargetBody(id) {
    this.targetBody = id;
    const b = this.solar.getBody(id);
    const name = b ? b.name : (this.solar.getStation(id) || { name: id }).name;
    this.toast("TARGET SET: " + name.toUpperCase(), "", 1500);
  }

  // finds what's near the ship and sets this.prompt
  _updateNearest() {
    const ship = this.ship;
    if (!this.promptActiveAllowed()) { this.prompt = null; return; }
    const near = this.solar.nearbyObjects(ship.pos, 60);
    // priority: dock(0) < land(1) < mine(2) < orbit(3) < approach(4)
    let chosen = null;
    let best = Infinity;
    const consider = (cand, rank, dist) => {
      const score = rank * 1e5 + dist;
      if (score < best) { best = score; chosen = cand; }
    };
    for (const n of near) {
      if (n.type === "body") {
        const b = n.body;
        const surf = n.distance;
        if (surf < 1.6 && b.landing) {
          consider({ type: "land", body: b, text: `${b.name.toUpperCase()} — LAND [E]` }, 1, surf);
        } else if (surf < 16 && !b.isStar && surf > 0.2) {
          consider({ type: "orbit", body: b, text: `${b.name.toUpperCase()} — ENTER ORBIT [E]` }, 3, surf);
        } else {
          consider({ type: "approach", body: b }, 4, surf);
        }
      } else if (n.type === "station" && n.distance < 12) {
        consider({ type: "dock", station: n.station, text: `${n.station.name.toUpperCase()} — DOCK [E]` }, 0, n.distance);
      } else if (n.type === "asteroid" && n.distance < ASTEROID.MINE_RANGE + 1.5) {
        consider({ type: "mine", asteroid: n.asteroid, text: `${this._oreName(n.asteroid)} ASTEROID — MINE [E]` }, 2, n.distance);
      }
    }
    this.prompt = chosen || null;
    this.nearStation = chosen && chosen.type === "dock" ? chosen.station : null;
  }

  _oreName(a) {
    const keys = Object.keys(a.ore).filter((k) => k !== "other");
    const top = keys.length ? keys[0].toUpperCase() : "MINERAL";
    return top;
  }

  promptActiveAllowed() {
    if (this.mode !== "flight" || this.paused || this._warp || this.dockedStation) return false;
    return !this._landed;
  }

  interactButton() {
    if (this.mode === "landed") {
      this.takeOff();
      return;
    }
    if (this.prompt && this.mode === "flight") {
      if (this.prompt.type === "land") this.requestLand(this.prompt.body.id);
      else if (this.prompt.type === "orbit") this.requestOrbit(this.prompt.body.id);
      else if (this.prompt.type === "dock") this.openDock(this.prompt.station);
      else if (this.prompt.type === "mine") this.toggleMine(this.prompt.asteroid);
      else if (this.prompt.type === "approach" && this.prompt.body) {
        this.setTargetBody(this.prompt.body.id);
      }
      return;
    }
    // no prompt: if a target body is close enough, enter its orbit
    if (this.targetBody && !this.autoOrbit) {
      const body = this.solar.getBody(this.targetBody);
      const c = this._bodyCenter(this.targetBody);
      if (body && !body.isStar && c.distanceTo(this.ship.pos) < body.radius * 16 + 6) this.requestOrbit(this.targetBody);
    }
  }

  _interactFlight(dt) {
    if (!this.controller.consumeKey("KeyE")) return;
    if (this._warp || this._landed) return;
    this.interactButton();
  }

  /* ------- landing ------- */

  requestLand(bodyId) {
    const body = this.solar.getBody(bodyId);
    if (!body || !body.landing) return;
    this.audio.ensure();
    this.activity = null;
    this._releaseAutoOrbit();
    // remember where we landed relative to the body for a clean takeoff
    const hostPos = this._bodyCenter(bodyId, tmpVec);
    const offset = tmpVec2.copy(this.ship.pos).sub(hostPos);
    offset.y = Math.max(offset.y, 0);
    const radial = offset.length();
    if (radial < body.radius * 1.01) {
      this.toast("Too low to land safely — climb slightly", "warn");
      return;
    }
    // freeze that planet so the zone stays put (release on takeoff)
    this.solar.holdBody(bodyId);
    this._landed = { bodyId, radial };
    this.mode = "landed";
    this.ship.group.visible = false;
    // place zone at the planet's current spot
    const up = tmpVec2.copy(hostPos).normalize();
    const rig = this.landingZone.build(bodyId);
    rig.position.copy(hostPos).addScaledVector(up, body.radius + 0.5);
    rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    this.scene.add(rig);
    // spawn avatar at ship's touchdown point
    this.landingZone.setAvatarPose(this.ship.pos.clone(), Math.PI);
    this.landingZone.setAvatarActive(true);
    this.avatarHeading = Math.PI;
    this._landedPitch = -0.05;
    if (this.controller.pointerLock) document.exitPointerLock();
    if (!this.settings.phone) this.canvas.requestPointerLock && this.canvas.requestPointerLock();
    this.audio.play("land");
    this.profile.markVisited(bodyId);
    this.toast("Touchdown on " + body.name.toUpperCase() + " — walk with WASD, E to take off", "good", 3500);
    this.composeHud();
  }

  _updateLanded(dt) {
    if (this.paused) return; // a modal panel is open while walking
    const lz = this.landingZone;
    const ctl = this.controller;
    if (this.avatarHeading === undefined) this.avatarHeading = Math.PI;
    if (this._landedPitch === undefined) this._landedPitch = -0.05;

    // look input: pointer lock or mobile look stick
    if (this.controller.pointerLock) {
      this.avatarHeading -= this.controller._lockX * 0.0023;
      this._landedPitch = Math.max(-1.2, Math.min(1.2, this._landedPitch + this.controller._lockY * 0.0023));
      this.controller._lockX = 0;
      this.controller._lockY = 0;
    }
    if (Math.abs(ctl.lookAxis.x) > 0.01) this.avatarHeading -= ctl.lookAxis.x * 2.0 * dt;
    if (Math.abs(ctl.lookAxis.y) > 0.01) {
      this._landedPitch = Math.max(-1.2, Math.min(1.2, this._landedPitch + ctl.lookAxis.y * 1.4 * dt));
    }

    // avatar movement on plane (rig-local XZ)
    const speed = 3.4;
    let mx = ctl.strafeRight() - ctl.strafeLeft();
    let mz = ctl.forward() ? -1 : ctl.back() ? 1 : 0;
    if (ctl.moveAxis.x || ctl.moveAxis.y) {
      mx = ctl.moveAxis.x;
      mz = -ctl.moveAxis.y;
    }
    const sin = Math.sin(this.avatarHeading), cos = Math.cos(this.avatarHeading);
    const dx = (cos * -mz + sin * mx) * speed * dt;
    const dz = (sin * mz + cos * mx) * speed * dt;
    const av = lz.avatar;
    let nx = av.position.x + dx;
    let nz = av.position.z + dz;
    const lim = lz.radius - 1;
    if (Math.hypot(nx, nz) > lim) {
      const f = lim / Math.hypot(nx, nz);
      nx *= f; nz *= f;
    }
    av.position.x = nx;
    av.position.z = nz;
    av.rotation.y = this.avatarHeading;
    const moving = Math.abs(dx) + Math.abs(dz) > 0.001;
    if (moving) {
      this._walkT = (this._walkT || 0) + dt * 9;
      av.position.y = 0.02 + Math.abs(Math.sin(this._walkT)) * 0.05;
      if (this._walkDustT === undefined || this._walkDustT <= 0) {
        this._walkDustT = 0.16;
        this.effects.burst(av.getWorldPosition(new THREE.Vector3()), 0x777777, { count: 2, speed: 0.8, life: 0.4, size: 1 });
      }
      if (this._walkDustT) this._walkDustT -= dt;
    } else av.position.y = 0.01;

    // camera (first person, body-aligned up)
    const cam = this.camera;
    const eye = av.getWorldPosition(new THREE.Vector3());
    const aq = new THREE.Quaternion();
    av.getWorldQuaternion(aq);
    const upW = tmpVec2.set(0, 1, 0).applyQuaternion(aq);
    eye.addScaledVector(upW, 1.5);
    const k = 1 - Math.exp(-dt * 16);
    cam.position.lerp(eye, k);
    // forward rotated by look pitch, about the avatar's right axis
    const fwd = tmpVec.set(0, 0, -1).applyQuaternion(aq);
    const right = tmpVec2.set(1, 0, 0).applyQuaternion(aq);
    fwd.applyAxisAngle(right, this._landedPitch);
    cam.lookAt(eye.x + fwd.x * 30, eye.y + fwd.y * 30, eye.z + fwd.z * 30);

    // interact: E returns to the ship (anywhere on the zone)
    if (ctl.consumeKey("KeyE") || this._touchInteract) {
      this._touchInteract = false;
      this.takeOff();
    }
    this.landingZone.update(dt, ctl, true);
  }

  setLandedPitch(dy) {
    this._landedPitch = Math.max(-1.2, Math.min(1.2, (this._landedPitch || 0) - dy * 0.003));
  }

  takeOff() {
    const lz = this.landingZone;
    const body = this.solar.getBody(this._landed.bodyId);
    if (lz.avatar) {
      const p = lz.avatar.getWorldPosition(new THREE.Vector3());
      this.ship.group.position.copy(p);
      this.ship.group.position.y += 2.2;
      this.ship.group.quaternion.identity();
      this.ship.vel.set(0, 0, 0);
    }
    this.solar.releaseHeld(this._landed.bodyId);
    this.landingZone.dispose();
    this._landed = null;
    this.mode = "flight";
    this.ship.group.visible = true;
    this.ship.dead = false;
    this.toast("Back in space — " + (body ? body.name.toUpperCase() : "") + " below", "", 2000);
    this.audio.play("undock");
    if (!this.settings.phone && document.pointerLockElement !== this.canvas) {
      this.canvas.requestPointerLock && this.canvas.requestPointerLock();
    }
  }

  /* ------- dock / station ------- */

  openDock(station) {
    this.audio.play("dock");
    this.dockedStation = station;
    // keep ship in place; freeze physics
    this.paused = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.screens.openPanel("dock");
  }

  exitDock(leave = false) {
    if (this.dockedStation) {
      this.dockedStation = null;
      this.screens.closeModals();
      this.onModalOpen(false);
    }
    if (leave) {
      this.paused = false;
      this.audio.play("undock");
      if (!this.settings.phone) this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (this._warp) this._warp = null;
    } else {
      this.paused = false;
    }
    this.nearStation = null;
  }

  // Panels (map / missions / ship / codex / settings / info) pause the sim.
  onModalOpen(open) {
    if (this.mode !== "flight") return;
    if (open) {
      if (document.pointerLockElement) document.exitPointerLock();
      this.paused = true;
      this.audio.stopEngine();
    } else {
      // while docked, stay paused even with the menu closed
      this.paused = !!this.dockedStation;
    }
    this.screens.hidePause();
  }

  refreshHud() {
    this.composeHud();
    if (this.hud) this.hud.render(this.hudState);
  }

  /* ------- scanning ------- */

  tryScan() {
    // scan whatever is targeted or nearest
    if (this.activity && this.activity.kind === "scan") { this.activity = null; return; }
    let id = this.targetBody;
    if (!id || (this._bodyCenter(id).distanceTo(this.ship.pos) > SCANNER.RANGE)) {
      const near = this.solar.nearestBody(this.ship.pos, SCANNER.RANGE);
      if (near) id = near.id;
      else {
        this.toast("No body in scan range (" + fmtKm(SCANNER.RANGE) + " km)", "warn");
        return;
      }
    }
    this.startScanTarget(id);
  }

  startScanTarget(id) {
    const body = this.solar.getBody(id);
    if (!body && !this.solar.getStation(id)) {
      this.toast("Target not discovered", "warn");
      return;
    }
    // quick scan from panels or slow scan in flight
    this.audio.ensure();
    const inRange = this._bodyCenter(id).distanceTo(this.ship.pos) <= SCANNER.RANGE + 20;
    if (!inRange) {
      // long-range scan takes a moment
      this.activity = { kind: "scan", id, t: 0, need: 4, range: false };
      this.toast("Long-range scan started…", "");
    } else {
      this.activity = { kind: "scan", id, t: 0, need: SCANNER.TIME, range: true };
    }
  }

  _updateScan(dt) {
    const a = this.activity;
    if (!a) return;
    if (a.kind !== "scan") return;
    if (this.ship.energy <= 0) {
      this.toast("Energy depleted — scan aborted", "warn");
      this.activity = null;
      return;
    }
    // on-site scans drop out if you fly out of range
    if (a.range && this._bodyCenter(a.id).distanceTo(this.ship.pos) > SCANNER.RANGE + 40) {
      this.activity = null;
      this.toast("Out of scan range — scan aborted", "warn");
      return;
    }
    this.ship.energy -= dt * SCANNER.ENERGY_PER_SEC;
    a.t += dt * (a.range ? 1 : 0.6);
    if (this._scanTick <= 0) {
      this._scanTick = 0.16;
      this.audio.play("scanTick");
    } else this._scanTick -= dt;
    if (a.t >= a.need) {
      this._finishScan(a.id);
      this.activity = null;
      return;
    }
    this._scanBeam(a.id);
  }

  _scanBeam(id) {
    const c = this._bodyCenter(id);
    const dir = tmpVec.subVectors(c, this.ship.pos);
    const start = this.ship.pos.clone().addScaledVector(dir, 0);
    this.effects.beam(this.ship.pos.clone().add(tmpVec2.set(0, 0.2, -0.5).applyQuaternion(this.ship.group.quaternion)), start, 0x33e6ff, { life: 0.1, width: 0.02 });
  }

  _finishScan(id) {
    const discovered = this.discovery.markScanned(id);
    this.profile.markScanned(id);
    this.profile.addXp(30);
    if (this.discovery.grant("scanner")) this._achievement("scanner");
    if (discovered) {
      this.audio.play("discover");
      this.toast("NEW DISCOVERY: " + id.toUpperCase(), "good", 3500);
      this.screens._codexCard = true;
    } else {
      this.audio.play("scanDone");
      this.toast("SCAN COMPLETE — " + id.toUpperCase() + " logged to Codex", "good", 2600);
    }
    this.saveGame();
    // complete missions that require scans
    const done = this.missions.report("scan", { body: id });
    if (done.length) done.forEach((d) => this._missionEvent("mission-complete", d));
  }

  /* ------- mining ------- */

  toggleMine(asteroid) {
    if (this.activity && this.activity.kind === "mine") {
      this.activity = null;
      return;
    }
    this.activity = { kind: "mine", asteroid, t: 0 };
  }

  _updateMining(dt) {
    const a = this.activity;
    if (!a) return;
    const rock = a.asteroid;
    if (!rock || !rock.alive) { this.activity = null; return; }
    const d = rock.mesh.position.distanceTo(this.ship.pos);
    if (d > ASTEROID.MINE_RANGE + 2) {
      this.toast("Asteroid out of mining range", "warn");
      this.activity = null;
      return;
    }
    if (this.ship.energy <= 0.5) {
      this.toast("Energy depleted — mining stopped", "warn");
      this.activity = null;
      return;
    }
    this.ship.energy -= ASTEROID.ENERGY_PER_SEC * dt;
    a.t += dt;
    // laser beam
    const dir = tmpVec.subVectors(rock.mesh.position, this.ship.pos);
    this.effects.beam(this.ship.pos.clone().add(tmpVec2.set(0, 0.2, -0.5).applyQuaternion(this.ship.group.quaternion)), rock.mesh.position.clone(), 0xff5533, { life: 0.1 });
    this.effects.burst(rock.mesh.position.clone().add(tmpVec.copy(dir).normalize().multiplyScalar(rock.radius * 0.6)), 0xffaa55, { count: 3, speed: 2, life: 0.4, size: 1.4 });
    if (this._mineTick <= 0) {
      this._mineTick = 0.12;
      this.audio.play("mineTick");
    } else this._mineTick -= dt;
    if (a.t >= ASTEROID.SCAN_TIME) {
      a.t = 0;
      // yield ore
      const oreId = this._primaryOre(rock);
      const taken = this.profile.addCargo(oreId, ASTEROID.CYCLE_YIELD);
      if (taken > 0) {
        rock.amount -= taken;
        this.profile.stats.minedOre += taken;
        if (this.profile.stats.minedOre > 0 && this.discovery.grant("miner")) {
          this._achievement("miner");
        }
        this.discovery.unlockResource(this._primaryOre(rock));
        this.audio.play("mineDone");
        const done = this.missions.report("mine", { amount: taken });
        done.forEach((d) => this._missionEvent("mission-complete", d));
        this.effects.burst(rock.mesh.position.clone(), 0x88ffcc, { count: 10, speed: 3, life: 0.7 });
        if (rock.amount <= 0) {
          this.solar.asteroidField.deplete(rock);
          this.activity = null;
          this.toast("Asteroid depleted", "", 1500);
        }
        this.saveGame();
      } else {
        this.toast("Cargo full — sell at a station", "warn");
        this.activity = null;
      }
    }
  }

  _primaryOre(rock) {
    const keys = Object.keys(rock.ore || {}).filter((k) => k !== "other");
    return keys[0] || "iron";
  }

  /* ------- fast travel ------- */

  requestTravelTo(id) {
    // body (planet/moon) only
    const known = this.discovery.isKnown(id);
    if (!known) {
      this.toast("Destination not yet discovered", "warn");
      return;
    }
    const b = this.solar.getBody(id);
    if (!b || b.isStar) {
      // travel to station
      const st = this.solar.getStation(id);
      if (st) return this._confirmTravel(id, st.host.id);
      return;
    }
    this._confirmTravel(id, null);
  }

  async _confirmTravel(id, hostId) {
    const dist = this._bodyCenter(id).distanceTo(this.ship.pos);
    if (dist < FAST_TRAVEL.MIN_DISTANCE * 0.5) {
      this.toast("You are already there — set as target instead", "");
      this.setTargetBody(id);
      return;
    }
    const fuelNeeded = Math.ceil(dist * FAST_TRAVEL.FUEL_COST_PER_UNIT);
    const can = this.ship.fuel >= fuelNeeded;
    const time = Math.max(2, Math.round(dist / FAST_TRAVEL.SPEED));
    const b = this.solar.getBody(id) || this.solar.getStation(id);
    const name = b ? b.name : id;
    const bodyEl = el("div", "confirm-body");
    bodyEl.innerHTML = `
      <div class="ft-row"><span>Route</span><b>${name.toUpperCase()}</b></div>
      <div class="ft-row"><span>Distance</span><b>${fmtKm(dist)} km</b></div>
      <div class="ft-row"><span>Fuel required</span><b style="color:${can ? "var(--green)" : "var(--red)"}">${fuelNeeded} / ${Math.round(this.ship.fuel)}</b></div>
      <div class="ft-row"><span>Travel time</span><b>${time} s</b></div>`;
    const yes = await this.screens.confirm({
      title: "FAST TRAVEL — " + name.toUpperCase(),
      body: [bodyEl],
      ok: can ? "ENGAGE WARP" : "INSUFFICIENT FUEL",
      cancel: "CANCEL",
    });
    if (yes && can) {
      this.ship.fuel -= fuelNeeded;
      this._startWarp(id, hostId);
      this.saveGame();
    } else if (yes && !can) {
      this.audio.play("error");
      this.toast("Fuel needed: " + fuelNeeded, "warn");
    }
  }

  _startWarp(id, hostId) {
    this.audio.play("boost");
    this._releaseAutoOrbit();
    this.paused = false;
    const from = this.ship.pos.clone();
    const destCenter = this._bodyCenter(id, tmpVec).clone();
    const total = destCenter.distanceTo(from);
    const duration = Math.max(2.2, total / FAST_TRAVEL.SPEED);
    this._warp = { id, hostId, t: 0, from, to: destCenter, duration };
    this.activity = null;
    this.toast("WARP ENGAGED → " + id.toUpperCase(), "good", 2500);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  _updateWarp(dt) {
    const w = this._warp;
    if (!w) return;
    w.t += dt;
    const t = Math.min(1, w.t / Math.max(w.duration, 0.001));
    // warp along the path captured at ignition; arrival snaps to the body's
    // current position so planets that moved mid-warp don't cause a miss
    const pos = tmpVec.copy(w.from).lerp(w.to, t);
    this.ship.pos.copy(pos);
    this.ship.vel.set(0, 0, 0);
    // speed lines particles
    if (t < 1) {
      const fwd = this.ship.forward(tmpVec2);
      this.effects.burst(this.ship.pos.clone().addScaledVector(fwd, -3), 0x88ccff, { count: 3, speed: 6, life: 0.3, size: 1.2 });
      this.audio.updateEngine(1, true, dt);
    }
    if (t >= 1) {
      this._warp = null;
      this._arriveAt(w.id);
    }
  }

  _arriveAt(id) {
    const body = this.solar.getBody(id);
    const station = this.solar.getStation(id);
    this.ship.vel.set(0, 0, 0);
    if (body && !body.isStar) {
      // arrive on a nice orbit distance
      const c = this._bodyCenter(id, tmpVec);
      const dir = tmpVec2.copy(c).normalize();
      const arrR = body.radius * 3.2 + 4;
      this.ship.pos.copy(c).addScaledVector(dir, arrR + 3);
      const lat = tmpVec.set(Math.sin(this.simTime), 0, Math.cos(this.simTime)).normalize();
      this.ship.pos.addScaledVector(lat, body.radius);
      // face the body
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), tmpVec2.subVectors(c, this.ship.pos).normalize());
      this.ship.group.quaternion.slerp(q, 0.5);
    } else if (station) {
      this.ship.pos.copy(station.position);
      this.ship.pos.addScaledVector(tmpVec2.copy(station.position).normalize(), station.host.radius * 0.5 + 2);
    } else {
      this._bodyCenter(id, this.ship.pos);
    }
    this.audio.play("arrive");
    this.arrivedFlash = 1;
    this.effects.burst(this.ship.pos, 0x88ddff, { count: 40, speed: 8, life: 1.4 });
    this.targetBody = id;
    const done = this.missions.report("approach", { body: id, dist: 0 });
    done.forEach((d) => this._missionEvent("mission-complete", d));
    this._checkDiscoveries();
    this.profile.markVisited(id);
    this.toast("ARRIVED AT " + id.toUpperCase(), "good", 3000);
    if (!this.settings.phone) this.canvas.requestPointerLock && this.canvas.requestPointerLock();
  }

  /* ------- discovery from proximity ------- */

  _checkDiscoveries() {
    // reveal bodies when they come into view (closer than ~26 body radii)
    const ship = this.ship;
    for (const b of this.solar.bodies.values()) {
      if (b.id === "sun") continue;
      if (this.discovery.isKnown(b.id)) continue;
      const c = this._bodyCenter(b.id, tmpVec);
      const d = c.distanceTo(ship.pos);
      const range = Math.max(40, b.radius * 26);
      if (d < range) {
        const newly = this.discovery.reveal(b.id);
        if (newly) {
          this.solar.reveal(b.id);
          this.audio.play("discover");
          this.toast("☄ NEW BODY VISIBLE: " + b.name.toUpperCase() + " — fly closer to scan", "good", 4000);
          this.saveGame();
        }
      }
    }
    // stations become known once you reach their host system
    for (const st of this.solar.stations) {
      if (this.discovery.isKnown(st.id)) continue;
      const hostKnown = this.discovery.isKnown(st.host.id);
      if (!hostKnown || !st.group.visible) continue;
      const d = st.group.position.distanceTo(ship.pos);
      if (d < st.host.radius * 34 + 60) {
        this.discovery.markScanned(st.id);
        st.group.visible = true;
        this.audio.play("discover");
        this.toast("🛰 SIGNAL FOUND: " + st.name.toUpperCase(), "good", 4000);
        this.saveGame();
      }
    }
  }

  _missionProximity() {
    const actives = this.missions.getActiveDefs();
    for (const def of actives) {
      if (def.type === "proximity" || def.type === "approach" || def.type === "escape") {
        const body = def.target;
        const c = this._bodyCenter(body, tmpVec);
        const surfD = Math.max(0, c.distanceTo(this.ship.pos) - (this.solar.getBody(body) ? this.solar.getBody(body).radius : 0));
        const done = this.missions.report(def.type, { body, dist: surfD });
        done.forEach((d) => this._missionEvent("mission-complete", d));
      }
    }
  }

  _missionEvent(ev, def) {
    if (ev === "mission-accepted") {
      this.audio.play("ui");
      this.toast("MISSION ACCEPTED: " + def.name, "good", 2500);
    } else if (ev === "mission-complete") {
      this.audio.play("complete");
      this.toast("✓ MISSION COMPLETE: " + def.name + " — ◈ " + fmtNum(def.reward) + " · ⚡ " + def.xp, "good", 5000);
      this._missionCompleteFx();
      this.saveGame();
    }
  }

  _missionCompleteFx() {
    const p = this.ship.pos.clone();
    this.effects.burst(p, 0xffdd44, { count: 30, speed: 6, life: 1.6 });
  }

  _achievement(id) {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) return;
    this.audio.play("complete");
    this.toast("🏆 ACHIEVEMENT: " + a.name, "good", 4000);
    this.saveGame();
  }

  // Unlocks milestones from physical proximity (visited / approach).
  _proximityAchievements() {
    if (!this.ship || !this.discovery) return;
    const has = (id) => this.discovery.has(id);
    const near = {
      moon: "moonwalker", mars: "red-planet", jupiter: "giant-step", saturn: "ring-world",
    };
    for (const [bid, ach] of Object.entries(near)) {
      if (has(ach)) continue;
      const b = this.solar.getBody(bid);
      if (!b || !b.group.visible) continue;
      const c = this._bodyCenter(bid, tmpVec);
      if (c.distanceTo(this.ship.pos) < b.radius * 4 + 2) {
        this.profile.markVisited(bid);
        if (this.discovery.grant(ach)) this._achievement(ach);
      }
    }
    // all eight planets visited => SOLAR EXPLORER
    if (!has("solar-explorer")) {
      const planets = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
      if (planets.every((id) => this.profile.visited.includes(id))) {
        if (this.discovery.grant("solar-explorer")) this._achievement("solar-explorer");
      }
    }
    // cross the belt into the outer system
    if (!has("deep-space") && this.ship.pos.length() > 210) {
      if (this.discovery.grant("deep-space")) this._achievement("deep-space");
    }
  }

  /* ------- hull / other ------- */

  _autoSave(dt) {
    if (this.paused || this._warp || this.mode !== "flight") return;
    this._saveTimer -= dt;
    if (this._saveTimer <= 0) {
      this._saveTimer = 45;
      this.saveGame(false);
    }
  }

  saveGame(toast = true) {
    this.save.save("profile", this.profile.toJSON());
    this.save.save("discoveries", this.discovery.toSave());
    this.save.save("missions", this.missions.toSave());
    this.save.save("simTime", this.simTime);
    if (this.mode === "flight" && !this._warp) {
      const q = this.ship.group.quaternion;
      const v = this.ship.vel;
      const p = this.ship.pos;
      this.save.save("shipState", {
        pos: { x: p.x, y: p.y, z: p.z },
        quat: [q.x, q.y, q.z, q.w],
        vel: { x: v.x, y: v.y, z: v.z },
      });
    }
    if (toast) this.toast("💾 Progress saved", "good");
  }

  resetSave() {
    this.save.remove("profile");
    this.save.remove("discoveries");
    this.save.remove("missions");
    this.save.remove("shipState");
    this.save.remove("simTime");
    this.profile.reset();
    this.discovery = DiscoveryManager.fromSave(null);
    this.missions = MissionManager.fromSave(null, this.profile, (ev, def) => this._missionEvent(ev, def));
    this.screens.closeModals();
    this.toast("Save reset. Welcome back, cadet.", "", 2500);
    this.screens.refreshMenuFoot();
    this.saveGame(false);
  }

  toast(text, kind = "", ms) {
    if (this.toasts) this.toasts.show(text, { kind, ms });
  }

  /* ------- compose HUD ------- */

  composeHud() {
    const s = this.hudState;
    const p = this.profile;
    const ship = this.ship;
    const spd = ship.vel.length() * UNITS.ORBIT_KM;
    const obj = this.missions.activeMissionText();
    // distance & relspeed to target
    let targetInfo = null;
    if (this.targetBody) {
      const b = this.solar.getBody(this.targetBody);
      const st = this.solar.getStation(this.targetBody);
      const c = this._bodyCenter(this.targetBody, tmpVec);
      const d = c.distanceTo(ship.pos);
      const relV = ship.vel.length() * UNITS.ORBIT_KM;
      targetInfo = {
        name: (b ? b.name : st ? st.name : this.targetBody).toUpperCase(),
        dist: d,
        radiusKm: b ? Math.round(b.radius * 500) : null,
        relSpeed: relV,
        atmo: b ? (b.def && b.def.atmosphere ? "YES" : "NONE") : "—",
        kindColor: b ? (b.isStar ? "#ffd27a" : b.type === "moon" ? "#cfe6ff" : "#9ff0c8") : "#ffd97a",
      };
    }
    const activity = this.activity ? this._activityHud() : null;
    let promptText = null;
    let promptGood = false;
    if (this.mode === "landed") {
      promptText = "TAKEOFF — [E] returns you to the ship";
    } else if (this.prompt && this.prompt.text && this.mode === "flight" && !this.paused && !this.dockedStation) {
      promptText = this.prompt.text;
      promptGood = this.prompt.type === "dock";
    }
    const alt = this.solar.nearestBody(ship.pos, 400);
    Object.assign(s, {
      fuel: ship.fuel, fuelMax: p.maxFuel,
      energy: ship.energy, energyMax: p.maxEnergy,
      shield: ship.shield, shieldMax: p.maxShield,
      hull: ship.hull, hullMax: p.maxHull,
      credits: p.credits, xp: p.xp,
      speedKmS: spd, throttle: ship.throttle, boost: ship.boost,
      altBody: alt && !alt.isStar ? alt.name : null,
      altDist: alt ? Math.max(0, alt.distance) : null,
      objective: obj ? obj.text : null, objKind: "",
      target: targetInfo,
      prompt: promptText, promptGood,
      activity,
      fps: this._fps,
    });
  }

  _activityHud() {
    const a = this.activity;
    if (a.kind === "scan") {
      const pct = Math.min(1, a.t / a.need);
      return {
        title: "SCANNING — " + a.id.toUpperCase(),
        pct,
        html: `<div class="act-sub">${a.range ? "ON-SITE ANALYSIS" : "LONG-RANGE TELEMETRY"}</div>`,
      };
    }
    if (a.kind === "mine") {
      const rock = a.asteroid;
      const pct = Math.min(1, a.t / ASTEROID.SCAN_TIME);
      const ore = this._primaryOre(rock);
      return {
        title: "MINING",
        pct,
        html: `<div class="act-sub">${ore.toUpperCase()}: ${Math.max(0, rock.amount)} u remaining · Cargo ${this.profile.cargoTotal}/${this.profile.maxCargo}</div>`,
      };
    }
    return null;
  }

  _updateLabels() {
    const ship = this.ship;
    for (const b of this.solar.bodies.values()) {
      if (!b.labelSprite) continue;
      const c = this._bodyCenter(b.id, tmpVec);
      const d = c.distanceTo(ship.pos);
      b.labelSprite.visible = d < 130 && b.group.visible && !this._landed;
    }
    for (const st of this.solar.stations) {
      st.label.visible = st.group.visible && st.group.position.distanceTo(ship.pos) < 90 && !this._landed;
    }
  }

  /* ---------------- panels & keys ---------------- */

  openPanel(name) {
    if (!this.screens) return;
    this.screens.openPanel(name);
  }

  openBodyInfo(id) {
    this.pendingInfoId = id;
    this.screens.openPanel("info");
  }

  openInfoForTarget() {
    const id = this.targetBody || (this.solar.nearestBody(this.ship.pos, 120) || {}).id;
    if (!id) {
      this.toast("No target — press E near a body or open the map", "warn");
      return;
    }
    this.openBodyInfo(id);
  }

  _handleModeKeys() {
    if (this.paused) return;
    if (this.controller.consumeKey("KeyM")) {
      this.audio.play("click");
      this.openPanel("map");
    } else if (this.controller.consumeKey("KeyI")) {
      this.audio.play("click");
      this.openInfoForTarget();
    } else if (this.controller.consumeKey("KeyC")) {
      this.cycleCamera();
    } else if (this.controller.consumeKey("KeyR")) {
      this.audio.play("click");
      this.tryScan();
    }
  }

  // Ray-pick a body/station from screen coordinates (touch tap or paused click).
  pickBody(sx, sy) {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets = [];
    for (const b of this.solar.bodies.values()) {
      if (b.group.visible) targets.push(b.group);
    }
    for (const st of this.solar.stations) {
      if (st.group.visible) targets.push(st.group);
    }
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && o !== this.scene) {
        if (o.userData && o.userData.stationId) return o.userData.stationId;
        if (o.userData && o.userData.bodyId) return o.userData.bodyId;
        o = o.parent;
      }
    }
    // fall back: nearest projected body within 48 px of the tap (moons and
    // small bodies often miss the ray)
    const proj = tmpVec;
    let bestId = null;
    let bestPx = 48;
    const w = window.innerWidth, hh = window.innerHeight;
    const check = (pos, id) => {
      proj.copy(pos).project(this.camera);
      if (proj.z > 1 || proj.z < -1) return;
      const x = (proj.x * 0.5 + 0.5) * w;
      const y = (-proj.y * 0.5 + 0.5) * hh;
      const d = Math.hypot(x - sx, y - sy);
      if (d < bestPx) { bestPx = d; bestId = id; }
    };
    for (const b of this.solar.bodies.values()) {
      if (!b.group.visible) continue;
      check(this._bodyCenter(b.id), b.id);
    }
    for (const st of this.solar.stations) {
      if (!st.group.visible) continue;
      check(st.position, st.id);
    }
    return bestId;
  }

  setQuality(q) {
    this.settingsMgr.applyQuality(q);
    this.settings = this.settingsMgr.s;
    this.settings.quality = q;
    this.applyGraphics();
  }

  setFlag(key, value) {
    this.settings[key] = value;
    this.settingsMgr.ss.save("settings", this.settings);
    if (key === "shadows") this.renderer.shadowMap.enabled = value;
    this.applyGraphics();
  }

  setStars(v) {
    this.settings.stars = v;
    this.settingsMgr.ss.save("settings", this.settings);
    if (this.starfield) this.starfield.setDensity(v);
  }

  setAudio(kind, on) {
    if (kind === "sound") {
      this.settings.sound = on;
      this.audio.setEnabled(on);
      if (on) this.audio.ensure();
    } else {
      this.settings.music = on;
      this.audio.ensure();
      this.audio.setMusic(on);
    }
    this.settingsMgr.ss.save("settings", this.settings);
  }

  onTimeScaleChange() {
    this.settingsMgr.ss.save("settings", this.settings);
  }

  applyGraphics() {
    const s = this.settings;
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, s.quality === "low" ? 1 : 2));
      this.renderer.shadowMap.enabled = s.shadows;
    }
    if (this.starfield) this.starfield.setDensity(s.stars);
  }

  toggleAudio() {
    const next = !this.settings.sound;
    this.setAudio("sound", next);
    return next;
  }

  // Called by pause overlay "sound" toggle
  get audioOn() {
    return this.settings.sound;
  }
}

/* helpers */
function shipThrottleVisual(ship, ctl) {
  ship.throttle = ctl.forward() ? 1 : 0;
  ship.boost = 0;
  ship.setEngineVisual(ship.throttle, 0);
}

const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
