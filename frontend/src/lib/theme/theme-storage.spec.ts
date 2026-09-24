import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_ACCENT,
  DEFAULT_THEME_DESIGN,
  DEFAULT_THEME_MODE,
  isDarkAppearance,
  isThemeDesign,
  isThemeAccent,
  isThemeMode,
  resolveColorMode,
  THEME_ACCENTS,
} from "@/lib/theme/theme-storage";

describe("theme-storage", () => {
  it("defaults to the new identity in system mode", () => {
    expect(DEFAULT_THEME_DESIGN).toBe("pulse");
    expect(DEFAULT_THEME_MODE).toBe("system");
  });

  it("validates persisted values before trusting them", () => {
    expect(isThemeDesign("pulse")).toBe(true);
    expect(isThemeDesign("classic")).toBe(true);
    expect(isThemeDesign("dark")).toBe(false);
    expect(isThemeDesign(null)).toBe(false);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("pulse")).toBe(false);
  });

  it("resolves the explicit modes for the new identity", () => {
    expect(resolveColorMode("pulse", "light", true)).toBe("light");
    expect(resolveColorMode("pulse", "dark", false)).toBe("dark");
  });

  it("follows the OS preference in system mode", () => {
    expect(resolveColorMode("pulse", "system", true)).toBe("dark");
    expect(resolveColorMode("pulse", "system", false)).toBe("light");
  });

  it("keeps the legacy design permanently dark", () => {
    expect(resolveColorMode("classic", "light", false)).toBe("dark");
    expect(isDarkAppearance("classic", "light")).toBe(true);
  });

  it("offers six brand palettes", () => {
    expect(THEME_ACCENTS).toEqual(["indigo", "teal", "rose", "cyan", "amber", "orange"]);
    expect(DEFAULT_THEME_ACCENT).toBe("indigo");
    expect(THEME_ACCENTS).toContain(DEFAULT_THEME_ACCENT);
  });

  it("validates the persisted palette the same way as the other axes", () => {
    expect(isThemeAccent("indigo")).toBe(true);
    expect(isThemeAccent("teal")).toBe(true);
    expect(isThemeAccent("rose")).toBe(true);
    expect(isThemeAccent("cyan")).toBe(true);
    expect(isThemeAccent("amber")).toBe(true);
    expect(isThemeAccent("orange")).toBe(true);
    expect(isThemeAccent("pulse")).toBe(false);
    expect(isThemeAccent("")).toBe(false);
    expect(isThemeAccent(null)).toBe(false);
  });

  it("sets the dark class only for dark appearances", () => {
    expect(isDarkAppearance("pulse", "dark")).toBe(true);
    expect(isDarkAppearance("pulse", "light")).toBe(false);
  });
});
