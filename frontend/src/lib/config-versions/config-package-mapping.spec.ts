import { describe, expect, it } from "vitest";
import type { ConfigPackageImportReport } from "@/services/config-versions-types";
import {
  configPackageImportReady,
  unresolvedConfigPackageItems,
  withConfigPackageMapping,
} from "./config-package-mapping";

const report = (overrides: Partial<ConfigPackageImportReport> = {}): ConfigPackageImportReport => ({
  header: {
    appVersion: "",
    sourceEnvironment: "staging",
    sourceVersion: 3,
    exportedAt: "2026-10-01T00:00:00.000Z",
    includesEnvironmentBound: false,
  },
  candidates: { group: [{ id: "g1", key: "IT" }] },
  checksum: "a".repeat(64),
  signature: "unsigned",
  items: [
    { kind: "service", key: "vpn", status: "resolved", localId: "s1", blocking: false, usedBy: [] },
    { kind: "playbook", key: "Onboarding", status: "missing", localId: null, blocking: false, usedBy: ["x"] },
    { kind: "group", key: "IT", status: "missing", localId: null, blocking: true, usedBy: ["y"] },
  ],
  settings: { applied: [], skippedEnvironmentBound: [], skippedUnknown: [] },
  created: { calendars: [], slaProfiles: [] },
  skipped: {},
  blockingCount: 1,
  canImport: false,
  ...overrides,
});

describe("config package mapping (Paket 2.9 K4)", () => {
  it("lists unresolved items with blocking ones first", () => {
    expect(unresolvedConfigPackageItems(report()).map((item) => item.key)).toEqual(["IT", "Onboarding"]);
  });

  it("adds and removes mappings immutably", () => {
    const mapped = withConfigPackageMapping({}, "group", "IT", "g1");
    expect(mapped).toEqual({ group: { IT: "g1" } });
    expect(withConfigPackageMapping(mapped, "group", "IT", "")).toEqual({});
  });

  it("requires a resolvable package and a valid signature or explicit confirmation", () => {
    expect(configPackageImportReady(report(), true)).toBe(false);
    expect(configPackageImportReady(report({ canImport: true }), false)).toBe(false);
    expect(configPackageImportReady(report({ canImport: true }), true)).toBe(true);
    expect(configPackageImportReady(report({ canImport: true, signature: "valid" }), false)).toBe(true);
  });
});
