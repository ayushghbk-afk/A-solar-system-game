// Landing surface for Earth / Moon / Mars. The planet's "surface" is
// represented by a locally-flat procedural terrain patch (with the host
// planet mesh hidden), an astronaut that walks it, and the parked ship.
import * as THREE from "three";
import { makeGroundTile } from "../three-utils/assets.js";
import { mulberry } from "../three-utils/assets.js";

const PALETTES = {
  earth: { ground: "#5a6b3c", rocks: ["#8a8a80", "#6d6d5c", "#a5a58c"], accent: "#3e8c4a" },
  moon: { ground: "#8f8f8f", rocks: ["#a8a8a8", "#7d7d7d", "#b8b8b8"], accent: "#c0c0c0" },
  mars: { ground: "#a14a2a", rocks: ["#c56a3e", "#8f3c20", "#d98a5e"], accent: "#ffb08a" },
};

export class LandingZone {
  constructor(scene) {
    this.scene = scene;
    this.rig = null;
    this.bodyId = null;
    this.avatar = null;
    this.padPos = new THREE.Vector3();
    this.radius = 26; // walkable radius from the pad
    this._fwd = new THREE.Vector3(0, 0, -1);
    this.pitch = 0;
    this.heading = 0;
  }

  build(bodyId) {
    this.dispose();
    const body = null; // resolved by caller via planet
    const palette = PALETTES[bodyId] || PALETTES.moon;
    const rig = new THREE.Group();
    rig.name = "Landing zone " + bodyId;

    // --- ground plane ---
    const size = this.radius * 2.4;
    const tex = makeGroundTile(palette.ground, palette.rocks, bodyId === "moon" ? 5 : bodyId === "mars" ? 9 : 3);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(size / 7, size / 7);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size, 1, 1),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    rig.add(ground);

    // --- rocks / craters (procedural, static) ---
    const rnd = mulberry((bodyId + "zone").split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
    const rockGeo = new THREE.IcosahedronGeometry(0.22, 1);
    const rockMats = palette.rocks.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 1.5 + Math.sqrt(rnd()) * (this.radius - 1);
      const m = new THREE.Mesh(rockGeo, rockMats[i % rockMats.length]);
      m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      const s = 0.5 + rnd() * 2.2;
      m.scale.set(s, s * (0.5 + rnd() * 0.6), s * (0.6 + rnd() * 0.8));
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      m.position.y = 0.05 + s * 0.12;
      rig.add(m);
    }
    // craters (dark rim discs flattened)
    const craterMat = new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * this.radius;
      const c = new THREE.Mesh(new THREE.CircleGeometry(0.6 + rnd() * 1.6, 20), craterMat);
      c.rotation.x = -Math.PI / 2;
      c.position.set(Math.cos(a) * d, 0.015 + 0.001, Math.sin(a) * d);
      rig.add(c);
    }
    // colored dust patches
    for (let i = 0; i < 10; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * this.radius;
      const p = new THREE.Mesh(
        new THREE.CircleGeometry(1.4 + rnd() * 2.6, 16),
        new THREE.MeshStandardMaterial({ color: palette.rocks[i % 3], roughness: 1, transparent: true, opacity: 0.35 }),
      );
      p.rotation.x = -Math.PI / 2;
      p.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
      rig.add(p);
    }

    // --- landing pad marker ---
    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.7, 32),
      new THREE.MeshBasicMaterial({ color: 0x7fd0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.y = 0.03;
    rig.add(padRing);
    const padDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 24),
      new THREE.MeshStandardMaterial({ color: 0x2c3238, roughness: 0.6, metalness: 0.3 }),
    );
    padDisc.rotation.x = -Math.PI / 2;
    padDisc.position.y = 0.02;
    rig.add(padDisc);
    this.padPos.set(0, 0, 0);

    // beacon
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x7fd0ff });
    this._beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), beaconMat);
    this._beacon.position.set(0, 2.6, 0);
    rig.add(this._beacon);

    // --- astronaut avatar ---
    const av = new THREE.Group();
    av.name = "Astronaut";
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xdfe7ea, roughness: 0.6, metalness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b3640, roughness: 0.5, metalness: 0.35 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), suitMat);
    torso.position.y = 0.95;
    av.add(torso);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshStandardMaterial({ color: 0x24405e, roughness: 0.15, metalness: 0.8 }));
    helmet.position.y = 1.42;
    av.add(helmet);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 4, 6), dark);
      leg.position.set(side * 0.12, 0.28, 0);
      av.add(leg);
    }
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.2), dark);
    pack.position.set(0, 1.0, -0.26);
    av.add(pack);
    av.position.set(0, 0, 0);
    av.visible = false;
    rig.add(av);
    this.avatar = av;

    this.rig = rig;
    return rig;
  }

  // Place the whole zone so it touches the (hidden) host planet surface.
  placeAt(hostPosWorld, hostRadius, up) {
    const p = this.rig.position;
    p.copy(hostPosWorld);
    p.addScaledVector(up, hostRadius + 0.03);
    // rotate so that up is roughly +Y of the plane (plane normal +Y)
    if (up.y < 0.999) {
      this.rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    }
    // after rotating the rig, avatar walking happens in rig-local XZ
    this.rig.updateMatrixWorld(true);
  }

  setAvatarActive(active) {
    if (this.avatar) this.avatar.visible = active;
    this.avatarActive = active;
  }

  setAvatarPose(posWorld, heading) {
    // posWorld on the plane (y ≈ 0). Convert to rig local.
    const local = this.rig.worldToLocal(posWorld.clone());
    this.avatar.position.set(local.x, 0.01, local.z);
    this.avatar.rotation.y = heading;
  }

  avatarWorldPos(out = new THREE.Vector3()) {
    if (!this.avatar) return out.set(0, 0, 0);
    this.avatar.getWorldPosition(out);
    return out;
  }

  update(dt, ctl, landed) {
    if (!this.rig || !landed) return;
    const t = performance.now() * 0.001;
    if (this._beacon) {
      this._beacon.material.color.setHSL(0.55, 0.8, 0.6 + Math.sin(t * 4) * 0.25);
    }
    // avatar movement handled by Game (needs camera orientation); here we just
    // gently bob the beacon and leave transforms to Game.updateLanded()
  }

  dispose() {
    if (this.rig) {
      this.scene.remove(this.rig);
      this.rig.traverse((o) => {
        if (o.isMesh) {
          if (o.geometry) o.geometry.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else if (m) m.dispose();
        }
      });
      this.rig = null;
    }
  }
}
