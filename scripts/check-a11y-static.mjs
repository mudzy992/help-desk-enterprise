#!/usr/bin/env node
// Paket 2.8 §5.2 — static accessibility guard for every PR.
//
// axe (E2E test 22) needs the live stack and is not part of PR CI, so the
// mistakes that can be recognised in source are caught here, on the real
// TypeScript AST (no regex guessing about JSX):
//
//   1. icon-button — a <button>/<Button> whose only content is icons, with no
//                    aria-label / aria-labelledby (WCAG 4.1.2);
//   2. img-alt     — <img> without alt; role="img" without an accessible name (1.1.1);
//   3. click-role  — onClick on div/span/li/td/p/section without a role and a
//                    keyboard handler (2.1.1). Allowed: a handler that only calls
//                    stopPropagation, and a <tr> marked with the comment
//                    `a11y-row-link` (the row has a real Link inside);
//   4. tabindex    — tabIndex greater than 0 (2.4.3);
//   5. outline     — `outline-none` / `focus:outline-none` without a real focus
//                    replacement (a focus-visible:/focus:/focus-within: class that
//                    is not itself outline-none) in the same class string, unless
//                    the element carries the comment `a11y-focus:` with the reason
//                    (ring on the parent, SVG ring rect, programmatic-only target) (2.4.7).
//
// i18n existence of aria-label keys is already enforced by
// check-pulse-design-system.mjs (every static t() key must resolve in bs and en).
//
//   node scripts/check-a11y-static.mjs            (from the repo root or frontend/)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");
const require = createRequire(join(frontend, "package.json"));
const ts = require("typescript");

const SKIP_DIRS = new Set(["node_modules", "visual-qa"]);
const NON_INTERACTIVE = new Set(["div", "span", "li", "td", "p", "section", "article", "img"]);
const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".tsx") && !full.endsWith(".spec.tsx")) out.push(full);
  }
  return out;
}

function tagName(node) {
  return node.tagName.getText();
}

function attributes(node) {
  const map = new Map();
  for (const property of node.attributes.properties) {
    if (ts.isJsxAttribute(property)) {
      map.set(property.name.getText(), property);
    } else if (ts.isJsxSpreadAttribute(property)) {
      map.set("...", property);
    }
  }
  return map;
}

function stringValue(attribute) {
  const init = attribute?.initializer;
  if (init === undefined) return attribute === undefined ? undefined : "";
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression !== undefined) {
    const expression = init.expression;
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return expression.text;
    }
  }
  return null; // dynamic
}

/** All static class strings of a className attribute (including cn("…", …) arguments). */
function classStrings(attribute) {
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      found.push(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      found.push(node.head.text + node.templateSpans.map((span) => span.literal.text).join(" "));
    }
    ts.forEachChild(node, visit);
  };
  if (attribute?.initializer) visit(attribute.initializer);
  return found;
}

function lucideImports(source) {
  const names = new Set();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "lucide-react" &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    ) {
      for (const element of statement.importClause.namedBindings.elements) {
        names.add(element.name.text);
      }
    }
  }
  return names;
}

/** "icons" | "text" | "unknown" — what a button's children render. */
function childrenKind(element, icons) {
  if (ts.isJsxSelfClosingElement(element)) return "empty";
  let sawIcon = false;
  for (const child of element.children) {
    if (ts.isJsxText(child)) {
      if (child.text.trim().length > 0) return "text";
      continue;
    }
    if (ts.isJsxExpression(child)) {
      if (child.expression === undefined) continue;
      return "unknown";
    }
    const opening = ts.isJsxElement(child) ? child.openingElement : child;
    if (ts.isJsxFragment(child)) return "unknown";
    const name = tagName(opening);
    if (icons.has(name)) {
      sawIcon = true;
      continue;
    }
    const classes = classStrings(attributes(opening).get("className")).join(" ");
    if (/(^|\s)sr-only(\s|$)/.test(classes)) return "text";
    return "unknown";
  }
  return sawIcon ? "icons" : "empty";
}

function onlyStopsPropagation(attribute) {
  const text = attribute.initializer?.getText() ?? "";
  return /^\{\s*\(?\s*\w*\s*\)?\s*=>\s*\{?\s*\w+\.stopPropagation\(\);?\s*\}?\s*\}$/.test(text);
}

/** The marker may sit inside the element's tag or in a comment on the 3 lines above it. */
function hasMarkerComment(source, node, marker) {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart());
  const from = source.getPositionOfLineAndCharacter(Math.max(0, line - 3), 0);
  return source.text.slice(from, node.getEnd()).includes(marker);
}

function check(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const icons = lucideImports(source);
  const where = (node) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    return `${relative(root, file)}:${line + 1}`;
  };

  const visit = (node) => {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening !== null) {
      const name = tagName(opening);
      const attrs = attributes(opening);
      const hasSpread = attrs.has("...");
      const named = attrs.has("aria-label") || attrs.has("aria-labelledby");

      if ((name === "button" || name === "Button") && !named && !hasSpread && !attrs.has("asChild")) {
        if (childrenKind(node, icons) === "icons") {
          failures.push(`icon-button: ${where(opening)} — icon-only button needs aria-label`);
        }
      }

      if (name === "img" && !attrs.has("alt") && !hasSpread) {
        failures.push(`img-alt: ${where(opening)} — <img> needs alt (use alt="" if decorative)`);
      }
      if (stringValue(attrs.get("role")) === "img" && !named && !hasSpread) {
        failures.push(`img-alt: ${where(opening)} — role="img" needs aria-label or aria-labelledby`);
      }

      const onClick = attrs.get("onClick");
      if (onClick !== undefined && NON_INTERACTIVE.has(name) && !attrs.has("role") && !onlyStopsPropagation(onClick)) {
        if (!attrs.has("onKeyDown") || !attrs.has("tabIndex")) {
          failures.push(`click-role: ${where(opening)} — onClick on <${name}> needs role, tabIndex and onKeyDown (or use a button)`);
        }
      }
      if (onClick !== undefined && name === "tr" && !hasMarkerComment(source, opening, "a11y-row-link")) {
        failures.push(`click-role: ${where(opening)} — clickable <tr> needs a Link in the row and the comment a11y-row-link`);
      }

      const tabIndex = attrs.get("tabIndex");
      if (tabIndex?.initializer && ts.isJsxExpression(tabIndex.initializer)) {
        const expression = tabIndex.initializer.expression;
        if (expression && ts.isNumericLiteral(expression) && Number(expression.text) > 0) {
          failures.push(`tabindex: ${where(opening)} — tabIndex > 0 breaks the reading order`);
        }
      }

      for (const classes of classStrings(attrs.get("className"))) {
        const tokens = classes.split(/\s+/);
        const removesOutline = tokens.some((token) => /^(focus:|focus-visible:)?outline-none$/.test(token));
        const replaces = tokens.some(
          (token) =>
            /^(focus-visible|focus|focus-within|group-focus-visible|peer-focus-visible):/.test(token) &&
            !token.endsWith("outline-none"),
        );
        if (removesOutline && !replaces && !hasMarkerComment(source, opening, "a11y-focus:")) {
          failures.push(`outline: ${where(opening)} — "outline-none" without a focus-visible: replacement`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

for (const file of walk(join(frontend, "src"))) {
  check(file);
}

if (failures.length > 0) {
  console.error(`check-a11y-static: ${failures.length} problem(s)\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error("\nSee docs/plans/modules/2.8-pristupacnost-i-ux.md §5.2.");
  process.exit(1);
}
console.log("check-a11y-static: OK");
