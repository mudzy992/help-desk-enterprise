import { describe, expect, it } from "vitest";
import type { DirectorySyncPlan } from "@/services/directory-sync-api";
import { buildDirectoryPlanCsv } from "./directory-sync-plan-csv";

const safeguard = { activeManagedUsers: 10, deactivations: 1, percent: 10, limitPercent: 10, tripped: false };

function plan(): DirectorySyncPlan {
  return {
    organizationalUnits: {
      create: [{ distinguishedName: "OU=Visoko,DC=x", path: "/Visoko", name: "Visoko", type: "unit", parentPath: null }],
      update: [],
    },
    users: {
      create: [{
        guid: "g", email: "a@epbih.ba", displayName: "Čedo \"Ć\" Šabić", distinguishedName: "CN=a",
        company: null, department: null, ouPath: "/Visoko",
      }],
      update: [],
      reactivate: [],
      deactivate: [{ userId: "u", email: "b@epbih.ba", displayName: "=HYPERLINK()", reason: "missing" }],
      unchanged: 3,
    },
    roles: { grant: [{ userId: null, email: "a@epbih.ba", roleKey: "AGENT", ouPath: "/Visoko" }], revoke: [] },
    exceptions: [{ code: "NO_EMAIL", distinguishedName: "CN=c", email: null, detail: null }],
    unitCounts: [],
    safeguard,
    totals: { directoryUsers: 4, directoryUnits: 1 },
  };
}

describe("buildDirectoryPlanCsv (paket 1.8)", () => {
  const csv = buildDirectoryPlanCsv(plan());
  const lines = csv.replace("\uFEFF", "").trim().split("\r\n");

  it("writes a BOM, a header and one line per planned change", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe('"section";"action";"email";"name";"target";"detail"');
    expect(lines).toHaveLength(6);
  });

  it("escapes quotes and neutralises formula injection", () => {
    expect(lines[2]).toContain('"Čedo ""Ć"" Šabić"');
    expect(lines[3]).toContain(`"'=HYPERLINK()"`);
  });

  it("includes roles and exceptions", () => {
    expect(lines[4]).toBe('"role";"grant";"a@epbih.ba";"";"AGENT @ /Visoko";""');
    expect(lines[5]).toBe('"exception";"NO_EMAIL";"";"";"CN=c";""');
  });
});
