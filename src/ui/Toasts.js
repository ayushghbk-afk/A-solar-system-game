// Transient notification toasts ("Mission complete!", "Discovered: Jupiter").
import { el } from "./dom.js";

export class Toasts {
  constructor(root) {
    this.root = root;
  }

  show(text, { kind = "info", ms = 3200, big = false } = {}) {
    const t = el("div", "toast kind-" + kind + (big ? " big" : ""));
    t.textContent = text;
    this.root.appendChild(t);
    requestAnimationFrame(() => t.classList.add("on"));
    setTimeout(() => this.dismiss(t), ms);
    return t;
  }

  dismiss(t) {
    if (!t || !t.parentNode) return;
    t.classList.remove("on");
    setTimeout(() => t.remove(), 320);
  }

  dismissAll() {
    Array.from(this.root.children).forEach((t) => this.dismiss(t));
  }
}
