import assert from "node:assert/strict";
import { test } from "node:test";
import { rewriteDocsLinks } from "./generate-docs-content.mjs";
import {
  auditDocsRoutes,
  auditWhatsNew,
  changelogEntryDates,
  differingUpdatedAt,
  docsReferencesIn,
  sameManifestIgnoringDates,
  validateTranslation,
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

// CI je bio crven od vala 3 (2026-10-05) i opet 2026-10-06: `updatedAt` u manifestu dolazi iz gita, pa
// zavisi od dubine klona (plitak klon daje datum vršnog commita) i od trenutka generisanja (datum je tačan
// samo ako je ogledalo generisano poslije commita stranice). Kapija zato datume ne poreda — prijavljuje ih
// kao napomenu — a sve ostalo u manifestu mora biti identično.
test("u manifestu se datumi ne porede, ostalo mora", () => {
  const manifest = (dates, title = "Početak rada") =>
    JSON.stringify({
      pages: [{ slug: "pocetak-rad", title, updatedAt: dates }],
    });
  assert.equal(
    sameManifestIgnoringDates(manifest("2026-10-05"), manifest("2026-10-02")),
    true,
  );
  assert.equal(
    sameManifestIgnoringDates(manifest("2026-10-05"), manifest("2026-10-05", "Drugi naslov")),
    false,
  );
  assert.equal(sameManifestIgnoringDates("nije json", manifest("2026-10-05")), false);
});

// Napomena mora imenovati stranice koje kasne, da se u CI izlazu vidi šta osvježiti u punom klonu.
test("razlika u datumima se imenuje po stranicama", () => {
  const manifest = (pages) => JSON.stringify({ pages });
  const page = (slug, updatedAt) => ({ slug, title: slug, updatedAt });
  assert.deepEqual(
    differingUpdatedAt(
      manifest([page("tiketi", "2026-10-04"), page("sla", "2026-10-05")]),
      manifest([page("tiketi", "2026-10-05"), page("sla", "2026-10-05")]),
    ),
    ["tiketi"],
  );
  assert.deepEqual(
    differingUpdatedAt(
      manifest([page("tiketi", null)]),
      manifest([page("tiketi", "2026-10-05")]),
    ),
    ["tiketi"],
  );
  assert.deepEqual(
    differingUpdatedAt(manifest([page("tiketi", "2026-10-05")]), manifest([page("tiketi", "2026-10-05")])),
    [],
  );
  assert.deepEqual(differingUpdatedAt("nije json", manifest([])), []);
});

// Val 5 (EN stranice): prevod je isti dokument na drugom jeziku, pa mora imati
// bosanski original i ime fajla jednako slugu; naslov iz frontmattera mora
// odgovarati `#` naslovu (isti uslov kao za bosanske stranice).
test("prevod bez bosanske stranice, pogrešno ime fajla i različit naslov su greške", () => {
  const bosnian = new Set(["tiketi"]);
  const valid = validateTranslation(
    { file: "tiketi.md", meta: { slug: "tiketi", title: "Tickets" }, body: "# Tickets\n", title: "Tickets" },
    bosnian,
  );
  assert.deepEqual(valid, []);

  assert.deepEqual(
    validateTranslation(
      { file: "nepoznato.md", meta: { slug: "nepoznato", title: "X" }, body: "# X\n", title: "X" },
      bosnian,
    ),
    ['en/nepoznato.md: slug "nepoznato" nema bosanske stranice'],
  );
  assert.deepEqual(
    validateTranslation(
      { file: "drugi.md", meta: { slug: "tiketi", title: "X" }, body: "# X\n", title: "X" },
      bosnian,
    ),
    ['en/drugi.md: ime fajla mora biti "<slug>.md"'],
  );
  assert.deepEqual(
    validateTranslation(
      { file: "tiketi.md", meta: { slug: "tiketi", title: "Tickets" }, body: "# Tiketi\n", title: "Tiketi" },
      bosnian,
    ),
    ['en/tiketi.md: naslov u frontmatteru i naslov "#" se razlikuju'],
  );
});
