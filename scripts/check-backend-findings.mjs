#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourcePattern = /^(0[1-9]|[1-3][0-9]|4[0-4])-.+\.md$/u;

export function parseFindingRows(markdown) {
  const findings = [];
  for (const line of markdown.split(/\r?\n/u)) {
    if (!/^\|\s*BA-[^|\s]+\s*\|/u.test(line)) continue;
    const escapedPipe = "\u0000";
    const columns = line
      .replaceAll("\\|", escapedPipe)
      .split("|")
      .slice(1, -1)
      .map((column) => column.replaceAll(escapedPipe, "|").trim());
    const [id, severity, , status] = columns;
    // Acceptance matrice u starijim auditima također koriste kratke BA-01
    // oznake, ali nemaju severity u drugoj koloni i nisu finding registry redovi.
    if (!/^P[123]$/u.test(severity)) continue;
    if (!/^BA-[^\s]+$/u.test(id) || !status) {
      throw new Error(`neispravan finding red: ${line}`);
    }
    findings.push({ id, severity, status });
  }
  return findings;
}

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
    for (const finding of parseFindingRows(text)) {
      if (seen.has(finding.id)) throw new Error(`dupliciran finding ID: ${finding.id}`);
      seen.add(finding.id);
      findings.push({ ...finding, source, owner: plan[0], wave: plan[1] });
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

/**
 * W7.75: the register table and the plan are two views of the same 44 audit
 * files, and they drifted apart by hand: 6 duplicated rows (BA-search-03..08),
 * 10 rows the audits close but the table still listed as open, and checkpoints
 * whose "source/plan" totals were incremented by one instead of recomputed
 * (418/278 at W7.71 against a real 292/404). Nothing here rewrites the audit
 * tables - the plan stays their pure function - and nothing edits the register
 * prose; the guard only refuses a table that disagrees with the plan.
 */
export const registerRelativePath = "docs/backend/BACKEND-FINDINGS-REGISTER.md";
export const masterPlanRelativePath = "docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md";
export const auditReadmeRelativePath = "docs/backend/audits/README.md";
export const totalsStartMarker = "<!-- findings-totals:start -->";
export const totalsEndMarker = "<!-- findings-totals:end -->";

/** Rows of the global register table: `| unit | module | \`BA-id\` | P | finding | status | link |`. */
export function parseRegisterRows(markdown) {
  const rows = [];
  const escapedPipe = "\u0000";
  for (const line of markdown.split(/\r?\n/u)) {
    if (!line.startsWith("|")) continue;
    const columns = line
      .replaceAll("\\|", escapedPipe)
      .split("|")
      .slice(1, -1)
      .map((column) => column.replaceAll(escapedPipe, "|").trim());
    if (columns.length < 6) continue;
    const id = (columns[2] ?? "").replace(/^`|`$/gu, "");
    if (!/^BA-[^\s]+$/u.test(id)) continue;
    if (!/^P[123]$/u.test(columns[3] ?? "")) continue;
    rows.push({
      unit: Number.parseInt(columns[0], 10),
      module: (columns[1] ?? "").replace(/^`|`$/gu, ""),
      id,
      severity: columns[3],
      status: columns[5],
    });
  }
  return rows;
}

/**
 * The register may shorten a status (`zatvoreno` for `zatvoreno (W7.70)`): the
 * qualifier is a convenience, the closed/open class is the fact. Everything else
 * - id, severity, the class, one row per finding, the row count - must agree.
 */
export function statusClass(status) {
  return status.startsWith("otvoreno") ? "otvoreno" : "zatvoreno";
}

/** Every register row must be a plan row with the same severity and status class - once. */
export function validateRegisterRows(rows, plan) {
  const errors = [];
  const byId = new Map(plan.findings.map((finding) => [finding.id, finding]));
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) errors.push(`registar ima dupliciran ID: ${row.id}`);
    seen.add(row.id);
    const finding = byId.get(row.id);
    if (finding === undefined) {
      errors.push(`registar ima ID koji nije u planu: ${row.id}`);
      continue;
    }
    if (finding.severity !== row.severity) {
      errors.push(`${row.id}: registar ${row.severity} ≠ plan ${finding.severity}`);
    }
    if (statusClass(finding.status) !== statusClass(row.status)) {
      errors.push(`${row.id}: registar "${row.status}" ≠ plan "${finding.status}"`);
    }
  }
  const missing = plan.findings.filter((finding) => !seen.has(finding.id)).map((finding) => finding.id);
  if (missing.length > 0) {
    errors.push(`registar ne sadrži ${missing.length} nalaza (${missing.slice(0, 5).join(", ")}…); pokreni --write`);
  }
  if (rows.length !== plan.total) errors.push(`registar ima ${rows.length} redova, plan ${plan.total}`);
  return errors;
}

const isClosed = (status) => !status.startsWith("otvoreno");

/** Counters used by both generated blocks; every number comes from the plan. */
export function summarizeFindings(plan) {
  const severityOf = (findings) => {
    const counts = { P1: 0, P2: 0, P3: 0 };
    for (const finding of findings) counts[finding.severity] += 1;
    return counts;
  };
  const closed = plan.findings.filter((finding) => isClosed(finding.status));
  const open = plan.findings.filter((finding) => !isClosed(finding.status));
  const waves = [];
  for (let wave = 0; wave <= 11; wave += 1) {
    const assigned = plan.findings.filter((finding) => finding.wave === wave);
    if (assigned.length === 0) continue;
    const openInWave = assigned.filter((finding) => !isClosed(finding.status));
    waves.push({
      wave,
      total: assigned.length,
      closed: assigned.length - openInWave.length,
      open: openInWave.length,
      openSeverity: severityOf(openInWave),
    });
  }
  return {
    total: plan.total,
    severity: plan.severity,
    closed: closed.length,
    open: open.length,
    openSeverity: severityOf(open),
    waves,
  };
}

/** The `Kontrolni zbir` body: the only place where totals are allowed to live. */
export function renderTotalsBlock(plan) {
  const summary = summarizeFindings(plan);
  const wave = summary.waves.find((entry) => entry.wave === 7);
  const waveLine =
    wave === undefined
      ? "- Val 7: nije dodijeljen"
      : `- Val 7: **${wave.closed} / ${wave.total}** zatvoreno, otvoreno **${wave.open}** (P1 ${wave.openSeverity.P1} / P2 ${wave.openSeverity.P2} / P3 ${wave.openSeverity.P3})`;
  return [
    totalsStartMarker,
    "Generisano iz 44 audit tabele: `npm run audit:traceability --prefix backend -- --write`. Ne uređivati ručno.",
    "",
    `- Ukupno: **${summary.total}** (P1 ${summary.severity.P1} · P2 ${summary.severity.P2} · P3 ${summary.severity.P3})`,
    `- Zatvoreno: **${summary.closed}**`,
    `- Otvoreno: **${summary.open}** (P1 ${summary.openSeverity.P1} / P2 ${summary.openSeverity.P2} / P3 ${summary.openSeverity.P3})`,
    waveLine,
    totalsEndMarker,
  ].join("\n");
}

/** Replaces the block between the two markers; the prose around it is untouched. */
export function applyTotalsBlock(markdown, block) {
  const start = markdown.indexOf(totalsStartMarker);
  const end = markdown.indexOf(totalsEndMarker);
  if (start < 0 || end < start) {
    throw new Error(`nedostaju markeri ${totalsStartMarker} … ${totalsEndMarker}`);
  }
  return markdown.slice(0, start) + block + markdown.slice(end + totalsEndMarker.length);
}

/**
 * The wave table in the master plan carries the same counters per wave. Only the
 * two numeric columns are rewritten; the journal and conclusion columns stay
 * hand-written, because they describe packages, not counts.
 */
export function applyWaveCounts(markdown, plan) {
  const summary = summarizeFindings(plan);
  const byWave = new Map(summary.waves.map((entry) => [entry.wave, entry]));
  return markdown
    .split("\n")
    .map((line) => {
      const match = /^\|\s*(\d{1,2})\s*\|/u.exec(line);
      if (match === null) return line;
      const wave = Number.parseInt(match[1], 10);
      const entry = byWave.get(wave);
      const columns = line.split("|");
      // `| wave | scope | journal | closed / total | open (P1/P2/P3) | conclusion |`
      if (columns.length !== 8) return line;
      if (entry === undefined) return line;
      columns[4] = ` ${entry.closed} / ${entry.total} `;
      columns[5] = ` ${entry.open} (${entry.openSeverity.P1}/${entry.openSeverity.P2}/${entry.openSeverity.P3}) `;
      return columns.join("|");
    })
    .join("\n");
}

export function validateFindingsPlan(plan) {
  const errors = [];
  if (plan.units !== 44) errors.push(`units=${plan.units}, očekivano 44`);
  if (plan.total !== 696) errors.push(`total=${plan.total}, očekivano 696`);
  for (const [level, expected] of Object.entries({ P1: 174, P2: 371, P3: 151 })) {
    if (plan.severity[level] !== expected) errors.push(`${level}=${plan.severity[level]}, očekivano ${expected}`);
  }
  const missingPlan = plan.findings.filter(
    (finding) => !/^WS-[A-H]$/u.test(finding.owner) || !Number.isInteger(finding.wave),
  );
  if (missingPlan.length > 0) errors.push(`${missingPlan.length} nalaza nema valjan owner/val`);
  return errors;
}

/**
 * The two documents that carry generated counters: the register (`Kontrolni
 * zbir` + the table itself) and the master plan (wave table + its own block).
 */
async function loadDocuments(root, plan) {
  const registerSource = await readFile(path.join(root, registerRelativePath), "utf8");
  const masterPlanSource = await readFile(path.join(root, masterPlanRelativePath), "utf8");
  const auditReadmeSource = await readFile(path.join(root, auditReadmeRelativePath), "utf8");
  const rows = parseRegisterRows(registerSource);
  const registerErrors = validateRegisterRows(rows, plan);
  const totals = renderTotalsBlock(plan);
  const expectedRegister = applyTotalsBlock(registerSource, totals);
  const expectedMasterPlan = applyTotalsBlock(applyWaveCounts(masterPlanSource, plan), totals);
  const expectedAuditReadme = applyTotalsBlock(auditReadmeSource, totals);
  return {
    registerSource,
    masterPlanSource,
    auditReadmeSource,
    expectedRegister,
    expectedMasterPlan,
    expectedAuditReadme,
    registerErrors,
    totals,
  };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const output = path.join(root, "docs/backend/backend-findings-plan.json");
  const plan = await buildFindingsPlan(path.join(root, "docs/backend/audits"));
  const errors = validateFindingsPlan(plan);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  const documents = await loadDocuments(root, plan);
  if (documents.registerErrors.length > 0) {
    throw new Error(
      `registar se razilazi sa planom (${documents.registerErrors.length}): ` +
        `${documents.registerErrors.slice(0, 10).join("; ")}`,
    );
  }
  if (process.argv.includes("--write")) {
    await writeFile(output, serialized);
    await writeFile(path.join(root, registerRelativePath), documents.expectedRegister);
    await writeFile(path.join(root, masterPlanRelativePath), documents.expectedMasterPlan);
    await writeFile(path.join(root, auditReadmeRelativePath), documents.expectedAuditReadme);
    const summary = summarizeFindings(plan);
    console.log(
      `✓ backend findings plan zapisan: ${plan.total} nalaza, ` +
        `zatvoreno ${summary.closed}/otvoreno ${summary.open}; registar, master plan i audit README usklađeni`,
    );
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
  if (documents.registerSource !== documents.expectedRegister) {
    throw new Error(
      "Kontrolni zbir u registru nije sinhronizovan sa planom; pokreni --write i commituj rezultat",
    );
  }
  if (documents.masterPlanSource !== documents.expectedMasterPlan) {
    throw new Error(
      "zbirni blok ili wave tabela u master planu nisu sinhronizovani sa planom; pokreni --write",
    );
  }
  if (documents.auditReadmeSource !== documents.expectedAuditReadme) {
    throw new Error(
      "zbirni blok u docs/backend/audits/README.md nije sinhronizovan sa planom; pokreni --write",
    );
  }
  const summary = summarizeFindings(plan);
  console.log(
    `✓ backend findings traceability: ${plan.total}/${plan.total}, ` +
      `P1=${plan.severity.P1} P2=${plan.severity.P2} P3=${plan.severity.P3}, owner/val=potpun, ` +
      `zatvoreno=${summary.closed} otvoreno=${summary.open}, registar=usklađen`,
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Backend findings provjera: PROBLEM — ${error.message}`);
    process.exit(1);
  });
}
