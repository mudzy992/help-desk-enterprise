import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildFindingsPlan, parseFindingRows, unitPlans, validateFindingsPlan } from "./check-backend-findings.mjs";

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
