#!/usr/bin/env node
// Guards the Pulse design-system decisions made in Phases 0–6, so they cannot
// silently rot after the migration patches land:
//
//   1. docs      — `.cursor/docs/theme-source.md` (the legacy dark-only palette)
//                  is archived and no longer cited as a source of truth;
//   2. colors    — no hardcoded colours in `frontend/src` (hex, Tailwind default
//                  palette classes, or `rgb()`/`hsl()` that do not read a token);
//   3. tokens    — the three token blocks carry the *same* variable set (a token
//                  present in two of three blocks silently falls back to classic)
//                  and every brand palette in the code has a CSS block;
//   4. radius    — `rounded-xl` is not used (it is not token-bound, so it does not
//                  follow the theme);
//   5. i18n      — `bs` and `en` have identical key sets and every statically
//                  referenced `t()` key resolves in both;
//   6. contract  — the storage keys in `theme-storage.ts` are mirrored by the
//                  pre-paint script in `index.html` (otherwise the first paint
//                  flashes the wrong theme).
//
// Everything here is deliberately conservative: a rule that produced a false
// positive would get ignored, so each rule was measured against the migrated
// tree first (see PULSE_UI_HANDOFF.md §3). Run from the repository root:
//
//   node scripts/check-pulse-design-system.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const notes = [];

function fail(section, message) {
  failures.push(`${section}: ${message}`);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path) {
  try {
    return statSync(join(root, path)).isFile();
  } catch {
    return false;
  }
}

function walk(dir, pattern) {
  const found = [];
  for (const entry of readdirSync(join(root, dir))) {
    const path = `${dir}/${entry}`;
    const stats = statSync(join(root, path));
    if (stats.isDirectory()) found.push(...walk(path, pattern));
    else if (pattern.test(path)) found.push(path);
  }
  return found;
}

/* ── 1. documentation ─────────────────────────────────────────────────────── */
function checkDocs() {
  const section = "docs";
  const archived = ".cursor/docs/theme-source.md";
  if (!exists(archived)) {
    fail(section, `${archived} is missing (it should exist as an archived stub)`);
  } else if (!read(archived).includes("[ARHIVIRANO]")) {
    fail(section, `${archived} must carry the "[ARHIVIRANO]" marker`);
  }

  const scanned = [
    ".cursor/docs",
    ".cursor/rules",
    "referenca-dizajn/README.md",
    "fe-alignment-prompts.md",
    "Master UI-UX Design Constitution.md",
  ];
  // Any mention has to carry its own disqualifier on the same line: prose tends
  // to cite a source with the verb *before* the name ("mjerodavan je
  // theme-source.md"), so pattern-matching specific phrases is fragile.
  const mentionsLegacy = /theme-source/i;
  const saysArchived = /arhivir|penzionisan|više nije|nije više|legacy|histor/i;
  const files = scanned.flatMap((target) =>
    target.endsWith(".md") || target.endsWith(".mdc")
      ? [target]
      : walk(target, /\.(md|mdc)$/),
  );
  for (const file of files) {
    if (file === archived) continue;
    const text = read(file);
    text.split("\n").forEach((line, index) => {
      if (mentionsLegacy.test(line) && !saysArchived.test(line)) {
        fail(
          section,
          `${file}:${index + 1} cites theme-source.md without marking it archived: ${line.trim()}`,
        );
      }
    });
  }
}

/* ── 2. colours ───────────────────────────────────────────────────────────── */
function checkColors() {
  const section = "colors";
  const hex = /#[0-9a-fA-F]{3,8}\b/;
  // `rgb()` / `hsl()` is legitimate for SVG attributes and gradient stops, which
  // cannot take a utility class — but only when it reads a token.
  const rawColorFunction = /\b(rgb|rgba|hsl|hsla)\(\s*(?!var\()/;
  const namedPalette =
    /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|outline|decoration|placeholder|caret|accent|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;

  for (const file of walk("frontend/src", /\.(tsx|ts)$/)) {
    if (/\.spec\.(tsx|ts)$/.test(file)) continue;
    read(file)
      .split("\n")
      .forEach((line, index) => {
        const where = `${file}:${index + 1}`;
        if (hex.test(line)) fail(section, `${where} hardcoded hex colour: ${line.trim()}`);
        if (rawColorFunction.test(line))
          fail(section, `${where} raw colour function without a token: ${line.trim()}`);
        if (namedPalette.test(line))
          fail(section, `${where} Tailwind default palette colour: ${line.trim()}`);
      });
  }
}

/* ── 3. tokens ────────────────────────────────────────────────────────────── */
/**
 * Reads the token names of the first rule whose selector matches `selector`.
 * The `:root` prefix must not be part of the pattern for the base blocks: a
 * plain `:root[data-theme="pulse"]` pattern would also match the `.dark` block,
 * because the block after it starts with the same text.
 */
function readBlock(css, selector) {
  const pattern = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "s");
  const match = pattern.exec(css);
  if (match === null) return null;
  return new Set(
    [...match[1].matchAll(/--[a-z0-9-]+\s*:/g)].map((token) => token[0].replace(/\s*:$/, "")),
  );
}

function difference(a, b) {
  return [...a].filter((item) => !b.has(item)).sort();
}

function checkTokens() {
  const section = "tokens";
  const css = read("frontend/src/index.css");

  // Selectors are used as regexes, so brackets must stay escaped.
  const baseBlocks = {
    classic: '\\[data-theme="classic"\\]',
    "pulse light": ':root\\[data-theme="pulse"\\](?![\\w-])',
    "pulse dark": ':root\\[data-theme="pulse"\\]\\.dark',
  };
  const sets = {};
  for (const [label, selector] of Object.entries(baseBlocks)) {
    const set = readBlock(css, selector);
    if (set === null) fail(section, `token block not found: ${label}`);
    else sets[label] = set;
  }
  const reference = sets.classic;
  if (reference !== undefined) {
    for (const [label, set] of Object.entries(sets)) {
      const missingHere = difference(reference, set);
      const missingThere = difference(set, reference);
      if (missingHere.length > 0)
        fail(section, `"${label}" is missing tokens defined in classic: ${missingHere.join(", ")}`);
      if (missingThere.length > 0)
        fail(
          section,
          `"${label}" defines tokens missing from classic: ${missingThere.join(", ")}`,
        );
    }
    notes.push(`tokens: ${reference.size} tokens consistent across the three base blocks`);
  }

  // Brand palettes: every non-default value needs a light and a dark block. The
  // default palette IS the base `:root[data-theme="pulse"]` block, so it has none.
  const storage = read("frontend/src/lib/theme/theme-storage.ts");
  const defaultAccent = /DEFAULT_THEME_ACCENT[^=]*=\s*"([a-z]+)"/.exec(storage);
  if (defaultAccent === null) fail(section, "DEFAULT_THEME_ACCENT not found in theme-storage.ts");
  const accents = /THEME_ACCENTS[^=]*=\s*\[([^\]]*)\]/.exec(storage);
  if (accents === null) {
    fail(section, "THEME_ACCENTS not found in theme-storage.ts");
    return;
  }
  const values = [...accents[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
  const paletteSets = [];
  for (const value of values) {
    const isDefault = defaultAccent !== null && value === defaultAccent[1];
    if (!isDefault) {
      for (const dark of [false, true]) {
        // No trailing `{` here — `readBlock` appends the body pattern itself.
        const selector = `\\[data-theme="pulse"\\]\\[data-accent="${value}"\\]${dark ? "\\.dark" : ""}`;
        const set = readBlock(css, selector);
        if (set === null) {
          fail(section, `palette "${value}"${dark ? " (dark)" : ""} has no CSS block`);
        } else {
          paletteSets.push({ label: `${value}${dark ? ".dark" : ""}`, set });
        }
      }
    }
    // The palette needs a label in both locales, otherwise the UI shows the key.
    for (const locale of ["bs", "en"]) {
      const cap = value[0].toUpperCase() + value.slice(1);
      if (!read(`frontend/src/i18n/locales/${locale}/common.json`).includes(`"accent${cap}"`)) {
        fail(section, `palette "${value}" has no theme.accent${cap} key in ${locale}`);
      }
    }
  }
  if (paletteSets.length > 0) {
    const first = paletteSets[0];
    if (first.set.size === 0) fail(section, "palette blocks define no variables");

    for (const { label, set } of paletteSets) {
      if (difference(first.set, set).length > 0 || difference(set, first.set).length > 0) {
        fail(section, `palette block "${label}" does not define the same variables as "${first.label}"`);
      }
    }
    notes.push(`tokens: ${paletteSets.length} palette blocks, each with ${first.set.size} variables`);
  }
}

/* ── 4. radius ────────────────────────────────────────────────────────────── */
function checkRadius() {
  const section = "radius";
  for (const file of walk("frontend/src", /\.(tsx|ts)$/)) {
    if (/\.spec\.(tsx|ts)$/.test(file)) continue;
    read(file)
      .split("\n")
      .forEach((line, index) => {
        if (/rounded-xl/.test(line)) {
          fail(section, `${file}:${index + 1} uses rounded-xl (not token-bound): ${line.trim()}`);
        }
      });
  }
}

/* ── 5. i18n ──────────────────────────────────────────────────────────────── */
function leaves(value, prefix = "", into = new Set()) {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, prefix === "" ? key : `${prefix}.${key}`, into);
    }
  } else {
    into.add(prefix);
  }
  return into;
}

function hasKey(dictionary, key) {
  let current = dictionary;
  for (const part of key.split(".")) {
    if (current === null || typeof current !== "object" || !(part in current)) return false;
    current = current[part];
  }
  return true;
}

function hasPrefix(dictionary, prefix) {
  let current = dictionary;
  for (const part of prefix.split(".")) {
    if (current === null || typeof current !== "object" || !(part in current)) return false;
    current = current[part];
  }
  return current !== null && typeof current === "object";
}

function checkI18n() {
  const section = "i18n";
  const locales = {};
  for (const locale of ["bs", "en"]) {
    locales[locale] = JSON.parse(read(`frontend/src/i18n/locales/${locale}/common.json`));
  }
  const keys = { bs: leaves(locales.bs), en: leaves(locales.en) };
  const onlyBs = difference(keys.bs, keys.en);
  const onlyEn = difference(keys.en, keys.bs);
  if (onlyBs.length > 0) fail(section, `keys only in bs: ${onlyBs.slice(0, 10).join(", ")}`);
  if (onlyEn.length > 0) fail(section, `keys only in en: ${onlyEn.slice(0, 10).join(", ")}`);
  notes.push(`i18n: ${keys.bs.size} keys, bs/en parity ok`);

  // `(?<![\w.])` skips `search.set("q")` / `createElement("a")` and friends.
  const staticKey = /(?<![\w.])t\(\s*"([A-Za-z][A-Za-z0-9]*\.[A-Za-z0-9.]+)"/g;
  const dynamicPrefix = /(?<![\w.])t\(\s*`([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)\.\$\{/g;
  const seenKeys = new Set();
  const seenPrefixes = new Set();

  for (const file of walk("frontend/src", /\.(tsx|ts)$/)) {
    if (/\.spec\.(tsx|ts)$/.test(file)) continue;
    const text = read(file);
    for (const match of text.matchAll(staticKey)) seenKeys.add(match[1]);
    for (const match of text.matchAll(dynamicPrefix)) seenPrefixes.add(match[1]);
  }
  for (const key of [...seenKeys].sort()) {
    for (const locale of ["bs", "en"]) {
      if (!hasKey(locales[locale], key)) fail(section, `t("${key}") has no ${locale} translation`);
    }
  }
  for (const prefix of [...seenPrefixes].sort()) {
    for (const locale of ["bs", "en"]) {
      if (!hasPrefix(locales[locale], prefix)) {
        fail(section, `dynamic t(\`${prefix}.…\`) matches nothing in ${locale}`);
      }
    }
  }
  notes.push(
    `i18n: ${seenKeys.size} static t() keys resolved in both locales, ${seenPrefixes.size} dynamic prefixes resolved`,
  );
}

/* ── 6. theme contract ────────────────────────────────────────────────────── */
function checkContract() {
  const section = "contract";
  const storage = read("frontend/src/lib/theme/theme-storage.ts");
  const prePaint = read("frontend/index.html");

  const storageKeys = [...storage.matchAll(/THEME_[A-Z]+_STORAGE_KEY\s*=\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (storageKeys.length === 0) fail(section, "no THEME_*_STORAGE_KEY constants found");
  for (const key of storageKeys) {
    if (!prePaint.includes(key)) {
      fail(section, `storage key "${key}" is not mirrored by the pre-paint script in index.html`);
    }
  }
  notes.push(`contract: ${storageKeys.length} storage keys mirrored in the pre-paint script`);

  const provider = read("frontend/src/lib/theme/theme-provider.tsx");
  for (const attribute of ["root.dataset.theme", "root.dataset.accent"]) {
    if (!provider.includes(attribute)) fail(section, `${attribute} is not set by ThemeProvider`);
  }
  if (!/classList\.toggle\("dark"/.test(provider)) {
    fail(section, 'ThemeProvider does not toggle the "dark" class');
  }
  // Match the *value-driven* assignment: the `catch` fallback also writes these
  // attributes with literals, so a substring test on the name alone would pass
  // even with the real assignment removed.
  for (const [attribute, value] of [
    ["data-theme", "design"],
    ["data-accent", "accent"],
  ]) {
    if (!prePaint.includes(`setAttribute("${attribute}", ${value})`)) {
      fail(section, `pre-paint script does not apply the stored ${attribute} (${value})`);
    }
  }
  if (!prePaint.includes('classList.toggle("dark", isDark)')) {
    fail(section, "pre-paint script does not apply the resolved brightness");
  }
}

checkDocs();
checkColors();
checkTokens();
checkRadius();
checkI18n();
checkContract();

for (const note of notes) console.log(`  · ${note}`);

if (failures.length > 0) {
  console.error(`\ncheck-pulse-design-system: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("check-pulse-design-system: docs, colours, tokens, radius, i18n and theme contract OK.");
