#!/usr/bin/env node
/**
 * Guards the „Aurora“ wizard against the two failures that no other check can
 * see — both were found by hand on 2026-10-16, and both are silent by nature:
 *
 *   node scripts/check-install-aurora.mjs
 *
 *   A. CONTRAST of the palette in `frontend/src/styles/install-*.css`.
 *      The canvas is an animated aurora, so "the" background is a range, not a
 *      colour. The guard derives the worst pixel the backdrop can paint from the
 *      `.iw-backdrop` radial layers themselves (in CSS paint order, over the
 *      canvas base), composites the panel and the HUD over it, and requires the
 *      pairs that are really rendered together to hold WCAG AA (4.5:1).
 *      It also recomputes the table written in the CSS comment: a number nobody
 *      re-derives is how the first version shipped muted text at 2.9:1.
 *
 *   B. SHIM COVERAGE of `install-shim.css`. Every install step is built from the
 *      app's semantic utility classes (`text-muted-foreground`, `bg-popover`,
 *      `border-line-strong`, …). The shim re-points them at the Aurora palette;
 *      a class the shim does not know silently paints with the *product's*
 *      tokens — legible, on-brand for the wrong brand, and invisible to tests,
 *      lint and TypeScript. This check reads the install flow's own source and
 *      fails on the first class that has no rule.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const styles = join(root, "frontend/src/styles");
const read = (name) => readFileSync(join(styles, name), "utf8");
const theme = read("install-theme.css");
const scenes = read("install-scenes.css");
const shim = read("install-shim.css");
const failures = [];

/* ── A. contrast ───────────────────────────────────────────────────────────── */

const toLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
const ratio = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
const over = (colour, alpha, background) =>
  colour.map((channel, index) => alpha * channel + (1 - alpha) * background[index]);
const rule = (source, selector) => source.match(new RegExp(`${selector}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
const alphaOf = (body, pattern) => Number(body?.match(pattern)?.[1] ?? 0);

/** `--iw-name: 1 2 3;` → `{ name: [1, 2, 3] }` */
function readTokens(css) {
  const block = css.match(/\[data-install-theme="aurora"\]\s*\{([\s\S]*?)\n\}/);
  const tokens = {};
  for (const [, name, value] of block?.[1].matchAll(
    /--iw-([a-z0-9-]+):\s*([\d]+ [\d]+ [\d]+)\s*;/g,
  ) ?? []) {
    tokens[name] = value.split(/\s+/).map(Number);
  }
  return tokens;
}

/**
 * The backdrop's own layers, read from the CSS: `radial-gradient(…, rgb(var(
 * --iw-x) / alpha), transparent …)`. CSS paints the *first* listed layer on top,
 * so walking the list backwards from the canvas base is the real stacking order.
 */
function worstPixel(body, tokens, base) {
  const layers = [...(body ?? "").matchAll(/rgb\(var\(--iw-([a-z0-9-]+)\)\s*\/\s*([\d.]+)\)/g)].map(
    ([, token, alpha]) => ({ colour: tokens[token], alpha: Number(alpha) }),
  );
  if (layers.length === 0 || base === undefined) return null;
  let pixel = base;
  for (const layer of layers.reverse()) pixel = over(layer.colour, layer.alpha, pixel);
  return pixel.map(Math.round);
}

const tokens = readTokens(theme);
const canvas = worstPixel(rule(theme, "\\.iw-backdrop"), tokens, tokens["void"]);
const panelBody = rule(theme, "\\.iw-panel");
const panelAlpha = alphaOf(
  panelBody,
  /background-color:\s*rgb\(var\(--iw-panel\)\s*\/\s*([\d.]+)\)/,
);
const panelSheen = alphaOf(panelBody, /linear-gradient\(\s*180deg,\s*rgb\(var\(--iw-glass\)\s*\/\s*([\d.]+)\)/);
const hudAlpha = alphaOf(
  rule(scenes, "\\.iw-hud"),
  /background-color:\s*rgb\(var\(--iw-void\)\s*\/\s*([\d.]+)\)/,
);

if (canvas === null || tokens["ink"] === undefined || panelBody === undefined) {
  failures.push("A. could not read the aurora tokens, the backdrop layers or `.iw-panel`");
}
// The panel's own bug, made unforgettable: glass without a base left muted text
// at 2.9:1 over the aurora, and nothing failed. Below 0.8 the base is not opaque
// enough to hold a contrast floor.
if (panelAlpha < 0.8) {
  failures.push(
    `A. .iw-panel must keep an opaque base (now ${panelAlpha}); glass alone cannot hold AA over the aurora`,
  );
}

const measured = [];
const documented = [];
if (canvas !== null && panelBody !== undefined) {
  const glass = tokens["glass"] ?? [255, 255, 255];
  const panel = over(glass, panelSheen, over(tokens["panel"], panelAlpha, canvas));
  const hud = over(tokens["void"], hudAlpha, canvas);
  const rows = [
    ["panel · ink", tokens["ink"], panel],
    ["panel · ink-soft", tokens["ink-soft"], panel],
    ["panel · ink-dim", tokens["ink-dim"], panel],
    ["panel · cyan", tokens["cyan"], panel],
    ["panel · mint", tokens["mint"], panel],
    ["panel · violet", tokens["violet"], panel],
    ["panel · amber", tokens["amber"], panel],
    ["panel · danger", tokens["danger"], panel],
    ["hud · ink", tokens["ink"], hud],
    ["hud · ink-soft", tokens["ink-soft"], hud],
    ["hud · ink-dim", tokens["ink-dim"], hud],
  ];
  for (const [label, foreground, background] of rows) {
    if (foreground === undefined || background === undefined) continue;
    const value = ratio(foreground, background);
    measured.push({ label, value, background });
    if (value < 4.5) failures.push(`A. ${label} is ${value.toFixed(2)}:1, below AA (4.5:1)`);
  }

  // The comment's own table, recomputed row by row — panel, HUD and the CTA:
  // `ink  236 240 255  12.6 : 1` and `10.6 : 1 on cyan`. The *rule*, not the
  // phrase, because the comment above mentions the attribute too.
  const comment = theme.slice(0, theme.search(/\[data-install-theme="aurora"\]\s*\{/));
  const tables = [
    ["panel", comment.slice(comment.indexOf("--iw-panel"), comment.indexOf("HUD over")), panel],
    ["HUD", comment.slice(comment.indexOf("HUD over"), comment.indexOf("CTA gradient")), hud],
  ];
  for (const [surface, table, background] of tables) {
    for (const [, r, g, b, value] of table.matchAll(/(\d+) (\d+) (\d+)\s+([\d.]+) : 1/g)) {
      const colour = [Number(r), Number(g), Number(b)];
      const computed = ratio(colour, background);
      documented.push({ surface, value: Number(value), computed });
      if (Math.abs(Number(value) - computed) > 0.15) {
        failures.push(
          `A. the comment documents ${value}:1 for rgb(${r} ${g} ${b}) on the ${surface}, but it is ${computed.toFixed(1)}:1`,
        );
      }
    }
  }
  // The HUD rows carry no colour triple — they are named tokens.
  const hudTable = comment.slice(comment.indexOf("HUD over"), comment.indexOf("CTA gradient"));
  for (const [, name, value] of hudTable.matchAll(/([a-z-]+) ([\d.]+) : 1/g)) {
    const foreground = tokens[name];
    const computed = foreground === undefined ? null : ratio(foreground, hud);
    documented.push({ surface: `HUD/${name}`, value: Number(value), computed });
    if (computed !== null && Math.abs(Number(value) - computed) > 0.15) {
      failures.push(
        `A. the comment documents ${value}:1 for ${name} on the HUD, but it is ${computed.toFixed(1)}:1`,
      );
    }
  }
  const cta = comment.slice(comment.indexOf("CTA gradient"));
  for (const [, value, token] of cta.matchAll(/([\d.]+) : 1 on ([a-z]+)/g)) {
    const accent = tokens[token];
    const computed = accent === undefined ? null : ratio(tokens["ink-on-accent"], accent);
    documented.push({ surface: `CTA/${token}`, value: Number(value), computed });
    if (computed !== null && Math.abs(Number(value) - computed) > 0.15) {
      failures.push(
        `A. the comment documents ${value}:1 for ink-on-accent on ${token}, but it is ${computed.toFixed(1)}:1`,
      );
    }
  }
  if (documented.length < 10) {
    failures.push(`A. only ${documented.length} contrast rows found in install-theme.css — the table is gone`);
  }
  const floor = Math.min(...measured.map((row) => row.value));
  console.log(
    `A. worst canvas pixel rgb(${canvas.join(", ")}); panel floor ${floor.toFixed(1)}:1 · ` +
      `ink ${ratio(tokens["ink"], panel).toFixed(1)}:1 · ${documented.length} documented row(s) recomputed`,
  );
}

/* ── B. shim coverage ──────────────────────────────────────────────────────── */

/** Classes that carry a product token: a shim gap changes the *brand*, silently. */
const tokenClass =
  /\b((?:[a-z-]+:)*)(?:text|bg|border|outline|ring|divide|fill|from|via|to)-(foreground|muted-foreground|primary|primary-foreground|surface|surface-hover|border|line|line-strong|ok|danger|warning|info|link|success|popover|popover-foreground|scrim|elevated|background)((?:\/\d+)?)\b/g;

const sources = [
  "frontend/src/components/install",
  "frontend/src/components/visual-qa/visual-qa-install-board.tsx",
  "frontend/src/components/visual-qa/install-aurora-fixtures.ts",
  "frontend/src/pages/install-page.tsx",
  "frontend/src/pages/install-preview-page.tsx",
  "frontend/src/lib/install",
];

function walk(path, files = []) {
  const absolute = join(root, path);
  if (statSync(absolute).isFile()) {
    if (/\.tsx?$/.test(absolute) && !/\.spec\.tsx?$/.test(absolute)) files.push(absolute);
    return files;
  }
  for (const entry of readdirSync(absolute).sort()) walk(join(path, entry), files);
  return files;
}

const used = new Map();
for (const file of sources.flatMap((source) => walk(source))) {
  for (const [full] of readFileSync(file, "utf8").matchAll(new RegExp(tokenClass, "g"))) {
    if (!used.has(full)) used.set(full, relative(root, file));
  }
}

/** Tailwind escapes `:` and `/` in a selector, and the shim keeps that spelling. */
const escaped = (name) => name.replace(/[:/]/g, (character) => `\\${character}`);
const gaps = [...used].filter(([name]) => !shim.includes(`.${escaped(name)}`));

// A parser that silently finds nothing would pass forever.
if (used.size < 15) {
  failures.push(`B. only ${used.size} token classes found — the scanner, not the shim, is broken`);
}
for (const [name, file] of gaps) {
  failures.push(
    `B. .${name} (used in ${file}) has no aurora rule in install-shim.css — it paints with the product's tokens`,
  );
}
console.log(`B. ${used.size} token classes in the install flow, ${gaps.length} without a shim rule`);

if (failures.length > 0) {
  console.error(`\nInstall Aurora: ${failures.length} problem(s)`);
  for (const failure of failures) console.error(`  – ${failure}`);
  process.exit(1);
}
console.log("Install Aurora: OK");
