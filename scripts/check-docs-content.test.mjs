import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteDocsLinks } from "./generate-docs-content.mjs";
import {
  auditDocsRoutes,
  auditWhatsNew,
  changelogEntryDates,
  docsReferencesIn,
  whatsNewEntryDates,
} from "./check-docs-content.mjs";

// Stvarna regresija (2026-10-04): val 2 je ušao u DOCS_CHANGELOG.md, a stranica
// „Šta je novo“ je ostala na 2026-10-03 — nijedna provjera to nije uhvatila.
test("hvata zakašnjelu stranicu „Šta je novo“", () => {
  const problems = auditWhatsNew({
    changelogMarkdown: [
      "## Pregled",
      "",
      "| # | Datum | Modul | Dokumenti | Sažetak |",
      "|---|---|---|---|---|",
      "| M1 | 2026-10-03 | Instalacija | `x.md` | opis |",
      "| **Val 2** | 2026-10-04 | Sigurnost | `y.md` | opis |",
    ].join("\n"),
    whatsNewMarkdown: [
      "| Datum | Šta se promijenilo | Za koga | Detalji |",
      "|---|---|---|---|",
      "| 2026-10-03 | stara izmjena | Svi | `pocetak-rad.md` |",
    ].join("\n"),
    slugs: new Set(["pocetak-rad"]),
    anchors: new Map(),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /2026-10-04/);
  assert.match(problems[0], /2026-10-03/);
});

test("red sa punim datumom pokriva unos i interni red se preskače", () => {
  const changelog = [
    "## Pregled",
    "",
    "| # | Datum | Modul | Dokumenti | Sažetak |",
    "|---|---|---|---|---|",
    "| — | 2026-10-05 | interno | — | interna izmjena [interno] |",
    "| **Val 3** | 2026-10-05 | Pouzdanost | `posta.md` | opis |",
  ].join("\n");
  const whatsNew = [
    "| Datum | Šta se promijenilo | Za koga | Detalji |",
    "|---|---|---|---|",
    "| 2026-10-05 | popravka | Svi | [posta.md](/docs/posta) |",
  ].join("\n");
  assert.deepEqual(
    auditWhatsNew({
      changelogMarkdown: changelog,
      whatsNewMarkdown: whatsNew,
      slugs: new Set(["posta"]),
      anchors: new Map(),
    }),
    [],
  );
  // `[interno]` red ne doprinosi datumima, pa sam ne tjera novi red u „Šta je novo“.
  assert.deepEqual(changelogEntryDates(changelog), ["2026-10-05"]);
  assert.deepEqual(
    changelogEntryDates("## Pregled\n\n| # | Datum | Modul | Dokumenti | Sažetak |\n|---|---|---|---|---|\n| — | 2026-10-06 | interno | — | opis [interno] |\n"),
    [],
  );
  assert.deepEqual(whatsNewEntryDates(whatsNew), ["2026-10-05"]);
});

test("hvata referencu iz kolone Detalji koja nije objavljena stranica", () => {
  const problems = auditWhatsNew({
    changelogMarkdown: "## Pregled\n\n| # | Datum |\n|---|---|\n",
    whatsNewMarkdown: [
      "| Datum | Šta se promijenilo | Za koga | Detalji |",
      "|---|---|---|---|",
      "| 2026-10-05 | izmjena | Svi | [nepostojeca.md](/docs/nepostojeca) |",
    ].join("\n"),
    slugs: new Set(["posta"]),
    anchors: new Map(),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nije objavljena stranica/);
});

test("docsReferencesIn čita i `x.md` i `/docs/x#anchor` oblik", () => {
  assert.deepEqual(docsReferencesIn("`tiketi.md`, [posta.md](/docs/posta#uvod)"), [
    { slugOrFile: "tiketi", anchor: null },
    { slugOrFile: "posta", anchor: "uvod" },
  ]);
});

test("ruta u vodiču mora pogoditi stranicu i anchor", () => {
  const problems = auditDocsRoutes({
    files: ["tiketi.md"],
    readFile: () => "vidi [Poštu](/docs/posta#uvod) i [nepoznato](/docs/nema)",
    slugs: new Set(["posta"]),
    anchors: new Map([["posta", new Set(["uvod"])]]),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nema objavljenu stranicu/);
});

test("ogledalo prevodi samo veze na objavljene stranice", () => {
  const body = "Vidi [Poštu](posta.md), [teze](TEZE-ZA-DOKUMENTACIJU.md) i [dio](tiketi.md#uvod).";
  assert.equal(
    rewriteDocsLinks(body, new Set(["posta", "tiketi"])),
    "Vidi [Poštu](/docs/posta), [teze](TEZE-ZA-DOKUMENTACIJU.md) i [dio](/docs/tiketi#uvod).",
  );
});
