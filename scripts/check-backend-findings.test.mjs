import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildFindingsPlan, parseFindingRows, unitPlans, validateFindingsPlan } from "./check-backend-findings.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withAuditFixtures(mutate, run) {
  const directory = await mkdtemp(path.join(tmpdir(), "backend-findings-"));
  try {
    for (let unit = 1; unit <= 44; unit += 1) {
      const number = String(unit).padStart(2, "0");
      const body = `| ID | Prioritet | Nalaz | Status |\n|---|---|---|---|\n| BA-u${number}-01 | P2 | primjer | otvoreno |\n`;
      await writeFile(path.join(directory, `${number}-unit.md`), body);
    }
    await mutate(directory);
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("svih 44 audit jedinice imaju eksplicitan workstream i val", () => {
  assert.equal(Object.keys(unitPlans).length, 44);
  for (let unit = 1; unit <= 44; unit += 1) {
    const [owner, wave] = unitPlans[unit];
    assert.match(owner, /^WS-[A-H]$/u);
    assert.ok(Number.isInteger(wave) && wave >= 1 && wave <= 9);
  }
});

test("gradi determinističan plan iz source audit tabela", async () => {
  await withAuditFixtures(async () => undefined, async (directory) => {
    const first = await buildFindingsPlan(directory);
    const second = await buildFindingsPlan(directory);
    assert.deepEqual(first, second);
    assert.equal(first.units, 44);
    assert.equal(first.total, 44);
    assert.deepEqual(first.severity, { P1: 0, P2: 44, P3: 0 });
    assert.deepEqual(first.findings[0], {
      id: "BA-u01-01",
      severity: "P2",
      source: "01-unit.md",
      owner: "WS-A",
      wave: 2,
      status: "otvoreno",
    });
  });
});

test("W7.10 BA-assets-10 closeout je zatvoren u izvornom registry planu", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const finding = plan.findings.find(({ id }) => id === "BA-assets-10");
  assert.deepEqual(
    { source: finding?.source, status: finding?.status },
    { source: "22-assets.md", status: "zatvoreno" },
  );
});

test("W7.11 BA-assets-11 closeout je zatvoren u izvornom registry planu", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const finding = plan.findings.find(({ id }) => id === "BA-assets-11");
  assert.deepEqual(
    { source: finding?.source, status: finding?.status },
    { source: "22-assets.md", status: "zatvoreno" },
  );
});

test("W6.38–W6.40 zatvaraju BA-inbound-email-01/02/03, a BA-04 ostaje P2 otvoren", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, severity, status }) => [id, { source, severity, status }]));
  for (const id of ["BA-inbound-email-01", "BA-inbound-email-02", "BA-inbound-email-03"]) {
    assert.deepEqual(byId.get(id), {
      source: "20-inbound-email.md",
      severity: "P1",
      status: "zatvoreno",
    });
  }
  assert.deepEqual(byId.get("BA-inbound-email-04"), {
    source: "20-inbound-email.md",
    severity: "P2",
    status: "otvoreno",
  });
});

test("BA-06/07/08/09/13/14/15 closeouti su evidentirani", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  assert.deepEqual(byId.get("BA-service-catalog-06"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-07"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-08"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-09"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-13"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-14"), { source: "15-service-catalog.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-service-catalog-15"), { source: "15-service-catalog.md", status: "zatvoreno" });
});

test("W7.13 closeout ostaje evidentiran za BA-assets-13", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  assert.deepEqual(byId.get("BA-assets-12"), { source: "22-assets.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-assets-13"), { source: "22-assets.md", status: "zatvoreno" });
});

test("W7.14 statusi ostaju tačni uz kasniji owner-directed BA-assets-16 closeout", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  for (let id = 12; id <= 19; id += 1) {
    assert.deepEqual(byId.get(`BA-assets-${id}`), { source: "22-assets.md", status: "zatvoreno" });
  }
});

test("W7.15 i naknadni asset closeouti čuvaju samo pojedinačne BA statuse", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  for (let id = 15; id <= 19; id += 1) {
    assert.deepEqual(byId.get(`BA-assets-${id}`), { source: "22-assets.md", status: "zatvoreno" });
  }
});

test("W7.16 owner closeout, W7.17, W7.18 i W7.19 imaju pojedinačne zatvorene statuse", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  for (let id = 16; id <= 19; id += 1) {
    assert.deepEqual(byId.get(`BA-assets-${id}`), { source: "22-assets.md", status: "zatvoreno" });
  }
});

test("owner-directed W7.16 closeout does not change W7.18/W7.19 status", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, status }) => [id, { source, status }]));
  assert.deepEqual(byId.get("BA-assets-16"), { source: "22-assets.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-assets-18"), { source: "22-assets.md", status: "zatvoreno" });
  assert.deepEqual(byId.get("BA-assets-19"), { source: "22-assets.md", status: "zatvoreno" });
});

test("čita escaped pipe u naslovu i izvorni status", () => {
  assert.deepEqual(
    parseFindingRows("| BA-xcut-04 | P1 | `npm ci \\|\\| npm install` | zatvoreno |"),
    [{ id: "BA-xcut-04", severity: "P1", status: "zatvoreno" }],
  );
});

test("odbija dupliciran BA ID između audit jedinica", async () => {
  await withAuditFixtures(
    (directory) => writeFile(
      path.join(directory, "02-unit.md"),
      "| ID | Prioritet | Nalaz | Status |\n|---|---|---|---|\n| BA-u01-01 | P1 | duplikat | otvoreno |\n",
    ),
    async (directory) => {
      await assert.rejects(() => buildFindingsPlan(directory), /dupliciran finding ID/u);
    },
  );
});

test("production baseline validator zaključava broj i severity zbir", () => {
  const findings = Array.from({ length: 692 }, (_, index) => ({
    id: `BA-test-${index}`,
    severity: index < 174 ? "P1" : index < 542 ? "P2" : "P3",
    source: "fixture.md",
    owner: "WS-H",
    wave: 1,
    status: "otvoreno",
  }));
  assert.deepEqual(
    validateFindingsPlan({
      units: 44,
      total: findings.length,
      severity: { P1: 174, P2: 368, P3: 150 },
      findings,
    }),
    [],
  );
});
