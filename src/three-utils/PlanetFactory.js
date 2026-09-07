// Builds Three.js objects for every body in the solar system from bodyData.
// All textures are procedural (see assets.js) so there is nothing to fetch.
import * as THREE from "three";
import {
  makePlanetTexture, makeEarthTextures, makeCloudTexture, makeGasTexture,
  makeMoonTexture, makeSunTexture, makeGlowTexture, makeRingTexture,
  makeLabelSprite,
} from "./assets.js";
import { PLANET_DEFS, MOON_DEFS } from "../game/bodyData.js";

const TAU = Math.PI * 2;

export const TEX_SIZES = { low: 256, medium: 512, high: 1024 };

export class PlanetFactory {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings; // GraphicsSettings (quality + flags)
    this.bodies = new Map(); // id -> Planet object (runtime state)
    this._defs = new Map();
    for (const p of PLANET_DEFS) this._defs.set(p.id, p);
    for (const k of Object.keys(MOON_DEFS)) {
      this._defs.set(k, { id: k, ...MOON_DEFS[k] });
    }
    this._keyToSpec = new Map(); // quality-key -> generated texture helper result
  }

  /* ---------------- public API ---------------- */

  makeAll() {
    for (const def of PLANET_DEFS) {
      const body = this.buildBody(def, null);
      if (body) this.bodies.set(def.id, body);
    }
    // Moons must be built after their host planets exist (host set on build).
    for (const def of PLANET_DEFS) {
      for (const mId of def.moons || []) {
        const host = this.bodies.get(def.id);
        const moonDef = this._defs.get(mId);
        if (!moonDef || !host) continue;
        const moon = this.buildBody(moonDef, host);
        this.bodies.set(mId, moon);
        host.moons.push(moon);
        moon.parentPlanet = host;
      }
    }
    this._makeStationPart();
    return this.bodies;
  }

  buildBody(def, host) {
    const q = this._qualityKey();
    const isStar = def.id === "sun";
    const isGas = ["jupiter", "saturn", "uranus", "neptune"].includes(def.id);
    const isEarth = def.id === "earth";
    const isMoon = !PLANET_DEFS.find((p) => p.id === def.id);

    const radius = Math.max(0.5, def.radius);
    const group = new THREE.Group();

    // --- surface mesh ---
    const texSpec = this._surface(def, q, isGas, isEarth, isMoon);
    let material;
    if (isStar) {
      material = new THREE.MeshBasicMaterial({ map: texSpec.tex, color: 0xffffff });
    } else {
      material = new THREE.MeshStandardMaterial({
        map: texSpec.tex,
        roughness: def.id === "venus" ? 0.9 : 0.96,
        metalness: 0,
      });
    }
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
    mesh.name = def.name;
    group.add(mesh);
    // Axial tilt: applied once to the mesh + atmosphere extras (moons keep
    // their own orbital plane). Self-spin is mesh.rotation.y in SolarSystem.
    mesh.rotation.x = def.tilt || 0;

    // --- extras ---
    const extras = { clouds: null, night: null, rings: null, glowSprite: null, ringMesh: null };

    if (isStar) {
      mesh.material.toneMapped = false;
      extras.glowSprite = this._makeGlow(def, radius);
      group.add(extras.glowSprite);
    } else if (isEarth) {
      // clouds + night lights layered above day texture
      const cloudMat = new THREE.MeshStandardMaterial({
        map: texSpec.clouds,
        transparent: true, opacity: 0.85, depthWrite: false,
      });
      extras.clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.03, 40, 26), cloudMat);
      extras.clouds.name = `${def.name} clouds`;
      extras.clouds.rotation.x = def.tilt || 0;
      group.add(extras.clouds);
      const nightMat = new THREE.MeshBasicMaterial({
        map: texSpec.night, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      });
      extras.night = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.002, 40, 26), nightMat);
      extras.night.name = `${def.name} night lights`;
      extras.night.rotation.x = def.tilt || 0;
      group.add(extras.night);
    } else if (def.atmosphere && !isMoon && !def.star) {
      // gas giants keep clouds inside the texture; rocky bodies get glow
      extras.glowSprite = this._makeGlow(def, radius);
      group.add(extras.glowSprite);
    }
    // Atmosphere glow for every world with an atmosphere value
    if (def.atmosphere && def.id !== "sun" && !isEarth && !isGas) {
      if (!extras.glowSprite) {
        extras.glowSprite = this._makeGlow(def, radius);
        group.add(extras.glowSprite);
      }
    }

    // --- rings ---
    if (def.rings) {
      extras.rings = this._makeRings(def, radius);
      group.add(extras.rings.mesh);
    }

    // --- state that the sim mutates ---
    const body = {
      id: def.id,
      name: def.name,
      def,
      radius,
      group,
      mesh,
      extras,
      type: isMoon ? "moon" : isStar ? "star" : "planet",
      isStar,
      parentPlanet: host || null,
      orbitRadius: def.orbit || 0,
      // orbital phase derived deterministically from the body id
      phase: this._phase(def.id, host),
      angle: 0,
      rotY: 0,
      tiltAxis: def.tilt || 0,
      periodYears: def.periodYears || 1,
      atmosphere: def.atmosphere || null,
      landing: !!def.landing,
      // moon helper values
      periodDays: def.periodDays || 0,
      anchorOffset: new THREE.Vector3(),
      labelSprite: null,
    };

    group.userData.bodyId = def.id;
    return body;
  }

  // Builds a world-space anchor for the given body and attaches geometry.
  addToWorld(body) {
    this.scene.add(body.group);
    // moon anchors: host group (with label) + this group
    if (body.parentPlanet) {
      const host = body.parentPlanet;
      const anchor = new THREE.Group();
      anchor.name = `${body.name} anchor`;
      // arrange moons on a tilted disc so the system looks natural
      anchor.rotation.z = Math.PI * 0.09 + body.phase * 0.0;
      anchor.rotation.x = Math.sin(body.phase * 13.7) * 0.22 + 0.06;
      host.group.add(anchor);
      body.anchor = anchor;
      anchor.add(body.group);
    }
    if (!body.isStar) {
      // labels: worlds that need identification from far away
      if (body.type === "planet" || (body.def && body.def.landing) || ["moon", "titan", "europa"].includes(body.id)) {
        body.labelSprite = makeLabelSprite(body.name.toUpperCase(), this._labelColor(body), body.radius * 0.9 + 2.2);
        body.labelSprite.position.y = body.radius * 1.45;
        body.group.add(body.labelSprite);
        body.labelSprite.visible = false; // shown when close enough
      }
    }
    return body;
  }

  setLabelVisibility(body, show) {
    if (body.labelSprite) body.labelSprite.visible = show;
  }

  setLabelsVisible(show) {
    for (const b of this.bodies.values()) {
      if (b.labelSprite) b.labelSprite.visible = show && !b._alwaysLabel;
    }
  }

  dispose() {
    for (const b of this.bodies.values()) {
      this.scene.remove(b.group);
      disposeGroup(b.group);
    }
    this.bodies.clear();
  }

  /* ---------------- internal helpers ---------------- */

  _qualityKey() {
    const s = this.settings;
    return `${s.planetQuality}|${s.shadows}|${s.bloom}`;
  }

  _phase(id, host) {
    // stable pseudo-random starting angle per body
    let h = 0;
    const str = (host ? host.id + ":" : "") + id;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return (h % 1000) / 1000 * TAU;
  }

  _surface(def, q, isGas, isEarth, isMoon) {
    // cache textures by id so rebuilding after quality change reuses nothing
    // (we cache across quality by clearing on change instead)
    const size = TEX_SIZES[this.settings.planetQuality] || TEX_SIZES.medium;
    const key = def.id + "|" + q;
    if (this._cache && this._cache.has(key)) return this._cache.get(key);
    if (!this._cache) this._cache = new Map();
    let spec;
    if (def.id === "sun") {
      spec = { tex: makeSunTexture(size) };
    } else if (isEarth) {
      const e = makeEarthTextures(size);
      spec = { tex: e.day, night: e.night, elev: e.elev, clouds: makeCloudTexture(size / 2, 0.6) };
    } else if (isGas) {
      const bands = {
        jupiter: { bands: ["#c8a98a", "#efe0d0", "#a5714f", "#e4c6a8"], spot: true },
        saturn: { bands: ["#d8c49a", "#efe4c8", "#c0a878", "#f0e6c8"], spot: false },
        uranus: { bands: ["#8fdcdc", "#a8e6e6", "#7ccaca", "#c2f0f0"], spot: false },
        neptune: { bands: ["#3d55d8", "#5f7ae8", "#2c3fa8", "#87a0f0"], spot: true },
      }[def.id] || {};
      spec = { tex: makeGasTexture({ id: def.id, ...bands }, size * 2) };
    } else if (isMoon) {
      const cratered = ["moon", "phobos", "callisto", "enceladus", "triton", "deimos", "ganymede"].includes(def.id);
      spec = { tex: makeMoonTexture(def, size, cratered) };
    } else {
      const continents = def.id === "mars";
      spec = { tex: makePlanetTexture(def, size, { continents }) };
    }
    this._cache.set(key, spec);
    return spec;
  }

  _makeGlow(def, radius) {
    const colorMap = {
      sun: ["rgba(255,190,90,0.9)", "rgba(255,120,20,0)"],
      mercury: ["rgba(255,235,220,0.4)", "rgba(255,220,180,0)"],
      venus: ["rgba(255,230,170,0.55)", "rgba(255,200,120,0)"],
      mars: ["rgba(255,140,90,0.4)", "rgba(255,120,70,0)"],
      jupiter: ["rgba(255,215,170,0.35)", "rgba(255,190,140,0)"],
      saturn: ["rgba(255,235,200,0.35)", "rgba(255,215,170,0)"],
      uranus: ["rgba(170,240,255,0.45)", "rgba(140,220,255,0)"],
      neptune: ["rgba(130,160,255,0.4)", "rgba(120,150,255,0)"],
      io: ["rgba(255,240,170,0.5)", "rgba(255,220,140,0)"],
      europa: ["rgba(200,230,255,0.4)", "rgba(180,210,255,0)"],
      ganymede: ["rgba(200,200,220,0.35)", "rgba(180,180,210,0)"],
      callisto: ["rgba(180,180,200,0.3)", "rgba(160,160,190,0)"],
      titan: ["rgba(255,200,90,0.5)", "rgba(240,180,80,0)"],
      enceladus: ["rgba(230,245,255,0.45)", "rgba(210,230,255,0)"],
      triton: ["rgba(190,240,240,0.4)", "rgba(170,220,230,0)"],
    };
    const cols = colorMap[def.id] || ["rgba(200,220,255,0.3)", "rgba(180,200,255,0)"];
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(cols[0], cols[1]),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    const glowScale = def.id === "sun" ? radius * 7.5 : radius * (2.3 + (def.atmosphere ? 0.55 : 0));
    spr.scale.set(glowScale, glowScale, 1);
    return spr;
  }

  _makeRings(def, radius) {
    const inner = def.id === "saturn" ? radius * 1.25 : radius * 1.5;
    const outer = def.id === "saturn" ? radius * 2.35 : radius * 1.9;
    const geo = new THREE.RingGeometry(inner, outer, 96, 1);
    const tex = makeRingTexture(null, 512);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, side: THREE.DoubleSide, transparent: true,
      opacity: def.id === "saturn" ? 0.9 : 0.55,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2.15;
    return { mesh, tex, mat };
  }

  _labelColor(body) {
    if (body.id === "earth") return "#aef0ff";
    if (body.id === "mars") return "#ffb08a";
    return "#cfe6ff";
  }

  _makeStationPart() {
    // nothing (stations built by SolarSystem using makeLabelSprite here)
  }
}

function disposeGroup(root) {
  root.traverse((obj) => {
    if (obj.isMesh || obj.isSprite) {
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else if (m) m.dispose();
      if (obj.geometry) obj.geometry.dispose();
    }
  });
}
