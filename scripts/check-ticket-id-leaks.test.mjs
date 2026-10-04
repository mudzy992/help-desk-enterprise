import assert from "node:assert/strict";
import { test } from "node:test";
import { findRawKeyLabelLines } from "./check-ticket-id-leaks.mjs";

// The real failure this guard exists for (2026-10-03): the „Usko grlo" and
// „CSAT" tabs in /reports printed raw bucket ids because the view functions
// built their rows with `label: row.key`.
test("hvata labelu postavljenu na sirovi ključ (stvarna regresija)", () => {
  assert.deepEqual(findRawKeyLabelLines("  label: row.key,"), [
    { line: 1, text: "label: row.key," },
  ]);
  assert.deepEqual(findRawKeyLabelLines("    label: bucket.key,"), [
    { line: 1, text: "label: bucket.key," },
  ]);
  assert.deepEqual(findRawKeyLabelLines("  title: row.key,\n  text: row.key,"), [
    { line: 1, text: "title: row.key," },
    { line: 2, text: "text: row.key," },
  ]);
});

test("hvata i {row.key} ispisan kao tekst", () => {
  assert.deepEqual(findRawKeyLabelLines("      <span>{row.key}</span>"), [
    { line: 1, text: "<span>{row.key}</span>" },
  ]);
});

test("propušta ispravne oblike: naziv, prevod, atribut, template literal", () => {
  const allowed = [
    "    label: row.label,",
    "    label: bucket.label.length > 0 ? bucket.label : bucket.key,",
    '    label: t("reports.csat.unknown"),',
    "  key={row.key}",
    "  <li key={`${row.key}-${index}`}>",
    "{t(`reports.packs.names.${pack.key}`)}",
    "  title={selected === null ? \"\" : t(`reports.packs.names.${selected.key}`)}",
    "    label: row.label.length > 0 ? row.label : ticketText(t, row.key),",
  ];
  for (const line of allowed) {
    assert.deepEqual(findRawKeyLabelLines(line), [], line);
  }
});
