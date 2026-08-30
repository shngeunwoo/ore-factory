export const ITEMS = [
  { id: "stone", name: "돌", short: "돌", color: "#9aa7b3" },
  { id: "coal", name: "석탄", short: "석탄", color: "#313944" },
  { id: "iron", name: "철 원광", short: "철", color: "#819ab0" },
  { id: "copper", name: "구리 원광", short: "구리", color: "#d08042" },
  { id: "tin", name: "주석 원광", short: "주석", color: "#afc2ad" },
  { id: "zinc", name: "아연 원광", short: "아연", color: "#78aeb9" },
  { id: "lead", name: "납 원광", short: "납", color: "#697386" },
  { id: "nickel", name: "니켈 원광", short: "니켈", color: "#9eae7f" },
  { id: "silver", name: "은 원광", short: "은", color: "#c7d2df" },
  { id: "gold", name: "금 원광", short: "금", color: "#e0b73e" },
  { id: "iron_ingot", name: "철 주괴", short: "철괴", color: "#afc2d5" },
  { id: "copper_ingot", name: "구리 주괴", short: "구리괴", color: "#e49a55" },
  { id: "tin_ingot", name: "주석 주괴", short: "주석괴", color: "#c7d5c3" },
  { id: "zinc_ingot", name: "아연 주괴", short: "아연괴", color: "#a8d0d7" },
  { id: "lead_ingot", name: "납 주괴", short: "납괴", color: "#8993a8" },
  { id: "nickel_ingot", name: "니켈 주괴", short: "니켈괴", color: "#bec99e" },
  { id: "silver_ingot", name: "은 주괴", short: "은괴", color: "#e2e9f0" },
  { id: "gold_ingot", name: "금 주괴", short: "금괴", color: "#f1ce60" },
];

export const SELL = {
  stone: 1, coal: 3, iron: 5, copper: 6, tin: 5, zinc: 6, lead: 7,
  nickel: 9, silver: 10, gold: 14, iron_ingot: 15, copper_ingot: 18,
  tin_ingot: 16, zinc_ingot: 18, lead_ingot: 21, nickel_ingot: 26,
  silver_ingot: 31, gold_ingot: 41,
};

export const MINE_TIME = {
  stone: 0.55, coal: 0.7, iron: 0.85, copper: 0.9, tin: 1.09,
  zinc: 1.15, lead: 1.27, nickel: 1.38, silver: 1.5, gold: 1.67,
};

export const ORE_TO_INGOT = {
  iron: "iron_ingot", copper: "copper_ingot", tin: "tin_ingot",
  zinc: "zinc_ingot", lead: "lead_ingot", nickel: "nickel_ingot",
  silver: "silver_ingot", gold: "gold_ingot",
};

export const SMELTABLE = Object.freeze(Object.keys(ORE_TO_INGOT));
export const ORE_IDS = Object.freeze(["stone", "coal", "iron", "copper", "tin", "zinc", "lead", "nickel", "silver", "gold"]);
export const ORE_TIER_1 = Object.freeze(["stone", "coal", "iron", "copper"]);
export const ORE_TIER_2 = Object.freeze(["tin", "zinc", "lead"]);
export const ORE_TIER_3 = Object.freeze(["nickel", "silver", "gold"]);
export const START_ORES = Object.freeze([
  "stone", "stone", "stone", "stone", "coal", "coal", "coal", "iron", "iron", "iron", "copper", "copper",
]);
export const INGOT_IDS = Object.freeze(["iron_ingot", "copper_ingot", "tin_ingot", "zinc_ingot", "lead_ingot", "nickel_ingot", "silver_ingot", "gold_ingot"]);
export const ORE_LABEL = {
  stone: "돌", coal: "석탄", iron: "철", copper: "구리", tin: "주석",
  zinc: "아연", lead: "납", nickel: "니켈", silver: "은", gold: "금",
};

export const BALANCE = Object.freeze({
  start: { money: 25, items: { stone: 30, coal: 6 } },
  map: {
    initialSize: 9,
    shopOrigin: 4,
    shopStep: 9,
    emptyChance: 0.84,
    oreSpacing: 2,
    midFromExpand: 2,
    advancedFromExpand: 5,
  },
  mining: { stoneBonusChance: 0.5, frameDtCap: 0.05 },
  miner: { interval: { 1: 2.5, 2: 1.5, 3: 0.8 }, queueCap: 6 },
  rail: { interval: { 1: 0.4, 2: 0.25, 3: 0.12 } },
  smelt: {
    time: { 1: 2.2, 2: 1.25, 3: 0.65 },
    inputCap: { 1: 2, 2: 4, 3: 8 },
    coalCap: { 1: 8, 2: 16, 3: 32 },
  },
  storage: { outputInterval: 0.45 },
  interaction: { pickupHoldSeconds: 0.55 },
  ground: { stackCap: 999 },
  power: {
    generatorOutput: { 1: 12, 2: 24, 3: 48 },
    fuelSeconds: 20,
    batteryCapacity: { 1: 60, 2: 180, 3: 480 },
    draw: {
      rail: { 1: 0, 2: 1, 3: 2 },
      miner: { 1: 0, 2: 3, 3: 6 },
      furnace: { 1: 0, 2: 4, 3: 8 },
      lab: { 1: 6 },
    },
  },
  research: {
    labSecondsPerPoint: 3,
    labCostPerPoint: { stone: 100, coal: 25, iron_ingot: 20, copper_ingot: 20 },
    labBufferCap: { stone: 400, coal: 100, iron_ingot: 80, copper_ingot: 80 },
  },
  expand: { base: 28, growth: 1.5 },
  zoom: { min: 38, max: 72, step: 6, initial: 54 },
});

export const LAB_INPUTS = Object.freeze(Object.keys(BALANCE.research.labCostPerPoint));

export const BUILDINGS = {
  rail_1: {
    id: "rail_1", name: "초급 레일", type: "rail", tier: 1,
    unlockCost: 0, craft: { stone: 2 }, place: "empty",
    description: "상점 없이도 출력 방향으로 화물을 운반합니다.",
  },
  furnace: {
    id: "furnace", name: "인라인 화로", type: "furnace", tier: 1,
    unlockCost: 0, craft: { stone: 12 }, place: "rail",
    description: "레일 위에서 석탄과 원광 화물을 자동 제련합니다.",
  },
  miner_1: {
    id: "miner_1", name: "초급 채굴기", type: "miner", tier: 1,
    unlockCost: 0, craft: { iron_ingot: 2, stone: 10 }, place: "ore",
    description: "광석 위에서 채굴하고 지정 방향 레일로 배출합니다.",
  },
  storage_1: {
    id: "storage_1", name: "화물 창고", type: "storage", tier: 1,
    unlockCost: 0, craft: { iron_ingot: 2, stone: 8 }, place: "empty",
    description: "화물을 제한 없이 저장하고 빈 인접 레일로 다시 배출합니다.",
  },
  router_1: {
    id: "router_1", name: "필터 분배기", type: "router", tier: 1,
    unlockCost: 0, craft: { copper_ingot: 2, stone: 6 }, place: "rail",
    description: "방향마다 지정한 화물을 해당 출구로 분배합니다.",
  },
  generator_1: {
    id: "generator_1", name: "석탄 발전기", type: "generator", tier: 1,
    unlockCost: 0, craft: { iron_ingot: 3, copper_ingot: 1, stone: 10 }, place: "empty",
    description: "석탄을 태워 지역 전력망에 전력을 공급합니다.",
  },
  pole_1: {
    id: "pole_1", name: "전봇대", type: "pole", tier: 1,
    unlockCost: 0, craft: { copper_ingot: 1, stone: 2 }, place: "power",
    description: "모든 타일에 겹쳐 설치해 인접 전력 설비를 연결합니다.",
  },
  battery_1: {
    id: "battery_1", name: "축전지", type: "battery", tier: 1,
    unlockCost: 0, craft: { iron_ingot: 2, copper_ingot: 3, stone: 6 }, place: "empty",
    description: "남는 전력을 저장하고 부족할 때 방전합니다.",
  },
  lab_1: {
    id: "lab_1", name: "연구소", type: "lab", tier: 1,
    unlockCost: 0, craft: { iron_ingot: 4, copper_ingot: 4, stone: 12 }, place: "empty",
    description: "버퍼의 자원과 전력으로 연구점을 생산합니다. 패널 투입과 레일 공급을 받습니다.",
  },
  rail_2: {
    id: "rail_2", name: "중급 레일", type: "rail", tier: 2,
    unlockCost: 0, craft: { iron_ingot: 3, copper_ingot: 2, stone: 6 }, place: "upgrade",
    description: "전력 1을 소비해 초급보다 빠르게 화물을 운반합니다.",
  },
  miner_2: {
    id: "miner_2", name: "중급 채굴기", type: "miner", tier: 2,
    unlockCost: 0, craft: { iron_ingot: 6, copper_ingot: 3, stone: 10 }, place: "upgrade",
    description: "전력 3을 소비하는 고속 자동 채굴기입니다.",
  },
  furnace_2: {
    id: "furnace_2", name: "중급 인라인 화로", type: "furnace", tier: 2,
    unlockCost: 0, craft: { iron_ingot: 5, copper_ingot: 3, stone: 8 }, place: "upgrade",
    description: "전력 4를 소비하며 더 빠르고 연료 버퍼가 큽니다.",
  },
  rail_3: {
    id: "rail_3", name: "고급 레일", type: "rail", tier: 3,
    unlockCost: 0, craft: { iron_ingot: 5, nickel_ingot: 2, stone: 10 }, place: "upgrade",
    description: "전력 2를 소비하는 최고 속도 화물 레일입니다.",
  },
  miner_3: {
    id: "miner_3", name: "고급 채굴기", type: "miner", tier: 3,
    unlockCost: 0, craft: { iron_ingot: 10, nickel_ingot: 4, stone: 20 }, place: "upgrade",
    description: "전력 6을 소비하는 최고 속도 자동 채굴기입니다.",
  },
  furnace_3: {
    id: "furnace_3", name: "고급 인라인 화로", type: "furnace", tier: 3,
    unlockCost: 0, craft: { iron_ingot: 8, nickel_ingot: 3, silver_ingot: 2, stone: 16 }, place: "upgrade",
    description: "전력 8을 소비하는 최고 속도 인라인 화로입니다.",
  },
};

export const CRAFT_ORDER = Object.freeze([
  "rail_1", "furnace", "miner_1", "storage_1", "router_1",
  "generator_1", "pole_1", "battery_1", "lab_1",
]);

export const TECHNOLOGIES = Object.freeze({
  automation: {
    id: "automation", name: "자동 채굴", cost: 2, requires: [],
    unlocks: ["miner_1"], description: "초급 채굴기와 현장 업그레이드를 해금합니다.",
  },
  logistics: {
    id: "logistics", name: "화물 보관", cost: 2, requires: [],
    unlocks: ["storage_1"], description: "화물 창고를 해금합니다.",
  },
  routing: {
    id: "routing", name: "선별 물류", cost: 3, requires: ["logistics"],
    unlocks: ["router_1"], description: "필터 분배기를 해금합니다.",
  },
  power: {
    id: "power", name: "지역 전력망", cost: 4, requires: ["automation"],
    unlocks: ["generator_1", "pole_1"], description: "발전기와 전봇대를 해금합니다.",
  },
  battery: {
    id: "battery", name: "에너지 저장", cost: 4, requires: ["power"],
    unlocks: ["battery_1"], description: "축전지를 해금합니다.",
  },
  research_lab: {
    id: "research_lab", name: "자동 연구", cost: 5, requires: ["power"],
    unlocks: ["lab_1"], description: "버퍼 자원과 전력으로 연구점을 생산하는 연구소를 해금합니다.",
  },
  tier_2: {
    id: "tier_2", name: "중급 공정", cost: 10, requires: ["routing", "power"],
    unlocks: ["rail_2", "miner_2", "furnace_2"], description: "전력을 쓰는 레일·채굴기·화로 T2 업그레이드.",
  },
  tier_3: {
    id: "tier_3", name: "고급 공정", cost: 16, requires: ["tier_2", "battery"],
    unlocks: ["rail_3", "miner_3", "furnace_3"], description: "더 많은 전력을 쓰는 레일·채굴기·화로 T3 업그레이드.",
  },
});

export const QUESTS = Object.freeze([
  { id: "mine_5", name: "첫 채굴", metric: "mined", target: 5, reward: { items: { stone: 10 }, research: 2 } },
  { id: "sell_20", name: "시장 진입", metric: "soldItems", target: 20, reward: { money: 25, research: 2 } },
  { id: "transport_12", name: "화물 흐름", metric: "transported", target: 12, reward: { items: { iron_ingot: 2 }, research: 3 } },
  { id: "smelt_3", name: "정제 공정", metric: "smeltedCount", target: 3, reward: { money: 40, research: 4 } },
  { id: "power_1", name: "점화", metric: "powered", target: 1, reward: { items: { copper_ingot: 2 }, research: 5 } },
  { id: "research_3", name: "기술 확장", metric: "researchedCount", target: 3, reward: { money: 80, research: 6 } },
]);

export const UPGRADE_DEFS = Object.freeze({
  rail: { 2: "rail_2", 3: "rail_3" },
  miner: { 2: "miner_2", 3: "miner_3" },
  furnace: { 2: "furnace_2", 3: "furnace_3" },
});

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: "mined",
    title: "광석 채굴",
    copy: "광석 칸을 길게 누르세요. 게이지가 차면 자원이 들어옵니다.",
  },
  {
    id: "sold",
    title: "상점 판매",
    copy: "가운데 3×3 상점을 클릭하고 자원을 파세요. 돈이 생깁니다.",
  },
  {
    id: "smelted",
    title: "첫 주괴",
    copy: "빈 땅에 레일, 그 위에 화로. 석탄과 원광을 넣으면 주괴가 나옵니다.",
  },
  {
    id: "automated",
    title: "자동화",
    copy: "레일을 끌어 깔거나 채굴기를 광석 위에 놓으세요.",
  },
]);

export function nextTutorialStep(progress = {}) {
  return TUTORIAL_STEPS.find((step) => !progress[step.id]) || null;
}

const ITEM_BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function itemName(id) {
  return ITEM_BY_ID.get(id)?.name ?? id;
}

export function itemInfo(id) {
  return ITEM_BY_ID.get(id) ?? null;
}

export function powerDraw(target) {
  const byTier = BALANCE.power.draw[target?.type];
  if (!byTier) return 0;
  if (typeof byTier === "number") return byTier;
  return byTier[target?.tier || 1] ?? 0;
}

export function expandCost(count) {
  return Math.round(BALANCE.expand.base * Math.pow(BALANCE.expand.growth, count));
}
