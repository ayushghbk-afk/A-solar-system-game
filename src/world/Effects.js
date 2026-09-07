// Lightweight pooled GPU particle system + laser beams for visual effects.
// Everything runs from one BufferGeometry with custom shader attributes.
import * as THREE from "three";

const MAX_PARTICLES = 900;
const VERT = `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (240.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}`;

export class Effects {
  // The particle pool is allocated lazily on first use — boot pays nothing
  // for effects, and a session that never triggers a burst never uploads a
  // particle buffer at all.
  constructor(scene) {
    this.scene = scene;
    this._beams = [];
    this._active = 0;
    this._init = false;
  }

  _ensure() {
    if (this._init) return;
    this._init = true;
    this._particles = new Float32Array(MAX_PARTICLES * 3);
    this._colors = new Float32Array(MAX_PARTICLES * 3);
    this._sizes = new Float32Array(MAX_PARTICLES);
    this._alphas = new Float32Array(MAX_PARTICLES);
    this._life = new Float32Array(MAX_PARTICLES);
    this._maxLife = new Float32Array(MAX_PARTICLES);
    this._vel = new Float32Array(MAX_PARTICLES * 3);
    this._drag = new Float32Array(MAX_PARTICLES);
    this._grav = new Float32Array(MAX_PARTICLES);
    this._cursor = 0;

    const geo = new THREE.BufferGeometry();
    this._geo = geo;
    geo.setAttribute("position", new THREE.BufferAttribute(this._particles, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this._colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this._sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this._alphas, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this._points = new THREE.Points(geo, mat);
    this._points.frustumCulled = false;
    this.scene.add(this._points);
  }

  // Spawn a burst of particles.
  burst(pos, color, { count = 24, speed = 9, size = 2.2, life = 1.1, up = 2, spread = 1, gravity = 0 } = {}) {
    this._ensure();
    for (let i = 0; i < count; i++) {
      const idx = this._alloc();
      if (idx < 0) return;
      this._particles[idx * 3] = pos.x;
      this._particles[idx * 3 + 1] = pos.y;
      this._particles[idx * 3 + 2] = pos.z;
      const c = new THREE.Color(color);
      const j = Math.random() * 0.35 + 0.65;
      this._colors[idx * 3] = c.r * j;
      this._colors[idx * 3 + 1] = c.g * j;
      this._colors[idx * 3 + 2] = c.b * j;
      this._sizes[idx] = size * (0.5 + Math.random() * 0.8);
      const maxLife = life * (0.6 + Math.random() * 0.6);
      this._life[idx] = maxLife;
      this._maxLife[idx] = maxLife;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1) * spread;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this._vel[idx * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this._vel[idx * 3 + 1] = Math.cos(ph) * sp * up;
      this._vel[idx * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      this._grav[idx] = gravity;
      this._active++;
    }
    this._geo.setDrawRange(0, this._countAlloc());
  }

  _alloc() {
    // ring buffer allocation skipping alive entries is complex; we scan the
    // whole pool each time looking for a dead slot (fast enough for bursts)
    for (let tries = 0; tries < 120; tries++) {
      const idx = this._cursor;
      this._cursor = (this._cursor + 1) % MAX_PARTICLES;
      if (this._life[idx] <= 0) return idx;
    }
    return -1;
  }

  _countAlloc() {
    return MAX_PARTICLES;
  }

  // Additive beam from -> to.
  beam(from, to, color, { life = 0.16, width = 0.12 } = {}) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this._beams.push({ line, life, maxLife: life });
    return line;
  }

  update(dt) {
    // particles (pool may not exist yet if nothing has burst)
    if (this._init) {
      const gpos = this._geo.attributes.position;
      const gcol = this._geo.attributes.aColor;
      const galpha = this._geo.attributes.aAlpha;
      let changed = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (this._life[i] <= 0) continue;
        this._life[i] -= dt;
        if (this._life[i] <= 0) {
          this._alphas[i] = 0;
          this._active--;
          changed = true;
          continue;
        }
        const l = this._life[i];
        const maxL = this._maxLife[i];
        this._vel[i * 3 + 1] -= this._grav[i] * dt;
        this._particles[i * 3] += this._vel[i * 3] * dt;
        this._particles[i * 3 + 1] += this._vel[i * 3 + 1] * dt;
        this._particles[i * 3 + 2] += this._vel[i * 3 + 2] * dt;
        this._alphas[i] = (l / maxL);
        changed = true;
      }
      if (changed) {
        gpos.needsUpdate = true;
        gcol.needsUpdate = true;
        galpha.needsUpdate = true;
      }
    }
    // beams
    for (let i = this._beams.length - 1; i >= 0; i--) {
      const b = this._beams[i];
      b.life -= dt;
      b.line.material.opacity = Math.max(0, (b.life / b.maxLife) * 0.9);
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        b.line.material.dispose();
        this._beams.splice(i, 1);
      }
    }
  }

  dispose() {
    if (this._init) {
      this.scene.remove(this._points);
      this._geo.dispose();
      this._points.material.dispose();
    }
    for (const b of this._beams) {
      this.scene.remove(b.line);
      b.line.geometry.dispose();
      b.line.material.dispose();
    }
    this._beams.length = 0;
  }
}
