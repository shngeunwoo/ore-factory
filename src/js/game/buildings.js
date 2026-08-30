import {
  BALANCE,
  BUILDINGS,
  ORE_TO_INGOT,
  UPGRADE_DEFS,
  itemName,
  powerDraw,
} from "../domain/recipes.js?v=36";

export const RAIL_DIRECTIONS = Object.freeze({
  n: Object.freeze({ dx: 0, dy: -1, opposite: "s", label: "↑" }),
  e: Object.freeze({ dx: 1, dy: 0, opposite: "w", label: "→" }),
  s: Object.freeze({ dx: 0, dy: 1, opposite: "n", label: "↓" }),
  w: Object.freeze({ dx: -1, dy: 0, opposite: "e", label: "←" }),
});

const DIRECTION_IDS = Object.freeze(Object.keys(RAIL_DIRECTIONS));
const INLINE_TYPES = Object.freeze(["furnace", "router"]);
const paintedProgress = new WeakMap();

export function progressPaintChanged(building) {
  if (!building) return false;
  const shown = Math.round((Number(building.progress) || 0) * 50);
  if (paintedProgress.get(building) === shown) return false;
  paintedProgress.set(building, shown);
  return true;
}

export function normalizeRail(rail) {
  if (!rail || rail.type !== "rail") return;
  rail.routeCursor = Math.max(0, Math.floor(Number(rail.routeCursor) || 0));
  rail.connections ||= { n: true, e: true, s: true, w: true };
  DIRECTION_IDS.forEach((direction) => {
    rail.connections[direction] = rail.connections[direction] !== false;
  });
  if (rail.output !== "auto" && !RAIL_DIRECTIONS[rail.output]) rail.output = "auto";
  rail.output ||= "auto";
}

export function normalizeLab(building) {
  if (building?.type !== "lab") return;
  building.stocks ||= {};
  Object.keys(BALANCE.research.labCostPerPoint).forEach((id) => {
    building.stocks[id] = Math.max(0, Math.floor(Number(building.stocks[id]) || 0));
  });
  building.progress = Math.max(0, Number(building.progress) || 0);
}

export function labHasCost(building) {
  normalizeLab(building);
  return Object.entries(BALANCE.research.labCostPerPoint).every(
    ([id, amount]) => (building.stocks[id] || 0) >= amount,
  );
}

export function labTakeCost(building) {
  if (!labHasCost(building)) return false;
  Object.entries(BALANCE.research.labCostPerPoint).forEach(([id, amount]) => {
    building.stocks[id] -= amount;
  });
  return true;
}

export function normalizeRouter(router) {
  if (!router || router.type !== "router") return;
  if (!router.routes || typeof router.routes !== "object") {
    router.routes = { n: null, e: null, s: null, w: null };
    if (router.filter && RAIL_DIRECTIONS[router.filterOutput]) {
      router.routes[router.filterOutput] = router.filter;
    }
  }
  DIRECTION_IDS.forEach((direction) => {
    if (typeof router.routes[direction] !== "string") router.routes[direction] = null;
  });
  delete router.filter;
  delete router.filterOutput;
}

export function createBuilding(def) {
  const base = { type: def.type, tier: def.tier, defId: def.id, progress: 0 };
  if (def.type === "rail") {
    return {
      ...base,
      routeCursor: 0,
      connections: { n: true, e: true, s: true, w: true },
      output: "auto",
    };
  }
  if (def.type === "miner") return { ...base, queue: [], output: "auto" };
  if (def.type === "furnace") {
    return {
      ...base,
      coal: 0,
      inputQueue: [],
      smelting: null,
      smeltingFrom: null,
      outputStack: {},
      blockUnsmeltedCargo: true,
    };
  }
  if (def.type === "storage") return { ...base, stacks: {}, outputAcc: 0, lastInput: null };
  if (def.type === "router") {
    return { ...base, routes: { n: null, e: "iron", s: null, w: null } };
  }
  if (def.type === "generator") return { ...base, coal: 0, fuelLeft: 0 };
  if (def.type === "battery") return { ...base, charge: 0 };
  if (def.type === "lab") {
    const stocks = {};
    Object.keys(BALANCE.research.labCostPerPoint).forEach((id) => {
      stocks[id] = 0;
    });
    return { ...base, stocks };
  }
  if (def.type === "pole") return base;
  return null;
}

export function placementResult(def, tile) {
  if (!def || !tile) return { ok: false, reason: "존재하지 않는 대상" };
  if (def.type === "pole") {
    return tile.powerNode
      ? { ok: false, reason: "이미 전봇대가 있음" }
      : { ok: true, reason: "" };
  }
  if (tile.building?.type === "shop") return { ok: false, reason: "상점에는 설치할 수 없음" };
  if (def.type === "rail") {
    if (tile.rail) return { ok: false, reason: "이미 레일이 있음" };
    if (tile.ore || tile.building) return { ok: false, reason: "빈 땅에만 레일 설치 가능" };
    return { ok: true, reason: "" };
  }
  if (tile.building) return { ok: false, reason: "이미 설비가 있음" };
  if (def.place === "rail" && !tile.rail) return { ok: false, reason: "레일 위에만 설치 가능" };
  if (def.place === "ore" && !tile.ore) return { ok: false, reason: "광석 위에만 설치 가능" };
  if (def.place === "empty" && (tile.ore || tile.rail)) return { ok: false, reason: "빈 땅에만 설치 가능" };
  if (def.place === "upgrade") return { ok: false, reason: "현장 업그레이드 전용" };
  return { ok: true, reason: "" };
}

export function queueSummary(queue = []) {
  if (!queue.length) return "비움";
  const counts = {};
  queue.forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  return Object.entries(counts).map(([id, count]) => `${itemName(id)}×${count}`).join(", ");
}

export function stackSummary(stack = {}) {
  const entries = Object.entries(stack).filter(([, count]) => count > 0);
  return entries.length ? entries.map(([id, count]) => `${itemName(id)}×${count}`).join(", ") : "없음";
}

export class FactorySimulation {
  constructor(bus, store, world, power = null) {
    this.bus = bus;
    this.store = store;
    this.world = world;
    this.power = power;
  }

  invalidatePaths() {
    this.bus.emit("paths", {});
    this.power?.invalidate();
  }

  directionBetween(from, to) {
    return DIRECTION_IDS.find((direction) => {
      const offset = RAIL_DIRECTIONS[direction];
      return from.x + offset.dx === to.x && from.y + offset.dy === to.y;
    }) || null;
  }

  neighborInDirection(tile, direction) {
    const offset = RAIL_DIRECTIONS[direction];
    return offset ? this.world.get(tile.x + offset.dx, tile.y + offset.dy) : null;
  }

  isRailPortOpen(tile, direction) {
    if (!tile?.rail || !RAIL_DIRECTIONS[direction]) return false;
    normalizeRail(tile.rail);
    return tile.rail.connections[direction];
  }

  railConnection(tile, direction, includeMachine = false) {
    if (!this.isRailPortOpen(tile, direction)) return null;
    const neighbor = this.neighborInDirection(tile, direction);
    if (!neighbor) return null;
    if (neighbor.rail) {
      normalizeRail(neighbor.rail);
      return neighbor.rail.connections[RAIL_DIRECTIONS[direction].opposite] ? neighbor : null;
    }
    if (neighbor.building?.type === "shop") return neighbor;
    if (includeMachine && ["storage", "generator", "lab"].includes(neighbor.building?.type)) return neighbor;
    return null;
  }

  connectedRailNeighbors(tile) {
    return DIRECTION_IDS
      .map((direction) => this.railConnection(tile, direction))
      .filter((neighbor) => neighbor?.rail);
  }

  railLinkedDirections(tile) {
    if (!tile?.rail) return [];
    return DIRECTION_IDS.filter((direction) => {
      if (this.railConnection(tile, direction, true)) return true;
      if (!this.isRailPortOpen(tile, direction)) return false;
      const neighbor = this.neighborInDirection(tile, direction);
      if (neighbor?.building?.type !== "miner") return false;
      const minerOutput = neighbor.building.output || "auto";
      const towardRail = RAIL_DIRECTIONS[direction].opposite;
      return minerOutput === "auto" || minerOutput === towardRail;
    });
  }

  setRailConnection(tile, direction, enabled) {
    if (!tile?.rail || !RAIL_DIRECTIONS[direction]) return false;
    normalizeRail(tile.rail);
    const next = enabled === undefined ? !tile.rail.connections[direction] : Boolean(enabled);
    tile.rail.connections[direction] = next;
    if (!next && tile.rail.output === direction) tile.rail.output = "auto";
    this.invalidatePaths();
    this.changedTile(tile, "rail-config");
    return true;
  }

  setRailOutput(tile, output) {
    if (!tile?.rail || (output !== "auto" && !RAIL_DIRECTIONS[output])) return false;
    normalizeRail(tile.rail);
    tile.rail.output = output;
    this.invalidatePaths();
    this.changedTile(tile, "rail-config");
    return true;
  }

  setMinerOutput(tile, output) {
    const miner = tile?.building;
    if (miner?.type !== "miner" || (output !== "auto" && !RAIL_DIRECTIONS[output])) return false;
    miner.output = output;
    this.invalidatePaths();
    this.changedTile(tile, "miner-config");
    return true;
  }

  setRouter(tile, filter, output) {
    const router = tile?.building;
    if (router?.type !== "router" || !RAIL_DIRECTIONS[output]) return false;
    normalizeRouter(router);
    DIRECTION_IDS.forEach((direction) => {
      router.routes[direction] = null;
    });
    router.routes[output] = filter || null;
    this.changedTile(tile, "router-config");
    return true;
  }

  setRouterRoute(tile, direction, filter = null) {
    const router = tile?.building;
    if (router?.type !== "router" || !RAIL_DIRECTIONS[direction]) return false;
    normalizeRouter(router);
    router.routes[direction] = filter || null;
    this.changedTile(tile, "router-config");
    return true;
  }

  railFlow(tile, hasCargo = Boolean(tile?.cargo)) {
    const rail = tile?.rail;
    if (!rail) return { mode: "none", valid: false, direction: null, target: null };
    normalizeRail(rail);
    const cargo = tile.cargo;
    const router = tile.building?.type === "router" ? tile.building : null;
    if (router) normalizeRouter(router);
    const routedDirections = router && cargo
      ? DIRECTION_IDS.filter((direction) => router.routes[direction] === cargo.type)
      : [];
    if (routedDirections.length) {
      const candidates = routedDirections.map((direction) => ({
        direction,
        target: this.railConnection(tile, direction, true),
      }));
      const valid = candidates.filter(({ target }) => Boolean(target));
      const available = hasCargo
        ? valid.filter(({ target }) => !target.rail || !target.cargo)
        : valid;
      const choices = available.length ? available : valid.length ? valid : candidates;
      const choice = choices[(rail.routeCursor || 0) % choices.length];
      return {
        mode: "filter",
        valid: Boolean(choice?.target),
        blocked: Boolean(hasCargo && valid.length && !available.length),
        direction: choice?.direction || routedDirections[0],
        target: choice?.target || null,
      };
    }
    const forcedOutput = rail.output;
    if (forcedOutput !== "auto") {
      const target = this.railConnection(tile, forcedOutput, true);
      return {
        mode: "manual",
        valid: Boolean(target),
        blocked: Boolean(hasCargo && target?.rail && target.cargo),
        direction: forcedOutput,
        target,
      };
    }

    let candidates = DIRECTION_IDS
      .map((direction) => ({ direction, target: this.railConnection(tile, direction) }))
      .filter(({ target }) => Boolean(target));
    const enteredFrom = cargo?.enteredFrom;
    const forward = enteredFrom ? RAIL_DIRECTIONS[enteredFrom]?.opposite : null;
    const withoutReverse = enteredFrom ? candidates.filter(({ direction }) => direction !== enteredFrom) : candidates;
    if (withoutReverse.length) candidates = withoutReverse;
    candidates.sort((left, right) => {
      if (left.direction === forward) return -1;
      if (right.direction === forward) return 1;
      return DIRECTION_IDS.indexOf(left.direction) - DIRECTION_IDS.indexOf(right.direction);
    });
    const available = hasCargo ? candidates.filter(({ target }) => !target.rail || !target.cargo) : candidates;
    const choices = available.length ? available : candidates;
    const straight = choices.find(({ direction }) => direction === forward);
    const choice = straight || choices[(rail.routeCursor || 0) % Math.max(1, choices.length)] || null;
    return {
      mode: "auto",
      valid: Boolean(choice),
      blocked: Boolean(hasCargo && candidates.length && !available.length),
      direction: choice?.direction || null,
      target: choice?.target || null,
    };
  }

  railDistances() {
    const distances = new Map();
    this.world.forEach((tile) => {
      if (tile.rail) distances.set(`${tile.x},${tile.y}`, 0);
    });
    return distances;
  }

  canPlace(def, tile) {
    const result = placementResult(def, tile);
    if (!result.ok) return result;
    if (this.world.isReservedShopCell(tile.x, tile.y)) {
      return { ok: false, reason: "상점 확장 예정 구역" };
    }
    return result;
  }

  place(defId, tile) {
    const def = BUILDINGS[defId];
    const validity = this.canPlace(def, tile);
    if (!validity.ok) return validity;
    if (!this.store.isUnlocked(defId)) return { ok: false, reason: "연구에서 먼저 해금해야 함" };
    if (!this.store.take(def.craft, "building")) return { ok: false, reason: "재료가 부족함" };
    const instance = createBuilding(def);
    if (def.type === "rail") tile.rail = instance;
    else if (def.type === "pole") tile.powerNode = instance;
    else tile.building = instance;
    this.invalidatePaths();
    if (def.type === "rail") this.store.markProgress("railed");
    if (def.type === "miner") this.store.markProgress("miner");
    this.store.incrementStat("placed");
    this.changedTile(tile, "place");
    this.bus.emit("buildingPlaced", { tile, def });
    return { ok: true, tile, def };
  }

  normalizeFurnace(building) {
    if (!building) return;
    building.inputQueue ||= [];
    building.outputStack ||= {};
    building.smelting ??= null;
    building.smeltingFrom ??= null;
    building.blockUnsmeltedCargo ??= true;
    building.coal = Math.max(0, Number(building.coal) || 0);
    building.progress = Math.max(0, Number(building.progress) || 0);
  }

  normalizeLab(building) {
    normalizeLab(building);
  }

  labBufferCap(id) {
    return BALANCE.research.labBufferCap[id] || 0;
  }

  labHasCost(building) {
    return labHasCost(building);
  }

  inputCap(building) {
    return BALANCE.smelt.inputCap[building.tier] || BALANCE.smelt.inputCap[1];
  }

  coalCap(building) {
    if (building?.type === "generator") return (building.tier || 1) * 12;
    return BALANCE.smelt.coalCap[building.tier] || BALANCE.smelt.coalCap[1];
  }

  outputCount(building) {
    return Object.values(building?.outputStack || {}).reduce((sum, count) => sum + (count || 0), 0);
  }

  insertCoal(tile, amount = 1) {
    const building = tile?.building;
    if (!["furnace", "generator"].includes(building?.type)) return false;
    if (building.type === "furnace") this.normalizeFurnace(building);
    const accepted = Math.min(Math.max(1, Math.floor(amount)), this.coalCap(building) - building.coal);
    if (accepted <= 0 || !this.store.take({ coal: accepted }, building.type)) return false;
    building.coal += accepted;
    this.changedTile(tile, "fuel-input");
    return true;
  }

  insertOre(tile, ore) {
    const building = tile?.building;
    if (building?.type !== "furnace" || !ORE_TO_INGOT[ore]) return false;
    this.normalizeFurnace(building);
    if (building.inputQueue.length >= this.inputCap(building)) return false;
    if (!this.store.take({ [ore]: 1 }, "furnace")) return false;
    building.inputQueue.push(ore);
    this.changedTile(tile, "furnace-input");
    return true;
  }

  insertLabItem(tile, id) {
    const building = tile?.building;
    if (building?.type !== "lab") return false;
    normalizeLab(building);
    const cap = this.labBufferCap(id);
    if (!cap) return false;
    const space = cap - (building.stocks[id] || 0);
    const accepted = Math.min(space, this.store.count(id));
    if (accepted <= 0 || !this.store.take({ [id]: accepted }, "lab")) return false;
    building.stocks[id] = (building.stocks[id] || 0) + accepted;
    this.changedTile(tile, "lab-input");
    return true;
  }

  takeOutput(tile) {
    const building = tile?.building;
    if (building?.type !== "furnace") return 0;
    this.normalizeFurnace(building);
    let taken = 0;
    Object.entries(building.outputStack).forEach(([id, count]) => {
      if (count > 0) {
        this.store.add(id, count, "furnace");
        taken += count;
      }
    });
    building.outputStack = {};
    if (taken) {
      this.store.markProgress("collected");
      this.changedTile(tile, "take-output");
    }
    return taken;
  }

  dropGroundItem(tile, item, amount = 1) {
    if (!tile || !item?.type || amount <= 0) return false;
    tile.groundItems ||= [];
    let stack = tile.groundItems.find((entry) => entry.type === item.type);
    if (!stack) {
      stack = { type: item.type, amount: 0 };
      tile.groundItems.push(stack);
    }
    stack.amount = Math.min(BALANCE.ground.stackCap, stack.amount + Math.floor(amount));
    this.changedTile(tile, "ground-drop");
    this.bus.emit("groundDrop", { tile, item: { type: item.type }, amount });
    return true;
  }

  pickupGroundItems(tile) {
    if (!tile?.groundItems?.length) return 0;
    const items = tile.groundItems;
    const collectedIngot = items.some((stack) => Object.values(ORE_TO_INGOT).includes(stack.type));
    let total = 0;
    items.forEach(({ type, amount }) => {
      if (this.store.add(type, amount, "ground-pickup")) total += amount;
    });
    tile.groundItems = [];
    if (collectedIngot) this.store.markProgress("collected");
    this.changedTile(tile, "ground-pickup");
    this.bus.emit("groundPickup", { tile, items, amount: total });
    return total;
  }

  refundBuilding(building) {
    const def = BUILDINGS[building.defId] || Object.values(BUILDINGS).find((candidate) =>
      candidate.type === building.type && candidate.tier === building.tier
    );
    if (def) this.store.refund(def.craft, "demolish");
    if (building.type === "miner") {
      (building.queue || []).forEach((id) => this.store.add(id, 1, "demolish"));
    } else if (building.type === "furnace") {
      this.normalizeFurnace(building);
      if (building.coal) this.store.add("coal", building.coal, "demolish");
      if (building.smelting) this.store.add(building.smelting, 1, "demolish");
      building.inputQueue.forEach((id) => this.store.add(id, 1, "demolish"));
      Object.entries(building.outputStack).forEach(([id, count]) => this.store.add(id, count, "demolish"));
    } else if (building.type === "storage") {
      Object.entries(building.stacks || {}).forEach(([id, count]) => this.store.add(id, count, "demolish"));
    } else if (building.type === "generator" && building.coal) {
      this.store.add("coal", building.coal, "demolish");
    } else if (building.type === "lab") {
      normalizeLab(building);
      Object.entries(building.stocks || {}).forEach(([id, count]) => {
        if (count > 0) this.store.add(id, count, "demolish");
      });
    }
    return def;
  }

  remove(tile) {
    if (!tile || tile.building?.type === "shop") return { ok: false, reason: "철거할 수 없음" };
    if (tile.building) {
      const building = tile.building;
      const def = this.refundBuilding(building);
      tile.building = null;
      this.invalidatePaths();
      this.changedTile(tile, "remove");
      this.bus.emit("buildingRemoved", { tile, building, def });
      return { ok: true, building, def };
    }
    if (tile.rail) {
      const rail = tile.rail;
      const def = this.refundBuilding(rail);
      if (tile.cargo) this.store.add(tile.cargo.type, 1, "demolish");
      tile.cargo = null;
      tile.rail = null;
      tile.moveAcc = 0;
      this.invalidatePaths();
      this.changedTile(tile, "remove");
      this.bus.emit("buildingRemoved", { tile, building: rail, def });
      return { ok: true, building: rail, def };
    }
    return { ok: false, reason: "철거할 설비가 없음" };
  }

  removePowerNode(tile) {
    if (!tile?.powerNode) return { ok: false, reason: "철거할 전력망이 없음" };
    const building = tile.powerNode;
    const def = this.refundBuilding(building);
    tile.powerNode = null;
    this.invalidatePaths();
    this.changedTile(tile, "remove-power");
    this.bus.emit("buildingRemoved", { tile, building, def });
    return { ok: true, building, def };
  }

  upgrade(tile, layer = "auto") {
    const target = layer === "rail"
      ? tile?.rail
      : layer === "building"
        ? tile?.building
        : tile?.building && UPGRADE_DEFS[tile.building.type] ? tile.building : tile?.rail;
    if (!target) return { ok: false, reason: "업그레이드할 수 없음" };
    const nextTier = (target.tier || 1) + 1;
    const defId = UPGRADE_DEFS[target.type]?.[nextTier];
    const def = BUILDINGS[defId];
    if (!def) return { ok: false, reason: "최고 티어" };
    if (!this.store.isUnlocked(defId)) return { ok: false, reason: `T${nextTier} 연구 필요` };
    if (!this.store.take(def.craft, "upgrade")) return { ok: false, reason: "업그레이드 재료 부족" };
    target.tier = nextTier;
    target.defId = defId;
    this.power?.invalidate();
    this.changedTile(tile, "upgrade");
    this.bus.emit("buildingUpgraded", { tile, def });
    return { ok: true, def };
  }

  outputRails(tile, output = "auto", excluded = null) {
    return this.world.neighbors(tile.x, tile.y)
      .filter((neighbor) => {
        if (!neighbor.rail) return false;
        if (excluded && neighbor.x === excluded.x && neighbor.y === excluded.y) return false;
        if (output !== "auto" && this.directionBetween(tile, neighbor) !== output) return false;
        const direction = this.directionBetween(neighbor, tile);
        return this.isRailPortOpen(neighbor, direction);
      });
  }

  bestEmptyRail(tile, excluded = null, output = "auto") {
    return this.outputRails(tile, output, excluded).find((neighbor) => !neighbor.cargo) || null;
  }

  acceptMachineCargo(target, source, item) {
    const building = target.building;
    if (building?.type === "storage") {
      building.stacks ||= {};
      building.stacks[item.type] = (building.stacks[item.type] || 0) + 1;
      building.lastInput = { x: source.x, y: source.y };
      return true;
    }
    if (building?.type === "generator" && item.type === "coal" && building.coal < this.coalCap(building)) {
      building.coal += 1;
      return true;
    }
    if (building?.type === "lab") {
      normalizeLab(building);
      const cap = this.labBufferCap(item.type);
      if (!cap || (building.stocks[item.type] || 0) >= cap) return false;
      building.stocks[item.type] = (building.stocks[item.type] || 0) + 1;
      return true;
    }
    return false;
  }

  canPickupStoppedCargo(tile) {
    if (!tile?.rail || !tile.cargo) return false;
    if (this.inlineCargoBlocked(tile)) return true;
    if (this.power && this.powerFactor(tile, tile.rail) <= 0) return true;
    return Boolean(this.railFlow(tile).blocked);
  }

  pickupStoppedCargo(tile) {
    if (!this.canPickupStoppedCargo(tile)) return 0;
    const item = tile.cargo;
    if (!this.store.add(item.type, 1, "rail-pickup")) return 0;
    if (Object.values(ORE_TO_INGOT).includes(item.type)) this.store.markProgress("collected");
    tile.cargo = null;
    tile.moveAcc = 0;
    this.changedTile(tile, "cargo-pickup");
    return 1;
  }

  takeStorageContents(tile) {
    const storage = tile?.building;
    if (storage?.type !== "storage") return 0;
    let total = 0;
    Object.entries(storage.stacks || {}).forEach(([id, count]) => {
      const amount = Math.max(0, Math.floor(Number(count) || 0));
      if (amount > 0 && this.store.add(id, amount, "storage-pickup")) {
        delete storage.stacks[id];
        total += amount;
      }
    });
    if (total) this.changedTile(tile, "storage-pickup");
    return total;
  }

  tryMoveRail(tile) {
    if (!tile?.rail || !tile.cargo) return false;
    const flow = this.railFlow(tile);
    if (flow.blocked) return false;
    if (!flow.valid || !flow.target) {
      const item = tile.cargo;
      tile.cargo = null;
      tile.moveAcc = 0;
      this.dropGroundItem(tile, item);
      return true;
    }
    if (flow.target.building?.type === "shop") {
      const item = tile.cargo;
      tile.cargo = null;
      tile.moveAcc = 0;
      const sale = this.store.creditItem(item.type, 1, "automatic");
      this.changedTile(tile, "sale");
      this.bus.emit("cargoSold", { tile, item, ...sale });
      return true;
    }
    if (!flow.target.rail) {
      const item = tile.cargo;
      if (!this.acceptMachineCargo(flow.target, tile, item)) return false;
      tile.cargo = null;
      tile.moveAcc = 0;
      this.changedTile(tile, "cargo");
      this.changedTile(flow.target, "machine-input");
      return true;
    }
    if (flow.target.cargo) return false;
    const item = tile.cargo;
    item.enteredFrom = RAIL_DIRECTIONS[flow.direction].opposite;
    flow.target.cargo = item;
    flow.target.moveAcc = 0;
    tile.cargo = null;
    tile.moveAcc = 0;
    if (tile.rail.output === "auto" || flow.mode === "filter") tile.rail.routeCursor += 1;
    this.store.state.stats.transported += 1;
    this.changedTile(tile, "cargo");
    this.changedTile(flow.target, "cargo");
    this.bus.emit("cargoMove", { from: tile, to: flow.target, item });
    return true;
  }

  flushMiner(tile) {
    const building = tile.building;
    building.output ||= "auto";
    let moved = false;
    while (building.queue.length) {
      const rails = this.outputRails(tile, building.output);
      const rail = rails.find((candidate) => !candidate.cargo) || null;
      if (!rail) {
        if (rails.length) break;
        this.dropGroundItem(tile, { type: building.queue.shift() });
        moved = true;
        break;
      }
      const item = { type: building.queue.shift(), enteredFrom: this.directionBetween(rail, tile) };
      rail.cargo = item;
      rail.moveAcc = 0;
      this.changedTile(rail, "cargo");
      this.bus.emit("cargoMove", { from: tile, to: rail, item });
      moved = true;
    }
    return moved;
  }

  updateMiner(tile, dt) {
    const building = tile.building;
    if (!tile.ore) return;
    this.flushMiner(tile);
    if (building.queue.length >= BALANCE.miner.queueCap) return;
    const interval = BALANCE.miner.interval[building.tier] || BALANCE.miner.interval[1];
    building.progress += (dt * this.powerFactor(tile)) / interval;
    if (building.progress >= 1) {
      building.progress %= 1;
      building.queue.push(tile.ore);
      this.store.discover(tile.ore, "miner");
      this.store.incrementStat("mined");
      if (Math.random() < BALANCE.mining.stoneBonusChance && building.queue.length < BALANCE.miner.queueCap) {
        building.queue.push("stone");
      }
      this.flushMiner(tile);
      this.bus.emit("machineCycle", { tile, type: "miner" });
      this.changedTile(tile, "miner");
    } else if (progressPaintChanged(building)) {
      this.changedTile(tile, "progress", false);
    }
  }

  canConsumeInlineCargo(tile) {
    const building = tile?.building;
    if (building?.type !== "furnace" || !tile.cargo) return false;
    this.normalizeFurnace(building);
    if (tile.cargo.type === "coal") return building.coal < this.coalCap(building);
    return Boolean(ORE_TO_INGOT[tile.cargo.type]) && building.inputQueue.length < this.inputCap(building);
  }

  inlineCargoBlocked(tile) {
    return Boolean(
      tile?.building?.blockUnsmeltedCargo &&
      tile?.building?.type === "furnace" &&
      tile.cargo &&
      tile.cargo.source !== "furnace" &&
      !this.canConsumeInlineCargo(tile)
    );
  }

  setFurnaceBlocking(tile, enabled) {
    const building = tile?.building;
    if (building?.type !== "furnace") return false;
    building.blockUnsmeltedCargo = Boolean(enabled);
    this.changedTile(tile, "furnace-config");
    return true;
  }

  consumeInlineCargo(tile) {
    if (!this.canConsumeInlineCargo(tile)) return false;
    const building = tile.building;
    if (tile.cargo.type === "coal") {
      building.coal += 1;
    } else {
      building.inputQueue.push(tile.cargo.type);
      building.smeltingFrom ||= tile.cargo.enteredFrom || null;
    }
    tile.cargo = null;
    tile.moveAcc = 0;
    this.changedTile(tile, "furnace-input");
    return true;
  }

  pushInlineOutput(tile) {
    const building = tile.building;
    if (tile.cargo || !this.outputCount(building)) return false;
    const id = Object.keys(building.outputStack).find((key) => building.outputStack[key] > 0);
    if (!id) return false;
    building.outputStack[id] -= 1;
    if (building.outputStack[id] <= 0) delete building.outputStack[id];
    tile.cargo = { type: id, enteredFrom: building.smeltingFrom || null, source: "furnace" };
    tile.moveAcc = 0;
    building.smeltingFrom = null;
    this.changedTile(tile, "furnace-output");
    return true;
  }

  updateFurnace(tile, dt) {
    const building = tile.building;
    this.normalizeFurnace(building);
    this.consumeInlineCargo(tile);
    this.pushInlineOutput(tile);
    if (!building.smelting && building.inputQueue.length && building.coal >= 1) {
      building.smelting = building.inputQueue.shift();
      building.progress = 0;
    }
    const ingot = building.smelting ? ORE_TO_INGOT[building.smelting] : null;
    if (!ingot || building.coal < 1) return;
    const time = BALANCE.smelt.time[building.tier] || BALANCE.smelt.time[1];
    building.progress += (dt * this.powerFactor(tile)) / time;
    if (building.progress >= 1) {
      building.progress = 0;
      if (!this.store.keepsTutorialFurnaceFuel()) building.coal -= 1;
      building.outputStack[ingot] = (building.outputStack[ingot] || 0) + 1;
      building.smelting = null;
      this.store.discover(ingot, "smelting");
      this.store.markSmelted();
      this.bus.emit("machineCycle", { tile, type: "smelt", item: ingot });
      this.changedTile(tile, "smelt");
    } else if (progressPaintChanged(building)) {
      this.changedTile(tile, "progress", false);
    }
  }

  updateStorage(tile, dt) {
    const building = tile.building;
    const id = Object.keys(building.stacks || {}).find((key) => building.stacks[key] > 0);
    if (!id) return;
    building.outputAcc = (building.outputAcc || 0) + dt;
    if (building.outputAcc < BALANCE.storage.outputInterval) return;
    const rail = this.bestEmptyRail(tile, building.lastInput);
    if (!rail) return;
    building.outputAcc = 0;
    building.stacks[id] -= 1;
    if (building.stacks[id] <= 0) delete building.stacks[id];
    rail.cargo = { type: id, enteredFrom: this.directionBetween(rail, tile), source: "storage" };
    this.changedTile(tile, "storage-output");
    this.changedTile(rail, "cargo");
  }

  powerFactor(tile, target = tile?.building) {
    return this.power ? this.power.factorFor(tile, target) : 1;
  }

  update(dt) {
    const rails = [];
    this.world.forEach((tile) => {
      const type = tile.building?.type;
      if (type === "miner") this.updateMiner(tile, dt);
      else if (type === "furnace") this.updateFurnace(tile, dt);
      else if (type === "storage") this.updateStorage(tile, dt);
      if (tile.rail && tile.cargo && type !== "furnace") rails.push(tile);
      else if (tile.rail && tile.cargo && type === "furnace" && !this.consumeInlineCargo(tile)) {
        if (!this.inlineCargoBlocked(tile)) rails.push(tile);
      }
    });
    rails.forEach((tile) => {
      tile.moveAcc += dt * this.powerFactor(tile, tile.rail);
      const interval = BALANCE.rail.interval[tile.rail.tier] || BALANCE.rail.interval[1];
      if (tile.moveAcc >= interval) {
        tile.moveAcc %= interval;
        this.tryMoveRail(tile);
      }
    });
  }

  tileStatus(tile) {
    const building = tile?.building;
    if (building?.type === "shop") return { state: "online", label: "판매 터미널" };
    if (this.inlineCargoBlocked(tile)) return { state: "warning", label: "제련 불가 화물 정체" };
    const poweredTargets = this.power
      ? [building, tile?.rail].filter((target) => powerDraw(target) > 0)
      : [];
    if (poweredTargets.length) {
      const factor = Math.min(...poweredTargets.map((target) => this.powerFactor(tile, target)));
      const targetLabel = poweredTargets.length > 1
        ? "설비·레일"
        : poweredTargets[0].type === "rail" ? "레일" : "설비";
      if (factor <= 0) return { state: "offline", label: `${targetLabel} 전력 없음` };
      if (factor < 0.999) {
        return { state: "warning", label: `${targetLabel} 전력 부족 · ${Math.round(factor * 100)}% 출력` };
      }
    }
    if (building?.type === "miner") {
      building.output ||= "auto";
      const rails = this.outputRails(tile, building.output);
      const outputLabel = building.output === "auto" ? "AUTO" : RAIL_DIRECTIONS[building.output].label;
      if (!rails.length) return { state: "warning", label: `출력 ${outputLabel} · 연결 레일 없음` };
      if (building.queue.length && rails.every((rail) => rail.cargo)) {
        return { state: "warning", label: `출력 ${outputLabel} · 레일 정체` };
      }
      return {
        state: "active",
        label: `출력 ${outputLabel} · 대기열 ${building.queue.length}/${BALANCE.miner.queueCap}`,
      };
    }
    if (building?.type === "furnace") {
      this.normalizeFurnace(building);
      if (!building.coal) return { state: "warning", label: "석탄 화물 필요" };
      if (building.smelting) return { state: "active", label: "인라인 제련 중" };
      return { state: "online", label: "원광 화물 대기" };
    }
    if (building?.type === "storage") {
      return { state: "online", label: `저장 ${stackSummary(building.stacks)}` };
    }
    if (building?.type === "router") {
      normalizeRouter(building);
      const routes = DIRECTION_IDS
        .filter((direction) => building.routes[direction])
        .map((direction) => `${RAIL_DIRECTIONS[direction].label} ${itemName(building.routes[direction])}`);
      return { state: "online", label: routes.length ? routes.join(" · ") : "방향 필터 미지정" };
    }
    if (building?.type === "generator") {
      return building.fuelLeft > 0 || building.coal > 0
        ? { state: "active", label: `발전 준비 · 석탄 ${building.coal}` }
        : { state: "warning", label: "석탄 필요" };
    }
    if (building?.type === "pole") return { state: "online", label: "전력망 연결" };
    if (building?.type === "battery") return { state: "online", label: `충전 ${Math.floor(building.charge || 0)}` };
    if (building?.type === "lab") {
      return labHasCost(building)
        ? { state: "active", label: "연구점 생산" }
        : { state: "warning", label: "연구 자원 부족" };
    }
    if (tile?.powerNode) return { state: "online", label: "전력망 연결" };
    if (tile?.rail) {
      const flow = this.railFlow(tile);
      if (flow.blocked) return { state: "warning", label: "화물 정체" };
      if (!flow.valid) return { state: tile.cargo ? "warning" : "online", label: "막다른 출구 · 바닥 드롭" };
      return { state: tile.cargo ? "active" : "online", label: `${flow.mode.toUpperCase()} ${RAIL_DIRECTIONS[flow.direction].label} 흐름` };
    }
    return { state: "idle", label: tile?.ore ? "채굴 가능" : tile?.groundItems?.length ? "바닥 화물" : "빈 땅" };
  }

  changedTile(tile, reason, dirty = true) {
    this.bus.emit("tile", { tile, reason });
    if (["cargo", "cargo-pickup", "sale", "furnace-input", "furnace-output"].includes(reason)) {
      this.world.neighbors(tile.x, tile.y).forEach((neighbor) => {
        if (neighbor.rail) this.bus.emit("tile", { tile: neighbor, reason: "neighbor-cargo" });
      });
    }
    if (dirty) this.bus.emit("dirty", { reason });
  }
}
