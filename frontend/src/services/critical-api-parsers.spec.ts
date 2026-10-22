import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api";
import {
  parseAuthenticationLogin,
  parseConfigPackageImportReport,
  parseCurrentSession,
  parseInstallSetupStatus,
  parseRoutingCoveragePage,
  parseServiceCatalog,
  parseSettingsRegistry,
  parseTicketPage,
} from "@/services/critical-api-parsers";

function invalid(parser: (value: unknown) => unknown, fixture: unknown) {
  try {
    parser(fixture);
    throw new Error("parser accepted malformed fixture");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("INVALID_API_RESPONSE");
  }
}

describe("critical API parsers", () => {
  it("validates established and intermediate authentication sessions", () => {
    expect(
      parseAuthenticationLogin({
        expiresInSeconds: 3600,
        principal: { subjectId: "u1", email: "a@b.test", displayName: "A", isLocalOnly: true },
      }),
    ).toMatchObject({ expiresInSeconds: 3600 });
    expect(
      parseAuthenticationLogin({
        status: "MFA_REQUIRED",
        mfaToken: "token",
        expiresInSeconds: 300,
      }),
    ).toMatchObject({ status: "MFA_REQUIRED" });
    invalid(parseAuthenticationLogin, { status: "MFA_REQUIRED", expiresInSeconds: 300 });
  });

  it("accepts a valid session and rejects missing/wrong capability fields", () => {
    const valid = {
      principal: { subjectId: "u1", email: "a@b.test", displayName: "A", isLocalOnly: true },
      isSuperAdmin: false,
      roleKeys: ["AGENT"],
      permissionKeys: ["ticket.read"],
      organizationalUnitId: null,
      organizationalUnitName: null,
    };
    expect(parseCurrentSession(valid).principal.subjectId).toBe("u1");
    invalid(parseCurrentSession, { ...valid, permissionKeys: undefined });
    invalid(parseCurrentSession, { ...valid, isSuperAdmin: "false" });
  });

  it("validates install readiness and summary counters", () => {
    expect(parseInstallSetupStatus({ isCompleted: false }).isCompleted).toBe(false);
    invalid(parseInstallSetupStatus, {});
    invalid(parseInstallSetupStatus, {
      isCompleted: true,
      summary: {
        organizationName: "Acme",
        organizationalUnitCount: "1",
        serviceCount: 1,
        groupCount: 1,
        teamMemberCount: 1,
        enabledAddonKeys: [],
        deferredSteps: [],
      },
    });
  });

  it("validates paginated ticket and routing envelopes", () => {
    const ticket = {
      id: "ticket-1",
      ticketNumber: "HD-44",
      title: "VPN access",
      status: "IN_PROGRESS",
      priority: "HIGH",
    };
    expect(
      parseTicketPage({ items: [ticket], total: 44, totalsAsOf: 1, page: 1, pageSize: 50 }).items,
    ).toEqual([ticket]);
    const compatiblePage = parseTicketPage({ items: [ticket], total: 44, page: 1, pageSize: 50 });
    expect(compatiblePage.items).toEqual([ticket]);
    expect(compatiblePage.totalsAsOf).toEqual(expect.any(Number));
    invalid(parseTicketPage, { items: {}, total: 0, totalsAsOf: 1, page: 1, pageSize: 50 });
    invalid(parseTicketPage, {
      items: ["not-a-ticket-object"],
      total: 1,
      totalsAsOf: 1,
      page: 1,
      pageSize: 50,
    });
    invalid(parseRoutingCoveragePage, {
      items: [],
      total: 0,
      take: "100",
      cursor: null,
      nextCursor: null,
    });
  });

  it("validates service batch and permission-sensitive settings registries", () => {
    const service = {
      id: "s1",
      name: "Access",
      slug: "access",
      categoryId: "c1",
      lifecycle: "ACTIVE",
      availability: "OPERATIONAL",
      offeredToRequesters: true,
      openTicketCount: 0,
      runtimeAvailability: {
        isCurrentlyAvailable: true,
        isCurrentlyUnavailable: false,
        hasActiveDowntime: false,
        hasUpcomingDowntime: false,
        upcomingDowntimeCount: 0,
        showStatusInTicketCreate: false,
      },
      activeForm: { fieldCount: 0 },
    };
    expect(parseServiceCatalog([service])).toHaveLength(1);
    invalid(parseServiceCatalog, [{ ...service, openTicketCount: "0" }]);
    invalid(parseSettingsRegistry, [
      {
        key: "private.x",
        description: "x",
        categoryId: "security",
        valueType: "boolean",
        visibility: "private",
        titleKey: "x",
        helpKey: "x",
        isRequired: false,
        isSet: "yes",
        requires: [],
      },
    ]);
  });

  it("validates config package preview trust fields", () => {
    const valid = {
      header: {},
      checksum: "sha256:x",
      signature: "valid",
      items: [],
      blockingCount: 0,
      canImport: true,
    };
    expect(parseConfigPackageImportReport(valid).canImport).toBe(true);
    invalid(parseConfigPackageImportReport, { ...valid, items: null });
  });
});
