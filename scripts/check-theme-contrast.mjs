#!/usr/bin/env node
/**
 * Guards the measurable contrast rules from
 * `docs/design/Master UI-UX Design Constitution.md` §22.1 and §22.3, so a new
 * palette or a new component cannot silently reintroduce a sub-4.5:1 text pair.
 *
 *   node scripts/check-theme-contrast.mjs
 *
 * Two checks, because the two rules guard different things:
 *
 *   A. TOKENS — every palette block in `frontend/src/index.css` must hold the
 *      pairs that are actually rendered together at ≥ 4.5:1 (WCAG AA, normal
 *      text). The blocks are merged the way the browser merges them (base →
 *      `.dark` → accent), so an accent that only overrides `--primary` is
 *      measured against the neutrals it really inherits.
 *
 *   B. USAGE — `text-primary` must not be used on a neutral surface. §22.1:
 *      "`text-primary` nije za tekst na neutralnoj površini — za to je
 *      `text-link` (garantovan kontrast)." §22.3 asks `primary` as text to be
 *      ≥ 4.5:1 on a surface, and for the default indigo palette in dark mode it
 *      is 4.00:1 — that gap cannot be closed by changing `--primary`, because
 *      white on `--primary` in that same block is 4.52:1: the luminance window
 *      that satisfies both is empty (it needs L ∈ [0.211, 0.183]). So the rule
 *      is enforced where it can be — at the usage site — and the unreachable
 *      token pair is deliberately not measured here. Check B failing means a
 *      component can render that 4.00:1; check B passing means it cannot.
 */
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

/** WCAG 2.1 AA for normal-size text. Large text (≥24px, or ≥18.66px bold) is 3:1. */
const textThreshold = 4.5;

// ── WCAG math ───────────────────────────────────────────────────────────────
const channel = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const first = luminance(a);
  const second = luminance(b);
  const [high, low] = first >= second ? [first, second] : [second, first];
  return (high + 0.05) / (low + 0.05);
};
/** `::selection` is an alpha blend over the surface, not a solid fill (§22.3). */
const blend = (foreground, background, alpha) =>
  foreground.map((c, i) => Math.round(alpha * c + (1 - alpha) * background[i]));

// ── Parse `index.css` ───────────────────────────────────────────────────────
function readTokenBlocks(cssPath) {
  const css = readFileSync(cssPath, "utf8");
  const blocks = [];
  const selectorPattern = /(:root[^{]*?)\{/g;
  let match;
  while ((match = selectorPattern.exec(css)) !== null) {
    const selector = match[1].trim().replace(/\s+/g, " ");
    // Brace matching rather than `[^}]*`: token blocks carry `url("data:…")`
    // values, and a naive scan would end the block at the wrong brace.
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") depth -= 1;
      index += 1;
    }
    const body = css.slice(match.index + match[0].length, index - 1);
    const tokens = {};
    for (const token of body.matchAll(/--([\w-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/g)) {
      tokens[token[1]] = [Number(token[2]), Number(token[3]), Number(token[4])];
    }
    blocks.push({ selector, tokens });
  }
  return blocks;
}

const cssPath = join(root, "frontend/src/index.css");
let blocks;
try {
  blocks = readTokenBlocks(cssPath);
} catch (error) {
  console.error(`✖ ne mogu pročitati frontend/src/index.css: ${error.message}`);
  process.exit(1);
}

const blockFor = (selector) => blocks.find((block) => block.selector === selector);
const merge = (...selectors) =>
  selectors.reduce((accumulator, selector) => {
    const block = blockFor(selector);
    return block ? Object.assign(accumulator, block.tokens) : accumulator;
  }, {});

const base = ':root[data-theme="pulse"]';
const darkBase = ':root[data-theme="pulse"].dark';
const accents = ["teal", "rose", "cyan", "amber", "orange"];

const palettes = [
  { name: "indigo · svjetla", tokens: merge(base), selectionAlpha: 0.22 },
  { name: "indigo · tamna", tokens: merge(base, darkBase), selectionAlpha: 0.35 },
];
for (const accent of accents) {
  palettes.push({
    name: `${accent} · svjetla`,
    tokens: merge(base, `:root[data-theme="pulse"][data-accent="${accent}"]`),
    selectionAlpha: 0.22,
  });
  palettes.push({
    name: `${accent} · tamna`,
    tokens: merge(base, darkBase, `:root[data-theme="pulse"][data-accent="${accent}"].dark`),
    selectionAlpha: 0.22,
  });
}

// Pairs that are really rendered together. `primary`-as-text is absent on
// purpose — see the header comment.
const pairs = [
  { fg: "primary-foreground", bg: "primary", label: "tekst na primary ispuni" },
  { fg: "link", bg: "surface", label: "link na kartici" },
  { fg: "link", bg: "background", label: "link na canvasu" },
  { fg: "foreground", bg: "background", label: "glavni tekst na canvasu" },
  { fg: "foreground", bg: "surface", label: "glavni tekst na kartici" },
  { fg: "muted", bg: "surface", label: "sekundarni tekst na kartici" },
];

// ── Check A: tokens ─────────────────────────────────────────────────────────
console.log(`A. Kontrast tokena — prag ${textThreshold}:1 za tekst`);
console.log("");
const pad = (value, width) => String(value).padEnd(width);
let worst = { ratio: Infinity, where: "" };

for (const palette of palettes) {
  const rows = [];
  for (const { fg, bg, label } of pairs) {
    if (!palette.tokens[fg] || !palette.tokens[bg]) {
      failures.push(`tokens: ${palette.name} — nedostaje token ${fg} ili ${bg}`);
      continue;
    }
    const ratio = contrast(palette.tokens[fg], palette.tokens[bg]);
    rows.push(`${pad(fg + "/" + bg, 34)} ${ratio.toFixed(2).padStart(6)}:1`);
    if (ratio < worst.ratio) worst = { ratio, where: `${palette.name} · ${fg} na ${bg} (${label})` };
    if (ratio < textThreshold) {
      failures.push(
        `tokens: ${palette.name} — ${label} (${fg} na ${bg}) = ${ratio.toFixed(2)}:1 < ${textThreshold}:1`,
      );
    }
  }
  // `::selection` is measured against the alpha blend, not the raw token.
  const { "selection-bg": sb, "selection-fg": sf, surface } = palette.tokens;
  if (sb && sf && surface) {
    const ratio = contrast(sf, blend(sb, surface, palette.selectionAlpha));
    rows.push(`${pad("selection (alpha " + palette.selectionAlpha + ")", 34)} ${ratio.toFixed(2).padStart(6)}:1`);
    if (ratio < worst.ratio) worst = { ratio, where: `${palette.name} · ::selection` };
    if (ratio < textThreshold) {
      failures.push(
        `tokens: ${palette.name} — selekcija (alpha-blend ${palette.selectionAlpha} preko surface) = ${ratio.toFixed(2)}:1 < ${textThreshold}:1`,
      );
    }
  }
  console.log(`  ${pad(palette.name, 18)} ${rows.join("   ")}`);
}
console.log("");
console.log(`  najslabiji par: ${worst.ratio.toFixed(2)}:1 — ${worst.where}`);
console.log("");

// ── Check B: usage ──────────────────────────────────────────────────────────
console.log("B. Upotreba — `text-primary` samo na primary ispuni (§22.1)");
console.log("");

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    if (statSync(join(root, path)).isDirectory()) found.push(...walk(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

// `text-primary` but not `text-primary-foreground` — the latter is white on the
// primary fill and is exactly right there.
const usagePattern = /text-primary(?![-\w])/g;

/**
 * Removes comments and keeps string literals — the class lists live inside the
 * strings, and a comment that merely *mentions* `text-primary` (the header of
 * `components/ui/control.ts` documents this very rule) is not a violation.
 * Newlines inside stripped comments are preserved so reported line numbers stay
 * correct.
 */
function stripCommentsKeepingStrings(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += " ".repeat(stop - i);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      out += c;
      while (j < source.length) {
        if (source[j] === "\\") {
          out += source[j] + (source[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (source[j] === c) {
          j += 1;
          break;
        }
        out += source[j];
        j += 1;
      }
      out += c;
      i = j;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

let usages = 0;
let flagged = 0;

for (const file of walk("frontend/src")) {
  const source = stripCommentsKeepingStrings(readFileSync(join(root, file), "utf8"));
  usagePattern.lastIndex = 0;
  let match;
  while ((match = usagePattern.exec(source)) !== null) {
    usages += 1;
    const line = source.slice(0, match.index).split("\n").length;
    // A class list can be split across `cn(...)` arguments, so look at the
    // surrounding call rather than only the literal the token sits in.
    const window = source.slice(Math.max(0, match.index - 250), match.index + 250);
    const onPrimaryFill = /\bbg-primary\b/.test(window);
    if (onPrimaryFill) continue;
    flagged += 1;
    failures.push(
      `usage: ${relative(root, file)}:${line} — \`text-primary\` na neutralnoj površini; ` +
        `za tekst na površini je \`text-link\` (§22.1). Indigo u tamnom modu daje 4.00:1.`,
    );
  }
}

console.log(`  pregledano ${walk("frontend/src").length} fajlova, ${usages} upotreba \`text-primary\`, ${flagged} na neutralnoj površini`);
console.log("");

// ── Verdict ─────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  console.error("");
  console.error(`✖ ${failures.length} propusta kontrasta`);
  process.exit(1);
}
console.log(
  `✔ ${palettes.length} paleta × ${pairs.length + 1} parova i ${usages} upotreba \`text-primary\` — sve unutar praga`,
);
