import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findWorkflowProblems } from "./check-workflows-yaml.mjs";

const workflowPath = new URL("../.github/workflows/ci.yml", import.meta.url);

/** Blok jednog joba: od `  ime:` do sljedećeg ključa na istom uvlačenju. */
function readJob(workflow, name) {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.notEqual(start, -1, `${name} job postoji`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {2}[a-z][a-z0-9-]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * `if: >-` je blok skalar; GitHub ga vidi kao jedan red. Bez `>` bi dvotočka u
 * uslovu razbila YAML, pa se uslov drži na više redova — a ovdje se sklapa
 * nazad, jer se upravo taj sklopljeni izraz provjerava.
 */
function readJobCondition(workflow, name) {
  const job = readJob(workflow, name);
  const conditionStart = job.indexOf("    if: >-");
  const conditionEnd = job.indexOf("    needs:", conditionStart);
  assert.notEqual(conditionStart, -1, `${name} job ima uslov`);
  assert.notEqual(conditionEnd, -1, `${name} uslov završava prije needs`);
  return job
    .slice(conditionStart, conditionEnd)
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .join(" ")
    .trim();
}

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

test("backend findings dokumenti pokreću code i docs gateove", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  assert.ok(workflow.includes("docs/backend/BACKEND-FINDINGS-REGISTER.md|docs/backend/backend-findings-plan.json|docs/backend/audits/*)"));
  assert.ok(workflow.includes("code=true\n                  docs=true"));
});

// E2E na pushu u `master` ne provjerava stabilan deployment: Coolify ga istovremeno rebuilda.
// Izuzetak je dispatch sa `install_spec` (F6): tada se obični E2E **povlači**, jer njegov
// `globalSetup` poziva `ensureInstall` i završi instalaciju koju wizard spec upravo hoda.
test("CI E2E je ograničen na PR s promjenama koda, schedule i ručni dispatch", () => {
  const workflow = readFileSync(workflowPath, "utf8");

  assert.equal(
    readJobCondition(workflow, "e2e"),
    "!cancelled() && " +
      "( (github.event_name == 'pull_request' && needs.changes.outputs.code == 'true') || " +
      "github.event_name == 'schedule' || " +
      // TEMPORARY (Arena session arena/7a60171e): push trigger workaround in
      // ci.yml because the session token has no actions:write. Revert together.
      "(github.event_name == 'push' && github.ref == 'refs/heads/arena/7a60171e-help-desk-enterprise') || " +
      "(github.event_name == 'workflow_dispatch' && inputs.install_spec == '') ) && " +
      "( inputs.skip_gates == true || " +
      "(needs.backend.result == 'success' && needs.frontend.result == 'success') )",
  );
});

// Zajedno se ne smiju pokrenuti: obični E2E bi kroz API završio instalaciju koju
// wizard spec (51/52) prolazi kroz UI, pa bi oba speca pala na `isCompleted`.
test("install-wizard dispatch povlači obični E2E, a zaseban posao traži spec", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const wizard = readJobCondition(workflow, "e2e-install-wizard");
  const e2e = readJobCondition(workflow, "e2e");

  // Wizard posao se ne pokreće bez izabranog speca i bez zelenih buildova.
  assert.ok(
    wizard.includes("github.event_name == 'workflow_dispatch'") &&
      wizard.includes("inputs.install_spec != ''") &&
      wizard.includes("needs.backend.result == 'success'") &&
      wizard.includes("needs.frontend.result == 'success'"),
    `neočekivan uslov wizard posla: ${wizard}`,
  );
  // `skip_gates` (default uključen za ručni dispatch) preskače backend i frontend —
  // i tada oba E2E posla moraju prihvatiti preskočene gateove, inače se wizard
  // posao nikad ne pokrene iako su mu zavisnosti „skipped“.
  assert.ok(
    readJobCondition(workflow, "e2e-install-wizard").includes("inputs.skip_gates == true") &&
      e2e.includes("inputs.skip_gates == true"),
    "oba E2E posla moraju imati `skip_gates` izlaz",
  );
  for (const gated of ["backend", "frontend"]) {
    assert.ok(
      readJob(workflow, gated).includes("inputs.skip_gates != true"),
      `${gated} se mora preskočiti kad je skip_gates uključen`,
    );
  }
  // Stvarna regresija (2026-10-16): dispatch je preskočio backend i frontend, a GitHub je
  // onda preskočio i oba E2E posla — njihov sopstveni `if` je bio tačan, ali bez status
  // funkcije zavisnost koja je `skipped` vuče i zavisni posao u `skipped`.
  for (const [name, condition] of [
    ["e2e", e2e],
    ["e2e-install-wizard", wizard],
  ]) {
    assert.ok(
      condition.startsWith("!cancelled() &&"),
      `${name} mora početi sa !cancelled(): ${condition}`,
    );
  }
  const inputs = workflow.slice(workflow.indexOf("  workflow_dispatch:"), workflow.indexOf("concurrency:"));
  assert.ok(
    inputs.includes("skip_gates:") && inputs.includes("default: true"),
    "skip_gates je dispatch input sa zadanim `true`",
  );
  // I obrnuto: čim je spec izabran, obični E2E staje.
  assert.ok(
    e2e.includes("inputs.install_spec == ''"),
    `obični E2E nema izuzetak za wizard dispatch: ${e2e}`,
  );
  assert.notEqual(
    workflow.indexOf("  e2e-install-wizard:"),
    -1,
    "wizard posao je i dalje u workflowu",
  );
});

test("backend job zaključava route manifest i izvršava API/worker wiring suiteove", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const backend = readJob(workflow, "backend");
  assert.ok(backend.includes("npm run wiring:check"));
  assert.ok(backend.includes("npm run wiring:test"));
  assert.ok(backend.includes("npm run test:wiring"));
  assert.ok(
    backend.indexOf("npm run wiring:check") < backend.indexOf("npm run build"),
    "stale manifest mora pasti prije builda",
  );
});

test("backend container job gradi image, izvršava runtime probe i ulazi u gate", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const container = readJob(workflow, "container");
  const gate = readJob(workflow, "gate");
  assert.ok(container.includes("npm run container:check"));
  assert.ok(container.includes("docker compose config --quiet"));
  assert.ok(container.includes("docker build --pull"));
  assert.ok(container.includes("npm run container:runtime:test"));
  assert.ok(gate.includes("container"));
  assert.ok(gate.includes("needs.container.result"));
});

test("backend integration job ima disposable PostgreSQL/Redis i ulazi u završni gate", () => {
  const workflow = readFileSync(workflowPath, "utf8");
  const integration = readJob(workflow, "backend-integration");
  const gate = readJob(workflow, "gate");
  assert.ok(integration.includes("image: postgres:17-alpine"));
  assert.ok(integration.includes("image: redis:7-alpine"));
  assert.ok(integration.includes("npm run db:migrate"));
  assert.ok(integration.includes("npm run test:integration"));
  assert.ok(gate.includes("needs: [changes, backend, backend-integration,"));
  assert.ok(gate.includes("needs.backend-integration.result"));
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
