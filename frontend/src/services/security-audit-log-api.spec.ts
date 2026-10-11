import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/services/api";
import {
  buildSecurityAuditLogQuery,
  listSecurityAuditLog,
  securityAuditLogPageTake,
} from "@/services/security-audit-log-api";

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const request = vi.mocked(apiRequest);

/*
  Paket 5.4.0-d (M6): the query the journal sends. Only an exact `auth.*`
  action may be filtered — anything else is dropped, so the mandatory namespace
  cannot be widened from the client either.
*/
describe("buildSecurityAuditLogQuery", () => {
  it("sends the default page with a bare request", () => {
    expect(buildSecurityAuditLogQuery({})).toBe(`take=${securityAuditLogPageTake}`);
  });

  it("forwards an exact auth. action, the person and the cursor", () => {
    expect(
      buildSecurityAuditLogQuery({
        action: "auth.login_failed",
        userId: "user-1",
        take: 25,
        cursor: "row-9",
      }),
    ).toBe("take=25&action=auth.login_failed&userId=user-1&cursor=row-9");
  });

  it("drops an action outside the auth. namespace", () => {
    expect(buildSecurityAuditLogQuery({ action: "ticket.updated" })).toBe(
      `take=${securityAuditLogPageTake}`,
    );
    expect(buildSecurityAuditLogQuery({ action: "  auth.  " })).toBe(
      `take=${securityAuditLogPageTake}&action=auth.`,
    );
  });

  it("ignores blank values", () => {
    expect(buildSecurityAuditLogQuery({ action: "  ", userId: "  ", cursor: "" })).toBe(
      `take=${securityAuditLogPageTake}`,
    );
  });
});

describe("listSecurityAuditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests the SuperAdmin journal path", async () => {
    request.mockResolvedValue({ items: [], nextCursor: null });

    await listSecurityAuditLog({ action: "auth.login_failed", take: 10 });

    expect(request).toHaveBeenCalledWith(
      "/security/audit-log?take=10&action=auth.login_failed",
    );
  });
});
