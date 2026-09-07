// All menu / modal screens (menu, pause, missions, ship/hangar, codex,
// settings, map, planet info, station dock). One class owning the DOM under
// #ui-root so Game only calls open()/close()/refresh().
import { el, h, clear, fmtNum, fmtKm, fmtTime } from "./dom.js";
import { MISSION_DEFS, missionRewardText } from "../game/Missions.js";
import { ACHIEVEMENTS } from "../game/Discoveries.js";
import { UPGRADES, ENGINE_LEVELS } from "../game/Profile.js";
import { PLANET_DEFS, MOON_DEFS, RESOURCES, STATION_DEFS } from "../game/bodyData.js";
import { getBodyFactSheet } from "../game/Discoveries.js";
import { GRAPHICS_QUALITY } from "../game/config.js";

const BODY_META = new Map();
for (const p of PLANET_DEFS) BODY_META.set(p.id, p);
for (const k of Object.keys(MOON_DEFS)) BODY_META.set(k, MOON_DEFS[k]);

export class Screens {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.openStack = [];
    this._buildShell();
  }

  _buildShell() {
    const r = this.root;
    r.innerHTML = `
      <div id="screen-menu" class="screen menu"></div>
      <div id="screen-hud" class="screen hud-screen"></div>
      <div id="modal-layer" class="modal-layer"></div>
      <div id="toast-layer" class="toast-layer"></div>
      <div id="error-layer" class="error-layer" hidden></div>
      <div id="mobile-layer" class="mobile-layer"></div>
    `;
    this.hudRoot = r.querySelector("#screen-hud");
    this.modalLayer = r.querySelector("#modal-layer");
    this.modalLayer.hidden = true;
    this.toastLayer = r.querySelector("#toast-layer");
    this.errorLayer = r.querySelector("#error-layer");
    this.mobileLayer = r.querySelector("#mobile-layer");
    this.menuRoot = r.querySelector("#screen-menu");
  }

  /* ---------------- generic modal ---------------- */

  confirm({ title = "CONFIRM", body = "", ok = "OK", cancel = "Cancel", danger = false } = {}) {
    return new Promise((resolve) => {
      const card = h(`
        <div class="modal-card">
          <div class="modal-title">${title}</div>
          <div class="modal-body"></div>
          <div class="modal-actions">
            <button class="btn ghost" data-act="cancel">${cancel}</button>
            <button class="btn ${danger ? "danger" : "primary"}" data-act="ok">${ok}</button>
          </div>
        </div>`);
      card.querySelector(".modal-body").append(...(Array.isArray(body) ? body : [document.createTextNode(body)]));
      card.querySelector('[data-act="cancel"]').onclick = () => { this._closeModal(card); resolve(false); };
      card.querySelector('[data-act="ok"]').onclick = () => { this._closeModal(card); resolve(true); };
      this._openModal(card);
    });
  }

  _openModal(card) {
    this.modalLayer.appendChild(card);
    this.modalLayer.hidden = false;
  }
  _closeModal(card) {
    if (card && card.parentNode) card.remove();
    if (!this.modalLayer.children.length) this.modalLayer.hidden = true;
  }
  closeModals() {
    clear(this.modalLayer);
    this.modalLayer.hidden = true;
  }

  setModalVisible(v) {
    if (!v) this.closeModals();
  }

  /* ---------------- menu ---------------- */

  buildMenu() {
    const m = this.menuRoot;
    m.innerHTML = `
      <div class="menu-panel">
        <div class="logo">
          <div class="logo-orbit">◯</div>
          <h1>SOLAR <span>ODYSSEY</span></h1>
          <p class="tag">3D Solar System Exploration</p>
        </div>
        <nav class="menu-buttons">
          <button class="btn primary big" data-k="play">▶ &nbsp;PLAY</button>
          <button class="btn" data-k="missions">MISSIONS</button>
          <button class="btn" data-k="ship">SHIP</button>
          <button class="btn" data-k="codex">CODEX</button>
          <button class="btn" data-k="settings">SETTINGS</button>
        </nav>
        <div class="menu-foot">
          <span id="menu-credits"></span>
          <button class="btn ghost tiny" data-k="save">SAVE GAME</button>
          <button class="btn ghost tiny" data-k="reset">RESET SAVE</button>
        </div>
        <div class="controls-hint">WASD fly · MOUSE look · SHIFT boost · E interact · R scan · M map · I info · P pause</div>
      </div>
    `;
    m.querySelector('[data-k="play"]').onclick = () => this.game.startFlight();
    m.querySelector('[data-k="missions"]').onclick = () => this.game.openPanel("missions");
    m.querySelector('[data-k="ship"]').onclick = () => this.game.openPanel("ship");
    m.querySelector('[data-k="codex"]').onclick = () => this.game.openPanel("codex");
    m.querySelector('[data-k="settings"]').onclick = () => this.game.openPanel("settings");
    m.querySelector('[data-k="save"]').onclick = () => {
      this.game.saveGame();
      this.game.toast("Progress saved", "good");
    };
    m.querySelector('[data-k="reset"]').onclick = async () => {
      const yes = await this.confirm({
        title: "RESET SAVE",
        body: "Delete all progress? Credits, upgrades and discoveries will be lost.",
        ok: "RESET", danger: true,
      });
      if (yes) this.game.resetSave();
    };
    this.refreshMenuFoot();
  }

  refreshMenuFoot() {
    const g = this.game;
    if (this.menuRoot) {
      const c = this.menuRoot.querySelector("#menu-credits");
      if (c) c.textContent = `◈ ${fmtNum(g.profile.credits, 0)} · ⚡ ${fmtNum(g.profile.xp, 0)} XP · ${g.discovery.achievements.length} achievements`;
    }
  }

  showMenu() {
    this.menuRoot.classList.add("on");
  }
  hideMenu() {
    this.menuRoot.classList.remove("on");
  }

  /* ---------------- pause ---------------- */

  showPause() {
    const g = this.game;
    const card = h(`
      <div class="modal-card pause-card">
        <div class="modal-title">PAUSED</div>
        <div class="menu-buttons">
          <button class="btn primary" data-k="resume">▶ RESUME</button>
          <button class="btn" data-k="map">🗺 MAP</button>
          <button class="btn" data-k="missions">MISSIONS</button>
          <button class="btn" data-k="ship">SHIP</button>
          <button class="btn" data-k="codex">CODEX</button>
          <button class="btn" data-k="settings">SETTINGS</button>
          <button class="btn ghost" data-k="save">💾 SAVE</button>
          <button class="btn ghost danger" data-k="quit">RETURN TO MENU</button>
        </div>
      </div>`);
    card.querySelector('[data-k="resume"]').onclick = () => { this._closeModal(card); g.togglePause(); };
    card.querySelector('[data-k="map"]').onclick = () => { this._closeModal(card); g.openPanel("map"); };
    card.querySelector('[data-k="missions"]').onclick = () => { this._closeModal(card); g.openPanel("missions"); };
    card.querySelector('[data-k="ship"]').onclick = () => { this._closeModal(card); g.openPanel("ship"); };
    card.querySelector('[data-k="codex"]').onclick = () => { this._closeModal(card); g.openPanel("codex"); };
    card.querySelector('[data-k="settings"]').onclick = () => { this._closeModal(card); g.openPanel("settings"); };
    card.querySelector('[data-k="save"]').onclick = () => { this._closeModal(card); g.saveGame(); g.toast("Progress saved", "good"); };
    card.querySelector('[data-k="quit"]').onclick = async () => {
      this._closeModal(card);
      g.toMenu();
    };
    this._openModal(card);
  }

  hidePause() {
    this.closeModals();
  }

  /* ---------------- generic modal screen (full panels) ---------------- */

  openPanel(name) {
    this.closeModals();
    const g = this.game;
    const builders = {
      missions: () => this._panelMissions(),
      ship: () => this._panelShip(),
      codex: () => this._panelCodex(),
      settings: () => this._panelSettings(),
      map: () => this._panelMap(),
      info: () => this._panelInfo(g.pendingInfoId),
      station: () => this._panelDock(g.nearStation || g.dockedStation),
      dock: () => this._panelDock(g.dockedStation),
    };
    const b = builders[name];
    if (!b) return;
    const card = b();
    card.dataset.panel = name;
    // pause the action while any modal panel is open
    this.game.onModalOpen(true);
    this._openModal(card);
    // close hook
    const close = (btn) => {
      btn.addEventListener("click", () => {
        this._closeModal(card);
        this.game.onModalOpen(false);
        if (name === "dock") this.game.exitDock();
      });
    };
    card.querySelectorAll("[data-close]").forEach((btn) => close(btn));
  }

  _mkPanel(title, bodyHTML) {
    return h(`
      <div class="modal-card panel">
        <div class="panel-head">
          <div class="panel-title">${title}</div>
          <button class="btn ghost tiny" data-close>✕</button>
        </div>
        <div class="panel-body"></div>
      </div>`);
  }

  /* ----- missions panel ----- */
  _panelMissions() {
    const g = this.game;
    const panel = this._mkPanel("MISSIONS", "");
    const body = panel.querySelector(".panel-body");
    body.innerHTML = `
      <div class="col">
        <div class="section-label">ACTIVE</div>
        <div id="mis-active"></div>
        <div class="section-label">AVAILABLE</div>
        <div id="mis-avail"></div>
        <div class="section-label">COMPLETED</div>
        <div id="mis-done"></div>
      </div>`;
    const renderActive = () => {
      const box = body.querySelector("#mis-active");
      const actives = g.missions.getActiveDefs();
      box.innerHTML = actives.length
        ? actives.map((d) => this._missionCard(d, "active")).join("")
        : '<div class="empty">No active missions. Accept one below.</div>';
    };
    const renderAvail = () => {
      const box = body.querySelector("#mis-avail");
      const avail = g.missions.unlockable().filter((m) => !g.missions.active.includes(m.id));
      box.innerHTML = avail.length
        ? avail.map((d) => this._missionCard(d, "avail")).join("")
        : '<div class="empty">All missions accepted — explore to unlock more tiers.</div>';
      box.querySelectorAll("[data-accept]").forEach((b) => {
        b.onclick = () => {
          g.missions.accept(b.dataset.accept);
          renderActive();
          renderAvail();
          renderDone();
          g.audio.play("ui");
          g.saveGame();
        };
      });
    };
    const renderDone = () => {
      const box = body.querySelector("#mis-done");
      const done = MISSION_DEFS.filter((m) => g.missions.completed.includes(m.id));
      box.innerHTML = done.length
        ? done.map((d) => this._missionCard(d, "done")).join("")
        : '<div class="empty">Nothing yet — your first flight awaits.</div>';
    };
    renderActive(); renderAvail(); renderDone();
    return panel;
  }

  _missionCard(d, state) {
    const g = this.game;
    let progress = "";
    if (state === "active" && d.type === "mine") {
      const cur = g.missions.progress[d.id] || 0;
      progress = `<div class="mini-progress"><span style="width:${Math.min(100, (cur / d.amount) * 100)}%"></span></div>`;
    }
    const done = state === "done";
    const accept = state === "avail";
    return `
      <div class="mission-card ${done ? "done" : ""}">
        <div class="mc-head">
          <b>${d.name}</b>
          ${done ? '<span class="mc-badge ok">✓ DONE</span>' : ''}
          ${accept ? `<button class="btn tiny primary" data-accept="${d.id}">ACCEPT</button>` : ""}
        </div>
        <div class="mc-desc">${d.desc}</div>
        ${progress}
        <div class="mc-reward">${missionRewardText(d)}</div>
      </div>`;
  }

  /* ----- ship panel ----- */
  _panelShip() {
    const g = this.game;
    const p = g.profile;
    const panel = this._mkPanel("SHIP — LOADOUT", "");
    const body = panel.querySelector(".panel-body");
    const engine = p.engineLevel.label;
    body.innerHTML = `
      <div class="ship-grid">
        <div class="col">
          <div class="section-label">STATUS</div>
          <div class="stat-grid" id="ship-stats"></div>
          <div class="section-label">CARGO ${p.cargoTotal}/${p.maxCargo}</div>
          <div id="cargo-list" class="cargo-list"></div>
        </div>
        <div class="col">
          <div class="section-label">UPGRADES — COST</div>
          <div id="upgrade-list" class="upgrade-list"></div>
        </div>
      </div>`;
    const renderStats = () => {
      const box = body.querySelector("#ship-stats");
      const lvl = p.upgrades.engine;
      box.innerHTML = `
        <div><span>Engine</span><b>MK${lvl + 1} · ${ENGINE_LEVELS[lvl].label}</b></div>
        <div><span>Thrust</span><b>${Math.round(p.engineThrustMult * 100)}%</b></div>
        <div><span>Speed cap</span><b>${Math.round(p.engineCapMult * 100)}%</b></div>
        <div><span>Fuel tank</span><b>${Math.round(p.maxFuel)}</b></div>
        <div><span>Energy</span><b>${Math.round(p.maxEnergy)}</b></div>
        <div><span>Shield</span><b>${Math.round(p.maxShield)}</b></div>
        <div><span>Hull</span><b>${Math.round(p.maxHull)}</b></div>
        <div><span>Cargo</span><b>${p.maxCargo}</b></div>
        <div><span>Credits</span><b>◈ ${fmtNum(p.credits)}</b></div>
        <div><span>XP</span><b>⚡ ${fmtNum(p.xp)}</b></div>`;
      body.querySelector(".section-label").textContent = `CARGO ${p.cargoTotal}/${p.maxCargo}`;
      const cbox = body.querySelector("#cargo-list");
      const ids = Object.keys(p.cargo);
      cbox.innerHTML = ids.length
        ? ids.map((id) => {
          const r = RESOURCES[id];
          return `<div class="cargo-row"><span class="res-dot" style="background:${r.color}"></span>${r.name}<b>${p.cargo[id]} u</b><em>${r.price} cr/u</em></div>`;
        }).join("")
        : '<div class="empty">Hold empty. Mine asteroids or scan to find resources.</div>';
    };
    const renderUpgrades = () => {
      const box = body.querySelector("#upgrade-list");
      box.innerHTML = Object.keys(UPGRADES).map((key) => {
        const u = UPGRADES[key];
        const lvl = p.upgrades[key];
        const maxed = lvl >= 4;
        const cost = maxed ? 0 : p.upgradeCost(key);
        return `
          <div class="upgrade-row">
            <div class="up-info"><b>${u.name} <em>${maxed ? "MAX" : "Lv " + (lvl + 1)}</em></b><span>${u.desc}</span></div>
            ${maxed ? '<span class="mc-badge ok">MAXED</span>' : `<button class="btn tiny ${p.canAfford(cost) ? "primary" : ""}" data-up="${key}">◈ ${fmtNum(cost)}</button>`}
          </div>`;
      }).join("");
      box.querySelectorAll("[data-up]").forEach((b) => {
        b.onclick = () => {
          const key = b.dataset.up;
          const cost = p.upgradeCost(key);
          if (p.spend(cost)) {
            p.upgrades[key]++;
            g.audio.play("money");
            g.discovery.grant("upgrader");
            g.toast(UPGRADES[key].name + " upgraded to Lv " + p.upgrades[key], "good");
            g.saveGame();
            g.refreshHud(true);
            renderStats();
            renderUpgrades();
          } else {
            g.audio.play("error");
            g.toast("Not enough credits", "warn");
          }
        };
      });
    };
    renderStats();
    renderUpgrades();
    return panel;
  }

  /* ----- codex ----- */
  _panelCodex() {
    const g = this.game;
    const panel = this._mkPanel("CODEX", "");
    const body = panel.querySelector(".panel-body");
    body.innerHTML = `
      <div class="tabs-row" id="codex-tabs">
        ${["PLANETS", "MOONS", "RESOURCES", "STATIONS", "ACHIEVEMENTS"].map((t, i) => `<button class="${i === 0 ? "tab-on" : ""}" data-tab="${i}">${t}</button>`).join("")}
      </div>
      <div class="codex-grid" id="codex-grid"></div>`;
    const grid = body.querySelector("#codex-grid");
    const open = (tab) => {
      grid.innerHTML = "";
      const unlock = g.discovery.codexUnlocks();
      if (tab === 0) {
        for (const p of PLANET_DEFS) {
          const known = unlock.planets.includes(p.id);
          grid.appendChild(this._codexBodyCard(p.id, p.name, known, g));
        }
      } else if (tab === 1) {
        const all = Object.keys(MOON_DEFS).map((k) => ({ id: k, ...MOON_DEFS[k] }));
        if (!all.length) grid.innerHTML = '<div class="empty">No moons discovered.</div>';
        for (const m of all) {
          const known = unlock.moons.includes(m.id) || unlock.planets.includes(m.id);
          grid.appendChild(this._codexBodyCard(m.id, m.name, known, g));
        }
      } else if (tab === 2) {
        for (const id of Object.keys(RESOURCES)) {
          const r = RESOURCES[id];
          const known = unlock.resources.includes(id);
          grid.appendChild(this._codexSimple(r.name, `${known ? r.name + " — a tradeable commodity found on asteroids and moons." : "Undiscovered resource."}`, known));
        }
      } else if (tab === 3) {
        for (const st of STATION_DEFS) {
          const known = unlock.stations.includes(st.id);
          grid.appendChild(this._codexSimple(st.name, known ? `Orbital station near ${st.bodyId.toUpperCase()}. Refuel, trade, upgrade, save.` : "Undiscovered station.", known));
        }
      } else {
        for (const a of ACHIEVEMENTS) {
          const got = g.discovery.has(a.id);
          grid.appendChild(this._codexSimple(`${a.icon} ${a.name}`, a.desc, got, got ? "unlocked" : "locked"));
        }
      }
    };
    body.querySelectorAll("#codex-tabs button").forEach((b) => {
      b.onclick = () => {
        body.querySelectorAll("#codex-tabs button").forEach((x) => x.classList.remove("tab-on"));
        b.classList.add("tab-on");
        open(+b.dataset.tab);
      };
    });
    open(0);
    return panel;
  }

  _codexBodyCard(id, name, known, game) {
    const card = el("button", "codex-card " + (known ? "" : "locked"));
    const meta = BODY_META.get(id);
    card.innerHTML = `
      <div class="codex-emoji">${known ? `<i style="background:${meta ? meta.color : "#666"}"></i>` : "❔"}</div>
      <b>${known ? name : "???"}</b>`;
    if (known) {
      card.onclick = () => game.openBodyInfo(id);
    }
    return card;
  }

  _codexSimple(name, desc, known, extraClass) {
    const card = el("div", "codex-card " + (extraClass || (known ? "" : "locked")));
    card.innerHTML = `<b>${name}</b><span>${desc}</span>`;
    return card;
  }

  /* ----- settings ----- */
  _panelSettings() {
    const g = this.game;
    const s = g.settings;
    const panel = this._mkPanel("SETTINGS", "");
    const body = panel.querySelector(".panel-body");
    body.innerHTML = `
      <div class="settings-grid">
        <div class="set-group">
          <div class="section-label">GRAPHICS</div>
          <label>Quality</label>
          <select id="set-quality">
            ${["low", "medium", "high"].map((q) => `<option value="${q}" ${s.quality === q ? "selected" : ""}>${q.toUpperCase()}</option>`).join("")}
          </select>
          <label><input type="checkbox" id="set-shadows" ${s.shadows ? "checked" : ""}> Shadows</label>
          <label><input type="checkbox" id="set-bloom" ${s.bloom ? "checked" : ""}> Bloom</label>
          <label><input type="checkbox" id="set-particles" ${s.particles ? "checked" : ""}> Particles</label>
        </div>
        <div class="set-group">
          <div class="section-label">AUDIO</div>
          <label><input type="checkbox" id="set-sound" ${s.sound ? "checked" : ""}> Sound effects</label>
          <label><input type="checkbox" id="set-music" ${s.music ? "checked" : ""}> Ambient music</label>
        </div>
        <div class="set-group">
          <div class="section-label">GAME</div>
          <label>Time warp (sim-sec per real-sec)</label>
          <div class="row inline"><input type="range" id="set-time" min="0" max="200" step="5" value="${s.timeScale}"><b id="set-time-out">${s.timeScale ? s.timeScale + "×" : "DEFAULT"}</b></div>
          <label>Star density</label>
          <select id="set-stars">
            ${["low", "medium", "high"].map((q) => `<option value="${q}" ${s.stars === q ? "selected" : ""}>${q.toUpperCase()}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="panel-actions"><button class="btn ghost" data-close>CLOSE</button></div>`;
    const upd = () => body.querySelector("#set-time-out").textContent = s.timeScale ? s.timeScale + "×" : "DEFAULT (60×)";
    body.querySelector("#set-quality").onchange = (e) => g.setQuality(e.target.value);
    body.querySelector("#set-shadows").onchange = (e) => g.setFlag("shadows", e.target.checked);
    body.querySelector("#set-bloom").onchange = (e) => g.setFlag("bloom", e.target.checked);
    body.querySelector("#set-particles").onchange = (e) => g.setFlag("particles", e.target.checked);
    body.querySelector("#set-sound").onchange = (e) => g.setAudio("sound", e.target.checked);
    body.querySelector("#set-music").onchange = (e) => g.setAudio("music", e.target.checked);
    body.querySelector("#set-time").oninput = (e) => { s.timeScale = +e.target.value; upd(); g.onTimeScaleChange && g.onTimeScaleChange(); };
    body.querySelector("#set-stars").onchange = (e) => g.setStars(e.target.value);
    return panel;
  }

  /* ----- map ----- */
  _panelMap() {
    const g = this.game;
    const panel = this._mkPanel("SOLAR SYSTEM MAP", "");
    const body = panel.querySelector(".panel-body");
    const draw = () => {
      // static orbital schematic (planets at golden-angle positions)
      const planets = PLANET_DEFS.filter((p) => p.id !== "sun");
      let orbitsHtml = "";
      let bodiesHtml = "";
      planets.forEach((p, i) => {
        const d = Math.round((p.orbit / 470) * 44 * 10) / 10; // % radius
        const a = i * 137.5 * (Math.PI / 180);
        const dx = Math.round(Math.cos(a) * d * 10) / 10;
        const dy = Math.round(Math.sin(a) * d * 10) / 10;
        orbitsHtml += `<div class="map-orbit" style="width:${d * 2}%;height:${d * 2}%;left:calc(50% - ${d}%);top:calc(50% - ${d}%)"></div>`;
        const known = g.discovery.isKnown(p.id);
        bodiesHtml += `
          <button class="map-body" data-id="${p.id}" style="left:calc(50% + ${dx}%);top:calc(50% - ${dy}%)" ${known ? "" : "disabled"}>
            <i style="background:${p.color}"></i><span>${known ? p.name : "???"}</span>
          </button>`;
      });
      body.innerHTML = `
        <div class="map-canvas">
          <div class="map-sun">☀<span>SUN</span></div>
          ${orbitsHtml}
          ${bodiesHtml}
          <div class="map-legend"><span class="you-dot"></span> You are near Earth</div>
        </div>
        <div class="map-hint">Select a discovered world to start fast travel.</div>
        <div id="map-info" class="map-info"></div>
        <div class="panel-actions"><button class="btn ghost" data-close>CLOSE</button></div>`;
      body.querySelectorAll(".map-body:not([disabled])").forEach((b) => {
        b.onclick = () => {
          g.audio.play("click");
          g.requestTravelTo(b.dataset.id);
        };
      });
    };
    draw();
    return panel;
  }

  /* ----- planet info ----- */
  _panelInfo(id) {
    const g = this.game;
    if (!id) return this._mkPanel("INFO", "");
    const info = getBodyFactSheet(id, g.solar) || (id.startsWith("station-") ? getStationSheet(id, g) : null);
    const sheet = id.startsWith("station-") ? getStationSheet(id, g) : info;
    const def = BODY_META.get(id);
    if (!sheet) return this._mkPanel("INFO", "");
    const panel = this._mkPanel(sheet.name.toUpperCase(), "");
    const body = panel.querySelector(".panel-body");
    const isStation = !!sheet.station;
    const canLand = !isStation && sheet.body && sheet.body.landing;
    const canOrbit = !isStation && !sheet.body.isStar;
    const scanned = isStation || g.discovery.isScanned(id);
    body.innerHTML = `
      <div class="info-hero"><i class="planet-dot" style="background:${def ? def.color : "#888"}"></i>
        <div><b>${sheet.name}</b><span>${sheet.type}</span></div>
        ${scanned ? '<span class="mc-badge ok">✓ SCANNED</span>' : '<span class="mc-badge">NOT SCANNED</span>'}
      </div>
      <div class="stat-grid">
        <div><span>Type</span><b>${sheet.type}</b></div>
        <div><span>Radius</span><b>${sheet.radius}</b></div>
        <div><span>Distance</span><b>${sheet.distance}</b></div>
        <div><span>Gravity</span><b>${sheet.gravity}</b></div>
        <div><span>Temp</span><b>${sheet.temp}</b></div>
        <div><span>Atmosphere</span><b>${sheet.atmosphere}</b></div>
      </div>
      <div class="facts-box"><b>${sheet.data && sheet.data.facts ? "FACTS" : ""}</b><p>${sheet.data && sheet.data.facts ? sheet.data.facts : ""}</p></div>
      ${!isStation ? `
      <div class="panel-actions actions-2">
        <button class="btn" data-a="target">◎ SET TARGET</button>
        <button class="btn" data-a="scan">📡 SCAN</button>
        ${canOrbit ? '<button class="btn" data-a="orbit">🛰 ORBIT</button>' : ""}
        ${canLand ? '<button class="btn primary" data-a="land">🦶 LAND</button>' : ""}
        <button class="btn ghost" data-a="close">CLOSE</button>
      </div>` : ""}
    `;
    if (isStation) {
      body.querySelectorAll("[data-a]").forEach(() => {});
      body.querySelector(".panel-actions")?.remove();
    } else {
      const act = (key) => {
        const btns = body.querySelectorAll("[data-a]");
        btns.forEach((x) => x.disabled = true);
        this._closeModal(panel);
        g.onModalOpen(false);
        setTimeout(() => {
          if (key === "target") g.setTargetBody(id);
          else if (key === "scan") g.startScanTarget(id);
          else if (key === "orbit") g.requestOrbit(id);
          else if (key === "land") g.requestLand(id);
        }, 40);
      };
      body.querySelector('[data-a="close"]').onclick = () => { this._closeModal(panel); g.onModalOpen(false); };
      body.querySelector('[data-a="target"]').onclick = () => act("target");
      body.querySelector('[data-a="scan"]').onclick = () => act("scan");
      if (canOrbit) body.querySelector('[data-a="orbit"]').onclick = () => act("orbit");
      if (canLand) body.querySelector('[data-a="land"]').onclick = () => act("land");
    }
    return panel;
  }

  /* ----- station / dock ----- */
  _panelStation() {
    const g = this.game;
    const near = g.nearStation;
    if (!near) return this._mkPanel("STATION", "");
    const panel = this._panelDock(near);
    return panel;
  }

  _panelDock(station) {
    const g = this.game;
    const p = g.profile;
    const panel = this._mkPanel(station ? station.name.toUpperCase() + " — SERVICES" : "STATION", "");
    const body = panel.querySelector(".panel-body");
    if (!station) {
      body.innerHTML = '<div class="empty">No station nearby.</div>';
      return panel;
    }
    const render = () => {
      const refuelCost = Math.round((p.maxFuel - g.ship.fuel) * 0.5);
      body.innerHTML = `
        <div class="dock-grid">
          <div class="col">
            <div class="section-label">DOCK SERVICES</div>
            <div class="service-row"><span>⛽ Refuel <em>${Math.round(g.ship.fuel)}/${Math.round(p.maxFuel)}</em></span>
              <button class="btn tiny ${refuelCost > 0 ? "primary" : "disabled"}" data-s="refuel">◈ ${refuelCost}</button></div>
            <div class="service-row"><span>🛠 Repair hull <em>${Math.round(g.ship.hull)}/${Math.round(p.maxHull)}</em></span>
              <button class="btn tiny ${g.ship.hull < p.maxHull ? "primary" : "disabled"}" data-s="repair">FREE</button></div>
            <div class="service-row"><span>⚡ Recharge energy</span>
              <button class="btn tiny" data-s="charge">FREE</button></div>
            <div class="section-label">TRADE</div>
            <div class="cargo-list" id="dock-cargo"></div>
            <button class="btn primary wide" data-s="sell">SELL ALL CARGO <em id="dock-value"></em></button>
          </div>
          <div class="col">
            <div class="section-label">PROFILE</div>
            <div class="stat-grid small">
              <div><span>Credits</span><b>◈ ${fmtNum(p.credits)}</b></div>
              <div><span>Fuel tank</span><b>${Math.round(p.maxFuel)}</b></div>
              <div><span>Cargo</span><b>${p.cargoTotal}/${p.maxCargo}</b></div>
              <div><span>XP</span><b>⚡ ${fmtNum(p.xp)}</b></div>
            </div>
            <div class="section-label">ACTIONS</div>
            <button class="btn" data-s="save">💾 SAVE GAME</button>
            <button class="btn primary" data-s="leave">🚀 LEAVE STATION</button>
          </div>
        </div>`;
      const cargoBox = body.querySelector("#dock-cargo");
      const ids = Object.keys(p.cargo);
      cargoBox.innerHTML = ids.length
        ? ids.map((id) => {
          const r = RESOURCES[id];
          return `<div class="cargo-row"><span class="res-dot" style="background:${r.color}"></span>${r.name}<b>${p.cargo[id]} u</b><em>◈ ${(p.cargo[id] * r.price).toLocaleString()}</em></div>`;
        }).join("")
        : '<div class="empty">No cargo to sell.</div>';
      body.querySelector("#dock-value").textContent = "◈ " + fmtNum(p.cargoTotal > 0 ? Object.keys(p.cargo).reduce((a, id) => a + p.cargo[id] * RESOURCES[id].price, 0) : 0);
      const click = (fn) => { const b = body.querySelectorAll(`[data-s="${fn}"]`); };
      body.querySelector('[data-s="refuel"]').onclick = () => {
        if (p.spend(refuelCost)) {
          g.ship.fuel = p.maxFuel;
          g.audio.play("money");
          g.toast("Refueled", "good");
          g.saveGame();
          render();
        }
      };
      body.querySelector('[data-s="repair"]').onclick = () => {
        g.ship.hull = p.maxHull;
        g.audio.play("dock");
        g.toast("Hull repaired", "good");
        g.saveGame();
        render();
      };
      body.querySelector('[data-s="charge"]').onclick = () => {
        g.ship.energy = p.maxEnergy;
        g.toast("Energy cells charged", "good");
        render();
      };
      body.querySelector('[data-s="sell"]').onclick = () => {
        const { total } = p.sellAllCargo();
        if (total > 0) {
          g.audio.play("money");
          g.discovery.grant("trader");
          g.toast("Sold cargo for ◈ " + fmtNum(total), "good");
          g.saveGame();
        } else g.toast("Nothing to sell", "warn");
        render();
      };
      body.querySelector('[data-s="save"]').onclick = () => {
        g.saveGame();
        g.toast("Game saved", "good");
      };
      body.querySelector('[data-s="leave"]').onclick = () => {
        g.exitDock(true);
      };
    };
    render();
    return panel;
  }
}

function getStationSheet(id, game) {
  const st = game.solar.getStation(id);
  if (!st) return null;
  const def = STATION_DEFS.find((s) => s.id === id);
  return {
    id, name: st.name, station: st, type: "Orbital station",
    radius: "—", distance: `Orbiting ${def.bodyId.toUpperCase()}`,
    gravity: "0 G (rotating)", temp: "Controlled", atmosphere: "Pressurized",
    data: { facts: "" },
  };
}
