import { BALANCE, QUESTS, TECHNOLOGIES } from "../domain/recipes.js?v=25";

export class ProgressionSystem {
  constructor(bus, store, world, power = null) {
    this.bus = bus;
    this.store = store;
    this.world = world;
    this.power = power;
    this.checking = false;
    this.unsubscribers = [
      bus.on("state", () => this.checkQuests()),
      bus.on("cargoMove", () => this.checkQuests()),
      bus.on("powerChanged", () => this.checkQuests()),
    ];
    this.checkQuests();
  }

  research(id) {
    return this.store.researchTech(id);
  }

  availableTech(id) {
    const tech = TECHNOLOGIES[id];
    return Boolean(
      tech &&
      !this.store.state.research.completed[id] &&
      tech.requires.every((required) => this.store.state.research.completed[required]),
    );
  }

  metricValue(metric) {
    return Math.max(0, Number(this.store.state.stats[metric]) || 0);
  }

  rewardQuest(quest) {
    const reward = quest.reward || {};
    if (reward.money) this.store.addMoney(reward.money, "quest");
    if (reward.items) this.store.refund(reward.items, "quest");
    if (reward.research) this.store.addResearch(reward.research, "quest");
  }

  checkQuests() {
    if (this.checking) return;
    this.checking = true;
    for (const quest of QUESTS) {
      if (this.store.state.quests.completed[quest.id]) continue;
      const value = Math.min(quest.target, this.metricValue(quest.metric));
      this.store.state.quests.progress[quest.id] = value;
      if (value < quest.target) continue;
      this.store.state.quests.completed[quest.id] = true;
      this.rewardQuest(quest);
      this.bus.emit("questComplete", { quest });
    }
    this.checking = false;
  }

  update(dt) {
    this.world.forEach((tile) => {
      const lab = tile.building;
      if (lab?.type !== "lab") return;
      const factor = this.power ? this.power.factorFor(tile) : 1;
      if (factor <= 0) return;
      lab.progress = (lab.progress || 0) + (dt * factor) / BALANCE.research.labSecondsPerPoint;
      let points = 0;
      while (lab.progress >= 1 && this.store.take(BALANCE.research.labCostPerPoint, "research-lab")) {
        lab.progress -= 1;
        points += 1;
      }
      if (lab.progress >= 1) lab.progress = 1;
      if (points > 0) {
        this.store.addResearch(points, "lab");
        this.bus.emit("machineCycle", { tile, type: "research", amount: points });
        this.bus.emit("dirty", { reason: "research" });
      }
      this.bus.emit("tile", { tile, reason: points > 0 ? "research" : "progress" });
    });
  }

  destroy() {
    this.unsubscribers.forEach((unsubscribe) => unsubscribe());
  }
}
