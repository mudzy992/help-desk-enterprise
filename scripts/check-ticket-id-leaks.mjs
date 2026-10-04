#!/usr/bin/env node
// Guards the "never show raw ids" rule on ticket screens (see
// 02-FAZNI-PLAN-IMPLEMENTACIJE-TIKETI.md, Faza 2.2). It flags:
//  - an identifier field rendered as visible JSX text, e.g.
//    `{ticket.parentTicketId}`;
//  - an identifier used as a display fallback, e.g. `name ?? ticket.requesterId`;
//  - helpers that turn an identifier into display text
//    (`truncateIdentifier(...)`, `directoryDisplayName(...)`).
//
// Reports were added in val 1 (2026-10-03) after a real regression: the new
// „Uska grla" and „CSAT" tabs printed the raw bucket keys (origin unit, service
// and group ids) because the view functions used `label: row.key`. Two extra
// rules apply to `frontend/src/components/reports`, `frontend/src/lib/reports`
// and `frontend/src/pages/reports-page.tsx`:
//  - `label:` / `title:` / `text:` must not be fed straight from `.key`;
//  - `{something.key}` must not be rendered as JSX text (the React `key={...}`
//    attribute is fine, hence the negative lookbehind for `=`).
// Identifiers used as attribute values (`value={...}`, `to={...}`, `key={...}`)
// or inside template literals (`${...}`) are legitimate and ignored.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scanTargets = [
  { dir: "frontend/src/components/tickets", filePattern: /\.tsx$/ },
  { dir: "frontend/src/components/dashboard", filePattern: /\.tsx$/ },
  { dir: "frontend/src/components/knowledge-base", filePattern: /\.tsx$/ },
  { dir: "frontend/src/components/routing", filePattern: /\.tsx$/ },
  { dir: "frontend/src/components/sla", filePattern: /\.tsx$/ },
  { dir: "frontend/src/components/services", filePattern: /\.tsx$/ },
  { dir: "frontend/src/pages", filePattern: /^knowledge-.*\.tsx$/ },
  { dir: "frontend/src/pages", filePattern: /^ticket-.*\.tsx$/ },
];
// The routing table's first column is the rule's own identifier, so showing a
// shortened id there is the point of the column rather than a leaked reference.
const allowedFiles = new Set(["frontend/src/components/routing/routing-rule-row.tsx"]);
// Report views may use a key as the fallback for a missing name — that is a
// documented, tested behaviour (`label: bucket.label.length > 0 ? … : bucket.key`),
// so these are the only places where `.key` next to `label:` is tolerated.
const keyAsLabelTargets = [
  { dir: "frontend/src/components/reports", filePattern: /\.tsx$/ },
  { dir: "frontend/src/lib/reports", filePattern: /\.ts$/ },
  { dir: "frontend/src/pages", filePattern: /^reports-.*\.tsx$/ },
];
const keyAsLabelPatterns = [
  // `label: bucket.key` — the exact regression from 2026-10-03. The lookbehind
  // keeps `… ? bucket.label : bucket.key` (a documented fallback) out.
  /(?<![.\w])(?:label|title|text)\s*:\s*[\w$.]*\.key\b/,
  // `{row.key}` rendered as JSX text; `key={row.key}` and `${pack.key}` are not.
  /(?<!=)(?<!\$)\{[\w$.]*\.key\}/,
];
const identifierFields = [
  "originUnitId",
  "assignedGroupId",
  "assignedUserId",
  "requesterId",
  "serviceId",
  "formVersionId",
  "parentTicketId",
  "formVersionRef",
];
const fallbackFields = [
  ...identifierFields,
  "originUnitId",
  "userId",
  "groupId",
  "approverUserId",
  "uploadedByUserId",
  "authorUserId",
];
const leakPatterns = [
  new RegExp(`(?<![=$\\w])\\{[A-Za-z]+\\.(?:${identifierFields.join("|")})\\}`),
  new RegExp(`\\?\\?\\s*[A-Za-z.]+\\.(?:${fallbackFields.join("|")})\\b`),
  /\b(?:truncateIdentifier|directoryDisplayName)\(/,
];

// Pure helper so the guard itself is covered by a unit test
// (scripts/check-ticket-id-leaks.test.mjs): returns the offending lines.
export function findRawKeyLabelLines(source) {
  return source
    .split("\n")
    .flatMap((line, index) =>
      keyAsLabelPatterns.some((pattern) => pattern.test(line))
        ? [{ line: index + 1, text: line.trim() }]
        : [],
    );
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const findings = [];
  for (const target of keyAsLabelTargets) {
    for (const file of matchingFiles(root, target)) {
      for (const hit of findRawKeyLabelLines(readFileSync(file, "utf8"))) {
        findings.push(
          `${relative(root, file)}:${hit.line}: raw key used as a label — ${hit.text}`,
        );
      }
    }
  }
  for (const target of scanTargets) {
    for (const file of matchingFiles(root, target)) {
      if (allowedFiles.has(relative(root, file).split("\\").join("/"))) {
        continue;
      }
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (leakPatterns.some((pattern) => pattern.test(line))) {
            findings.push(`${relative(root, file)}:${index + 1}: ${line.trim()}`);
          }
        });
    }
  }

  if (findings.length > 0) {
    console.error("Raw identifiers rendered on screens:\n" + findings.join("\n"));
    process.exit(1);
  }
  console.log(
    "check-ticket-id-leaks: no raw identifiers rendered on ticket or report screens.",
  );
}

function matchingFiles(root, target) {
  return listFiles(join(root, target.dir)).filter(
    (path) =>
      target.filePattern.test(path.split(/[\\/]/).pop() ?? "") &&
      !/\.spec\.tsx?$/.test(path),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
