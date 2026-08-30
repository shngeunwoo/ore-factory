import { BALANCE, BUILDINGS, INGOT_IDS, ITEMS, SELL, TECHNOLOGIES, TUTORIAL_KITS, createTutorialProgress, itemName, tutorialKeepsFurnaceFuel } from "../domain/recipes.js?v=31";

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(detail));
    this.listeners.get("*")?.forEach((listener) => listener({ type, ...detail }));
  }
}

export function createInitialState() {
  const counts = Object.fromEntries(ITEMS.map((item) => [item.id, 0]));
  Object.entries(BALANCE.start.items).forEach(([id, count]) => {
    counts[id] = count;
  });

  return {
    counts,
    money: BALANCE.start.money,
    unlocked: { rail_1: true, furnace: true },
    discovered: { stone: true, coal: true, iron: true, copper: true },
    stats: {
      mined: 0, sold: 0, soldItems: 0, expanded: 0, placed: 0,
      transported: 0, smeltedCount: 0, powered: 0, researchedCount: 0,
    },
    progress: createTutorialProgress(),
    research: { points: 0, completed: {} },
    quests: { progress: {}, completed: {} },
    power: { generated: 0, supplied: 0, demand: 0, stored: 0, capacity: 0, networks: 0 },
    settings: {
      sound: true,
      reducedMotion: false,
      tutorialCollapsed: false,
      tutorialSkipped: false,
    },
  };
}

export class GameStore {
  constructor(bus, snapshot = null) {
    this.bus = bus;
    this.state = createInitialState();
    if (snapshot) this.restore(snapshot);
  }

  restore(snapshot) {
    const fresh = createInitialState();
    const validCounts = {};
    ITEMS.forEach((item) => {
      const value = Number(snapshot?.counts?.[item.id]);
      validCounts[item.id] = Number.isFinite(value) && value >= 0 ? Math.floor(value) : fresh.counts[item.id];
    });
    this.state = {
      counts: validCounts,
      money: Math.max(0, Math.floor(Number(snapshot?.money) || 0)),
      unlocked: { ...fresh.unlocked, ...(snapshot?.unlocked || {}) },
      discovered: { ...fresh.discovered, ...(snapshot?.discovered || {}) },
      stats: { ...fresh.stats, ...(snapshot?.stats || {}) },
      progress: createTutorialProgress(snapshot?.progress),
      research: {
        points: Math.max(0, Math.floor(Number(snapshot?.research?.points) || 0)),
        completed: { ...(snapshot?.research?.completed || {}) },
      },
      quests: {
        progress: { ...(snapshot?.quests?.progress || {}) },
        completed: { ...(snapshot?.quests?.completed || {}) },
      },
      power: { ...fresh.power, ...(snapshot?.power || {}) },
      settings: { ...fresh.settings, ...(snapshot?.settings || {}) },
    };
    if (this.state.research.completed.automation) this.state.progress.researched = true;
  }

  adoptWorldProgress(world) {
    world?.forEach?.((tile) => {
      if (tile.rail) this.state.progress.railed = true;
      if (tile.building?.type === "miner") this.state.progress.miner = true;
    });
  }

  markProgress(id) {
    if (!Object.hasOwn(this.state.progress, id) || this.state.progress[id]) return false;
    this.state.progress[id] = true;
    this.changed("progress");
    return true;
  }

  grantTutorialKit(stepId) {
    const kit = TUTORIAL_KITS[stepId];
    if (!kit || this.state.settings.tutorialSkipped) return false;
    let given = false;
    Object.entries(kit).forEach(([id, amount]) => {
      const need = Math.max(0, amount - this.count(id));
      if (need > 0 && this.add(id, need, "tutorial")) given = true;
    });
    return given;
  }

  keepsTutorialFurnaceFuel() {
    return tutorialKeepsFurnaceFuel(this.state.progress, this.state.settings.tutorialSkipped);
  }

  snapshot() {
    return structuredClone(this.state);
  }

  get money() {
    return this.state.money;
  }

  count(id) {
    return this.state.counts[id] || 0;
  }

  isDiscovered(id) {
    return Boolean(this.state.discovered[id]);
  }

  displayName(id) {
    return this.isDiscovered(id) ? itemName(id) : "???";
  }

  discover(id, source = "inventory") {
    if (!id || this.state.discovered[id]) return false;
    this.state.discovered[id] = true;
    this.bus.emit("discover", { id, source });
    this.changed("discovery");
    return true;
  }

  add(id, amount = 1, source = "inventory") {
    if (!Object.hasOwn(this.state.counts, id) || amount <= 0) return false;
    const first = this.discover(id, source);
    this.state.counts[id] += Math.floor(amount);
    this.bus.emit("inventory", { id, amount, source, first });
    this.changed("inventory");
    return true;
  }

  has(cost) {
    return Object.entries(cost).every(([id, amount]) => this.count(id) >= amount);
  }

  missing(cost) {
    return Object.fromEntries(
      Object.entries(cost)
        .map(([id, amount]) => [id, Math.max(0, amount - this.count(id))])
        .filter(([, amount]) => amount > 0),
    );
  }

  take(cost, reason = "craft") {
    if (!this.has(cost)) return false;
    Object.entries(cost).forEach(([id, amount]) => {
      this.state.counts[id] -= amount;
    });
    this.bus.emit("inventory", { cost, amount: -1, source: reason });
    this.changed("inventory");
    return true;
  }

  refund(cost, reason = "refund") {
    Object.entries(cost).forEach(([id, amount]) => this.add(id, amount, reason));
  }

  spend(amount, reason = "purchase") {
    if (!Number.isFinite(amount) || amount < 0 || this.state.money < amount) return false;
    this.state.money -= amount;
    this.bus.emit("money", { amount: -amount, reason, total: this.state.money });
    this.changed("money");
    return true;
  }

  addMoney(amount, reason = "credit") {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    this.state.money += amount;
    this.bus.emit("money", { amount, reason, total: this.state.money });
    this.changed("money");
    return amount;
  }

  creditItem(id, amount = 1, source = "automatic") {
    const count = Math.max(0, Math.floor(amount));
    const gained = (SELL[id] || 0) * count;
    if (!gained) return { amount: 0, gained: 0 };
    this.discover(id, source);
    this.addMoney(gained, "sale");
    this.state.stats.sold += gained;
    this.state.stats.soldItems += count;
    this.markProgress("sold");
    if (source === "automatic" && this.state.progress.smelted) {
      if (INGOT_IDS.includes(id)) this.markProgress("collected");
      this.markProgress("linked");
    }
    this.bus.emit("sale", { id, amount: count, gained, source });
    this.changed("sale");
    return { amount: count, gained };
  }

  sell(id, requested = 1) {
    const amount = Math.min(Math.max(0, Math.floor(requested)), this.count(id));
    if (!amount) return { amount: 0, gained: 0 };
    this.state.counts[id] -= amount;
    const result = this.creditItem(id, amount, "manual");
    this.bus.emit("inventory", { id, amount: -amount, source: "sale" });
    this.changed("inventory");
    return result;
  }

  isUnlocked(id) {
    return Boolean(this.state.unlocked[id]);
  }

  unlock(id) {
    const def = BUILDINGS[id];
    if (!def || this.isUnlocked(id)) return false;
    if (!this.spend(def.unlockCost, "unlock")) return false;
    this.state.unlocked[id] = true;
    this.bus.emit("unlock", { id, def });
    this.changed("unlock");
    return true;
  }

  addResearch(amount, source = "reward") {
    const count = Math.max(0, Math.floor(Number(amount) || 0));
    if (!count) return false;
    this.state.research.points += count;
    this.bus.emit("researchPoints", { amount: count, source, total: this.state.research.points });
    this.changed("research");
    return true;
  }

  researchTech(id) {
    const tech = TECHNOLOGIES[id];
    if (!tech || this.state.research.completed[id]) return { ok: false, reason: "이미 연구됨" };
    if (!tech.requires.every((required) => this.state.research.completed[required])) {
      return { ok: false, reason: "선행 연구 필요" };
    }
    if (this.state.research.points < tech.cost) return { ok: false, reason: `연구점 ${tech.cost} 필요` };
    this.state.research.points -= tech.cost;
    this.state.research.completed[id] = true;
    tech.unlocks.forEach((buildingId) => {
      this.state.unlocked[buildingId] = true;
    });
    this.state.stats.researchedCount += 1;
    if (id === "automation") this.markProgress("researched");
    this.bus.emit("researchComplete", { id, tech });
    this.changed("research");
    return { ok: true, tech };
  }

  incrementStat(key, amount = 1) {
    if (!Object.hasOwn(this.state.stats, key)) return;
    this.state.stats[key] += amount;
    if (key === "mined") this.markProgress("mined");
    this.changed("stats");
  }

  markSmelted() {
    this.state.stats.smeltedCount += 1;
    if (!this.markProgress("smelted")) this.changed("progress");
  }

  updateSetting(key, value) {
    if (!Object.hasOwn(this.state.settings, key)) return;
    if (this.state.settings[key] === value) return;
    this.state.settings[key] = value;
    this.bus.emit("settings", { key, value });
    this.changed("settings");
  }

  changed(reason) {
    this.bus.emit("state", { reason, state: this.state });
  }
}
