import test from "node:test";
import assert from "node:assert/strict";
import { BUILDINGS } from "../src/js/domain/recipes.js";
import { createBuilding } from "../src/js/game/buildings.js";
import { clearTiles, setup } from "./helpers.js";

test("상점과 무관한 수동 레일이 화물을 운송한다", () => {
  const { world, simulation } = setup();
  const left = world.get(0, 0);
  const right = world.get(1, 0);
  clearTiles(left, right);
  left.rail = createBuilding(BUILDINGS.rail_1);
  right.rail = createBuilding(BUILDINGS.rail_1);
  simulation.setRailOutput(left, "e");
  left.cargo = { type: "iron" };
  assert.equal(simulation.tryMoveRail(left), true);
  assert.equal(right.cargo.type, "iron");
  assert.equal(right.cargo.enteredFrom, "w");
});

test("연결 출구가 없는 화물은 바닥 스택으로 떨어지고 클릭 수집된다", () => {
  const { store, world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.cargo = { type: "gold" };
  const before = store.count("gold");
  assert.equal(simulation.tryMoveRail(tile), true);
  assert.deepEqual(tile.groundItems, [{ type: "gold", amount: 1 }]);
  assert.equal(simulation.pickupGroundItems(tile), 1);
  assert.equal(store.count("gold"), before + 1);
  assert.deepEqual(tile.groundItems, []);
});

test("AUTO는 진입 반대편 직진을 우선한다", () => {
  const { world, simulation } = setup();
  const west = world.get(0, 1);
  const center = world.get(1, 1);
  const east = world.get(2, 1);
  const south = world.get(1, 2);
  clearTiles(west, center, east, south);
  [west, center, east, south].forEach((tile) => {
    tile.rail = createBuilding(BUILDINGS.rail_1);
  });
  center.cargo = { type: "copper", enteredFrom: "w" };
  assert.equal(simulation.railFlow(center).direction, "e");
});

test("채굴기는 지정한 방향의 레일로만 배출한다", () => {
  const { world, simulation } = setup();
  const west = world.get(0, 1);
  const miner = world.get(1, 1);
  const east = world.get(2, 1);
  clearTiles(west, miner, east);
  west.rail = createBuilding(BUILDINGS.rail_1);
  east.rail = createBuilding(BUILDINGS.rail_1);
  miner.building = createBuilding(BUILDINGS.miner_1);
  miner.building.queue.push("iron");

  assert.equal(simulation.setMinerOutput(miner, "e"), true);
  assert.equal(simulation.flushMiner(miner), true);
  assert.equal(east.cargo.type, "iron");
  assert.equal(west.cargo, null);
  assert.ok(simulation.railLinkedDirections(east).includes("w"));
  assert.ok(!simulation.railLinkedDirections(west).includes("e"));
});

test("채굴기 지정 출력 레일이 차 있으면 바닥에 버리지 않고 대기한다", () => {
  const { world, simulation } = setup();
  const miner = world.get(1, 1);
  const east = world.get(2, 1);
  clearTiles(miner, east);
  east.rail = createBuilding(BUILDINGS.rail_1);
  east.cargo = { type: "coal" };
  miner.building = createBuilding(BUILDINGS.miner_1);
  miner.building.output = "e";
  miner.building.queue.push("gold");

  assert.equal(simulation.flushMiner(miner), false);
  assert.deepEqual(miner.building.queue, ["gold"]);
  assert.deepEqual(miner.groundItems, []);
});

test("인라인 화로는 석탄과 원광 화물을 흡수해 주괴를 재출발시킨다", () => {
  const { world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.building = createBuilding(BUILDINGS.furnace);
  tile.cargo = { type: "coal", enteredFrom: "w" };
  simulation.update(0);
  assert.equal(tile.building.coal, 1);
  tile.cargo = { type: "iron", enteredFrom: "w" };
  simulation.update(0);
  simulation.update(3);
  simulation.update(0);
  assert.equal(tile.cargo.type, "iron_ingot");
});

test("제련할 수 없는 화물은 설정에 따라 화로에서 정체된다", () => {
  const { world, simulation } = setup();
  const furnace = world.get(1, 1);
  const east = world.get(2, 1);
  clearTiles(furnace, east);
  furnace.rail = createBuilding(BUILDINGS.rail_1);
  furnace.building = createBuilding(BUILDINGS.furnace);
  east.rail = createBuilding(BUILDINGS.rail_1);
  simulation.setRailOutput(furnace, "e");
  furnace.cargo = { type: "iron_ingot", enteredFrom: "w" };

  simulation.update(1);
  assert.equal(furnace.cargo.type, "iron_ingot");
  assert.equal(simulation.tileStatus(furnace).label, "제련 불가 화물 정체");

  simulation.setFurnaceBlocking(furnace, false);
  simulation.update(1);
  assert.equal(furnace.cargo, null);
  assert.equal(east.cargo.type, "iron_ingot");
});

test("화로가 생산한 주괴는 정체 설정이 켜져도 출발한다", () => {
  const { world, simulation } = setup();
  const furnace = world.get(1, 1);
  const east = world.get(2, 1);
  clearTiles(furnace, east);
  furnace.rail = createBuilding(BUILDINGS.rail_1);
  furnace.building = createBuilding(BUILDINGS.furnace);
  furnace.cargo = { type: "copper_ingot", source: "furnace", enteredFrom: "w" };
  east.rail = createBuilding(BUILDINGS.rail_1);
  simulation.setRailOutput(furnace, "e");

  simulation.update(1);
  assert.equal(furnace.cargo, null);
  assert.equal(east.cargo.type, "copper_ingot");
});

test("필터 분배기는 방향마다 지정한 화물을 해당 출구로 보낸다", () => {
  const { world, simulation } = setup();
  const center = world.get(1, 1);
  const east = world.get(2, 1);
  const south = world.get(1, 2);
  clearTiles(center, east, south);
  [center, east, south].forEach((tile) => {
    tile.rail = createBuilding(BUILDINGS.rail_1);
  });
  center.building = createBuilding(BUILDINGS.router_1);
  simulation.setRouterRoute(center, "e", "iron");
  simulation.setRouterRoute(center, "s", "copper");
  center.cargo = { type: "iron" };
  assert.equal(simulation.railFlow(center).direction, "e");
  center.cargo = { type: "copper" };
  assert.equal(simulation.railFlow(center).direction, "s");
});

test("기존 단일 필터 분배기 설정은 방향별 설정으로 자동 변환된다", () => {
  const { world, simulation } = setup();
  const center = world.get(1, 1);
  const south = world.get(1, 2);
  clearTiles(center, south);
  center.rail = createBuilding(BUILDINGS.rail_1);
  south.rail = createBuilding(BUILDINGS.rail_1);
  center.building = createBuilding(BUILDINGS.router_1);
  delete center.building.routes;
  center.building.filter = "gold";
  center.building.filterOutput = "s";
  center.cargo = { type: "gold" };

  assert.equal(simulation.railFlow(center).direction, "s");
  assert.equal(center.building.routes.s, "gold");
});

test("창고는 지정 레일 화물을 저장한다", () => {
  const { world, simulation } = setup();
  const rail = world.get(0, 0);
  const storage = world.get(1, 0);
  clearTiles(rail, storage);
  rail.rail = createBuilding(BUILDINGS.rail_1);
  storage.building = createBuilding(BUILDINGS.storage_1);
  rail.cargo = { type: "silver" };
  simulation.setRailOutput(rail, "e");
  assert.equal(simulation.tryMoveRail(rail), true);
  assert.equal(storage.building.stacks.silver, 1);
});

test("화물 창고는 용량 제한 없이 보관하고 내용물을 전량 회수한다", () => {
  const { store, world, simulation } = setup();
  const source = world.get(0, 0);
  const storage = world.get(1, 0);
  clearTiles(source, storage);
  storage.building = createBuilding(BUILDINGS.storage_1);
  for (let count = 0; count < 250; count += 1) {
    assert.equal(simulation.acceptMachineCargo(storage, source, { type: "silver" }), true);
  }
  assert.equal(storage.building.stacks.silver, 250);
  const before = store.count("silver");
  assert.equal(simulation.takeStorageContents(storage), 250);
  assert.equal(store.count("silver"), before + 250);
  assert.deepEqual(storage.building.stacks, {});
});

test("레일 화물은 정체됐을 때만 수동 회수할 수 있다", () => {
  const { store, world, simulation } = setup();
  const source = world.get(0, 0);
  const target = world.get(1, 0);
  clearTiles(source, target);
  source.rail = createBuilding(BUILDINGS.rail_1);
  target.rail = createBuilding(BUILDINGS.rail_1);
  simulation.setRailOutput(source, "e");
  source.cargo = { type: "iron" };
  target.cargo = { type: "coal" };
  const before = store.count("iron");

  assert.equal(simulation.canPickupStoppedCargo(source), true);
  assert.equal(simulation.pickupStoppedCargo(source), 1);
  assert.equal(store.count("iron"), before + 1);

  source.cargo = { type: "iron" };
  target.cargo = null;
  assert.equal(simulation.canPickupStoppedCargo(source), false);
  assert.equal(simulation.pickupStoppedCargo(source), 0);
  assert.equal(source.cargo.type, "iron");
});

test("현장 업그레이드는 레일 설정과 화물을 보존한다", () => {
  const { store, world, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.rail.output = "s";
  tile.cargo = { type: "iron" };
  store.state.unlocked.rail_2 = true;
  store.refund(BUILDINGS.rail_2.craft, "test");
  assert.equal(simulation.upgrade(tile).ok, true);
  assert.equal(tile.rail.tier, 2);
  assert.equal(tile.rail.output, "s");
  assert.equal(tile.cargo.type, "iron");
});

test("인라인 설비와 아래 레일은 원하는 레이어만 따로 업그레이드한다", () => {
  const { store, world, power, simulation } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.building = createBuilding(BUILDINGS.furnace);
  store.state.unlocked.rail_2 = true;
  store.state.unlocked.furnace_2 = true;
  store.refund(BUILDINGS.rail_2.craft, "test");
  store.refund(BUILDINGS.furnace_2.craft, "test");
  power.dirty = false;

  assert.equal(simulation.upgrade(tile, "rail").ok, true);
  assert.equal(tile.rail.tier, 2);
  assert.equal(tile.building.tier, 1);
  assert.equal(power.dirty, true);

  assert.equal(simulation.upgrade(tile, "building").ok, true);
  assert.equal(tile.rail.tier, 2);
  assert.equal(tile.building.tier, 2);
});
