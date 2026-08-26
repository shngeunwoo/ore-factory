import test from "node:test";
import assert from "node:assert/strict";
import { BALANCE, BUILDINGS, powerDraw } from "../src/js/domain/recipes.js";
import { createBuilding } from "../src/js/game/buildings.js";
import { clearTiles, setup } from "./helpers.js";

test("연구는 연구점을 쓰고 건물을 해금하며 선행 기술을 강제한다", () => {
  const { store, progression } = setup();
  store.addResearch(20, "test");
  assert.equal(progression.research("routing").ok, false);
  assert.equal(progression.research("logistics").ok, true);
  assert.equal(progression.research("routing").ok, true);
  assert.equal(store.isUnlocked("storage_1"), true);
  assert.equal(store.isUnlocked("router_1"), true);
});

test("퀘스트는 통계 목표를 감지하고 보상을 자동 지급한다", () => {
  const { store } = setup();
  const stone = store.count("stone");
  store.state.stats.mined = 5;
  store.changed("test");
  assert.equal(store.state.quests.completed.mine_5, true);
  assert.equal(store.count("stone"), stone + 10);
  assert.equal(store.state.research.points, 2);
});

test("레일·채굴기·화로는 T1이 무전력이고 T2부터 T3 순으로 전력 소비가 증가한다", () => {
  assert.deepEqual(
    [BUILDINGS.rail_1, BUILDINGS.rail_2, BUILDINGS.rail_3].map(powerDraw),
    [0, 1, 2],
  );
  assert.deepEqual(
    [BUILDINGS.miner_1, BUILDINGS.miner_2, BUILDINGS.miner_3].map(powerDraw),
    [0, 3, 6],
  );
  assert.deepEqual(
    [BUILDINGS.furnace, BUILDINGS.furnace_2, BUILDINGS.furnace_3].map(powerDraw),
    [0, 4, 8],
  );
});

test("지역 전력망은 발전기-전봇대-소비 설비에 공급률을 계산한다", () => {
  const { store, world, power } = setup();
  const generator = world.get(0, 0);
  const pole = world.get(1, 0);
  const miner = world.get(2, 0);
  clearTiles(generator, pole, miner);
  generator.building = createBuilding(BUILDINGS.generator_1);
  pole.powerNode = createBuilding(BUILDINGS.pole_1);
  miner.ore = "iron";
  miner.building = createBuilding(BUILDINGS.miner_2);
  generator.building.coal = 1;
  store.state.research.completed.power = true;
  power.invalidate();
  power.update(0.3);
  assert.equal(power.factorFor(miner), 1);
  assert.equal(power.summary.demand, 3);
  assert.equal(power.summary.generated > 0, true);
  generator.building.fuelLeft = 0;
  generator.building.coal = 0;
  power.invalidate();
  power.update(0.3);
  assert.equal(power.factorFor(miner), 0);
});

test("같은 타일의 T2 레일과 화로는 전력 수요를 각각 합산한다", () => {
  const { world, power } = setup();
  const generator = world.get(0, 0);
  const pole = world.get(1, 0);
  const furnace = world.get(2, 0);
  clearTiles(generator, pole, furnace);
  generator.building = createBuilding(BUILDINGS.generator_1);
  generator.building.coal = 1;
  pole.powerNode = createBuilding(BUILDINGS.pole_1);
  furnace.rail = createBuilding(BUILDINGS.rail_2);
  furnace.building = createBuilding(BUILDINGS.furnace_2);

  power.invalidate();
  power.update(0.3);

  assert.equal(power.summary.demand, 5);
  assert.equal(power.factorFor(furnace, furnace.rail), 1);
  assert.equal(power.factorFor(furnace, furnace.building), 1);
});

test("축전지는 발전 부족분을 방전하고 남은 부족률을 공급률에 반영한다", () => {
  const { world, power } = setup();
  const generator = world.get(0, 0);
  const pole = world.get(1, 0);
  const battery = world.get(2, 0);
  const miner = world.get(3, 0);
  const furnace = world.get(2, 1);
  clearTiles(generator, pole, battery, miner, furnace);
  generator.building = createBuilding(BUILDINGS.generator_1);
  generator.building.coal = 1;
  pole.powerNode = createBuilding(BUILDINGS.pole_1);
  battery.building = createBuilding(BUILDINGS.battery_1);
  battery.building.charge = 0.5;
  miner.building = createBuilding(BUILDINGS.miner_3);
  furnace.rail = createBuilding(BUILDINGS.rail_1);
  furnace.building = createBuilding(BUILDINGS.furnace_3);

  power.invalidate();
  power.update(0.5);

  assert.equal(power.summary.generated, 12);
  assert.equal(power.summary.supplied, 13);
  assert.equal(power.summary.demand, 14);
  assert.equal(battery.building.charge, 0);
  assert.ok(power.factorFor(miner) > 0 && power.factorFor(miner) < 1);
  assert.equal(power.factorFor(miner), power.factorFor(furnace));
});

test("T2 레일은 전력 없이는 멈추고 공급되면 화물을 운송한다", () => {
  const { world, power, simulation } = setup();
  const generator = world.get(0, 0);
  const source = world.get(1, 0);
  const target = world.get(2, 0);
  clearTiles(generator, source, target);
  generator.building = createBuilding(BUILDINGS.generator_1);
  source.rail = createBuilding(BUILDINGS.rail_2);
  target.rail = createBuilding(BUILDINGS.rail_1);
  source.cargo = { type: "iron" };
  simulation.setRailOutput(source, "e");

  power.invalidate();
  power.update(0.3);
  simulation.update(1);
  assert.equal(source.cargo.type, "iron");
  assert.equal(target.cargo, null);

  generator.building.coal = 1;
  power.invalidate();
  power.update(0.3);
  simulation.update(1);
  assert.equal(source.cargo, null);
  assert.equal(target.cargo.type, "iron");
});

test("전력이 연결된 연구소는 대량 자원을 소비해 연구점을 생산한다", () => {
  const { store, world, power, progression } = setup();
  const generator = world.get(0, 0);
  const pole = world.get(1, 0);
  const lab = world.get(2, 0);
  clearTiles(generator, pole, lab);
  generator.building = createBuilding(BUILDINGS.generator_1);
  pole.powerNode = createBuilding(BUILDINGS.pole_1);
  lab.building = createBuilding(BUILDINGS.lab_1);
  generator.building.coal = 1;
  store.state.research.completed.power = true;
  store.refund(BALANCE.research.labCostPerPoint, "test");
  power.invalidate();
  power.update(0.3);
  const before = store.state.research.points;
  const resources = Object.fromEntries(
    Object.keys(BALANCE.research.labCostPerPoint).map((id) => [id, store.count(id)]),
  );
  progression.update(9);
  assert.equal(store.state.research.points > before, true);
  Object.entries(BALANCE.research.labCostPerPoint).forEach(([id, amount]) => {
    assert.equal(store.count(id), resources[id] - amount);
  });
});

test("연구소는 생산 자원이 부족하면 완료 직전에서 대기한다", () => {
  const { store, world, power, progression, simulation } = setup();
  const generator = world.get(0, 0);
  const pole = world.get(1, 0);
  const lab = world.get(2, 0);
  clearTiles(generator, pole, lab);
  generator.building = createBuilding(BUILDINGS.generator_1);
  pole.powerNode = createBuilding(BUILDINGS.pole_1);
  lab.building = createBuilding(BUILDINGS.lab_1);
  generator.building.coal = 1;
  power.invalidate();
  power.update(0.3);
  const before = store.state.research.points;

  progression.update(9);

  assert.equal(store.state.research.points, before);
  assert.equal(lab.building.progress, 1);
  assert.equal(simulation.tileStatus(lab).label, "연구 자원 부족");
});

test("전봇대는 다른 타일 레이어와 겹치며 별도로 철거된다", () => {
  const { world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.ore = "iron";
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.building = createBuilding(BUILDINGS.miner_1);
  assert.equal(simulation.canPlace(BUILDINGS.pole_1, tile).ok, true);
  tile.powerNode = createBuilding(BUILDINGS.pole_1);

  assert.equal(simulation.removePowerNode(tile).ok, true);
  assert.equal(tile.powerNode, null);
  assert.equal(tile.ore, "iron");
  assert.equal(tile.rail.type, "rail");
  assert.equal(tile.building.type, "miner");
});
