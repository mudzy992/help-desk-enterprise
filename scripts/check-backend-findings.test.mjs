import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import {
  applyTotalsBlock,
  applyWaveCounts,
  buildFindingsPlan,
  parseFindingRows,
  parseRegisterRows,
  renderTotalsBlock,
  summarizeFindings,
  totalsEndMarker,
  totalsStartMarker,
  unitPlans,
  validateFindingsPlan,
  validateRegisterRows,
} from "./check-backend-findings.mjs";

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

test("W6.38–W6.40 zatvaraju inbound-email-01/02/03, a inbound-email-04 je naknadno zatvoren operativnom potvrdom", async () => {
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
    status: "zatvoreno",
  });
});

test("W6.47 zatvara BA-announcements-04, a P2/P3 ostaju otvoreni", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const byId = new Map(plan.findings.map(({ id, source, severity, status }) => [id, { source, severity, status }]));
  for (const [id, closeout] of [
    ["BA-announcements-01", "W6.44"],
    ["BA-announcements-02", "W6.45"],
    ["BA-announcements-03", "W6.46"],
    ["BA-announcements-04", "W6.47"],
  ]) {
    assert.deepEqual(byId.get(id), {
      source: "28-announcements.md",
      severity: "P1",
      status: `zatvoreno (${closeout})`,
    });
  }
  // BA-announcements-12 is closed by paket 206 (audit 28 §32); BA-18 was the
  // last open announcements P3 and is closed by paket 212 (audit 28 §44).
  assert.deepEqual(byId.get("BA-announcements-12"), {
    source: "28-announcements.md",
    severity: "P2",
    status: "zatvoreno",
  });
  assert.deepEqual(byId.get("BA-announcements-18"), {
    source: "28-announcements.md",
    severity: "P3",
    status: "zatvoreno",
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
  const findings = Array.from({ length: 696 }, (_, index) => ({
    id: `BA-test-${index}`,
    severity: index < 174 ? "P1" : index < 545 ? "P2" : "P3",
    source: "fixture.md",
    owner: "WS-H",
    wave: 1,
    status: "otvoreno",
  }));
  assert.deepEqual(
    validateFindingsPlan({
      units: 44,
      total: findings.length,
      severity: { P1: 174, P2: 371, P3: 151 },
      findings,
    }),
    [],
  );
});

test("Val 6 posljednjih deset nalaza zatvoreno je odlukom vlasnika", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const ids = ["BA-notifications-14", "BA-websocket-12", "BA-websocket-13", "BA-websocket-14", "BA-integration-queue-13", "BA-integration-queue-14", "BA-integration-queue-15", "BA-inbound-email-11", "BA-inbound-email-12", "BA-inbound-email-13"];
  for (const id of ids) {
    assert.equal(plan.findings.find((finding) => finding.id === id)?.status, "zatvoreno (owner-directed)", id);
  }
  const wave = plan.findings.filter((finding) => finding.wave === 6);
  assert.equal(wave.length, 111);
  assert.equal(wave.filter((finding) => !finding.status.startsWith("zatvoreno")).length, 0);
});

const planFixture = (statuses) => ({
  units: 44,
  total: statuses.length,
  severity: { P1: statuses.filter((s) => s.startsWith("P1")).length, P2: 0, P3: 0 },
  findings: statuses.map((entry, index) => {
    const [, status] = entry.split(":");
    return {
      id: `BA-test-${String(index).padStart(2, "0")}`,
      severity: "P2",
      source: "01-unit.md",
      owner: "WS-A",
      wave: 2,
      status,
    };
  }),
});

test("registar: čita red tabele sa escaped pipe i bez backtickova", () => {
  const rows = parseRegisterRows(
    "| 24 | `changes` | `BA-changes-17` | P2 | Privatnost | zatvoreno (W7.74) | [24](audits/24-changes.md) |\n" +
      "| 44 | `xcut` | `BA-xcut-04` | P1 | `npm ci \\|\\| npm` | otvoreno | [44](audits/44.md) |\n",
  );
  assert.deepEqual(rows, [
    { unit: 24, module: "changes", id: "BA-changes-17", severity: "P2", status: "zatvoreno (W7.74)" },
    { unit: 44, module: "xcut", id: "BA-xcut-04", severity: "P1", status: "otvoreno" },
  ]);
});

test("registar: dupliciran ID, nepoznat ID i razlika klase statusa padaju", () => {
  const plan = planFixture(["P2:zatvoreno", "P2:otvoreno"]);
  const rows = parseRegisterRows(
    "| 1 | `a` | `BA-test-00` | P2 | x | zatvoreno | [x](x.md) |\n" +
      "| 1 | `a` | `BA-test-00` | P2 | x | otvoreno | [x](x.md) |\n" +
      "| 1 | `a` | `BA-test-01` | P2 | x | zatvoreno | [x](x.md) |\n" +
      "| 1 | `a` | `BA-unknown-01` | P2 | x | otvoreno | [x](x.md) |\n",
  );
  const errors = validateRegisterRows(rows, plan);
  assert.ok(errors.some((error) => error.includes("dupliciran ID: BA-test-00")), errors.join("; "));
  assert.ok(errors.some((error) => error.includes("ID koji nije u planu: BA-unknown-01")), errors.join("; "));
  assert.ok(errors.some((error) => error.includes('BA-test-01: registar "zatvoreno"')), errors.join("; "));
});

test("registar: skraćen status (bez kvalifikatora) je ista klasa", () => {
  const plan = planFixture(["P2:zatvoreno (W7.74)"]);
  const rows = parseRegisterRows("| 1 | `a` | `BA-test-00` | P2 | x | zatvoreno | [x](x.md) |");
  assert.deepEqual(validateRegisterRows(rows, plan), []);
});

test("registar: nedostajući red i razlika u broju redova padaju", () => {
  const plan = planFixture(["P2:otvoreno", "P2:otvoreno"]);
  const rows = parseRegisterRows("| 1 | `a` | `BA-test-00` | P2 | x | otvoreno | [x](x.md) |");
  const errors = validateRegisterRows(rows, plan);
  assert.ok(errors.some((error) => error.includes("ne sadrži 1 nalaza")), errors.join("; "));
  assert.ok(errors.some((error) => error.includes("registar ima 1 redova, plan 2")), errors.join("; "));
});

test("zbir: broji zatvoreno, otvoreno po prioritetu i val 7", () => {
  const plan = {
    units: 44,
    total: 3,
    severity: { P1: 1, P2: 2, P3: 0 },
    findings: [
      { id: "BA-a", severity: "P1", source: "01-a.md", owner: "WS-A", wave: 2, status: "zatvoreno" },
      { id: "BA-b", severity: "P2", source: "24-b.md", owner: "WS-F", wave: 7, status: "zatvoreno (W7.74)" },
      { id: "BA-c", severity: "P2", source: "24-b.md", owner: "WS-F", wave: 7, status: "otvoreno" },
    ],
  };
  const summary = summarizeFindings(plan);
  assert.equal(summary.closed, 2);
  assert.equal(summary.open, 1);
  assert.deepEqual(summary.openSeverity, { P1: 0, P2: 1, P3: 0 });
  assert.deepEqual(summary.waves, [
    { wave: 2, total: 1, closed: 1, open: 0, openSeverity: { P1: 0, P2: 0, P3: 0 } },
    { wave: 7, total: 2, closed: 1, open: 1, openSeverity: { P1: 0, P2: 1, P3: 0 } },
  ]);
  const block = renderTotalsBlock(plan);
  assert.match(block, new RegExp(`^${totalsStartMarker}`, "u"));
  assert.match(block, new RegExp(`${totalsEndMarker}$`, "u"));
  assert.match(block, /- Zatvoreno: \*\*2\*\*/u);
  assert.match(block, /Val 7: \*\*1 \/ 2\*\*/u);
});

test("zbir: blok se zamjenjuje između markera, okolni tekst ostaje", () => {
  const markdown = `prije\n${totalsStartMarker}\nstaro\n${totalsEndMarker}\nposlije`;
  const updated = applyTotalsBlock(markdown, `${totalsStartMarker}\nnovo\n${totalsEndMarker}`);
  assert.equal(updated, `prije\n${totalsStartMarker}\nnovo\n${totalsEndMarker}\nposlije`);
  assert.throws(() => applyTotalsBlock("bez markera", "x"), /markeri/u);
});

test("wave tabela: mijenjaju se samo dvije numeričke kolone", () => {
  const plan = {
    units: 44,
    total: 2,
    severity: { P1: 0, P2: 2, P3: 0 },
    findings: [
      { id: "BA-a", severity: "P2", source: "24-a.md", owner: "WS-F", wave: 7, status: "zatvoreno" },
      { id: "BA-b", severity: "P2", source: "24-a.md", owner: "WS-F", wave: 7, status: "otvoreno" },
    ],
  };
  const table = [
    "| Val | Obuhvat | Dnevnik | Zatvoreno / ukupno | Otvoreno (P1/P2/P3) | Zaključak |",
    "| --- | --- | --- | ---: | ---: | --- |",
    "| 7 | moduli | dnevnik bez broja | 26 / 109 | 83 (14/49/20) | tekst |",
  ].join("\n");
  const updated = applyWaveCounts(table, plan).split("\n");
  assert.equal(updated[2], "| 7 | moduli | dnevnik bez broja | 1 / 2 | 1 (0/1/0) | tekst |");
  assert.equal(
    updated[0],
    "| Val | Obuhvat | Dnevnik | Zatvoreno / ukupno | Otvoreno (P1/P2/P3) | Zaključak |",
  );
  assert.equal(updated[1], "| --- | --- | --- | ---: | ---: | --- |");
});

test("realni repozitorij: registar, plan i zbirovi su usklađeni", async () => {
  const plan = await buildFindingsPlan(path.join(repositoryRoot, "docs/backend/audits"));
  const register = await readFile(path.join(repositoryRoot, "docs/backend/BACKEND-FINDINGS-REGISTER.md"), "utf8");
  const rows = parseRegisterRows(register);
  assert.deepEqual(validateRegisterRows(rows, plan), []);
  assert.equal(rows.length, plan.total);
  for (const document of [
    "docs/backend/BACKEND-FINDINGS-REGISTER.md",
    "docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md",
    "docs/backend/audits/README.md",
  ]) {
    const markdown = await readFile(path.join(repositoryRoot, document), "utf8");
    assert.ok(markdown.includes(totalsStartMarker), `${document} nema generisani blok`);
    assert.equal(
      applyTotalsBlock(markdown, renderTotalsBlock(plan)),
      markdown,
      `${document}: zbirovi nisu sinhronizovani`,
    );
  }
  const masterPlan = await readFile(
    path.join(repositoryRoot, "docs/backend/BACKEND-IMPLEMENTATION-MASTER-PLAN.md"),
    "utf8",
  );
  assert.equal(applyWaveCounts(masterPlan, plan), masterPlan, "wave tabela nije sinhronizovana");
});
