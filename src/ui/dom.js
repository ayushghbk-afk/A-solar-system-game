// Tiny DOM helpers used across the UI.
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

export function fmtNum(n, digits = 0) {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtKm(worldUnits) {
  // world units are treated as ~500 km for display flavor
  return fmtNum(worldUnits * 500, 0);
}

export function fmtTime(seconds) {
  if (!isFinite(seconds)) return "—";
  seconds = Math.max(0, seconds);
  if (seconds < 60) return Math.round(seconds) + " s";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m + ":" + String(s).padStart(2, "0");
}

// Build a read-only progress bar
export function bar(pct) {
  const wrap = el("div", "bar");
  const fill = el("div", "bar-fill");
  fill.style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
  wrap.appendChild(fill);
  return wrap;
}

export function button(label, cls, onClick) {
  const b = el("button", "btn " + (cls || ""));
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Applies "is-phone" class to <html> once based on UA & size.
export function detectPhone() {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 760;
  document.documentElement.classList.toggle("is-phone", small || (coarse && !window.matchMedia("(pointer: fine)").matches));
  return document.documentElement.classList.contains("is-phone");
}
