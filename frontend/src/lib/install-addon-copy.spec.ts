import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bs from "@/i18n/locales/bs/common.json";
import en from "@/i18n/locales/en/common.json";
import { installAddonCopyKeys } from "./install-addon-copy";

// Every addon the backend offers must have a translated label and description;
// otherwise settings show the raw key (as happened with "problems").
const catalog = readFileSync(resolve(__dirname, "../../../backend/src/modules/settings/addon-catalog.ts"), "utf8");
const backendAddonKeys = [...catalog.matchAll(/key: '([a-zA-Z]+)'/g)].map((match) => match[1]);

function lookup(locale: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], locale);
}

describe("install addon copy", () => {
  it("covers every backend addon in both languages", () => {
    expect(backendAddonKeys.length).toBeGreaterThan(10);
    for (const key of backendAddonKeys) {
      const copy = (installAddonCopyKeys as Record<string, { label: string; description: string }>)[key];
      expect(copy, key).toBeDefined();
      for (const locale of [bs, en]) {
        expect(typeof lookup(locale, copy.label), `${key} label`).toBe("string");
        expect(typeof lookup(locale, copy.description), `${key} description`).toBe("string");
      }
    }
  });
});
