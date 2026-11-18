import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import bosnian from "@/i18n/locales/bs/common.json";
import english from "@/i18n/locales/en/common.json";
import { retentionCategories } from "@/services/privacy-api";

/*
  W7.34 (BA-problems-16): the retention panel lists the categories from
  `retentionCategories`, while the backend decides which executors run. The two
  drifted once already (`statusIncidents` existed in the API and in both
  locales but was missing from the list, so an operator could not see or filter
  its runs). The list is now checked against the backend constants and against
  the labels, so a new category cannot ship half-wired.
*/
const constantsSource = readFileSync(
  resolve(__dirname, "../../../backend/src/modules/privacy/privacy.constants.ts"),
  "utf8",
);
const declared = constantsSource.match(/export const retentionCategories = \[([\s\S]*?)\]/);
if (declared === null) throw new Error("retentionCategories not found in the backend constants");
const backendCategories = [...declared[1].matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]);

describe("privacy retention categories", () => {
  it("lists exactly the categories the backend executes", () => {
    expect(backendCategories.length).toBeGreaterThan(0);
    expect([...retentionCategories].sort()).toEqual([...backendCategories].sort());
  });

  it.each([
    ["bs", bosnian.privacy.retention.categories],
    ["en", english.privacy.retention.categories],
  ] as const)("%s names and explains every category", (_locale, catalog) => {
    for (const category of backendCategories) {
      const entry = (catalog as Record<string, { name?: string; hint?: string }>)[category];
      expect(entry?.name, category).toBeTruthy();
      expect(entry?.hint, category).toBeTruthy();
    }
  });
});
