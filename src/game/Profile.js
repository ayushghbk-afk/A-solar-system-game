// Player progression profile: currency, XP, ship stats, cargo, upgrades.
// Pure data + derived stats; persisted via SaveSystem.
import { SHIP } from "./config.js";
import { RESOURCES } from "./bodyData.js";

export const UPGRADES = {
  engine: { name: "ENGINE", base: 0, cost: 400, desc: "More thrust & higher cruise speed" },
  tank: { name: "FUEL TANK", base: 0, cost: 300, desc: "Bigger fuel reserves" },
  shield: { name: "SHIELD", base: 0, cost: 500, desc: "Stronger, faster-recharging shield" },
  energy: { name: "ENERGY CELLS", base: 0, cost: 350, desc: "More power for scanning & mining" },
  hull: { name: "HULL PLATING", base: 0, cost: 450, desc: "Take more punishment" },
};

export const ENGINE_LEVELS = [
  { thrust: 1, cap: 1, label: "MK1" },
  { thrust: 1.35, cap: 1.25, label: "MK2" },
  { thrust: 1.8, cap: 1.55, label: "MK3" },
  { thrust: 2.3, cap: 1.9, label: "MK4" },
  { thrust: 3.0, cap: 2.4, label: "MK5" },
];

export class Profile {
  constructor() {
    this.credits = 0;
    this.xp = 0;
    this.upgrades = { engine: 0, tank: 0, shield: 0, energy: 0, hull: 0 };
    this.cargo = {}; // resourceId -> amount
    this.maxCargoBase = 120;
    this.visited = []; // body ids visited
    this.scanned = []; // body ids scanned
    this.playTimeSec = 0;
    this.stats = { distanceTravelled: 0, minedOre: 0, soldOre: 0, scansDone: 0, creditsEarned: 0 };
    this.reset();
  }

  reset() {
    this.credits = 500;
    this.xp = 0;
    this.upgrades = { engine: 0, tank: 0, shield: 0, energy: 0, hull: 0 };
    this.cargo = {};
    this.visited = [];
    this.scanned = [];
    this.playTimeSec = 0;
    this.stats = { distanceTravelled: 0, minedOre: 0, soldOre: 0, scansDone: 0, creditsEarned: 0 };
  }

  /* ------- derived stats ------- */

  get maxFuel() {
    return SHIP.FUEL_CAPACITY * (1 + this.upgrades.tank * 0.6);
  }
  get maxEnergy() {
    return 100 * (1 + this.upgrades.energy * 0.45);
  }
  get maxShield() {
    return SHIP.SHIELD_CAPACITY * (1 + this.upgrades.shield * 0.6);
  }
  get maxHull() {
    return SHIP.MAX_HULL * (1 + this.upgrades.hull * 0.5);
  }
  get maxCargo() {
    return this.maxCargoBase + this.upgrades.tank * 40;
  }
  get engineLevel() {
    const lvl = Math.min(ENGINE_LEVELS.length - 1, this.upgrades.engine);
    return ENGINE_LEVELS[lvl];
  }
  get engineThrustMult() {
    return this.engineLevel.thrust;
  }
  get engineCapMult() {
    return this.engineLevel.cap;
  }

  get cargoTotal() {
    let n = 0;
    for (const k in this.cargo) n += this.cargo[k] || 0;
    return n;
  }

  cargoOf(id) {
    return this.cargo[id] || 0;
  }

  addCargo(id, amount) {
    const space = this.maxCargo - this.cargoTotal;
    const taken = Math.max(0, Math.min(amount, space));
    this.cargo[id] = (this.cargo[id] || 0) + taken;
    return taken;
  }

  removeCargo(id, amount) {
    const have = this.cargo[id] || 0;
    const taken = Math.min(have, amount);
    this.cargo[id] = have - taken;
    if (this.cargo[id] <= 0) delete this.cargo[id];
    return taken;
  }

  sellAllCargo() {
    let total = 0;
    const detail = [];
    for (const id in this.cargo) {
      const amt = this.cargo[id];
      const price = (RESOURCES[id] || RESOURCES.iron).price;
      total += amt * price;
      detail.push({ id, amt, price });
    }
    if (total > 0) this.credits += total;
    this.stats.soldOre += this.cargoTotal;
    this.stats.creditsEarned += total;
    this.cargo = {};
    return { total, detail };
  }

  upgradeCost(key) {
    const lvl = this.upgrades[key] || 0;
    const base = UPGRADES[key].cost;
    return Math.round(base * Math.pow(SHIP.UPGRADE_COST_MULT, lvl));
  }

  canAfford(cost) {
    return this.credits >= cost;
  }

  spend(cost) {
    if (this.credits < cost) return false;
    this.credits -= cost;
    return true;
  }

  addCredits(n) {
    this.credits += n;
    this.stats.creditsEarned += n;
  }

  addXp(n) {
    this.xp += n;
  }

  markVisited(id) {
    if (!this.visited.includes(id)) this.visited.push(id);
  }
  markScanned(id) {
    if (!this.scanned.includes(id)) this.scanned.push(id);
  }
  hasVisited(id) {
    return this.visited.includes(id);
  }
  hasScanned(id) {
    return this.scanned.includes(id);
  }

  toJSON() {
    return {
      v: 1,
      credits: this.credits,
      xp: this.xp,
      upgrades: this.upgrades,
      cargo: this.cargo,
      visited: this.visited,
      scanned: this.scanned,
      stats: this.stats,
      playTimeSec: Math.round(this.playTimeSec),
    };
  }

  static fromJSON(j) {
    const p = new Profile();
    if (!j) return p;
    if (typeof j.credits === "number") p.credits = j.credits;
    if (typeof j.xp === "number") p.xp = j.xp;
    if (j.upgrades) Object.assign(p.upgrades, j.upgrades);
    if (j.cargo) p.cargo = { ...j.cargo };
    if (Array.isArray(j.visited)) p.visited = j.visited.filter(Boolean);
    if (Array.isArray(j.scanned)) p.scanned = j.scanned.filter(Boolean);
    if (j.stats) Object.assign(p.stats, j.stats);
    return p;
  }
}
