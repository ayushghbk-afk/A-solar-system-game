// The player's spacecraft: a small reusable mesh + physical state holder.
// All flight logic lives in ShipPhysics / ShipController; this class only
// owns the visuals and the values that describe "where the ship is".
import * as THREE from "three";
import { UNITS, PHYS } from "../game/config.js";

export class Ship {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = "Ship";
    this._build();
    scene.add(this.group);

    this.vel = new THREE.Vector3();
    this.accel = new THREE.Vector3();
    this.gravityAccel = new THREE.Vector3();
    this.throttle = 0; // 0..1 engine power
    this.boost = 0; // 0..1 boost power
    this.running = true;
    this.dead = false;
    // survivability numbers (re-seeded by Game from the profile on spawn)
    this.fuel = 0;
    this.hull = 100;
    this.shield = 100;
    this.energy = 100;

    // cosmetic
    this._trail = [];
    this._trailLast = new THREE.Vector3();
    this._trailTimer = 0;

    // Default pose: floating above Earth's near side, engine burning down.
    this.resetPose();
  }

  get pos() {
    return this.group.position;
  }

  get quat() {
    return this.group.quaternion;
  }

  resetPose(pos = new THREE.Vector3(0, 8, 128), quat = null) {
    this.group.position.copy(pos);
    if (quat) this.group.quaternion.copy(quat);
    else this.group.quaternion.identity();
    this.vel.set(0, 0, 0);
    this.throttle = 0;
    this.boost = 0;
    this.dead = false;
    this.running = true;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.group.quaternion);
  }

  up(out = new THREE.Vector3()) {
    return out.set(0, 1, 0).applyQuaternion(this.group.quaternion);
  }

  right(out = new THREE.Vector3()) {
    return out.set(1, 0, 0).applyQuaternion(this.group.quaternion);
  }

  speed() {
    return this.vel.length();
  }

  setEngineVisual(throttle, boost) {
    const on = throttle > 0.01 || boost > 0.01;
    this._engineGlow.material.opacity = on ? Math.min(1, throttle * 0.75 + boost) : 0.05;
    const s = 0.7 + throttle * 1.6 + boost * 3.2;
    this._engineGlow.scale.set(s, s, 1);
    this._engineCore.material.opacity = on ? 0.4 + throttle * 0.5 : 0;
    this._engineCore.scale.set(1, 1, 1);
  }

  _build() {
    const g = this.group;
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xd8dee4, metalness: 0.55, roughness: 0.35,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x5a6a76, metalness: 0.6, roughness: 0.5,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x1f8fe0, emissive: 0x06283f, metalness: 0.3, roughness: 0.4,
    });

    // fuselage along Z, nose at -Z
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.9, 10), hullMat);
    body.geometry.rotateX(Math.PI / 2);
    body.position.z = 0.1;
    g.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.75, 10), hullMat);
    nose.geometry.rotateX(-Math.PI / 2);
    nose.position.z = -1.25;
    g.add(nose);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), accentMat);
    canopy.scale.set(0.9, 0.7, 1.4);
    canopy.position.set(0, 0.22, -0.45);
    g.add(canopy);

    // wings
    const wingGeo = new THREE.BoxGeometry(0.06, 0.9, 1.2);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, darkMat);
      wing.position.set(side * 0.55, -0.1, 0.35);
      wing.rotation.z = side * 0.2;
      g.add(wing);
    }
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.5), darkMat);
    fin.position.set(0, 0.16, 0.7);
    g.add(fin);

    // engine ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 6, 14), darkMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.z = 1.1;
    g.add(ring);

    // engine glow sprites (additive, fog off)
    const glowTex = this._glowTex(255, 150, 60);
    const coreTex = this._glowTex(255, 240, 220);
    const coreMat = new THREE.SpriteMaterial({
      map: coreTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0,
    });
    this._engineCore = new THREE.Sprite(coreMat);
    this._engineCore.scale.set(1.4, 1.4, 1);
    this._engineCore.position.z = 1.5;
    g.add(this._engineCore);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.05, fog: false,
    });
    this._engineGlow = new THREE.Sprite(glowMat);
    this._engineGlow.scale.set(1.6, 1.6, 1);
    this._engineGlow.position.z = 1.5;
    g.add(this._engineGlow);

    // nav lights
    const lightGeo = new THREE.SphereGeometry(0.05, 6, 6);
    for (const [side, color] of [[-1, 0xff2233], [1, 0x22ff66]]) {
      const lm = new THREE.MeshBasicMaterial({ color });
      const l = new THREE.Mesh(lightGeo, lm);
      l.position.set(side * 0.42, -0.05, 0.8);
      g.add(l);
    }

    // trail system
    const trailGeo = new THREE.BufferGeometry();
    this._trailGeo = trailGeo;
    this._trailCount = 0;
    const maxTrail = 110;
    this._trailPos = new Float32Array(maxTrail * 3);
    this._trailCol = new Float32Array(maxTrail * 3);
    this._trailGeo.setAttribute("position", new THREE.BufferAttribute(this._trailPos, 3));
    this._trailGeo.setAttribute("color", new THREE.BufferAttribute(this._trailCol, 3));
    this._trailGeo.setDrawRange(0, 0);
    const trailMat = new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true,
      opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this._trailPoints = new THREE.Points(this._trailGeo, trailMat);
    this._trailPoints.frustumCulled = false;
    this._trailPoints.name = "Ship trail";
    // trail lives in world space, so it can't be a child of the moving ship
    this.scene.add(this._trailPoints);
    this._trailIndex = 0;
    this._trailAlive = [];
    this._trailAges = [];
    this._trailLifes = [];
  }

  _glowTex(r, g, b) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
    grad.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Simple additive particle trail behind the engine.
  updateTrail(dt, worldSpeedSq) {
    const active = this.throttle > 0.02 || this.boost > 0.02;
    this._trailTimer -= dt;
    if (active && this._trailTimer <= 0) {
      this._trailTimer = 0.028;
      // pick a point behind the ship (opposite to velocity if moving)
      const back = new THREE.Vector3(0, 0, 1.4).applyQuaternion(this.group.quaternion);
      const p = this.group.position.clone().add(back);
      this._pushTrail(p.x, p.y, p.z, 1, 0.55, 0.15);
    }
    // fade existing particles (shift colors toward 0)
    const n = this._trailAlive.length;
    for (let i = 0; i < n; i++) {
      const idx = this._trailAlive[i];
      const age = this._trailAges[i];
      const life = this._trailLifes[i];
      const t = 1 - age / life;
      const j = idx * 3;
      const fade = Math.max(0, Math.min(1, t * 2 - 0.6)) * 0.9;
      this._trailCol[j] *= 0.9;
      this._trailCol[j + 1] *= 0.9;
      this._trailCol[j + 2] *= 0.9;
      this._trailAges[i] = age + dt;
      if (age >= life) {
        this._trailAlive.splice(i, 1);
        this._trailAges.splice(i, 1);
        this._trailLifes.splice(i, 1);
        break;
      }
    }
    this._trailGeo.attributes.color.needsUpdate = true;
  }

  _pushTrail(x, y, z, r, g, b) {
    const idx = this._trailIndex;
    this._trailPos[idx * 3] = x;
    this._trailPos[idx * 3 + 1] = y;
    this._trailPos[idx * 3 + 2] = z;
    this._trailCol[idx * 3] = r;
    this._trailCol[idx * 3 + 1] = g;
    this._trailCol[idx * 3 + 2] = b;
    this._trailIndex = (idx + 1) % (this._trailPos.length / 3);
    if (this._trailAlive.indexOf(idx) === -1) {
      this._trailAlive.push(idx);
      this._trailAges.push(0);
      this._trailLifes.push(1.1 + Math.random() * 0.4);
    } else {
      const pi = this._trailAlive.indexOf(idx);
      this._trailAges[pi] = 0;
    }
    this._trailGeo.setDrawRange(0, Math.min(this._trailAlive.length, this._trailPos.length / 3));
    this._trailGeo.attributes.position.needsUpdate = true;
    this._trailGeo.attributes.color.needsUpdate = true;
  }

  clearTrail() {
    this._trailAlive = [];
    this._trailAges = [];
    this._trailLifes = [];
    this._trailGeo.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.group);
    if (this._trailPoints) {
      this.scene.remove(this._trailPoints);
      this._trailGeo.dispose();
      this._trailPoints.material.dispose();
    }
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}
