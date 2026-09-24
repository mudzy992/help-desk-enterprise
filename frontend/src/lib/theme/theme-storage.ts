/**
 * Pulse Design System — theme contract.
 *
 * Three orthogonal axes decide what the application looks like:
 *
 *   design : "pulse"   → new identity (see `.cursor/docs/theme.md`)
 *            "classic" → legacy dark theme, kept available during rollout
 *   mode   : "light" | "dark" | "system"
 *   accent : "indigo"  → the brand palette inside the `pulse` design
 *            "teal" / "rose" / "cyan" / "amber" / "orange"
 *
 * `accent` rotates only the brand colours (primary family, ring, links,
 * selection, primary glow) — see the palette blocks in `src/index.css`. It has
 * no effect on `classic`, so it is intentionally ignored there.
 *
 * `classic` is inherently dark, so `isDarkAppearance()` forces dark for it
 * regardless of `mode`. Everything UI-facing is derived from this file, which
 * keeps the provider, the switcher and the pre-paint script in `index.html`
 * from drifting apart.
 */

export type ThemeDesign = "pulse" | "classic";
export type ThemeMode = "light" | "dark" | "system";
export type ThemeAccent = "indigo" | "teal" | "rose" | "cyan" | "amber" | "orange";
export type ResolvedColorMode = "light" | "dark";

export const THEME_DESIGN_STORAGE_KEY = "ep-helpdesk.theme.design";
export const THEME_MODE_STORAGE_KEY = "ep-helpdesk.theme.mode";
export const THEME_ACCENT_STORAGE_KEY = "ep-helpdesk.theme.accent";

/**
 * Rollout switch. The new identity ships as the default; flip this to
 * `"classic"` for a pilot week, or read it from the settings registry later.
 */
export const DEFAULT_THEME_DESIGN: ThemeDesign = "pulse";
export const DEFAULT_THEME_MODE: ThemeMode = "system";
export const DEFAULT_THEME_ACCENT: ThemeAccent = "indigo";

export const THEME_DESIGNS: readonly ThemeDesign[] = ["pulse", "classic"];
export const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];
export const THEME_ACCENTS: readonly ThemeAccent[] = [
  "indigo",
  "teal",
  "rose",
  "cyan",
  "amber",
  "orange",
];

export function isThemeDesign(value: unknown): value is ThemeDesign {
  return value === "pulse" || value === "classic";
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function isThemeAccent(value: unknown): value is ThemeAccent {
  return (
    value === "indigo" ||
    value === "teal" ||
    value === "rose" ||
    value === "cyan" ||
    value === "amber" ||
    value === "orange"
  );
}

export function resolveColorMode(
  design: ThemeDesign,
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ResolvedColorMode {
  if (design === "classic") {
    return "dark";
  }
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  return mode;
}

/** `true` when the `.dark` class must sit on `<html>` (drives `dark:` variants). */
export function isDarkAppearance(
  design: ThemeDesign,
  resolvedMode: ResolvedColorMode,
): boolean {
  return design === "classic" || resolvedMode === "dark";
}
