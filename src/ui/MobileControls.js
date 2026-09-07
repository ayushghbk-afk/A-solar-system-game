// Touch controls for phones/tablets. Left stick steers the ship, right stick
// looks, buttons on the right side for boost/brake/up/down + actions.
import { el } from "./dom.js";

export class MobileControls {
  constructor(layer, controller, game) {
    this.layer = layer;
    this.ctl = controller;
    this.game = game;
    this.active = false;
    this._build();
    this.setVisible(false);
  }

  _build() {
    this.layer.innerHTML = `
      <div class="mc-left">
        <div class="stick-base" id="mc-move"><div class="stick-knob"></div><div class="stick-label">MOVE</div></div>
      </div>
      <div class="mc-right">
        <div class="mc-buttons">
          <button class="mc-btn" id="mc-map">🗺</button>
          <button class="mc-btn" id="mc-scan">📡</button>
          <button class="mc-btn" id="mc-pause">⏸</button>
        </div>
        <div class="stick-base look" id="mc-look"><div class="stick-knob"></div><div class="stick-label">LOOK</div></div>
        <div class="mc-pad">
          <button class="mc-btn act" id="mc-interact">E</button>
          <div class="pad-2">
            <button class="mc-btn" id="mc-up">▲</button>
            <button class="mc-btn" id="mc-down">▼</button>
          </div>
          <button class="mc-btn hold warn" id="mc-boost">BOOST</button>
          <button class="mc-btn hold" id="mc-brake">BRAKE</button>
        </div>
      </div>`;

    this._sticks = {};
    this._bindStick("mc-move", "moveAxis");
    this._bindStick("mc-look", "lookAxis", 0.55);

    const bindHold = (id, prop) => {
      const b = this.layer.querySelector(id);
      const down = (e) => {
        e.preventDefault();
        this.ctl[prop] = true;
        b.classList.add("on");
      };
      const up = (e) => {
        e.preventDefault();
        this.ctl[prop] = false;
        b.classList.remove("on");
      };
      b.addEventListener("pointerdown", down);
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      b.addEventListener("pointerleave", up);
    };
    bindHold("#mc-boost", "touchBoost");
    bindHold("#mc-brake", "touchBrake");

    const bindTap = (id, fn) => {
      this.layer.querySelector(id).addEventListener("click", (e) => {
        e.preventDefault();
        fn();
      });
    };
    bindTap("#mc-map", () => this.game.openPanel("map"));
    bindTap("#mc-scan", () => this.game.tryScan());
    bindTap("#mc-pause", () => this.game.togglePause());
    const interact = () => this.game.interactButton();
    bindTap("#mc-interact", () => interact());
    // up/down are momentary
    const moment = (id, prop) => {
      const b = this.layer.querySelector(id);
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); this.ctl[prop] = true; b.classList.add("on"); });
      b.addEventListener("pointerup", (e) => { e.preventDefault(); this.ctl[prop] = false; b.classList.remove("on"); });
      b.addEventListener("pointercancel", (e) => { this.ctl[prop] = false; b.classList.remove("on"); });
    };
    moment("#mc-up", "touchUp");
    moment("#mc-down", "touchDown");
  }

  _bindStick(id, target, sens = 1) {
    const base = this.layer.querySelector("#" + id);
    const knob = base.querySelector(".stick-knob");
    const radius = 46;
    let pid = null;
    const zero = () => {
      this.ctl[target].x = 0;
      this.ctl[target].y = 0;
      knob.style.transform = "translate(0px, 0px)";
      base.classList.remove("active");
    };
    const move = (e) => {
      if (pid === null) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = dx / len * radius;
        dy = dy / len * radius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const ax = dx / radius;
      const ay = dy / radius;
      if (target === "moveAxis") {
        // y>0 means forward; screen down (positive dy) should reverse => -ay
        this.ctl.moveAxis.x = ax;
        this.ctl.moveAxis.y = -ay;
      } else {
        this.ctl.lookAxis.x = ax * 0.35 * sens;
        this.ctl.lookAxis.y = ay * 0.35 * sens;
      }
    };
    base.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pid = e.pointerId;
      base.setPointerCapture(pid);
      base.classList.add("active");
      knob.style.transition = "none";
      move(e);
    });
    const up = (e) => {
      if (pid === null || e.pointerId !== pid) return;
      pid = null;
      zero();
      knob.style.transition = "transform .15s ease";
    };
    base.addEventListener("pointermove", move);
    base.addEventListener("pointerup", up);
    base.addEventListener("pointercancel", up);
    base.addEventListener("pointerleave", (e) => {
      if (pid !== null) move(e);
    });
  }

  setVisible(v) {
    this.layer.classList.toggle("on", v && this.active);
  }

  setActive(v) {
    this.active = v;
    this.setVisible(v);
    if (!v) {
      this.ctl.moveAxis.x = this.ctl.moveAxis.y = 0;
      this.ctl.lookAxis.x = this.ctl.lookAxis.y = 0;
      this.ctl.touchBoost = this.ctl.touchBrake = this.ctl.touchUp = this.ctl.touchDown = false;
    }
  }
}
