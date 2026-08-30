import { BALANCE, powerDraw } from "../domain/recipes.js?v=26";

const CORE_TYPES = new Set(["generator", "pole", "battery"]);

export class PowerSystem {
  constructor(bus, store, world) {
    this.bus = bus;
    this.store = store;
    this.world = world;
    this.factors = new Map();
    this.summary = { generated: 0, supplied: 0, demand: 0, stored: 0, capacity: 0, networks: 0 };
    this.accumulator = 0;
    this.dirty = true;
  }

  invalidate() {
    this.dirty = true;
  }

  key(tile) {
    return `${tile.x},${tile.y}`;
  }

  hasCore(tile) {
    return CORE_TYPES.has(tile?.building?.type) || CORE_TYPES.has(tile?.powerNode?.type);
  }

  consumerTargets(tile) {
    return [tile?.building, tile?.rail].filter((target) => powerDraw(target) > 0);
  }

  demandFor(tile) {
    return this.consumerTargets(tile).reduce((sum, target) => sum + powerDraw(target), 0);
  }

  isPowerTile(tile) {
    return this.hasCore(tile) || this.demandFor(tile) > 0;
  }

  linked(left, right) {
    if (!this.isPowerTile(left) || !this.isPowerTile(right)) return false;
    return this.hasCore(left) || this.hasCore(right);
  }

  buildNetworks(dt) {
    const powerTiles = [];
    this.world.forEach((tile) => {
      if (this.isPowerTile(tile)) powerTiles.push(tile);
    });
    const pending = new Set(powerTiles.map((tile) => this.key(tile)));
    const networks = [];
    while (pending.size) {
      const firstKey = pending.values().next().value;
      const first = powerTiles.find((tile) => this.key(tile) === firstKey);
      const queue = [first];
      const network = [];
      pending.delete(firstKey);
      for (let index = 0; index < queue.length; index += 1) {
        const tile = queue[index];
        network.push(tile);
        this.world.neighbors(tile.x, tile.y).forEach((neighbor) => {
          const key = this.key(neighbor);
          if (!pending.has(key) || !this.linked(tile, neighbor)) return;
          pending.delete(key);
          queue.push(neighbor);
        });
      }
      networks.push(network);
    }

    this.factors.clear();
    let generated = 0;
    let supplied = 0;
    let demand = 0;
    let stored = 0;
    let capacity = 0;
    networks.forEach((network) => {
      const generators = network.filter((tile) => tile.building?.type === "generator");
      const batteries = network.filter((tile) => tile.building?.type === "battery");
      const consumers = network.filter((tile) => this.demandFor(tile) > 0);
      generators.forEach((tile) => {
        const generator = tile.building;
        if ((generator.fuelLeft || 0) <= 0 && generator.coal > 0) {
          generator.coal -= 1;
          generator.fuelLeft = BALANCE.power.fuelSeconds;
          this.bus.emit("tile", { tile, reason: "generator-fuel" });
        }
        generator.fuelLeft = Math.max(0, (generator.fuelLeft || 0) - dt);
      });
      const supply = generators.reduce((sum, tile) => (
        sum + (tile.building.fuelLeft > 0
          ? BALANCE.power.generatorOutput[tile.building.tier] || BALANCE.power.generatorOutput[1]
          : 0)
      ), 0);
      const required = consumers.reduce((sum, tile) => sum + this.demandFor(tile), 0);
      let available = supply;
      const networkCapacity = batteries.reduce((sum, tile) => (
        sum + (BALANCE.power.batteryCapacity[tile.building.tier] || BALANCE.power.batteryCapacity[1])
      ), 0);
      let networkStored = batteries.reduce((sum, tile) => sum + Math.max(0, tile.building.charge || 0), 0);
      const energyNeed = Math.max(0, required - available) * dt;
      const discharge = Math.min(networkStored, energyNeed);
      networkStored -= discharge;
      if (dt > 0) available += discharge / dt;
      const surplus = Math.max(0, available - required) * dt;
      networkStored = Math.min(networkCapacity, networkStored + surplus);
      let remaining = networkStored;
      batteries.forEach((tile) => {
        const cap = BALANCE.power.batteryCapacity[tile.building.tier] || BALANCE.power.batteryCapacity[1];
        tile.building.charge = Math.min(cap, remaining);
        remaining -= tile.building.charge;
      });
      const factor = required > 0 ? Math.min(1, available / required) : 1;
      consumers.forEach((tile) => this.factors.set(this.key(tile), factor));
      generated += supply;
      supplied += Math.min(required, available);
      demand += required;
      stored += networkStored;
      capacity += networkCapacity;
    });
    return { generated, supplied, demand, stored, capacity, networks: networks.length };
  }

  update(dt) {
    this.accumulator += dt;
    if (!this.dirty && this.accumulator < 0.25) return;
    const elapsed = this.accumulator;
    this.accumulator = 0;
    this.dirty = false;
    const next = this.buildNetworks(elapsed);
    const changed = Object.keys(next).some((key) => Math.abs(next[key] - this.summary[key]) > 0.01);
    this.summary = next;
    this.store.state.power = { ...next };
    if (next.generated > 0 && this.store.state.stats.powered < 1) {
      this.store.state.stats.powered = 1;
      this.store.changed("power");
    }
    if (changed) this.bus.emit("powerChanged", next);
  }

  factorFor(tile, target = tile?.building) {
    if (powerDraw(target) <= 0) return 1;
    return this.factors.get(this.key(tile)) ?? 0;
  }
}
