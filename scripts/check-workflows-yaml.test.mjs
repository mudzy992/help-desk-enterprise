import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findWorkflowProblems } from "./check-workflows-yaml.mjs";

// The real failure this guard exists for: GitHub refused the whole file with
// ".github/workflows/ci.yml#L73 — You have an error in your yaml syntax".
test("hvata dvotočku u neukotvljenoj vrijednosti koraka", () => {
  const source = [
    "jobs:",
    "  frontend:",
    "    steps:",
    "      - name: Check the ticket-list page size (val 1 regresija: pageSize 100)",
    "        run: node ../scripts/check-ticket-list-page-size.mjs",
  ].join("\n");
  assert.deepEqual(findWorkflowProblems(source, "ci.yml"), [
    "ci.yml:4 neukotvljena vrijednost sadrži dvotočku — stavi je pod navodnike: name: Check the ticket-list page size (val 1 regresija: pageSize 100)",
  ]);
});

test("hvata i vrijednost koja završava dvotočkom i tab u uvlačenju", () => {
  assert.equal(findWorkflowProblems("name: CI:").length, 1);
  assert.equal(findWorkflowProblems("jobs:\n\tfrontend:").length, 1);
});

test("propušta ispravne oblike: navodnici, URL, blok skalar, komentar, lista", () => {
  const source = [
    "name: CI",
    "on:",
    "  push:",
    "    branches: [main, master]",
    "jobs:",
    "  build:",
    "    name: Backend build + test",
    "    steps:",
    "      - run: npm ci",
    "      - run: npm test -- --ci --coverage=false",
    "      - name: \"Korak: sa dvotočkom\"",
    "        run: node script.mjs",
    "      - name: Bez problema (Paket 4.1 §7a)",
    "        run: |",
    "          echo \"Note: ovo je sadržaj blok skalara\"",
    "          node -e \"console.log('a: b')\"",
    "      # komentar: sa dvotočkom",
    "      - uses: actions/checkout@v4",
    "      - run: curl https://example.com/api",
  ].join("\n");
  assert.deepEqual(findWorkflowProblems(source), []);
});

// E2E na pushu u `master` ne provjerava stabilan deployment: Coolify ga istovremeno rebuilda.
test("CI E2E je ograničen na PR s promjenama koda, schedule i ručni dispatch", () => {
  const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = workflow.indexOf("  e2e:");
  const end = workflow.indexOf("  gate:", start);
  assert.notEqual(start, -1, "e2e job postoji");
  assert.notEqual(end, -1, "gate job slijedi e2e job");
  const e2eJob = workflow.slice(start, end);
  const conditionStart = e2eJob.indexOf("    if: >-");
  const conditionEnd = e2eJob.indexOf("    needs:", conditionStart);
  assert.notEqual(conditionStart, -1, "e2e job ima uslov");
  assert.notEqual(conditionEnd, -1, "e2e uslov završava prije needs");
  const condition = e2eJob.slice(conditionStart, conditionEnd);
  const expression = condition
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .join(" ")
    .trim();

  assert.equal(
    expression,
    "( (github.event_name == 'pull_request' && needs.changes.outputs.code == 'true') || " +
      "github.event_name == 'schedule' || github.event_name == 'workflow_dispatch' ) && " +
      "needs.backend.result == 'success' && needs.frontend.result == 'success'",
  );
});

// Stvarna regresija (2026-10-05): korak je dobio drugi `run:` umjesto novog
// koraka — GitHub je odbio cijeli workflow (run je završio bez ijednog joba).
test("hvata ponovljeni ključ u istom bloku, a ne u susjednim koracima", () => {
  const duplicated = [
    "jobs:",
    "  frontend:",
    "    steps:",
    "      - name: Check docs content and mirror sync",
    "        run: node ../scripts/check-docs-content.mjs",
    "        run: node --test ../scripts/check-docs-content.test.mjs",
  ].join("\n");
  assert.deepEqual(findWorkflowProblems(duplicated, "ci.yml"), [
    'ci.yml:6 ponovljeni ključ "run" u istom bloku — GitHub odbija cijeli workflow',
  ]);

  // Isti ključ u dva različita koraka (ili dva elementa liste) je ispravan.
  const separate = [
    "jobs:",
    "  frontend:",
    "    steps:",
    "      - uses: actions/checkout@v5",
    "        with:",
    "          fetch-depth: 0",
    "      - name: Check docs content and mirror sync",
    "        run: node ../scripts/check-docs-content.mjs",
    "      - name: Test the docs-content guard itself",
    "        run: node --test ../scripts/check-docs-content.test.mjs",
  ].join("\n");
  assert.deepEqual(findWorkflowProblems(separate, "ci.yml"), []);
});
