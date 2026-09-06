# 🪐 A-solar-system-game — Orbit Explorer

A tiny, open-source **solar system game** that runs entirely in the browser.
No build tools, no frameworks, no backend — just HTML, CSS, and vanilla
JavaScript, so it works straight from GitHub Pages.

**Live demo:** (your GitHub Pages URL after enabling Pages)

---

## ✨ Features

- **Explore mode** — pan, zoom, and click planets to read facts (distance,
  diameter, year length, day length, moons, and a fun blurb).
- **Planet quiz** — 10 randomly selected questions with instant feedback,
  score tracking, and a stored best score.
- **Launch mission** — launch a probe from Earth and hit a moving target
  planet by tuning angle and power (or drag on the canvas to aim).
- Animated orbits, twinkling stars, an asteroid belt, Saturn's rings,
  Earth's moon, and subtle sound effects (mutable).

## 🚀 How to run locally

Because there's no build step, you can open the project however you like:

```bash
# Option A: just open it
xdg-open index.html

# Option B: serve it with any static server (recommended)
python3 -m http.server 8080
# then visit http://localhost:8080
```

## 🌍 Deploy to GitHub Pages

This repo is already set up for static hosting. To publish it:

1. Push the code to your repository.
2. Go to **Settings → Pages** on GitHub.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Select the branch (e.g. `main`) and folder **`/ (root)`**.
5. Save. GitHub will build and publish the site at
   `https://<your-username>.github.io/<your-repo>/`.

If you're using GitHub CLI, an alternative is to run:

```bash
gh api repos/:owner/:repo/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
```

---

## 🧰 Project structure

```
.
├── index.html          # The whole UI (canvas + sidebar panels)
├── css/style.css       # Styling, responsive layout, animations
├── js/data.js          # Planet data + quiz question bank
├── js/game.js          # Simulation, input, quiz and launch logic
└── README.md
```

## 🎮 Controls

| Action            | Explore              | Launch mission            |
| ----------------- | -------------------- | ------------------------- |
| Pan               | Drag canvas          | Drag aims the rocket      |
| Zoom              | Mouse wheel / pinch  | Mouse wheel / pinch       |
| Click a planet    | View facts           | —                         |
| Fire the probe    | —                    | Press **Launch**          |
