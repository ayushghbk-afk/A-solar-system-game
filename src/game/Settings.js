// Graphics / audio / gameplay settings with persistence.
import { SaveSystem } from "../save/SaveSystem.js";

export function defaultSettings() {
  const phone = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 760);
  return {
    quality: phone ? "low" : "medium",
    shadows: !phone,
    bloom: !phone,
    particles: true,
    stars: phone ? "low" : "medium",
    sound: true,
    music: false,
    timeScale: 0, // 0 means "use default warp", otherwise explicit multiplier
    planetQuality: phone ? "low" : "medium",
    phone,
  };
}

export function qualityPreset(quality) {
  if (quality === "low") return { shadows: false, bloom: false, stars: "low", planetQuality: "low" };
  if (quality === "high") return { shadows: true, bloom: true, stars: "high", planetQuality: "high" };
  return { shadows: true, bloom: true, stars: "medium", planetQuality: "medium" };
}

export class SettingsManager {
  constructor() {
    this.ss = new SaveSystem();
    this.s = { ...defaultSettings(), ...(this.ss.load("settings") || {}) };
    // clamp validity
    if (!["low", "medium", "high"].includes(this.s.quality)) this.s.quality = "medium";
    if (!["low", "medium", "high"].includes(this.s.stars)) this.s.stars = "medium";
  }

  get(key) {
    return this.s[key];
  }

  set(key, value) {
    this.s[key] = value;
    this.save();
  }

  // Persist the current settings (used after direct mutations, e.g. the boot
  // watchdog's "try low graphics" escape hatch before a reload).
  save() {
    this.ss.save("settings", this.s);
  }

  applyQuality(q) {
    const p = qualityPreset(q);
    Object.assign(this.s, p);
    this.s.quality = q;
    this.save();
  }
}
