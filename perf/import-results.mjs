#!/usr/bin/env node
/**
 * Turns a finished `k6 run perf/full.js` summary into the rows of
 * `PERF_BUDGETS.md` §1 ("SLO tabela"), so the numbers travel from the staging run
 * into the document without anyone retyping them — and so a budget gets checked
 * instead of eyeballed.
 *
 * Usage:
 *   node perf/import-results.mjs perf/results/staging-2026-09-30.json
 *   node perf/import-results.mjs perf/results/<label>.json --label staging-2026-09-30
 *   node perf/import-results.mjs --self-test
 *
 * Exit code: 0 = every measured row is inside its budget, 1 = at least one is not
 * (a run you want to see fail loudly), 2 = the file could not be read/parsed.
 *
 * The k6 summary shape is the one `perf/report.js` already writes: the raw
 * `--summary-export` style object with `metrics.<name>.values`.
 */
import { readFileSync } from "node:fs";

/**
 * Budget rows from `PERF_BUDGETS.md` §1 that have a k6 counterpart. `metrics` is
 * the list whose worst value is the one to read (the budget is "P95 of *any* read
 * endpoint", so the answer is the maximum across them).
 */
const rows = [
  {
    id: "readP95",
    budget: 200,
    unit: "ms",
    description: "P95 bilo kojeg read endpointa",
    metrics: [
      "tickets_list_duration",
      "ticket_detail_duration",
      "search_duration",
      "dashboard_summary_duration",
      "unread_count_duration",
    ],
    aggregate: "max",
    value: (metric) => metric.values["p(95)"],
  },
  {
    id: "mutationP95",
    budget: 400,
    unit: "ms",
    description: "P95 bilo koje mutacije",
    metrics: ["ticket_message_duration"],
    aggregate: "max",
    value: (metric) => metric.values["p(95)"],
  },
  {
    id: "errorRate",
    budget: 0.5,
    unit: "%",
    description: "k6 error rate",
    metrics: ["http_req_failed"],
    aggregate: "max",
    value: (metric) => metric.values.rate * 100,
  },
  {
    id: "ticketListPayload",
    budget: 100,
    unit: "KB",
    description: "Payload liste tiketa",
    metrics: ["ticket_list_payload_kb"],
    aggregate: "max",
    value: (metric) => metric.values["p(95)"],
  },
  {
    id: "dashboardPayload",
    budget: 100,
    unit: "KB",
    description: "Dashboard payload",
    metrics: ["dashboard_payload_kb"],
    aggregate: "max",
    value: (metric) => metric.values["p(95)"],
  },
];

/** Rows the k6 summary cannot answer — they come from the API log, not from k6. */
const logOnlyRows = [
  "DB upita po HTTP zahtjevu (≤ 2) — `db_queries_per_request=` iz `api.log`",
  "WS emit-ova / s (< 500) — `ws_emits_*` iz `api.log`; k6 vidi samo ono što klijent primi",
  "SLA scan ciklus (< 15 s @ 100k otvorenih) — `sla_scan_*` iz `api.log`",
  "Pretraga: zahtjeva po unosu (1) — `search_requests` / broj unosa",
];

const format = (value, unit) => {
  if (value === undefined || Number.isNaN(value)) return "—";
  if (unit === "%") return `${value.toFixed(2)} %`;
  if (unit === "KB") return `${Number(value).toFixed(1)} KB`;
  return `${Math.round(value)} ms`;
};

/**
 * `k6 run --summary-export` writes the legacy flat shape (`{ "p(95)": … }`,
 * rates as `value`) instead of handleSummary's `{ values: { … } }`. Accept both
 * (staging C, 2026-09-25: the export overwrote the handleSummary file).
 */
export function normalizeMetrics(metrics) {
  return Object.fromEntries(
    Object.entries(metrics ?? {}).map(([name, metric]) => {
      if (metric && typeof metric.values === "object") return [name, metric];
      const flat = { ...(metric ?? {}) };
      if (flat.rate === undefined && typeof flat.value === "number") flat.rate = flat.value;
      return [name, { values: flat }];
    }),
  );
}

const verdict = (value, budget) => {
  if (value === undefined || Number.isNaN(value)) return "n/a";
  return value <= budget ? "✅" : "⚠";
};

/**
 * @param {Record<string, { values: Record<string, number> }>} metrics
 * @returns {Array<Record<string, unknown>>} one entry per budget row
 */
export function measureRows(rawMetrics) {
  const metrics = normalizeMetrics(rawMetrics);
  return rows.map((row) => {
    const present = row.metrics
      .filter((name) => Boolean(metrics[name]))
      .map((name) => ({ name, value: row.value(metrics[name]) }))
      .filter((entry) => Number.isFinite(entry.value));
    if (present.length === 0) {
      return { ...row, measured: undefined, source: undefined };
    }
    const worst = present.reduce((left, right) =>
      left.value >= right.value ? left : right,
    );
    return {
      ...row,
      measured: worst.value,
      source: present.length > 1 ? `${worst.name} (najgori od ${present.length})` : worst.name,
    };
  });
}

function renderTable(measured, label) {
  const lines = [
    `| Metrika | Budžet | Izmjereno${label === undefined ? "" : ` (${label})`} | Izvor brojke |`,
    "|---|---|---|---|",
  ];
  for (const row of measured) {
    lines.push(
      `| ${row.description} | < ${row.budget} ${row.unit} | ${
        row.measured === undefined ? "nije u ovom izvještaju" : format(row.measured, row.unit)
      } ${row.measured === undefined ? "" : verdict(row.measured, row.budget)} | ${
        row.source === undefined ? "k6 izvještaj bez te metrike" : `\`${row.source}\` iz k6 izvještaja`
      } |`,
    );
  }
  lines.push("");
  lines.push("Redovi koje k6 ne može dati (čitaju se iz `api.log`):");
  for (const entry of logOnlyRows) lines.push(`- ${entry}`);
  return lines.join("\n");
}

function selfTest() {
  const metrics = {
    tickets_list_duration: { values: { "p(95)": 180 } },
    search_duration: { values: { "p(95)": 240 } },
    ticket_message_duration: { values: { "p(95)": 380 } },
    http_req_failed: { values: { rate: 0.004 } },
    ticket_list_payload_kb: { values: { "p(95)": 42.5 } },
    dashboard_payload_kb: { values: { "p(95)": 88.1 } },
  };
  const measured = measureRows(metrics);
  const byId = Object.fromEntries(measured.map((row) => [row.id, row]));
  const checks = [
    ["read P95 = najgori read", byId.readP95.measured === 240],
    ["read izvor imenuje metrika", byId.readP95.source === "search_duration (najgori od 2)"],
    ["mutacija P95", byId.mutationP95.measured === 380],
    ["error rate u %", byId.errorRate.measured === 0.4],
    ["payload liste", byId.ticketListPayload.measured === 42.5],
    ["nema metrike → undefined", measureRows({}).every((row) => row.measured === undefined)],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`  ${ok ? "✔" : "✗"} ${name}`);
  if (failed.length > 1) console.log(renderTable(measured, "self-test"));
  return failed.length === 0 ? 0 : 1;
}

function main(argv) {
  if (argv.includes("--self-test")) {
    console.log("perf/import-results.mjs — self-test");
    return selfTest();
  }
  const file = argv.find((arg) => !arg.startsWith("--"));
  if (file === undefined) {
    console.error("usage: node perf/import-results.mjs <perf/results/label.json>");
    return 2;
  }
  const labelIndex = argv.indexOf("--label");
  const label = labelIndex === -1 ? undefined : argv[labelIndex + 1];

  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`ne mogu pročitati ${file}: ${error.message}`);
    return 2;
  }
  const metrics = data.metrics ?? data;
  const measured = measureRows(metrics);
  console.log(renderTable(measured, label ?? file.replace(/^.*\//, "").replace(/\.json$/, "")));
  const outside = measured.filter(
    (row) => row.measured !== undefined && row.measured > row.budget,
  );
  if (outside.length > 0) {
    console.log(
      `\n⚠ ${outside.length} red(ova) iznad budžeta: ${outside.map((row) => row.description).join(", ")}`,
    );
    return 1;
  }
  console.log("\n✔ sve izmjerene stavke su unutar budžeta.");
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
