// Mission definitions + manager. Missions progress from proximity events
// reported by Game; completion grants credits & XP through a callback.
import { fmtKm } from "../ui/dom.js";

const EARTH = "earth", MOON = "moon", MARS = "mars", JUPITER = "jupiter", SATURN = "saturn";

export const MISSION_DEFS = [
  {
    id: "first-flight", name: "FIRST FLIGHT", tier: 1,
    desc: "Break Earth orbit and reach deep space (at least 8 units above Earth's surface).",
    reward: 500, xp: 60,
    type: "escape", target: EARTH, dist: 8,
  },
  {
    id: "lunar-visit", name: "LUNAR VISIT", tier: 1,
    desc: "Reach the Moon and scan it.",
    reward: 1000, xp: 120,
    type: "scan", target: MOON,
  },
  {
    id: "mars-expedition", name: "MARS EXPEDITION", tier: 2,
    desc: "Travel to Mars and enter orbit around the red planet.",
    reward: 5000, xp: 400,
    type: "orbit", target: MARS,
  },
  {
    id: "first-ore", name: "FIRST ORE", tier: 1,
    desc: "Mine 20 units of ore from any asteroid.",
    reward: 800, xp: 100,
    type: "mine", amount: 20,
  },
  {
    id: "outer-system", name: "OUTER SYSTEM", tier: 3,
    desc: "Cross the asteroid belt and reach Jupiter.",
    reward: 10000, xp: 800,
    type: "orbit", target: JUPITER,
  },
  {
    id: "saturn-explorer", name: "SATURN EXPLORER", tier: 3,
    desc: "Reach Saturn and skim the ringed giant.",
    reward: 15000, xp: 1100,
    type: "approach", target: SATURN, dist: 2.2,
  },
  {
    id: "beyond", name: "BEYOND", tier: 4,
    desc: "Reach the ice giants: Uranus and Neptune.",
    reward: 30000, xp: 2200,
    type: "multi", targets: ["uranus", "neptune"],
  },
  {
    id: "all-planets", name: "SOLAR SYSTEM TOUR", tier: 4,
    desc: "Orbit every planet from Mercury to Neptune.",
    reward: 75000, xp: 5000,
    type: "multi", targets: ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"],
  },
];

// Missions a fresh pilot can accept immediately; later ones unlock by tier.
const INITIAL_IDS = ["first-flight", "lunar-visit", "first-ore"];

export class MissionManager {
  constructor(profile, onEvent) {
    this.profile = profile;
    this.onEvent = onEvent; // (type, payload) for achievements/sound
    this.accepted = []; // accepted mission ids (some completed)
    this.completed = []; // ids fully completed
    this.active = []; // accepted & not completed
    this.progress = {}; // id -> current state count
    this.history = profile._missionsHistory || [];
    // migrate saved completed
    if (Array.isArray(profile._completedMissions)) {
      this.completed = profile._completedMissions;
    }
  }

  unlockable() {
    // Missions not yet accepted whose tier is <= player's unlocked tier.
    const tier = this.maxCompletedTier() + 1;
    return MISSION_DEFS.filter((m) => !this.accepted.includes(m.id) && !this.completed.includes(m.id) && m.tier <= tier);
  }

  maxCompletedTier() {
    let t = 0;
    for (const id of this.completed) {
      const d = MISSION_DEFS.find((m) => m.id === id);
      if (d && d.tier > t) t = d.tier;
    }
    return t;
  }

  initialUnlocked() {
    return MISSION_DEFS.filter((m) => INITIAL_IDS.includes(m.id) || m.tier <= this.maxCompletedTier() + 1);
  }

  accept(id) {
    const def = MISSION_DEFS.find((m) => m.id === id);
    if (!def || this.accepted.includes(id) || this.completed.includes(id)) return false;
    this.accepted.push(id);
    this.active.push(id);
    this.progress[id] = this.progress[id] || 0;
    this.onEvent("mission-accepted", def);
    return true;
  }

  getActiveDefs() {
    return this.active.map((id) => MISSION_DEFS.find((m) => m.id === id)).filter(Boolean);
  }

  // Called by Game with proximity/progression events.
  report(kind, payload) {
    const changed = [];
    for (const id of [...this.active]) {
      const def = MISSION_DEFS.find((m) => m.id === id);
      if (!def) continue;
      if (def.type === kind) {
        const done = this._advance(def, payload);
        if (done) changed.push(def);
      }
    }
    return changed;
  }

  _advance(def, payload) {
    const cur = this.progress[def.id] || 0;
    switch (def.type) {
      case "escape":
        if (payload.body === def.target && payload.dist >= def.dist) return this.complete(def);
        return false;
      case "proximity":
        if (payload.body === def.target && payload.dist <= def.dist) return this.complete(def);
        return false;
      case "scan":
        if (payload.body === def.target) return this.complete(def);
        return false;
      case "orbit":
        if (payload.body === def.target) return this.complete(def);
        return false;
      case "approach":
        if (payload.body === def.target && payload.dist <= def.dist) return this.complete(def);
        return false;
      case "mine": {
        const n = cur + payload.amount;
        this.progress[def.id] = Math.min(n, def.amount);
        return this.progress[def.id] >= def.amount ? this.complete(def) : false;
      }
      case "multi": {
        // payload: {body}
        if (payload.body && def.targets.includes(payload.body)) {
          this.progress[def.id] = (cur | 0) + 1;
          if (this.progress[def.id] >= def.targets.length) return this.complete(def);
        }
        return false;
      }
      default:
        return false;
    }
  }

  complete(def) {
    this.active = this.active.filter((id) => id !== def.id);
    this.completed.push(def.id);
    this.profile.addCredits(def.reward);
    this.profile.addXp(def.xp);
    this.onEvent("mission-complete", def);
    return true;
  }

  activeMissionText() {
    // for HUD objective: first active mission
    const defs = this.getActiveDefs();
    if (!defs.length) return null;
    const d = defs[0];
    return { text: d.name + " — " + d.desc, def: d };
  }

  toSave() {
    return { accepted: this.accepted, completed: this.completed, active: this.active, progress: this.progress };
  }

  static fromSave(s, profile, onEvent) {
    const mm = new MissionManager(profile, onEvent);
    if (s) {
      mm.accepted = s.accepted || [];
      mm.completed = s.completed || [];
      mm.active = s.active || [];
      mm.progress = s.progress || {};
    }
    return mm;
  }
}

export function missionRewardText(def) {
  return "◈ " + def.reward.toLocaleString() + "  ·  ⚡ " + def.xp + " XP";
}
