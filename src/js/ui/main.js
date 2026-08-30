import {
  BALANCE,
  BUILDINGS,
  CRAFT_ORDER,
  INGOT_IDS,
  ITEMS,
  LAB_INPUTS,
  MINE_TIME,
  ORE_IDS,
  ORE_LABEL,
  SELL,
  SMELTABLE,
  UPGRADE_DEFS,
  expandCost,
  itemInfo,
  itemName,
  nextTutorialStep,
  powerDraw,
  TUTORIAL_STEPS,
} from "../domain/recipes.js?v=29";
import { EventBus, GameStore } from "../game/inventory.js?v=29";
import { World, tileKey } from "../game/map.js?v=29";
import {
  FactorySimulation,
  RAIL_DIRECTIONS,
  normalizeLab,
  normalizeRouter,
  queueSummary,
  stackSummary,
} from "../game/buildings.js?v=29";
import {
  SAVE_CODE_FILE_MAX_BYTES,
  decodeSaveCode,
  decodeSaveCodeFile,
  encodeSaveCode,
  makeSave,
  normalizeSaveCodeText,
  purgeStoredSaves,
  saveCodeFileName,
} from "../game/persistence.js?v=29";
import { PowerSystem } from "../game/power.js?v=29";
import { ProgressionSystem } from "../game/progression.js?v=29";
import { Effects } from "./fx.js?v=29";
import { MapView } from "./map-view.js?v=29";
import { questMarkup, researchMarkup } from "./panels.js?v=29";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const BUILDING_ART_TYPES = new Set(["furnace", "miner", "storage", "router", "generator", "lab"]);

function buildingImage(type, className, alt = "", tier = 1) {
  if (!BUILDING_ART_TYPES.has(type)) return "";
  const accessibility = alt ? ` role="img" aria-label="${alt}"` : ' aria-hidden="true"';
  const safeTier = Math.max(1, Math.min(3, Number(tier) || 1));
  return `<span class="${className} building-art art-${type} art-tier-${safeTier}"${accessibility}></span>`;
}

const bus = new EventBus();
purgeStoredSaves(localStorage, sessionStorage);
const store = new GameStore(bus);
const world = new World(bus, store);
const power = new PowerSystem(bus, store, world);
const progression = new ProgressionSystem(bus, store, world, power);
const simulation = new FactorySimulation(bus, store, world, power);

const ui = {
  mode: "idle",
  placeId: null,
  mining: null,
  mineProgress: 0,
  minePointer: null,
  mineGesture: false,
  holding: null,
  holdKind: null,
  holdProgress: 0,
  holdPointer: null,
  dragPlace: false,
  lastDragKey: "",
  modal: null,
  modalTile: null,
  previousFocus: null,
  removeArmed: false,
  craftOpen: false,
  activePanel: "craft",
  guideCelebrated: Object.values(store.state.progress).every(Boolean),
  pendingFileSave: null,
};

const mapView = new MapView({
  grid: $("#grid"),
  frame: $("#map-frame"),
  world,
  store,
  simulation,
  getTool: () => ({
    mode: ui.mode,
    def: ui.placeId ? BUILDINGS[ui.placeId] : null,
  }),
});

const effects = new Effects({
  layer: $("#fx-layer"),
  frame: $("#map-frame"),
  mapView,
  store,
});

function renderSaveStatus() {
  const element = $("#save-status");
  if (!element) return;
  element.textContent = "코드 저장";
  element.dataset.state = "idle";
  element.title = "브라우저에 남기지 않음 · 설정에서 OF2 코드로만 저장";
}

function toast(message, kind = "") {
  const element = $("#toast");
  element.textContent = message;
  element.className = `toast show ${kind}`.trim();
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.classList.remove("show");
  }, 1900);
}

function logActivity(message) {
  const list = $("#activity-log");
  const item = document.createElement("li");
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  item.append(time, document.createTextNode(message));
  list.prepend(item);
  while (list.children.length > 12) list.lastElementChild.remove();
}

function chipMarkup(id) {
  const item = itemInfo(id);
  const count = store.count(id);
  return `
    <span class="resource-chip ${count ? "" : "empty"}" title="${item.name}">
      <i style="--item-color:${item.color}"></i>
      <span>${item.short}</span><b>${count}</b>
    </span>
  `;
}

function renderChrome() {
  document.body.classList.toggle("reduce-motion", store.state.settings.reducedMotion);
  $("#money b").textContent = `$${store.money}`;
  $("#stat-mine").textContent = String(store.state.stats.mined);
  $("#stat-sell").textContent = `$${store.state.stats.sold}`;
  $("#stat-expand").textContent = String(world.expandCount);
  const generated = Math.round(store.state.power.generated);
  const supplied = Math.round(store.state.power.supplied);
  const demand = Math.round(store.state.power.demand);
  const powerText = `${generated} / ${demand}`;
  const powerState = demand <= 0
    ? "idle"
    : supplied >= demand ? "stable" : supplied > 0 ? "deficit" : "offline";
  $("#stat-power").textContent = powerText;
  $(".power-stat").dataset.state = powerState;
  $(".power-stat").title = `발전 ${generated} · 공급 ${supplied} / 수요 ${demand} · 축전 ${Math.floor(store.state.power.stored)} / ${Math.floor(store.state.power.capacity)}`;
  $(".power-stat").setAttribute("aria-label", $(".power-stat").title);
  $("#stat-research").textContent = String(store.state.research.points);
  updateSoundButton();
}

function renderInventory() {
  $("#inv-ores").innerHTML = ORE_IDS
    .filter((id) => ["stone", "coal", "iron", "copper"].includes(id) || store.isDiscovered(id))
    .map(chipMarkup)
    .join("");
  const discoveredIngots = INGOT_IDS.filter((id) => store.isDiscovered(id));
  $("#ingot-group").hidden = !discoveredIngots.length;
  $("#inv-ingots").innerHTML = discoveredIngots.map(chipMarkup).join("");
}

function renderHud() {
  renderChrome();
  renderInventory();
  renderExpandControls();
  renderGuide();
}

const pendingState = new Set();
let stateFrame = 0;

function flushState() {
  stateFrame = 0;
  const reasons = pendingState;
  pendingState.clear();
  const all = reasons.has("save-code-import") || reasons.size === 0;
  renderChrome();
  if (all || reasons.has("inventory") || reasons.has("discovery") || reasons.has("sale")) {
    renderInventory();
  }
  if (all || ["inventory", "money", "discovery", "unlock", "research", "sale"].some((reason) => reasons.has(reason))) {
    renderCraft();
  }
  if (all || reasons.has("research") || reasons.has("unlock")) {
    renderResearch();
  }
  if (all || ["stats", "sale", "progress", "research"].some((reason) => reasons.has(reason))) {
    renderQuests();
  }
  if (all || reasons.has("progress") || reasons.has("settings")) {
    renderGuide();
  }
  if (all || reasons.has("money") || reasons.has("expand") || reasons.has("sale")) {
    renderExpandControls();
  }
}

function queueState(reason) {
  pendingState.add(reason || "save-code-import");
  if (!stateFrame) stateFrame = requestAnimationFrame(flushState);
}

function formatCost(cost, showMissing = false) {
  return Object.entries(cost).map(([id, amount]) => {
    const name = store.isDiscovered(id) ? itemName(id) : "???";
    const missing = store.count(id) < amount;
    return `<span class="${showMissing && missing ? "missing" : ""}">${name} ${store.count(id)}/${amount}</span>`;
  }).join("");
}

function renderCraft() {
  $("#craft-list").innerHTML = CRAFT_ORDER.map((id, index) => {
    const def = BUILDINGS[id];
    const unlocked = store.isUnlocked(id);
    const active = ui.mode === "place" && ui.placeId === id;
    const affordable = store.has(def.craft);
    const shortcut = index < 9 ? `<kbd>${index + 1}</kbd>` : "";
    const placeLabel = def.place === "ore" ? "광석 위" : def.place === "rail" ? "레일 위" : "빈 땅";
    return `
      <article class="recipe tier-card-${def.tier || 1} ${unlocked ? "" : "locked"} ${active ? "active" : ""}">
        <header>
          <div>
            ${buildingImage(def.type, "building-thumb", "", def.tier)}
            <span class="tier">T${def.tier || "M"}</span><strong>${def.name}</strong>
          </div>
          ${shortcut}
        </header>
        <p>${def.description}</p>
        <small class="placement-rule">${placeLabel}</small>
        <div class="recipe-cost">${formatCost(def.craft, true)}</div>
        ${unlocked
          ? `<button type="button" class="primary-btn ${active ? "selected" : ""}" data-place="${id}">
              ${active ? "설치 취소" : affordable ? "설치 모드" : "재료 확인"} ${shortcut}
            </button>`
          : `<button type="button" class="unlock-btn" disabled>연구에서 해금</button>`}
      </article>
    `;
  }).join("");
}

function renderResearch() {
  $("#research-list").innerHTML = researchMarkup({
    state: store.state,
    availableTech: (id) => progression.availableTech(id),
  });
}

function renderQuests() {
  $("#quest-list").innerHTML = questMarkup(store.state);
}

function renderPanels() {
  renderCraft();
  renderResearch();
  renderQuests();
}

function setActivePanel(panel) {
  ui.activePanel = ["craft", "research", "quests"].includes(panel) ? panel : "craft";
  $$("[data-panel]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.panel === ui.activePanel));
  });
  $$("[data-panel-content]").forEach((content) => {
    content.hidden = content.dataset.panelContent !== ui.activePanel;
  });
}

function renderGuide() {
  const next = nextTutorialStep(store.state.progress);
  const completed = TUTORIAL_STEPS.filter((step) => store.state.progress[step.id]).length;
  $("#guide-list").innerHTML = TUTORIAL_STEPS.map((step, index) => {
    const done = Boolean(store.state.progress[step.id]);
    const current = next?.id === step.id;
    return `
      <li data-guide="${step.id}" class="${done ? "done" : ""} ${current ? "current" : ""}">
        <b>${String(index + 1).padStart(2, "0")}</b><span>${step.title}</span>
      </li>
    `;
  }).join("");
  $("#guide-count").textContent = `${completed} / ${TUTORIAL_STEPS.length}`;
  renderTutorial(next);
  if (completed === TUTORIAL_STEPS.length && !ui.guideCelebrated) {
    ui.guideCelebrated = true;
    $("#guide").open = false;
    store.updateSetting("tutorialCollapsed", true);
    toast("공장 기초 가동 완료", "success");
  }
}

function renderTutorial(next = nextTutorialStep(store.state.progress)) {
  const card = $("#tutorial");
  const show = Boolean(next) && !store.state.settings.tutorialSkipped;
  card.hidden = !show;
  if (!show) return;
  const index = TUTORIAL_STEPS.findIndex((step) => step.id === next.id) + 1;
  $("#tutorial-index").textContent = `${index} / ${TUTORIAL_STEPS.length}`;
  $("#tutorial-title").textContent = next.title;
  $("#tutorial-copy").textContent = next.copy;
  card.dataset.step = next.id;
}

function renderExpandControls() {
  const cost = expandCost(world.expandCount);
  $$(".expand").forEach((button) => {
    $(".expand-cost", button).textContent = `$${cost}`;
    const affordable = store.money >= cost;
    button.classList.toggle("unaffordable", !affordable);
    button.setAttribute("aria-disabled", String(!affordable));
    button.disabled = !affordable;
    button.title = affordable ? `한 줄 확장 · $${cost}` : `크레딧 $${cost} 필요`;
  });
  const bounds = world.bounds();
  $("#map-size").textContent = `${bounds.maxX - bounds.minX + 1} × ${bounds.maxY - bounds.minY + 1}`;
}

function setTool(mode = "idle", placeId = null) {
  ui.mode = mode;
  ui.placeId = placeId;
  ui.dragPlace = false;
  ui.lastDragKey = "";
  document.body.classList.toggle("tool-active", mode !== "idle");
  document.body.classList.toggle("demolish-active", mode === "demolish");
  document.body.classList.toggle("power-demolish-active", mode === "power-demolish");
  const hint = $("#place-hint");
  hint.hidden = mode === "idle";
  if (mode === "place") {
    const def = BUILDINGS[placeId];
    $("#place-title").textContent = `${def.name} 설치`;
    const placeTarget = def.type === "pole" ? "모든 타일" : def.place === "ore" ? "광석" : def.place === "rail" ? "레일" : "빈 땅";
    $("#place-copy").textContent = `${placeTarget}을 선택하세요. 레일은 드래그할 수 있습니다.`;
  } else if (mode === "demolish") {
    $("#place-title").textContent = "철거 모드";
    $("#place-copy").textContent = "건물을 선택하면 재료와 내용물을 전부 회수합니다.";
  } else if (mode === "power-demolish") {
    $("#place-title").textContent = "전력망 철거 모드";
    $("#place-copy").textContent = "전봇대만 제거하며 같은 칸의 광석·레일·설비는 유지합니다.";
  }
  $('[data-action="demolish"]').setAttribute("aria-pressed", String(mode === "demolish"));
  $('[data-action="power-demolish"]').setAttribute("aria-pressed", String(mode === "power-demolish"));
  renderCraft();
  mapView.renderAll();
}

function selectBuilding(id) {
  const def = BUILDINGS[id];
  if (!def || !store.isUnlocked(id)) {
    toast("먼저 설비를 해금하세요", "error");
    effects.sound("error");
    return;
  }
  if (ui.mode === "place" && ui.placeId === id) setTool();
  else {
    closeModal();
    stopMining();
    setTool("place", id);
    if (matchMedia("(max-width: 900px)").matches) closeCraftPanel();
  }
}

function attemptPlace(tile, quiet = false) {
  const def = BUILDINGS[ui.placeId];
  if (!def) return false;
  const geometry = simulation.canPlace(def, tile);
  if (!geometry.ok) {
    if (!quiet) {
      toast(geometry.reason, "error");
      effects.sound("error");
    }
    return false;
  }
  const result = simulation.place(def.id, tile);
  if (!result.ok) {
    if (!quiet) {
      const missing = Object.entries(store.missing(def.craft))
        .map(([id, amount]) => `${store.displayName(id)} ${amount}`)
        .join(" · ");
      toast(missing ? `부족: ${missing}` : result.reason, "error");
      effects.sound("error");
    }
    return false;
  }
  effects.burst(tile, "install");
  effects.pulse(tile, "install");
  effects.sound("place");
  logActivity(`${def.name} 설치`);
  renderCraft();
  return true;
}

function attemptRemove(tile) {
  const result = simulation.remove(tile);
  if (!result.ok) {
    toast(result.reason, "error");
    effects.sound("error");
    return;
  }
  effects.burst(tile, "demolish");
  effects.sound("click");
  logActivity(`${result.def?.name || "설비"} 철거 · 전액 회수`);
  toast("설치 재료와 내용물을 회수했습니다", "success");
  closeModal();
}

function attemptRemovePower(tile) {
  const result = simulation.removePowerNode(tile);
  if (!result.ok) {
    toast(result.reason, "error");
    effects.sound("error");
    return;
  }
  effects.burst(tile, "demolish");
  effects.sound("click");
  logActivity("전봇대 철거 · 같은 칸 설비 유지");
  toast("전봇대 재료를 회수했습니다", "success");
  closeModal();
}

function startMining(tile, pointerId) {
  if (ui.mode !== "idle" || ui.modal || ui.mining || ui.holding || !tile?.ore || tile.building) return;
  ui.mining = tile;
  ui.mineProgress = 0;
  ui.minePointer = pointerId;
  ui.mineGesture = true;
  mapView.setMining(tile, 0);
}

function stopMining() {
  mapView.setMining(null, 0);
  ui.mining = null;
  ui.mineProgress = 0;
  ui.minePointer = null;
}

function completeMining(tile) {
  const ore = tile.ore;
  store.add(ore, 1, "manual-mining");
  store.incrementStat("mined");
  effects.text(tile, `+${ORE_LABEL[ore]}`, `item-${ore}`);
  effects.burst(tile, "ore", 5);
  effects.sound("mine");
  if (Math.random() < BALANCE.mining.stoneBonusChance) {
    store.add("stone", 1, "mining-bonus");
    setTimeout(() => effects.text(tile, "+돌", "item-stone"), 90);
  }
}

function updateMining(dt) {
  const tile = ui.mining;
  if (!tile?.ore || tile.building) {
    stopMining();
    return;
  }
  ui.mineProgress += dt / (MINE_TIME[tile.ore] || 1);
  if (ui.mineProgress >= 1) {
    completeMining(tile);
    ui.mineProgress %= 1;
  }
  mapView.setMining(tile, ui.mineProgress);
}

function holdActionFor(tile) {
  if (simulation.canPickupStoppedCargo(tile)) return "cargo";
  if (
    tile?.building?.type === "storage" &&
    Object.values(tile.building.stacks || {}).some((count) => count > 0)
  ) {
    return "storage";
  }
  return null;
}

function startHoldPickup(tile, pointerId) {
  const kind = holdActionFor(tile);
  if (ui.mode !== "idle" || ui.modal || ui.mining || ui.holding || !kind) return false;
  ui.holding = tile;
  ui.holdKind = kind;
  ui.holdProgress = 0;
  ui.holdPointer = pointerId;
  mapView.setMining(tile, 0);
  return true;
}

function stopHoldPickup() {
  if (ui.holding) mapView.setMining(null, 0);
  ui.holding = null;
  ui.holdKind = null;
  ui.holdProgress = 0;
  ui.holdPointer = null;
}

function completeHoldPickup(tile, kind) {
  const count = kind === "cargo"
    ? simulation.pickupStoppedCargo(tile)
    : simulation.takeStorageContents(tile);
  mapView.setMining(null, 0);
  ui.holding = null;
  ui.holdKind = null;
  ui.holdProgress = 0;
  if (!count) return;
  ui.mineGesture = true;
  effects.burst(tile, "install", 5);
  effects.text(tile, `+${count} 화물`, "pickup");
  effects.sound("click");
  logActivity(kind === "cargo" ? "정체 레일 화물 회수" : `화물 창고 ${count}개 회수`);
  toast(`${count}개 화물을 회수했습니다`, "success");
}

function updateHoldPickup(dt) {
  const tile = ui.holding;
  if (!tile || holdActionFor(tile) !== ui.holdKind) {
    if (tile) stopHoldPickup();
    return;
  }
  ui.holdProgress += dt / BALANCE.interaction.pickupHoldSeconds;
  if (ui.holdProgress >= 1) {
    completeHoldPickup(tile, ui.holdKind);
    return;
  }
  mapView.setMining(tile, ui.holdProgress);
}

function openModal(type, tile = null) {
  ui.previousFocus = document.activeElement;
  ui.modal = type;
  ui.modalTile = tile;
  ui.removeArmed = false;
  setTool();
  const overlay = $("#modal-overlay");
  overlay.hidden = false;
  $(".topbar").inert = true;
  $(".layout").inert = true;
  $(".topbar").setAttribute("aria-hidden", "true");
  $(".layout").setAttribute("aria-hidden", "true");
  renderModal();
  requestAnimationFrame(() => $(".modal-close", overlay)?.focus());
}

function closeModal() {
  if (!ui.modal) return;
  ui.modal = null;
  ui.modalTile = null;
  ui.removeArmed = false;
  ui.pendingFileSave = null;
  $("#modal-overlay").hidden = true;
  $(".topbar").inert = false;
  $(".layout").inert = false;
  $(".topbar").removeAttribute("aria-hidden");
  $(".layout").removeAttribute("aria-hidden");
  $("#modal-content").replaceChildren();
  ui.previousFocus?.focus?.({ preventScroll: true });
}

function renderModal() {
  if (ui.modal === "shop") renderShop();
  else if (ui.modal === "machine") renderMachine();
  else if (ui.modal === "settings") renderSettings();
}

function renderShop() {
  $("#modal-content").innerHTML = `
    <p class="eyebrow">TRADE UPLINK</p>
    <h2 id="modal-title">판매 터미널</h2>
    <p class="modal-note">보유 자원을 즉시 크레딧으로 전환합니다. 레일 화물은 자동 판매됩니다.</p>
    <div class="sell-list">
      ${ITEMS.map((item) => {
        const known = store.isDiscovered(item.id);
        const count = store.count(item.id);
        return `
          <div class="sell-row ${count ? "" : "empty"} ${known ? "" : "unknown"}">
            <i style="--item-color:${item.color}"></i>
            <span><b>${known ? item.name : "???"}</b><small>${known ? `$${SELL[item.id]}` : "미발견"}</small></span>
            <strong>${known ? count : "?"}</strong>
            <button type="button" data-sell="${item.id}" data-count="1" ${known && count ? "" : "disabled"}>1개</button>
            <button type="button" data-sell="${item.id}" data-count="${count}" ${known && count ? "" : "disabled"}>전부</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function railEditorHtml(tile) {
  const building = tile.rail;
  simulation.tileStatus(tile);
  const portButtons = Object.entries(RAIL_DIRECTIONS).map(([direction, info]) => {
    const enabled = simulation.isRailPortOpen(tile, direction);
    const linked = simulation.railLinkedDirections(tile).includes(direction);
    return `
      <button type="button"
        class="rail-port rail-port-${direction} ${enabled ? "enabled" : ""} ${linked ? "linked" : ""}"
        data-rail-port="${direction}"
        aria-pressed="${enabled}"
        title="${info.label} 방향 포트 ${enabled ? "끄기" : "켜기"}">
        <b>${info.label}</b><small>${linked ? "연결" : enabled ? "대기" : "차단"}</small>
      </button>
    `;
  }).join("");
  const outputButtons = [
    ["auto", "AUTO"],
    ...Object.entries(RAIL_DIRECTIONS).map(([direction, info]) => [direction, info.label]),
  ].map(([value, label]) => `
    <button type="button"
      class="${building.output === value ? "selected" : ""}"
      data-rail-output="${value}"
      aria-pressed="${building.output === value}">
      ${label}
    </button>
  `).join("");
  return `
    <section class="rail-editor">
      <div class="rail-editor-head">
        <div><small>CONNECTION MATRIX</small><h3>연결 포트</h3></div>
        <span>양쪽 레일 포트가 모두 켜져야 연결</span>
      </div>
      <div class="rail-port-grid" aria-label="레일 방향별 연결 포트">${portButtons}</div>
      <div class="rail-editor-head route-head">
        <div><small>CARGO ROUTING</small><h3>화물 출구</h3></div>
        <span>수동 방향은 자동 흐름보다 우선</span>
      </div>
      <div class="rail-output-grid" aria-label="레일 화물 출구">${outputButtons}</div>
      <p class="rail-help">AUTO는 직진을 우선하고 분기를 순환합니다. 연결 출구가 없으면 화물이 바닥에 떨어집니다.</p>
    </section>
  `;
}

function minerOutputHtml(building) {
  const buttons = [
    ["auto", "AUTO"],
    ...Object.entries(RAIL_DIRECTIONS).map(([direction, info]) => [direction, info.label]),
  ].map(([value, label]) => `
    <button type="button"
      class="${(building.output || "auto") === value ? "selected" : ""}"
      data-miner-output="${value}"
      aria-pressed="${(building.output || "auto") === value}">
      ${label}
    </button>
  `).join("");
  return `
    <section class="rail-editor">
      <div class="rail-editor-head route-head">
        <div><small>MINER OUTPUT</small><h3>채굴기 배출 방향</h3></div>
        <span>지정 방향의 열린 레일로만 배출</span>
      </div>
      <div class="rail-output-grid" aria-label="채굴기 출력 방향">${buttons}</div>
      <p class="rail-help">AUTO는 빈 인접 레일을 선택합니다. 지정 레일이 차 있으면 광물을 보관하고 대기합니다.</p>
    </section>
  `;
}

const POWER_TARGET_LABELS = {
  rail: "레일",
  miner: "채굴기",
  furnace: "화로",
  lab: "연구소",
};

function powerUsageHtml(tile, selected) {
  const targets = [{ layer: selected === tile.rail ? "rail" : "building", target: selected }];
  if (tile.rail && tile.rail !== selected) targets.push({ layer: "rail", target: tile.rail });
  const rows = targets
    .filter(({ target }) => POWER_TARGET_LABELS[target?.type])
    .map(({ layer, target }) => {
      const draw = powerDraw(target);
      const supply = Math.round(power.factorFor(tile, target) * 100);
      const value = draw > 0 ? `${draw} · 공급 ${supply}%` : "0 · 자체 구동";
      return `
        <div>
          <small>${POWER_TARGET_LABELS[target.type]} 전력</small>
          <b data-power-layer="${layer}">${value}</b>
        </div>
      `;
    })
    .join("");
  return rows ? `<div class="machine-grid power-usage">${rows}</div>` : "";
}

function renderMachine() {
  const tile = ui.modalTile;
  const powerOnly = Boolean(tile?.powerNode && !tile.building && !tile.rail);
  const building = tile?.building || tile?.rail || tile?.powerNode;
  if (!building || building.type === "shop") {
    closeModal();
    return;
  }
  const def = BUILDINGS[building.defId];
  const status = simulation.tileStatus(tile);
  const furnace = building.type === "furnace";
  if (furnace) simulation.normalizeFurnace(building);
  let detail = "";
  if (building.type === "miner") {
    detail = `
      <div class="machine-data"><span>출력 대기</span><b id="machine-queue">${queueSummary(building.queue)}</b></div>
      ${minerOutputHtml(building)}
    `;
  } else if (building.type === "furnace") {
    detail = `
        <div class="machine-grid">
          <div><small>석탄</small><b id="machine-coal">${building.coal}/${simulation.coalCap(building)}</b></div>
          <div><small>대기열</small><b id="machine-input">${building.inputQueue.length}/${simulation.inputCap(building)}</b></div>
          <div><small>제련 중</small><b id="machine-smelting">${building.smelting ? itemName(building.smelting) : "대기"}</b></div>
          <div><small>출력</small><b id="machine-output">${stackSummary(building.outputStack)}</b></div>
        </div>
        <div class="manual-controls">
          <button type="button" class="primary-btn" data-coal ${store.count("coal") && building.coal < simulation.coalCap(building) ? "" : "disabled"}>석탄 직접 보충</button>
          <div class="ore-controls">
            ${SMELTABLE.map((ore) => `<button type="button" data-ore="${ore}" ${store.count(ore) && building.inputQueue.length < simulation.inputCap(building) ? "" : "disabled"}>${store.displayName(ore)}</button>`).join("")}
          </div>
          <button type="button" class="secondary-btn" data-output ${simulation.outputCount(building) ? "" : "disabled"}>주괴 전부 회수</button>
        </div>
        <label class="setting-row">
          <span><b>제련 불가 화물 정체</b><small>이 화로가 받지 못한 화물을 레일에서 대기</small></span>
          <input type="checkbox" data-furnace-setting="blockUnsmeltedCargo" ${building.blockUnsmeltedCargo ? "checked" : ""}>
        </label>
        ${railEditorHtml(tile)}
    `;
  } else if (building.type === "router") {
    normalizeRouter(building);
    const selectedRoutes = new Set(Object.values(building.routes).filter(Boolean));
    const routableItems = ITEMS.filter((item) => store.isDiscovered(item.id) || selectedRoutes.has(item.id));
    detail = `
      <div class="router-routes">
        ${Object.entries(RAIL_DIRECTIONS).map(([direction, info]) => `
          <label>
            <span><b>${info.label}</b><small>${direction.toUpperCase()} 출구</small></span>
            <select data-router-direction="${direction}" aria-label="${info.label} 방향 화물">
              <option value="">미지정 · AUTO</option>
              ${routableItems.map((item) => `
                <option value="${item.id}" ${building.routes[direction] === item.id ? "selected" : ""}>${store.displayName(item.id)}</option>
              `).join("")}
            </select>
          </label>
        `).join("")}
      </div>
      <p class="rail-help">각 방향에 화물을 지정합니다. 미지정 화물은 레일 AUTO 규칙을 따릅니다.</p>
      ${railEditorHtml(tile)}
    `;
  } else if (building.type === "storage") {
    detail = `
      <div class="machine-data">
        <span>보관 화물 · 무제한 · 타일을 길게 눌러 전량 회수</span>
        <b>${stackSummary(building.stacks)}</b>
      </div>
    `;
  } else if (building.type === "generator") {
    detail = `
      <div class="machine-grid">
        <div><small>석탄</small><b>${building.coal}/${simulation.coalCap(building)}</b></div>
        <div><small>연소</small><b>${Math.ceil(building.fuelLeft || 0)}초</b></div>
        <div><small>발전 출력</small><b>${BALANCE.power.generatorOutput[building.tier] || BALANCE.power.generatorOutput[1]}</b></div>
      </div>
      <button type="button" class="primary-btn" data-coal ${store.count("coal") && building.coal < simulation.coalCap(building) ? "" : "disabled"}>석탄 보충</button>
    `;
  } else if (building.type === "battery") {
    const capacity = BALANCE.power.batteryCapacity[building.tier] || BALANCE.power.batteryCapacity[1];
    detail = `<div class="machine-data"><span>저장 전력</span><b id="machine-charge">${Math.floor(building.charge || 0)} / ${capacity}</b></div>`;
  } else if (building.type === "lab") {
    normalizeLab(building);
    const stockRows = LAB_INPUTS.map((id) => {
      const cap = simulation.labBufferCap(id);
      const amount = building.stocks[id] || 0;
      return `
        <div>
          <small>${store.displayName(id)}</small>
          <b data-lab-stock="${id}">${amount}/${cap}</b>
        </div>
      `;
    }).join("");
    const insertButtons = LAB_INPUTS.map((id) => {
      const cap = simulation.labBufferCap(id);
      const amount = building.stocks[id] || 0;
      const canInsert = store.count(id) > 0 && amount < cap;
      return `<button type="button" data-lab-item="${id}" ${canInsert ? "" : "disabled"}>${store.displayName(id)} 보충</button>`;
    }).join("");
    detail = `
      <div class="machine-data">
        <span>연구 생산 진행</span>
        <b>${Math.round((building.progress || 0) * 100)}%</b>
      </div>
      <div class="machine-grid">${stockRows}</div>
      <div class="manual-controls">
        <div class="ore-controls">${insertButtons}</div>
      </div>
      <div class="save-card lab-cost">
        <span>연구점 1 RP 생산 비용 · 버퍼에서 차감</span>
        <div class="recipe-cost">${Object.entries(BALANCE.research.labCostPerPoint).map(([id, amount]) =>
          `<span>${store.displayName(id)} ${amount}</span>`).join("")}</div>
      </div>
    `;
  } else if (building.type === "rail") {
    detail = railEditorHtml(tile);
  } else {
    detail = `<p class="modal-note">지역 전력망 연결 설비입니다.</p>`;
  }
  const upgradeTargets = [{ layer: building === tile.rail ? "rail" : "building", target: building }];
  if (tile.rail && tile.rail !== building) upgradeTargets.push({ layer: "rail", target: tile.rail });
  const upgradeMarkup = upgradeTargets.map(({ layer, target }) => {
    const upgradeId = UPGRADE_DEFS?.[target.type]?.[(target.tier || 1) + 1];
    const upgradeDef = upgradeId ? BUILDINGS[upgradeId] : null;
    if (!upgradeDef) return "";
    return `
      <section class="upgrade-preview tier-preview-${upgradeDef.tier}">
        ${buildingImage(target.type, "upgrade-art", "", upgradeDef.tier)}
        <div>
          <small>NEXT TIER · ${POWER_TARGET_LABELS[target.type] || upgradeDef.type}</small>
          <b>${upgradeDef.name}</b>
          <small>전력 ${powerDraw(target)} → ${powerDraw(upgradeDef)}</small>
          <span class="recipe-cost">${formatCost(upgradeDef.craft, true)}</span>
        </div>
      </section>
      <button type="button" class="secondary-btn" data-upgrade-layer="${layer}">${upgradeDef.name} 업그레이드</button>
    `;
  }).join("");
  $("#modal-content").innerHTML = `
    <p class="eyebrow">MACHINE INSPECTOR</p>
    <h2 id="modal-title">${def?.name || building.type} · T${building.tier || 1}</h2>
    ${buildingImage(building.type, "machine-visual", `${def?.name || building.type} 설비`, building.tier)}
    <div class="machine-status status-${status.state}"><i></i><span id="machine-status">${status.label}</span></div>
    <div class="machine-progress"><i id="machine-progress" style="width:${Math.round((building.progress || 0) * 100)}%"></i></div>
    ${powerUsageHtml(tile, building)}
    ${detail}
    ${upgradeMarkup}
    <button type="button" class="danger-btn" ${powerOnly ? "data-remove-power" : "data-remove"} data-confirm="false">
      ${powerOnly ? "전봇대 철거 · 전력망만 회수" : "설비 철거 · 전액 회수"}
    </button>
  `;
}

function updateMachineProgress() {
  if (ui.modal !== "machine") return;
  const building = ui.modalTile?.building || ui.modalTile?.rail;
  const progress = $("#machine-progress");
  if (progress) progress.style.width = `${Math.round((building?.progress || 0) * 100)}%`;
}

function updateMachine() {
  if (ui.modal !== "machine") return;
  const tile = ui.modalTile;
  const building = tile?.building || tile?.rail || tile?.powerNode;
  if (!building) {
    closeModal();
    return;
  }
  const status = simulation.tileStatus(tile);
  const statusElement = $("#machine-status");
  if (statusElement) statusElement.textContent = status.label;
  const statusWrap = $(".machine-status");
  if (statusWrap) statusWrap.className = `machine-status status-${status.state}`;
  const progress = $("#machine-progress");
  if (progress) progress.style.width = `${Math.round((building.progress || 0) * 100)}%`;
  $$("[data-power-layer]").forEach((element) => {
    const target = element.dataset.powerLayer === "rail" ? tile.rail : tile.building;
    if (!target) return;
    const draw = powerDraw(target);
    const supply = Math.round(power.factorFor(tile, target) * 100);
    element.textContent = draw > 0 ? `${draw} · 공급 ${supply}%` : "0 · 자체 구동";
  });
  if (building.type === "miner" && $("#machine-queue")) {
    $("#machine-queue").textContent = queueSummary(building.queue);
  }
  if (building.type === "furnace") {
    simulation.normalizeFurnace(building);
    if ($("#machine-coal")) $("#machine-coal").textContent = `${building.coal}/${simulation.coalCap(building)}`;
    if ($("#machine-input")) $("#machine-input").textContent = `${building.inputQueue.length}/${simulation.inputCap(building)}`;
    if ($("#machine-smelting")) $("#machine-smelting").textContent = building.smelting ? itemName(building.smelting) : "대기";
    if ($("#machine-output")) $("#machine-output").textContent = stackSummary(building.outputStack);
    const coalButton = $("[data-coal]", $("#modal-panel"));
    if (coalButton) coalButton.disabled = !(store.count("coal") && building.coal < simulation.coalCap(building));
    $$("[data-ore]", $("#modal-panel")).forEach((button) => {
      button.disabled = !(store.count(button.dataset.ore) && building.inputQueue.length < simulation.inputCap(building));
    });
    const outputButton = $("[data-output]", $("#modal-panel"));
    if (outputButton) outputButton.disabled = !simulation.outputCount(building);
  }
  if (building.type === "battery" && $("#machine-charge")) {
    const capacity = BALANCE.power.batteryCapacity[building.tier] || BALANCE.power.batteryCapacity[1];
    $("#machine-charge").textContent = `${Math.floor(building.charge || 0)} / ${capacity}`;
  }
  if (building.type === "lab") {
    normalizeLab(building);
    $$("[data-lab-stock]", $("#modal-panel")).forEach((element) => {
      const id = element.dataset.labStock;
      element.textContent = `${building.stocks[id] || 0}/${simulation.labBufferCap(id)}`;
    });
    $$("[data-lab-item]", $("#modal-panel")).forEach((button) => {
      const id = button.dataset.labItem;
      const cap = simulation.labBufferCap(id);
      button.disabled = !(store.count(id) && (building.stocks[id] || 0) < cap);
    });
  }
}

function saveCodeError(reason) {
  if (reason === "code-checksum") return "저장 코드 체크섬이 맞지 않습니다";
  if (reason === "code-file-size") return "저장 파일이 너무 큽니다";
  if (reason === "version") return "다른 버전의 저장 코드입니다";
  if (reason === "shape") return "저장 코드 데이터 구조가 잘못됐습니다";
  return "올바른 OF2 저장 코드가 아닙니다";
}

function applyImportedSave(save, source = "code") {
  const previousGame = store.snapshot();
  const previousWorld = world.snapshot();
  stopMining();
  stopHoldPickup();
  store.restore(save.game);
  if (!world.restore(save.world)) {
    store.restore(previousGame);
    world.restore(previousWorld);
    return false;
  }
  ui.guideCelebrated = Object.values(store.state.progress).every(Boolean);
  $("#guide").open = !store.state.settings.tutorialCollapsed;
  power.invalidate();
  mapView.rebuild({ reason: "save-code-import" });
  simulation.invalidatePaths();
  store.changed("save-code-import");
  closeModal();
  const fromFile = source === "file";
  logActivity(fromFile ? "txt 저장 파일 불러오기 완료" : "휴대용 저장 코드 불러오기 완료");
  toast(fromFile ? "저장 파일을 불러왔습니다" : "저장 코드를 불러왔습니다", "success");
  return true;
}

function downloadSaveCodeFile() {
  const code = currentSaveCode();
  const field = $("#save-code");
  if (field) field.value = code;
  const name = saveCodeFileName();
  const blob = new Blob([`${code}\n`], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  logActivity(`저장 코드 파일 내보내기 · ${name}`);
  toast(`${name} 저장`, "success");
}

function isSaveCodeFile(file) {
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".txt")) return true;
  return file?.type === "text/plain";
}

function clearPendingFileSave() {
  ui.pendingFileSave = null;
  const open = $("[data-save-open]");
  if (!open) return;
  open.dataset.confirm = "false";
  open.textContent = "txt 열기";
  open.classList.remove("armed");
}

async function readSaveCodeFile(file) {
  if (!file) return;
  if (!isSaveCodeFile(file) || file.size > SAVE_CODE_FILE_MAX_BYTES) {
    clearPendingFileSave();
    toast(file.size > SAVE_CODE_FILE_MAX_BYTES ? saveCodeError("code-file-size") : "txt 저장 파일만 열 수 있습니다", "error");
    effects.sound("error");
    return;
  }
  let text = "";
  try {
    text = await file.text();
  } catch {
    clearPendingFileSave();
    toast("저장 파일을 읽지 못했습니다", "error");
    effects.sound("error");
    return;
  }
  const code = normalizeSaveCodeText(text);
  const field = $("#save-code");
  if (field) field.value = code;
  const parsed = decodeSaveCodeFile(code, file.size);
  if (!parsed.ok) {
    clearPendingFileSave();
    toast(saveCodeError(parsed.reason), "error");
    effects.sound("error");
    return;
  }
  ui.pendingFileSave = parsed.data;
  const open = $("[data-save-open]");
  if (open) {
    open.dataset.confirm = "true";
    open.textContent = "이 파일로 덮어쓰려면 다시 누르세요";
    open.classList.add("armed");
  }
  toast("파일을 읽었습니다 · 한 번 더 눌러 공장에 적용", "success");
}

function currentSaveCode() {
  return encodeSaveCode(makeSave(store, world));
}

function renderSettings() {
  $("#modal-content").innerHTML = `
    <p class="eyebrow">SYSTEM CONFIG</p>
    <h2 id="modal-title">공장 설정</h2>
    <label class="setting-row">
      <span><b>효과음</b><small>설치·채굴·판매 피드백</small></span>
      <input type="checkbox" data-setting="sound" ${store.state.settings.sound ? "checked" : ""}>
    </label>
    <label class="setting-row">
      <span><b>모션 감소</b><small>화물·파티클 이동 최소화</small></span>
      <input type="checkbox" data-setting="reducedMotion" ${store.state.settings.reducedMotion ? "checked" : ""}>
    </label>
    <div class="save-card">
      <span>코드 · 파일 저장</span>
      <b>브라우저에 남기지 않음</b>
      <small>새로고침·초기화하면 빈 공장입니다. OF2 코드를 복사하거나 txt 파일로 보관하세요.</small>
    </div>
    <section class="save-code-card">
      <div>
        <b>휴대용 저장 코드</b>
        <small>코드를 만들거나 붙여넣고, txt 파일로도 저장·열 수 있습니다.</small>
      </div>
      <textarea id="save-code" rows="6" spellcheck="false" autocomplete="off" placeholder="OF2 저장 코드를 만들거나 여기에 붙여넣으세요"></textarea>
      <input id="save-file" type="file" accept=".txt,text/plain" hidden tabindex="-1">
      <div class="save-code-groups">
        <div>
          <span>내보내기</span>
          <div class="save-code-actions">
            <button type="button" class="primary-btn" data-save-export>코드 만들기</button>
            <button type="button" class="secondary-btn" data-save-copy>복사</button>
            <button type="button" class="secondary-btn" data-save-download>txt 저장</button>
          </div>
        </div>
        <div>
          <span>불러오기</span>
          <div class="save-code-actions save-code-actions-import">
            <button type="button" class="secondary-btn" data-save-import data-confirm="false">붙여넣기 적용</button>
            <button type="button" class="secondary-btn" data-save-open data-confirm="false">txt 열기</button>
          </div>
        </div>
      </div>
      <small>쿠키·로컬 저장 없음 · 서버 전송 없음 · 체크섬 손상 검출</small>
    </section>
    <button type="button" class="danger-btn" data-reset data-confirm="false">새 게임 시작 · 공장 초기화</button>
  `;
}

function updateSoundButton() {
  const button = $('[data-action="sound"]');
  button.setAttribute("aria-pressed", String(store.state.settings.sound));
  button.classList.toggle("muted", !store.state.settings.sound);
  button.textContent = store.state.settings.sound ? "SFX ON" : "SFX OFF";
}

function toggleSound() {
  store.updateSetting("sound", !store.state.settings.sound);
  if (store.state.settings.sound) effects.sound("click");
}

function openCraftPanel() {
  ui.craftOpen = true;
  document.body.classList.add("craft-open");
  $("#side-panel").classList.add("open");
  $("#side-panel").inert = false;
  $("#side-panel").removeAttribute("aria-hidden");
  if (matchMedia("(max-width: 900px)").matches) {
    $(".factory-view").inert = true;
    $(".factory-view").setAttribute("aria-hidden", "true");
  }
  $('[data-action="craft-toggle"]').setAttribute("aria-expanded", "true");
}

function closeCraftPanel() {
  ui.craftOpen = false;
  document.body.classList.remove("craft-open");
  $("#side-panel").classList.remove("open");
  $(".factory-view").inert = false;
  $(".factory-view").removeAttribute("aria-hidden");
  if (matchMedia("(max-width: 900px)").matches) {
    $("#side-panel").inert = true;
    $("#side-panel").setAttribute("aria-hidden", "true");
  }
  $('[data-action="craft-toggle"]').setAttribute("aria-expanded", "false");
}

function syncCraftPanelAccessibility() {
  if (!matchMedia("(max-width: 900px)").matches) {
    $("#side-panel").inert = false;
    $("#side-panel").removeAttribute("aria-hidden");
    $(".factory-view").inert = false;
    $(".factory-view").removeAttribute("aria-hidden");
  } else if (!ui.craftOpen) {
    $("#side-panel").inert = true;
    $("#side-panel").setAttribute("aria-hidden", "true");
  } else {
    $(".factory-view").inert = true;
    $(".factory-view").setAttribute("aria-hidden", "true");
  }
}

function isEditableTarget(node) {
  return Boolean(node?.closest?.("textarea, input, [contenteditable='true']"));
}

function preventBrowserSelect(event) {
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
}

function handleGridPointerDown(event) {
  if (event.button !== 0) return;
  const tile = mapView.tileFromElement(event.target);
  if (!tile) return;
  if (ui.mode === "place") {
    event.preventDefault();
    const def = BUILDINGS[ui.placeId];
    attemptPlace(tile);
    if (def?.type === "rail") {
      ui.dragPlace = true;
      ui.lastDragKey = tileKey(tile.x, tile.y);
      event.target.setPointerCapture?.(event.pointerId);
    }
    return;
  }
  if (ui.mode === "demolish") {
    event.preventDefault();
    attemptRemove(tile);
    return;
  }
  if (ui.mode === "power-demolish") {
    event.preventDefault();
    attemptRemovePower(tile);
    return;
  }
  if (startHoldPickup(tile, event.pointerId)) {
    event.target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    return;
  }
  if (tile.ore && !tile.building) {
    startMining(tile, event.pointerId);
    event.target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
}

function handleGridPointerMove(event) {
  if (!ui.dragPlace || ui.mode !== "place" || BUILDINGS[ui.placeId]?.type !== "rail") return;
  const tile = mapView.tileFromElement(document.elementFromPoint(event.clientX, event.clientY));
  if (!tile) return;
  const key = tileKey(tile.x, tile.y);
  if (key === ui.lastDragKey) return;
  ui.lastDragKey = key;
  attemptPlace(tile, true);
}

function handlePointerUp(event) {
  ui.dragPlace = false;
  ui.lastDragKey = "";
  let endedGesture = false;
  if (ui.minePointer != null && ui.minePointer !== "keyboard" && event.pointerId === ui.minePointer) {
    stopMining();
    endedGesture = true;
  }
  if (ui.holdPointer != null && ui.holdPointer !== "keyboard" && event.pointerId === ui.holdPointer) {
    stopHoldPickup();
    endedGesture = true;
  }
  if (endedGesture) {
    setTimeout(() => {
      ui.mineGesture = false;
    }, 0);
  }
}

function handleGridClick(event) {
  const tile = mapView.tileFromElement(event.target);
  if (!tile || ui.mode !== "idle") return;
  if (ui.mineGesture) {
    ui.mineGesture = false;
    return;
  }
  if (tile.groundItems?.length) {
    const count = simulation.pickupGroundItems(tile);
    effects.burst(tile, "install", 5);
    effects.text(tile, `+${count} 화물`, "pickup");
    effects.sound("click");
  } else if (tile.building?.type === "shop") openModal("shop");
  else if ((tile.building && tile.building.type !== "shop") || tile.rail || tile.powerNode) openModal("machine", tile);
}

function handleDocumentClick(event) {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "zoom-in") mapView.zoomBy(1);
  else if (action === "zoom-out") mapView.zoomBy(-1);
  else if (action === "center") mapView.center();
  else if (action === "demolish") setTool(ui.mode === "demolish" ? "idle" : "demolish");
  else if (action === "power-demolish") setTool(ui.mode === "power-demolish" ? "idle" : "power-demolish");
  else if (action === "cancel-tool") setTool();
  else if (action === "settings") openModal("settings");
  else if (action === "sound") toggleSound();
  else if (action === "modal-close") closeModal();
  else if (action === "craft-toggle") ui.craftOpen ? closeCraftPanel() : openCraftPanel();
  else if (action === "craft-close") closeCraftPanel();
  else if (action === "tutorial-skip") {
    store.updateSetting("tutorialSkipped", true);
    renderTutorial();
  }

  const panel = event.target.closest("[data-panel]");
  if (panel) setActivePanel(panel.dataset.panel);

  const place = event.target.closest("[data-place]");
  if (place) selectBuilding(place.dataset.place);

  const research = event.target.closest("[data-research]");
  if (research) {
    const result = progression.research(research.dataset.research);
    if (result.ok) {
      toast(`${result.tech.name} 연구 완료`, "success");
      logActivity(`${result.tech.name} 기술 적용`);
      effects.sound("unlock");
      renderPanels();
    } else {
      toast(result.reason, "error");
      effects.sound("error");
    }
  }
}

async function handleModalClick(event) {
  if (event.target === $("#modal-overlay")) {
    closeModal();
    return;
  }
  const sell = event.target.closest("[data-sell]");
  if (sell) {
    const id = sell.dataset.sell;
    const result = store.sell(id, Number(sell.dataset.count));
    if (result.gained) {
      effects.sound("sell");
      logActivity(`${itemName(id)} ${result.amount}개 판매 · +$${result.gained}`);
      renderShop();
    }
    return;
  }
  const railPort = event.target.closest("[data-rail-port]");
  if (railPort && ui.modalTile?.rail) {
    const direction = railPort.dataset.railPort;
    const enabled = !simulation.isRailPortOpen(ui.modalTile, direction);
    simulation.setRailConnection(ui.modalTile, direction, enabled);
    effects.sound("click");
    logActivity(`레일 ${RAIL_DIRECTIONS[direction].label} 포트 ${enabled ? "연결 허용" : "차단"}`);
    renderMachine();
    return;
  }
  const railOutput = event.target.closest("[data-rail-output]");
  if (railOutput && ui.modalTile?.rail) {
    const output = railOutput.dataset.railOutput;
    simulation.setRailOutput(ui.modalTile, output);
    effects.sound("click");
    logActivity(`레일 출구 ${output === "auto" ? "자동" : RAIL_DIRECTIONS[output].label} 설정`);
    renderMachine();
    return;
  }
  const minerOutput = event.target.closest("[data-miner-output]");
  if (minerOutput && ui.modalTile?.building?.type === "miner") {
    const output = minerOutput.dataset.minerOutput;
    simulation.setMinerOutput(ui.modalTile, output);
    effects.sound("click");
    logActivity(`채굴기 출구 ${output === "auto" ? "자동" : RAIL_DIRECTIONS[output].label} 설정`);
    renderMachine();
    return;
  }
  if (event.target.closest("[data-coal]") && ui.modalTile) {
    if (simulation.insertCoal(ui.modalTile)) {
      logActivity("수동 화로에 석탄 투입");
      renderMachine();
    } else toast("석탄이 없거나 저장소가 가득 찼습니다", "error");
    return;
  }
  const labItem = event.target.closest("[data-lab-item]");
  if (labItem && ui.modalTile?.building?.type === "lab") {
    if (simulation.insertLabItem(ui.modalTile, labItem.dataset.labItem)) {
      logActivity(`연구소에 ${store.displayName(labItem.dataset.labItem)} 투입`);
      renderMachine();
    } else toast("넣을 수 없거나 버퍼가 가득 찼습니다", "error");
    return;
  }
  const oreButton = event.target.closest("[data-ore]");
  if (oreButton && ui.modalTile) {
    if (simulation.insertOre(ui.modalTile, oreButton.dataset.ore)) renderMachine();
    else toast("원광을 투입할 수 없습니다", "error");
    return;
  }
  if (event.target.closest("[data-output]") && ui.modalTile) {
    const count = simulation.takeOutput(ui.modalTile);
    if (count) {
      logActivity(`주괴 ${count}개 회수`);
      renderMachine();
    } else toast("회수할 주괴가 없습니다", "error");
    return;
  }
  const upgradeButton = event.target.closest("[data-upgrade-layer]");
  if (upgradeButton && ui.modalTile) {
    const result = simulation.upgrade(ui.modalTile, upgradeButton.dataset.upgradeLayer);
    if (result.ok) {
      toast(`${result.def.name} 업그레이드 완료`, "success");
      effects.sound("unlock");
      renderMachine();
      renderCraft();
    } else {
      toast(result.reason, "error");
      effects.sound("error");
    }
    return;
  }
  const remove = event.target.closest("[data-remove]");
  if (remove && ui.modalTile) {
    if (remove.dataset.confirm !== "true") {
      remove.dataset.confirm = "true";
      remove.textContent = "한 번 더 눌러 철거";
      remove.classList.add("armed");
      setTimeout(() => {
        if (remove.isConnected) {
          remove.dataset.confirm = "false";
          remove.textContent = "설비 철거 · 전액 회수";
          remove.classList.remove("armed");
        }
      }, 2600);
    } else attemptRemove(ui.modalTile);
    return;
  }
  const removePower = event.target.closest("[data-remove-power]");
  if (removePower && ui.modalTile) {
    if (removePower.dataset.confirm !== "true") {
      removePower.dataset.confirm = "true";
      removePower.textContent = "한 번 더 눌러 전봇대 철거";
      removePower.classList.add("armed");
    } else attemptRemovePower(ui.modalTile);
    return;
  }
  const saveExport = event.target.closest("[data-save-export]");
  if (saveExport) {
    clearPendingFileSave();
    const field = $("#save-code");
    field.value = currentSaveCode();
    field.focus();
    field.select();
    toast("현재 공장의 저장 코드를 만들었습니다", "success");
    return;
  }
  const saveDownload = event.target.closest("[data-save-download]");
  if (saveDownload) {
    downloadSaveCodeFile();
    return;
  }
  const saveOpen = event.target.closest("[data-save-open]");
  if (saveOpen) {
    if (ui.pendingFileSave) {
      if (!applyImportedSave(ui.pendingFileSave, "file")) {
        toast("저장 파일을 적용하지 못했습니다", "error");
        effects.sound("error");
      }
      return;
    }
    $("#save-file")?.click();
    return;
  }
  const saveCopy = event.target.closest("[data-save-copy]");
  if (saveCopy) {
    const field = $("#save-code");
    if (!field.value.trim()) field.value = currentSaveCode();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(field.value.trim());
      else {
        field.focus();
        field.select();
        document.execCommand("copy");
      }
      toast("저장 코드를 복사했습니다", "success");
    } catch {
      field.focus();
      field.select();
      toast("코드를 선택했습니다 · 직접 복사하세요", "error");
    }
    return;
  }
  const saveImport = event.target.closest("[data-save-import]");
  if (saveImport) {
    const parsed = decodeSaveCode($("#save-code").value);
    if (!parsed.ok) {
      toast(saveCodeError(parsed.reason), "error");
      effects.sound("error");
      return;
    }
    if (saveImport.dataset.confirm !== "true") {
      saveImport.dataset.confirm = "true";
      saveImport.textContent = "현재 공장을 덮어쓰려면 다시 누르세요";
      saveImport.classList.add("armed");
      return;
    }
    if (!applyImportedSave(parsed.data)) {
      toast("저장 코드를 적용하지 못했습니다", "error");
      effects.sound("error");
    }
    return;
  }
  const reset = event.target.closest("[data-reset]");
  if (reset) {
    if (reset.dataset.confirm !== "true") {
      reset.dataset.confirm = "true";
      reset.textContent = "정말 초기화하려면 다시 누르세요";
      reset.classList.add("armed");
    } else {
      purgeStoredSaves(localStorage, sessionStorage);
      location.reload();
    }
  }
}

function handleModalChange(event) {
  const routerDirection = event.target.dataset.routerDirection;
  if (routerDirection && ui.modalTile?.building?.type === "router") {
    simulation.setRouterRoute(ui.modalTile, routerDirection, event.target.value || null);
    const item = event.target.value ? store.displayName(event.target.value) : "미지정";
    logActivity(`분배기 ${RAIL_DIRECTIONS[routerDirection].label} 출구 · ${item}`);
    renderMachine();
    return;
  }
  const furnaceSetting = event.target.dataset.furnaceSetting;
  if (furnaceSetting === "blockUnsmeltedCargo" && ui.modalTile?.building?.type === "furnace") {
    simulation.setFurnaceBlocking(ui.modalTile, event.target.checked);
    logActivity(`화로 정체 모드 ${event.target.checked ? "활성" : "해제"}`);
    return;
  }
  const setting = event.target.dataset.setting;
  if (setting) store.updateSetting(setting, event.target.checked);
  if (event.target.id === "save-file") {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void readSaveCodeFile(file);
  }
}

function handleModalInput(event) {
  if (event.target.id !== "save-code") return;
  clearPendingFileSave();
}

function moveGridFocus(key) {
  const active = document.activeElement?.classList.contains("tile")
    ? mapView.tileFromElement(document.activeElement)
    : world.get(world.shopCenters[0]?.x ?? 4, world.shopCenters[0]?.y ?? 4);
  if (!active) return;
  const offset = {
    ArrowUp: [0, -1],
    ArrowRight: [1, 0],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
  }[key];
  const target = world.get(active.x + offset[0], active.y + offset[1]);
  mapView.elementFor(target)?.focus();
}

function trapModalFocus(event) {
  if (event.key !== "Tab" || !ui.modal) return;
  const focusable = $$("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])", $("#modal-panel"));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleKeyDown(event) {
  if (ui.modal) {
    if (event.key === "Escape") closeModal();
    trapModalFocus(event);
    return;
  }
  if (event.key === "Escape") {
    setTool();
    closeCraftPanel();
    return;
  }
  const interactiveTarget = event.target.closest?.("button, input, select, textarea, summary, a, [contenteditable]");
  const gridTarget = event.target.classList?.contains("tile") || event.target === $("#grid");
  if (interactiveTarget && !gridTarget) return;
  if (/^[1-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
    const id = CRAFT_ORDER[Number(event.key) - 1];
    if (id) selectBuilding(id);
    return;
  }
  if (event.key === "0") {
    setTool(ui.mode === "demolish" ? "idle" : "demolish");
    return;
  }
  if (event.key.toLowerCase() === "p") {
    setTool(ui.mode === "power-demolish" ? "idle" : "power-demolish");
    return;
  }
  if (event.key.startsWith("Arrow") && (document.activeElement?.classList.contains("tile") || document.activeElement === $("#grid"))) {
    event.preventDefault();
    moveGridFocus(event.key);
    return;
  }
  if (event.code === "Space" && document.activeElement?.classList.contains("tile") && !event.repeat) {
    const tile = mapView.tileFromElement(document.activeElement);
    if (startHoldPickup(tile, "keyboard")) {
      event.preventDefault();
    } else if (tile?.ore && !tile.building) {
      event.preventDefault();
      startMining(tile, "keyboard");
    }
  }
}

function handleKeyUp(event) {
  if (event.code === "Space" && ui.minePointer === "keyboard") {
    stopMining();
    ui.mineGesture = false;
  }
  if (event.code === "Space" && ui.holdPointer === "keyboard") {
    stopHoldPickup();
    ui.mineGesture = false;
  }
}

function bindEvents() {
  bus.on("state", ({ reason }) => queueState(reason));
  bus.on("tile", ({ tile, reason }) => {
    if (reason === "progress") {
      mapView.paintProgress(tile);
      if (ui.modalTile === tile) updateMachineProgress();
      return;
    }
    mapView.renderTile(tile);
    if (ui.modalTile === tile) {
      if (
        (tile.building?.type === "furnace" && reason === "smelt") ||
        (tile.building?.type === "lab" && reason === "research")
      ) {
        renderMachine();
      }
      else updateMachine();
    }
  });
  bus.on("worldRebuild", (detail) => {
    simulation.invalidatePaths();
    mapView.rebuild(detail);
    renderExpandControls();
    if (detail.reason === "expand") {
      toast(`구역 확장 완료 · -$${detail.cost}`, "success");
      logActivity(`${detail.direction.toUpperCase()} 방향 구역 확장`);
      $("#map-frame").classList.add("expanding");
      setTimeout(() => $("#map-frame").classList.remove("expanding"), 700);
    }
  });
  bus.on("paths", () => {
    mapView.renderActive();
    if (ui.modalTile?.rail) renderMachine();
  });
  bus.on("cargoMove", ({ from, to, item }) => effects.cargo(from, to, item));
  bus.on("cargoSold", ({ tile, gained }) => {
    effects.text(tile, `+$${gained}`, "sale");
    effects.pulse(tile, "sale");
    effects.sound("sell");
  });
  bus.on("discover", ({ id }) => {
    toast(`${itemName(id)} 발견`, "success");
    logActivity(`신규 자원 확인 · ${itemName(id)}`);
  });
  bus.on("machineCycle", ({ tile, type, item }) => {
    if (type === "smelt") {
      effects.burst(tile, "heat", 6);
      effects.text(tile, `+${itemName(item)}`, "smelt");
      effects.sound("smelt");
    } else if (type === "research") {
      effects.text(tile, "+연구점", "smelt");
      effects.sound("unlock");
    } else effects.pulse(tile, "active");
  });
  bus.on("groundDrop", ({ tile }) => {
    effects.burst(tile, "ore", 4);
    logActivity("막다른 레일에서 화물 바닥 드롭");
  });
  bus.on("questComplete", ({ quest }) => {
    toast(`퀘스트 완료 · ${quest.name}`, "success");
    logActivity(`${quest.name} 완료 · 보상 지급`);
    effects.sound("unlock");
  });
  bus.on("powerChanged", () => {
    renderChrome();
    mapView.renderActive();
    updateMachine();
  });

  $("#grid").addEventListener("pointerdown", handleGridPointerDown, { passive: false });
  $("#grid").addEventListener("pointermove", handleGridPointerMove);
  $("#grid").addEventListener("click", handleGridClick);
  $("#grid").addEventListener("contextmenu", (event) => {
    event.preventDefault();
    setTool();
  });
  document.addEventListener("selectstart", preventBrowserSelect);
  document.addEventListener("dragstart", preventBrowserSelect);
  document.addEventListener("contextmenu", (event) => {
    if (isEditableTarget(event.target) || event.target.closest("#grid")) return;
    event.preventDefault();
  });
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("pointercancel", handlePointerUp);
  document.addEventListener("click", handleDocumentClick);
  $("#modal-overlay").addEventListener("click", handleModalClick);
  $("#modal-overlay").addEventListener("change", handleModalChange);
  $("#modal-overlay").addEventListener("input", handleModalInput);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", syncCraftPanelAccessibility);
  $("#guide").addEventListener("toggle", () => {
    store.updateSetting("tutorialCollapsed", !$("#guide").open);
  });
  $$(".expand").forEach((button) => {
    button.addEventListener("click", () => {
      const result = world.expand(button.dataset.dir);
      if (!result.ok) {
        toast(result.reason === "money" ? `확장 비용 $${result.cost}` : "확장할 수 없습니다", "error");
        effects.sound("error");
      }
    });
  });
}

let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(BALANCE.mining.frameDtCap, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  updateMining(dt);
  updateHoldPickup(dt);
  power.update(dt);
  progression.update(dt);
  simulation.update(dt);
  requestAnimationFrame(frame);
}

function init() {
  bindEvents();
  syncCraftPanelAccessibility();
  mapView.rebuild();
  renderHud();
  renderPanels();
  setActivePanel(ui.activePanel);
  if (store.state.settings.tutorialCollapsed) $("#guide").open = false;
  renderSaveStatus();
  logActivity("신규 공장 제어망 가동 · 진행은 설정에서 코드로 저장");
  requestAnimationFrame(frame);
}

init();
