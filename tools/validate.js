#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BALANCE,
  BUILDINGS,
  CRAFT_ORDER,
  INGOT_IDS,
  ITEMS,
  MINE_TIME,
  ORE_IDS,
  ORE_TO_INGOT,
  SELL,
} from "../src/js/domain/recipes.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const required = [
  "index.html",
  "package.json",
  "AGENTS.md",
  "docs/manual/index.md",
  "src/css/style.css",
  "src/css/tokens.css",
  "src/css/layout.css",
  "src/css/game.css",
  "src/assets/buildings/core-machines.png",
  "src/assets/buildings/core-machines-t2.png",
  "src/assets/buildings/core-machines-t3.png",
  "src/assets/buildings/LICENSE.txt",
  "src/js/domain/recipes.js",
  "src/js/game/inventory.js",
  "src/js/game/map.js",
  "src/js/game/buildings.js",
  "src/js/game/power.js",
  "src/js/game/progression.js",
  "src/js/game/persistence.js",
  "src/js/ui/map-view.js",
  "src/js/ui/fx.js",
  "src/js/ui/panels.js",
  "src/js/ui/main.js",
  "tests/game.test.js",
  "tests/helpers.js",
  "tests/logistics.test.js",
  "tests/progression-power.test.js",
  "tests/persistence.test.js",
];
let failed = false;

function fail(message) {
  console.error(`error: ${message}`);
  failed = true;
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

required.forEach((relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) fail(`missing ${relativePath}`);
});

const html = read("index.html");
if (!/<script\s+type="module"\s+src="src\/js\/ui\/main\.js\?v=(\d+)"/.test(html)) {
  fail("index.html must load ui/main.js as the only module entry");
}
if (!/<link\s+rel="stylesheet"\s+href="src\/css\/style\.css\?v=(\d+)"/.test(html)) {
  fail("index.html must load src/css/style.css");
}
const scriptVersion = html.match(/main\.js\?v=(\d+)/)?.[1];
const styleVersion = html.match(/style\.css\?v=(\d+)/)?.[1];
if (scriptVersion !== styleVersion) fail("CSS and JS cache versions differ");
if (html.includes(".claude") || html.includes("window.OF")) fail("entry references a forbidden legacy path/global");

const sourceFiles = required.filter((relativePath) => relativePath.startsWith("src/js/"));
for (const relativePath of sourceFiles) {
  const source = read(relativePath);
  const directory = path.dirname(path.join(root, relativePath));
  const importPattern = /from\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    if (!match[1].startsWith(".")) continue;
    const imported = path.resolve(directory, match[1].replace(/[?#].*$/, ""));
    if (!fs.existsSync(imported)) fail(`${relativePath} imports missing ${match[1]}`);
  }
  if (source.includes("window.OF")) fail(`${relativePath} uses legacy window.OF`);
  if (relativePath.includes(`${path.posix.sep}game${path.posix.sep}`) || relativePath.includes("src/js/game/")) {
    if (/\b(document|HTMLElement|querySelector)\b/.test(source)) fail(`${relativePath} game layer touches DOM`);
    if (/from\s+["'][^"']*\/ui\//.test(source)) fail(`${relativePath} game layer imports UI`);
  }
  if (relativePath.includes("src/js/domain/")) {
    if (/\b(document|window|localStorage)\b/.test(source)) fail(`${relativePath} domain layer touches runtime APIs`);
    if (/from\s+["'][^"']*\/(game|ui)\//.test(source)) fail(`${relativePath} domain imports an upper layer`);
  }
}

for (const id of CRAFT_ORDER) {
  if (!BUILDINGS[id]) fail(`CRAFT_ORDER references missing building ${id}`);
}
for (const item of ITEMS) {
  if (!Object.hasOwn(SELL, item.id)) fail(`SELL missing ${item.id}`);
}
for (const ore of ORE_IDS) {
  if (!Object.hasOwn(MINE_TIME, ore)) fail(`MINE_TIME missing ${ore}`);
}
for (const ingot of INGOT_IDS) {
  if (!Object.values(ORE_TO_INGOT).includes(ingot)) fail(`ORE_TO_INGOT missing output ${ingot}`);
}
for (const id of Object.keys(BALANCE.research.labCostPerPoint)) {
  if (!Object.hasOwn(BALANCE.research.labBufferCap, id)) fail(`labBufferCap missing ${id}`);
  if (BALANCE.research.labBufferCap[id] < BALANCE.research.labCostPerPoint[id]) {
    fail(`labBufferCap ${id} smaller than labCostPerPoint`);
  }
}

const styleEntry = read("src/css/style.css");
["tokens.css", "layout.css", "game.css"].forEach((file) => {
  if (!styleEntry.includes(file)) fail(`style.css missing ${file} import`);
});

if (failed) process.exit(1);
console.log(`ok: ${required.length} files, ${sourceFiles.length} modules, domain keys consistent`);
