# 🚀 Solar Odyssey — a 3D Solar System Game

A polished, browser-only **3D solar-system exploration game** built with
Three.js and Vite. Fly a spaceship from planet to planet, scan worlds, mine
asteroids, complete missions, upgrade your ship — all generated
procedurally, with **no backend and no texture downloads**.

**Play it:** https://ayushghbk-afk.github.io/A-solar-system-game/

---

## 🎮 What you can do

- **Fly a spaceship** through a living 3D solar system (Sun + Mercury…Neptune,
  10+ major moons, rings, atmospheres, procedural starfield & nebulas).
- **Walk on the surface** of Earth, the Moon and Mars with an astronaut.
- **Scan planets & moons** to log discoveries into your Codex.
- **Mine asteroids** and **sell ore at space stations**.
- **Accept missions** — from *First Flight* to a full *Solar System Tour*.
- **Upgrade** engine, fuel tank, shields, energy cells and hull.
- **Fast travel** between discovered worlds (fuel cost, cinematic warp).
- **Save progress** (localStorage) — survives refresh, GitHub Pages friendly.
- Works on **desktop (keyboard + mouse)** and **phones (touch sticks)**.

## 🕹 Controls

| Desktop            | Action                          | Mobile                |
| ------------------ | ------------------------------- | --------------------- |
| `W` / `S`          | Thrust forward / brake-reverse  | Left stick            |
| `A` / `D`          | Strafe left / right             | Left stick            |
| `Space` / `Ctrl`   | Ascend / descend                | ▲ / ▼ buttons         |
| `Shift`            | Boost                           | BOOST button          |
| `Mouse`            | Look (click canvas to lock)     | Right stick           |
| `E`                | Interact (orbit / land / dock / mine) | E button         |
| `R`                | Scan nearest / targeted body    | 📡 button             |
| `C`                | Camera: chase → cockpit → free  | —                     |
| `M`                | Map & fast travel               | 🗺 button             |
| `I`                | Info sheet for target / body    | Tap a planet          |
| `Esc` / `P`        | Pause menu                      | ⏸ button              |

Orbiting a planet with `E` enters a stable auto-orbit; `W`/`S` adjust
altitude, any RCS/boost input leaves orbit.

## 🚀 Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build (static, GitHub-Pages-ready):

```bash
npm run build      # outputs to dist/ (relative asset paths)
npm run preview    # serve the production build locally
npm test           # headless smoke test of the boot pipeline (no browser)
```

## ⚡ Boot performance architecture

The game boots in **stages that yield to the browser** between every
expensive step, so the boot bar keeps animating on slow devices:

- **Known worlds only** get textures at boot — and capped at
  `TEX_SIZES_BOOT` (≤ 512 px). Undiscovered worlds are cheap flat-color
  placeholders.
- **Lazy textures**: a body gets its detailed surface when you discover it
  (boot-quality immediately, full quality queued). After the menu appears,
  known worlds upgrade to full quality **one body per tick** — never a batch.
- All procedural noise is **seeded per body and sampled in UV space**, so a
  texture looks the same every session and survives a resolution upgrade
  (continents don't jump).
- A **startup watchdog** (`STARTUP.WATCHDOG_MS`) surfaces a "taking too long"
  panel with a one-click *Try Low Graphics* retry if boot wedges.
- Quality presets (`GRAPHICS_QUALITY` in `config.js`) drive the renderer's
  DPR cap, shadows, star density (`low/medium/high` →
  `2500/3750/5000`, phones get 1600 in low) and asteroid-belt size
  (`60/120/210`).

## 🌍 Deploy to GitHub Pages

The repo ships with `.github/workflows/deploy.yml`: pushing to `main` builds
the Vite project and publishes `dist/` via GitHub Pages automatically
(enable **Settings → Pages → Source: GitHub Actions** once).

## 🗂 Structure

```
.
├── index.html
├── vite.config.js          # base './' → works under any repo sub-path
├── scripts/smoke.mjs       # headless boot-pipeline smoke test (npm test)
├── .github/workflows/deploy.yml
└── src/
    ├── main.js             # boot + splash → main menu
    ├── style.css
    ├── game/               # config, solar system, missions, discoveries,
    │                       # profile, settings, Game.js (orchestrator)
    ├── three-utils/        # PlanetFactory, procedural texture assets,
    │                       # Starfield, landing surfaces
    ├── spacecraft/         # Ship, ShipController, ShipPhysics
    ├── world/              # AsteroidField, LandingZone, Effects
    ├── ui/                 # HUD, screens/menus, mobile controls, dom helpers
    ├── audio/              # AudioManager (WebAudio, all synthesized)
    └── save/               # SaveSystem (localStorage)
```

All visuals are generated at runtime from a tiny canvas texture toolkit
(`three-utils/assets.js`) — the whole game is one ~150 KB gzipped JS bundle
plus Three.js, so it stays fast even on low-end phones.

## ⚙ Tips

- Use the **time warp** slider in Settings to watch planets orbit.
- Fuel is only consumed by thrust; boost burns it fast. Refuel at stations.
- Asteroids in the belt and the Earth–Mars corridor are rich in ore.
- The Codex unlocks as you discover/scan — every entry is earned.
