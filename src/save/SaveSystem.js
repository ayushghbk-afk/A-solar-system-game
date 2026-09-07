// localStorage persistence with graceful fallbacks (private mode, quota…).
const PREFIX = "solar-odyssey:";

export class SaveSystem {
  constructor() {
    this.ok = false;
    this.error = null;
    try {
      const t = "__solar_test__";
      window.localStorage.setItem(t, "1");
      window.localStorage.removeItem(t);
      this.ok = true;
    } catch (e) {
      this.error = "Storage unavailable — progress won't persist.";
    }
  }

  key(name) {
    return PREFIX + name;
  }

  save(name, obj) {
    if (!this.ok) return false;
    try {
      window.localStorage.setItem(this.key(name), JSON.stringify(obj));
      return true;
    } catch (e) {
      this.error = "Could not save (quota?).";
      return false;
    }
  }

  load(name) {
    if (!this.ok) return null;
    try {
      const raw = window.localStorage.getItem(this.key(name));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  remove(name) {
    try {
      window.localStorage.removeItem(this.key(name));
    } catch (e) { /* ignore */ }
  }

  list() {
    const out = {};
    if (!this.ok) return out;
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = true;
      }
    } catch (e) { /* ignore */ }
    return out;
  }
}
