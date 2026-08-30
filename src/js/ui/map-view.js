import { BALANCE, ORE_LABEL, itemName } from "../domain/recipes.js?v=26";
import { RAIL_DIRECTIONS } from "../game/buildings.js?v=26";
import { tileKey } from "../game/map.js?v=26";

const BUILDING_MARKS = {
  furnace: "IF",
  miner: "DR",
  storage: "ST",
  router: "RT",
  generator: "PG",
  pole: "PL",
  battery: "BT",
  lab: "RS",
};

export class MapView {
  constructor({ grid, frame, world, store, simulation, getTool }) {
    this.grid = grid;
    this.frame = frame;
    this.world = world;
    this.store = store;
    this.simulation = simulation;
    this.getTool = getTool;
    this.elements = new Map();
    this.mineTile = null;
    this.mineProgress = 0;
    this.tileSize = BALANCE.zoom.initial;
    this.setZoom(this.tileSize);
  }

  createTileElement(tile) {
    const element = document.createElement("button");
    element.type = "button";
    element.tabIndex = -1;
    element.className = "tile";
    element.dataset.x = String(tile.x);
    element.dataset.y = String(tile.y);
    element.setAttribute("role", "gridcell");
    element.innerHTML = `
      <span class="tile-surface" aria-hidden="true"></span>
      <span class="ore-mark" aria-hidden="true"></span>
      <span class="rail-track" aria-hidden="true">
        <i class="rail-arm rail-arm-n"></i>
        <i class="rail-arm rail-arm-e"></i>
        <i class="rail-arm rail-arm-s"></i>
        <i class="rail-arm rail-arm-w"></i>
        <i class="rail-core"></i>
      </span>
      <span class="rail-flow" aria-hidden="true"></span>
      <span class="power-wire" aria-hidden="true">
        <i class="power-arm power-arm-n"></i>
        <i class="power-arm power-arm-e"></i>
        <i class="power-arm power-arm-s"></i>
        <i class="power-arm power-arm-w"></i>
      </span>
      <span class="power-node-mark" hidden aria-hidden="true">⚡</span>
      <span class="build-mark" aria-hidden="true"></span>
      <span class="tier-badge" hidden aria-hidden="true"></span>
      <span class="status-led" aria-hidden="true"></span>
      <span class="cargo" hidden aria-hidden="true"></span>
      <span class="ground-item" hidden aria-hidden="true"></span>
      <span class="tile-label" aria-hidden="true"></span>
      <span class="work-bar" hidden aria-hidden="true"><span></span></span>
      <span class="mine-ring" aria-hidden="true"></span>
    `;
    this.elements.set(tileKey(tile.x, tile.y), element);
    return element;
  }

  rebuild({ newTiles = [] } = {}) {
    const bounds = this.world.bounds();
    const fragment = document.createDocumentFragment();
    const newKeys = new Set(newTiles.map((tile) => tileKey(tile.x, tile.y)));
    const columnCount = bounds.maxX - bounds.minX + 1;
    const rowCount = bounds.maxY - bounds.minY + 1;
    this.grid.style.gridTemplateColumns = `repeat(${columnCount}, var(--tile))`;
    this.grid.setAttribute("aria-colcount", String(columnCount));
    this.grid.setAttribute("aria-rowcount", String(rowCount));

    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const tile = this.world.get(x, y);
        if (!tile) continue;
        const key = tileKey(x, y);
        const element = this.elements.get(key) || this.createTileElement(tile);
        element.setAttribute("aria-colindex", String(x - bounds.minX + 1));
        element.setAttribute("aria-rowindex", String(y - bounds.minY + 1));
        if (newKeys.has(key)) {
          element.classList.add("tile-reveal");
          setTimeout(() => element.classList.remove("tile-reveal"), 500);
        }
        fragment.appendChild(element);
      }
    }
    this.grid.replaceChildren(fragment);
    this.renderAll();
  }

  renderAll() {
    this.world.forEach((tile) => this.renderTile(tile));
  }

  renderTile(tile) {
    const element = this.elements.get(tileKey(tile.x, tile.y));
    if (!element) return;
    const classes = ["tile", `ground-${Math.abs(tile.x * 17 + tile.y * 31) % 4 + 1}`];
    const building = tile.building;
    const rail = tile.rail;
    const powerNode = tile.powerNode;
    let railFlow = null;
    if (tile.ore) classes.push("has-ore", `ore-${tile.ore}`);
    if (!tile.ore && !building && !rail) classes.push("empty-ground");
    if (building) {
      classes.push("has-building", `building-${building.type}`, `tier-${building.tier || 0}`);
      if (building.type === "shop") {
        classes.push("shop-cell", building.center ? "shop-center" : "", tile.shopPart ? `shop-${tile.shopPart}` : "");
      }
    }
    if (powerNode) classes.push("has-power-node", `power-node-${powerNode.type}`);
    if (building || rail || powerNode) {
      const offsets = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
      Object.entries(offsets).forEach(([direction, [dx, dy]]) => {
        const neighbor = this.world.get(tile.x + dx, tile.y + dy);
        if (this.simulation.power?.linked(tile, neighbor)) classes.push(`power-${direction}`);
      });
    }
    if (rail) {
      classes.push("has-rail", "building-rail", `rail-tier-${rail.tier || 1}`);
      if (!building) classes.push(`tier-${rail.tier || 1}`);
      this.simulation.railLinkedDirections(tile)
        .forEach((direction) => classes.push(`rail-${direction}`));
      railFlow = this.simulation.railFlow(tile);
      if (railFlow.mode !== "auto") classes.push("rail-manual");
      if (!railFlow.valid || railFlow.blocked) classes.push("rail-flow-invalid");
    }
    if (tile.cargo) classes.push("has-cargo", `item-${tile.cargo.type}`);
    if (tile.groundItems?.length) classes.push("has-ground-item");

    const tool = this.getTool();
    if (tool.mode === "place" && tool.def) {
      classes.push("placement-target");
      classes.push(this.simulation.canPlace(tool.def, tile).ok ? "can-place" : "cannot-place");
    } else if (tool.mode === "demolish" && ((building && building.type !== "shop") || rail)) {
      classes.push("can-demolish");
    } else if (tool.mode === "power-demolish" && powerNode) {
      classes.push("can-demolish", "can-demolish-power");
    }

    const status = this.simulation.tileStatus(tile);
    classes.push(`status-${status.state}`);
    if (this.mineTile === tile) classes.push("mining");
    element.className = classes.filter(Boolean).join(" ");

    const knownOre = tile.ore && this.store.isDiscovered(tile.ore);
    const oreName = tile.ore ? (knownOre ? itemName(tile.ore) : "미확인 광물") : "";
    const buildingName = building?.defId ? BUILDING_MARKS[building.type] : building?.type === "shop" ? "SHOP" : "";
    const label = element.querySelector(".tile-label");
    if (building?.type === "shop" && building.center) label.textContent = "상점";
    else if (tile.ore && !building) label.textContent = knownOre ? ORE_LABEL[tile.ore] : "???";
    else label.textContent = "";

    const mark = element.querySelector(".build-mark");
    mark.textContent = buildingName;
    mark.hidden = !buildingName || building?.type === "shop";
    mark.dataset.tier = String(building?.tier || 0);
    const powerMark = element.querySelector(".power-node-mark");
    powerMark.hidden = !powerNode;

    const tierBadge = element.querySelector(".tier-badge");
    const visibleTier = building?.type !== "shop" ? (building?.tier || rail?.tier || 0) : 0;
    tierBadge.hidden = visibleTier <= 0;
    tierBadge.textContent = visibleTier > 0 ? `T${visibleTier}` : "";

    const cargo = element.querySelector(".cargo");
    cargo.hidden = !tile.cargo;
    if (tile.cargo) cargo.dataset.item = tile.cargo.type;
    else delete cargo.dataset.item;

    const groundItem = element.querySelector(".ground-item");
    const firstGround = tile.groundItems?.[0];
    groundItem.hidden = !firstGround;
    groundItem.textContent = firstGround ? String(tile.groundItems.reduce((sum, stack) => sum + stack.amount, 0)) : "";
    if (firstGround) groundItem.dataset.item = firstGround.type;
    else delete groundItem.dataset.item;

    const flow = element.querySelector(".rail-flow");
    flow.textContent = "";
    if (rail && railFlow?.direction) {
      flow.textContent = RAIL_DIRECTIONS[railFlow.direction].label;
    } else if (building?.type === "miner") {
      const output = building.output || "auto";
      flow.textContent = output === "auto" ? "A" : RAIL_DIRECTIONS[output].label;
    }

    const progress = building && ["miner", "furnace", "lab"].includes(building.type)
      ? Math.max(0, Math.min(1, building.progress || 0))
      : 0;
    const progressWrap = element.querySelector(".work-bar");
    progressWrap.hidden = progress <= 0;
    progressWrap.querySelector("span").style.transform = `scaleX(${progress})`;

    const mineRing = element.querySelector(".mine-ring");
    mineRing.style.setProperty("--mine-p", `${Math.round((this.mineTile === tile ? this.mineProgress : 0) * 100)}%`);

    let description = building
      ? `${building.type === "shop" ? "판매 터미널" : buildingName || building.type} · ${status.label}`
      : rail
        ? `레일 T${rail.tier} · ${status.label}`
      : tile.ore
        ? `${oreName} · 길게 눌러 채굴`
        : "빈 땅";
    if (powerNode) description += " · 전봇대";
    if (tool.mode === "place" && tool.def) {
      const placement = this.simulation.canPlace(tool.def, tile);
      description += placement.ok ? ` · ${tool.def.name} 설치 가능` : ` · 설치 불가: ${placement.reason}`;
    } else if (tool.mode === "demolish" && ((building && building.type !== "shop") || rail)) {
      description += " · 철거 시 전액 회수";
    } else if (tool.mode === "power-demolish" && powerNode) {
      description += " · 전력망 철거 시 전액 회수";
    }
    const cargoText = tile.cargo ? ` · 화물 ${this.store.displayName(tile.cargo.type)}` : "";
    const groundText = tile.groundItems?.length
      ? ` · 바닥 화물 ${tile.groundItems.map((stack) => `${this.store.displayName(stack.type)} ${stack.amount}`).join(", ")} · 클릭해 수집`
      : "";
    const holdText = this.simulation.canPickupStoppedCargo(tile)
      ? " · 길게 눌러 정체 화물 회수"
      : tile.building?.type === "storage" && Object.values(tile.building.stacks || {}).some((count) => count > 0)
        ? " · 길게 눌러 창고 화물 전량 회수"
        : "";
    element.title = description + cargoText + groundText + holdText;
    element.setAttribute("aria-label", `${tile.x}, ${tile.y}: ${description}${cargoText}${groundText}${holdText}`);
  }

  tileFromElement(target) {
    const element = target.closest?.(".tile");
    if (!element || !this.grid.contains(element)) return null;
    return this.world.get(Number(element.dataset.x), Number(element.dataset.y));
  }

  elementFor(tile) {
    return tile ? this.elements.get(tileKey(tile.x, tile.y)) || null : null;
  }

  setMining(tile, progress) {
    const previous = this.mineTile;
    this.mineTile = tile || null;
    this.mineProgress = Math.max(0, Math.min(1, progress || 0));
    if (previous && previous !== tile) this.renderTile(previous);
    if (tile) this.renderTile(tile);
  }

  setZoom(size) {
    this.tileSize = Math.max(BALANCE.zoom.min, Math.min(BALANCE.zoom.max, size));
    this.grid.style.setProperty("--tile", `${this.tileSize}px`);
    return this.tileSize;
  }

  zoomBy(delta) {
    return this.setZoom(this.tileSize + delta * BALANCE.zoom.step);
  }

  center() {
    const center = this.world.shopCenters[0];
    const element = center ? this.elements.get(tileKey(center.x, center.y)) : null;
    const reducedMotion = this.store.state.settings.reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center", inline: "center" });
    element?.focus({ preventScroll: true });
  }
}
