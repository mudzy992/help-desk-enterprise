import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const scopedFiles = [
  "pages/users-page.tsx",
  "pages/groups-page.tsx",
  "lib/users/use-user-role-scope-summaries.ts",
  "components/policy-packs/policy-packs-panel.tsx",
  "components/services/service-catalog-mutation-sheet.tsx",
  "components/knowledge-base/portal/article-from-reply-sheet.tsx",
] as const;

describe("partial-resource scope contract", () => {
  it.each(scopedFiles)("uses the explicit partial-resource contract in %s", (path) => {
    expect(source(path)).toContain("usePartialResource");
  });

  it("does not convert scoped endpoint failures to successful empty arrays", () => {
    const combined = scopedFiles.map(source).join("\n");
    expect(combined).not.toMatch(/listServices\(\)\.catch\(\(\) => \[\]\)/);
    expect(combined).not.toMatch(/listRoutingRules\(\)\.catch\(\(\) => \[\]\)/);
    expect(combined).not.toMatch(/listUserRoles\([^)]*\)\.catch\(\(\) => \[\]\)/);
    expect(combined).not.toMatch(/listPersistedPolicyPacks\(\)\.catch\(\(\) => \[\]\)/);
    expect(combined).not.toMatch(/listKnowledgeCategories\(\)\.catch\(\(\) => \[\]\)/);
  });

  it("keeps existing service policy-pack IDs visible while options are unavailable", () => {
    const form = source("components/services/service-catalog-mutation-form.tsx");
    expect(form).toContain('value={policyPackId ?? ""}');
    expect(form).toContain("!policyPacks.some((pack) => pack.id === policyPackId)");
    expect(form).toContain("disabled={!policyPacksAvailable}");
  });

  it("disables dependent controls until option resources are reliable", () => {
    expect(source("components/users/user-roles-section.tsx")).toContain("!servicesAvailable");
    expect(source("components/policy-packs/policy-pack-apply-form.tsx")).toContain(
      "!serviceOptionsAvailable",
    );
    expect(source("components/knowledge-base/portal/article-from-reply-sheet.tsx")).toContain(
      "categoriesResource.data === null",
    );
  });
});
