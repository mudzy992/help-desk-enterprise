#!/usr/bin/env node
/**
 * WCAG 2.1 kontrast audit za sve Pulse palete (light + dark) i classic.
 * Čita tokene direktno iz src/index.css, pa ne može zastarjeti.
 *
 *   node frontend/scripts/contrast-audit.mjs          # tabela, izlaz 1 ako nešto < 4.5
 *   node frontend/scripts/contrast-audit.mjs --fails  # samo padovi
 *
 * Provjerava (normalan tekst, prag 4.5:1):
 *   - primary-foreground na primary / primary-hover / primary-active (dugmad)
 *   - primary kao tekst (text-primary) na background / surface / elevated
 *   - link na background / surface / elevated
 *   - muted tekst na background / surface / elevated
 */
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const blocks = {};
for (const m of css.matchAll(/(:root[^{]*)\{([^}]*)\}/g)) {
  const vars = {};
  for (const v of m[2].matchAll(/--([\w-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) vars[v[1]] = [+v[2], +v[3], +v[4]];
  blocks[m[1].trim()] = { ...(blocks[m[1].trim()] ?? {}), ...vars };
}
const pick = (sel) => blocks[sel] ?? {};
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const base = { light: pick(':root[data-theme="pulse"]'), dark: pick(':root[data-theme="pulse"].dark') };
const accents = ["indigo", "teal", "rose", "cyan", "amber", "orange"];
const themes = [];
for (const a of accents) for (const mode of ["light", "dark"]) {
  const sel = `:root[data-theme="pulse"][data-accent="${a}"]${mode === "dark" ? ".dark" : ""}`;
  themes.push({ name: `pulse/${a}/${mode}`, t: { ...base[mode], ...pick(sel) } });
}
const classic = Object.entries(blocks).find(([s]) => s === ":root" || s.includes('"classic"'));
if (classic) themes.push({ name: "classic/dark", t: classic[1] });

const checks = [
  ...["primary", "primary-hover", "primary-active"].map((bg) => ["primary-foreground", bg]),
  ...["background", "surface", "elevated", "card"].flatMap((bg) => [["primary", bg], ["link", bg], ["muted", bg]]),
];
const onlyFails = process.argv.includes("--fails");
let fails = 0;
for (const { name, t } of themes) for (const [fg, bg] of checks) {
  if (!t[fg] || !t[bg]) continue;
  const r = ratio(t[fg], t[bg]);
  const ok = r >= 4.5;
  if (!ok) fails++;
  if (!onlyFails || !ok) console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(20)} ${fg.padEnd(19)} on ${bg.padEnd(15)} ${r.toFixed(2)}:1`);
}
console.log(`\n${fails} pad(ova) ispod 4.5:1`);
process.exitCode = fails ? 1 : 0;
