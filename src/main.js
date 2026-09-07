// Entry point. Boots the Game, shows the splash while the solar system is
// generated, then hands over to the main menu (live 3D backdrop behind it).
//
// game.init() is staged and yields to the browser between expensive steps,
// so this boot bar keeps animating on slow devices — and the watchdog below
// can actually fire (and offer a low-graphics escape hatch) if a stage wedges.
import "./style.css";
import { Game } from "./game/Game.js";
import { STARTUP } from "./game/config.js";
import { nextFrame } from "./ui/dom.js";

const $ = (id) => document.getElementById(id);

function bootProgress(pct) {
  const fill = $("boot-fill");
  if (fill) fill.style.width = Math.round(Math.max(0, Math.min(1, pct)) * 100) + "%";
}

// Hard startup watchdog: if staged initialization hasn't finished within
// STARTUP.WATCHDOG_MS, surface a panel explaining what might be wrong with a
// one-click low-graphics retry. Prevents another invisible "forever boot".
function armWatchdog(game, isDone) {
  const timer = setTimeout(() => {
    if (isDone()) return;
    const boot = $("boot");
    if (!boot || $("boot-help")) return;
    const card = boot.querySelector(".boot-card");
    if (!card) return;
    const help = document.createElement("div");
    help.id = "boot-help";
    help.className = "boot-help";
    help.innerHTML = `
      <div class="boot-help-title">⚠ SYSTEM STARTUP IS TAKING TOO LONG</div>
      <div class="boot-help-causes">
        Possible causes:
        <br>• WebGL performance on this device
        <br>• Device memory pressure
        <br>• Procedural texture generation
      </div>
      <div class="boot-help-actions">
        <button class="btn" id="boot-low-graphics">TRY LOW GRAPHICS</button>
        <button class="btn ghost" id="boot-reload">RELOAD</button>
      </div>`;
    card.appendChild(help);
    $("boot-low-graphics").addEventListener("click", () => {
      try {
        game.settingsMgr.applyQuality("low");
        game.settingsMgr.s.shadows = false;
        game.settingsMgr.s.bloom = false;
        game.settingsMgr.s.particles = false;
        game.settingsMgr.s.stars = "low";
        game.settingsMgr.s.planetQuality = "low";
        game.settingsMgr.save();
      } catch (e) { /* storage may be unavailable; reload anyway */ }
      location.reload();
    });
    $("boot-reload").addEventListener("click", () => location.reload());
  }, STARTUP.WATCHDOG_MS);
  return () => clearTimeout(timer);
}

async function main() {
  const game = new Game();
  game.log("Starting Solar Odyssey…");
  bootProgress(0.04);
  // yield a frame so the boot screen paints before heavy work
  await nextFrame();
  bootProgress(0.06);

  let initDone = false;
  const disarmWatchdog = armWatchdog(game, () => initDone);
  try {
    await game.init((pct) => bootProgress(0.06 + pct * 0.9));
    initDone = true;
    disarmWatchdog();
  } catch (err) {
    initDone = true;
    disarmWatchdog();
    console.error(err);
    game.fail("A fatal error prevented startup: " + (err && err.message ? err.message : err));
    return;
  }

  bootProgress(1);
  game.log("System ready. Rendering…");
  await nextFrame();

  // fade the boot screen, reveal the menu
  const boot = $("boot");
  if (boot) boot.classList.add("done");
  game.log("Ready.");
  game.screens.buildMenu();
  game.screens.showMenu();
  game.mode = "menu";
  game.simTime = 0;
  game.start();
  // now that the menu is live, upgrade boot-capped textures to full quality
  // in the background (one body per tick — see Game._pumpTextures)
  game._scheduleTextureUpgrades();

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
