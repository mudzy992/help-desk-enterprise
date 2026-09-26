import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bosnian from "@/i18n/locales/bs/common.json";
import english from "@/i18n/locales/en/common.json";

/*
  Every backend setting key must have a description in both locales,
  otherwise the settings drawer shows the raw key (found in paket 1.8).
*/
const settingKeysSource = readFileSync(
  resolve(__dirname, "../../../backend/src/modules/settings/setting-keys.ts"),
  "utf8",
);
const backendKeys = [
  ...new Set(
    [...settingKeysSource.matchAll(/'((?:private|public)\.[A-Za-z0-9_.]+)'/g)].map((match) => match[1]),
  ),
].sort();

describe("settings registry i18n", () => {
  it.each([
    ["bs", bosnian.settings.registry.keys],
    ["en", english.settings.registry.keys],
  ] as const)("%s describes every backend setting key", (_locale, catalog) => {
    const missing = backendKeys.filter((key) => !(key in catalog));
    expect(missing).toEqual([]);
  });
});
