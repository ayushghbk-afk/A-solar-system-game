// Procedural starfield + nebula backdrop. The whole backdrop is parented to
// the camera so there is no parallax — the stars feel infinitely far away.
import * as THREE from "three";
import { makeStarTexture } from "./assets.js";
import { STARFIELD, starCountFor } from "../game/config.js";
import { mulberry } from "./assets.js";

export class Starfield {
  constructor(scene, quality = "high", phone = false) {
    this.scene = scene;
    this.quality = quality;
    this.phone = phone;
    this.group = new THREE.Group();
    this.group.name = "Starfield";
    this.points = null;
    this.nebulae = [];
    this._starTex = makeStarTexture();
    this._makeNebula();
    this._makeStars(starCountFor(quality, phone));
    this.group.position.set(0, 0, 0);
    scene.add(this.group);
  }

  setDensity(level) {
    this._makeStars(starCountFor(level, this.phone));
  }

  _makeStars(count) {
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
    }
    const rnd = mulberry(1337);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const S = STARFIELD.SIZE;
    for (let i = 0; i < count; i++) {
      // place on a large shell (with a soft sphere-ish distribution)
      const rad = S * (0.55 + rnd() * 0.45);
      const theta = rnd() * Math.PI * 2;
      const phi = Math.acos(2 * rnd() - 1);
      positions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = rad * Math.cos(phi) * 0.85;
      positions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
      const t = rnd();
      let r = 0.85 + rnd() * 0.25, g = 0.85 + rnd() * 0.25, b = 0.9 + rnd() * 0.2;
      if (t > 0.92) { r = 1; g = 0.75 + rnd() * 0.2; b = 0.5 + rnd() * 0.2; } // warm
      else if (t < 0.06) { r = 0.65; g = 0.75; b = 1; } // cool
      const tw = 0.35 + rnd() * 0.65; // brightness will be animated via material
      colors[i * 3] = r * tw; colors[i * 3 + 1] = g * tw; colors[i * 3 + 2] = b * tw;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.4,
      map: this._starTex,
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  _makeNebula() {
    const texs = [
      this._soft(0.16, 0.1, 0.5),
      this._soft(0.05, 0.12, 0.4),
      this._soft(0.4, 0.12, 0.18),
    ];
    const rnd = mulberry(4242);
    const S = STARFIELD.SIZE * 0.62;
    for (let i = 0; i < 16; i++) {
      const tex = texs[i % texs.length];
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        opacity: 0.16 + rnd() * 0.2,
        depthWrite: false,
        fog: false,
        blending: THREE.AdditiveBlending,
      });
      const spr = new THREE.Sprite(mat);
      const a = rnd() * Math.PI * 2;
      const b = Math.acos(2 * rnd() - 1);
      const rad = S * (0.8 + rnd() * 0.5);
      spr.position.set(rad * Math.sin(b) * Math.cos(a), rad * Math.cos(b) * 0.7, rad * Math.sin(b) * Math.sin(a));
      const s = 500 + rnd() * 900;
      spr.scale.set(s, s * (0.6 + rnd() * 0.7), 1);
      this.nebulae.push(spr);
      this.group.add(spr);
    }
  }

  _soft(r, g, b) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},1)`);
    grad.addColorStop(0.5, `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},0.4)`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Called every frame: keep the backdrop centred on the camera.
  update(cameraPos) {
    this.group.position.copy(cameraPos);
    // gentle twinkle
    const t = performance.now() * 0.001;
    const m = this.points.material;
    m.size = 2.4 + Math.sin(t * 1.7) * 0.18;
  }

  setQuality(q) {
    this.quality = q;
    this.setDensity(q === "low" ? "low" : q === "high" ? "high" : "medium");
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.points) {
      this.points.geometry.dispose();
      this.points.material.dispose();
    }
    for (const n of this.nebulae) n.material.map?.dispose?.();
    this._starTex.dispose();
  }
}
