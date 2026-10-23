#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourcePattern = /^(0[1-9]|[1-3][0-9]|4[0-4])-.+\.md$/u;
const findingPattern = /^\|\s*(BA-[^|\s]+)\s*\|\s*(P[123])\s*\|/gmu;

// A finding keeps its source BA id, while this table gives every source unit a
// single implementation owner and first implementation wave. More precise
// package-level links can be added as findings close, without silently losing
// baseline coverage.
export const unitPlans = Object.freeze({
  1: ["WS-A", 2], 2: ["WS-A", 2], 3: ["WS-A", 2], 4: ["WS-A", 2],
  5: ["WS-A", 2], 6: ["WS-A", 2], 7: ["WS-C", 3], 8: ["WS-C", 3],
  9: ["WS-E", 2], 10: ["WS-C", 3], 11: ["WS-E", 3], 12: ["WS-F", 5],
  13: ["WS-F", 5], 14: ["WS-F", 5], 15: ["WS-F", 5], 16: ["WS-F", 5],
  17: ["WS-D", 6], 18: ["WS-D", 6], 19: ["WS-D", 6], 20: ["WS-D", 6],
  21: ["WS-D", 6], 22: ["WS-F", 7], 23: ["WS-F", 7], 24: ["WS-F", 7],
  25: ["WS-F", 7], 26: ["WS-F", 7], 27: ["WS-F", 7], 28: ["WS-D", 6],
  29: ["WS-D", 6], 30: ["WS-C", 3], 31: ["WS-A", 8], 32: ["WS-F", 8],
  33: ["WS-C", 8], 34: ["WS-F", 8], 35: ["WS-F", 8], 36: ["WS-D", 8],
  37: ["WS-E", 8], 38: ["WS-F", 8], 39: ["WS-G", 9], 40: ["WS-G", 9],
  41: ["WS-G", 9], 42: ["WS-G", 9], 43: ["WS-C", 3], 44: ["WS-G", 1],
});

export async function buildFindingsPlan(auditsDirectory) {
  const files = (await readdir(auditsDirectory))
    .filter((name) => sourcePattern.test(name))
    .sort();
  if (files.length !== 44) {
    throw new Error(`očekivane su 44 izvorne audit jedinice, pronađeno ${files.length}`);
  }

  const findings = [];
  const seen = new Set();
  for (const source of files) {
    const unit = Number.parseInt(source.slice(0, 2), 10);
    const plan = unitPlans[unit];
    if (plan === undefined) throw new Error(`jedinica ${unit} nema owner/val mapiranje`);
    const text = await readFile(path.join(auditsDirectory, source), "utf8");
    for (const match of text.matchAll(findingPattern)) {
      const [, id, severity] = match;
      if (seen.has(id)) throw new Error(`dupliciran finding ID: ${id}`);
      seen.add(id);
      findings.push({ id, severity, source, owner: plan[0], wave: plan[1], status: "otvoreno" });
    }
  }
  findings.sort((left, right) => left.id.localeCompare(right.id));
  const severity = { P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) severity[finding.severity] += 1;
  return {
    schemaVersion: 1,
    generatedFrom: "docs/backend/audits/01-44",
    units: files.length,
    total: findings.length,
    severity,
    findings,
  };
}

export function validateFindingsPlan(plan) {
  const errors = [];
  if (plan.units !== 44) errors.push(`units=${plan.units}, očekivano 44`);
  if (plan.total !== 692) errors.push(`total=${plan.total}, očekivano 692`);
  for (const [level, expected] of Object.entries({ P1: 174, P2: 368, P3: 150 })) {
    if (plan.severity[level] !== expected) errors.push(`${level}=${plan.severity[level]}, očekivano ${expected}`);
  }
  const missingPlan = plan.findings.filter(
    (finding) => !/^WS-[A-H]$/u.test(finding.owner) || !Number.isInteger(finding.wave),
  );
  if (missingPlan.length > 0) errors.push(`${missingPlan.length} nalaza nema valjan owner/val`);
  return errors;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = path.join(root, "docs/backend/backend-findings-plan.json");
  const plan = await buildFindingsPlan(path.join(root, "docs/backend/audits"));
  const errors = validateFindingsPlan(plan);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (process.argv.includes("--write")) {
    await writeFile(output, serialized);
    console.log(`✓ backend findings plan zapisan: ${plan.total} nalaza`);
    return;
  }
  let committed;
  try {
    committed = await readFile(output, "utf8");
  } catch {
    throw new Error("nedostaje docs/backend/backend-findings-plan.json; pokreni sa --write");
  }
  if (committed !== serialized) {
    throw new Error("backend findings plan nije sinhronizovan; pokreni sa --write i commituj rezultat");
  }
  console.log(
    `✓ backend findings traceability: ${plan.total}/${plan.total}, ` +
      `P1=${plan.severity.P1} P2=${plan.severity.P2} P3=${plan.severity.P3}, owner/val=potpun`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backend findings provjera: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
