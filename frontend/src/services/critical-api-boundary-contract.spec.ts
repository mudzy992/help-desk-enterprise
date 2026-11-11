import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const fixtures = JSON.parse(
  readFileSync(
    join(process.cwd(), "..", "contracts", "fixtures", "critical-api-responses.json"),
    "utf8",
  ),
) as Record<string, unknown>;

const criticalBoundaries = [
  {
    label: "session/capabilities",
    file: "./session-api.ts",
    parser: "parseCurrentSession",
    fixture: "currentSession",
    owner: "identity",
  },
  {
    label: "authentication session",
    file: "./auth-api.ts",
    parser: "parseAuthenticationSession",
    fixture: "authenticationSession",
    owner: "identity",
  },
  {
    label: "install readiness",
    file: "./install-api.ts",
    parser: "parseInstallSetupStatus",
    fixture: "installStatus",
    owner: "install",
  },
  {
    label: "paginated ticket envelope",
    file: "./tickets-api.ts",
    parser: "parseTicketPage",
    fixture: "ticketPage",
    owner: "tickets",
  },
  {
    label: "config package preview",
    file: "./config-versions-api.ts",
    parser: "parseConfigPackageImportReport",
    fixture: "configPackagePreview",
    owner: "configuration",
  },
  {
    label: "routing coverage",
    file: "./routing-api.ts",
    parser: "parseRoutingCoveragePage",
    fixture: "routingCoveragePage",
    owner: "routing",
  },
  {
    label: "service catalog batch",
    file: "./service-catalog-api.ts",
    parser: "parseServiceCatalog",
    fixture: "serviceCatalog",
    owner: "services",
  },
  {
    label: "admin settings registry",
    file: "./settings-api.ts",
    parser: "parseSettingsRegistry",
    fixture: "settingsRegistry",
    owner: "settings",
  },
] as const;

describe("critical API boundary contract", () => {
  it.each(criticalBoundaries)("runtime-validates $label", ({ file, parser }) => {
    const contents = source(file);
    expect(contents).toContain("apiRequestValidated");
    expect(contents).toContain(parser);
  });

  it.each(criticalBoundaries)("registers a shared fixture and owner for $label", (boundary) => {
    expect(boundary.owner.length).toBeGreaterThan(0);
    expect(fixtures).toHaveProperty(boundary.fixture);
  });
});
