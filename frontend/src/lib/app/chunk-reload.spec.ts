import { describe, expect, it } from "vitest";
import { chunkReloadWindowMs, isChunkLoadError, shouldReloadForChunkError, type ReloadStore } from "@/lib/app/chunk-reload";

function memoryStore(): ReloadStore {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value) };
}

describe("chunk reload", () => {
  it("recognises stale-chunk errors from Chrome, Firefox, Safari and Vite", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/a.css"))).toBe(true);
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
  });

  it("reloads once per window so a real outage cannot loop", () => {
    const store = memoryStore();
    expect(shouldReloadForChunkError(store, 1_000_000)).toBe(true);
    expect(shouldReloadForChunkError(store, 1_000_000 + 5_000)).toBe(false);
    expect(shouldReloadForChunkError(store, 1_000_000 + chunkReloadWindowMs + 1)).toBe(true);
    expect(shouldReloadForChunkError(null, 1)).toBe(false);
  });
});
