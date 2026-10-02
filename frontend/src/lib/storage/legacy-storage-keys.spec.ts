import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { legacyStorageKeys, migrateLegacyStorageKeys } from "./legacy-storage-keys";

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

function legacyKeyOf(current: string): string {
  const pair = legacyStorageKeys.find(([, next]) => next === current);
  if (!pair) throw new Error(`no legacy key for ${current}`);
  return pair[0];
}

describe("migrateLegacyStorageKeys", () => {
  it("moves old values to the new keys and removes the old ones", () => {
    const storage = memoryStorage({
      [legacyKeyOf("service-desk.theme.mode")]: "dark",
      [legacyKeyOf("service-desk.locale")]: "en",
    });
    migrateLegacyStorageKeys(storage);
    expect(Object.fromEntries(storage.data)).toEqual({ "service-desk.theme.mode": "dark", "service-desk.locale": "en" });
  });

  it("never overwrites a value already stored under the new key", () => {
    const storage = memoryStorage({
      [legacyKeyOf("service-desk.theme.mode")]: "dark",
      "service-desk.theme.mode": "light",
    });
    migrateLegacyStorageKeys(storage);
    expect(Object.fromEntries(storage.data)).toEqual({ "service-desk.theme.mode": "light" });
  });

  it("is mirrored by the pre-paint script in index.html", () => {
    const html = readFileSync(resolve(__dirname, "../../../index.html"), "utf8");
    for (const [legacy, current] of legacyStorageKeys) {
      expect(html).toContain(`["${legacy}", "${current}"]`);
    }
  });
});
