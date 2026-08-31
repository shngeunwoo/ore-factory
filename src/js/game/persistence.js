import { BALANCE } from "../domain/recipes.js?v=37";

export const SAVE_KEY = "ore-factory.save.v2";
export const LEGACY_SAVE_KEY = "ore-factory.save";
export const SAVE_VERSION = 2;
export const SAVE_CODE_PREFIX = "OF2";
export const SAVE_CODE_FILE_MAX_BYTES = 2 * 1024 * 1024;

export function makeSave(store, world) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    game: store.snapshot(),
    world: world.snapshot(),
  };
}

function checksum(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function encodeBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSaveCode(save) {
  const json = JSON.stringify(save);
  return `${SAVE_CODE_PREFIX}.${checksum(json)}.${encodeBase64Url(json)}`;
}

export function saveCodeFileName(date = new Date()) {
  const stamp = date.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `ore-factory-${stamp}.txt`;
}

export function normalizeSaveCodeText(text) {
  return String(text || "").replace(/^\uFEFF/, "").trim();
}

export function decodeSaveCodeFile(text, byteLength = 0) {
  if (Number(byteLength) > SAVE_CODE_FILE_MAX_BYTES) return { ok: false, reason: "code-file-size" };
  return decodeSaveCode(normalizeSaveCodeText(text));
}

export function decodeSaveCode(code) {
  try {
    const normalized = normalizeSaveCodeText(code).replace(/\s+/g, "");
    const [prefix, expectedChecksum, payload, ...extra] = normalized.split(".");
    if (prefix !== SAVE_CODE_PREFIX || !expectedChecksum || !payload || extra.length) {
      return { ok: false, reason: "code-format" };
    }
    const json = decodeBase64Url(payload);
    if (checksum(json) !== expectedChecksum) return { ok: false, reason: "code-checksum" };
    return parseSave(json);
  } catch {
    return { ok: false, reason: "code-corrupt" };
  }
}

export function parseSave(raw) {
  if (!raw) return { ok: false, reason: "empty" };
  try {
    const data = JSON.parse(raw);
    if (data?.version !== SAVE_VERSION) return { ok: false, reason: "version" };
    if (!data.game || !data.world) return { ok: false, reason: "shape" };
    const bounds = data.world.bounds;
    const tiles = data.world.tiles;
    if (
      !bounds ||
      ![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite) ||
      bounds.maxX < bounds.minX ||
      bounds.maxY < bounds.minY ||
      !Array.isArray(tiles)
    ) {
      return { ok: false, reason: "shape" };
    }
    const expected = (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
    const coordinates = new Set();
    for (const tile of tiles) {
      if (
        !Number.isFinite(tile?.x) ||
        !Number.isFinite(tile?.y) ||
        tile.x < bounds.minX ||
        tile.x > bounds.maxX ||
        tile.y < bounds.minY ||
        tile.y > bounds.maxY
      ) {
        return { ok: false, reason: "shape" };
      }
      coordinates.add(`${tile.x},${tile.y}`);
    }
    if (tiles.length !== expected || coordinates.size !== expected) return { ok: false, reason: "shape" };
    const { shopOrigin, shopStep } = BALANCE.map;
    const minShopX = Math.ceil((bounds.minX + 1 - shopOrigin) / shopStep);
    const maxShopX = Math.floor((bounds.maxX - 1 - shopOrigin) / shopStep);
    const minShopY = Math.ceil((bounds.minY + 1 - shopOrigin) / shopStep);
    const maxShopY = Math.floor((bounds.maxY - 1 - shopOrigin) / shopStep);
    const byCoordinate = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
    for (let shopY = minShopY; shopY <= maxShopY; shopY += 1) {
      for (let shopX = minShopX; shopX <= maxShopX; shopX += 1) {
        const cx = shopOrigin + shopX * shopStep;
        const cy = shopOrigin + shopY * shopStep;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (byCoordinate.get(`${cx + dx},${cy + dy}`)?.building?.type !== "shop") {
              return { ok: false, reason: "shape" };
            }
          }
        }
      }
    }
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "corrupt" };
  }
}

export const STORED_SAVE_KEYS = Object.freeze([SAVE_KEY, LEGACY_SAVE_KEY]);

export function purgeStoredSaves(...storages) {
  let removed = 0;
  storages.forEach((storage) => {
    if (!storage) return;
    try {
      STORED_SAVE_KEYS.forEach((key) => {
        if (storage.getItem(key) == null) return;
        storage.removeItem(key);
        removed += 1;
      });
    } catch {
      // Browser storage may be blocked. Memory game still runs.
    }
  });
  return removed;
}
