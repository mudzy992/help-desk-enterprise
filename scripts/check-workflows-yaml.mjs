#!/usr/bin/env node
// Guards `.github/workflows/*.yml` against the one YAML mistake this project
// actually made: a colon inside an **unquoted** scalar.
//
// 2026-10-03: `- name: Check the ticket-list page size (val 1 regresija:
// pageSize 100)` made GitHub refuse the whole workflow file
// (".github/workflows/ci.yml#L73 — You have an error in your yaml syntax on
// line 73"). GitHub validates workflows only after the push, so a typo here
// silently disables CI; this script catches it locally and in CI.
//
// It is deliberately narrow — a full YAML parser is not available in the
// repository. What it checks:
//  - a plain (unquoted) scalar value may not contain ": " nor end with ":";
//  - indentation may not use tabs;
//  - block scalars (`|`, `>`) are skipped, so their content is free-form.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const workflowsDir = "\.github/workflows";

/** Key names GitHub uses are simple; match only those, so a JS object literal
 *  inside a `run:` value cannot be mistaken for a mapping key. */
const keyPattern = /^([A-Za-z_][A-Za-z0-9_.-]*):(?:\s+(.*))?$/;
/** Values that must not be treated as plain scalars. */
const nonPlainStart = /^[|>&*!{["'#]/;

export function findWorkflowProblems(source, file = "workflow.yml") {
  const problems = [];
  const lines = source.split("\n");
  let blockScalarIndent = null;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const lineNumber = index + 1;
    const indent = raw.length - raw.trimStart().length;
    const content = raw.trim();

    if (content.length === 0 || content.startsWith("#")) {
      continue;
    }
    if (blockScalarIndent !== null) {
      // Inside `run: |` (and friends): only a line at the same or lower
      // indentation leaves the block.
      if (indent > blockScalarIndent) {
        continue;
      }
      blockScalarIndent = null;
    }
    if (/^\s*\t/.test(raw)) {
      problems.push(`${file}:${lineNumber} uvlačenje tabom (YAML zahtijeva razmake)`);
      continue;
    }

    // A list item may carry the mapping itself: `- name: value`.
    const withoutDash = content.startsWith("- ")
      ? " ".repeat(0) + content.slice(2).trimStart()
      : content;
    const match = keyPattern.exec(withoutDash);
    if (match === null) {
      continue;
    }
    const value = match[2];
    if (value === undefined) {
      continue;
    }
    if (value === "" || value === "|" || value === ">") {
      blockScalarIndent = indent;
      continue;
    }
    if (nonPlainStart.test(value)) {
      continue;
    }
    const colonAt = value.indexOf(": ");
    if (colonAt !== -1 || value.endsWith(":")) {
      problems.push(
        `${file}:${lineNumber} neukotvljena vrijednost sadrži dvotočku — stavi je pod navodnike: ${withoutDash}`,
      );
    }
  }
  return problems;
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dir = join(root, workflowsDir);
  const problems = [];
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".yml") && !entry.endsWith(".yaml")) continue;
    const file = join(dir, entry);
    problems.push(
      ...findWorkflowProblems(readFileSync(file, "utf8"), relative(root, file)),
    );
  }
  if (problems.length > 0) {
    console.error("Provjera GitHub workflow YAML-a: PROBLEM");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("Provjera GitHub workflow YAML-a: OK (dvotočke pod navodnicima, bez tabova)");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
