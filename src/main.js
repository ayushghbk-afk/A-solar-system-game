// Entry point. Boots the Game, shows the splash while the solar system is
// generated, then hands over to the main menu (live 3D backdrop behind it).
import "./style.css";
import { Game } from "./game/Game.js";

function bootProgress(pct) {
  const fill = document.getElementById("boot-fill");
  if (fill) fill.style.width = Math.round(pct * 100) + "%";
}

async function main() {
  const game = new Game();
  game.log("Starting Solar Odyssey…");
  bootProgress(0.08);
  // yield a frame so the boot screen paints before heavy work
  await new Promise((r) => setTimeout(r, 30));
  bootProgress(0.15);

  try {
    await game.init();
    bootProgress(0.92);
    game.log("System ready. Rendering…");
    await new Promise((r) => setTimeout(r, 120));
  } catch (err) {
    console.error(err);
    game.fail("A fatal error prevented startup: " + (err && err.message ? err.message : err));
    return;
  }

  // fade the boot screen, reveal the menu
  const boot = document.getElementById("boot");
  if (boot) boot.classList.add("done");
  game.log("Ready.");
  game.screens.buildMenu();
  game.screens.showMenu();
  game.mode = "menu";
  game.simTime = 0;
  game.start();

  window.__game = game; // handy for debugging in the console
}

window.addEventListener("error", (e) => {
  const layer = document.getElementById("error-layer");
  if (layer && !layer.hidden) return; // already failed
  if (!window.__game || !window.__game.ready) {
    if (layer) {
      layer.hidden = false;
      layer.innerHTML = `<div class="error-card"><h2>⚠ SYSTEM FAULT</h2><p>${e.message || "Unknown error"} — reload the page.</p></div>`;
    }
  }
});

main();
