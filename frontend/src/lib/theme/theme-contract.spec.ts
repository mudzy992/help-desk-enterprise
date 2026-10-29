import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_DESIGN,
  DEFAULT_THEME_MODE,
  THEME_ACCENTS,
  THEME_ACCENT_STORAGE_KEY,
  THEME_DESIGNS,
  THEME_DESIGN_STORAGE_KEY,
  THEME_MODES,
  THEME_MODE_STORAGE_KEY,
} from "./theme-storage";

const prePaint = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

describe("theme pre-paint contract", () => {
  it("mirrors storage keys, allowed values and defaults", () => {
    for (const key of [
      THEME_DESIGN_STORAGE_KEY,
      THEME_MODE_STORAGE_KEY,
      THEME_ACCENT_STORAGE_KEY,
    ]) {
      expect(prePaint).toContain(key);
    }
    for (const value of [...THEME_DESIGNS, ...THEME_MODES, ...THEME_ACCENTS]) {
      expect(prePaint).toContain(`!== "${value}"`);
    }
    expect(prePaint).toContain(`design = "${DEFAULT_THEME_DESIGN}"`);
    expect(prePaint).toContain(`mode = "${DEFAULT_THEME_MODE}"`);
    expect(prePaint).toContain(`accent = "${DEFAULT_THEME_ACCENT}"`);
  });
});
