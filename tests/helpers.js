import { EventBus, GameStore } from "../src/js/game/inventory.js";
import { World } from "../src/js/game/map.js";
import { FactorySimulation } from "../src/js/game/buildings.js";
import { PowerSystem } from "../src/js/game/power.js";
import { ProgressionSystem } from "../src/js/game/progression.js";

export function setup() {
  const bus = new EventBus();
  const store = new GameStore(bus);
  const world = new World(bus, store);
  const power = new PowerSystem(bus, store, world);
  const progression = new ProgressionSystem(bus, store, world, power);
  const simulation = new FactorySimulation(bus, store, world, power);
  return { bus, store, world, power, progression, simulation };
}

export function clearTiles(...tiles) {
  tiles.forEach((tile) => {
    tile.ore = null;
    tile.rail = null;
    tile.building = null;
    tile.powerNode = null;
    tile.cargo = null;
    tile.groundItems = [];
  });
}
