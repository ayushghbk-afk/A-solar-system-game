// In-flight HUD. Reads a snapshot object produced each frame by Game.update
// (game.hud) and renders it with minimal allocations/updates.
import { el, fmtNum, fmtKm, fmtTime } from "./dom.js";

const BAR_KEYS = ["fuel", "shield", "energy", "hull"];

export class HUD {
  constructor(root, onAction) {
    this.root = root;
    this.onAction = onAction;
    root.innerHTML = `
      <div class="hud">
        <div class="hud-panel hud-systems">
          <div class="sys-row hull"><span>HULL</span><div class="bar"><i></i></div><em>100</em></div>
          <div class="sys-row shield"><span>SHIELD</span><div class="bar"><i></i></div><em>100</em></div>
          <div class="sys-row fuel"><span>FUEL</span><div class="bar"><i></i></div><em>100</em></div>
          <div class="sys-row energy"><span>ENERGY</span><div class="bar"><i></i></div><em>100</em></div>
          <div class="hud-stats">
            <span><b class="st-speed">0</b> m/s</span>
            <span class="st-alt"><b>ALT</b> <b class="st-alt-v">—</b></span>
          </div>
          <div class="hud-money"><span class="st-credits">◈ 0</span><span class="st-xp">⚡ 0 XP</span></div>
        </div>

        <div class="hud-top-center">
          <div class="objective-pill" hidden><span class="obj-label">OBJECTIVE</span><span class="obj-text"></span></div>
        </div>

        <div class="hud-panel hud-target" hidden>
          <div class="target-name">—</div>
          <div class="target-row"><span>DIST</span><b class="t-dist">—</b></div>
          <div class="target-row"><span>RAD</span><b class="t-rad">—</b></div>
          <div class="target-row"><span>VEL</span><b class="t-vel">—</b></div>
          <div class="target-row"><span>ATMO</span><b class="t-atmo">—</b></div>
        </div>

        <div class="hud-bottom">
          <div class="hud-prompt" hidden></div>
          <div class="hud-speed"><span class="spd-text">0 m/s</span><span class="spd-warp">THR 0%</span></div>
          <div class="hud-hint">W/S move · A/D strafe · Space/Ctrl up-down · Shift boost · Mouse look · E interact · R scan · M map · I info · Esc pause</div>
        </div>

        <div class="reticle" aria-hidden="true"><span></span></div>
      </div>
      <div class="activity" id="activityOverlay" hidden>
        <div class="activity-card">
          <div class="act-title" id="actTitle">SCANNING…</div>
          <div class="bar fat"><i id="actFill"></i></div>
          <div class="act-body" id="actBody"></div>
        </div>
      </div>
    `;
    this.bars = {};
    for (const k of BAR_KEYS) {
      this.bars[k] = root.querySelector(".sys-row." + k + " .bar i");
    }
    this.sysRow = (k) => root.querySelector(".sys-row." + k);
    this.root = root;
    this.setVisible(false); // hidden until the first flight starts
  }

  setVisible(v) {
    this.root.classList.toggle("hidden", !v);
  }

  render(s) {
    if (!s) return;
    this._setBar("hull", s.hull, s.hullMax || 100);
    this._setBar("shield", s.shield, s.shieldMax || 100);
    this._setBar("fuel", s.fuel, s.fuelMax || 100);
    this._setBar("energy", s.energy, s.energyMax || 100);
    this.root.querySelector(".hud-systems .sys-row.fuel em").textContent = Math.ceil(s.fuel) + "/" + Math.round(s.fuelMax);
    this.root.querySelector(".hud-systems .sys-row.energy em").textContent = Math.ceil(s.energy) + "/" + Math.round(s.energyMax);
    const hullV = Math.max(0, Math.ceil(s.hull));
    this.root.querySelector(".hud-systems .sys-row.hull em").textContent = hullV;
    this.root.querySelector(".hud-systems .sys-row.shield em").textContent = s.shield <= 0.5 ? "DOWN" : Math.ceil(s.shield) + "/" + Math.round(s.shieldMax);

    this.root.querySelector(".st-credits").textContent = "◈ " + fmtNum(s.credits, 0);
    this.root.querySelector(".st-xp").textContent = "⚡ " + fmtNum(s.xp, 0) + " XP";

    // speed readout
    const spd = s.speedKmS; // already in km/s display units
    const spdTxt = spd >= 1e3 ? (spd / 1e3).toFixed(1) + "k" : spd.toFixed(0);
    this.root.querySelector(".spd-text").textContent = spdTxt + " km/s";
    this.root.querySelector(".st-speed").textContent = spdTxt;
    this.root.querySelector(".spd-warp").textContent = "THR " + Math.round(s.throttle * 100) + "%" + (s.boost ? " BOOST" : "");
    const altEl = this.root.querySelector(".st-alt-v");
    if (s.altBody) altEl.textContent = "▾ " + fmtKm(s.altDist) + " km · " + s.altBody.toUpperCase();
    else altEl.textContent = "DEEP SPACE";

    // objective
    const objPill = this.root.querySelector(".objective-pill");
    const objText = objPill.querySelector(".obj-text");
    if (s.objective) {
      objPill.hidden = false;
      objText.textContent = s.objective;
      objText.style.color = s.objKind === "danger" ? "#ff9a6a" : "";
    } else objPill.hidden = true;

    // target card
    const tc = this.root.querySelector(".hud-target");
    if (s.target) {
      tc.hidden = false;
      tc.querySelector(".target-name").textContent = s.target.name;
      tc.querySelector(".target-name").style.color = s.target.kindColor || "";
      tc.querySelector(".t-dist").textContent = s.target.dist !== null ? fmtKm(s.target.dist) + " km" : "—";
      tc.querySelector(".t-rad").textContent = s.target.radiusKm ? s.target.radiusKm + " km" : "—";
      tc.querySelector(".t-vel").textContent = s.target.relSpeed !== null ? fmtKm(s.target.relSpeed) + " km/s" : "—";
      tc.querySelector(".t-atmo").textContent = s.target.atmo || "—";
    } else tc.hidden = true;

    // prompt
    const pr = this.root.querySelector(".hud-prompt");
    if (s.prompt) {
      pr.hidden = false;
      pr.textContent = s.prompt;
      pr.classList.toggle("warn", !!s.promptWarn);
      pr.classList.toggle("good", !!s.promptGood);
    } else pr.hidden = true;

    // activity overlay (scanning / mining)
    const act = this.root.querySelector("#activityOverlay");
    if (s.activity) {
      act.hidden = false;
      this.root.querySelector("#actTitle").textContent = s.activity.title;
      this.root.querySelector("#actFill").style.width = Math.round(s.activity.pct * 100) + "%";
      const body = this.root.querySelector("#actBody");
      if (body.innerHTML !== s.activity.html) body.innerHTML = s.activity.html;
    } else {
      act.hidden = true;
    }
  }

  _setBar(key, value, max) {
    const v = Math.max(0, Math.min(max, value));
    const p = max > 0 ? v / max : 0;
    const fill = this.bars[key];
    if (!fill) return;
    fill.style.width = (p * 100).toFixed(1) + "%";
    fill.classList.toggle("low", p < 0.22);
    fill.classList.toggle("empty", p <= 0.001);
  }
}
