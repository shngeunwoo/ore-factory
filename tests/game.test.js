import test from "node:test";
import assert from "node:assert/strict";
import {
  BALANCE,
  BUILDINGS,
  CRAFT_ORDER,
  ITEMS,
  MINE_TIME,
  ORE_IDS,
  ORE_TIER_2,
  ORE_TIER_3,
  SELL,
  START_ORES,
  TECHNOLOGIES,
  expandCost,
  nextTutorialStep,
  TUTORIAL_STEPS,
  createTutorialProgress,
  tutorialComplete,
  tutorialTileHint,
} from "../src/js/domain/recipes.js";
import { createBuilding } from "../src/js/game/buildings.js";
import { clearTiles, setup } from "./helpers.js";

test("v2 도메인 키와 연구 해금 대상이 완전하다", () => {
  assert.equal(CRAFT_ORDER.every((id) => BUILDINGS[id]), true);
  assert.equal(ITEMS.every((item) => Object.hasOwn(SELL, item.id)), true);
  assert.equal(ORE_IDS.every((id) => Object.hasOwn(MINE_TIME, id)), true);
  assert.equal(Object.values(TECHNOLOGIES).every((tech) => tech.unlocks.every((id) => BUILDINGS[id])), true);
});

test("튜토리얼은 완료되지 않은 다음 단계만 가리킨다", () => {
  assert.equal(nextTutorialStep({}).id, "mined");
  assert.equal(nextTutorialStep({ mined: true }).id, "sold");
  assert.equal(nextTutorialStep({ mined: true, sold: true }).id, "railed");
  assert.equal(nextTutorialStep({ mined: true, sold: true, railed: true }).id, "smelted");
  assert.equal(nextTutorialStep({
    mined: true, sold: true, railed: true, smelted: true,
  }).id, "researched");
  assert.equal(nextTutorialStep({
    mined: true, sold: true, railed: true, smelted: true, researched: true,
  }).id, "miner");
  assert.equal(nextTutorialStep({
    mined: true, sold: true, railed: true, smelted: true, researched: true, miner: true,
  }), null);
  assert.equal(TUTORIAL_STEPS.length, 6);
  assert.equal(tutorialComplete(createTutorialProgress({ automated: true })), false);
  assert.equal(createTutorialProgress({ automated: true }).railed, true);
  assert.equal(tutorialTileHint(TUTORIAL_STEPS[0], { ore: "iron" }), true);
  assert.equal(tutorialTileHint(TUTORIAL_STEPS[2], { ore: null, building: null, rail: null }), true);
  assert.equal(tutorialTileHint(TUTORIAL_STEPS[3], { rail: { type: "rail" } }), true);
});

test("옛 automated 진행은 레일 단계만 완료로 본다", () => {
  const { store } = setup();
  store.restore({
    ...store.snapshot(),
    progress: { mined: true, sold: true, smelted: true, automated: true },
  });
  assert.equal(store.state.progress.railed, true);
  assert.equal(store.state.progress.miner, false);
  assert.equal(nextTutorialStep(store.state.progress).id, "researched");
});

test("레일 설치·자동 채굴 연구·채굴기 설치가 튜토리얼을 나눈다", () => {
  const { store, world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  store.add("stone", 20, "test");
  assert.equal(simulation.place("rail_1", tile).ok, true);
  assert.equal(store.state.progress.railed, true);
  assert.equal(store.state.progress.miner, false);
  store.addResearch(2, "test");
  assert.equal(store.researchTech("automation").ok, true);
  assert.equal(store.state.progress.researched, true);
  const ore = [...world.tiles.values()].find((entry) => entry.ore && !entry.building);
  store.add("iron_ingot", 2, "test");
  assert.equal(simulation.place("miner_1", ore).ok, true);
  assert.equal(store.state.progress.miner, true);
  store.adoptWorldProgress(world);
  assert.equal(store.state.progress.railed, true);
});

test("자동 판매는 발견·판매량·금액 통계를 갱신한다", () => {
  const { store } = setup();
  const before = store.money;
  assert.deepEqual(store.creditItem("gold", 2, "automatic"), { amount: 2, gained: SELL.gold * 2 });
  assert.equal(store.money, before + SELL.gold * 2);
  assert.equal(store.state.stats.soldItems, 2);
  assert.equal(store.state.stats.sold, SELL.gold * 2);
  assert.equal(store.isDiscovered("gold"), true);
});

test("맵 확장은 비용을 차감하고 한 줄을 추가한다", () => {
  const { store, world } = setup();
  store.addMoney(100, "test");
  const result = world.expand("n");
  assert.equal(result.ok, true);
  assert.equal(result.cost, expandCost(0));
  assert.equal(world.bounds().minY, -1);
  assert.equal(result.newTiles.length, 9);
});

function oreCounts(world) {
  const counts = {};
  world.forEach((tile) => {
    if (!tile.ore) return;
    counts[tile.ore] = (counts[tile.ore] || 0) + 1;
  });
  return counts;
}

function assertOresNotAdjacent(world) {
  const ores = [...world.tiles.values()].filter((tile) => tile.ore);
  ores.forEach((tile) => {
    ores.forEach((other) => {
      if (tile === other) return;
      assert.ok(
        Math.max(Math.abs(tile.x - other.x), Math.abs(tile.y - other.y)) >= BALANCE.map.oreSpacing,
        `${tile.ore}@${tile.x},${tile.y} 옆 ${other.ore}@${other.x},${other.y}`,
      );
    });
  });
}

test("시작 광석은 기본 4종 확정이고 서로 붙지 않는다", () => {
  const { world } = setup();
  const counts = oreCounts(world);
  assert.equal(counts.stone, 4);
  assert.equal(counts.coal, 3);
  assert.equal(counts.iron, 3);
  assert.equal(counts.copper, 2);
  assert.equal(START_ORES.length, 12);
  assertOresNotAdjacent(world);
});

test("중급·고급 광석은 해금 확장에서 종류당 한 칸만 나온다", () => {
  const { store, world } = setup();
  store.addMoney(20000, "test");
  world.expand("e");
  assert.equal(oreCounts(world).tin, undefined);
  while (world.expandCount < BALANCE.map.midFromExpand) world.expand("e");
  const mid = oreCounts(world);
  ORE_TIER_2.forEach((id) => assert.equal(mid[id], 1));
  world.expand("e");
  ORE_TIER_2.forEach((id) => assert.equal(oreCounts(world)[id], 1));
  while (world.expandCount < BALANCE.map.advancedFromExpand) world.expand("s");
  const advanced = oreCounts(world);
  ORE_TIER_3.forEach((id) => assert.equal(advanced[id], 1));
  world.expand("s");
  ORE_TIER_3.forEach((id) => assert.equal(oreCounts(world)[id], 1));
  assertOresNotAdjacent(world);
});

test("레일과 인라인 화로는 같은 타일에 설치된다", () => {
  const { store, world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  store.add("stone", 20, "test");
  assert.equal(simulation.place("rail_1", tile).ok, true);
  assert.equal(simulation.place("furnace", tile).ok, true);
  assert.equal(tile.rail.type, "rail");
  assert.equal(tile.building.type, "furnace");
});

test("복합 타일 철거는 설비를 먼저 제거하고 레일을 보존한다", () => {
  const { store, world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.building = createBuilding(BUILDINGS.furnace);
  tile.building.coal = 2;
  const coal = store.count("coal");
  assert.equal(simulation.remove(tile).ok, true);
  assert.equal(tile.building, null);
  assert.equal(tile.rail.type, "rail");
  assert.equal(store.count("coal"), coal + 2);
});
