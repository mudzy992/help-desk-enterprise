import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

const criticalBoundaries = [
  ["session/capabilities", "./session-api.ts", "parseCurrentSession"],
  ["authentication session", "./auth-api.ts", "parseAuthenticationSession"],
  ["install readiness", "./install-api.ts", "parseInstallSetupStatus"],
  ["paginated ticket envelope", "./tickets-api.ts", "parseTicketPage"],
  ["config package preview", "./config-versions-api.ts", "parseConfigPackageImportReport"],
  ["routing coverage", "./routing-api.ts", "parseRoutingCoveragePage"],
  ["service catalog batch", "./service-catalog-api.ts", "parseServiceCatalog"],
  ["admin settings registry", "./settings-api.ts", "parseSettingsRegistry"],
] as const;

describe("critical API boundary contract", () => {
  it.each(criticalBoundaries)("runtime-validates %s", (_label, file, parser) => {
    const contents = source(file);
    expect(contents).toContain("apiRequestValidated");
    expect(contents).toContain(parser);
  });
});
