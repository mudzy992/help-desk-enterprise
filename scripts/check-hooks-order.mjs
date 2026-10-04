#!/usr/bin/env node
// Static guard against conditional hooks — the one React mistake that is not
// visible to tsc, vitest or the build, and that takes the whole page down in
// production ("Minified React error #310: Rendered more hooks than during the
// previous render").
//
// The rule: inside one function body, a hook may not run *after* a `return`
// that can happen earlier. Typical shape caught here:
//
//   if (isLoading) return <Spinner />;      // early return
//   const state = useMemo(...)              // ← never runs on the first render
//
// (That is exactly how the ticket detail page broke on staging on 2026-10-03:
// `useTicketDetailSections` sat below the loading early-return. The fix is to
// move every hook above the first early return — hooks may not be skipped.)
//
// What counts as a hook: a bare call `useXxx(...)` (uppercase after `use`, so
// `usefulThing()` is not a hook, and neither is `helpers.useSomething()`).
// Nested functions are skipped: hooks inside a callback belong to that
// callback's own render.
//
// The rule lives in `skippedHooksIn` so the test file can feed it snippets.
//
//   node scripts/check-hooks-order.mjs            (from the repo root or frontend/)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");
const require = createRequire(join(frontend, "package.json"));
const ts = require("typescript");

const SKIP_DIRS = new Set(["node_modules", "visual-qa"]);
const HOOK = /^use[A-Z]/;
const checked = [];

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

/** Hook calls in `node`, not descending into nested functions. */
function hookCalls(node) {
  const found = [];
  const visit = (current, depth) => {
    if (ts.isFunctionLike(current) && depth > 0) return;
    if (ts.isCallExpression(current)) {
      const callee = current.expression;
      // Only a bare `useXxx(…)` is a hook: `helpers.useSomething()` and
      // `React.useMemo()` are not, and React does not track them as hooks.
      if (ts.isIdentifier(callee) && HOOK.test(callee.text)) found.push(callee.text);
    }
    ts.forEachChild(current, (child) => visit(child, depth + 1));
  };
  if (ts.isFunctionLike(node)) {
    ts.forEachChild(node, (child) => visit(child, 1));
  } else {
    visit(node, 0);
  }
  return [...new Set(found)];
}

/** How many `return`s this statement can perform (callbacks do not count). */
function returnCount(statement) {
  let count = 0;
  const visit = (current, depth) => {
    if (ts.isFunctionLike(current) && depth > 0) return;
    if (ts.isReturnStatement(current)) count += 1;
    ts.forEachChild(current, (child) => visit(child, depth + 1));
  };
  visit(statement, 0);
  return count;
}

function checkBody(failures, source, body) {
  const statements = body.statements;
  for (let index = 0; index < statements.length - 1; index += 1) {
    if (returnCount(statements[index]) === 0) continue;
    // Everything after a possible early return must be hook-free. The hook's
    // own name is enough for the message; the caller adds file and line.
    for (let later = index + 1; later < statements.length; later += 1) {
      // The final `return <jsx/>` is the render itself, not a skipped hook call.
      if (ts.isReturnStatement(statements[later])) continue;
      const hooks = hookCalls(statements[later]);
      if (hooks.length === 0) continue;
      const { line } = source.getLineAndCharacterOfPosition(statements[later].getStart());
      failures.push({ line: line + 1, hooks });
    }
    break;
  }
}

/**
 * Hook calls that a render can skip: a `useXxx` that only runs after a `return`
 * which may already have happened in the same function body.
 * Returns `[{ line, hooks }]` — `line` is 1-based in `sourceText`.
 */
export function skippedHooksIn(sourceText, fileName = "component.tsx") {
  const source = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const failures = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node.body !== undefined && ts.isBlock(node.body)) {
      checkBody(failures, source, node.body);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return failures;
}

function main() {
  const failures = [];
  for (const file of walk(join(frontend, "src"))) {
    checked.push(file);
    for (const failure of skippedHooksIn(readFileSync(file, "utf8"), file)) {
      failures.push({
        ...failure,
        file: relative(frontend, file),
      });
    }
  }
  if (failures.length > 0) {
    console.error("check-hooks-order: hooks that a render can skip:");
    for (const failure of failures) {
      console.error(`  · ${failure.file}:${failure.line} — ${failure.hooks.join(", ")}`);
    }
    console.error("  Move the hook(s) above the first early return.");
    process.exit(1);
  }
  console.log(
    `check-hooks-order: no hook runs after an early return (${checked.length} .tsx files).`,
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
