import { describe, expect, it } from "vitest";
import bs from "@/i18n/locales/bs/common.json";
import en from "@/i18n/locales/en/common.json";
import { shortcutCatalog } from "./catalog";

function lookup(tree: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree);
}

describe("shortcut catalogue i18n", () => {
  it("every description and context label exists in bs and en", () => {
    for (const locale of [bs, en]) {
      for (const item of shortcutCatalog) {
        expect(typeof lookup(locale, item.descriptionKey), item.descriptionKey).toBe("string");
        expect(typeof lookup(locale, `a11y.shortcuts.contexts.${item.context}`)).toBe("string");
      }
    }
  });
});
