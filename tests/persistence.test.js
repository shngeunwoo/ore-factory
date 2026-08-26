import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_SAVE_KEY,
  SAVE_CODE_PREFIX,
  SAVE_KEY,
  SAVE_VERSION,
  decodeSaveCode,
  decodeSaveCodeFile,
  encodeSaveCode,
  makeSave,
  normalizeSaveCodeText,
  parseSave,
  purgeStoredSaves,
  saveCodeFileName,
  SAVE_CODE_FILE_MAX_BYTES,
} from "../src/js/game/persistence.js";
import { BUILDINGS } from "../src/js/domain/recipes.js";
import { createBuilding } from "../src/js/game/buildings.js";
import { clearTiles, setup } from "./helpers.js";

function memoryStorage() {
  const memory = new Map();
  return {
    memory,
    getItem: (key) => memory.get(key) || null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
}

test("v2 저장은 복합 타일과 바닥 스택을 보존한다", () => {
  const { store, world } = setup();
  const tile = world.get(0, 0);
  clearTiles(tile);
  tile.rail = createBuilding(BUILDINGS.rail_1);
  tile.building = createBuilding(BUILDINGS.furnace);
  tile.powerNode = createBuilding(BUILDINGS.pole_1);
  tile.cargo = { type: "iron", enteredFrom: "w" };
  tile.groundItems = [{ type: "coal", amount: 3 }];
  const save = makeSave(store, world);
  assert.equal(save.version, SAVE_VERSION);
  const parsed = parseSave(JSON.stringify(save));
  assert.equal(parsed.ok, true);
  const restored = parsed.data.world.tiles.find((entry) => entry.x === 0 && entry.y === 0);
  assert.equal(restored.rail.type, "rail");
  assert.equal(restored.building.type, "furnace");
  assert.equal(restored.powerNode.type, "pole");
  assert.equal(restored.cargo.type, "iron");
  assert.deepEqual(restored.groundItems, [{ type: "coal", amount: 3 }]);
});

test("기존 building 레이어의 전봇대는 복원 시 powerNode로 이동한다", () => {
  const { world } = setup();
  const snapshot = world.snapshot();
  const source = snapshot.tiles.find((tile) => tile.x === 0 && tile.y === 0);
  source.building = createBuilding(BUILDINGS.pole_1);
  source.powerNode = null;

  assert.equal(world.restore(snapshot), true);
  const restored = world.get(0, 0);
  assert.equal(restored.building, null);
  assert.equal(restored.powerNode.type, "pole");
});

test("휴대용 저장 코드는 왕복 복원되고 손상된 코드는 거부된다", () => {
  const { store, world } = setup();
  store.addMoney(123, "test");
  const code = encodeSaveCode(makeSave(store, world));
  assert.equal(code.startsWith(`${SAVE_CODE_PREFIX}.`), true);

  const decoded = decodeSaveCode(code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.data.game.money, store.money);
  assert.deepEqual(decoded.data.world.bounds, world.bounds());

  const index = code.length - 12;
  const replacement = code[index] === "A" ? "B" : "A";
  const damaged = `${code.slice(0, index)}${replacement}${code.slice(index + 1)}`;
  assert.equal(decodeSaveCode(damaged).ok, false);
  assert.equal(decodeSaveCode("not-a-save-code").reason, "code-format");
});

test("txt 저장 파일 이름은 시각을 쓰고 BOM·공백·과대 파일은 거른다", () => {
  assert.equal(
    saveCodeFileName(new Date("2026-08-27T01:02:03.000Z")),
    "ore-factory-2026-08-27-01-02-03.txt",
  );
  const { store, world } = setup();
  const code = encodeSaveCode(makeSave(store, world));
  const wrapped = `\uFEFF\n${code}\n`;
  assert.equal(normalizeSaveCodeText(wrapped), code);
  const decoded = decodeSaveCodeFile(wrapped, wrapped.length);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.data.game.money, store.money);
  assert.equal(decodeSaveCodeFile(code, SAVE_CODE_FILE_MAX_BYTES + 1).reason, "code-file-size");
});

test("v1 저장 JSON은 마이그레이션하지 않고 거부한다", () => {
  assert.deepEqual(parseSave(JSON.stringify({ version: 1 })), { ok: false, reason: "version" });
});

test("남은 브라우저 저장 키는 제거하고 다시 쓰지 않는다", () => {
  const storage = memoryStorage();
  storage.setItem(SAVE_KEY, "{}");
  storage.setItem(LEGACY_SAVE_KEY, "{}");
  assert.equal(purgeStoredSaves(storage), 2);
  assert.equal(storage.getItem(SAVE_KEY), null);
  assert.equal(storage.getItem(LEGACY_SAVE_KEY), null);
  assert.equal(purgeStoredSaves(storage), 0);
});
