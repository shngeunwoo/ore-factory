import { BALANCE, expandCost, ORE_TIER_1, ORE_TIER_2, ORE_TIER_3, START_ORES } from "../domain/recipes.js?v=29";

const DIRECTIONS = Object.freeze({
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
});

export function tileKey(x, y) {
  return `${x},${y}`;
}

function chebyshev(left, right) {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
}

function shuffle(list) {
  const items = [...list];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
  return items;
}

function makeTile(x, y, ore = null) {
  return {
    x, y, ore,
    rail: null,
    building: null,
    powerNode: null,
    cargo: null,
    groundItems: [],
    moveAcc: 0,
    shopPart: null,
  };
}

function cleanBuilding(building) {
  return building ? structuredClone(building) : null;
}

export class World {
  constructor(bus, store, snapshot = null) {
    this.bus = bus;
    this.store = store;
    this.tiles = new Map();
    this.shopCenters = [];
    this.minX = 0;
    this.maxX = BALANCE.map.initialSize - 1;
    this.minY = 0;
    this.maxY = BALANCE.map.initialSize - 1;
    this.expandCount = 0;
    if (!snapshot || !this.restore(snapshot)) this.seedStart();
  }

  get(x, y) {
    return this.tiles.get(tileKey(x, y)) || null;
  }

  neighbors(x, y) {
    return Object.values(DIRECTIONS)
      .map((direction) => this.get(x + direction.x, y + direction.y))
      .filter(Boolean);
  }

  isReservedShopCell(x, y) {
    const { shopOrigin, shopStep } = BALANCE.map;
    const centerX = shopOrigin + Math.round((x - shopOrigin) / shopStep) * shopStep;
    const centerY = shopOrigin + Math.round((y - shopOrigin) / shopStep) * shopStep;
    return Math.abs(x - centerX) <= 1 && Math.abs(y - centerY) <= 1;
  }

  forEach(callback) {
    this.tiles.forEach(callback);
  }

  bounds() {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY,
      expandCount: this.expandCount,
    };
  }

  createTile(x, y, ore = null) {
    const tile = makeTile(x, y, ore);
    this.tiles.set(tileKey(x, y), tile);
    return tile;
  }

  oreTiles() {
    return [...this.tiles.values()].filter((tile) => tile.ore);
  }

  isFarEnough(tile, spacing, extra = []) {
    return [...this.oreTiles(), ...extra].every((other) => other === tile || chebyshev(tile, other) >= spacing);
  }

  pickSpreadTile(candidates, spacing, extra = []) {
    const shuffled = shuffle(candidates);
    for (let distance = spacing; distance >= 1; distance -= 1) {
      const fit = shuffled.find((tile) => this.isFarEnough(tile, distance, extra));
      if (fit) return fit;
    }
    return shuffled[0] || null;
  }

  placeSpreadOres(candidates, ores, spacing = BALANCE.map.oreSpacing) {
    const available = candidates.filter((tile) => !tile.ore && tile.building?.type !== "shop");
    const placed = [];
    ores.forEach((ore) => {
      const remaining = available.filter((tile) => !placed.includes(tile));
      const tile = this.pickSpreadTile(remaining, spacing, placed);
      if (!tile) return;
      tile.ore = ore;
      placed.push(tile);
    });
    return placed;
  }

  scatterRandomOres(candidates) {
    const spacing = BALANCE.map.oreSpacing;
    shuffle(candidates).forEach((tile) => {
      if (tile.ore || tile.building?.type === "shop") return;
      if (Math.random() < BALANCE.map.emptyChance) return;
      if (!this.isFarEnough(tile, spacing)) return;
      tile.ore = ORE_TIER_1[Math.floor(Math.random() * ORE_TIER_1.length)];
    });
  }

  guaranteedOresForThisExpand() {
    if (this.expandCount === BALANCE.map.advancedFromExpand) return [...ORE_TIER_3];
    if (this.expandCount === BALANCE.map.midFromExpand) return [...ORE_TIER_2];
    return [];
  }

  shopFootprintReady(cx, cy) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!this.get(cx + dx, cy + dy)) return false;
      }
    }
    return true;
  }

  placeShopAt(cx, cy) {
    if (!this.shopFootprintReady(cx, cy)) return false;
    const center = this.get(cx, cy);
    if (center?.building?.type === "shop") return false;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tile = this.get(cx + dx, cy + dy);
        if (tile.building && tile.building.type !== "shop") return false;
      }
    }
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tile = this.get(cx + dx, cy + dy);
        tile.ore = null;
        tile.rail = null;
        tile.cargo = null;
        tile.groundItems = [];
        tile.building = { type: "shop", tier: 0, center: dx === 0 && dy === 0, cx, cy };
        tile.shopPart =
          `${dy === -1 ? "n" : dy === 1 ? "s" : "c"}${dx === -1 ? "w" : dx === 1 ? "e" : "c"}`;
      }
    }
    if (!this.shopCenters.some((shop) => shop.x === cx && shop.y === cy)) {
      this.shopCenters.push({ x: cx, y: cy });
    }
    return true;
  }

  ensureShops() {
    const { shopOrigin, shopStep } = BALANCE.map;
    let placed = false;
    const minShopX = Math.ceil((this.minX + 1 - shopOrigin) / shopStep);
    const maxShopX = Math.floor((this.maxX - 1 - shopOrigin) / shopStep);
    const minShopY = Math.ceil((this.minY + 1 - shopOrigin) / shopStep);
    const maxShopY = Math.floor((this.maxY - 1 - shopOrigin) / shopStep);
    for (let yIndex = minShopY; yIndex <= maxShopY; yIndex += 1) {
      for (let xIndex = minShopX; xIndex <= maxShopX; xIndex += 1) {
        if (this.placeShopAt(shopOrigin + xIndex * shopStep, shopOrigin + yIndex * shopStep)) {
          placed = true;
        }
      }
    }
    return placed;
  }

  seedStart() {
    this.tiles.clear();
    this.shopCenters = [];
    this.minX = 0;
    this.minY = 0;
    this.maxX = BALANCE.map.initialSize - 1;
    this.maxY = BALANCE.map.initialSize - 1;
    this.expandCount = 0;
    for (let y = this.minY; y <= this.maxY; y += 1) {
      for (let x = this.minX; x <= this.maxX; x += 1) this.createTile(x, y);
    }

    const origin = BALANCE.map.shopOrigin;
    this.placeShopAt(origin, origin);
    const reserved = new Set();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) reserved.add(tileKey(origin + dx, origin + dy));
    }
    [
      [2, 4], [6, 4], [4, 2], [4, 6], [3, 2], [5, 2],
      [3, 6], [5, 6], [2, 3], [2, 5], [6, 3], [6, 5],
    ].forEach(([x, y]) => reserved.add(tileKey(x, y)));

    const cells = [];
    this.forEach((tile) => {
      if (!reserved.has(tileKey(tile.x, tile.y))) cells.push(tile);
    });
    this.placeSpreadOres(cells, START_ORES);
    this.bus.emit("worldRebuild", { reason: "seed" });
  }

  expand(direction) {
    if (!Object.hasOwn(DIRECTIONS, direction)) return { ok: false, reason: "invalid-direction" };
    const cost = expandCost(this.expandCount);
    if (!this.store.spend(cost, "expand")) return { ok: false, reason: "money", cost };
    this.expandCount += 1;
    const coordinates = [];

    if (direction === "n") {
      this.minY -= 1;
      for (let x = this.minX; x <= this.maxX; x += 1) coordinates.push({ x, y: this.minY });
    } else if (direction === "s") {
      this.maxY += 1;
      for (let x = this.minX; x <= this.maxX; x += 1) coordinates.push({ x, y: this.maxY });
    } else if (direction === "w") {
      this.minX -= 1;
      for (let y = this.minY; y <= this.maxY; y += 1) coordinates.push({ x: this.minX, y });
    } else {
      this.maxX += 1;
      for (let y = this.minY; y <= this.maxY; y += 1) coordinates.push({ x: this.maxX, y });
    }

    const newTiles = coordinates.map((position) => this.createTile(position.x, position.y, null));
    this.ensureShops();
    const candidates = newTiles.filter((tile) => tile.building?.type !== "shop");
    this.placeSpreadOres(candidates, this.guaranteedOresForThisExpand());
    this.scatterRandomOres(candidates);
    this.store.state.stats.expanded = this.expandCount;
    this.store.changed("expand");
    this.bus.emit("worldRebuild", { reason: "expand", direction, newTiles, cost });
    return { ok: true, cost, newTiles };
  }

  eachShopTile(callback) {
    this.forEach((tile) => {
      if (tile.building?.type === "shop") callback(tile);
    });
  }

  snapshot() {
    return {
      bounds: this.bounds(),
      shopCenters: structuredClone(this.shopCenters),
      tiles: [...this.tiles.values()].map((tile) => ({
        x: tile.x,
        y: tile.y,
        ore: tile.ore,
        rail: cleanBuilding(tile.rail),
        building: cleanBuilding(tile.building),
        powerNode: cleanBuilding(tile.powerNode),
        cargo: tile.cargo ? structuredClone(tile.cargo) : null,
        groundItems: structuredClone(tile.groundItems || []),
        moveAcc: Number(tile.moveAcc) || 0,
        shopPart: tile.shopPart || null,
      })),
    };
  }

  restore(snapshot) {
    if (!snapshot?.bounds || !Array.isArray(snapshot.tiles) || !snapshot.tiles.length) return false;
    const bounds = snapshot.bounds;
    if (
      ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite) ||
      bounds.maxX < bounds.minX ||
      bounds.maxY < bounds.minY
    ) {
      return false;
    }
    const expected = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
    if (snapshot.tiles.length !== expected) return false;
    this.tiles.clear();
    for (const source of snapshot.tiles) {
      if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return false;
      const tile = makeTile(source.x, source.y, source.ore || null);
      tile.rail = cleanBuilding(source.rail);
      tile.building = cleanBuilding(source.building);
      tile.powerNode = cleanBuilding(source.powerNode);
      if (tile.building?.type === "pole" && !tile.powerNode) {
        tile.powerNode = tile.building;
        tile.building = null;
      }
      tile.cargo = source.cargo?.type ? structuredClone(source.cargo) : null;
      tile.groundItems = Array.isArray(source.groundItems)
        ? source.groundItems
          .filter((stack) => stack?.type && Number(stack.amount) > 0)
          .map((stack) => ({ type: stack.type, amount: Math.floor(Number(stack.amount)) }))
        : [];
      tile.moveAcc = Number(source.moveAcc) || 0;
      tile.shopPart = source.shopPart || null;
      this.tiles.set(tileKey(tile.x, tile.y), tile);
    }
    if (this.tiles.size !== expected) return false;
    this.minX = bounds.minX;
    this.maxX = bounds.maxX;
    this.minY = bounds.minY;
    this.maxY = bounds.maxY;
    this.expandCount = Math.max(0, Math.floor(Number(bounds.expandCount) || 0));
    this.shopCenters = [...this.tiles.values()]
      .filter((tile) => tile.building?.type === "shop" && tile.building.center)
      .map((tile) => ({ x: tile.x, y: tile.y }));
    return true;
  }
}
